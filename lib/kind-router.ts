// ─────────────────────────────────────────────────────────────────────────────
// AIGUILLAGE POLYMORPHE — « Biltia aiguille » (Router Pattern de la vision OS).
//
// Le routeur `router.ts` choisit le MÉTIER (électricien, plombier…). Ce fichier
// choisit le FORMAT DE SORTIE : la nature chirurgicale de la solution.
//
//   • answer   — une question → une réponse texte immédiate (copilote).
//   • document — un livrable officiel (PDF) : avenant, PV de réception, mise en
//                demeure, devis, facture, attestation, courrier. Prêt à signer.
//   • action   — un widget de traitement par lot (glisser 30 BL → vérifier les
//                prix). Sans fichiers joints : invitation à les glisser.
//   • module   — une application (éphémère ou permanente) pour capturer / suivre
//                de la donnée (pointage, inventaire, suivi chantiers…).
//   • rule     — une MISSION PERMANENTE déléguée à un agent (« relance ce client
//                tous les jours à midi ») : Biltia l'exécute seul, à répétition.
//                Créée par lib/agent-rules.ts, exécutée par lib/agent-executor.ts.
//
// Deux niveaux, comme `router.ts` : LLM léger (Haiku, tool use forcé) avec repli
// TOUJOURS propre sur l'heuristique pure (lib/kind-heuristic.ts, partagée avec
// le client pour l'UI d'attente). Biais de sécurité : en cas d'ambiguïté entre
// production et question → production ; entre document et module → module.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { TIER_SIMPLE } from "./models";
import { classifyKindHeuristic, looksLikePureQuestion } from "./kind-heuristic";
import type { BiltiaKind, KindResult } from "./kind-heuristic";

export { classifyKindHeuristic, looksLikePureQuestion };
export type { BiltiaKind, KindMethod, KindResult } from "./kind-heuristic";

const KIND_MODEL = TIER_SIMPLE;

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

// ── LLM (Haiku + tool use forcé) ─────────────────────────────────────────────

function buildKindSystem(hasExistingApp: boolean): string {
  const modContext = hasExistingApp
    ? `

CONTEXTE : l'utilisateur a DÉJÀ une application ou un document ouvert dans l'atelier. Choisis "answer" UNIQUEMENT si sa demande est une pure question d'information qui ne demande AUCUN changement au livrable ouvert (ex : « quel est le taux de TVA ? », « j'ai combien de clients ? »). Toute demande de changement, même tournée en question (« tu peux ajouter un champ TVA ? », « et si on mettait un export PDF ? ») → "module".`
    : "";
  return `Tu es l'AIGUILLEUR de Biltia, l'OS opérationnel du BTP. On te donne la demande d'un artisan/chef de chantier, dictée au micro ou tapée, en langage courant. Tu identifies la NATURE exacte du besoin et tu choisis le FORMAT DE SORTIE le plus efficace pour le résoudre. Tu ne résous rien toi-même : tu aiguilles.

LES 6 FORMATS :
- "answer" — l'utilisateur pose une QUESTION et attend une RÉPONSE en texte, tout de suite : réglementation (« quel taux de TVA pour une rénovation ? »), norme, délai, garantie, conseil métier, ou une question sur SES données (« j'ai combien de clients ? », « où en est le chantier Morel ? »). Il ne demande RIEN à produire.
- "document" — l'utilisateur veut UN livrable officiel unique, à imprimer/envoyer/signer : avenant, PV de réception, mise en demeure, devis, facture, attestation (TVA…), courrier/relance, ordre de service, bon de commande, levée de réserves. Indices : « sors-moi l'avenant », « rédige une mise en demeure », « fais-lui signer », « attestation TVA », « un devis pour… » (un seul, pas un outil de gestion de devis).
- "action" — l'utilisateur a DES DONNÉES/FICHIERS EXISTANTS à traiter par lot, UNE fois, maintenant : vérifier, comparer, rapprocher, contrôler. Indices : « glisse tes 30 bons de livraison, je vérifie les prix vs devis », « compare ces factures », « détecte les erreurs ».
- "module" — l'utilisateur veut un OUTIL/APPLICATION pour capturer ou suivre de la donnée dans la durée : suivi de chantiers, pointage des heures, inventaire, CRM, planning, carnet d'entretien. Indices : « je veux un tableau/outil pour gérer/suivre… », « application de pointage ».
- "rule" — l'utilisateur DÉLÈGUE une mission PERMANENTE que Biltia devra exécuter SEUL, à répétition ou sur déclencheur, sans qu'il ait à redemander : « relance ce client tous les jours à midi », « chaque soir à 18h vérifie les pointages », « occupe-toi de relancer mes factures impayées », « préviens-moi dès qu'un document expire ». Indices décisifs : récurrence (« tous les jours », « chaque lundi », « chaque soir »), déclencheur (« dès que »), délégation (« occupe-toi de », « automatiquement »).
- "data" — l'utilisateur veut agir sur UNE FICHE de son workspace, MAINTENANT, une fois : ajouter (« ajoute un client Jean Dupont, 06 12 34 56 78 »), modifier (« mets à jour le téléphone de Karim », « passe le devis D-2026-04 en accepté », « le chantier Morel est à 80% »), supprimer (« supprime le client Martin »). Ni un outil, ni un document, ni une mission répétée : une écriture directe dans les données.

RÈGLE DE DÉPARTAGE :
- Une question qui attend un SAVOIR ou un CHIFFRE → "answer". Une demande qui attend une PRODUCTION (document, outil, traitement) → un des trois formats de production. Une demande de DÉLÉGUER une tâche répétitive → "rule".
- Un livrable UNIQUE à signer/envoyer → "document". Un OUTIL qui gère plusieurs entrées dans le temps → "module". La MÊME intention assortie d'une récurrence/délégation → "rule" (« relance-le » = document ; « relance-le chaque semaine » = rule).
- « un devis » (le document) = document ; « un outil de création de devis » = module ; « comment je fais un devis ? » = answer.
- En cas de doute réel entre document et module, choisis "module". En cas de doute entre answer et une production, choisis la production. "rule" UNIQUEMENT sur signal explicite de récurrence/déclencheur/délégation — jamais par défaut.
- « ajoute un client Jean » = data (une fiche) ; « ajoute un outil de gestion de clients » = module (un outil) ; « j'ai combien de clients ? » = answer (lecture). « Enregistre ce devis comme accepté » = data ; « fais-moi un devis » = document.${modContext}

"doc_type" : uniquement si kind="document" — un de : ${DOC_TYPES.join(", ")} (ou un slug court si aucun ne colle). Vide sinon.
"confidence" : 0 à 1.

Réponds UNIQUEMENT en appelant l'outil classify_request.`;
}

const CLASSIFY_TOOL = {
  name: "classify_request",
  description: "Choisit le format de sortie (answer/document/action/module) pour la demande.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["answer", "document", "action", "module", "rule", "data"],
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

async function classifyWithLLM(
  prompt: string,
  sector?: string | null,
  hasExistingApp = false
): Promise<KindResult | null> {
  const client = new Anthropic();

  const userContent = sector
    ? `Secteur déclaré du client : ${sector}\n\nDemande : « ${prompt} »`
    : `Demande : « ${prompt} »`;

  const message = await client.messages.create({
    model: KIND_MODEL,
    max_tokens: 256,
    system: buildKindSystem(hasExistingApp),
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_request" },
    messages: [{ role: "user", content: userContent }],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return null;

  const input = block.input as { kind?: string; doc_type?: string; confidence?: number };
  if (
    input.kind !== "answer" &&
    input.kind !== "document" &&
    input.kind !== "action" &&
    input.kind !== "module" &&
    input.kind !== "rule" &&
    input.kind !== "data"
  ) {
    return null;
  }

  const docType = input.kind === "document" ? input.doc_type?.trim() || null : null;

  return {
    kind: input.kind,
    docType,
    method: "llm",
    confidence: typeof input.confidence === "number" ? input.confidence : 0.7,
    reasoning: "classification Haiku",
    usage: {
      model: KIND_MODEL,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

// ── ENTRÉE PUBLIQUE ──────────────────────────────────────────────────────────

/**
 * Aiguille une demande vers un format de sortie. Tente le LLM si une clé API est
 * dispo, retombe sur l'heuristique en cas d'absence de clé ou d'erreur (jamais
 * d'exception propagée). Garde-fou déterministe : une pure question (heuristique)
 * n'est JAMAIS transformée en production par le LLM.
 */
export async function classifyKind(opts: {
  prompt: string;
  sector?: string | null;
  useLLM?: boolean;
  /** Un livrable est déjà ouvert : "answer" seulement pour une pure question. */
  hasExistingApp?: boolean;
}): Promise<KindResult> {
  const { prompt, sector, useLLM = true, hasExistingApp = false } = opts;

  // HEURISTIQUE D'ABORD (gratuite). On ne dépense un appel Haiku QUE lorsqu'elle
  // doute vraiment. Deux cas où elle fait autorité et rend le LLM inutile :
  //   • pure question → le LLM ne doit de toute façon jamais la transformer en
  //     production (ancien « garde-fou » : désormais on n'appelle plus le LLM).
  //   • signaux forts (confiance ≥ 0.8 = plusieurs mots-clés concordants).
  const heuristic = classifyKindHeuristic(prompt, hasExistingApp);
  const heuristicIsSure = looksLikePureQuestion(prompt) || heuristic.confidence >= 0.8;

  const hasKey =
    !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");

  if (useLLM && hasKey && !heuristicIsSure) {
    try {
      const llm = await classifyWithLLM(prompt, sector, hasExistingApp);
      if (llm) return llm;
    } catch {
      // Crédits épuisés, réseau, etc. → repli silencieux sur l'heuristique.
    }
  }

  return heuristic;
}

/** Garde-fou : normalise une valeur `kind` reçue du client (modification/auto-fix). */
export function coerceKind(value: unknown): BiltiaKind | null {
  return value === "document" || value === "action" || value === "module" ? value : null;
}
