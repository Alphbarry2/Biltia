// ─────────────────────────────────────────────────────────────────────────────
// CONTEXTE SUFFISANT ? — la porte « employé » avant de produire un DOCUMENT.
//
// Principe (décision user 2026-07-05) : Biltia agit comme un employé compétent.
// Un document officiel ne s'INVENTE pas — le nom du client, les montants, les
// quantités, les prestations, les dates doivent venir de la DEMANDE ou du
// WORKSPACE. Si l'essentiel manque, Biltia DEMANDE (1 à 3 questions ciblées) au
// lieu de sortir une facture bidon truffée de [placeholders].
//
// Frontière (à respecter par le modèle) :
//   • NE JAMAIS inventer → demander : identité du client, montants, quantités,
//     prestations réalisées, dates de travaux, coordonnées.
//   • DÉDUIRE seul → ne pas demander : taux de TVA (10% réno / 20% neuf /
//     5,5% réno énergétique), date du jour, numérotation, mise en page, mentions
//     légales, structure.
// Objectif : ZÉRO hallucination avec le MINIMUM de friction. Si le workspace
// contient déjà la fiche référencée (client, devis, facture), c'est « prêt ».
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { TIER_SIMPLE } from "./models";

const ASSESS_MODEL = TIER_SIMPLE;

// Question à réponse libre (le widget affiche des suggestions cliquables + un
// champ texte). Miroir de ClarifyQuestion côté client (options facultatives).
export type DocQuestion = {
  id: string;
  question: string;
  multi: boolean;
  options: { value: string; label: string; hint?: string }[];
};

export type DocReadiness = {
  ready: boolean;
  recap: string;
  questions: DocQuestion[];
  usage?: { model: string; inputTokens: number; outputTokens: number };
};

const ASSESS_TOOL = {
  name: "assess_document_context",
  description:
    "Décide si on a assez de contexte pour produire le document sans rien inventer, sinon liste les 1 à 3 questions bloquantes.",
  input_schema: {
    type: "object",
    properties: {
      ready: {
        type: "boolean",
        description:
          "true UNIQUEMENT si le document peut être produit fidèlement à partir de la demande et/ou du workspace, sans inventer de nom, montant, quantité, prestation ni date.",
      },
      recap: {
        type: "string",
        description:
          "Une phrase, ton employé : ce que tu as compris de la demande (« Je prépare une facture pour le client X, rénovation salle de bain »). ≤ 160 caractères.",
      },
      questions: {
        type: "array",
        maxItems: 3,
        description:
          "Vide si ready=true. Sinon 1 à 3 questions COURTES sur les seules inconnues bloquantes (jamais sur la TVA, la date ou la mise en page).",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "slug court (montant, client, prestation…)" },
            question: { type: "string", description: "Question ≤ 90 caractères, vouvoiement." },
            suggestions: {
              type: "array",
              maxItems: 3,
              description: "0 à 3 réponses rapides proposées (facultatif).",
              items: { type: "string" },
            },
          },
          required: ["id", "question"],
        },
      },
    },
    required: ["ready", "recap", "questions"],
    additionalProperties: false,
  },
} as Anthropic.Tool;

const ASSESS_SYSTEM = `Tu es un employé consciencieux d'une entreprise du BTP qui doit préparer un DOCUMENT officiel (facture, devis, avenant, PV, mise en demeure, attestation, courrier). Ton chef te donne une consigne, parfois incomplète.

Ta règle d'or : NE JAMAIS INVENTER. Un document engage l'entreprise. Le nom exact du client, les montants, les quantités, les prestations réalisées, les dates de travaux et les coordonnées ne se devinent pas.

AVANT de rédiger, tu vérifies si tu as de quoi produire le document FIDÈLEMENT :
1. Regarde d'abord le WORKSPACE fourni. Si la fiche référencée y est (le client, un devis ou une facture liés), tu as le contexte → ready=true, tu t'en serviras.
2. Sinon, repère les inconnues VRAIMENT bloquantes et pose 1 à 3 questions courtes, ciblées. Exemples : « Pour quel client ? », « Quel est le montant HT (ou le détail des lignes) ? », « Quelle prestation exactement ? ».

Ce que tu DÉDUIS seul (ne demande JAMAIS) : le taux de TVA (10% rénovation, 20% neuf, 5,5% rénovation énergétique), la date du jour, la numérotation du document, la mise en page, les mentions légales, la structure.

Économie de friction : ne pose que le strict nécessaire. Si la demande est déjà suffisante (« facture pour Dupont, rénovation SdB, 2000 € HT »), ready=true, aucune question. Un seul trou → une seule question.

Réponds UNIQUEMENT via l'outil assess_document_context.`;

/**
 * Évalue si on a assez de contexte pour produire le document. Fail-open : en cas
 * d'absence de clé, d'erreur ou de timeout, renvoie ready=true (on ne bloque
 * jamais une génération sur un échec de la porte — au pire on retombe sur le
 * comportement historique).
 */
export async function assessDocumentReadiness(opts: {
  prompt: string;
  docType: string | null;
  workspace: string;
}): Promise<DocReadiness> {
  const okFallback: DocReadiness = { ready: true, recap: "", questions: [] };

  const hasKey =
    !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");
  if (!hasKey) return okFallback;

  try {
    const client = new Anthropic();
    const userContent = [
      `Type de document : ${opts.docType ?? "à déterminer d'après la demande"}`,
      `Demande du chef : « ${opts.prompt} »`,
      opts.workspace?.trim()
        ? opts.workspace
        : "WORKSPACE : aucune donnée pertinente trouvée (pas de fiche liée à cette demande).",
    ].join("\n\n");

    const message = await client.messages.create({
      model: ASSESS_MODEL,
      max_tokens: 400,
      system: ASSESS_SYSTEM,
      tools: [ASSESS_TOOL],
      tool_choice: { type: "tool", name: "assess_document_context" },
      messages: [{ role: "user", content: userContent }],
    });

    const block = message.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return okFallback;

    const input = block.input as {
      ready?: boolean;
      recap?: string;
      questions?: { id?: string; question?: string; suggestions?: string[] }[];
    };

    const usage = {
      model: ASSESS_MODEL,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };

    const questions: DocQuestion[] = (input.questions ?? [])
      .filter((q) => q && typeof q.question === "string" && q.question.trim())
      .slice(0, 3)
      .map((q, i) => ({
        id: String(q.id || `q${i}`).slice(0, 40),
        question: String(q.question).slice(0, 140),
        multi: false,
        options: (Array.isArray(q.suggestions) ? q.suggestions : [])
          .slice(0, 3)
          .map((s) => ({ value: String(s).slice(0, 80), label: String(s).slice(0, 80) })),
      }));

    // Cohérence : « pas prêt » sans question exploitable → on laisse passer
    // (mieux vaut produire que bloquer sur une porte qui n'a rien à demander).
    if (input.ready || questions.length === 0) {
      return { ready: true, recap: String(input.recap ?? "").slice(0, 200), questions: [], usage };
    }

    return { ready: false, recap: String(input.recap ?? "").slice(0, 200), questions, usage };
  } catch {
    return okFallback;
  }
}
