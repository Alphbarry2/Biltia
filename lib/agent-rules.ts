// ─────────────────────────────────────────────────────────────────────────────
// AGENT RULES — le primitif « RECRUTER » (vision créer + recruter, 2026-07-05).
//
// L'utilisateur dicte une règle permanente en langage courant (« relance le
// client Martin tous les jours à midi », « chaque soir à 18h vérifie les
// pointages ») ; ce fichier la transforme en règle STRUCTURÉE et exécutable :
//
//   • parseInstruction()  — Haiku (tool use forcé) extrait déclencheur + action,
//                           repli TOUJOURS propre sur une heuristique pure
//                           (motif exact de kind-router.ts / router.ts).
//   • resolveRecipients() — résolution d'entité contre le WORKSPACE (le vrai
//                           client, le vrai employé). L'agent ne devine JAMAIS :
//                           destinataire introuvable/ambigu/sans email → état
//                           « bloqué » avec la question précise à poser.
//   • computeNextRun()    — prochain passage en HEURE DE PARIS (l'artisan pense
//                           en heure locale, le serveur en UTC).
//   • createAgentRule()   — orchestre le tout et écrit la règle (RLS tenant).
//
// L'EXÉCUTION vit dans lib/agent-executor.ts (serveur/cron uniquement).
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { client, hasAnyLlmKey } from "@/lib/llm";
import { TIER_SIMPLE, TIER_MEDIUM, TIER_COMPLEX } from "./models";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchVocabInText, matchTradeInText, vocabLabel } from "@/lib/vocabulaires";
import { getEntitlementsForTenant } from "./entitlements";
import { isFounderEmail } from "./founder";
import { WATCHER_KEYS, getWatcher, isSupplierRelanceWatcher, type WatcherKey } from "./agent-watchers";
import { templateAction, templateCredits, type AgentTemplate } from "./agent-templates";
import { checkAgentReadiness, summarizeGaps, type CapabilityGap } from "./agent-readiness";
import { connectorsForCapability } from "./capabilities";
import { judgeFeasibility, describeWatcher } from "./agent-feasibility";
// Sentinelle d'état partagée avec la page /agents (« use client ») : elle vit dans
// un module sans imports pour ne pas embarquer ce fichier-ci dans le bundle client.
import { PENDING_CONNECTION_REASON } from "./agent-status";
export { PENDING_CONNECTION_REASON };
import type { Locale } from "./i18n/config";
import { buildSpec, coerceConditionGroup, coerceRecipientTargets, type ParsedActionStep, type ConditionGroup, type RecipientResolver } from "./agent-model";
import { buildEventWatcherDescription } from "./watcher-parser-docs";
import { coerceRelativeDate, RELATIVE_DATE_FIELDS, type RelativeDateConfig } from "./agent-triggers";
import { ACTION_CREDITS } from "./plans";

// COMPRÉHENSION AVANT VITESSE (2026-07-07) : le recruteur d'agents lit la mission
// avec Sonnet 5, pas Haiku. Comprendre la vraie intention (« relance mon ami tous
// les jours ») vaut mieux qu'un parsing rapide et bête. (L'EXÉCUTION garde son
// palier par complexité ci-dessous : un simple rappel reste sur Haiku.)
const PARSE_MODEL = TIER_MEDIUM;
const PARIS_TZ = "Europe/Paris";

// ── Types ────────────────────────────────────────────────────────────────────

// LE TYPE ET LE PRIX VIVENT DANS lib/agent-pricing.ts (module PUR). Ils sont
// réexportés ici pour ne rien casser chez les appelants, mais la source est là-bas :
// la galerie des agents est un composant CLIENT et doit pouvoir CALCULER le prix au
// lieu de le recopier à la main. C'est cette recopie qui faisait mentir les six
// templates payants (10 ou 25 crédits annoncés, 40 débités).
export type { AgentActionType } from "./agent-pricing";
export { estimateCreditsPerRun, runsPerMonth } from "./agent-pricing";
import type { AgentActionType } from "./agent-pricing";
import { estimateCreditsPerRun, runsPerMonth } from "./agent-pricing";

export type AgentRecipientKind = "client" | "employee" | "team" | "me" | "supplier";
export type AgentComplexity = "simple" | "medium" | "complex";

// DÉCLENCHEUR (2 modes, prévus dès 020) : "schedule" = passage à heure fixe
// (schedule.time/days) ; "event" = surveillance d'une condition métier via un
// veilleur nommé (lib/agent-watchers.ts), évalué à chaque tick du cron.
export type AgentTriggerType = "schedule" | "event";
export type AgentTrigger = {
  /** Veilleur du catalogue (chantier_en_retard, devis_non_signe…). */
  watcher: WatcherKey;
  /** Paramètre en jours (délai avant relance / fenêtre d'échéance). */
  params: { days: number };
  /** Cadence de scan en minutes (une condition datée bouge au plus une fois/jour). */
  scanEveryMinutes: number;
};

// ── COMPLEXITÉ → MODÈLE → ESTIMATION (règle user 2026-07-05) ─────────────────
// Tâche hyper simple → Haiku ; moyenne → Sonnet ; complexe → Opus. Le débit
// réel par passage est calculé sur le coût mesuré (agent-executor) ; ces
// estimations servent à ANNONCER honnêtement le prix au recrutement.
export const COMPLEXITY_MODEL: Record<AgentComplexity, string> = {
  simple: TIER_SIMPLE,
  medium: TIER_MEDIUM,
  complex: TIER_COMPLEX,
};
// ── PRIX ANNONCÉ AU RECRUTEMENT ──────────────────────────────────────────────
// estimateCreditsPerRun / runsPerMonth vivent désormais dans lib/agent-pricing.ts
// (module PUR) et sont réexportés en haut de ce fichier. La règle, elle, ne change
// pas : CE QUI EST ANNONCÉ DOIT ÊTRE EXACTEMENT CE QUE lib/agent-executor.ts DÉBITE.
//
// La complexité choisit encore le MODÈLE (COMPLEXITY_MODEL) — c'est son rôle. Elle
// ne choisit plus le PRIX : le prix suit ce que l'agent FAIT, qui est un fait
// observable, pas une classification devinée par le LLM au recrutement.

export type AgentSchedule = {
  /** "HH:MM" heure de Paris. */
  time: string;
  /** Jours ISO 1 (lundi) → 7 (dimanche). Vide = tous les jours. */
  days: number[];
  tz: string;
};

/**
 * CIBLAGE DE L'ÉQUIPE — « mes chefs d'équipe », « mes électriciens ».
 *
 * Sans lui, `recipientKind: "team"` prenait TOUS les employés : l'artisan qui
 * demandait le planning « pour mes chefs d'équipe » l'envoyait à toute la boîte,
 * sans jamais le savoir. Les valeurs sont CANONIQUES (résolues contre le même
 * référentiel que les fiches) : la demande et la donnée se rencontrent forcément.
 */
export type TeamFilter = {
  /** Valeurs canoniques de employees.role (ex : ["chef_equipe"]). */
  role?: string[];
  /** Valeurs canoniques de employees.corps_metier (ex : ["electricite_generale"]). */
  corps_metier?: string[];
};

export type AgentAction = {
  type: AgentActionType;
  recipientKind: AgentRecipientKind;
  /** Nom dicté (« Martin ») — résolu contre le workspace à la création. */
  recipientName: string;
  /** Destinataires résolus : [{ name, email, entity, id }]. */
  recipients: { name: string; email: string; entity: string; id: string }[];
  /** Sous-ensemble visé quand recipientKind = "team" (vide = toute l'équipe). */
  teamFilter?: TeamFilter;
  /** Ce que l'agent doit dire/faire à chaque passage. */
  contentInstruction: string;
  /** Données du workspace à examiner (report) : « devis en attente »… */
  dataFocus: string;
  /** Complexité de la mission → choisit le modèle (Haiku/Sonnet/Opus). */
  complexity: AgentComplexity;
  /** Modèle d'exécution figé au recrutement (whitelisté par l'exécuteur). */
  model: string;
  /** Estimation annoncée : crédits par passage (le débit réel fait foi). */
  estimatedCreditsPerRun: number;
  /**
   * Validation humaine des relances (send_email) :
   *   • "always" = mode BROUILLON (#67) : CHAQUE relance est préparée puis mise en
   *     attente ; rien ne part sans un clic. Posé quand l'artisan dit « prépare
   *     sans envoyer / je valide ».
   *   • "auto" (défaut) = envoi automatique, SAUF une relance devenue SENSIBLE
   *     (ferme, niveau ≥ 3) qui est toujours retenue pour validation (#70).
   */
  approval?: "auto" | "always";
};

export type MissingInfo = {
  entity: string;          // clients | employees
  id: string | null;       // null = fiche introuvable
  name: string;
  field: string;           // email | fiche
};

export type ParsedRule = {
  title: string;
  actionType: AgentActionType;
  recipientKind: AgentRecipientKind;
  recipientName: string;
  time: string;
  days: number[];
  contentInstruction: string;
  /** true = l'utilisateur dit d'envoyer quelque chose mais ne dit pas QUOI. */
  contentMissing: boolean;
  dataFocus: string;
  complexity: AgentComplexity;
  /** schedule (heure fixe) ou event (surveillance d'une condition). */
  triggerType: AgentTriggerType;
  /** Veilleur choisi si triggerType='event' (sinon null). */
  eventWatcher: WatcherKey | null;
  /** Paramètre jours du veilleur (0 = défaut du veilleur). */
  eventDays: number;
  /** Phase 2a.2 : séquence multi-actions (additive — legacy actionType reste la 1re). Absente si mono-action. */
  v2Actions?: ParsedActionStep[];
  /** Phase 2a.2 : conditions chiffrées all/any/not. Absente si aucune condition. */
  v2Conditions?: ConditionGroup;
  /** Phase 3b : destinataires relationnels (le chef du chantier, l'intervenant affecté…). Absent si legacy suffit. */
  v2Recipients?: RecipientResolver[];
  /** Phase 7 (gaté runner) : déclencheur GÉNÉRIQUE sur date (« N jours avant/après … »), quand aucun veilleur nommé ne colle. Absent sinon. */
  relativeDate?: RelativeDateConfig;
  /** false = Biltia ne sait pas CAPTER le déclencheur demandé (agenda, Twitter, votre réveil…). */
  feasible: boolean;
  /** Si feasible=false : ce que Biltia ne sait pas capter, en une phrase pour l'artisan. */
  blockerReason: string;
  /**
   * L'artisan a demandé une SURVEILLANCE (« dès que… ») mais aucun capteur valide
   * n'a pu être retenu. Avant l'incident du 2026-07-14, ce cas basculait EN SILENCE
   * en agent planifié à 09:00 : le « dès que » disparaissait sans que personne ne le
   * dise. Pire, cette dégradation POUSSAIT le modèle à inventer un veilleur (le seul
   * moyen, pour lui, de préserver l'intention). On le remonte désormais.
   */
  eventWithoutSensor: boolean;
  usage?: { model: string; inputTokens: number; outputTokens: number };
};

// ── Heure de Paris ───────────────────────────────────────────────────────────

/** Décalage (ms) entre l'heure locale `tz` et UTC à l'instant `date`. */
function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    p.hour === "24" ? 0 : Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return asUTC - date.getTime();
}

/**
 * Prochain passage dû (instant UTC) pour un planning en heure de Paris.
 * Retourne null si le planning est invalide.
 */
export function computeNextRun(schedule: AgentSchedule, from: Date = new Date()): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(schedule.time ?? "");
  if (!m) return null;
  const hh = Math.min(23, Number(m[1]));
  const mm = Math.min(59, Number(m[2]));
  const days = (schedule.days ?? []).filter((d) => d >= 1 && d <= 7);

  // Date calendaire de Paris « aujourd'hui » (base d'itération).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(from);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const y = Number(p.year);
  const mo = Number(p.month) - 1;
  const d = Number(p.day);

  for (let i = 0; i < 15; i++) {
    // Calendrier pur (Date.UTC normalise les dépassements de mois).
    const cal = new Date(Date.UTC(y, mo, d + i));
    const isoDay = ((cal.getUTCDay() + 6) % 7) + 1; // 1 = lundi
    if (days.length > 0 && !days.includes(isoDay)) continue;

    // Instant UTC de « ce jour-là à HH:MM heure de Paris » (double passe :
    // le décalage été/hiver dépend de l'instant visé, pas de maintenant).
    let guess = Date.UTC(cal.getUTCFullYear(), cal.getUTCMonth(), cal.getUTCDate(), hh, mm) - tzOffsetMs(from, PARIS_TZ);
    guess = Date.UTC(cal.getUTCFullYear(), cal.getUTCMonth(), cal.getUTCDate(), hh, mm) - tzOffsetMs(new Date(guess), PARIS_TZ);

    if (guess > from.getTime() + 30_000) return new Date(guess);
  }
  return null;
}

/** « lundi 7 juillet à 12:00 » — pour les messages du chat. */
export function formatRunDate(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Description lisible du planning (« tous les jours à 12:00 »). */
export function describeSchedule(s: AgentSchedule): string {
  const DAY_NAMES = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const days = (s.days ?? []).filter((d) => d >= 1 && d <= 7);
  const when =
    days.length === 0
      ? "tous les jours"
      : days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))
        ? "du lundi au vendredi"
        : `chaque ${days.map((d) => DAY_NAMES[d]).join(", ")}`;
  return `${when} à ${s.time}`;
}

// ── Parsing (LLM + repli heuristique) ────────────────────────────────────────

const PARSE_TOOL: Anthropic.Tool = {
  name: "parse_rule",
  description: "Transforme l'instruction en règle d'agent structurée.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Libellé court de la mission (max 8 mots)." },
      actions: {
        type: "array",
        description:
          "ADDITIF. Séquence ORDONNÉE d'opérations quand la mission en enchaîne PLUSIEURS (« crée le chantier, prépare la facture d'acompte, crée les tâches ET prépare l'email de confirmation »). La 1re opération DOIT correspondre à action_type. Laisse VIDE (tableau vide) si la mission n'a qu'une seule action — ne découpe JAMAIS artificiellement une action simple.",
        items: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              description:
                "Nom d'opération en snake_case, ex : create_chantier, convert_quote_to_chantier, create_deposit_invoice, create_invoice, create_tasks, create_task, create_email_draft, send_email, send_notification, update_status, generate_report, create_reminder, assign_employee.",
            },
            instruction: { type: "string", description: "Ce que fait cette étape, en clair." },
          },
          required: ["operation", "instruction"],
          additionalProperties: false,
        },
      },
      conditions: {
        type: "object",
        description:
          "ADDITIF. Conditions CHIFFRÉES à remplir pour agir (« facture > 5000 € impayée depuis > 15 jours », « réserve urgente ouverte depuis > 3 jours »). Laisse VIDE (omets ou {}) si aucun seuil chiffré. Champs courants : amount_due, days_overdue, montant, priority, days_open, marge_pct.",
        properties: {
          type: { type: "string", enum: ["all", "any"], description: "all = toutes vraies ; any = au moins une." },
          conditions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string", description: "Champ métier (amount_due, days_overdue, montant, priority…)." },
                operator: {
                  type: "string",
                  enum: ["gt", "gte", "lt", "lte", "eq", "neq", "before", "after", "days_since_gt", "days_until_lt", "contains", "in"],
                },
                value: { type: "string", description: "Valeur de comparaison en texte (\"5000\", \"15\", \"urgente\"…) — les nombres seront convertis à l'évaluation." },
              },
              required: ["field", "operator"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
      recipient_targets: {
        type: "array",
        description:
          "ADDITIF. Destinataires RELATIONNELS liés à la FICHE déclenchante, quand le destinataire dépend de l'objet concerné (« préviens LE CHEF DU CHANTIER », « l'intervenant affecté », « le client lié », « le fournisseur de la commande »). Laisse VIDE si le destinataire est simplement toi / l'équipe / un client nommé (recipient_kind suffit alors).",
        items: {
          type: "string",
          enum: ["related_chantier_manager", "related_task_assignee", "related_intervention_employee", "related_client", "related_supplier", "related_subcontractor", "record_creator", "workspace_owner", "workspace_team"],
        },
      },
      action_type: {
        type: "string",
        enum: ["send_email", "notify", "report", "team_planning", "act"],
        description:
          "send_email = écrire à un client/employé. notify = rappel/alerte push à l'utilisateur lui-même. report = examiner les données du workspace et envoyer la synthèse à l'utilisateur. team_planning = récupérer le planning (agenda) et l'envoyer aux ÉQUIPES. act = AGIR dans le workspace : CRÉER ou METTRE À JOUR une fiche à partir des données existantes (« crée un devis », « crée le chantier », « ajoute une tâche », « prépare une facture d'acompte », « passe le chantier en cours »). L'agent exécute l'opération sur les données réelles puis rend compte de ce qu'il a fait. Choisis act dès que la mission demande de FABRIQUER/MODIFIER quelque chose dans les données (verbe : crée, ajoute, génère, prépare, mets à jour, passe en, rattache), pas seulement d'avertir ou d'écrire un email.",
      },
      recipient_kind: {
        type: "string",
        enum: ["client", "employee", "team", "me", "supplier"],
        description: "Destinataire. client = un client. employee = un employé nommé. team = tous les employés. supplier = un SOUS-TRAITANT / FOURNISSEUR (nommé dans recipient_name). me = l'utilisateur.",
      },
      recipient_name: { type: "string", description: "Nom du client/employé visé. Vide sinon." },
      time: { type: "string", description: "Heure d'exécution « HH:MM » (Paris). Défaut 09:00. « midi » = 12:00." },
      days: {
        type: "array",
        items: { type: "integer" },
        description: "Jours ISO 1=lundi…7=dimanche. VIDE = tous les jours.",
      },
      content_instruction: {
        type: "string",
        description: "Ce que l'agent doit dire/faire à chaque passage, reformulé clairement.",
      },
      content_missing: {
        type: "boolean",
        description:
          "true si l'utilisateur demande d'ENVOYER/ÉCRIRE quelque chose mais ne dit PAS quoi dire (ex : « envoie un message à Alpha tous les jours » → on ne sait pas quel message). false si le contenu est explicite ou clairement déductible (ex : « relance le devis en attente de Dupont », « rappelle-moi de faire mes factures », « vérifie mes impayés »).",
      },
      data_focus: {
        type: "string",
        description: "Pour report : quelles données examiner (« pointages manquants », « devis sans réponse »…). Vide sinon.",
      },
      complexity: {
        type: "string",
        enum: ["simple", "medium", "complex"],
        description:
          "Poids de la mission À CHAQUE passage. simple = un message/rappel bref, une lecture ciblée (« envoie un message à Karim »). medium = examiner une partie des données puis rédiger (« vérifie mes factures impayées et relance »). complex = analyse TRANSVERSALE de l'activité, détection de patterns/anomalies, raisonnement lourd (« analyse toute mon activité et signale ce qui cloche »).",
      },
      trigger_type: {
        type: "string",
        enum: ["schedule", "event"],
        description:
          "schedule = la mission se répète à HEURE FIXE (« tous les jours à midi », « chaque lundi », « le soir »). event = la mission SURVEILLE une CONDITION et se déclenche DÈS QU'une fiche y correspond (« dès qu'un chantier prend du retard », « quand une facture est impayée », « relance les devis non signés », « préviens-moi si un document va expirer »). Indices event : « dès que », « quand », « lorsqu' », « si », « automatiquement » sur un état, ou une condition métier sans heure précise. En cas de doute avec une simple récurrence horaire → schedule.",
      },
      event_watcher: {
        type: "string",
        // DATA-DRIVEN (Phase 4) : l'enum est GÉNÉRÉ depuis le registre (WATCHER_KEYS),
        // plus jamais recopié à la main. Corrige la dérive historique (rappel_echu
        // existait dans le registre mais manquait ici → jamais sélectionnable).
        enum: [...WATCHER_KEYS, ""],
        description:
          buildEventWatcherDescription(),
      },
      event_days: {
        type: "integer",
        description:
          "Paramètre en jours du veilleur si trigger_type=event (0 = défaut). devis_non_signe : jours d'attente avant de relancer (défaut 7). devis_expire_bientot : fenêtre d'alerte AVANT la date de validité (défaut 7). facture_echeance_proche : fenêtre d'alerte AVANT la date d'échéance (défaut 7). facture_impayee : jours de tolérance après l'échéance (défaut 0). echeance_proche : fenêtre d'alerte avant l'échéance (défaut 30). chantier_en_retard : jours de tolérance (défaut 0). chantier_fin_proche : fenêtre d'alerte AVANT la date de fin prévue (défaut 7). chantier_sans_activite : jours sans activité avant l'alerte (défaut 3). chantier_sans_devis : jours de tolérance après le démarrage (défaut 0). conflit_planning : horizon en jours du planning surveillé (défaut 14). intervention_annulee : jours de rattrapage après l'annulation (défaut 3). tache_en_retard : jours de tolérance après l'échéance (défaut 0). tache_terminee : jours de rattrapage après la clôture (défaut 3). equipe_surchargee : EXCEPTION — ce nombre est le SEUIL d'éléments ouverts par personne au-delà duquel alerter (défaut 8). tache_sans_responsable / chantier_sans_responsable : paramètre ignoré (défaut 0). client_inactif : jours sans activité avant de le signaler (défaut 90). pointage_manquant : jours récents examinés (fenêtre sans pointage, défaut 3). heures_a_valider : ancienneté minimale en jours avant de réclamer la validation (défaut 7). heures_incoherentes : EXCEPTION — ce nombre est le SEUIL d'heures/jour au-delà duquel c'est jugé incohérent (défaut 12). chantier_trop_heures : EXCEPTION — ce nombre est le SEUIL d'heures cumulées par chantier au-delà duquel alerter (défaut 200). document_a_regulariser / assurance_expiree / clients_doublons : paramètre ignoré (défaut 0). client_mauvais_payeur : EXCEPTION — ce nombre est le SEUIL de factures échues impayées au-delà duquel signaler le client (défaut 2). sous_traitant_a_probleme : EXCEPTION — ce nombre est le SEUIL de réserves ouvertes au-delà duquel signaler le sous-traitant (défaut 2). sous_traitant_sans_assurance / documents_a_classer / chantier_sans_photo / intervention_sans_responsable / intervention_sans_date : paramètre ignoré (défaut 0). intervention_en_retard : jours de tolérance après la date prévue (défaut 0). commande_en_retard : jours de tolérance après la date de livraison prévue (défaut 0). facture_fournisseur_a_payer : jours de tolérance après l'échéance de paiement (défaut 0). achat_non_affecte / chantier_sans_budget : paramètre ignoré (défaut 0). chantier_hors_budget : EXCEPTION — ce nombre est un POURCENTAGE de dépassement toléré (ex : « au-delà de 10 % » → 10 ; défaut 0 = dès le premier euro). Mets 0 si l'utilisateur ne précise rien.",
      },
      // ── LE DROIT DE DIRE NON (incident 2026-07-14) ─────────────────────────
      // Sans ce champ, le modèle n'avait AUCUN moyen d'exprimer « je ne sais pas
      // faire ça » : sommé de choisir un veilleur, il en inventait un. « Préviens-moi
      // dès qu'un événement est ajouté à mon agenda » est devenu un agent qui
      // surveillait les nouvelles fiches CLIENT. Un agent qui ment sur ce qu'il
      // surveille est pire qu'un agent absent.
      feasible: {
        type: "boolean",
        description:
          "⚠ NE JUGE QUE LE DÉCLENCHEUR — ce que Biltia doit CAPTER pour se réveiller. Jamais l'ACTION, jamais la destination. false si Biltia NE PEUT PAS détecter le déclencheur demandé avec les veilleurs listés ci-dessus. Mets false SANS HÉSITER quand la mission suppose de CAPTER quelque chose qui N'EST PAS dans le Workspace Biltia : l'agenda Google/Outlook, la boîte mail entrante, un réseau social, un SMS ou un appel reçu, la météo, la banque, le logiciel de compta, ou l'état de l'utilisateur lui-même (« quand je me réveille », « quand j'arrive sur le chantier »). Il vaut MILLE FOIS mieux répondre false que de rapprocher la demande d'un veilleur qui surveille autre chose. Si feasible=false, remplis blocker_reason et laisse event_watcher vide. MAIS : une DESTINATION hors workspace reste jugée sur l'ACTION, pas sur le déclencheur. Biltia sait envoyer un email en ton nom ; il ne sait PAS déposer dans un stockage externe (Google Drive, OneDrive : ces connecteurs n'existent pas). « À chaque devis enregistré, dépose-le dans mon Drive » → feasible=FALSE, blocker_reason : Biltia ne dépose rien dans un stockage externe ; les devis sont déjà conservés dans le workspace et leur PDF est téléchargeable.",
      },
      blocker_reason: {
        type: "string",
        description:
          "Si feasible=false : ce que Biltia ne sait pas capter, en UNE phrase, dans les mots de l'artisan, sans jargon et sans promettre de date (« je ne vois pas ce que vous publiez sur Twitter », « rien ne me prévient quand un événement est ajouté à votre agenda »). Vide si feasible=true.",
      },
    },
    required: ["title", "action_type", "recipient_kind", "recipient_name", "time", "days", "content_instruction", "content_missing", "data_focus", "complexity", "trigger_type", "event_watcher", "event_days", "feasible", "blocker_reason"],
    additionalProperties: false,
  },
};

const PARSE_SYSTEM = `Tu es le RECRUTEUR d'agents de Biltia, l'OS opérationnel du BTP. L'utilisateur (artisan/chef d'entreprise) dicte une MISSION PERMANENTE en langage courant — une tâche que Biltia devra exécuter seul, à répétition, en temps et en heure. Tu la transformes en règle structurée. Tu ne résous rien : tu structures.

COMPRENDS LE CONCEPT, PAS LE MOT (ESSENTIEL). L'artisan parle avec SES mots, jamais le vocabulaire du logiciel. Ne te fige JAMAIS sur la formulation exacte : traduis l'INTENTION vers ce qui EXISTE réellement dans Biltia (les entités et les veilleurs ci-dessous), en raisonnant par familles de sens.
- Personnes : salarié = ouvrier = compagnon = collaborateur = « mon gars » / « les gars » = « mon équipe » → les EMPLOYÉS. « le client » = « le particulier » = « le proprio » = « le donneur d'ordre » → les CLIENTS.
- Travail / objet : « son travail » = « sa tâche » = « son boulot » = « sa mission » = « ce qu'il fait » = « son intervention » → une INTERVENTION (ou une tâche) assignée. « affaire » = « projet » = « le chantier » → les CHANTIERS. « le devis » = « l'offre » = « la propale » = « le chiffrage » → les DEVIS. « la facture » = « la note » → les FACTURES. « le matériel » = « les fournitures » = « le stock » → les MATÉRIAUX.
- États : « fini » = « bouclé » = « livré » = « clôturé » = « ça y est c'est fait » → TERMINÉ. « validé » = « signé » = « accepté » = « OK client » → ACCEPTÉ. « payé » = « réglé » = « encaissé » = « viré » → PAYÉE. « en retard » = « à la bourre » = « dépassé » → RETARD.
TEST DE VÉRITÉ (le plus important de toute cette consigne). Traduire le VOCABULAIRE, oui. Changer d'OBJET, jamais. Le veilleur que tu choisis doit surveiller LE MÊME OBJET et LE MÊME ÉVÉNEMENT que la demande. Avant de rendre un event_watcher, relis la demande et pose-toi la question : « la fiche qui va déclencher cet agent, est-ce bien CELLE dont l'artisan parle ? »
- OUI → « quand un salarié finit son travail / sa tâche sur un chantier, préviens-moi » = une INTERVENTION assignée qui passe en TERMINÉ. Même objet, autres mots → event_watcher=visite_terminee. C'est exactement le travail attendu de toi.
- NON → « préviens-moi dès qu'un ÉVÉNEMENT est ajouté à mon AGENDA » n'est PAS « une fiche CLIENT est créée ». Ce sont deux objets différents. Le fait que les deux soient « quelque chose qui vient d'être ajouté » ne les rend pas équivalents.

TU AS LE DROIT DE DIRE NON, et c'est souvent la bonne réponse. Aucun veilleur ne lit ton agenda Google/Outlook, ta boîte mail entrante, tes réseaux sociaux, tes SMS, tes appels, la météo, ta banque ou ton logiciel de compta : les veilleurs regardent UNIQUEMENT les fiches du Workspace Biltia (chantiers, devis, factures, clients, interventions, tâches, employés, pointages, matériaux, documents, fournisseurs, commandes). Si la mission suppose de CAPTER autre chose, mets feasible=false + blocker_reason, et laisse event_watcher vide. NE RAPPROCHE JAMAIS la demande d'un veilleur « à peu près » : un agent qui surveille autre chose que ce qu'on lui a demandé est un mensonge, et l'artisan croira son entreprise couverte alors qu'elle ne l'est pas. Un refus honnête est TOUJOURS préférable.

DEUX QUESTIONS DIFFÉRENTES, ET ON LES CONFOND SANS ARRÊT — c'est la faute la plus coûteuse de tout ce fichier :
  1. CE QUE BILTIA SAIT CAPTER (le déclencheur). Uniquement le Workspace. C'est là, et seulement là, que porte feasible.
  2. CE QUE BILTIA SAIT FAIRE (l'action). Il sait AGIR DEHORS, mais SEULEMENT par email/SMS et dans son propre workspace.
LE STOCKAGE EXTERNE N'EXISTE PAS : ni Google Drive, ni OneDrive, ni Dropbox. « À chaque devis enregistré, dépose-le dans mon Drive » → feasible=FALSE. Le déclencheur est captable, mais l'ACTION est impossible : Biltia n'a aucun classeur externe où déposer.
Dis-le sans détour dans blocker_reason, et donne l'alternative vraie : les devis et factures sont DÉJÀ conservés dans le workspace, leur PDF se télécharge à tout moment, et il part en pièce jointe au client à l'envoi.

REPÈRES :
- « relance/écris/envoie un mail à [client X] » → send_email, recipient_kind=client.
- « rappelle-moi / préviens-moi / alerte-moi » → notify (notification à l'utilisateur), recipient_kind=me.
- « vérifie / contrôle / surveille [mes données] » → report (examen du workspace + synthèse à l'utilisateur), recipient_kind=me.
- « crée / ajoute / génère / prépare / mets à jour / passe en / rattache [une fiche] » → act (l'agent FABRIQUE ou MODIFIE la donnée dans le workspace, puis rend compte), recipient_kind=me. Ex : « crée un devis brouillon », « crée le chantier », « ajoute une tâche de rappel », « prépare la facture d'acompte », « passe le chantier en cours ». act n'est PAS un email et n'est PAS une simple alerte : c'est une VRAIE écriture dans les données.
- « mes employés / l'équipe / les gars » → recipient_kind=team.
- « mon sous-traitant / mon fournisseur / le ST / l'artisan à qui je sous-traite / mon plombier sous-traitant [Nom] » → recipient_kind=supplier (et recipient_name = son nom s'il est cité). Ex : « prépare un message pour le sous-traitant Dupont », « écris au fournisseur Point P ».
- « à midi » = 12:00, « le matin » = 09:00, « le soir » = 18:00. Heure de Paris. Aucune heure dictée → 09:00.
- « tous les jours » / rien de précisé → days VIDE. « chaque lundi » → [1]. « en semaine » → [1,2,3,4,5].

DÉCLENCHEUR — HEURE FIXE ou ÉVÉNEMENT ? (décisif)
- trigger_type="schedule" quand la mission tourne à HEURE/JOUR FIXE : « tous les jours à midi », « chaque lundi matin », « le soir à 18h », « chaque fin de mois ». Remplis alors time/days ; laisse event_watcher vide et event_days=0.
- trigger_type="event" quand la mission SURVEILLE une CONDITION et se déclenche DÈS QU'une fiche y correspond, sans horaire : choisis event_watcher :
  • « dès qu'un chantier prend du retard », « préviens-moi quand un chantier dépasse la date de fin », « quels chantiers sont en retard » → chantier_en_retard.
  • « préviens-moi quand un chantier arrive bientôt à son terme », « alerte-moi avant la date de fin d'un chantier », « les chantiers qui doivent se terminer dans quelques jours » → chantier_fin_proche (AVANT l'échéance ; event_days = nb de jours avant, défaut 7).
  • « préviens-moi si un chantier dépasse son budget », « alerte-moi quand un chantier n'est plus rentable », « surveille la marge des chantiers » → chantier_hors_budget (event_days = % de dépassement toléré si précisé, ex « au-delà de 10 % » → 10, sinon 0).
  • « préviens-moi si un chantier n'avance pas depuis 3 jours », « quand un chantier stagne / est au point mort / ne bouge plus » → chantier_sans_activite (event_days = nb de jours sans activité, ex « 3 jours » → 3, sinon 0).
  • « préviens-moi si un chantier démarre sans devis signé », « alerte-moi quand un chantier commence sans devis accepté » → chantier_sans_devis.
  • « demande un avis au client quand un chantier est terminé », « quand un chantier se termine, remercie le client et propose le solde », « envoie une demande de recommandation à la fin d'un chantier » → chantier_termine.
  • « alerte-moi si une demande client urgente reste sans réponse », « préviens-moi dès qu'un SAV / dépannage urgent traîne », « signale les interventions urgentes en attente » → demande_urgente (l'IA lira la description de chaque demande pour juger l'urgence).
  • « relance les devis non signés », « suis les devis restés sans réponse », « occupe-toi des devis en attente » → devis_non_signe (event_days = délai d'attente avant relance si précisé, sinon 0).
  • « confirme/remercie mes clients quand ils acceptent un devis », « envoie un mot dès qu'un devis est accepté / signé », « préviens le client des prochaines étapes après acceptation » → devis_accepte.
  • « relance les devis qui vont bientôt expirer », « préviens-moi quand un devis approche de sa date de validité », « relance avant que le devis ne soit plus valable », « les devis proches de l'expiration » → devis_expire_bientot (event_days = nb de jours avant l'expiration, défaut 7).
  • « préviens-moi quand une facture va bientôt être due », « rappelle au client de payer avant l'échéance », « les factures qui arrivent à échéance dans quelques jours » → facture_echeance_proche (AVANT l'échéance ; event_days = nb de jours avant, défaut 7).
  • « relance mes impayés », « occupe-toi des factures impayées », « quand une facture n'est pas payée à l'échéance » → facture_impayee (APRÈS l'échéance).
  • « remercie le client quand il a payé », « envoie un remerciement dès qu'une facture est réglée » → facture_payee.
  • « préviens-moi quand un document / une attestation / une assurance / un contrat va expirer », « alerte-moi avant une échéance d'entretien » → echeance_proche (event_days = combien de jours avant si précisé, sinon 0).
  • « préviens-moi quand un matériau passe sous son seuil », « alerte-moi quand je suis bientôt en rupture », « surveille mon stock », « dis-moi quand je manque de placo / d'un matériau » → stock_bas.
  • « signale les achats / dépenses non affectés », « les factures fournisseurs non classées », « quelles dépenses ne sont rattachées à aucun chantier » → achat_non_affecte.
  • « ce que je dois à mes fournisseurs », « les factures fournisseurs à régler / en retard de paiement », « préviens-moi de ce qu'il faut payer aux fournisseurs » → facture_fournisseur_a_payer (ce que NOUS devons ; distinct de facture_impayee = ce que les clients nous doivent).
  • « les chantiers sans budget », « détecte les chantiers dont la marge n'est pas renseignée / pas chiffrés » → chantier_sans_budget (budget ABSENT ; distinct de chantier_hors_budget = budget existant dépassé).
  • « préviens-moi quand un nouveau prospect remplit mon formulaire », « alerte-moi dès qu'un lead arrive », « quand quelqu'un envoie une demande de devis en ligne » → nouveau_lead.
  • « à chaque nouveau client », « quand un client est créé / ajouté », « dès que j'enregistre un nouveau client » → nouveau_client.
  • « à chaque nouveau chantier », « quand j'ajoute / je crée un chantier », « dès qu'un chantier est ouvert » → nouveau_chantier.
  • « relance mes clients inactifs », « préviens-moi des clients qu'on n'a pas vus depuis X mois », « les clients qui dorment / qu'on a perdus de vue », « recontacte ceux qui n'ont rien commandé depuis longtemps » → client_inactif (event_days = jours sans activité, ex « 6 mois » → 180, défaut 90 ; « relance » → send_email au client, « préviens-moi » → notify).
  • « génère un compte-rendu après chaque visite chantier », « quand une intervention est terminée, fais le compte-rendu », « je veux mes comptes-rendus automatiquement après les visites », ET AUSSI « quand un salarié / ouvrier finit son travail / sa tâche / son intervention sur un chantier », « quand un gars a bouclé son chantier / fini son boulot » → visite_terminee (= une intervention assignée passe en TERMINÉ). Avec « préviens-moi » → notify (digest des travaux finis) ; avec « fais le compte-rendu » → Biltia rédige le compte-rendu. C'est un event, PAS un planning.
  • « rappelle au client son RDV la veille », « préviens le client avant chaque intervention », « envoie un rappel de rendez-vous automatiquement » → rdv_demain (event_days = nb de jours avant le RDV, 1 = la veille).
  Pour un event, time/days sont ignorés (mets time="09:00", days=[]).
- action_type pour un event : « préviens-moi / alerte-moi / je veux savoir » → notify. « relance / relance les clients / envoie-leur » → send_email (Biltia écrira au client concerné de chaque fiche). « crée / ajoute / génère / prépare / mets à jour / passe en [une fiche] » → act (Biltia écrit dans le workspace pour CHAQUE fiche déclenchante — ex : « quand un devis est accepté, crée le chantier », « à chaque nouveau client, crée un devis brouillon », « quand un chantier est créé, ajoute les tâches de démarrage »). Pour visite_terminee, laisse action_type=notify (Biltia sait qu'il doit générer le compte-rendu). content_missing reste false pour un event (le contenu se déduit de la fiche déclenchante).

PLANNING AUX ÉQUIPES (cas à part, PLANIFIÉ) : « je veux que mes équipes reçoivent leur planning sans que j'y pense », « tous les vendredis à 18h envoie le planning de la semaine aux gars », « transmets le planning à l'équipe chaque lundi » → trigger_type=schedule (c'est récurrent à heure fixe), action_type=team_planning, recipient_kind=team. Biltia RÉCUPÈRE le planning existant (agenda Google connecté et/ou interventions du workspace) et le TRANSMET à l'équipe — il ne l'invente pas. Remplis time/days selon la récurrence dictée (« vendredi 18h » → time="18:00", days=[5]).

CONTEXTE (comme un employé, ne rien inventer) : si la mission dit d'ENVOYER un message/mail mais ne dit PAS quoi dire, mets content_missing=true — Biltia demandera « quel message ? » plutôt que d'inventer. Si le contenu est explicite ou déductible d'une donnée du workspace (« relance le devis en attente », « rappelle-moi de faire mes factures », « vérifie mes impayés et fais le point »), content_missing=false.

ACTIONS MULTIPLES (additif, nouveau) : si la mission enchaîne PLUSIEURS opérations (« dès qu'un devis est accepté, crée le chantier, prépare la facture d'acompte, crée les premières tâches et prépare un email »), remplis \`actions\` avec la séquence ORDONNÉE (operation en snake_case + instruction). La PREMIÈRE opération doit correspondre à action_type. Si une seule action, laisse \`actions\` vide. Ne découpe pas artificiellement une action simple en plusieurs.

CONDITIONS CHIFFRÉES (additif, nouveau) : si la mission pose des SEUILS (« si une facture de plus de 5 000 € est impayée depuis plus de 15 jours », « quand une réserve urgente reste ouverte plus de 3 jours »), remplis \`conditions\` = { type:"all", conditions:[{field, operator, value}] }. Sinon laisse vide.

DESTINATAIRES RELATIONNELS (additif, nouveau) : si le destinataire DÉPEND de la fiche déclenchante (« préviens le chef DU chantier », « l'intervenant affecté à l'intervention », « le client lié à la facture », « le fournisseur de la commande »), liste les types dans \`recipient_targets\`. Sinon (toi, l'équipe, un client nommé), laisse \`recipient_targets\` vide et remplis \`recipient_kind\` comme d'habitude.

Ces trois champs (actions, conditions, recipient_targets) sont STRICTEMENT ADDITIONNELS : action_type, event_watcher, recipient_kind, trigger_type restent remplis EXACTEMENT comme d'habitude (ils restent la source exécutée aujourd'hui).

Réponds UNIQUEMENT en appelant l'outil parse_rule.`;

// ─────────────────────────────────────────────────────────────────────────────
// DÉCLENCHEUR SUR DATE (relative_date) — capacité AVANCÉE, GATÉE sur AGENT_V2_RUNNER.
// Une règle relative_date n'est PAS représentable par les colonnes legacy : elle
// n'existe que dans le spec V2 et n'est exécutée que par le runner V2. On ne
// l'expose donc au parseur (champ d'outil + consigne) QUE lorsque le runner est
// armé — sinon on émettrait des agents que le chemin legacy ne saurait pas faire
// tourner (« veilleur inconnu »). Runner OFF → tool/prompt STRICTEMENT identiques.
// ─────────────────────────────────────────────────────────────────────────────

/** Paires (entité → champ_date) autorisées, en clair pour la consigne LLM. */
const RELATIVE_DATE_PAIRS = Object.entries(RELATIVE_DATE_FIELDS)
  .map(([e, fields]) => `${e} (${fields.join(", ")})`)
  .join(" ; ");

const RELATIVE_DATE_TOOL_FIELD = {
  type: "object" as const,
  description:
    "AVANCÉ & OPTIONNEL. Déclencheur GÉNÉRIQUE « N jours AVANT ou APRÈS une DATE précise d'une fiche », À N'UTILISER QUE si AUCUN veilleur nommé (event_watcher) ne convient. PRÉFÈRE TOUJOURS un veilleur nommé s'il colle (devis_expire_bientot, facture_echeance_proche, chantier_fin_proche, rdv_demain, echeance_proche…). Laisse VIDE (omets) dès qu'un veilleur nommé fait l'affaire. Uniquement des paires (entité, champ) AUTORISÉES — toute autre est ignorée : " +
    RELATIVE_DATE_PAIRS +
    ".",
  properties: {
    entity_type: { type: "string" as const, description: "Entité surveillée (ex : factures, devis, chantiers). DOIT figurer dans les paires autorisées." },
    date_field: { type: "string" as const, description: "Champ date de cette entité (ex : date_echeance, date_validite, date_fin_prevue). DOIT figurer dans les paires autorisées." },
    offset_value: { type: "integer" as const, description: "Nombre de jours (0–365). Ex : « 3 jours avant » → 3." },
    offset_unit: { type: "string" as const, enum: ["days", "weeks", "months", "hours", "minutes"], description: "Unité de l'écart (défaut days)." },
    direction: { type: "string" as const, enum: ["before", "after"], description: "before = la date APPROCHE (rappel avant échéance) ; after = la date est PASSÉE (relance après)." },
  },
  required: ["entity_type", "date_field", "offset_value", "direction"],
  additionalProperties: false,
};

const RELATIVE_DATE_SYSTEM_ADDENDUM = `

DÉCLENCHEUR SUR DATE (générique, avancé — dernier recours) : si la mission vise « N jours AVANT ou APRÈS une DATE précise d'une fiche » (ex : « X jours avant la date de fin d'un contrat », « rappelle le client 2 jours avant son entretien », « relance 5 jours après la date de livraison prévue ») ET qu'AUCUN veilleur nommé ne colle vraiment, remplis \`relative_date\` { entity_type, date_field, offset_value, offset_unit:"days", direction }. PRÉFÈRE TOUJOURS un veilleur nommé quand il existe (devis_expire_bientot, facture_echeance_proche, chantier_fin_proche, rdv_demain, echeance_proche…) : dans ce cas laisse \`relative_date\` VIDE. Paires (entité, champ) AUTORISÉES uniquement : ${RELATIVE_DATE_PAIRS}. Une paire hors liste est ignorée. Pour un relative_date, trigger_type="event", event_watcher="", et le destinataire suit les règles habituelles (recipient_targets=related_client pour relancer le client de la fiche).`;

/** Outil de parsing : ajoute le champ relative_date UNIQUEMENT si le runner V2 est armé (sinon identique). */
function buildParseTool(withRelativeDate: boolean): Anthropic.Tool {
  if (!withRelativeDate) return PARSE_TOOL;
  return {
    ...PARSE_TOOL,
    input_schema: {
      ...PARSE_TOOL.input_schema,
      properties: {
        ...(PARSE_TOOL.input_schema.properties as Record<string, unknown>),
        relative_date: RELATIVE_DATE_TOOL_FIELD,
      },
    },
  };
}

/** Système de parsing : ajoute la consigne relative_date UNIQUEMENT si le runner V2 est armé. */
function buildParseSystem(withRelativeDate: boolean): string {
  return withRelativeDate ? PARSE_SYSTEM + RELATIVE_DATE_SYSTEM_ADDENDUM : PARSE_SYSTEM;
}

/** Repli heuristique pur — jamais d'exception, toujours une règle plausible. */
export function parseInstructionHeuristic(instruction: string): ParsedRule {
  const text = instruction
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  // Heure.
  let time = "09:00";
  const hm = /\ba (\d{1,2})\s*h\s*(\d{2})?\b/.exec(text);
  if (text.includes("midi")) time = "12:00";
  else if (hm) time = `${String(Math.min(23, Number(hm[1]))).padStart(2, "0")}:${hm[2] ?? "00"}`;
  else if (text.includes("le soir") || text.includes("chaque soir") || text.includes("tous les soirs")) time = "18:00";

  // Jours.
  const DAY_KWS: [string, number][] = [
    ["lundi", 1], ["mardi", 2], ["mercredi", 3], ["jeudi", 4],
    ["vendredi", 5], ["samedi", 6], ["dimanche", 7],
  ];
  let days: number[] = [];
  for (const [kw, n] of DAY_KWS) if (text.includes(kw)) days.push(n);
  if (text.includes("en semaine") || text.includes("jours ouvres")) days = [1, 2, 3, 4, 5];

  // Action + destinataire. Un verbe de CRÉATION (« crée/ajoute/génère/prépare/
  // mets à jour ») porte sur les DONNÉES → act, prioritaire sur notify.
  const wantsAct =
    /\b(cree|creer|creez|ajoute|ajouter|genere|generer|prepare|preparer|redige un devis|mets? a jour|met a jour|passe (le|la|les|en)|rattache|cree-moi|fais-moi (un|une|le|la))\b/.test(text);
  let actionType: AgentActionType = "notify";
  let recipientKind: AgentRecipientKind = "me";
  // « prépare/rédige un message/mail pour X » = COMPOSER un message (send_email),
  // PAS créer une fiche (act) — même si « prépare » est aussi un verbe de création.
  const composeMessage = /(prepare|redige|ecris)\s+(moi\s+)?(un |une |le |la |mon |ma )?(message|mail|email|e-mail|courrier|mot|sms|relance|reponse)/.test(text);
  if (composeMessage || /(relance|ecris a|ecris au|ecrire a|envoie (un )?(mail|email|message) a|contacte)/.test(text)) {
    actionType = "send_email";
    recipientKind = /(sous.?traitant|soustraitant|fournisseur)/.test(text)
      ? "supplier"
      : /employe|equipe|salarie|ouvrier|compagnon|collaborateur|chef de chantier|les gars|mes gars/.test(text)
        ? "team"
        : "client";
  } else if (wantsAct) {
    actionType = "act";
    recipientKind = "me";
  } else if (/(verifie|controle|surveille|examine)/.test(text)) {
    actionType = "report";
  }
  // Planning aux équipes (récurrent, planifié) : récupère l'agenda et le transmet.
  if (/planning/.test(text) && /(equipe|equipes|gars|salarie|ouvrier|team|compagnon|les gars)/.test(text)) {
    actionType = "team_planning";
    recipientKind = "team";
  }

  const nameMatch = /(?:client(?:e)?|fournisseur|sous.?traitant|employe(?:e)?)\s+([a-z][a-z' -]{1,40}?)(?=\s+(?:tous|chaque|a \d|le \d|du lundi|en semaine|$)|[,.!]|$)/.exec(text);

  // « envoie un message à X » sans dire QUOI → contenu manquant. Conservateur :
  // dès qu'un indice de contenu est présent (pour, dis-lui, relance, :…), false.
  const contentMissing =
    actionType !== "report" &&
    actionType !== "act" &&
    /(envoi|ecris|message|mail|email)/.test(text) &&
    !/(pour |dis|dire|relance|que |:|disant|rappelle-moi de|previe|signal|demande)/.test(text);

  // ── ÉVÉNEMENT (déclencheur) : condition métier sans horaire ────────────────
  let triggerType: AgentTriggerType = "schedule";
  let eventWatcher: WatcherKey | null = null;
  // « Nouveau X créé » AVANT le reste (« nouveau chantier » ne doit pas tomber
  // dans la chaîne chantier_en_retard/sans_devis).
  if (/(nouveau client|nouveaux clients|nouveau prospect enregistre)/.test(text) || (/client/.test(text) && /(cree|ajoute|enregistre|nouveau)/.test(text) && !/chantier/.test(text))) {
    eventWatcher = "nouveau_client";
  } else if (/(nouveau chantier|nouveaux chantiers)/.test(text) || (/chantier/.test(text) && /(cree|ajoute|ouvert|nouveau)/.test(text) && !/retard|budget|termine|fini|accepte/.test(text))) {
    eventWatcher = "nouveau_chantier";
  }
  // Client inactif (« qu'on n'a pas vus depuis longtemps ») — mots-clés propres.
  else if (/client/.test(text) && /(inactif|inactifs|inactive|inactivite|pas vu|plus vu|pas revu|dorment|qui dort|perdu de vue|perdus de vue|plus de nouvelles|pas eu de nouvelles|pas command)/.test(text)) {
    eventWatcher = "client_inactif";
  } else if (/client/.test(text) && /(doublon|dedoublonn|en double|duplicat|deux fois le meme|meme client (deux|plusieurs) fois)/.test(text)) {
    eventWatcher = "clients_doublons";
  } else if (
    /(mauvais payeur|mauvais.?payeurs)/.test(text) ||
    (/client/.test(text) && /(paie|paye|paient|payent).{0,12}(mal|lentement|en retard|jamais|tard)/.test(text))
  ) {
    eventWatcher = "client_mauvais_payeur";
  }
  // Conflit de planning / annulation AVANT les branches chantier (mots-clés propres).
  else if (/(conflit de planning|conflit.{0,10}planning|chevauch|se superpos|double.?reserv|double.?book|(deux|2) (chantiers|rdv|rendez|interventions|endroits))/.test(text)) {
    eventWatcher = "conflit_planning";
  } else if (/(annul|décommand|decommand)/.test(text) && /(rdv|rendez|intervention|visite|chantier|client|planning)/.test(text)) {
    eventWatcher = "intervention_annulee";
  }
  // Équipe & tâches : surcharge / tâche terminée / sans responsable / en retard,
  // + chantier sans chef — AVANT les branches chantier génériques.
  else if (
    // « déborde » sert aussi au chantier (dépassement) → l'exiger avec un contexte PERSONNE.
    /(surcharg|surmene|croule sous|trop charge|trop de (travail|taches|boulot))/.test(text) ||
    (/(deborde|debord)/.test(text) && /(gars|personne|quelqu|employe|salarie|ouvrier|compagnon|equipe|intervenant|collaborateur|monde|charge)/.test(text))
  ) {
    eventWatcher = "equipe_surchargee";
  } else if (/(tache|tâche)/.test(text) && /(termine|terminee|finie|bouclee|boucle|cochee|faite|achevee)/.test(text)) {
    eventWatcher = "tache_terminee";
  } else if (/(tache|tâche)/.test(text) && /(sans responsable|sans intervenant|non assignee|pas assignee|personne (ne|n'a)|sans personne|orpheline)/.test(text)) {
    eventWatcher = "tache_sans_responsable";
  } else if (/(tache|tâche)/.test(text) && /(retard|en retard|pas commencee|non commencee|traine|traîne|echue|depasse|pas faite|oubliee|en attente depuis)/.test(text)) {
    eventWatcher = "tache_en_retard";
  } else if (/chantier/.test(text) && /(sans responsable|sans chef|pas de chef|pas de responsable|aucun chef)/.test(text)) {
    eventWatcher = "chantier_sans_responsable";
  }
  // Pointage & heures — CHAQUE branche exige un contexte pointage/heures pour ne
  // JAMAIS capter une règle existante (« relance facture sous 48 heures »).
  // chantier_trop_heures AVANT le cluster chantier (sinon « dépasse X heures » → retard).
  else if (/chantier/.test(text) && /heure/.test(text) && /(trop|depasse|consomme|explose|au.?dessus|gourmand|excede|derape)/.test(text)) {
    eventWatcher = "chantier_trop_heures";
  } else if (
    (/(pointage|pointe|pointer|pointent)/.test(text) && /(manqu|pas (encore )?pointe|non pointe|n'?a pas pointe|na pas pointe|oubli|sans pointage|pas fait ses heures)/.test(text)) ||
    /heures? non rempli/.test(text) ||
    /journee sans pointage/.test(text) ||
    /(pas fait ses heures|pas fait leurs heures)/.test(text)
  ) {
    eventWatcher = "pointage_manquant";
  } else if (/(heure|pointage)/.test(text) && /(a valider|non valide|pas valide|non validee|validation des heures|valider les heures)/.test(text)) {
    eventWatcher = "heures_a_valider";
  } else if (/(heure|pointage|pointe)/.test(text) && /(incoherent|anormal|aberrant|bizarre|suspect|faux pointage|erreur de (saisie|pointage)|plus de \d+ ?h)/.test(text)) {
    eventWatcher = "heures_incoherentes";
  }
  // Chantier : lever l'ambiguïté « dépasse le budget » vs « dépasse la date » —
  // budget/marge et stagnation AVANT le retard générique. Budget ABSENT (« sans
  // budget / non renseigné ») AVANT budget dépassé (les deux contiennent « budget »).
  else if (
    /chantier/.test(text) &&
    (/(sans budget|pas de budget|budget manquant|budget vide|sans marge|pas chiffre|non chiffre|budget a renseigner)/.test(text) ||
      (/(budget|marge)/.test(text) && /(non renseigne|pas renseigne|a renseigner|manquant|vide|non chiffre|pas chiffre)/.test(text)))
  ) {
    eventWatcher = "chantier_sans_budget";
  } else if (/chantier/.test(text) && /(budget|marge|rentab|deficit)/.test(text)) {
    eventWatcher = "chantier_hors_budget";
  } else if (/chantier/.test(text) && /(avance pas|n'avance|navance|stagne|au point mort|pas bouge|ne bouge|sans activite|sans avancement|a l'arret|a l'arrêt|arrete)/.test(text)) {
    eventWatcher = "chantier_sans_activite";
  } else if (/chantier/.test(text) && /(sans devis|pas de devis|devis (signe|accepte)|demarre sans|commence sans)/.test(text)) {
    eventWatcher = "chantier_sans_devis";
  } else if (/chantier/.test(text) && /(termine|fini|livre|cloture)/.test(text) && /(non facture|pas facture|sans facture|a facturer|pas encore facture|reste a facturer)/.test(text)) {
    eventWatcher = "chantier_termine_non_facture";
  } else if (
    // Chantier dont la fin APPROCHE (avant l'échéance) → distinct du retard (après).
    /chantier/.test(text) &&
    /(bientot|avant.{0,15}(la )?(date de )?fin|approche.{0,12}(la )?fin|proche.{0,12}(fin|echeance|terme)|arrive.{0,12}(a|au) (son )?(terme|bout|echeance)|se termine bientot|dans quelques jours)/.test(text) &&
    !/(retard|en retard|depasse|deborde|depuis)/.test(text)
  ) {
    eventWatcher = "chantier_fin_proche";
  } else if (/chantier/.test(text) && /(retard|en retard|depasse|deborde|date de fin|delai|deadline)/.test(text)) {
    eventWatcher = "chantier_en_retard";
  } else if (/(urgent|urgence|priorite|en catastrophe)/.test(text) && /(demande|intervention|client|sav|depannage|appel|ticket|message|dossier)/.test(text)) {
    eventWatcher = "demande_urgente";
  }
  // SAV / interventions & commandes — après demande_urgente (urgent = demande_urgente).
  else if (/(intervention|sav|depannage)/.test(text) && /(sans responsable|sans intervenant|sans technicien|pas assigne|non assigne|non affecte|pas affecte)/.test(text)) {
    eventWatcher = "intervention_sans_responsable";
  } else if (/(intervention|sav|depannage)/.test(text) && /(sans date|pas de date|non planifie|pas planifie|a planifier|sans creneau|pas de creneau|date non prevue)/.test(text)) {
    eventWatcher = "intervention_sans_date";
  } else if (/(intervention|sav|depannage)/.test(text) && /(en retard|retard|depasse|non traite|pas traite|traine|en souffrance|oublie)/.test(text)) {
    eventWatcher = "intervention_en_retard";
  } else if (/(commande|livraison|approvisionnement|appro|bon de commande)/.test(text) && /(en retard|retard|pas livre|non livre|tarde|bloque|pas arrive|non arrive|en attente|attend)/.test(text)) {
    eventWatcher = "commande_en_retard";
  }
  // Achats/dépenses FOURNISSEUR — AVANT le cluster facture (client) : chaque branche
  // EXIGE le mot fournisseur/achat/dépense, absent des règles facture client → 0 régression.
  else if (
    /(achat|depense|facture.{0,12}fournisseur|facture d.?achat)/.test(text) &&
    /(non affecte|pas affecte|sans chantier|aucun chantier|non rattache|pas rattache|non classe|pas classe|a classer|a affecter|a rattacher|non ventile|sans rattachement)/.test(text)
  ) {
    eventWatcher = "achat_non_affecte";
  } else if (
    (/(facture.{0,12}fournisseur|facture d.?achat|depense|achats? fournisseur)/.test(text) &&
      /(a payer|a regler|regler|impaye|non paye|pas paye|en retard|echeance|paiement|dois payer|reste a payer|a solder)/.test(text)) ||
    (/(payer|regler|solder|regl|dois|doit|redevable|du a|due a)/.test(text) && /(fournisseur|sous.?traitant)/.test(text))
  ) {
    eventWatcher = "facture_fournisseur_a_payer";
  } else if (/facture/.test(text) && /(brouillon|pas envoye|non envoye|jamais envoye|non finalise|pas finalise|pas encore envoye)/.test(text)) {
    eventWatcher = "facture_brouillon_non_envoyee";
  } else if (
    // Facture dont l'échéance APPROCHE (avant le retard) → distinct de l'impayé.
    /facture/.test(text) &&
    /(bientot|avant.{0,15}echeance|proche.{0,12}echeance|approche.{0,12}echeance|a venir|va (bientot )?(etre )?(due|echue)|echeance proche|avant.{0,12}(la )?date)/.test(text) &&
    !/(impaye|en retard|depasse|echue depuis|pas paye)/.test(text)
  ) {
    eventWatcher = "facture_echeance_proche";
  } else if (/(impaye|impayes|pas paye|non paye)/.test(text) || (/facture/.test(text) && /(echeance|relance|paiement|paye)/.test(text))) {
    eventWatcher = "facture_impayee";
  } else if (/devis/.test(text) && /(accepte|signe|valide|ok client)/.test(text) && /(sans chantier|pas de chantier|chantier pas ouvert|pas ouvert|pas cree|non ouvert|pas demarre)/.test(text)) {
    eventWatcher = "devis_accepte_sans_chantier";
  } else if (/devis/.test(text) && /(expire|expiration|va expirer|validite|bientot|avant.{0,15}(expir|validite)|proche.{0,12}(expir|echeance|fin))/.test(text)) {
    eventWatcher = "devis_expire_bientot";
  } else if (/devis/.test(text) && /(non signe|pas signe|sans reponse|non accepte|en attente|pas repondu|relance|signature)/.test(text)) {
    eventWatcher = "devis_non_signe";
  } else if (/(expire|expiration|va expirer|arrive a echeance|echeance)/.test(text) && !/facture/.test(text)) {
    eventWatcher = "echeance_proche";
  }
  // Sous-traitants — AVANT le cluster conformité (chaque branche exige le mot
  // « sous-traitant » ; sinon « ST sans assurance » tomberait dans assurance_expiree
  // qui, lui, ne lit que les décennales DÉJÀ expirées et ne verrait rien).
  else if (/(sous.?traitant|soustraitant)/.test(text) && /(sans assurance|pas d.assurance|pas assure|non assure|sans decennale|assurance manqu|decennale manqu)/.test(text)) {
    eventWatcher = "sous_traitant_sans_assurance";
  } else if (/(sous.?traitant|soustraitant)/.test(text) && /(probleme|problematique|souci|incident|reserve|malfacon|litige|pas fiable|defaut|a eviter)/.test(text)) {
    eventWatcher = "sous_traitant_a_probleme";
  }
  // Conformité DÉJÀ survenue — APRÈS echeance_proche (qui garde tout ce qui contient
  // « expire »), mots-clés distincts (manquant/régulariser/périmé) → aucune régression.
  else if (/(assurance|decennale|rc pro)/.test(text) && /(perime|caduc|plus valable|pas a jour|non valide|manqu|regularis|expiree)/.test(text)) {
    eventWatcher = "assurance_expiree";
  } else if (/(document|attestation|papier|piece|justificatif|kbis|urssaf|qualibat|conformite)/.test(text) && /(manqu|a regulariser|regularis|non conforme|pas a jour|non a jour|plus valable|perime|caduc)/.test(text)) {
    eventWatcher = "document_a_regulariser";
  } else if (/(document|fichier|piece|justificatif|papier)/.test(text) && /(class|ranger|range|rangement|non rattache|en vrac|trier|mettre de l.ordre)/.test(text)) {
    eventWatcher = "documents_a_classer";
  } else if (/chantier/.test(text) && /(sans photo|pas de photo|aucune photo|photo manqu|manque.{0,12}photo|photo.{0,6}final)/.test(text)) {
    eventWatcher = "chantier_sans_photo";
  } else if (/(compte[- ]rendu|compte rendu)/.test(text) && /(visite|intervention|chantier|apres|terminee|termine|fini)/.test(text)) {
    eventWatcher = "visite_terminee";
  } else if (
    // « un salarié/ouvrier/gars finit son travail/sa tâche » = intervention terminée.
    /(salarie|ouvrier|employe|compagnon|collaborateur|gars|equipe|artisan|mon gars)/.test(text) &&
    /(fini|finit|finis|termine|terminee|termin|boucle|acheve|clotur|livre)/.test(text) &&
    /(travail|tache|boulot|mission|intervention|chantier|job|prestation)/.test(text)
  ) {
    eventWatcher = "visite_terminee";
  }
  // team_planning est PLANIFIÉ (récurrent), jamais un event → ne bascule pas.
  if (eventWatcher && actionType !== "team_planning") {
    triggerType = "event";
    // Action : un verbe de création (« crée/ajoute… ») → act ; une relance EXPLICITE
    // vers un fournisseur/sous-traitant (veilleurs commande/ST) → send_email ; sinon
    // le veilleur suggère, mais « préviens/alerte » force la notification (défaut sûr).
    const w = getWatcher(eventWatcher);
    const writeToSupplier =
      isSupplierRelanceWatcher(eventWatcher) &&
      /(relance|ecris|ecrire|contacte|envoie|un mail|un message)/.test(text) &&
      !/(previens[- ]?moi|previen[- ]?moi|alerte[- ]?moi|signale[- ]?moi|rappelle[- ]?moi|je veux savoir)/.test(text);
    actionType = wantsAct
      ? "act"
      : writeToSupplier
        ? "send_email"
        : /(previens|previen|alerte|signale|rappelle|je veux savoir)/.test(text)
          ? "notify"
          : (w?.suggestedAction ?? "notify");
  } else {
    eventWatcher = null;
  }

  // L'artisan a dicté une SURVEILLANCE (« dès que… ») mais aucune regex n'a reconnu
  // de veilleur : le repli servait alors un agent quotidien à 09:00, sans jamais dire
  // que le « dès que » avait disparu. On le remonte (cf. eventWithoutSensor).
  const wantedEvent =
    triggerType === "schedule" &&
    !eventWatcher &&
    /(des que|chaque fois que|a chaque fois|quand |lorsqu)/.test(text);

  return {
    title: instruction.slice(0, 60),
    actionType,
    recipientKind,
    recipientName: nameMatch ? nameMatch[1].trim() : "",
    time,
    days,
    contentInstruction: instruction.slice(0, 500),
    contentMissing: triggerType === "event" ? false : contentMissing,
    dataFocus: actionType === "report" ? instruction.slice(0, 200) : "",
    // Repli prudent : un contrôle de données OU une écriture (act) = medium, un message = simple.
    complexity: actionType === "report" || actionType === "act" ? "medium" : "simple",
    triggerType,
    eventWatcher,
    eventDays: 0,
    // Le repli n'a pas de jugement de faisabilité (pas de LLM) : c'est le contrôle
    // déterministe de createAgentRule (sources non détectables + cohérence) qui tranche.
    feasible: true,
    blockerReason: "",
    eventWithoutSensor: wantedEvent,
  };
}

/** Parse l'instruction : Haiku si clé dispo, repli heuristique sinon/en erreur. */
export async function parseInstruction(instruction: string): Promise<ParsedRule> {
  const hasKey =
    hasAnyLlmKey();
  if (!hasKey) return parseInstructionHeuristic(instruction);

  // relative_date (déclencheur générique sur date) n'est proposé au parseur QUE si
  // le runner V2 est armé — sinon on créerait un agent que le legacy ne sait pas
  // exécuter. Runner off → tool/prompt strictement identiques à l'historique.
  const v2On = process.env.AGENT_V2_RUNNER === "1";

  try {
    const msg = await client.messages.create({
      model: PARSE_MODEL,
      max_tokens: 512,
      system: buildParseSystem(v2On),
      tools: [buildParseTool(v2On)],
      tool_choice: { type: "tool", name: "parse_rule" },
      messages: [{ role: "user", content: `Mission dictée : « ${instruction} »` }],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return parseInstructionHeuristic(instruction);

    const i = block.input as Record<string, unknown>;
    // Le garde et l'énumération de l'outil doivent grandir ENSEMBLE : une chaîne de
    // `===` recopiée à la main finit toujours par oublier une valeur, et le repli
    // silencieux (« notify ») transformerait alors un rangement demandé en simple
    // notification — l'agent dirait « Actif » sans jamais rien déposer.
    const ACTIONS: AgentActionType[] = ["send_email", "notify", "report", "team_planning", "act"];
    const actionType: AgentActionType = ACTIONS.includes(i.action_type as AgentActionType)
      ? (i.action_type as AgentActionType)
      : "notify";
    const recipientKind =
      i.recipient_kind === "client" || i.recipient_kind === "employee" || i.recipient_kind === "team" || i.recipient_kind === "me" || i.recipient_kind === "supplier"
        ? i.recipient_kind
        : "me";
    const time = typeof i.time === "string" && /^\d{1,2}:\d{2}$/.test(i.time) ? i.time : "09:00";
    const days = Array.isArray(i.days)
      ? i.days.filter((d): d is number => typeof d === "number" && d >= 1 && d <= 7)
      : [];

    const complexity: AgentComplexity =
      i.complexity === "medium" || i.complexity === "complex" ? i.complexity : "simple";

    // Déclencheur : event seulement si un veilleur VALIDE est choisi (sinon
    // schedule, jamais un event orphelin qui ne surveillerait rien).
    const rawWatcher = typeof i.event_watcher === "string" ? i.event_watcher.trim() : "";
    const eventWatcher = (WATCHER_KEYS as string[]).includes(rawWatcher) ? (rawWatcher as WatcherKey) : null;
    // relative_date : dernier recours, GATÉ (v2On) et SUBORDONNÉ au veilleur nommé —
    // on ne le retient que si le modèle a choisi event SANS veilleur nommé valide.
    const relativeDate =
      v2On && !eventWatcher && i.trigger_type === "event" ? coerceRelativeDate(i.relative_date) : null;
    const triggerType: AgentTriggerType =
      i.trigger_type === "event" && (eventWatcher || relativeDate) ? "event" : "schedule";
    // Le « dès que » demandé n'a pas trouvé de capteur. On ne le fait plus disparaître
    // en douce derrière un agent quotidien : createAgentRule s'arrêtera et demandera.
    const eventWithoutSensor = i.trigger_type === "event" && !eventWatcher && !relativeDate;
    const eventDays = triggerType === "event" && typeof i.event_days === "number" && i.event_days >= 0
      ? Math.min(365, Math.floor(i.event_days))
      : 0;

    // Phase 2a.2 : enrichissements ADDITIFS (lecture défensive, ne change rien au legacy).
    const rawActions = Array.isArray(i.actions) ? (i.actions as Record<string, unknown>[]) : [];
    const v2Actions: ParsedActionStep[] = rawActions
      .filter((a) => a && typeof a.operation === "string")
      .map((a) => ({ operation: String(a.operation).slice(0, 60), instruction: String(a.instruction ?? "").slice(0, 300) }))
      .slice(0, 8);
    const v2Conditions = coerceConditionGroup(i.conditions);
    const v2Recipients = coerceRecipientTargets(i.recipient_targets);

    return {
      title: typeof i.title === "string" && i.title.trim() ? i.title.trim().slice(0, 80) : instruction.slice(0, 60),
      actionType,
      recipientKind,
      recipientName: typeof i.recipient_name === "string" ? i.recipient_name.trim().slice(0, 80) : "",
      time,
      days,
      contentInstruction:
        typeof i.content_instruction === "string" && i.content_instruction.trim()
          ? i.content_instruction.trim().slice(0, 600)
          : instruction.slice(0, 500),
      // Un event déduit son contenu de la fiche déclenchante : jamais « bloqué faute de contenu ».
      contentMissing: triggerType === "event" ? false : i.content_missing === true,
      dataFocus: typeof i.data_focus === "string" ? i.data_focus.trim().slice(0, 200) : "",
      complexity,
      triggerType,
      eventWatcher: triggerType === "event" ? eventWatcher : null,
      eventDays,
      // >1 seulement : une action unique est déjà portée par le legacy (actionType).
      v2Actions: v2Actions.length > 1 ? v2Actions : undefined,
      v2Conditions,
      v2Recipients: v2Recipients.length ? v2Recipients : undefined,
      relativeDate: relativeDate ?? undefined,
      feasible: i.feasible !== false,
      blockerReason: typeof i.blocker_reason === "string" ? i.blocker_reason.trim().slice(0, 400) : "",
      eventWithoutSensor,
      usage: {
        model: PARSE_MODEL,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      },
    };
  } catch {
    return parseInstructionHeuristic(instruction);
  }
}

// ── Ciblage de l'équipe : la phrase de l'artisan → un filtre canonique ───────

/**
 * « chaque vendredi, envoie le planning à mes chefs d'équipe » → { role: [chef_equipe] }.
 * « envoie un email à tous mes électriciens »                  → { corps_metier: [electricite_generale] }.
 * « envoie le planning à l'équipe »                            → {} (toute l'équipe).
 *
 * Les valeurs sortent du RÉFÉRENTIEL (lib/vocabulaires), donc de la même table
 * d'alias qui a normalisé les fiches : une faute de frappe côté demande (« chef
 * d equipe ») comme côté fiche (« Chef d'équipe ») retombe sur `chef_equipe`.
 */
export function parseTeamFilter(instruction: string): TeamFilter | undefined {
  const role = matchVocabInText("role_employe", instruction);
  const corps_metier = matchTradeInText(instruction);
  if (!role.length && !corps_metier.length) return undefined;
  const f: TeamFilter = {};
  if (role.length) f.role = role;
  if (corps_metier.length) f.corps_metier = corps_metier;
  return f;
}

/** « les chefs d'équipe », « les électriciens » — pour le parler à l'artisan. */
export function describeTeamFilter(filter?: TeamFilter): string {
  if (!filter) return "";
  const parts = [
    ...(filter.role ?? []).map((v) => vocabLabel("role_employe", v).toLowerCase()),
    ...(filter.corps_metier ?? []).map((v) => vocabLabel("corps_metier", v).toLowerCase()),
  ];
  if (!parts.length) return "";
  return `« ${parts.join(" / ")} »`;
}

// ── Résolution des destinataires (contre le workspace) ───────────────────────

export type ResolveResult =
  | { ok: true; recipients: AgentAction["recipients"] }
  | { ok: false; reason: string; missing: MissingInfo | null };

/**
 * Nettoie le nom de destinataire renvoyé par le modèle avant tout affichage.
 * Le parseur doit remplir un champ obligatoire ; sur un envoi SANS destinataire
 * nommé (ex : « fais-moi du cold email »), il glisse parfois un marqueur du type
 * « <UNKNOWN> », « inconnu », « N/A ». On ne doit JAMAIS montrer ça à l'artisan :
 * on le ramène à une chaîne vide → le flux demande alors « à qui ? » proprement.
 */
export function cleanRecipientName(raw: string | null | undefined): string {
  const name = (raw ?? "").trim();
  if (!name) return "";
  // Marqueur entre chevrons (<UNKNOWN>, <nom>, <destinataire>…) → vide.
  if (/^<.*>$/.test(name)) return "";
  const placeholders = new Set([
    "unknown", "n/a", "na", "none", "null", "undefined", "inconnu", "inconnue",
    "destinataire", "le destinataire", "client", "le client", "employe", "?",
  ]);
  if (placeholders.has(name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())) {
    return "";
  }
  return name;
}

/**
 * Résout le destinataire d'un send_email contre les VRAIES fiches du workspace.
 * L'agent ne devine jamais : introuvable, ambigu ou sans email → { ok: false }
 * avec la question exacte à poser à l'utilisateur.
 */
export async function resolveRecipients(
  supabase: SupabaseClient,
  tenantId: string,
  kind: AgentRecipientKind,
  name: string,
  creatorEmail: string | null,
  filter?: TeamFilter
): Promise<ResolveResult> {
  if (kind === "me") {
    if (!creatorEmail) {
      return { ok: false, reason: "votre adresse email est introuvable", missing: null };
    }
    return { ok: true, recipients: [{ name: "vous", email: creatorEmail, entity: "me", id: "" }] };
  }

  if (kind === "team") {
    let q = supabase
      .from("employees")
      .select("id, nom, prenom, email")
      .eq("tenant_id", tenantId)
      // `statut <> 'inactif'` vaut NULL (donc FAUX) quand le statut n'est pas
      // renseigné : un `.neq()` seul EXCLURAIT en silence tout employé sans statut.
      .or("statut.is.null,statut.neq.inactif");
    // Ciblage « mes chefs d'équipe » / « mes électriciens » : on filtre sur les
    // valeurs CANONIQUES, celles-là mêmes que le formulaire impose aux fiches.
    if (filter?.role?.length) q = q.in("role", filter.role);
    if (filter?.corps_metier?.length) q = q.in("corps_metier", filter.corps_metier);
    const { data } = await q.limit(100);
    const rows = (data ?? []) as { id: string; nom: string; prenom: string | null; email: string | null }[];
    const withEmail = rows.filter((r) => r.email && r.email.includes("@"));
    const cible = describeTeamFilter(filter);

    if (rows.length === 0) {
      // Un agent qui ne vise PERSONNE ne doit jamais être « activé » : il tournerait
      // chaque vendredi dans le vide, et l'artisan croirait que Biltia est cassé.
      return {
        ok: false,
        reason: cible
          ? `aucun employé ${cible} dans votre workspace — vérifiez la fiche de vos employés (champ « Rôle » / « Corps de métier »)`
          : "aucun employé dans votre workspace",
        missing: { entity: "employees", id: null, name: cible || "équipe", field: "fiche" },
      };
    }
    if (withEmail.length === 0) {
      return {
        ok: false,
        reason: cible
          ? `aucun employé ${cible} n'a d'adresse email renseignée`
          : "aucun de vos employés n'a d'adresse email renseignée",
        missing: { entity: "employees", id: null, name: cible || "équipe", field: "email" },
      };
    }
    return {
      ok: true,
      recipients: withEmail.map((r) => ({
        name: [r.prenom, r.nom].filter(Boolean).join(" "),
        email: r.email as string,
        entity: "employees",
        id: r.id,
      })),
    };
  }

  // client | employee | supplier — recherche par nom.
  const table = kind === "client" ? "clients" : kind === "supplier" ? "suppliers" : "employees";
  const label = kind === "client" ? "client" : kind === "supplier" ? "sous-traitant / fournisseur" : "employé";
  if (!name.trim()) {
    return { ok: false, reason: `quel ${label} dois-je contacter ?`, missing: null };
  }

  const { data } = await supabase
    .from(table)
    .select("id, nom, email")
    .eq("tenant_id", tenantId)
    .ilike("nom", `%${name.trim()}%`)
    .limit(5);
  const rows = (data ?? []) as { id: string; nom: string; email: string | null }[];

  if (rows.length === 0) {
    return {
      ok: false,
      reason: `je ne trouve aucun ${label} « ${name} » dans votre workspace`,
      missing: { entity: table, id: null, name, field: "fiche" },
    };
  }
  if (rows.length > 1) {
    const names = rows.map((r) => r.nom).join(", ");
    return { ok: false, reason: `plusieurs ${label}s correspondent (${names}) — précisez lequel`, missing: null };
  }

  const row = rows[0];
  if (!row.email || !row.email.includes("@")) {
    return {
      ok: false,
      reason: `je n'ai pas l'email de ${row.nom}`,
      missing: { entity: table, id: row.id, name: row.nom, field: "email" },
    };
  }
  return { ok: true, recipients: [{ name: row.nom, email: row.email, entity: table, id: row.id }] };
}

// ── Canaux d'envoi pas encore branchés (WhatsApp / SMS automatiques) ─────────
// L'agent ne sait envoyer aujourd'hui que par email et notification. WhatsApp
// automatique = un chantier (API Meta, templates approuvés, coût par message)
// pas encore livré. On détecte la demande pour NE PAS créer un agent qui
// n'enverra jamais, et NE PAS basculer sur l'email en silence.
export function mentionsUnsupportedChannel(instruction: string): "WhatsApp" | "SMS" | null {
  const t = instruction
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/what'?s?\s?app/.test(t) || /\bwa\.me\b/.test(t)) return "WhatsApp";
  if (/\bsms\b/.test(t) || /\btexto\b/.test(t)) return "SMS";
  return null;
}

/**
 * L'artisan veut-il VALIDER les relances avant qu'elles ne partent (#67) ?
 * « prépare-les sans les envoyer », « ne les envoie pas, je valide », « soumets-moi
 * avant », « demande-moi avant d'envoyer » → mode brouillon (approval="always").
 */
export function mentionsApprovalIntent(instruction: string): boolean {
  const t = instruction
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/(sans (les )?envoyer|ne (les )?envoie pas|n'envoie pas|pas automatiquement|sans envoi auto)/.test(t)) return true;
  if (/(je valide|que je valide|apres validation|avec (ma )?validation|soumets[- ]moi|propose[- ]moi|demande[- ]moi avant|mon accord|mon feu vert|prepare(-| )?(les|la|moi)? (relance|un mail|un message))/.test(t)) return true;
  return false;
}

// ── Création (orchestration) ─────────────────────────────────────────────────

export type CreateRuleResult = {
  ok: boolean;
  ruleId: string | null;
  blocked: boolean;
  /** Message prêt pour le chat (« jamais muet »). */
  message: string;
  /** Manques de capacité détectés au preflight (bloquants si !ok, sinon recommandations). */
  gaps?: CapabilityGap[];
  usage?: ParsedRule["usage"];
};

/**
 * Phase 2a : pose le `spec` V2 (représentation canonique de la règle) SANS jamais
 * risquer la création. L'insert legacy reste la source de vérité exécutée ; le
 * spec est une écriture BEST-EFFORT découplée — si la colonne n'est pas encore
 * migrée (040), l'update échoue silencieusement et l'agent est créé normalement.
 * Aujourd'hui le spec = simple élévation du legacy (liftLegacyToV2) ; quand le
 * parseur produira du V2 riche, on stockera directement la forme complète ici.
 */
async function attachSpecBestEffort(
  supabase: SupabaseClient,
  ruleId: string,
  legacy: { trigger_type: string; schedule?: unknown; action?: unknown; trigger?: unknown },
  rich?: { actions?: ParsedActionStep[]; conditions?: ConditionGroup; recipients?: RecipientResolver[] }
): Promise<void> {
  try {
    // buildSpec : base legacy + enrichissements (multi-actions / conditions) si présents.
    const spec = buildSpec(legacy, rich);
    await supabase
      .from("agent_rules")
      .update({ spec: spec as unknown as Record<string, unknown> })
      .eq("id", ruleId);
  } catch {
    // colonne `spec` absente (pré-migration 040) ou erreur transitoire → best-effort, on ignore.
  }
}

/**
 * Recrute un agent : parse l'instruction, résout les destinataires, calcule le
 * prochain passage et écrit la règle. Une info manquante ne REFUSE pas la
 * mission : la règle est créée « bloquée » avec la question précise, et
 * démarre dès que l'info est fournie (le workspace est complété au passage).
 */
export async function createAgentRule(opts: {
  supabase: SupabaseClient;
  userId: string;
  userEmail: string | null;
  tenantId: string;
  instruction: string;
  /** Langue de l'interface : les manques de capacité (pop-up) sont rendus dedans. */
  locale?: Locale;
}): Promise<CreateRuleResult> {
  const { supabase, userId, userEmail, tenantId, instruction, locale = "fr" } = opts;

  // ── QUOTA FREE : 1 agent actif. Le mur des crédits fait le reste sur Pro. ──
  let isFreePlan = false;
  let collaboration = false;
  try {
    const ent = await getEntitlementsForTenant(supabase, tenantId);
    isFreePlan = ent.plan === "free";
    collaboration = ent.collaboration;
    if (isFreePlan) {
      const { count } = await supabase
        .from("agent_rules")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if ((count ?? 0) >= 1) {
        return {
          ok: false,
          ruleId: null,
          blocked: false,
          message:
            "Le plan Gratuit inclut **1 agent actif**. Pour recruter une équipe entière d'agents, passez à Pro dans **Paramètres → Facturation**.",
        };
      }
    }
  } catch {
    // Entitlements indisponibles → ne bloque pas le recrutement (fail-open).
  }

  // ── Canal pas encore branché : refus honnête + bascule (« jamais muet »). ──
  // Détecté AVANT le parsing : on ne crée pas d'agent voué à l'échec et on
  // n'envoie surtout pas un email « à la place » sans le dire. Zéro fausse
  // promesse, on propose ce qui marche vraiment maintenant.
  const unsupportedChannel = mentionsUnsupportedChannel(instruction);
  if (unsupportedChannel) {
    return {
      ok: false,
      ruleId: null,
      blocked: false,
      message:
        `📱 L'envoi **automatique par ${unsupportedChannel}** n'est pas encore actif sur votre compte. ` +
        `Aujourd'hui, un agent peut prévenir vos clients ou vos équipes par **email** ou par **notification**. ` +
        `Dites-moi « **fais-le par email** » (ou « par notification ») et je programme ce rappel tout de suite — ` +
        `je vous préviendrai dès que l'envoi ${unsupportedChannel} automatique sera disponible.`,
    };
  }

  const parsed = await parseInstruction(instruction);

  // ── PORTE DE FAISABILITÉ (incident 2026-07-14) : « est-ce que je sais VRAIMENT
  //    détecter ce qu'on me demande de surveiller ? » Posée AVANT les gates de plan :
  //    répondre « passez à Pro » pour un agent de toute façon impossible serait une
  //    seconde tromperie. Le doute ne produit JAMAIS d'agent (cf. lib/agent-feasibility).
  const feasibility = judgeFeasibility({
    instruction,
    triggerType: parsed.triggerType,
    eventWatcher: parsed.eventWatcher,
    feasible: parsed.feasible,
    blockerReason: parsed.blockerReason,
    eventWithoutSensor: parsed.eventWithoutSensor,
    locale,
  });
  if (feasibility.verdict !== "ok") {
    return {
      ok: false,
      ruleId: null,
      blocked: false,
      message: feasibility.message,
      usage: parsed.usage,
    };
  }

  // ── PLAN : sur Free, un agent qui AGIT (relance email, compte-rendu, rapport,
  //    planning équipe) est réservé à Pro. L'ALERTE (notify) reste gratuite —
  //    « le Free goûte, le Pro exécute ». Fondateur exempté (test). ──────────────
  if (isFreePlan && !isFounderEmail(userEmail)) {
    const willAct =
      parsed.actionType === "send_email" ||
      parsed.actionType === "report" ||
      parsed.actionType === "team_planning" ||
      parsed.actionType === "compte_rendu" ||
      parsed.actionType === "act" ||
      parsed.eventWatcher === "visite_terminee";
    if (willAct) {
      return {
        ok: false,
        ruleId: null,
        blocked: false,
        message:
          "Sur le plan **Gratuit**, un agent vous **alerte** (rappels, veille) sans frais. Pour qu'il **agisse à votre place** (relancer par email, rédiger un compte-rendu, envoyer un rapport ou le planning à l'équipe), passez à **Pro** dans **Paramètres → Facturation**.",
        usage: parsed.usage,
      };
    }
  }

  // ── PLAN ÉQUIPE : le planning envoyé aux ÉQUIPES suppose des collaborateurs dans
  //    Biltia → réservé au plan Équipe (collaboration). Les autres actions d'agent
  //    (relance email, compte-rendu, rapport) restent au plan Pro solo. ───────────
  if (parsed.actionType === "team_planning" && !collaboration && !isFounderEmail(userEmail)) {
    return {
      ok: false,
      ruleId: null,
      blocked: false,
      message:
        "Envoyer le **planning à votre équipe** fait partie du plan **Équipe**. Ajoutez la collaboration (+50 €/mois) dans **Paramètres → Facturation** pour activer les agents qui travaillent avec votre équipe.",
      usage: parsed.usage,
    };
  }

  // ── PREFLIGHT DE CAPACITÉ (demande user 2026-07-10) : comme un employé, l'agent
  //    regarde s'il a de quoi accomplir sa mission AVANT de dire « c'est parti ».
  //    Il ne devine pas le plan d'action final — on le déduit du parsing, à
  //    l'identique de la construction ci-dessous. Un manque BLOQUANT (pas de canal
  //    d'envoi, pas d'équipe joignable) refuse le recrutement avec la raison
  //    précise ; les warnings (notifications non activées, agenda non branché,
  //    aucun seuil de stock) laissent recruter mais sont signalés. ───────────────
  let planAction: AgentActionType = parsed.actionType;
  let planRecipient: AgentRecipientKind = parsed.recipientKind;
  let planWatcher: WatcherKey | null = null;
  if (parsed.triggerType === "event" && parsed.eventWatcher) {
    planWatcher = parsed.eventWatcher;
    const canRelanceClient =
      parsed.eventWatcher === "devis_non_signe" ||
      parsed.eventWatcher === "devis_expire_bientot" ||
      parsed.eventWatcher === "facture_echeance_proche" ||
      parsed.eventWatcher === "facture_impayee" ||
      parsed.eventWatcher === "client_inactif";
    if (parsed.actionType === "act") {
      // act = écriture dans le workspace (aucun canal externe requis → jamais bloquant).
      planAction = "act";
      planRecipient = "me";
    } else if (parsed.eventWatcher === "visite_terminee") {
      planAction = "compte_rendu";
      planRecipient = "me";
    } else if (parsed.actionType === "send_email" && canRelanceClient) {
      planAction = "send_email";
      planRecipient = "client";
    } else if (parsed.actionType === "send_email" && isSupplierRelanceWatcher(parsed.eventWatcher)) {
      planAction = "send_email";
      planRecipient = "supplier";
    } else {
      planAction = "notify";
      planRecipient = "me";
    }
  } else if (parsed.actionType === "team_planning") {
    planRecipient = "team";
  }
  const readiness = await checkAgentReadiness({
    supabase,
    tenantId,
    userId,
    userEmail,
    plan: { actionType: planAction, recipientKind: planRecipient, watcher: planWatcher },
    locale,
  });
  // ── QUE FAIRE DES MANQUES BLOQUANTS ? Deux natures, deux traitements. ────────
  //  • Il manque une CONNEXION (messagerie, agenda) : l'artisan peut la brancher en
  //    un clic, tout de suite, depuis le chat. On CRÉE l'agent mais BLOQUÉ — il
  //    apparaît dans /agents avec ses boutons, le cron n'y touche pas, et il
  //    s'active tout seul dès la connexion faite. Rien ne se perd s'il ferme l'onglet.
  //  • Il manque des DONNÉES (aucune facture à relancer, aucun employé joignable) :
  //    aucun bouton ne règle ça, et un agent qui attend indéfiniment de la donnée
  //    serait un agent-fantôme de plus. On refuse, en disant précisément quoi faire.
  const blockingGaps = readiness.gaps.filter((g) => g.severity === "block");
  // Les manques qu'un BOUTON règle : un connecteur absent ne doit pas être pris pour
  // un manque de DONNÉES, sinon l'agent est refusé net au lieu d'être créé en attente
  // avec le bouton « Connecter » qui va bien.
  //
  // C'ÉTAIT UNE LISTE EN DUR — la QUATRIÈME copie de la même chose, après les trois
  // qu'on vient de fusionner. Une capacité connectable oubliée ici était traitée comme
  // un manque de données, et l'agent refusé sans le moindre bouton. On ne recopie plus :
  // on DEMANDE au registre s'il existe un connecteur "live" pour ce manque. La réponse
  // est la même partout, par construction.
  const dataGaps = blockingGaps.filter((g) => connectorsForCapability(g.code).length === 0);
  if (dataGaps.length > 0) {
    return {
      ok: false,
      ruleId: null,
      blocked: false,
      gaps: readiness.gaps,
      message:
        `Je peux mettre en place « ${parsed.title} », mais l'agent tournerait à vide : ` +
        `**${summarizeGaps(dataGaps)}**. ` +
        `Je préfère ne pas l'activer plutôt que de vous laisser croire qu'il veille. ` +
        `Complétez cela (voir ci-dessous) puis redemandez-moi, je le mets en place aussitôt.`,
      usage: parsed.usage,
    };
  }
  /** Il ne manque QUE des connexions : l'agent naît bloqué, pas actif. */
  const pendingConnection = blockingGaps.length > 0;
  const warnNote = readiness.gaps.length && !pendingConnection
    ? ` À finir pour un fonctionnement optimal : ${summarizeGaps(readiness.gaps)}.`
    : "";

  // ── DÉCLENCHEUR SUR DATE (relative_date, générique) — GATÉ sur le runner V2 ───
  // Non représentable par les colonnes legacy : la règle n'existe QUE dans le spec.
  // On écrit donc le spec INLINE (fail-closed) — sans la migration 040, l'insert
  // échoue proprement (« vos crédits n'ont pas été touchés ») plutôt que de laisser
  // un agent-fantôme que le runner ne saurait pas faire tourner. Double-gate sur le
  // flag (le parseur ne l'émet déjà que si v2On). L'agent naît actif : le runner V2
  // évalue le relative_date à chaque tick (idempotence par fiche, cf executeV2Rule).
  if (
    parsed.triggerType === "event" &&
    parsed.relativeDate &&
    !parsed.eventWatcher &&
    process.env.AGENT_V2_RUNNER === "1"
  ) {
    const rel = parsed.relativeDate;
    const wantsEmail = parsed.actionType === "send_email";
    const evType: AgentActionType = wantsEmail ? "send_email" : parsed.actionType === "act" ? "act" : "notify";
    const complexity: AgentComplexity = evType === "notify" ? "simple" : "medium";
    // Destinataires : relationnels du parseur ; à défaut, une relance vise le client
    // de la fiche (repli patron). Une alerte (notify) va au patron (recipients vides).
    const recipients: RecipientResolver[] = parsed.v2Recipients?.length
      ? parsed.v2Recipients
      : wantsEmail
        ? [{ type: "related_client", fallback: { type: "workspace_owner" } }]
        : [];
    const action: AgentAction = {
      type: evType,
      recipientKind: wantsEmail ? "client" : "me",
      recipientName: "",
      recipients: [],
      contentInstruction: parsed.contentInstruction,
      dataFocus: "",
      complexity,
      model: COMPLEXITY_MODEL[complexity],
      estimatedCreditsPerRun: estimateCreditsPerRun(evType),
      approval: evType === "send_email" && mentionsApprovalIntent(instruction) ? "always" : "auto",
    };
    // Trigger legacy : blob bénin (le legacy ne l'exécute jamais — runner gaté ON) ;
    // porte quand même la cadence de scan pour reschedule(). Le spec, lui, est riche.
    const trigger = { relative: rel, scanEveryMinutes: 720 };
    const title = parsed.title || `Rappel sur date : ${rel.entityType}`;
    const spec = buildSpec(
      { trigger_type: "event", trigger, action },
      {
        actions: parsed.v2Actions,
        conditions: parsed.v2Conditions,
        recipients,
        trigger: { type: "event", subtype: "relative_date", scanEveryMinutes: 720, relative: rel },
      }
    );

    const { data: insertedRel, error: relErr } = await supabase
      .from("agent_rules")
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        title,
        instruction: instruction.slice(0, 2000),
        trigger_type: "event",
        trigger: trigger as unknown as Record<string, unknown>,
        schedule: {} as unknown as Record<string, unknown>,
        action: action as unknown as Record<string, unknown>,
        // INLINE (fail-closed) : sans la colonne `spec` (migration 040), l'insert
        // échoue → on ne crée PAS d'agent relative_date orphelin.
        spec: spec as unknown as Record<string, unknown>,
        status: "active",
        next_run_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (relErr || !insertedRel) {
      return {
        ok: false,
        ruleId: null,
        blocked: false,
        message:
          "Je n'ai pas réussi à mettre en place ce rappel sur date à l'instant. Réessayez dans un instant — vos crédits n'ont pas été touchés.",
        usage: parsed.usage,
      };
    }

    const unitLabel =
      rel.offsetUnit === "days" ? "jour(s)" : rel.offsetUnit === "weeks" ? "semaine(s)" : rel.offsetUnit === "months" ? "mois" : rel.offsetUnit === "hours" ? "heure(s)" : "minute(s)";
    const whenLabel = `${rel.offsetValue} ${unitLabel} ${rel.direction === "before" ? "avant" : "après"}`;
    const actLabel =
      evType === "send_email"
        ? action.approval === "always"
          ? "je prépare la relance et vous la soumets pour validation avant envoi"
          : "je relance le client concerné par email"
        : evType === "act"
          ? "je réalise l'action demandée sur la fiche concernée et je vous rends compte"
          : "je vous préviens aussitôt";
    const message =
      `🤖 Agent recruté : **${title}**. Je surveille la date « ${rel.dateField} » de vos ${rel.entityType} en continu — ` +
      `${whenLabel}, ${actLabel}. Chaque fiche n'est traitée qu'une fois.${warnNote} Retrouvez-le dans **Agents**.`;
    return { ok: true, ruleId: insertedRel.id, blocked: false, message, gaps: readiness.gaps, usage: parsed.usage };
  }

  // ── DÉCLENCHEUR ÉVÉNEMENTIEL : « dès qu'une fiche remplit la condition » ─────
  // Chemin distinct du planning : AUCUNE résolution de destinataire au
  // recrutement — pour un envoi, le client est celui de CHAQUE fiche déclenchante ;
  // pour une alerte, c'est le patron. L'agent naît actif et se met à surveiller
  // dès le prochain tick du cron partagé (lib/agent-executor : executeEventRule).
  if (parsed.triggerType === "event" && parsed.eventWatcher) {
    const watcher = getWatcher(parsed.eventWatcher);
    if (watcher) {
      const days = parsed.eventDays > 0 ? parsed.eventDays : watcher.defaultDays;
      // Type d'action de l'event : compte-rendu (génère un doc), relance client, ou alerte patron.
      let evType: AgentActionType;
      let complexity: AgentComplexity;
      let evRecipientKind: AgentRecipientKind;
      // Une relance client n'a de sens que pour les veilleurs qui portent l'email
      // d'un client (devis, factures). Les veilleurs « chantier » (retard, budget,
      // stagnation, sans devis) alertent TOUJOURS le patron — jamais d'email vide.
      const canRelanceClient =
        watcher.key === "devis_non_signe" ||
        watcher.key === "devis_expire_bientot" ||
        watcher.key === "facture_echeance_proche" ||
        watcher.key === "facture_impayee" ||
        watcher.key === "client_inactif";
      // Veilleur « jugé par IA » : alerte patron, mais l'examen (lecture + jugement)
      // a un coût → notify PAYANT (pas gratuit comme un digest par gabarit).
      const isJudged = !!watcher.aiJudge;
      if (parsed.actionType === "act") {
        // AGIR : l'agent crée/met à jour une fiche par déclenchement, puis rend compte.
        evType = "act";
        complexity = "medium";
        evRecipientKind = "me";
      } else if (watcher.key === "visite_terminee") {
        evType = "compte_rendu";
        complexity = "medium";
        evRecipientKind = "me";
      } else if (parsed.actionType === "send_email" && canRelanceClient) {
        evType = "send_email";
        complexity = "medium";
        evRecipientKind = "client";
      } else if (parsed.actionType === "send_email" && isSupplierRelanceWatcher(watcher.key)) {
        // Relance d'un FOURNISSEUR/SOUS-TRAITANT : l'email part vers le contact de
        // la fiche déclenchante (match.email = email du fournisseur), ton neutre.
        evType = "send_email";
        complexity = "medium";
        evRecipientKind = "supplier";
      } else {
        evType = "notify";
        complexity = "simple";
        evRecipientKind = "me";
      }
      const action: AgentAction = {
        type: evType,
        recipientKind: evRecipientKind,
        recipientName: "",
        recipients: [],
        contentInstruction: parsed.contentInstruction,
        dataFocus: "",
        complexity,
        model: COMPLEXITY_MODEL[complexity],
        // Alerte patron par gabarit = 0 crédit ; alerte JUGÉE par l'IA = un passage ;
        // relance client / compte-rendu = rédaction.
        estimatedCreditsPerRun: estimateCreditsPerRun(evType, { judged: isJudged }),
        // Mode brouillon (#67) : « prépare sans envoyer, je valide » → chaque
        // relance passe par l'outbox. Sinon envoi auto (les relances FERMES
        // restent quand même retenues pour validation, cf. exécuteur).
        approval: evType === "send_email" && mentionsApprovalIntent(instruction) ? "always" : "auto",
      };
      const trigger: AgentTrigger = { watcher: watcher.key, params: { days }, scanEveryMinutes: 60 };
      const title = parsed.title || `Surveillance : ${watcher.label}`;

      const { data: insertedEvt, error: evtErr } = await supabase
        .from("agent_rules")
        .insert({
          tenant_id: tenantId,
          created_by: userId,
          title,
          instruction: instruction.slice(0, 2000),
          trigger_type: "event",
          trigger: trigger as unknown as Record<string, unknown>,
          schedule: {} as unknown as Record<string, unknown>,
          action: action as unknown as Record<string, unknown>,
          // Il manque une connexion → l'agent existe mais n'est PAS actif : le cron
          // ne touche pas un agent 'blocked'. Il s'activera seul dès la connexion.
          status: pendingConnection ? "blocked" : "active",
          blocked_reason: pendingConnection ? PENDING_CONNECTION_REASON : null,
          next_run_at: pendingConnection ? null : new Date().toISOString(), // sinon évalué dès le prochain tick (≤ 5 min)
        })
        .select("id")
        .single();

      if (evtErr || !insertedEvt) {
        return {
          ok: false,
          ruleId: null,
          blocked: false,
          message:
            "Je n'ai pas réussi à mettre en place cette surveillance à l'instant. Réessayez dans un instant — vos crédits n'ont pas été touchés.",
          usage: parsed.usage,
        };
      }

      await attachSpecBestEffort(supabase, insertedEvt.id, { trigger_type: "event", trigger, action }, { actions: parsed.v2Actions, conditions: parsed.v2Conditions, recipients: parsed.v2Recipients });

      const daysNote = watcher.daysMeaning && days > 0 ? ` (${days} ${watcher.daysMeaning})` : "";
      const actLabel =
        evType === "act"
          ? "je réalise l'action demandée sur la fiche concernée (à partir de ses données) et je vous rends compte"
          : evType === "compte_rendu"
            ? "je rédige le compte-rendu et vous le retrouvez dans la Bibliothèque"
            : evType === "send_email"
              ? action.approval === "always"
                ? "je prépare chaque relance et vous la soumets pour validation avant envoi (rien ne part sans votre feu vert)"
                : "je relance le client concerné par email (une relance devenue ferme vous est soumise pour validation avant envoi)"
              : isJudged
                ? "je lis chaque nouvelle fiche pour juger, et je vous préviens seulement sur les vrais cas"
                : "je vous préviens aussitôt";
      // Transparence : un veilleur jugé par IA consomme un peu à chaque examen.
      const judgeNote = isJudged
        ? ` L'analyse coûte ~${ACTION_CREDITS.agent_passage} crédits par lot de nouvelles fiches (le débit réel fait foi).`
        : "";
      // Ce que l'agent surveille est énoncé À PARTIR DU VEILLEUR RÉELLEMENT ENREGISTRÉ
      // (lib/agent-feasibility), jamais d'après la demande. Si un jour un mauvais
      // rapprochement repasse les garde-fous, l'artisan LIRA ce qui a été retenu et
      // pourra le contredire, au lieu de le découvrir des semaines plus tard.
      const watching = describeWatcher(watcher.key) || watcher.watching;
      const message = pendingConnection
        ? `🤖 Agent créé : **${title}** — mais je ne l'active pas encore. Je surveillerai ${watching}${daysNote}, et pour ${actLabel.replace(/^je /, "")}, il me manque ceci :\n\n` +
          `**${summarizeGaps(blockingGaps)}**\n\n` +
          `Connectez ci-dessous : je l'active immédiatement après, sans que vous ayez à redemander.`
        : `🤖 Agent recruté : **${title}**. Je surveille ${watching}${daysNote} en continu : ` +
          `dès qu'une fiche correspond, ${actLabel}. Chaque fiche n'est traitée qu'une fois (pas de spam).${judgeNote} ` +
          `Retrouvez-le dans **Agents**.${warnNote}`;
      return {
        ok: true,
        ruleId: insertedEvt.id,
        blocked: pendingConnection,
        message,
        gaps: readiness.gaps,
        usage: parsed.usage,
      };
    }
  }

  // Nettoyage AVANT toute résolution/affichage : jamais de « <UNKNOWN> » à l'écran.
  // Un nom vide fera dire « à qui dois-je écrire ? » (resolveRecipients) au lieu
  // de chercher un client-fantôme.
  parsed.recipientName = cleanRecipientName(parsed.recipientName);
  const schedule: AgentSchedule = { time: parsed.time, days: parsed.days, tz: PARIS_TZ };

  // Résolution immédiate pour un envoi : on préfère bloquer MAINTENANT avec une
  // question claire plutôt qu'échouer en silence au premier passage.
  let recipients: AgentAction["recipients"] = [];
  let blockedReason: string | null = null;
  let missing: MissingInfo | null = null;
  // send_email ET team_planning ont un destinataire à résoudre au recrutement
  // (le client/l'équipe) — on préfère bloquer maintenant avec une question claire.
  // « à mes chefs d'équipe » / « à mes électriciens » : le sous-ensemble visé est
  // lu dans la phrase d'origine, jamais deviné à l'exécution.
  const teamFilter = parseTeamFilter(instruction);
  if (parsed.actionType === "send_email" || parsed.actionType === "team_planning") {
    // Le planning s'adresse à l'ÉQUIPE quoi qu'il arrive.
    const kind: AgentRecipientKind = parsed.actionType === "team_planning" ? "team" : parsed.recipientKind;
    const r = await resolveRecipients(supabase, tenantId, kind, parsed.recipientName, userEmail, kind === "team" ? teamFilter : undefined);
    if (r.ok) recipients = r.recipients;
    else {
      blockedReason = r.reason;
      missing = r.missing;
    }
  }

  // ── Contenu manquant : « envoie un message à Alpha » sans dire QUOI ──────────
  // Comme un employé, l'agent ne devine pas le message. Il naît bloqué et
  // demande le contenu (le destinataire reste prioritaire : une question à la
  // fois). report = examen de données, pas un message → jamais concerné.
  if (
    !blockedReason &&
    parsed.contentMissing &&
    (parsed.actionType === "send_email" || parsed.actionType === "notify")
  ) {
    const who = parsed.recipientName || (parsed.recipientKind === "me" ? "vous" : "le destinataire");
    blockedReason = `je ne sais pas encore quel message envoyer à ${who}`;
    missing = { entity: "content", id: null, name: who, field: "content" };
  }

  const isPlanning = parsed.actionType === "team_planning";
  const action: AgentAction = {
    type: parsed.actionType,
    recipientKind: isPlanning ? "team" : parsed.recipientKind,
    recipientName: parsed.recipientName,
    recipients,
    teamFilter,
    contentInstruction: parsed.contentInstruction,
    dataFocus: parsed.dataFocus,
    complexity: parsed.complexity,
    model: COMPLEXITY_MODEL[parsed.complexity],
    // Le prix suit l'action (le planning est un gabarit → 0 crédit IA), pas la complexité.
    estimatedCreditsPerRun: estimateCreditsPerRun(parsed.actionType),
  };

  // Il manque une connexion → l'agent naît bloqué lui aussi (le cron ne touche jamais
  // un 'blocked') et s'activera seul dès qu'elle sera faite. Une question déjà en
  // attente (destinataire ou contenu introuvable) reste prioritaire : elle est plus
  // précise, et on ne pose qu'une question à la fois.
  if (!blockedReason && pendingConnection) blockedReason = PENDING_CONNECTION_REASON;
  const blocked = blockedReason !== null;
  const nextRun = blocked ? null : computeNextRun(schedule);

  const { data: inserted, error } = await supabase
    .from("agent_rules")
    .insert({
      tenant_id: tenantId,
      created_by: userId,
      title: parsed.title,
      instruction: instruction.slice(0, 2000),
      trigger_type: "schedule",
      schedule: schedule as unknown as Record<string, unknown>,
      action: action as unknown as Record<string, unknown>,
      status: blocked ? "blocked" : "active",
      blocked_reason: blockedReason,
      missing: missing as unknown as Record<string, unknown> | null,
      next_run_at: nextRun ? nextRun.toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      ruleId: null,
      blocked: false,
      message:
        "Je n'ai pas réussi à recruter cet agent à l'instant. Réessayez dans un instant — vos crédits n'ont pas été touchés.",
      usage: parsed.usage,
    };
  }

  await attachSpecBestEffort(supabase, inserted.id, { trigger_type: "schedule", schedule, action }, { actions: parsed.v2Actions, conditions: parsed.v2Conditions, recipients: parsed.v2Recipients });

  const planning = describeSchedule(schedule);
  // Transparence prix : estimation annoncée AU RECRUTEMENT (le débit réel,
  // calculé sur le coût mesuré de chaque passage, fait foi et est visible
  // dans Agents). Jamais de surprise.
  const perMonth = action.estimatedCreditsPerRun * runsPerMonth(parsed.days);
  const priceLine = `Coût estimé : ~${action.estimatedCreditsPerRun} crédits par passage (~${perMonth}/mois — ajusté au réel, visible dans **Agents**).`;
  let message: string;
  if (blockedReason === PENDING_CONNECTION_REASON) {
    // Il ne manque QU'UNE connexion : on ne sert surtout pas la sentinelle technique
    // à l'artisan, on lui montre le(s) bouton(s) et on promet l'activation auto.
    message =
      `🤖 Agent créé : **${parsed.title}** (${planning}) — mais je ne l'active pas encore. Il me manque ceci :\n\n` +
      `**${summarizeGaps(blockingGaps)}**\n\n` +
      `Connectez ci-dessous : je l'active immédiatement après, sans que vous ayez à redemander. ${priceLine}`;
  } else if (blocked) {
    const hint =
      missing?.field === "email"
        ? ` Donnez-moi l'email (ex : « son email est jean@exemple.fr ») ou complétez la fiche dans le Workspace — je démarre dès que je l'ai.`
        : missing?.field === "content"
          ? ` Dites-moi quoi envoyer (ex : « demande-lui une photo du chantier ») dans **Agents** — je démarre dès que je l'ai.`
          : "";
    message = `🤖 Agent recruté : **${parsed.title}** (${planning}). ${priceLine} ⚠️ Mais avant de démarrer : ${blockedReason}.${hint} Retrouvez cet agent dans **Agents**.`;
  } else {
    // QUI VA RECEVOIR ? L'artisan doit le voir AVANT que ça parte, pas le découvrir
    // au premier envoi du vendredi. On nomme les gens quand ils sont peu nombreux,
    // et on rappelle le ciblage compris (« chef d'équipe ») quand il y en a un.
    let cibleLine = "";
    if (action.recipients.length && (action.type === "team_planning" || action.type === "send_email")) {
      const qui = describeTeamFilter(action.teamFilter);
      const noms = action.recipients.map((r) => r.name).filter(Boolean);
      const liste = noms.length <= 5 ? noms.join(", ") : `${noms.slice(0, 5).join(", ")} et ${noms.length - 5} autre(s)`;
      cibleLine =
        ` Destinataires${qui ? ` ${qui}` : ""} : **${action.recipients.length} personne(s)** — ${liste}.`;
    }
    message = `🤖 Agent recruté : **${parsed.title}** — ${planning}.${cibleLine} Premier passage : ${
      nextRun ? formatRunDate(nextRun) : "à planifier"
    }. ${priceLine} Je m'en occupe.`;
  }

  return { ok: true, ruleId: inserted.id, blocked, message: message + warnNote, gaps: readiness.gaps, usage: parsed.usage };
}

// ── Activation d'un AGENT PRÊT À L'EMPLOI (template) ──────────────────────────

export type ActivateTemplateResult = {
  ok: boolean;
  ruleId: string | null;
  /** true = le même modèle était déjà dans les agents du tenant (pas de doublon). */
  alreadyActive?: boolean;
  /** true = créé mais en attente (ex : équipe sans email pour le planning). */
  blocked?: boolean;
  /** Manques de capacité au preflight (bloquants si !ok, sinon recommandations). */
  gaps?: CapabilityGap[];
  /** Message prêt pour l'UI (« jamais muet »). */
  message: string;
};

/**
 * Active un agent DÉJÀ CONFIGURÉ (lib/agent-templates.ts) : aucun parsing LLM,
 * on écrit directement la règle exécutable équivalente à une recrue. Le modèle
 * activé est marqué dans meta.template_id (idempotence : un même modèle ne crée
 * pas deux agents). Réutilise resolveRecipients / computeNextRun / le catalogue
 * de veilleurs — l'exécuteur (agent-executor) le traite ensuite comme n'importe
 * quel agent, avec débit PAR PASSAGE au coût réel.
 */
export async function activateAgentTemplate(opts: {
  supabase: SupabaseClient;
  userId: string;
  userEmail: string | null;
  tenantId: string;
  template: AgentTemplate;
  /** Langue de l'interface : les manques de capacité (pop-up) sont rendus dedans. */
  locale?: Locale;
}): Promise<ActivateTemplateResult> {
  const { supabase, userId, userEmail, tenantId, template, locale = "fr" } = opts;

  // ── LE PRIX AFFICHÉ SUR LA CARTE EST-IL LE VRAI PRIX ? ─────────────────────
  // La galerie est un composant CLIENT : elle calcule le prix sans pouvoir lire le
  // registre des veilleurs (lib/agent-watchers.ts n'est pas client-safe). Elle suppose
  // donc `judged: false`. Or un veilleur JUGÉ par l'IA rend un simple `notify` PAYANT
  // (20 cr — elle lit chaque fiche pour trancher). Aucun template n'en utilise
  // aujourd'hui ; le jour où l'un en adopte un, la carte annoncerait « Gratuit » et
  // l'exécuteur débiterait 20. C'est exactement le mensonge qu'on vient d'éliminer.
  //
  // ICI, on a le registre. On le vérifie, une bonne fois, au seul endroit qui le peut.
  if (template.watcher) {
    const juge = !!getWatcher(template.watcher)?.aiJudge;
    if (juge && templateCredits(template) !== estimateCreditsPerRun(templateAction(template), { judged: true })) {
      console.error(
        `[agent-templates] « ${template.id} » utilise le veilleur JUGÉ « ${template.watcher} » : ` +
          `la carte annonce ${templateCredits(template)} cr, l'exécuteur en débitera ` +
          `${estimateCreditsPerRun(templateAction(template), { judged: true })}. ` +
          `Le prix affiché est FAUX — corrigez lib/agent-templates.ts.`
      );
    }
  }

  // ── Anti-doublon : ce modèle est-il déjà activé dans cet espace ? ──────────
  const { data: existingRows } = await supabase
    .from("agent_rules")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("meta->>template_id", template.id)
    .limit(1);
  const existing = (existingRows ?? [])[0] as { id: string } | undefined;
  if (existing) {
    return {
      ok: true,
      ruleId: existing.id,
      alreadyActive: true,
      message: `« ${template.name} » est déjà dans vos agents. Retrouvez-le dans **Agents**.`,
    };
  }

  // ── Quota Free : 1 agent actif (mêmes règles que createAgentRule). ─────────
  try {
    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (ent.plan === "free") {
      const { count } = await supabase
        .from("agent_rules")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if ((count ?? 0) >= 1) {
        return {
          ok: false,
          ruleId: null,
          message:
            "Le plan Gratuit inclut **1 agent actif**. Pour activer toute une équipe d'agents, passez à Pro dans **Paramètres → Facturation**.",
        };
      }
    }
  } catch {
    // Entitlements indisponibles → ne bloque pas l'activation (fail-open).
  }

  // ── PREFLIGHT DE CAPACITÉ (demande user 2026-07-10) : on refuse d'afficher
  //    « Activé » si l'agent n'a pas de quoi agir. Le plan d'action est déduit du
  //    modèle, à l'identique de la règle écrite plus bas. Un manque BLOQUANT
  //    empêche l'activation (l'UI ouvre une pop-up « il manque X ») ; les warnings
  //    laissent activer mais sont remontés (notifications, agenda, seuils). ───────
  let planAction: AgentActionType;
  let planRecipient: AgentRecipientKind;
  let planWatcher: WatcherKey | null = null;
  if (template.kind === "event" && template.watcher) {
    planWatcher = template.watcher;
    planAction = template.eventAction ?? getWatcher(template.watcher)?.suggestedAction ?? "notify";
    planRecipient = planAction === "send_email" ? "client" : "me";
  } else {
    planAction = template.scheduleAction ?? "report";
    planRecipient = planAction === "team_planning" ? "team" : "me";
  }
  const readiness = await checkAgentReadiness({
    supabase,
    tenantId,
    userId,
    userEmail,
    plan: { actionType: planAction, recipientKind: planRecipient, watcher: planWatcher },
    locale,
  });
  if (!readiness.ok) {
    return {
      ok: false,
      ruleId: null,
      blocked: true,
      gaps: readiness.gaps,
      message: `« ${template.name} » ne peut pas encore être activé : il manque ${summarizeGaps(
        readiness.gaps.filter((g) => g.severity === "block")
      )}. Corrigez cela puis réactivez-le.`,
    };
  }
  const warnNote = readiness.gaps.length ? ` À finir : ${summarizeGaps(readiness.gaps)}.` : "";

  const meta = { template_id: template.id } as unknown as Record<string, unknown>;

  // ── DÉCLENCHEUR ÉVÉNEMENTIEL (« dès qu'une fiche remplit la condition »). ──
  if (template.kind === "event" && template.watcher) {
    const watcher = getWatcher(template.watcher);
    if (!watcher) {
      return { ok: false, ruleId: null, message: "Ce modèle n'est pas disponible sur votre version." };
    }
    const days = template.eventDays && template.eventDays > 0 ? template.eventDays : watcher.defaultDays;
    const evType: AgentActionType = template.eventAction ?? watcher.suggestedAction;
    const complexity = template.complexity;
    const recipientKind: AgentRecipientKind = evType === "send_email" ? "client" : "me";
    const action: AgentAction = {
      type: evType,
      recipientKind,
      recipientName: "",
      recipients: [],
      contentInstruction: template.instruction,
      dataFocus: "",
      complexity,
      model: COMPLEXITY_MODEL[complexity],
      // Alerte patron (notify) = gabarit, 0 crédit ; relance/compte-rendu = rédaction.
      estimatedCreditsPerRun: estimateCreditsPerRun(evType),
    };
    const trigger: AgentTrigger = { watcher: watcher.key, params: { days }, scanEveryMinutes: 60 };

    const { data: inserted, error } = await supabase
      .from("agent_rules")
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        title: template.name,
        instruction: template.instruction.slice(0, 2000),
        trigger_type: "event",
        trigger: trigger as unknown as Record<string, unknown>,
        schedule: {} as unknown as Record<string, unknown>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action: action as any,
        status: "active",
        next_run_at: new Date().toISOString(), // évalué au prochain tick (≤ 5 min)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        meta: meta as any,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return { ok: false, ruleId: null, message: "Activation impossible à l'instant. Réessayez dans un moment." };
    }

    await attachSpecBestEffort(supabase, inserted.id, { trigger_type: "event", trigger, action });

    const actLabel =
      evType === "compte_rendu"
        ? "je rédige le compte-rendu et vous le retrouvez dans la Bibliothèque"
        : evType === "send_email"
          ? "je relance le client concerné par email"
          : "je vous préviens aussitôt";
    const message =
      `🤖 Agent activé : **${template.name}**. Je surveille ${watcher.watching} en continu — ` +
      `dès qu'une fiche correspond, ${actLabel}. Retrouvez-le dans **Agents**.${warnNote}`;
    return { ok: true, ruleId: inserted.id, message, gaps: readiness.gaps };
  }

  // ── DÉCLENCHEUR PLANIFIÉ (heure fixe). ────────────────────────────────────
  const schedule: AgentSchedule = { time: template.time ?? "09:00", days: template.days ?? [], tz: PARIS_TZ };
  const schedAction: AgentActionType = template.scheduleAction ?? "report";
  const isPlanning = schedAction === "team_planning";

  let recipients: AgentAction["recipients"] = [];
  let blockedReason: string | null = null;
  let missing: MissingInfo | null = null;
  // Le planning s'adresse à l'ÉQUIPE : on résout maintenant pour bloquer avec
  // une question claire plutôt qu'échouer au premier passage.
  const tplTeamFilter = parseTeamFilter(template.instruction);
  if (isPlanning) {
    const r = await resolveRecipients(supabase, tenantId, "team", "", userEmail, tplTeamFilter);
    if (r.ok) recipients = r.recipients;
    else {
      blockedReason = r.reason;
      missing = r.missing;
    }
  }

  const complexity = template.complexity;
  const action: AgentAction = {
    type: schedAction,
    recipientKind: isPlanning ? "team" : "me",
    recipientName: "",
    recipients,
    teamFilter: isPlanning ? tplTeamFilter : undefined,
    contentInstruction: template.instruction,
    dataFocus: template.dataFocus ?? "",
    complexity,
    model: COMPLEXITY_MODEL[complexity],
    // Le prix suit l'action (le planning est un gabarit → 0 crédit IA), pas la complexité.
    estimatedCreditsPerRun: estimateCreditsPerRun(schedAction),
  };

  const blocked = blockedReason !== null;
  const nextRun = blocked ? null : computeNextRun(schedule);

  const { data: inserted, error } = await supabase
    .from("agent_rules")
    .insert({
      tenant_id: tenantId,
      created_by: userId,
      title: template.name,
      instruction: template.instruction.slice(0, 2000),
      trigger_type: "schedule",
      schedule: schedule as unknown as Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      action: action as any,
      status: blocked ? "blocked" : "active",
      blocked_reason: blockedReason,
      missing: missing as unknown as Record<string, unknown> | null,
      next_run_at: nextRun ? nextRun.toISOString() : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      meta: meta as any,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, ruleId: null, message: "Activation impossible à l'instant. Réessayez dans un moment." };
  }

  await attachSpecBestEffort(supabase, inserted.id, { trigger_type: "schedule", schedule, action });

  const when = describeSchedule(schedule);
  const message = (blocked
    ? `🤖 Agent **${template.name}** créé (${when}), mais avant de démarrer : ${blockedReason}. Complétez dans **Agents** — je démarre dès que c'est bon.`
    : `🤖 Agent activé : **${template.name}** — ${when}. Premier passage : ${
        nextRun ? formatRunDate(nextRun) : "à planifier"
      }. Retrouvez-le dans **Agents**.`) + warnNote;
  return { ok: true, ruleId: inserted.id, blocked, message, gaps: readiness.gaps };
}
