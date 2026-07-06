// ─────────────────────────────────────────────────────────────────────────────
// /api/app-ai — CAPACITÉS IA exposées AUX APPLICATIONS GÉNÉRÉES (via window.biltia).
//
//  • action "extract"    : lit une PHOTO (bon de livraison, facture, plan…) et
//                          renvoie les champs demandés, prêts à stocker.
//  • action "transcribe" : transcrit une DICTÉE (pointage, note de chantier…) →
//                          texte, et si des champs sont demandés, les structure.
//
// Le modèle est choisi par capacité (vision pour extract, gpt-4o-transcribe/Groq
// pour la voix). Auth par cookie de session, tenant isolé (RLS), crédits débités
// à plat (remboursés si échec). L'app n'a AUCUN secret : elle passe par le pont
// postMessage, le parent proxifie en same-origin.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, FROZEN_MESSAGE } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { VISION_MODEL, buildFileBlocks, validateFiles, ValidationError } from "@/lib/vision";
import { transcribeBlob } from "@/lib/transcribe-core";

const client = new Anthropic();
const MAX_TOKENS = 2000;

// Extraction structurée : outil dynamique qui force EXACTEMENT les champs demandés
// (vide si absent). Sans champs → dictionnaire libre dans "donnees".
async function runExtraction(
  content: Anthropic.MessageParam["content"],
  fields: string[]
): Promise<{ data: Record<string, unknown> } | { error: string; status: number }> {
  const properties: Record<string, unknown> = {};
  if (fields.length) {
    for (const f of fields) properties[f] = { type: "string", description: `${f} (vide si absent)` };
  } else {
    properties["donnees"] = { type: "object", additionalProperties: true, description: "Informations lisibles, en paires clé/valeur." };
  }
  const tool = {
    name: "extraire",
    description: "Extrait les informations demandées.",
    input_schema: { type: "object", properties, required: fields.length ? fields : ["donnees"], additionalProperties: false },
  } as Anthropic.Tool;

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: MAX_TOKENS,
      system:
        "Tu extrais fidèlement les informations demandées d'un document photographié ou d'une dictée (BTP français). N'invente JAMAIS : laisse vide si l'info n'est pas présente. Montants en nombres bruts (1234.56), dates AAAA-MM-JJ. Réponds UNIQUEMENT en appelant l'outil extraire.",
      tools: [tool],
      tool_choice: { type: "tool", name: "extraire" },
      messages: [{ role: "user", content }],
    });
  } catch {
    return { error: "Extraction indisponible.", status: 502 };
  }
  const tb = message.content.find((b) => b.type === "tool_use");
  if (!tb || tb.type !== "tool_use") return { error: "Extraction vide.", status: 502 };
  const input = tb.input as Record<string, unknown>;
  return { data: (fields.length ? input : (input.donnees ?? input)) as Record<string, unknown> };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Authentification requise." }, { status: 401 });
    }
    const userId = user.id;

    const limited = await enforceRateLimit("analyze", user.id, LIMITS.analyze);
    if (limited) return limited;

    const membership = await getActiveMembershipServer(supabase, user.id);
    if (!membership) {
      return Response.json({ error: "Aucun espace de travail trouvé." }, { status: 403 });
    }
    const tenantId = membership.tenant_id;

    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) {
      return Response.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
    }

    let body: { action?: string; image?: unknown; audio?: { mediaType?: string; data?: string }; fields?: unknown; question?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Requête invalide." }, { status: 400 });
    }

    const action = body.action;
    if (action !== "extract" && action !== "transcribe") {
      return Response.json({ error: "Action IA non supportée." }, { status: 400 });
    }

    const fields = Array.isArray(body.fields)
      ? body.fields.map((f) => String(f)).filter(Boolean).slice(0, 30)
      : [];
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";

    const founder = isFounderEmail(user.email);
    // Tarif à plat, prévisible : extraction photo 25 ; dictée 10 (+15 si structuration).
    const HOLD = founder ? 0 : action === "extract" ? 25 : fields.length ? 25 : 10;
    if (HOLD > 0) {
      const { data: credited } = await supabase.rpc("deduct_credits", { p_amount: HOLD });
      if (!credited) {
        return Response.json({ error: "Crédits insuffisants. Rechargez votre compte pour continuer." }, { status: 402 });
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

    // ── EXTRACTION PHOTO ──────────────────────────────────────────────────────
    if (action === "extract") {
      let files;
      try {
        files = validateFiles(body.image ? [body.image] : []);
      } catch (e) {
        await refund();
        if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 400 });
        throw e;
      }
      const content = buildFileBlocks(files);
      content.push({
        type: "text",
        text: fields.length
          ? `Extrais du document ces informations : ${fields.join(", ")}.${question ? " " + question : ""}`
          : question || "Extrais toutes les informations lisibles du document.",
      });
      const out = await runExtraction(content, fields);
      if ("error" in out) {
        await refund();
        return Response.json({ error: `${out.error} Vos crédits ont été remboursés.` }, { status: out.status });
      }
      return Response.json({ data: out.data });
    }

    // ── TRANSCRIPTION VOIX ────────────────────────────────────────────────────
    const audio = body.audio;
    if (!audio?.data) {
      await refund();
      return Response.json({ error: "Aucun audio fourni." }, { status: 400 });
    }
    let blob: Blob;
    try {
      blob = new Blob([Buffer.from(audio.data, "base64")], { type: audio.mediaType || "audio/webm" });
    } catch {
      await refund();
      return Response.json({ error: "Audio invalide." }, { status: 400 });
    }
    const t = await transcribeBlob(blob);
    if ("error" in t) {
      await refund();
      return Response.json({ error: t.error, fallback: true }, { status: t.status });
    }

    // Si des champs sont demandés, on STRUCTURE la dictée (ex : pointage → heures).
    let data: Record<string, unknown> | undefined;
    if (fields.length && t.text) {
      const out = await runExtraction(
        [{ type: "text", text: `Voici une dictée à structurer : « ${t.text} ». Extrais : ${fields.join(", ")}.${question ? " " + question : ""}` }],
        fields
      );
      if (!("error" in out)) data = out.data;
    }
    return Response.json({ text: t.text, data });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur IA." }, { status: 500 });
  }
}
