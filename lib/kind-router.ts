// ─────────────────────────────────────────────────────────────────────────────
// AIGUILLAGE POLYMORPHE — « Batify aiguille » (Router Pattern de la vision OS).
//
// Le routeur `router.ts` choisit le MÉTIER (électricien, plombier…). Ce fichier
// choisit le FORMAT DE SORTIE : la nature chirurgicale de la solution.
//
//   • document — un livrable officiel (PDF) : avenant, PV de réception, mise en
//                demeure, devis, facture, attestation, courrier. Prêt à signer.
//   • action   — un widget de traitement par lot (glisser 30 BL → vérifier les
//                prix). [détecté, exécution stopgap via module pour l'instant]
//   • module   — une application (éphémère ou permanente) pour capturer / suivre
//                de la donnée (pointage, inventaire, suivi chantiers…).
//
// Deux niveaux, comme `router.ts` : heuristique déterministe puis LLM léger
// (Haiku, tool use forcé) avec repli TOUJOURS propre sur l'heuristique.
// Biais de sécurité : en cas d'ambiguïté, on retombe sur `module` (comportement
// historique du générateur), jamais sur un format destructeur.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

const KIND_MODEL = "claude-haiku-4-5";

export type BatifyKind = "document" | "action" | "module";

export type KindMethod = "llm" | "heuristic" | "default";

export type KindResult = {
  /** Format de sortie chirurgical retenu. */
  kind: BatifyKind;
  /** Sous-type de document quand `kind === "document"` (slug court), sinon null. */
  docType: string | null;
  /** Comment la décision a été prise. */
  method: KindMethod;
  /** Confiance 0..1. */
  confidence: number;
  /** Explication courte (debug / tracking). */
  reasoning?: string;
};

export const DOC_TYPES = [
  "avenant",
  "pv_reception",
  "mise_en_demeure",
  "devis",
  "facture",
  "attestation",
  "courrier",
  "ordre_de_service",
  "bon_de_commande",
  "levee_reserves",
] as const;

// ── 1. HEURISTIQUE ───────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Noms de documents officiels → slug docType. L'ordre compte (spécifique d'abord).
const DOC_NOUNS: { kw: string; type: string }[] = [
  { kw: "avenant", type: "avenant" },
  { kw: "pv de reception", type: "pv_reception" },
  { kw: "proces-verbal de reception", type: "pv_reception" },
  { kw: "proces verbal de reception", type: "pv_reception" },
  { kw: "pv de recette", type: "pv_reception" },
  { kw: "reception des travaux", type: "pv_reception" },
  { kw: "levee de reserves", type: "levee_reserves" },
  { kw: "levee des reserves", type: "levee_reserves" },
  { kw: "mise en demeure", type: "mise_en_demeure" },
  { kw: "ordre de service", type: "ordre_de_service" },
  { kw: "bon de commande", type: "bon_de_commande" },
  { kw: "rapport de fin de chantier", type: "pv_reception" },
  { kw: "rapport de chantier", type: "pv_reception" },
  { kw: "proces-verbal", type: "pv_reception" },
  { kw: "proces verbal", type: "pv_reception" },
  { kw: "compte-rendu", type: "courrier" },
  { kw: "compte rendu", type: "courrier" },
  { kw: "attestation", type: "attestation" },
  { kw: "certificat", type: "attestation" },
  { kw: "courrier", type: "courrier" },
  { kw: "lettre", type: "courrier" },
  { kw: "relance", type: "courrier" },
  { kw: "convocation", type: "courrier" },
  { kw: "note d'honoraires", type: "facture" },
  { kw: "facture", type: "facture" },
  { kw: "devis", type: "devis" },
];

// Verbes « produis-moi un papier » — signaux forts de livrable unique.
const DOC_VERBS = [
  "redige", "rediger", "sors-moi", "sors moi", "etablis", "etablir",
  "fais un courrier", "fais-moi un courrier", "ecris une lettre", "ecrire une lettre",
  "prepare l'avenant", "prepare le pv", "prepare la mise en demeure",
  "faire signer", "fais-le signer", "fais le signer", "a faire signer", "bon pour accord",
];

// Traitement par lot de fichiers/données existantes.
const ACTION_SIGNALS = [
  "glisse", "glisser", "depose", "deposer", "glisse-depose",
  "verifie mes", "verifie les", "verifier mes", "controle les prix", "controler les prix",
  "compare", "comparer", "rapproche", "rapprochement", "rapprocher",
  "detecte les erreurs", "detecter les erreurs", "traite ces", "traite mes",
  "analyse ces", "analyse mes", "par lot", "en lot", "ocr", "extrais de",
];

// Outil de gestion / capture de données (comportement historique).
const MODULE_SIGNALS = [
  "suivi", "suivre", "gerer", "gestion", "tableau de bord", "dashboard",
  "outil", "application", "logiciel", "crm", "planning", "carnet",
  "pointage", "inventaire", "stock", "registre", "base de donnees",
  "liste de", "tous mes", "toutes mes", "mes chantiers", "fiche de suivi",
];

function countHits(text: string, kws: string[]): number {
  let n = 0;
  for (const kw of kws) if (text.includes(normalize(kw))) n++;
  return n;
}

/**
 * Choix sans appel API. Biais volontaire vers `module` sur ambiguïté, pour
 * préserver le comportement historique du générateur.
 */
export function classifyKindHeuristic(prompt: string): KindResult {
  const text = normalize(prompt);

  let docScore = 0;
  let docType: string | null = null;
  for (const { kw, type } of DOC_NOUNS) {
    if (text.includes(normalize(kw))) {
      docScore += 2;
      if (!docType) docType = type; // premier (= plus spécifique) match
    }
  }
  docScore += countHits(text, DOC_VERBS) * 2;

  const actionScore = countHits(text, ACTION_SIGNALS) * 3;
  const moduleScore = countHits(text, MODULE_SIGNALS) * 2;

  // Priorités : module l'emporte sur égalité (défaut sûr).
  if (moduleScore > 0 && moduleScore >= docScore && moduleScore >= actionScore) {
    return {
      kind: "module",
      docType: null,
      method: "heuristic",
      confidence: Math.min(0.5 + moduleScore * 0.08, 0.85),
      reasoning: `signaux « application/gestion » (${moduleScore})`,
    };
  }
  if (docScore > 0 && docScore >= actionScore) {
    return {
      kind: "document",
      docType,
      method: "heuristic",
      confidence: Math.min(0.55 + docScore * 0.08, 0.9),
      reasoning: `document officiel détecté${docType ? ` (${docType})` : ""}`,
    };
  }
  if (actionScore > 0) {
    return {
      kind: "action",
      docType: null,
      method: "heuristic",
      confidence: Math.min(0.55 + actionScore * 0.06, 0.85),
      reasoning: `traitement par lot détecté (${actionScore})`,
    };
  }

  return {
    kind: "module",
    docType: null,
    method: "default",
    confidence: 0.4,
    reasoning: "aucun signal fort → module par défaut",
  };
}

// ── 2. LLM (Haiku + tool use forcé) ──────────────────────────────────────────

function buildKindSystem(): string {
  return `Tu es l'AIGUILLEUR de Batify, l'OS opérationnel du BTP. On te donne la demande d'un artisan/chef de chantier, dictée au micro ou tapée, en langage courant. Tu identifies la NATURE exacte du besoin et tu choisis le FORMAT DE SORTIE le plus efficace pour le résoudre. Tu ne résous rien toi-même : tu aiguilles.

LES 3 FORMATS :
- "document" — l'utilisateur veut UN livrable officiel unique, à imprimer/envoyer/signer : avenant, PV de réception, mise en demeure, devis, facture, attestation (TVA…), courrier/relance, ordre de service, bon de commande, levée de réserves. Indices : « sors-moi l'avenant », « rédige une mise en demeure », « fais-lui signer », « attestation TVA », « un devis pour… » (un seul, pas un outil de gestion de devis).
- "action" — l'utilisateur a DES DONNÉES/FICHIERS EXISTANTS à traiter par lot : vérifier, comparer, rapprocher, contrôler. Indices : « glisse tes 30 bons de livraison, je vérifie les prix vs devis », « compare ces factures », « détecte les erreurs ».
- "module" — l'utilisateur veut un OUTIL/APPLICATION pour capturer ou suivre de la donnée dans la durée : suivi de chantiers, pointage des heures, inventaire, CRM, planning, carnet d'entretien. Indices : « je veux un tableau/outil pour gérer/suivre… », « application de pointage ».

RÈGLE DE DÉPARTAGE :
- Un livrable UNIQUE à signer/envoyer → "document". Un OUTIL qui gère plusieurs entrées dans le temps → "module".
- « un devis » (le document) = document ; « un outil de création de devis » = module.
- En cas de doute réel entre document et module, choisis "module".

"doc_type" : uniquement si kind="document" — un de : ${DOC_TYPES.join(", ")} (ou un slug court si aucun ne colle). Vide sinon.
"confidence" : 0 à 1.

Réponds UNIQUEMENT en appelant l'outil classify_request.`;
}

const CLASSIFY_TOOL = {
  name: "classify_request",
  description: "Choisit le format de sortie (document/action/module) pour la demande.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["document", "action", "module"],
        description: "Format de sortie chirurgical.",
      },
      doc_type: {
        type: "string",
        description: "Sous-type de document si kind=document (avenant, pv_reception, mise_en_demeure, devis, facture, attestation, courrier, …). Vide sinon.",
      },
      confidence: {
        type: "number",
        description: "Confiance de 0 à 1.",
      },
    },
    required: ["kind", "doc_type", "confidence"],
    additionalProperties: false,
  },
} as Anthropic.Tool;

async function classifyWithLLM(prompt: string, sector?: string | null): Promise<KindResult | null> {
  const client = new Anthropic();

  const userContent = sector
    ? `Secteur déclaré du client : ${sector}\n\nDemande : « ${prompt} »`
    : `Demande : « ${prompt} »`;

  const message = await client.messages.create({
    model: KIND_MODEL,
    max_tokens: 256,
    system: buildKindSystem(),
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_request" },
    messages: [{ role: "user", content: userContent }],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return null;

  const input = block.input as { kind?: string; doc_type?: string; confidence?: number };
  if (input.kind !== "document" && input.kind !== "action" && input.kind !== "module") {
    return null;
  }

  const docType = input.kind === "document" ? input.doc_type?.trim() || null : null;

  return {
    kind: input.kind,
    docType,
    method: "llm",
    confidence: typeof input.confidence === "number" ? input.confidence : 0.7,
    reasoning: "classification Haiku",
  };
}

// ── ENTRÉE PUBLIQUE ──────────────────────────────────────────────────────────

/**
 * Aiguille une demande vers un format de sortie. Tente le LLM si une clé API est
 * dispo, retombe sur l'heuristique en cas d'absence de clé ou d'erreur (jamais
 * d'exception propagée).
 */
export async function classifyKind(opts: {
  prompt: string;
  sector?: string | null;
  useLLM?: boolean;
}): Promise<KindResult> {
  const { prompt, sector, useLLM = true } = opts;

  const hasKey =
    !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");

  if (useLLM && hasKey) {
    try {
      const llm = await classifyWithLLM(prompt, sector);
      if (llm) return llm;
    } catch {
      // Crédits épuisés, réseau, etc. → repli silencieux sur l'heuristique.
    }
  }

  return classifyKindHeuristic(prompt);
}

/** Garde-fou : normalise une valeur `kind` reçue du client (modification/auto-fix). */
export function coerceKind(value: unknown): BatifyKind | null {
  return value === "document" || value === "action" || value === "module" ? value : null;
}
