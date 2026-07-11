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
import { TIER_MEDIUM } from "./models";
import { classifyKindHeuristic, looksLikePureQuestion, looksLikeCalendar } from "./kind-heuristic";
import type { BiltiaKind, KindResult } from "./kind-heuristic";

export { classifyKindHeuristic, looksLikePureQuestion };
export type { BiltiaKind, KindMethod, KindResult } from "./kind-heuristic";

// COMPRÉHENSION AVANT VITESSE (décision user 2026-07-07) : l'aiguillage et
// l'extraction agenda tournent sur Sonnet 5, pas sur Haiku. Une mauvaise
// compréhension coûte bien plus cher qu'un appel un peu plus lent/onéreux.
const KIND_MODEL = TIER_MEDIUM;

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

CONTEXTE — UNE APPLICATION (ou un document) EST DÉJÀ OUVERTE DANS L'ATELIER. Ta mission ici est AUSSI de dire si la demande VISE cette application, via le champ "targets_open_app" :

- targets_open_app = true UNIQUEMENT si la demande veut MODIFIER, corriger, compléter, refaire ou ajuster l'application ouverte : « ajoute un champ TVA », « change la couleur en bleu », « corrige le bouton qui ne marche pas », « mets un export PDF », « et si on ajoutait une colonne ? », « enlève la section du bas ». Là, choisis kind="module".

- targets_open_app = false pour TOUT LE RESTE — une demande qui n'a RIEN à voir avec l'application ouverte : une question générale (« quel taux de TVA ? », « c'est quoi la RE2020 ? », « j'ai combien de clients ? »), ou une tâche autonome (« écris-moi un mail pour mon client », « traduis ça en anglais », « fais-moi un devis », « rappelle-moi d'appeler le fournisseur demain », « raconte-moi une blague »). Là, ne choisis SURTOUT PAS "module" : classe la demande selon sa VRAIE nature (answer / email / document / calendar / data / rule), exactement comme s'il n'y avait aucune application ouverte. Biltia répondra alors EN CHAT, sans jamais toucher à l'application.

RÈGLE D'OR : on ne réécrit JAMAIS l'application pour une demande qui ne la concerne pas. Test simple : si la demande ne parle ni de l'app, ni d'un écran, ni d'un champ, ni d'un bouton, ni d'une couleur, ni d'une donnée affichée dedans → targets_open_app = false.`
    : "";
  return `Tu es l'AIGUILLEUR de Biltia, l'OS opérationnel du BTP. On te donne la demande d'un artisan/chef de chantier, dictée au micro ou tapée, en langage courant. Tu identifies la NATURE exacte du besoin et tu choisis le FORMAT DE SORTIE le plus efficace pour le résoudre. Tu ne résous rien toi-même : tu aiguilles.

LES 9 FORMATS :
- "answer" — l'utilisateur pose une QUESTION et attend une RÉPONSE en texte, tout de suite : réglementation (« quel taux de TVA pour une rénovation ? »), norme, délai, garantie, conseil métier, ou une question sur SES données (« j'ai combien de clients ? », « où en est le chantier Morel ? »). Il ne demande RIEN à produire.
- "calendar" — l'utilisateur veut CONSULTER son agenda (« qu'est-ce que j'ai lundi ? », « ma semaine ? », « mes rendez-vous ? »), AJOUTER un rendez-vous (« ajoute un RDV client mardi à 14h », « planifie une visite chantier jeudi 9h », « note un rendez-vous demain 10h »), OU TROUVER UN CRÉNEAU LIBRE / une disponibilité (« trouve-moi un créneau libre jeudi », « quand suis-je dispo cette semaine pour 2h ? », « propose un créneau au client »). C'est son agenda / son planning — ni une question de savoir métier ("answer") ni une écriture dans tes données workspace ("data").
- "email" — l'utilisateur veut ENVOYER un message/email à quelqu'un, MAINTENANT, une fois : « envoie un email à jean@x.fr pour lui dire que… », « écris à ce client qu'on passe lundi », « relance ce fournisseur par mail ». C'est le VERBE D'ENVOI (« envoie/écris/relance… par mail/email ») qui décide — même si le message PARLE de factures, de fichiers ou de chantiers : ça, c'est le CONTENU du mail, PAS un traitement de fichiers. Quand kind="email", remplis email_to (l'adresse ou le nom du destinataire), email_subject (objet court) et email_body (le corps complet, professionnel, prêt à envoyer).
- "task" — l'utilisateur veut ENVOYER un message MAINTENANT à un GROUPE de son workspace (pas à UNE personne précise : ça, c'est "email") : « envoie un message à TOUS MES CLIENTS pour le portes ouvertes vendredi », « préviens MON ÉQUIPE qu'on commence à 7h demain », « écris à MES FOURNISSEURS ». Biltia résout la liste dans le workspace, montre un APERÇU, et envoie seulement après validation. Remplis task_audience (all_clients / team / all_suppliers), email_subject (objet court) et email_body (le message complet, professionnel, prêt à envoyer). Ce qui décide : un VERBE D'ENVOI + une CIBLE COLLECTIVE. Un destinataire unique nommé → "email". Une récurrence (« …chaque lundi ») → "rule".
- "document" — l'utilisateur veut UN livrable officiel unique, à imprimer/envoyer/signer : avenant, PV de réception, mise en demeure, devis, facture, attestation (TVA…), courrier/relance, ordre de service, bon de commande, levée de réserves. Indices : « sors-moi l'avenant », « rédige une mise en demeure », « fais-lui signer », « attestation TVA », « un devis pour… » (un seul, pas un outil de gestion de devis).
- "action" — l'utilisateur a DES DONNÉES/FICHIERS EXISTANTS à traiter par lot, UNE fois, maintenant : vérifier, comparer, rapprocher, contrôler. Indices : « glisse tes 30 bons de livraison, je vérifie les prix vs devis », « compare ces factures », « détecte les erreurs ». Ce n'est JAMAIS « envoyer un email » (ça, c'est "email").
- "module" — l'utilisateur veut un OUTIL/APPLICATION pour capturer ou suivre de la donnée dans la durée : suivi de chantiers, pointage des heures, inventaire, CRM, planning, carnet d'entretien. Indices : « je veux un tableau/outil pour gérer/suivre… », « application de pointage ».
- "rule" — l'utilisateur DÉLÈGUE une mission PERMANENTE que Biltia devra exécuter SEUL, à répétition ou sur déclencheur, sans qu'il ait à redemander : « relance ce client tous les jours à midi », « chaque soir à 18h vérifie les pointages », « occupe-toi de relancer mes factures impayées », « préviens-moi dès qu'un document expire ». Indices décisifs : récurrence (« tous les jours », « chaque lundi », « chaque soir »), déclencheur (« dès que »), délégation (« occupe-toi de », « automatiquement »).
- "data" — l'utilisateur veut agir sur UNE FICHE de son workspace, MAINTENANT, une fois : ajouter (« ajoute un client Jean Dupont, 06 12 34 56 78 »), modifier (« mets à jour le téléphone de Karim », « passe le devis D-2026-04 en accepté », « le chantier Morel est à 80% »), supprimer (« supprime le client Martin »). Ni un outil, ni un document, ni une mission répétée : une écriture directe dans les données.

RÈGLE DE DÉPARTAGE :
- Une question qui attend un SAVOIR ou un CHIFFRE → "answer". Une demande qui attend une PRODUCTION (document, outil, traitement) → un des trois formats de production. Une demande de DÉLÉGUER une tâche répétitive → "rule".
- Un livrable UNIQUE à signer/envoyer → "document". Un OUTIL qui gère plusieurs entrées dans le temps → "module". La MÊME intention assortie d'une récurrence/délégation → "rule" (« relance-le » = document ; « relance-le chaque semaine » = rule).
- « un devis » (le document) = document ; « un outil de création de devis » = module ; « comment je fais un devis ? » = answer.
- « envoie un mail à Jean » = email (UNE personne) ; « envoie un mail à tous mes clients / à mon équipe » = task (un GROUPE résolu dans le workspace).
- En cas de doute réel entre document et module, choisis "module". En cas de doute entre answer et une production, choisis la production. "rule" UNIQUEMENT sur signal explicite de récurrence/déclencheur/délégation — jamais par défaut.
- « ajoute un client Jean » = data (une fiche) ; « ajoute un outil de gestion de clients » = module (un outil) ; « j'ai combien de clients ? » = answer (lecture). « Enregistre ce devis comme accepté » = data ; « fais-moi un devis » = document.

TON DES MESSAGES (email_body et le corps d'un task) : reste TOUJOURS professionnel, courtois et — si nécessaire — ferme, mais JAMAIS insultant, menaçant ni accusatoire. Même si l'utilisateur réclame un ton « agressif », « cash », ou de dire au client qu'il est « malhonnête » / « de mauvaise foi », tu REFORMULES en fermeté correcte : rappel factuel (montant, échéance dépassée, nombre de relances), demande claire de régularisation sous un délai, et mention des suites légales possibles le cas échéant — sans jamais dénigrer la personne. La fermeté vient des faits et de l'échéance, jamais de l'insulte.${modContext}

CAPACITÉS RÉELLES vs HORS PÉRIMÈTRE (champ "out_of_scope") :
Biltia sait faire ÉNORMÉMENT : créer des applications de gestion, produire des documents (devis, factures, PV, courriers…), envoyer des emails/SMS, lire/écrire l'agenda, gérer les données du workspace (clients, chantiers, devis, factures, stock, pointages…), et déléguer des missions à des agents de veille. Mets out_of_scope=true UNIQUEMENT si la demande exige quelque chose que Biltia ne PEUT PAS faire par nature :
- une action PHYSIQUE dans le monde réel (poser des câbles, conduire, être présent sur un chantier) ;
- du TEMPS RÉEL VOCAL / téléphonie (passer des appels ou répondre au téléphone à la place de l'artisan, tenir un standard vocal) ;
- de l'INGÉNIERIE SPÉCIALISÉE (calcul de structure, dimensionnement, DAO/BIM, calcul thermique certifié) ;
- du MATÉRIEL / capteurs / IoT / GPS que Biltia ne possède pas.
En cas de DOUTE, out_of_scope=false — ne refuse JAMAIS par excès de prudence une demande que Biltia sait faire.
"oos_alternative" : UNIQUEMENT si out_of_scope=true — une phrase courte proposant ce que Biltia SAIT réellement faire et qui se rapproche du besoin (ex : au lieu de répondre au téléphone → « envoyer un SMS ou un email de rappel automatique à chaque appel manqué » ; au lieu de dessiner un plan → « stocker et annoter la photo du plan sur le chantier »). Laisse "" s'il n'y a honnêtement aucune alternative.

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
        enum: ["answer", "document", "action", "module", "rule", "data", "email", "calendar", "task"],
        description: "Format de sortie chirurgical.",
      },
      task_audience: {
        type: "string",
        enum: ["all_clients", "team", "all_suppliers", ""],
        description:
          "Si kind=task : le GROUPE destinataire. all_clients = tous les clients ; team = l'équipe / tous les employés ; all_suppliers = tous les fournisseurs. Pour task, remplis aussi email_subject et email_body (le message). Vide sinon.",
      },
      doc_type: {
        type: "string",
        description: "Sous-type de document si kind=document (avenant, pv_reception, mise_en_demeure, devis, facture, attestation, courrier, …). Vide sinon.",
      },
      email_to: {
        type: "string",
        description: "Si kind=email : adresse ou nom du destinataire. Vide sinon.",
      },
      email_subject: {
        type: "string",
        description: "Si kind=email : objet court de l'email. Vide sinon.",
      },
      email_body: {
        type: "string",
        description: "Si kind=email : corps complet de l'email, professionnel, prêt à envoyer. Vide sinon.",
      },
      targets_open_app: {
        type: "boolean",
        description:
          "UNIQUEMENT quand une application est déjà ouverte : true si la demande veut MODIFIER/compléter cette application ouverte, false si elle n'a rien à voir avec elle (question, autre tâche, hors-sujet — on répond alors en chat sans toucher à l'app). Aucune application ouverte → false.",
      },
      out_of_scope: {
        type: "boolean",
        description:
          "true UNIQUEMENT si la demande sort des capacités réelles de Biltia (action physique, téléphonie/vocal en temps réel, ingénierie/calcul spécialisé, matériel/IoT). En cas de doute : false.",
      },
      oos_alternative: {
        type: "string",
        description:
          "Si out_of_scope=true : phrase courte proposant ce que Biltia SAIT réellement faire, proche du besoin. Vide s'il n'y a aucune alternative, ou si out_of_scope=false.",
      },
      confidence: {
        type: "number",
        description: "Confiance de 0 à 1.",
      },
    },
    required: ["kind", "doc_type", "email_to", "email_subject", "email_body", "task_audience", "targets_open_app", "out_of_scope", "oos_alternative", "confidence"],
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

  const input = block.input as {
    kind?: string;
    doc_type?: string;
    email_to?: string;
    email_subject?: string;
    email_body?: string;
    task_audience?: string;
    targets_open_app?: boolean;
    out_of_scope?: boolean;
    oos_alternative?: string;
    confidence?: number;
  };
  if (
    input.kind !== "answer" &&
    input.kind !== "document" &&
    input.kind !== "action" &&
    input.kind !== "module" &&
    input.kind !== "rule" &&
    input.kind !== "data" &&
    input.kind !== "email" &&
    input.kind !== "calendar" &&
    input.kind !== "task"
  ) {
    return null;
  }

  const docType = input.kind === "document" ? input.doc_type?.trim() || null : null;
  const email =
    input.kind === "email"
      ? {
          to: (input.email_to ?? "").trim(),
          subject: (input.email_subject ?? "").trim(),
          body: (input.email_body ?? "").trim(),
        }
      : undefined;
  const task =
    input.kind === "task"
      ? {
          audience: (input.task_audience ?? "").trim(),
          subject: (input.email_subject ?? "").trim(),
          body: (input.email_body ?? "").trim(),
        }
      : undefined;
  return {
    kind: input.kind,
    docType,
    email,
    task,
    targetsOpenApp: typeof input.targets_open_app === "boolean" ? input.targets_open_app : undefined,
    outOfScope: input.out_of_scope === true,
    oosAlternative: typeof input.oos_alternative === "string" ? input.oos_alternative.trim() : "",
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
  // On ne court-circuite le modèle QUE pour une pure question d'information : là
  // l'heuristique fait autorité (et le garde-fou « une question ne devient jamais
  // une production » l'exige de toute façon). Pour TOUT le reste — création,
  // document, agent, données — on consulte Sonnet plutôt que de trancher sur des
  // mots-clés. C'est ce qui sortait l'IA de ses cases : la confiance heuristique
  // (≥ 0.8) ne suffit plus à sauter la vraie compréhension (décision 2026-07-07).
  const heuristicIsSure = !looksLikeCalendar(prompt) && looksLikePureQuestion(prompt);

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

// ── EXTRACTION AGENDA (dédiée) ────────────────────────────────────────────────
// Le classifieur route "calendar" ; ici on décide lecture vs création et on
// extrait les détails d'un RDV. Appel FOCALISÉ (tool simple, non surchargé) =
// fiable là où le classifieur généraliste (7 formats + champs email) déraillait.
const CAL_TOOL = {
  name: "plan_calendar",
  description: "Décide si la demande consulte l'agenda, crée un événement, ou cherche un créneau libre, et extrait les détails.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["read", "create", "find_slot"],
        description:
          "read = consulter l'agenda. create = ajouter un rendez-vous. find_slot = TROUVER un créneau LIBRE / proposer une disponibilité (« trouve-moi un créneau libre jeudi », « quand suis-je dispo cette semaine pour 2h ? », « propose un créneau au client »).",
      },
      summary: { type: "string", description: "Titre court de l'événement (si create)." },
      start: {
        type: "string",
        description:
          "Heure locale 'YYYY-MM-DDTHH:MM:SS'. Si create : début du RDV. Si find_slot : DÉBUT de la fenêtre de recherche (défaut = maintenant).",
      },
      end: {
        type: "string",
        description:
          "Heure locale 'YYYY-MM-DDTHH:MM:SS'. Si create : fin du RDV (défaut +1h). Si find_slot : FIN de la fenêtre de recherche (défaut +14 jours).",
      },
      duration_min: {
        type: "integer",
        description: "Si find_slot : durée souhaitée du créneau en minutes (défaut 120). Ex : « 2h » → 120, « une demi-journée » → 240.",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
} as Anthropic.Tool;

export type CalendarIntent =
  | { action: "read" }
  | { action: "create"; summary: string; start: string; end: string }
  | { action: "find_slot"; durationMin: number; fromISO: string; toISO: string };

/** Décide lecture/création/recherche de créneau + extrait les détails. Repli sûr sur "read". */
export async function extractCalendarEvent(prompt: string): Promise<CalendarIntent> {
  try {
    const client = new Anthropic();
    const now = new Date().toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const message = await client.messages.create({
      model: KIND_MODEL,
      max_tokens: 300,
      system: `Tu extrais l'intention agenda d'un artisan du BTP.
Date et heure actuelles (Europe/Paris) : ${now}.
- Si la demande CONSULTE l'agenda (« qu'est-ce que j'ai… », « ma semaine ») → action="read".
- Si elle AJOUTE un rendez-vous (« ajoute/planifie/note un RDV… ») → action="create", avec summary (titre court, ex : « RDV client Morel »), start et end en HEURE LOCALE « YYYY-MM-DDTHH:MM:SS » (durée 1 h par défaut). Résous les dates relatives (« mardi », « demain 9h », « la semaine prochaine ») à partir de la date actuelle ci-dessus.
- Si elle cherche une DISPONIBILITÉ / un CRÉNEAU LIBRE (« trouve-moi un créneau », « quand suis-je dispo », « propose un créneau au client ») → action="find_slot", avec start/end délimitant la fenêtre de recherche (défaut : de maintenant à +14 jours) et duration_min (défaut 120).
Réponds uniquement via l'outil plan_calendar.`,
      tools: [CAL_TOOL],
      tool_choice: { type: "tool", name: "plan_calendar" },
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return { action: "read" };
    const i = block.input as { action?: string; summary?: string; start?: string; end?: string; duration_min?: number };
    if (i.action === "create") {
      return {
        action: "create",
        summary: (i.summary ?? "").trim(),
        start: (i.start ?? "").trim(),
        end: (i.end ?? "").trim(),
      };
    }
    if (i.action === "find_slot") {
      const dur = Number(i.duration_min);
      return {
        action: "find_slot",
        durationMin: Number.isFinite(dur) && dur > 0 ? Math.floor(dur) : 120,
        fromISO: (i.start ?? "").trim(),
        toISO: (i.end ?? "").trim(),
      };
    }
    return { action: "read" };
  } catch {
    return { action: "read" }; // repli sûr : au pire, on lit l'agenda
  }
}

/** Garde-fou : normalise une valeur `kind` reçue du client (modification/auto-fix). */
export function coerceKind(value: unknown): BiltiaKind | null {
  return value === "document" || value === "action" || value === "module" ? value : null;
}
