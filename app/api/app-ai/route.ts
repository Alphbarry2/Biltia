// ─────────────────────────────────────────────────────────────────────────────
// /api/app-ai — CAPACITÉS IA exposées AUX APPLICATIONS GÉNÉRÉES (via window.biltia).
//
// Phase 1 : `action: "extract"` — lit une PHOTO (bon de livraison, facture, plan…)
// et renvoie EXACTEMENT les champs demandés par l'app, en JSON plat, prêt à être
// stocké via window.biltia.create(). Le modèle vision est choisi par capacité
// (lib/vision → VISION_MODEL). Auth par cookie de session, tenant isolé (RLS),
// crédits débités comme /api/analyze (25/extraction, remboursé si échec).
//
// L'app appelle ici via le pont postMessage (le parent proxifie en same-origin),
// donc les cookies authentifient l'utilisateur — l'app n'a AUCUN secret.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { trackAiUsage, reconcileCredits } from "@/lib/ai-usage";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, FROZEN_MESSAGE } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { VISION_MODEL, buildFileBlocks, validateFiles, ValidationError } from "@/lib/vision";

const client = new Anthropic();
const MAX_TOKENS = 2000;

export async function POST(req: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith("your_")) {
      return Response.json({ error: "IA non configurée." }, { status: 503 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Authentification requise." }, { status: 401 });
    }

    const limited = await enforceRateLimit("analyze", user.id, LIMITS.analyze);
    if (limited) return limited;

    const membership = await getActiveMembershipServer(supabase, user.id);
    if (!membership) {
      return Response.json({ error: "Aucun espace de travail trouvé." }, { status: 403 });
    }
    const tenantId = membership.tenant_id;
    const userId = user.id;

    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) {
      return Response.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
    }

    let body: { action?: string; image?: unknown; fields?: unknown; question?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Requête invalide." }, { status: 400 });
    }

    if (body.action !== "extract") {
      return Response.json({ error: "Action IA non supportée." }, { status: 400 });
    }

    // L'image unique passe par la même validation que /api/analyze (type, taille).
    let files;
    try {
      files = validateFiles(body.image ? [body.image] : []);
    } catch (e) {
      if (e instanceof ValidationError) {
        return Response.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const fields = Array.isArray(body.fields)
      ? body.fields.map((f) => String(f)).filter(Boolean).slice(0, 30)
      : [];
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";

    // Outil dynamique : force le modèle à renvoyer EXACTEMENT les champs demandés
    // (vide si absent). Sans champs → extraction générique clé/valeur dans "donnees".
    const properties: Record<string, unknown> = {};
    if (fields.length) {
      for (const f of fields) properties[f] = { type: "string", description: `${f} (vide si absent du document)` };
    } else {
      properties["donnees"] = {
        type: "object",
        description: "Toutes les informations lisibles du document, en paires clé/valeur.",
        additionalProperties: true,
      };
    }
    const tool = {
      name: "extraire",
      description: "Extrait les informations du document photographié.",
      input_schema: {
        type: "object",
        properties,
        required: fields.length ? fields : ["donnees"],
        additionalProperties: false,
      },
    } as Anthropic.Tool;

    const founder = isFounderEmail(user.email);
    const HOLD = founder ? 0 : 25;
    if (HOLD > 0) {
      const { data: credited } = await supabase.rpc("deduct_credits", { p_amount: HOLD });
      if (!credited) {
        return Response.json(
          { error: "Crédits insuffisants. Rechargez votre compte pour continuer." },
          { status: 402 }
        );
      }
    }
    const refund = async () => {
      if (HOLD <= 0) return;
      try {
        const admin = createAdminClient();
        if (admin) await admin.rpc("refund_credits", { p_user_id: userId, p_amount: HOLD });
      } catch {
        /* best-effort */
      }
    };

    const userBlocks = buildFileBlocks(files);
    userBlocks.push({
      type: "text",
      text: fields.length
        ? `Extrais du document ces informations, dans cet ordre : ${fields.join(", ")}.${question ? " " + question : ""}`
        : question || "Extrais toutes les informations lisibles du document.",
    });

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: MAX_TOKENS,
        system:
          "Tu lis un document PHOTOGRAPHIÉ dans le BTP français (bon de livraison, facture, devis, plan…). Tu extrais fidèlement les informations demandées. N'invente JAMAIS : laisse vide si l'information n'est pas visible. Montants en nombres bruts (1234.56), dates au format AAAA-MM-JJ. Réponds UNIQUEMENT en appelant l'outil extraire.",
        tools: [tool],
        tool_choice: { type: "tool", name: "extraire" },
        messages: [{ role: "user", content: userBlocks }],
      });
    } catch (err) {
      await refund();
      throw err;
    }

    const toolBlock = message.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      await refund();
      return Response.json(
        { error: "L'extraction n'a rien renvoyé. Vos crédits ont été remboursés." },
        { status: 502 }
      );
    }
    const input = toolBlock.input as Record<string, unknown>;
    const data = fields.length ? input : input.donnees ?? input;

    // Réconciliation du hold au coût réel (best-effort — ne bloque pas la réponse).
    try {
      const tracked = await trackAiUsage({
        supabase,
        userId: user.id,
        tenantId,
        action: "analyze",
        model: VISION_MODEL,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      });
      if (!founder) await reconcileCredits(supabase, createAdminClient(), user.id, HOLD, tracked);
    } catch {
      /* best-effort */
    }

    return Response.json({ data });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Erreur IA." },
      { status: 500 }
    );
  }
}
