// ─────────────────────────────────────────────────────────────────────────────
// AIGUILLAGE HYBRIDE — une BARRIÈRE DÉTERMINISTE au-dessus du classifieur LLM.
//
// Le classifieur probabiliste enferme une demande dans UNE branche. S'il se trompe
// (« décale le chantier ET préviens l'équipe » classé « task »), toute la boucle
// agentique devient inaccessible. Ici, du CODE garantit les cas OPÉRATIONNELS
// évidents : une demande qui ÉCRIT une fiche du workspace part sur « data », même
// si le modèle a dit task/module/email/action.
//
// ⚠️ RAPPEL TAXONOMIE : dans ce produit, kind="task" = ENVOYER un message à un
// GROUPE (équipe / tous clients / tous fournisseurs), PAS « créer une fiche tâche ».
// Créer/modifier une fiche tâche = « data ». C'est la principale source de confusion
// (le mot « tâche » attire à tort vers « task »).
//
// Module PUR (aucun import de valeur) → testable par `node --test`. La normalisation
// du pré-vol enrichi vit dans kind-router (qui importe mission-preflight).
// ─────────────────────────────────────────────────────────────────────────────

import type { BiltiaKind } from "./kind-heuristic";
import type { PreflightIntent } from "./mission-preflight";

function normalize(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’`]/g, " ").replace(/\s+/g, " ").trim();
}

// Verbes de MUTATION d'une fiche (écriture). Stems tolérants aux conjugaisons.
const MUTATION_RE = /\b(cree|creer|ajout|modifi|chang|decal|deplac|supprim|efface|affect|valid|clotur|(?:mets?|met) a jour|passe|enregistr|planifi|report|annul|reprogramm|reaffect|assigne)\w*/;
// Verbes de COMMUNICATION.
const COMM_RE = /\b(previen|prevenir|informe|informer|envoi|ecri[rt]|relanc|contact|notifi|avertis|preven)\w*/;

// Entités du workspace (mot → présence). « équipe/compagnons/chefs » comptent comme
// des personnes (cible d'écriture/communication).
const ENTITY_RES: Record<string, RegExp> = {
  chantier: /\bchantiers?\b/,
  tasks: /\bt[âa]?ches?\b|\btaches?\b/,
  devis: /\bdevis\b|\bavenants?\b/,
  facture: /\bfactures?\b/,
  intervention: /\binterventions?\b/,
  client: /\bclients?\b/,
  employe: /\b(employes?|salaries?|equipes?|compagnons?|chefs?|ouvriers?|techniciens?)\b/,
  document: /\bdocuments?\b/,
  planning: /\bplannings?\b/,
  reserve: /\breserves?\b/,
  materiel: /\bmateriels?\b|\bmateriaux?\b/,
  pointage: /\bpointages?\b/,
};

// Un chantier/devis/facture/intervention/client/employé est un OBJET MÉTIER dont la
// modification suffit à qualifier une mission « data ».
const BUSINESS_ENTITIES = ["chantier", "devis", "facture", "intervention", "client", "employe", "reserve", "materiel"];

const APP_NOUN_RE = /\b(application|appli|outil|interface|formulaire|tableau de bord|tableau de suivi|module|dashboard)\b/;
const APP_VERB_RE = /\b(cree|creer|construis|construire|mets? en place|met en place|developpe|fais|veux|faut|besoin d|mettre en place)\w*/;

export interface OperationalSignals {
  mutation: boolean;
  communication: boolean;
  appCreation: boolean;
  /** Entités du workspace détectées. */
  entities: string[];
  /** Une écriture de fiche (verbe de mutation + entité workspace) est-elle demandée ? */
  hasWorkspaceMutation: boolean;
  /** Une écriture sur un OBJET MÉTIER (chantier/devis/facture/…) ? */
  hasBusinessMutation: boolean;
}

/** Détection BORNÉE de signaux opérationnels (combinaisons, jamais un mot isolé). */
export function detectOperationalSignals(prompt: string): OperationalSignals {
  const n = normalize(prompt);
  const mutation = MUTATION_RE.test(n);
  const communication = COMM_RE.test(n);
  const entities = Object.entries(ENTITY_RES).filter(([, re]) => re.test(n)).map(([k]) => k);
  const hasWorkspaceMutation = mutation && entities.length > 0;
  const hasBusinessMutation = mutation && entities.some((e) => BUSINESS_ENTITIES.includes(e));
  const appCreation = APP_NOUN_RE.test(n) && APP_VERB_RE.test(n);
  return { mutation, communication, appCreation, entities, hasWorkspaceMutation, hasBusinessMutation };
}

export interface RoutingResolution {
  classifiedKind: BiltiaKind;
  resolvedKind: BiltiaKind;
  overrideReason?: string;
}

// Kinds qui NE DOIVENT PAS retenir une mission opérationnelle multi-objets.
const MISROUTE_KINDS = new Set<BiltiaKind>(["task", "module", "email", "action"]);

/**
 * BARRIÈRE DÉTERMINISTE : corrige un kind incompatible avec des signaux
 * opérationnels évidents. On ne force QUE vers « data » (jamais l'inverse), et
 * UNIQUEMENT depuis task/module/email/action (les branches qui rendraient la
 * boucle agentique inaccessible). answer/document/calendar/image/rule/data sont
 * laissés au modèle (pas de sur-correction).
 */
export function resolveOperationalKind(opts: { prompt: string; classifiedKind: BiltiaKind }): RoutingResolution {
  const { prompt, classifiedKind } = opts;
  const sig = detectOperationalSignals(prompt);
  // App EXPLICITE demandée → on respecte « module » (ce n'est pas une mission data).
  if (classifiedKind === "module" && sig.appCreation && !sig.hasBusinessMutation) {
    return { classifiedKind, resolvedKind: "module" };
  }
  if (sig.hasWorkspaceMutation && MISROUTE_KINDS.has(classifiedKind)) {
    const what = sig.entities.join(", ");
    const comm = sig.communication ? " et prépare une communication" : "";
    return {
      classifiedKind,
      resolvedKind: "data",
      overrideReason: `La demande écrit sur ${what}${comm} : « ${classifiedKind} » rendrait la boucle opérationnelle inaccessible → data.`,
    };
  }
  return { classifiedKind, resolvedKind: classifiedKind };
}

/**
 * FALLBACK DÉTERMINISTE des intentions : quand le pré-vol LLM est vide/`other`, on
 * complète UNIQUEMENT les intentions FORTEMENT supportées par des signaux (missions
 * critiques et évidentes). Conservateur : au moindre doute, on n'invente rien.
 */
export function deriveIntentsFromSignals(prompt: string): PreflightIntent[] {
  const sig = detectOperationalSignals(prompt);
  const intents: PreflightIntent[] = [];
  const n = normalize(prompt);
  if (sig.mutation && ENTITY_RES.chantier.test(n)) intents.push("update_chantier");
  if (sig.mutation && (ENTITY_RES.tasks.test(n) || ENTITY_RES.intervention.test(n))) intents.push("update_related_tasks");
  // Écriture sur un autre objet métier (devis/facture/client…) sans chantier → create_object.
  if (sig.hasBusinessMutation && !intents.includes("update_chantier") && !intents.includes("update_related_tasks")) intents.push("create_object");
  if (sig.communication) intents.push("prepare_communication");
  return Array.from(new Set(intents));
}
