// ─────────────────────────────────────────────────────────────────────────────
// HEURISTIQUE D'AIGUILLAGE — pure, sans SDK, importable côté CLIENT comme
// serveur. Le client s'en sert pour choisir l'UI d'attente (bulle « je
// réponds » vs écran de construction) sans attendre le serveur.
// La partie LLM (Haiku) vit dans kind-router.ts (serveur uniquement).
// ─────────────────────────────────────────────────────────────────────────────

export type BiltiaKind = "answer" | "document" | "action" | "module" | "rule" | "data" | "email" | "calendar" | "task" | "image";

export type KindMethod = "llm" | "heuristic" | "default";

export type KindResult = {
  /** Format de sortie chirurgical retenu. */
  kind: BiltiaKind;
  /** Sous-type de document quand `kind === "document"` (slug court), sinon null. */
  docType: string | null;
  /** Destinataire + objet + corps extraits quand `kind === "email"`. */
  email?: { to: string; subject: string; body: string };
  /** Audience (groupe workspace) + objet + corps quand `kind === "task"` (envoi groupé). */
  task?: { audience: string; subject: string; body: string };
  /** Quand une app est ouverte : true si la demande veut MODIFIER cette app,
   *  false si elle n'a rien à voir avec elle (question, autre tâche, hors-sujet).
   *  Absent (undefined) quand la décision vient de l'heuristique (pas de signal). */
  targetsOpenApp?: boolean;
  /** true si la demande sort des CAPACITÉS réelles de Biltia (action physique,
   *  temps réel vocal/téléphonie, ingénierie/calcul spécialisé, matériel/IoT
   *  absent). Absent = l'heuristique n'en juge pas ; seul le LLM le renseigne. */
  outOfScope?: boolean;
  /** Quand outOfScope : une action que Biltia SAIT réellement faire, proche du
   *  besoin (ou "" s'il n'y en a aucune). Base d'une alternative honnête. */
  oosAlternative?: string;
  /** Comment la décision a été prise. */
  method: KindMethod;
  /** Confiance 0..1. */
  confidence: number;
  /** Explication courte (debug / tracking). */
  reasoning?: string;
  /** Tokens consommés SI la classification a appelé le LLM (Haiku). Absent sur
   *  le chemin heuristique (gratuit). Sert au tracking de coût côté route. */
  usage?: { model: string; inputTokens: number; outputTokens: number };
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘]/g, "'") // apostrophes courbes (clavier FR) → droites
    .toLowerCase();
}

// Indices « ça sent l'agenda » — PAS une classification : un simple signal pour
// EMPÊCHER l'heuristique de trancher « answer » toute seule (« qu'est-ce que j'ai
// lundi ? » matche « qu'est-ce »). On laisse alors le LLM comprendre (calendar vs
// answer). Le LLM garde le dernier mot ; ceci ne fait qu'ouvrir la porte.
const CALENDAR_HINTS = [
  "agenda", "planning", "mon calendrier", "mon planning", "rendez-vous", "rendez vous", "rdv",
  "cette semaine", "ma semaine", "ma journee", "je suis dispo", "mes dispo", "mes disponibilites",
  "quoi de prevu", "qu'est-ce que j'ai a faire", "qu'ai-je a faire", "mes rendez-vous",
  "ce lundi", "ce mardi", "ce mercredi", "ce jeudi", "ce vendredi", "ce week-end", "ce weekend",
];

/** Vrai si la demande évoque l'agenda/le planning (ouvre la porte au LLM). */
export function looksLikeCalendar(prompt: string): boolean {
  const t = normalize(prompt);
  return CALENDAR_HINTS.some((k) => t.includes(normalize(k)));
}

// ── LE CLASSEUR (« range ça dans mon Drive ») ────────────────────────────────
// Il faut LES DEUX signaux, et c'est volontaire : un verbe de RANGEMENT seul ne
// dit pas où (« range la facture » — dans quoi ?), et une destination seule peut
// n'être qu'une question (« c'est quoi mon classeur ? »). Leur co-occurrence, en
// revanche, ne laisse aucun doute sur l'intention.
//
// LES VERBES SONT CONJUGUÉS, et c'est tout le sujet. Un artisan TUTOIE Biltia :
// « tu le DÉPOSES sur Google Drive », « tu ranges ça », « tu l'enregistres ».
// Une liste de formes en dur (depose, deposer) rate le « déposes » — c'est-à-dire
// la phrase la plus naturelle, celle qu'il tape vraiment. On prend donc le RADICAL
// et on laisse la terminaison ouverte.
//
// Frontières de mots obligatoires : sans `\b`, « met » matcherait « permet » et
// « promet ». Une heuristique qui se déclenche à tort coûte plus cher que celle
// qui se tait.
const ARCHIVE_VERB_RE =
  /\b(rang(?:e|es|ez|er)|class(?:e|es|ez|er)|sauvegard(?:e|es|ez|er)|archiv(?:e|es|ez|er)|transfer(?:e|es|ez|er)|depos(?:e|es|ez|er)|enregistr(?:e|es|ez|er)|stock(?:e|es|ez|er)|upload(?:e|es|ez|er)?|met|mets|mettre|mettez|envoi(?:e|es|ez))\b/;
const STORAGE_RE = /\b(drive|onedrive|one drive|classeur|mes dossiers|mon dossier|stockage|cloud)\b/;

// PRODUIRE D'ABORD, RANGER ENSUITE. « fais-moi un devis pour Morel ET range-le
// dans le Drive » n'est pas un rangement : c'est une PRODUCTION, dont le
// rangement n'est que la suite. Sans cette garde, l'heuristique irait chercher un
// devis EXISTANT au nom de Morel et déposerait celui-là — le mauvais document,
// rangé avec l'aplomb du bon. C'est précisément ce qu'on refuse de faire.
const CREATE_VERB_RE =
  /\b(cre(?:e|es|ez|er)|gener(?:e|es|ez|er)|redig(?:e|es|ez|er)|etabli(?:s|t|r|ssez)|prepar(?:e|es|ez|er)|produi(?:s|t|re)|fais|faites)\b/;

/**
 * La demande vise-t-elle un STOCKAGE EXTERNE (Drive, OneDrive, « mon classeur ») ?
 *
 * Biltia n'y dépose rien et n'y cherche rien : le connecteur a été retiré. Ce
 * détecteur ne sert donc plus à ranger, il sert à REFUSER PROPREMENT — et
 * surtout à ne pas laisser la demande filer ailleurs.
 *
 * ⚠️ NE PAS SUPPRIMER en croyant nettoyer du code mort. Sans lui, « enregistre la
 * facture dans Google Drive » coche un verbe de données (« enregistre ») ET un nom
 * de données (« facture ») : la demande partirait ÉCRIRE EN BASE. L'artisan
 * voulait un fichier rangé, il obtiendrait une fiche modifiée. Ce garde-fou est ce
 * qui l'empêche.
 *
 * Volontairement étroit : il faut un verbe de rangement ET une destination de
 * stockage. « Envoie le devis au client » n'a pas de destination : il passe.
 */
export function mentionsExternalStorage(prompt: string): boolean {
  const t = normalize(prompt);
  if (!t.trim()) return false;
  return ARCHIVE_VERB_RE.test(t) && STORAGE_RE.test(t);
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

// RÈGLE PERMANENTE (« recruter un agent ») : l'utilisateur DÉLÈGUE une tâche
// répétitive que Biltia exécutera seul, en temps et en heure. Deux familles de
// signaux : la RÉCURRENCE explicite et les verbes de DÉLÉGATION. Phrases
// complètes uniquement (« chaque » seul serait un faux ami : « liste de chaque
// chantier » reste un module).
const RULE_SIGNALS = [
  "tous les jours", "chaque jour", "quotidiennement", "chaque matin", "chaque soir",
  "tous les matins", "tous les soirs", "toutes les semaines", "chaque semaine",
  "tous les mois", "chaque mois", "chaque lundi", "chaque mardi", "chaque mercredi",
  "chaque jeudi", "chaque vendredi", "chaque samedi", "chaque dimanche",
  "tous les lundis", "tous les mardis", "tous les mercredis", "tous les jeudis",
  "tous les vendredis", "tous les samedis", "tous les dimanches",
  "des que", "a chaque fois que", "automatiquement", "de maniere automatique",
  "occupe-toi de", "occupe toi de", "charge-toi de", "charge toi de",
  "previens-moi quand", "previens-moi des", "rappelle-moi tous", "rappelle-moi chaque",
];

// OPÉRATION DE DONNÉES immédiate (« data ») : agir sur UNE fiche du workspace,
// maintenant — ajouter, modifier, supprimer. Détectée par la CO-OCCURRENCE d'un
// verbe d'opération ET d'un nom d'entité (les deux, sinon 0) : « ajoute un
// client Jean Dupont », « supprime le client Martin », « mets à jour le tel de
// Karim ». Un outil DURABLE (« ajoute un outil de suivi clients ») reste un
// module : les signaux module l'emportent dans le classement.
const DATA_VERBS = [
  "ajoute", "ajouter", "enregistre", "enregistrer", "supprime", "supprimer",
  "retire", "retirer", "efface", "effacer", "mets a jour", "met a jour",
  "mettre a jour", "renomme", "renommer", "passe le", "passe la", "marque le", "marque la",
];
const DATA_NOUNS = [
  "client", "employe", "salarie", "ouvrier", "chantier", "fournisseur",
  "sous-traitant", "sous traitant", "tache", "materiau", "materiel", "equipement",
  "devis", "facture", "contrat", "pointage", "intervention", "document",
  "article", "prestation", "chaudiere", "compagnon",
];

// ENVOI GROUPÉ (« task ») : écrire MAINTENANT à un GROUPE du workspace. Détecté
// par la CO-OCCURRENCE d'un verbe d'envoi ET d'une cible collective — « envoie un
// message à tous mes clients », « préviens mon équipe », « écris à mes
// fournisseurs ». Un envoi à UNE personne nommée reste « email » (couloir simple) ;
// c'est la CIBLE COLLECTIVE qui bascule vers le moteur « fais-le maintenant ».
const SEND_VERBS = [
  "envoie", "envoyer", "envoie-leur", "envoie leur", "ecris a", "ecris-leur", "ecris leur",
  "ecrire a", "previens", "prevenir", "previens-les", "previens les", "prevenez",
  "contacte", "contacter", "informe", "informer", "notifie", "notifier",
  "relance", "relancer", "message a", "un message", "un mail", "un email", "un sms",
];
const GROUP_TARGETS = [
  "tous mes clients", "toutes mes clients", "a mes clients", "mes clients", "tous les clients",
  "mon equipe", "l'equipe", "les equipes", "mes equipes", "toute l'equipe", "mes employes",
  "mes salaries", "mes ouvriers", "les gars", "mes fournisseurs", "tous mes fournisseurs",
  "tout le monde", "chaque client", "chaque fournisseur", "mes contacts", "tous mes contacts",
];

// Pure question d'information (réglementation, conseil, donnée du workspace).
const ANSWER_SIGNALS = [
  "quel est", "quelle est", "quels sont", "quelles sont", "c'est quoi",
  "qu'est-ce", "combien", "comment fait", "comment faire", "comment ca marche",
  "pourquoi", "est-ce que je", "est-ce qu'on", "ai-je le droit", "a-t-on le droit",
  "puis-je", "peut-on", "dois-je", "doit-on", "quel taux", "quelle tva",
  "quel delai", "quelle norme", "quelle garantie", "que dit la loi", "j'ai combien",
];

// Verbes d'instruction : si présents, la demande VEUT un changement/une production.
const COMMAND_SIGNALS = [
  "ajoute", "ajouter", "cree", "creer", "construis", "construire", "genere",
  "generer", "fais", "fais-moi", "modifie", "modifier", "change", "changer",
  "mets", "mettre", "enleve", "enlever", "supprime", "supprimer", "corrige",
  "corriger", "renomme", "renommer", "remplace", "remplacer", "traduis", "envoie",
];

function countHits(text: string, kws: string[]): number {
  let n = 0;
  for (const kw of kws) if (text.includes(normalize(kw))) n++;
  return n;
}

type Scores = {
  answerScore: number;
  commandScore: number;
  docScore: number;
  actionScore: number;
  moduleScore: number;
  ruleScore: number;
  dataScore: number;
  commScore: number;
  docType: string | null;
};

function scorePrompt(prompt: string): Scores {
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

  return {
    answerScore: countHits(text, ANSWER_SIGNALS) * 2 + (text.trim().endsWith("?") ? 1 : 0),
    commandScore: countHits(text, COMMAND_SIGNALS),
    docScore,
    actionScore: countHits(text, ACTION_SIGNALS) * 3,
    moduleScore: countHits(text, MODULE_SIGNALS) * 2,
    ruleScore: countHits(text, RULE_SIGNALS) * 3,
    dataScore:
      countHits(text, DATA_VERBS) > 0 && countHits(text, DATA_NOUNS) > 0
        ? 2 + countHits(text, DATA_VERBS) + countHits(text, DATA_NOUNS)
        : 0,
    commScore:
      countHits(text, SEND_VERBS) > 0 && countHits(text, GROUP_TARGETS) > 0
        ? 3 + countHits(text, SEND_VERBS) + countHits(text, GROUP_TARGETS)
        : 0,
    docType,
  };
}

/**
 * Vrai si la demande est une pure question d'information : aucun signal de
 * production (document/lot/outil) ni d'instruction de changement.
 * Utilisée par le client (UI d'attente) ET par le serveur (garde-fou : une
 * pure question ne déclenche JAMAIS la construction d'une app).
 */
export function looksLikePureQuestion(prompt: string): boolean {
  const s = scorePrompt(prompt);
  return (
    s.answerScore > 0 &&
    s.commandScore === 0 &&
    s.docScore === 0 &&
    s.actionScore === 0 &&
    s.moduleScore === 0 &&
    s.ruleScore === 0
  );
}

/**
 * Choix sans appel API. Biais volontaire vers `module` sur ambiguïté, pour
 * préserver le comportement historique du générateur.
 */
export function classifyKindHeuristic(prompt: string, hasExistingApp = false): KindResult {
  const s = scorePrompt(prompt);

  // Question pure → réponse texte. Prioritaire, mais UNIQUEMENT si rien ne
  // signale une production ni une instruction de changement — « tu peux
  // ajouter un champ ? » reste une modification.
  if (
    s.answerScore > 0 &&
    s.commandScore === 0 &&
    s.docScore === 0 &&
    s.actionScore === 0 &&
    s.moduleScore === 0 &&
    s.ruleScore === 0
  ) {
    return {
      kind: "answer",
      docType: null,
      method: "heuristic",
      confidence: Math.min(0.6 + s.answerScore * 0.08, 0.9),
      reasoning: `question d'information (${s.answerScore})${hasExistingApp ? " malgré app ouverte" : ""}`,
    };
  }

  // RÈGLE PERMANENTE avant tout le reste : la récurrence/délégation transforme
  // n'importe quelle production ponctuelle en mission d'agent (« relance-le »
  // = courrier ; « relance-le tous les jours à midi » = agent). À égalité,
  // l'agent l'emporte : c'est la version déléguée de la même intention.
  if (
    s.ruleScore > 0 &&
    s.ruleScore >= s.docScore &&
    s.ruleScore >= s.actionScore &&
    s.ruleScore >= s.moduleScore
  ) {
    return {
      kind: "rule",
      docType: null,
      method: "heuristic",
      confidence: Math.min(0.55 + s.ruleScore * 0.08, 0.9),
      reasoning: `mission permanente détectée (${s.ruleScore})`,
    };
  }

  // STOCKAGE EXTERNE : « range la facture F-2026-001 dans mon Drive ». Biltia ne
  // le fait plus (connecteur retiré) → "answer", pour que le copilote le DISE et
  // propose la Bibliothèque. Cette branche doit rester AVANT les données : sans
  // elle, « enregistre la facture dans Google Drive » coche DATA_VERBS
  // (« enregistre ») ET DATA_NOUNS (« facture ») et part écrire en base. L'artisan
  // voulait ranger un PDF, il modifierait une fiche.
  // PRODUIRE D'ABORD. « fais-moi un devis pour Morel ET range-le dans le Drive »
  // n'est pas une demande de rangement : c'est une PRODUCTION. Refuser tout le
  // message pour une phrase de trop priverait l'artisan de son devis — on laisse
  // filer vers "document", et le copilote dira simplement qu'il ne dépose pas.
  if (mentionsExternalStorage(prompt) && !CREATE_VERB_RE.test(normalize(prompt))) {
    return {
      kind: "answer",
      docType: null,
      method: "heuristic",
      confidence: 0.8,
      reasoning: "stockage externe (Drive/OneDrive) : hors périmètre",
    };
  }

  // OPÉRATION DE DONNÉES : agir sur une fiche, maintenant. Un signal module
  // supérieur (« outil de suivi clients ») garde la priorité — l'outil durable
  // l'emporte sur l'opération ponctuelle.
  if (
    s.dataScore > 0 &&
    s.dataScore > s.moduleScore &&
    s.dataScore >= s.docScore &&
    s.dataScore >= s.actionScore
  ) {
    return {
      kind: "data",
      docType: null,
      method: "heuristic",
      confidence: Math.min(0.55 + s.dataScore * 0.06, 0.88),
      reasoning: `opération workspace détectée (${s.dataScore})`,
    };
  }

  // ENVOI GROUPÉ : écrire à un groupe du workspace, maintenant. Passe AVANT
  // module (« tous mes clients » y matche) : c'est une ACTION ponctuelle, pas la
  // demande d'un outil de gestion. La récurrence (« …chaque lundi ») a déjà été
  // captée par « rule » plus haut, donc ici c'est bien un envoi unique.
  if (s.commScore > 0) {
    return {
      kind: "task",
      docType: null,
      method: "heuristic",
      confidence: Math.min(0.6 + s.commScore * 0.06, 0.9),
      reasoning: `envoi groupé détecté (${s.commScore})`,
    };
  }

  // Priorités : module l'emporte sur égalité (défaut sûr).
  if (s.moduleScore > 0 && s.moduleScore >= s.docScore && s.moduleScore >= s.actionScore) {
    return {
      kind: "module",
      docType: null,
      method: "heuristic",
      confidence: Math.min(0.5 + s.moduleScore * 0.08, 0.85),
      reasoning: `signaux « application/gestion » (${s.moduleScore})`,
    };
  }
  if (s.docScore > 0 && s.docScore >= s.actionScore) {
    return {
      kind: "document",
      docType: s.docType,
      method: "heuristic",
      confidence: Math.min(0.55 + s.docScore * 0.08, 0.9),
      reasoning: `document officiel détecté${s.docType ? ` (${s.docType})` : ""}`,
    };
  }
  if (s.actionScore > 0) {
    return {
      kind: "action",
      docType: null,
      method: "heuristic",
      confidence: Math.min(0.55 + s.actionScore * 0.06, 0.85),
      reasoning: `traitement par lot détecté (${s.actionScore})`,
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
