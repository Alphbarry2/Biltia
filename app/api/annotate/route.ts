// ─────────────────────────────────────────────────────────────────────────────
// /api/annotate — ANNOTATION IA D'UN DOCUMENT (mode « Annoter & enrichir »).
//
// L'utilisateur joint un plan / une image et demande de repérer, numéroter ou
// entourer des éléments (« numérote les prises », « entoure les incertains »).
// Claude Sonnet lit le document nativement et renvoie des ANNOTATIONS avec des
// coordonnées NORMALISÉES (0..1) — best-effort, corrigeables côté client.
//
// Fiabilité : chaque annotation porte un niveau de confiance + un drapeau
// `incertain`. On n'invente jamais un élément absent. RIEN n'est écrit en base :
// l'utilisateur ajuste, puis relie une annotation au workspace (tâche / réserve).
//
// Ossature calquée sur /api/analyze (crédits, rate-limit, gel lecture seule).
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { client, hasAnyLlmKey, realCostOf } from "@/lib/llm";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { trackAiUsage, reconcileCredits } from "@/lib/ai-usage";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { logActivity } from "@/lib/activity";
import { VISION_MODEL, buildFileBlocks, validateFiles, ValidationError } from "@/lib/vision";
import { getLocale } from "@/lib/i18n/server";
import { getSectorContext } from "@/lib/sector-context";
import { pick } from "@/lib/i18n/config";
import { withLocale } from "@/lib/i18n/llm";
import { ACTION_CREDITS } from "@/lib/plans";

const MAX_TOKENS = 3000;

const ANNOTATE_TOOL: Anthropic.Tool = {
  name: "propose_annotations",
  description:
    "Propose des annotations visuelles (repères, numéros, cercles) sur le document/plan/image fourni, à l'endroit demandé par l'utilisateur.",
  input_schema: {
    type: "object",
    properties: {
      annotations: {
        type: "array",
        description:
          "Une entrée par élément repéré. Coordonnées NORMALISÉES : x,y ∈ [0,1], origine coin haut-gauche, x vers la droite, y vers le bas, relatives à l'image ENTIÈRE.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["pin", "circle"],
              description: "« pin » = un point (prise, porte, symbole). « circle » = entourer une zone/élément.",
            },
            x: { type: "number", description: "Centre X normalisé (0 = gauche, 1 = droite)." },
            y: { type: "number", description: "Centre Y normalisé (0 = haut, 1 = bas)." },
            rayon: {
              type: ["number", "null"],
              description: "Pour un « circle » : rayon normalisé (fraction de la largeur), sinon null.",
            },
            label: { type: "string", description: "Ce que désigne l'annotation (ex : « Prise », « Porte d'entrée »)." },
            numero: { type: ["number", "null"], description: "Numéro d'ordre si l'utilisateur demande de numéroter, sinon null." },
            confiance: { type: "string", enum: ["elevee", "moyenne", "faible"], description: "Confiance de CETTE détection." },
            incertain: { type: "boolean", description: "true si tu n'es pas sûr de cet élément (à faire vérifier)." },
          },
          required: ["type", "x", "y", "rayon", "label", "numero", "confiance", "incertain"],
          additionalProperties: false,
        },
      },
      resume: { type: "string", description: "1-2 phrases : ce que tu as repéré + combien d'éléments à vérifier." },
    },
    required: ["annotations", "resume"],
    additionalProperties: false,
  },
};

function buildSystem(sectorBlock: string): string {
  const sector = sectorBlock ? `\n\n${sectorBlock}\n` : "";
  return `Tu es l'assistant d'annotation de Biltia, expert du BTP français. On te fournit un document (plan, schéma, photo de chantier, formulaire…) et une consigne de repérage.${sector}

Ta mission : proposer des ANNOTATIONS VISUELLES aux bons endroits.
- Coordonnées NORMALISÉES : x,y entre 0 et 1, origine en haut à gauche, relatives à l'image entière. Sois le plus précis possible, mais ces positions sont un point de départ que l'utilisateur pourra ajuster.
- « pin » pour un point précis (une prise, une porte, un symbole). « circle » (avec un rayon) pour entourer une zone/élément.
- NUMÉROTE (champ numero, croissant) uniquement si l'utilisateur le demande ; sinon numero = null.
- FIABILITÉ : renseigne « confiance » par annotation et « incertain » = true dès que tu as un doute. Mieux vaut marquer incertain que se tromper — un artisan agit dessus.
- N'INVENTE JAMAIS un élément absent. Si le document est illisible ou n'a pas l'élément demandé, renvoie peu (ou zéro) annotations et dis-le dans « resume ».

Réponds UNIQUEMENT en appelant l'outil propose_annotations.`;
}

type Conf = "elevee" | "moyenne" | "faible";
const asConf = (v: unknown): Conf => (v === "elevee" || v === "moyenne" || v === "faible" ? v : "moyenne");
const clamp01 = (v: unknown): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
};

// DURÉE MAXIMALE — explicite. Sans borne déclarée, la limite venait du réglage
// projet Vercel (invisible depuis le dépôt). Une fonction tuée par le timeout
// n'exécute PAS son `catch` de remboursement : le hold de crédits est perdu sans
// que l'utilisateur en soit informé. On fige donc la valeur.
export const maxDuration = 120;

export async function POST(req: Request) {
  const locale = await getLocale();
  try {
    if (!hasAnyLlmKey()) {
      return Response.json(
        { error: pick(locale, "Clé API Anthropic non configurée.", "Anthropic API key not configured.") },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json(
        { error: pick(locale, "Authentification requise.", "Authentication required.") },
        { status: 401 }
      );
    }

    const limited = await enforceRateLimit("analyze", user.id, LIMITS.analyze);
    if (limited) return limited;

    const membership = await getActiveMembershipServer(supabase, user.id);
    if (!membership) {
      return Response.json(
        { error: pick(locale, "Aucun espace de travail trouvé.", "No workspace found.") },
        { status: 403 }
      );
    }
    const tenantId = membership.tenant_id;

    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) {
      return Response.json({ error: frozenMessage(locale), frozen: true }, { status: 403 });
    }

    let body: { file?: unknown; files?: unknown; instruction?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
        { status: 400 }
      );
    }

    // Un seul document annoté à la fois (l'overlay porte sur une image).
    const rawFiles = body.file ? [body.file] : body.files;
    let files;
    try {
      files = validateFiles(rawFiles, locale).slice(0, 1);
    } catch (e) {
      if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 400 });
      throw e;
    }

    const instruction =
      typeof body.instruction === "string" && body.instruction.trim()
        ? body.instruction.trim().slice(0, 2000)
        : "Repère et numérote les éléments pertinents du document.";

    const founder = isFounderEmail(user.email);
    const HOLD = founder ? 0 : ACTION_CREDITS.annotation;
    if (HOLD > 0) {
      const { data: credited } = await supabase.rpc("deduct_credits", { p_amount: HOLD });
      if (!credited) {
        return Response.json(
          {
            error: pick(
              locale,
              "Crédits insuffisants. Rechargez votre compte pour continuer.",
              "Not enough credits. Top up your account to continue."
            ),
          },
          { status: 402 }
        );
      }
    }
    async function refund() {
      if (HOLD <= 0) return;
      const admin = createAdminClient();
      if (admin) {
        try {
          await admin.rpc("refund_credits", { p_user_id: user!.id, p_amount: HOLD });
        } catch (err) {
          console.error("Refund failed after annotate error:", err);
        }
      }
    }

    const userBlocks = buildFileBlocks(files);
    userBlocks.push({
      type: "text",
      text: `Annote ce document selon cette consigne : « ${instruction} ». Renvoie des coordonnées normalisées (0..1).`,
    });

    // Le métier oriente CE QU'ON REPÈRE : un électricien annote des prises et des
    // points lumineux là où un plombier annote des points d'eau.
    const sectorCtx = await getSectorContext(supabase, user.id, locale);

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: MAX_TOKENS,
        system: withLocale(buildSystem(sectorCtx.block), locale),
        tools: [ANNOTATE_TOOL],
        tool_choice: { type: "tool", name: "propose_annotations" },
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
        {
          error: pick(
            locale,
            "L'annotation n'a rien renvoyé. Réessayez — vos crédits ont été remboursés.",
            "The annotation returned nothing. Please try again — your credits have been refunded."
          ),
        },
        { status: 502 }
      );
    }

    const input = toolBlock.input as Record<string, unknown>;
    const annotations = (Array.isArray(input.annotations) ? input.annotations : [])
      .map((a, i) => {
        const r = (a ?? {}) as Record<string, unknown>;
        const label = typeof r.label === "string" ? r.label.trim() : "";
        if (!label) return null;
        const type = r.type === "circle" ? "circle" : "pin";
        const rayonRaw = typeof r.rayon === "number" && Number.isFinite(r.rayon) ? r.rayon : null;
        return {
          id: `a${i}`,
          type,
          x: clamp01(r.x),
          y: clamp01(r.y),
          rayon: type === "circle" ? clamp01(rayonRaw ?? 0.05) || 0.05 : null,
          label,
          numero: typeof r.numero === "number" && Number.isFinite(r.numero) ? r.numero : null,
          confiance: asConf(r.confiance),
          incertain: r.incertain === true,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, 200);
    const resume = typeof input.resume === "string" ? input.resume.trim() : "";

    // `billedCredits: HOLD` — cf. /api/analyze : sans lui, on débitait le HOLD mais
    // on journalisait (et on AFFICHAIT) le coût du modèle, soit un tout autre chiffre.
    let realCredits = HOLD;
    try {
      const tracked = await trackAiUsage({
        supabase,
        userId: user.id,
        tenantId,
        action: "analyze",
        model: VISION_MODEL,
        inputTokens: message.usage.input_tokens,
        // Le RELEVÉ prime sur le catalogue (cf. lib/ai-usage.ts) : c'est lui qui
        // permet de SURVEILLER la marge — il ne la pilote plus.
        realCostUsd: realCostOf(message.usage),
        outputTokens: message.usage.output_tokens,
        billedCredits: HOLD,
      });
      if (founder) realCredits = 0;
      else {
        realCredits = tracked;
        // Plus de réconciliation à la BAISSE : le client paie la grille.
      }
    } catch {
      // ignore
    }

    await logActivity(supabase, {
      tenantId,
      userId: user.id,
      action: "document",
      entityType: "annotation",
      description: `Annotation IA : ${files[0].name} (${annotations.length} repère(s))`,
    });

    return Response.json({
      kind: "annotation",
      annotations,
      resume,
      fileName: files[0].name,
      creditsUsed: realCredits,
    });
  } catch (err) {
    console.error("Annotate error:", err);
    let msg = pick(locale, "Erreur d'annotation. Réessayez.", "Annotation failed. Please try again.");
    let status = 500;
    if (err instanceof Anthropic.APIError) {
      status = err.status ?? 500;
      if (err.status === 429)
        msg = pick(locale, "Trop de requêtes. Patientez quelques secondes.", "Too many requests. Wait a few seconds.");
      else if (err.status === 401)
        msg = pick(locale, "Clé API Anthropic invalide.", "Invalid Anthropic API key.");
      else msg = pick(locale, `Erreur Anthropic (${err.status}).`, `Anthropic error (${err.status}).`);
    }
    return Response.json({ error: msg }, { status });
  }
}
