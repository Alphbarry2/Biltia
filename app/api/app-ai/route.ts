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

// Modèle de raisonnement pour découper une dictée en PLUSIEURS devis structurés.
const DEVIS_MODEL = "claude-sonnet-5";

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
async function runDevisParse(text: string): Promise<{ devis: ParsedDevis[] } | { error: string; status: number }> {
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
    return { error: "Structuration des devis indisponible.", status: 502 };
  }
  const tb = message.content.find((b) => b.type === "tool_use");
  if (!tb || tb.type !== "tool_use") return { error: "Aucun devis reconnu dans la dictée.", status: 502 };
  const input = tb.input as { devis?: unknown };
  const list = Array.isArray(input.devis) ? (input.devis as ParsedDevis[]) : [];
  if (!list.length) return { error: "Aucun devis reconnu dans la dictée.", status: 502 };
  return { devis: list };
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
    if (action !== "extract" && action !== "transcribe" && action !== "parse_devis") {
      return Response.json({ error: "Action IA non supportée." }, { status: 400 });
    }

    const fields = Array.isArray(body.fields)
      ? body.fields.map((f) => String(f)).filter(Boolean).slice(0, 30)
      : [];
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";

    const founder = isFounderEmail(user.email);
    // Tarif à plat, prévisible : extraction photo 25 ; dictée→devis 30 (transcription
    // + structuration lourde en tableau) ; dictée 10 (+15 si structuration en champs).
    const HOLD = founder ? 0 : action === "extract" ? 25 : action === "parse_devis" ? 30 : fields.length ? 25 : 10;
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

    // ── DICTÉE → PLUSIEURS DEVIS ──────────────────────────────────────────────
    if (action === "parse_devis") {
      if (!t.text) {
        await refund();
        return Response.json({ error: "Dictée vide — rien à transformer en devis. Vos crédits ont été remboursés.", fallback: true }, { status: 502 });
      }
      const parsed = await runDevisParse(t.text);
      if ("error" in parsed) {
        await refund();
        return Response.json({ error: `${parsed.error} Vos crédits ont été remboursés.` }, { status: parsed.status });
      }
      return Response.json({ text: t.text, devis: parsed.devis });
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
