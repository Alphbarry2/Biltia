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
import { TIER_SIMPLE, TIER_MEDIUM, TIER_COMPLEX } from "./models";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEntitlementsForTenant } from "./entitlements";
import { isFounderEmail } from "./founder";
import { WATCHER_KEYS, getWatcher, type WatcherKey } from "./agent-watchers";
import type { AgentTemplate } from "./agent-templates";

// COMPRÉHENSION AVANT VITESSE (2026-07-07) : le recruteur d'agents lit la mission
// avec Sonnet 5, pas Haiku. Comprendre la vraie intention (« relance mon ami tous
// les jours ») vaut mieux qu'un parsing rapide et bête. (L'EXÉCUTION garde son
// palier par complexité ci-dessous : un simple rappel reste sur Haiku.)
const PARSE_MODEL = TIER_MEDIUM;
const PARIS_TZ = "Europe/Paris";

// ── Types ────────────────────────────────────────────────────────────────────

export type AgentActionType = "send_email" | "notify" | "report" | "team_planning" | "compte_rendu";
export type AgentRecipientKind = "client" | "employee" | "team" | "me";
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
// Alignées sur le DÉBIT RÉEL constaté (coût mesuré × creditsForCost, arrondi
// au palier de 5) ET sur la page tarifs publique — annoncer 5 et débiter 10
// serait la surprise qu'on a juré d'éviter.
export const COMPLEXITY_ESTIMATE: Record<AgentComplexity, number> = {
  simple: 10,   // message/rappel bref, une lecture ciblée (Haiku)
  medium: 25,   // contrôle d'une partie du workspace + rédaction (Sonnet)
  complex: 50,  // analyse transversale/raisonnement lourd (Opus)
};

/** Passages par mois selon le planning (tous les jours = ~30). */
export function runsPerMonth(days: number[]): number {
  const d = (days ?? []).filter((x) => x >= 1 && x <= 7);
  return d.length === 0 ? 30 : Math.round(d.length * 4.33);
}

export type AgentSchedule = {
  /** "HH:MM" heure de Paris. */
  time: string;
  /** Jours ISO 1 (lundi) → 7 (dimanche). Vide = tous les jours. */
  days: number[];
  tz: string;
};

export type AgentAction = {
  type: AgentActionType;
  recipientKind: AgentRecipientKind;
  /** Nom dicté (« Martin ») — résolu contre le workspace à la création. */
  recipientName: string;
  /** Destinataires résolus : [{ name, email, entity, id }]. */
  recipients: { name: string; email: string; entity: string; id: string }[];
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
      action_type: {
        type: "string",
        enum: ["send_email", "notify", "report", "team_planning"],
        description:
          "send_email = écrire à un client/employé. notify = rappel/alerte push à l'utilisateur lui-même. report = examiner les données du workspace et envoyer la synthèse à l'utilisateur. team_planning = récupérer le planning (agenda) et l'envoyer aux ÉQUIPES (« que mes équipes reçoivent leur planning », « envoie le planning de la semaine aux gars »).",
      },
      recipient_kind: {
        type: "string",
        enum: ["client", "employee", "team", "me"],
        description: "Destinataire. team = tous les employés. me = l'utilisateur.",
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
        enum: ["chantier_en_retard", "chantier_hors_budget", "chantier_sans_activite", "chantier_sans_devis", "demande_urgente", "devis_non_signe", "facture_impayee", "echeance_proche", "visite_terminee", "stock_bas", ""],
        description:
          "OBLIGATOIRE si trigger_type=event : le veilleur qui colle. chantier_en_retard = chantiers qui dépassent leur DATE de fin prévue. chantier_hors_budget = chantiers dont le BUDGET/coût engagé dépasse le budget prévu (marge, rentabilité, « dépasse son budget »). chantier_sans_activite = chantiers en cours qui N'AVANCENT PLUS / stagnent / pas bougé depuis X jours. chantier_sans_devis = chantiers démarrés SANS devis signé (accepté). demande_urgente = demandes/interventions clients URGENTES restées sans réponse (SAV, dépannage urgent, « alerte-moi si une demande urgente traîne » — l'IA lit la description pour juger l'urgence). devis_non_signe = devis envoyés sans réponse. facture_impayee = factures échues non payées / impayés / relances de paiement. echeance_proche = documents, attestations, assurances, contrats d'entretien ou entretiens qui arrivent à échéance / expirent. visite_terminee = une intervention/visite chantier vient d'être TERMINÉE (« génère un compte-rendu après chaque visite »). Vide si trigger_type=schedule.",
      },
      event_days: {
        type: "integer",
        description:
          "Paramètre en jours du veilleur si trigger_type=event (0 = défaut). devis_non_signe : jours d'attente avant de relancer (défaut 7). facture_impayee : jours de tolérance après l'échéance (défaut 0). echeance_proche : fenêtre d'alerte avant l'échéance (défaut 30). chantier_en_retard : jours de tolérance (défaut 0). chantier_sans_activite : jours sans activité avant l'alerte (défaut 3). chantier_sans_devis : jours de tolérance après le démarrage (défaut 0). chantier_hors_budget : EXCEPTION — ce nombre est un POURCENTAGE de dépassement toléré (ex : « au-delà de 10 % » → 10 ; défaut 0 = dès le premier euro). Mets 0 si l'utilisateur ne précise rien.",
      },
    },
    required: ["title", "action_type", "recipient_kind", "recipient_name", "time", "days", "content_instruction", "content_missing", "data_focus", "complexity", "trigger_type", "event_watcher", "event_days"],
    additionalProperties: false,
  },
};

const PARSE_SYSTEM = `Tu es le RECRUTEUR d'agents de Biltia, l'OS opérationnel du BTP. L'utilisateur (artisan/chef d'entreprise) dicte une MISSION PERMANENTE en langage courant — une tâche que Biltia devra exécuter seul, à répétition, en temps et en heure. Tu la transformes en règle structurée. Tu ne résous rien : tu structures.

REPÈRES :
- « relance/écris/envoie un mail à [client X] » → send_email, recipient_kind=client.
- « rappelle-moi / préviens-moi / alerte-moi » → notify (notification à l'utilisateur), recipient_kind=me.
- « vérifie / contrôle / surveille [mes données] » → report (examen du workspace + synthèse à l'utilisateur), recipient_kind=me.
- « mes employés / l'équipe / les gars » → recipient_kind=team.
- « à midi » = 12:00, « le matin » = 09:00, « le soir » = 18:00. Heure de Paris. Aucune heure dictée → 09:00.
- « tous les jours » / rien de précisé → days VIDE. « chaque lundi » → [1]. « en semaine » → [1,2,3,4,5].

DÉCLENCHEUR — HEURE FIXE ou ÉVÉNEMENT ? (décisif)
- trigger_type="schedule" quand la mission tourne à HEURE/JOUR FIXE : « tous les jours à midi », « chaque lundi matin », « le soir à 18h », « chaque fin de mois ». Remplis alors time/days ; laisse event_watcher vide et event_days=0.
- trigger_type="event" quand la mission SURVEILLE une CONDITION et se déclenche DÈS QU'une fiche y correspond, sans horaire : choisis event_watcher :
  • « dès qu'un chantier prend du retard », « préviens-moi quand un chantier dépasse la date de fin », « quels chantiers sont en retard » → chantier_en_retard.
  • « préviens-moi si un chantier dépasse son budget », « alerte-moi quand un chantier n'est plus rentable », « surveille la marge des chantiers » → chantier_hors_budget (event_days = % de dépassement toléré si précisé, ex « au-delà de 10 % » → 10, sinon 0).
  • « préviens-moi si un chantier n'avance pas depuis 3 jours », « quand un chantier stagne / est au point mort / ne bouge plus » → chantier_sans_activite (event_days = nb de jours sans activité, ex « 3 jours » → 3, sinon 0).
  • « préviens-moi si un chantier démarre sans devis signé », « alerte-moi quand un chantier commence sans devis accepté » → chantier_sans_devis.
  • « alerte-moi si une demande client urgente reste sans réponse », « préviens-moi dès qu'un SAV / dépannage urgent traîne », « signale les interventions urgentes en attente » → demande_urgente (l'IA lira la description de chaque demande pour juger l'urgence).
  • « relance les devis non signés », « suis les devis restés sans réponse », « occupe-toi des devis en attente » → devis_non_signe (event_days = délai d'attente avant relance si précisé, sinon 0).
  • « relance mes impayés », « occupe-toi des factures impayées », « quand une facture n'est pas payée à l'échéance » → facture_impayee.
  • « préviens-moi quand un document / une attestation / une assurance / un contrat va expirer », « alerte-moi avant une échéance d'entretien » → echeance_proche (event_days = combien de jours avant si précisé, sinon 0).
  • « préviens-moi quand un matériau passe sous son seuil », « alerte-moi quand je suis bientôt en rupture », « surveille mon stock », « dis-moi quand je manque de placo / d'un matériau » → stock_bas.
  • « génère un compte-rendu après chaque visite chantier », « quand une intervention est terminée, fais le compte-rendu », « je veux mes comptes-rendus automatiquement après les visites » → visite_terminee (Biltia rédige le compte-rendu de CHAQUE intervention terminée et le range dans la bibliothèque). C'est un event, PAS un planning.
  Pour un event, time/days sont ignorés (mets time="09:00", days=[]).
- action_type pour un event : « préviens-moi / alerte-moi / je veux savoir » → notify. « relance / relance les clients / envoie-leur » → send_email (Biltia écrira au client concerné de chaque fiche). Pour visite_terminee, laisse action_type=notify (Biltia sait qu'il doit générer le compte-rendu). content_missing reste false pour un event (le contenu se déduit de la fiche déclenchante).

PLANNING AUX ÉQUIPES (cas à part, PLANIFIÉ) : « je veux que mes équipes reçoivent leur planning sans que j'y pense », « tous les vendredis à 18h envoie le planning de la semaine aux gars », « transmets le planning à l'équipe chaque lundi » → trigger_type=schedule (c'est récurrent à heure fixe), action_type=team_planning, recipient_kind=team. Biltia RÉCUPÈRE le planning existant (agenda Google connecté et/ou interventions du workspace) et le TRANSMET à l'équipe — il ne l'invente pas. Remplis time/days selon la récurrence dictée (« vendredi 18h » → time="18:00", days=[5]).

CONTEXTE (comme un employé, ne rien inventer) : si la mission dit d'ENVOYER un message/mail mais ne dit PAS quoi dire, mets content_missing=true — Biltia demandera « quel message ? » plutôt que d'inventer. Si le contenu est explicite ou déductible d'une donnée du workspace (« relance le devis en attente », « rappelle-moi de faire mes factures », « vérifie mes impayés et fais le point »), content_missing=false.

Réponds UNIQUEMENT en appelant l'outil parse_rule.`;

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

  // Action + destinataire.
  let actionType: AgentActionType = "notify";
  let recipientKind: AgentRecipientKind = "me";
  if (/(relance|ecris a|envoie (un )?(mail|email|message) a)/.test(text)) {
    actionType = "send_email";
    recipientKind = /employe|equipe|salarie|ouvrier|chef de chantier|les gars/.test(text) ? "team" : "client";
  } else if (/(verifie|controle|surveille|examine)/.test(text)) {
    actionType = "report";
  }
  // Planning aux équipes (récurrent, planifié) : récupère l'agenda et le transmet.
  if (/planning/.test(text) && /(equipe|equipes|gars|salarie|ouvrier|team|compagnon|les gars)/.test(text)) {
    actionType = "team_planning";
    recipientKind = "team";
  }

  const nameMatch = /client(?:e)?\s+([a-z][a-z' -]{1,40}?)(?=\s+(?:tous|chaque|a \d|le \d|du lundi|en semaine|$)|[,.!]|$)/.exec(text);

  // « envoie un message à X » sans dire QUOI → contenu manquant. Conservateur :
  // dès qu'un indice de contenu est présent (pour, dis-lui, relance, :…), false.
  const contentMissing =
    actionType !== "report" &&
    /(envoi|ecris|message|mail|email)/.test(text) &&
    !/(pour |dis|dire|relance|que |:|disant|rappelle-moi de|previe|signal|demande)/.test(text);

  // ── ÉVÉNEMENT (déclencheur) : condition métier sans horaire ────────────────
  let triggerType: AgentTriggerType = "schedule";
  let eventWatcher: WatcherKey | null = null;
  // Chantier : lever l'ambiguïté « dépasse le budget » vs « dépasse la date » —
  // budget/marge et stagnation AVANT le retard générique.
  if (/chantier/.test(text) && /(budget|marge|rentab|deficit)/.test(text)) {
    eventWatcher = "chantier_hors_budget";
  } else if (/chantier/.test(text) && /(avance pas|n'avance|navance|stagne|au point mort|pas bouge|ne bouge|sans activite|sans avancement|a l'arret|a l'arrêt|arrete)/.test(text)) {
    eventWatcher = "chantier_sans_activite";
  } else if (/chantier/.test(text) && /(sans devis|pas de devis|devis (signe|accepte)|demarre sans|commence sans)/.test(text)) {
    eventWatcher = "chantier_sans_devis";
  } else if (/chantier/.test(text) && /(retard|en retard|depasse|deborde|date de fin|delai|deadline)/.test(text)) {
    eventWatcher = "chantier_en_retard";
  } else if (/(urgent|urgence|priorite|en catastrophe)/.test(text) && /(demande|intervention|client|sav|depannage|appel|ticket|message|dossier)/.test(text)) {
    eventWatcher = "demande_urgente";
  } else if (/(impaye|impayes|pas paye|non paye)/.test(text) || (/facture/.test(text) && /(echeance|relance|paiement|paye)/.test(text))) {
    eventWatcher = "facture_impayee";
  } else if (/devis/.test(text) && /(non signe|pas signe|sans reponse|non accepte|en attente|pas repondu|relance|signature)/.test(text)) {
    eventWatcher = "devis_non_signe";
  } else if (/(expire|expiration|va expirer|arrive a echeance|echeance)/.test(text) && !/facture/.test(text)) {
    eventWatcher = "echeance_proche";
  } else if (/(compte[- ]rendu|compte rendu)/.test(text) && /(visite|intervention|chantier|apres|terminee|termine|fini)/.test(text)) {
    eventWatcher = "visite_terminee";
  }
  // team_planning est PLANIFIÉ (récurrent), jamais un event → ne bascule pas.
  if (eventWatcher && actionType !== "team_planning") {
    triggerType = "event";
    // Action : le veilleur suggère, mais « préviens/alerte » force la notification.
    const w = getWatcher(eventWatcher);
    actionType = /(previens|previen|alerte|signale|rappelle|je veux savoir)/.test(text)
      ? "notify"
      : (w?.suggestedAction ?? "notify");
  } else {
    eventWatcher = null;
  }

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
    // Repli prudent : un contrôle de données = medium, un message = simple.
    complexity: actionType === "report" ? "medium" : "simple",
    triggerType,
    eventWatcher,
    eventDays: 0,
  };
}

/** Parse l'instruction : Haiku si clé dispo, repli heuristique sinon/en erreur. */
export async function parseInstruction(instruction: string): Promise<ParsedRule> {
  const hasKey =
    !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");
  if (!hasKey) return parseInstructionHeuristic(instruction);

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: PARSE_MODEL,
      max_tokens: 512,
      system: PARSE_SYSTEM,
      tools: [PARSE_TOOL],
      tool_choice: { type: "tool", name: "parse_rule" },
      messages: [{ role: "user", content: `Mission dictée : « ${instruction} »` }],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return parseInstructionHeuristic(instruction);

    const i = block.input as Record<string, unknown>;
    const actionType: AgentActionType =
      i.action_type === "send_email" ||
      i.action_type === "notify" ||
      i.action_type === "report" ||
      i.action_type === "team_planning"
        ? i.action_type
        : "notify";
    const recipientKind =
      i.recipient_kind === "client" || i.recipient_kind === "employee" || i.recipient_kind === "team" || i.recipient_kind === "me"
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
    const triggerType: AgentTriggerType = i.trigger_type === "event" && eventWatcher ? "event" : "schedule";
    const eventDays = triggerType === "event" && typeof i.event_days === "number" && i.event_days >= 0
      ? Math.min(365, Math.floor(i.event_days))
      : 0;

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
  creatorEmail: string | null
): Promise<ResolveResult> {
  if (kind === "me") {
    if (!creatorEmail) {
      return { ok: false, reason: "votre adresse email est introuvable", missing: null };
    }
    return { ok: true, recipients: [{ name: "vous", email: creatorEmail, entity: "me", id: "" }] };
  }

  if (kind === "team") {
    const { data } = await supabase
      .from("employees")
      .select("id, nom, prenom, email")
      .eq("tenant_id", tenantId)
      .limit(100);
    const rows = (data ?? []) as { id: string; nom: string; prenom: string | null; email: string | null }[];
    const withEmail = rows.filter((r) => r.email && r.email.includes("@"));
    if (rows.length === 0) {
      return {
        ok: false,
        reason: "aucun employé dans votre workspace",
        missing: { entity: "employees", id: null, name: "équipe", field: "fiche" },
      };
    }
    if (withEmail.length === 0) {
      return {
        ok: false,
        reason: "aucun de vos employés n'a d'adresse email renseignée",
        missing: { entity: "employees", id: null, name: "équipe", field: "email" },
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

  // client | employee — recherche par nom.
  const table = kind === "client" ? "clients" : "employees";
  const label = kind === "client" ? "client" : "employé";
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

// ── Création (orchestration) ─────────────────────────────────────────────────

export type CreateRuleResult = {
  ok: boolean;
  ruleId: string | null;
  blocked: boolean;
  /** Message prêt pour le chat (« jamais muet »). */
  message: string;
  usage?: ParsedRule["usage"];
};

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
}): Promise<CreateRuleResult> {
  const { supabase, userId, userEmail, tenantId, instruction } = opts;

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

  // ── PLAN : sur Free, un agent qui AGIT (relance email, compte-rendu, rapport,
  //    planning équipe) est réservé à Pro. L'ALERTE (notify) reste gratuite —
  //    « le Free goûte, le Pro exécute ». Fondateur exempté (test). ──────────────
  if (isFreePlan && !isFounderEmail(userEmail)) {
    const willAct =
      parsed.actionType === "send_email" ||
      parsed.actionType === "report" ||
      parsed.actionType === "team_planning" ||
      parsed.actionType === "compte_rendu" ||
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
      const canRelanceClient = watcher.key === "devis_non_signe" || watcher.key === "facture_impayee";
      // Veilleur « jugé par IA » : alerte patron, mais l'examen (lecture + jugement)
      // a un coût → notify PAYANT (pas gratuit comme un digest par gabarit).
      const isJudged = !!watcher.aiJudge;
      if (watcher.key === "visite_terminee") {
        evType = "compte_rendu";
        complexity = "medium";
        evRecipientKind = "me";
      } else if (parsed.actionType === "send_email" && canRelanceClient) {
        evType = "send_email";
        complexity = "medium";
        evRecipientKind = "client";
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
        // Alerte patron par gabarit = 0 crédit ; alerte JUGÉE par IA ≈ simple ;
        // relance client / compte-rendu = IA (~medium).
        estimatedCreditsPerRun:
          evType === "notify"
            ? isJudged
              ? COMPLEXITY_ESTIMATE.simple
              : 0
            : COMPLEXITY_ESTIMATE[complexity],
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
          status: "active",
          next_run_at: new Date().toISOString(), // évalué dès le prochain tick (≤ 5 min)
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

      const daysNote = watcher.daysMeaning && days > 0 ? ` (${days} ${watcher.daysMeaning})` : "";
      const actLabel =
        evType === "compte_rendu"
          ? "je rédige le compte-rendu et vous le retrouvez dans la Bibliothèque"
          : evType === "send_email"
            ? "je relance le client concerné par email"
            : isJudged
              ? "je lis chaque nouvelle fiche pour juger, et je vous préviens seulement sur les vrais cas"
              : "je vous préviens aussitôt";
      // Transparence : un veilleur jugé par IA consomme un peu à chaque examen.
      const judgeNote = isJudged
        ? ` L'analyse coûte ~${COMPLEXITY_ESTIMATE.simple} crédits par lot de nouvelles fiches (le débit réel fait foi).`
        : "";
      const message =
        `🤖 Agent recruté : **${title}**. Je surveille ${watcher.watching}${daysNote} en continu — ` +
        `dès qu'une fiche correspond, ${actLabel}. Chaque fiche n'est traitée qu'une fois (pas de spam).${judgeNote} ` +
        `Retrouvez-le dans **Agents**.`;
      return { ok: true, ruleId: insertedEvt.id, blocked: false, message, usage: parsed.usage };
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
  if (parsed.actionType === "send_email" || parsed.actionType === "team_planning") {
    // Le planning s'adresse à l'ÉQUIPE quoi qu'il arrive.
    const kind: AgentRecipientKind = parsed.actionType === "team_planning" ? "team" : parsed.recipientKind;
    const r = await resolveRecipients(supabase, tenantId, kind, parsed.recipientName, userEmail);
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
    contentInstruction: parsed.contentInstruction,
    dataFocus: parsed.dataFocus,
    complexity: parsed.complexity,
    model: COMPLEXITY_MODEL[parsed.complexity],
    // Le planning est assemblé par gabarit (agenda déjà formaté) → 0 crédit IA.
    estimatedCreditsPerRun: isPlanning ? 0 : COMPLEXITY_ESTIMATE[parsed.complexity],
  };

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

  const planning = describeSchedule(schedule);
  // Transparence prix : estimation annoncée AU RECRUTEMENT (le débit réel,
  // calculé sur le coût mesuré de chaque passage, fait foi et est visible
  // dans Agents). Jamais de surprise.
  const perMonth = action.estimatedCreditsPerRun * runsPerMonth(parsed.days);
  const priceLine = `Coût estimé : ~${action.estimatedCreditsPerRun} crédits par passage (~${perMonth}/mois — ajusté au réel, visible dans **Agents**).`;
  let message: string;
  if (blocked) {
    const hint =
      missing?.field === "email"
        ? ` Donnez-moi l'email (ex : « son email est jean@exemple.fr ») ou complétez la fiche dans le Workspace — je démarre dès que je l'ai.`
        : missing?.field === "content"
          ? ` Dites-moi quoi envoyer (ex : « demande-lui une photo du chantier ») dans **Agents** — je démarre dès que je l'ai.`
          : "";
    message = `🤖 Agent recruté : **${parsed.title}** (${planning}). ${priceLine} ⚠️ Mais avant de démarrer : ${blockedReason}.${hint} Retrouvez cet agent dans **Agents**.`;
  } else {
    message = `🤖 Agent recruté : **${parsed.title}** — ${planning}. Premier passage : ${
      nextRun ? formatRunDate(nextRun) : "à planifier"
    }. ${priceLine} Je m'en occupe.`;
  }

  return { ok: true, ruleId: inserted.id, blocked, message, usage: parsed.usage };
}

// ── Activation d'un AGENT PRÊT À L'EMPLOI (template) ──────────────────────────

export type ActivateTemplateResult = {
  ok: boolean;
  ruleId: string | null;
  /** true = le même modèle était déjà dans les agents du tenant (pas de doublon). */
  alreadyActive?: boolean;
  /** true = créé mais en attente (ex : équipe sans email pour le planning). */
  blocked?: boolean;
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
}): Promise<ActivateTemplateResult> {
  const { supabase, userId, userEmail, tenantId, template } = opts;

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
      // Alerte patron (notify) = gabarit, 0 crédit ; relance/compte-rendu = IA.
      estimatedCreditsPerRun: evType === "notify" ? 0 : COMPLEXITY_ESTIMATE[complexity],
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

    const actLabel =
      evType === "compte_rendu"
        ? "je rédige le compte-rendu et vous le retrouvez dans la Bibliothèque"
        : evType === "send_email"
          ? "je relance le client concerné par email"
          : "je vous préviens aussitôt";
    const message =
      `🤖 Agent activé : **${template.name}**. Je surveille ${watcher.watching} en continu — ` +
      `dès qu'une fiche correspond, ${actLabel}. Retrouvez-le dans **Agents**.`;
    return { ok: true, ruleId: inserted.id, message };
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
  if (isPlanning) {
    const r = await resolveRecipients(supabase, tenantId, "team", "", userEmail);
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
    contentInstruction: template.instruction,
    dataFocus: template.dataFocus ?? "",
    complexity,
    model: COMPLEXITY_MODEL[complexity],
    // Le planning est assemblé par gabarit (agenda déjà formaté) → 0 crédit IA.
    estimatedCreditsPerRun: isPlanning ? 0 : COMPLEXITY_ESTIMATE[complexity],
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

  const when = describeSchedule(schedule);
  const message = blocked
    ? `🤖 Agent **${template.name}** créé (${when}), mais avant de démarrer : ${blockedReason}. Complétez dans **Agents** — je démarre dès que c'est bon.`
    : `🤖 Agent activé : **${template.name}** — ${when}. Premier passage : ${
        nextRun ? formatRunDate(nextRun) : "à planifier"
      }. Retrouvez-le dans **Agents**.`;
  return { ok: true, ruleId: inserted.id, blocked, message };
}
