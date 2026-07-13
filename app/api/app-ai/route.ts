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
import { client, realCostOf } from "@/lib/llm";
import { trackAiUsage } from "@/lib/ai-usage";
import { TIER_MEDIUM } from "@/lib/models";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { VISION_MODEL, buildFileBlocks, validateFiles, ValidationError } from "@/lib/vision";
import { transcribeBlob } from "@/lib/transcribe-core";
import { getLocale } from "@/lib/i18n/server";
import { pick, type Locale } from "@/lib/i18n/config";
import { ACTION_CREDITS } from "@/lib/plans";

const MAX_TOKENS = 2000;

// Extraction structurée : outil dynamique qui force EXACTEMENT les champs demandés
// (vide si absent). Sans champs → dictionnaire libre dans "donnees".
/** Jetons d'un appel, remontés jusqu'au POST pour être journalisés une seule fois.
 *  Sans ça, TOUTE l'IA consommée À L'INTÉRIEUR des applications (extraction photo,
 *  devis vocal) était débitée au client mais n'écrivait RIEN dans `ai_usage` : la
 *  console de marge avait un angle mort sur cette surface entière. */
type LlmUsage = { model: string; inTok: number; outTok: number; costUsd?: number };

async function runExtraction(
  content: Anthropic.MessageParam["content"],
  fields: string[],
  locale: Locale
): Promise<{ data: Record<string, unknown>; usage: LlmUsage } | { error: string; status: number }> {
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
    return { error: pick(locale, "Extraction indisponible.", "Extraction unavailable."), status: 502 };
  }
  const tb = message.content.find((b) => b.type === "tool_use");
  if (!tb || tb.type !== "tool_use")
    return { error: pick(locale, "Extraction vide.", "Extraction returned nothing."), status: 502 };
  const input = tb.input as Record<string, unknown>;
  return {
    data: (fields.length ? input : (input.donnees ?? input)) as Record<string, unknown>,
    usage: {
      model: VISION_MODEL,
      inTok: message.usage.input_tokens,
      outTok: message.usage.output_tokens,
      costUsd: realCostOf(message.usage),
    },
  };
}

// Modèle de raisonnement pour découper une dictée en PLUSIEURS devis structurés.
// Passe par le palier MOYEN : un identifiant écrit en dur ici contournerait
// l'aiguilleur et enverrait la dictée chez un fournisseur qu'on n'utilise plus.
const DEVIS_MODEL = TIER_MEDIUM;

type ParsedDevisLine = {
  designation: string;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
  taux_tva: number;
};
type ParsedDevis = {
  client_nom: string;
  chantier_nom: string;
  date_devis: string;
  lignes: ParsedDevisLine[];
  notes: string;
};

// Découpe une dictée libre en un TABLEAU de devis (un par client/affaire évoquée),
// chacun avec ses lignes chiffrées. N'invente jamais un prix : 0 si non dicté.
async function runDevisParse(
  text: string,
  locale: Locale
): Promise<{ devis: ParsedDevis[]; usage: LlmUsage } | { error: string; status: number }> {
  const tool = {
    name: "enregistrer_devis",
    description: "Enregistre un ou plusieurs devis reconstitués à partir de la dictée de l'artisan.",
    input_schema: {
      type: "object",
      properties: {
        devis: {
          type: "array",
          description: "Un élément par devis distinct évoqué (un par client/affaire).",
          items: {
            type: "object",
            properties: {
              client_nom: { type: "string", description: "Nom du client tel que dicté (vide si non précisé)." },
              chantier_nom: { type: "string", description: "Intitulé du chantier/de l'affaire (ex: « Rénovation salle de bain »), vide si absent." },
              date_devis: { type: "string", description: "Date du devis AAAA-MM-JJ si dictée, sinon vide." },
              lignes: {
                type: "array",
                description: "Une ligne par prestation/fourniture chiffrée.",
                items: {
                  type: "object",
                  properties: {
                    designation: { type: "string", description: "Libellé de la prestation ou fourniture." },
                    quantite: { type: "number", description: "Quantité (1 par défaut si non précisée)." },
                    unite: { type: "string", description: "Unité : u, m², m³, ml, kg, h, forfait (u par défaut)." },
                    prix_unitaire_ht: { type: "number", description: "Prix unitaire HT en euros. 0 si non dicté (JAMAIS inventé)." },
                    taux_tva: { type: "number", description: "Taux de TVA : 20, 10 ou 5.5 (20 par défaut)." },
                  },
                  required: ["designation", "quantite", "unite", "prix_unitaire_ht", "taux_tva"],
                  additionalProperties: false,
                },
              },
              notes: { type: "string", description: "Remarques utiles (conditions, délais…), vide sinon." },
            },
            required: ["client_nom", "chantier_nom", "date_devis", "lignes", "notes"],
            additionalProperties: false,
          },
        },
      },
      required: ["devis"],
      additionalProperties: false,
    },
  } as Anthropic.Tool;

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: DEVIS_MODEL,
      max_tokens: 4000,
      system:
        "Tu es l'assistant devis d'un artisan du BTP français. On te donne une dictée libre qui peut contenir PLUSIEURS devis (« je dois faire 3 devis : pour le client Martin… ; ensuite pour Durand… »). " +
        "Découpe-la en un tableau de devis distincts (un par client/affaire). Pour chaque devis, liste les prestations en lignes chiffrées. " +
        "RÈGLES ABSOLUES : n'invente JAMAIS un prix (prix_unitaire_ht = 0 si non dicté). Quantité 1 par défaut, unité « u » par défaut, TVA 20 par défaut. " +
        "Regroupe correctement : tout ce qui suit « pour le client X » appartient au devis de X jusqu'au client suivant. " +
        "Sépare fourniture et main d'œuvre en lignes distinctes quand c'est dicté ainsi. Réponds UNIQUEMENT en appelant l'outil enregistrer_devis.",
      tools: [tool],
      tool_choice: { type: "tool", name: "enregistrer_devis" },
      messages: [{ role: "user", content: `Dictée à transformer en devis :\n\n« ${text} »` }],
    });
  } catch {
    return {
      error: pick(locale, "Structuration des devis indisponible.", "Quote structuring unavailable."),
      status: 502,
    };
  }
  const noQuote = pick(locale, "Aucun devis reconnu dans la dictée.", "No quote recognized in the dictation.");
  const tb = message.content.find((b) => b.type === "tool_use");
  if (!tb || tb.type !== "tool_use") return { error: noQuote, status: 502 };
  const input = tb.input as { devis?: unknown };
  const list = Array.isArray(input.devis) ? (input.devis as ParsedDevis[]) : [];
  if (!list.length) return { error: noQuote, status: 502 };
  return {
    devis: list,
    usage: {
      model: DEVIS_MODEL,
      inTok: message.usage.input_tokens,
      outTok: message.usage.output_tokens,
      costUsd: realCostOf(message.usage),
    },
  };
}

// DURÉE MAXIMALE — explicite. Sans borne déclarée, la limite venait du réglage
// projet Vercel (invisible depuis le dépôt). Une fonction tuée par le timeout
// n'exécute PAS son `catch` de remboursement : le hold de crédits est perdu sans
// que l'utilisateur en soit informé. On fige donc la valeur.
export const maxDuration = 120;

export async function POST(req: Request) {
  const locale = await getLocale();
  try {
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
    const userId = user.id;

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

    let body: { action?: string; image?: unknown; audio?: { mediaType?: string; data?: string }; fields?: unknown; question?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: pick(locale, "Requête invalide.", "Invalid request.") }, { status: 400 });
    }

    const action = body.action;
    if (action !== "extract" && action !== "transcribe" && action !== "parse_devis") {
      return Response.json(
        { error: pick(locale, "Action IA non supportée.", "Unsupported AI action.") },
        { status: 400 }
      );
    }

    const fields = Array.isArray(body.fields)
      ? body.fields.map((f) => String(f)).filter(Boolean).slice(0, 30)
      : [];
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";

    const founder = isFounderEmail(user.email);
    // Tarif à plat, prévisible : extraction photo 25 ; dictée→devis 10 ; dictée 10
    // (+15 si structuration en champs).
    //
    // Pourquoi 10 pour dictée→devis (et non 30) : c'est la fonction phare de l'app
    // Devis, on la veut BON MARCHÉ pour qu'elle soit utilisée à chaque chantier, pas
    // rationnée. Marge visée : 80 % (sous le plancher structurel ~85 % de
    // CREDIT_COST_EUR, assumé sur cette action seule).
    //   coût réel = transcription (gpt-4o-transcribe, 0,006 $/min)
    //             + 1 passe Sonnet 5 (3 $/M in, 15 $/M out, sortie = tableau de devis)
    //   dictée 2 min / 1-2 devis  ≈ 0,025 $ ≈ 0,023 €
    //   dictée 3 min / 3 devis    ≈ 0,040 $ ≈ 0,037 €  ← cas dimensionnant
    //   crédit le moins cher (Pro 2000/49 €) = 0,0245 € TTC ≈ 0,0198 € net (TVA+Stripe)
    //   marge 80 % ⇒ budget coût = 0,20 × 0,0198 ≈ 0,004 €/crédit ⇒ 0,037/0,004 ≈ 10.
    // Une dictée peut contenir PLUSIEURS devis : 10 crédits couvre le lot, pas l'unité.
    const HOLD = founder
      ? 0
      : action === "extract"
        ? ACTION_CREDITS.lecture_fichier
        : action === "parse_devis"
          ? ACTION_CREDITS.dictee_devis
          : fields.length
            ? ACTION_CREDITS.lecture_fichier
            : ACTION_CREDITS.question;
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
    const refund = async () => {
      if (HOLD <= 0) return;
      try {
        const admin = createAdminClient();
        if (admin) await admin.rpc("refund_credits", { p_user_id: userId, p_amount: HOLD });
      } catch {
        /* best-effort */
      }
    };

    // Journalise le passage IA une SEULE fois, au tarif réellement prélevé (HOLD).
    // Le coût, lui, reste enregistré tel quel : c'est ce qui permet de surveiller
    // la marge de cette surface sans qu'il pilote le débit. Best-effort : la
    // facturation ne doit jamais casser la réponse rendue à l'app.
    const meter = (usage: LlmUsage) => {
      void trackAiUsage({
        supabase,
        userId,
        tenantId,
        action: `app_ai_${action}`,
        model: usage.model,
        inputTokens: usage.inTok,
        outputTokens: usage.outTok,
        realCostUsd: usage.costUsd,
        billedCredits: founder ? 0 : HOLD,
      }).catch(() => {});
    };

    // ── EXTRACTION PHOTO ──────────────────────────────────────────────────────
    if (action === "extract") {
      let files;
      try {
        files = validateFiles(body.image ? [body.image] : [], locale);
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
      const out = await runExtraction(content, fields, locale);
      if ("error" in out) {
        await refund();
        return Response.json(
          { error: `${out.error} ${pick(locale, "Vos crédits ont été remboursés.", "Your credits have been refunded.")}` },
          { status: out.status }
        );
      }
      meter(out.usage);
      return Response.json({ data: out.data });
    }

    // ── TRANSCRIPTION VOIX ────────────────────────────────────────────────────
    const audio = body.audio;
    if (!audio?.data) {
      await refund();
      return Response.json({ error: pick(locale, "Aucun audio fourni.", "No audio provided.") }, { status: 400 });
    }
    let blob: Blob;
    try {
      blob = new Blob([Buffer.from(audio.data, "base64")], { type: audio.mediaType || "audio/webm" });
    } catch {
      await refund();
      return Response.json({ error: pick(locale, "Audio invalide.", "Invalid audio.") }, { status: 400 });
    }
    const t = await transcribeBlob(blob);
    if ("error" in t) {
      await refund();
      return Response.json({ error: t.error, fallback: true }, { status: t.status });
    }

    // ── DICTÉE → PLUSIEURS DEVIS ──────────────────────────────────────────────
    if (action === "parse_devis") {
      if (!t.text) {
        await refund();
        return Response.json(
          {
            error: pick(
              locale,
              "Dictée vide — rien à transformer en devis. Vos crédits ont été remboursés.",
              "Empty dictation — nothing to turn into a quote. Your credits have been refunded."
            ),
            fallback: true,
          },
          { status: 502 }
        );
      }
      const parsed = await runDevisParse(t.text, locale);
      if ("error" in parsed) {
        await refund();
        return Response.json(
          {
            error: `${parsed.error} ${pick(locale, "Vos crédits ont été remboursés.", "Your credits have been refunded.")}`,
          },
          { status: parsed.status }
        );
      }
      meter(parsed.usage);
      return Response.json({ text: t.text, devis: parsed.devis });
    }

    // Si des champs sont demandés, on STRUCTURE la dictée (ex : pointage → heures).
    let data: Record<string, unknown> | undefined;
    if (fields.length && t.text) {
      const out = await runExtraction(
        [{ type: "text", text: `Voici une dictée à structurer : « ${t.text} ». Extrais : ${fields.join(", ")}.${question ? " " + question : ""}` }],
        fields,
        locale
      );
      if (!("error" in out)) {
        data = out.data;
        meter(out.usage);
      }
    }
    return Response.json({ text: t.text, data });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : pick(locale, "Erreur IA.", "AI error.") },
      { status: 500 }
    );
  }
}
