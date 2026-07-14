// ─────────────────────────────────────────────────────────────────────────────
// AGENT FEASIBILITY — la PORTE DE FAISABILITÉ. « Est-ce que je sais VRAIMENT
// détecter ce qu'on me demande de surveiller ? »
//
// POURQUOI CE FICHIER EXISTE (incident 2026-07-14) :
// « préviens-moi par email dès qu'un événement est ajouté à mon agenda » a créé
// un agent ACTIF qui surveillait… les NOUVELLES FICHES CLIENT du workspace, et
// qui notifiait en push au lieu d'envoyer un email. Trois causes :
//   1. aucun veilleur ne lit l'agenda (les 51 veilleurs lisent des tables du
//      workspace, rien d'externe) ;
//   2. le prompt de parsing ORDONNAIT au modèle de toujours « prendre le veilleur
//      le plus proche, même si aucun mot ne colle » (l'ancienne RÈGLE D'OR) ;
//   3. si le modèle ne nommait aucun veilleur, le code dégradait silencieusement
//      le « dès que » en agent planifié à 09:00 — donc nommer un FAUX veilleur
//      était le seul moyen, pour lui, de préserver l'intention de l'artisan.
// Un agent qui ment sur ce qu'il surveille est pire qu'un agent absent : l'artisan
// croit son entreprise couverte.
//
// LE PRINCIPE : ne PAS coder un veilleur par situation (impossible à tenir), mais
// rendre le système capable de DIRE NON. D'où deux garde-fous, l'un dans le prompt
// (le modèle peut répondre « infaisable »), l'autre ICI, en code, déterministe :
//
//   • TEST DE COHÉRENCE — le veilleur retenu doit parler du MÊME OBJET que la
//     demande. Chaque veilleur déclare son/ses SUJET(S) ; chaque sujet a un
//     lexique (les mots que l'artisan emploie vraiment). Zéro recouvrement entre
//     la demande et le lexique du veilleur choisi = rapprochement REJETÉ.
//     « événement ajouté à mon agenda » contre le lexique de nouveau_client
//     (client, prospect, particulier, proprio…) = zéro. L'incident meurt ici.
//
//   • SOURCES NON DÉTECTABLES — la liste de ce que Biltia ne sait PAS capter
//     (agenda externe, boîte mail entrante, réseaux sociaux, votre réveil…), avec
//     l'explication honnête à servir à l'artisan. C'est le filet qui attrape les
//     demandes légitimes mais hors de portée, AVANT toute création.
//
// Étendre Biltia = ajouter un veilleur dans agent-watchers.ts + son sujet et sa
// phrase ici. Un veilleur sans entrée ici est refusé par le test de cohérence
// (fail-closed volontaire : mieux vaut un refus qu'un agent qui ment).
// STRICTEMENT CÔTÉ SERVEUR. Ne throw jamais.
// ─────────────────────────────────────────────────────────────────────────────

import { WATCHER_KEYS, type WatcherKey } from "./agent-watchers";
import { pick, type Locale } from "./i18n/config";

// ── Normalisation : l'artisan écrit sans accents, avec des fautes, en majuscules.
/** minuscules, sans accents, ponctuation aplatie en espaces. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LES SUJETS — de quoi parlent les veilleurs, et avec quels mots l'artisan en
//    parle. Le lexique est volontairement LARGE (rater un synonyme = refuser un
//    artisan à tort, ce qui est le pire échec possible de ce fichier).
//
//    ⚠️ « agenda » / « calendrier » / « google agenda » / « outlook » n'apparaissent
//    dans AUCUN lexique : aucun veilleur ne lit un agenda externe. Ces mots sont
//    traités plus bas, dans les SOURCES NON DÉTECTABLES.
// ─────────────────────────────────────────────────────────────────────────────

type SubjectId =
  | "chantier"
  | "devis"
  | "facture_client"
  | "facture_fournisseur"
  | "client"
  | "lead"
  | "intervention"
  | "tache"
  | "equipe"
  | "pointage"
  | "materiau"
  | "document"
  | "sous_traitant"
  | "commande"
  | "planning"
  | "rappel";

const SUBJECTS: Record<SubjectId, { label: string; lexique: string[] }> = {
  chantier: {
    label: "les chantiers",
    lexique: ["chantier", "projet", "affaire", "ouvrage", "travaux", "conduite de travaux"],
  },
  devis: {
    label: "les devis",
    lexique: ["devis", "offre", "propale", "proposition", "chiffrage", "estimation", "signe", "signature", "accepte"],
  },
  facture_client: {
    label: "les factures clients",
    lexique: ["facture", "impaye", "paiement", "paye", "payee", "regle", "reglee", "encaisse", "note", "solde", "creance", "recouvrement", "relance", "argent", "cash"],
  },
  facture_fournisseur: {
    label: "les factures fournisseurs et les achats",
    lexique: ["fournisseur", "achat", "depense", "facture fournisseur", "je dois", "a payer", "sortie d argent", "charge"],
  },
  client: {
    label: "les clients",
    lexique: ["client", "clientele", "prospect", "particulier", "proprio", "proprietaire", "donneur d ordre", "contact", "fiche client"],
  },
  lead: {
    label: "les demandes entrantes de votre formulaire",
    lexique: ["lead", "prospect", "formulaire", "demande de devis", "demande en ligne", "contact entrant", "nouvelle demande"],
  },
  intervention: {
    label: "les interventions",
    lexique: ["intervention", "visite", "rdv", "rendez vous", "sav", "depannage", "passage", "poser", "pose", "urgence", "urgent"],
  },
  tache: {
    label: "les tâches",
    lexique: ["tache", "todo", "a faire", "mission", "boulot", "travail", "job"],
  },
  equipe: {
    label: "les employés",
    lexique: ["employe", "salarie", "ouvrier", "compagnon", "collaborateur", "equipe", "gars", "intervenant", "technicien", "chef de chantier", "personnel", "surcharge", "deborde", "charge de travail", "quelqu un", "responsable"],
  },
  pointage: {
    label: "les pointages et les heures",
    lexique: ["pointage", "pointe", "heure", "heures", "temps", "feuille de temps", "badge", "presence"],
  },
  materiau: {
    label: "le stock de matériaux",
    lexique: ["materiau", "materiel", "stock", "fourniture", "rupture", "seuil", "approvisionnement", "appro", "reassort", "manque"],
  },
  document: {
    label: "les documents et attestations",
    lexique: ["document", "attestation", "assurance", "decennale", "contrat", "papier", "fichier", "certificat", "kbis", "vigilance", "expire", "perime", "echeance"],
  },
  sous_traitant: {
    label: "les sous-traitants",
    lexique: ["sous traitant", "soustraitant", "st", "partenaire", "fournisseur", "prestataire"],
  },
  commande: {
    label: "les commandes fournisseurs",
    lexique: ["commande", "livraison", "livre", "reception", "appro", "approvisionnement", "colis"],
  },
  planning: {
    label: "le planning des interventions",
    lexique: ["planning", "conflit", "chevauche", "chevauchement", "double reservation", "creneau", "en meme temps", "deux chantiers"],
  },
  rappel: {
    label: "les rappels programmés",
    lexique: ["rappel", "relance programmee", "echeance", "aujourd hui", "du jour", "prevu"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. LE REGISTRE DES VEILLEURS — sujet(s) + la phrase HONNÊTE montrée à l'artisan.
//
//    La phrase est écrite ICI, pas générée par le LLM : un modèle qui hallucine un
//    veilleur hallucinerait aussi sa description, et l'artisan ne verrait rien. En
//    la dérivant de la clé RÉELLEMENT enregistrée, « je surveillerai les nouvelles
//    fiches CLIENT » se serait affiché noir sur blanc face à une demande d'agenda.
// ─────────────────────────────────────────────────────────────────────────────

type WatcherProfile = {
  /** Sujets acceptés : la demande doit toucher AU MOINS l'un d'eux. */
  subjects: SubjectId[];
  /**
   * Mots propres À CE VEILLEUR, quand l'artisan décrit la mission SANS jamais
   * nommer l'objet (« relance ceux qui dorment depuis 6 mois » ne contient pas
   * le mot « client »). On les met ici plutôt que dans le lexique du sujet :
   * élargir le lexique partagé affaiblirait le test pour TOUS les veilleurs de
   * ce sujet, alors que le besoin est local.
   */
  extra?: string[];
  /** Ce que l'agent surveillera VRAIMENT, en français d'artisan. */
  watch: string;
};

export const WATCHER_PROFILES: Record<WatcherKey, WatcherProfile> = {
  chantier_en_retard: { subjects: ["chantier"], watch: "les chantiers qui dépassent leur date de fin prévue" },
  chantier_fin_proche: { subjects: ["chantier"], watch: "les chantiers dont la date de fin approche" },
  chantier_hors_budget: { subjects: ["chantier", "facture_fournisseur"], watch: "les chantiers dont le coût engagé dépasse le budget prévu" },
  chantier_sans_activite: { subjects: ["chantier"], watch: "les chantiers en cours qui n'avancent plus" },
  chantier_sans_devis: { subjects: ["chantier", "devis"], watch: "les chantiers démarrés sans devis signé" },
  chantier_termine: { subjects: ["chantier"], watch: "les chantiers qui viennent d'être terminés" },
  demande_urgente: { subjects: ["intervention", "client"], watch: "les demandes clients urgentes restées sans réponse" },
  devis_non_signe: { subjects: ["devis"], watch: "les devis envoyés restés sans réponse" },
  devis_accepte: { subjects: ["devis"], watch: "les devis qui viennent d'être acceptés par le client" },
  devis_expire_bientot: { subjects: ["devis"], watch: "les devis qui approchent de leur date de validité" },
  facture_echeance_proche: { subjects: ["facture_client"], watch: "les factures qui approchent de leur date d'échéance" },
  facture_impayee: { subjects: ["facture_client"], watch: "les factures échues et toujours impayées" },
  facture_payee: { subjects: ["facture_client"], watch: "les factures qui viennent d'être réglées" },
  echeance_proche: { subjects: ["document"], watch: "les documents, attestations et assurances qui vont expirer" },
  visite_terminee: { subjects: ["intervention", "equipe", "tache"], watch: "les interventions qui viennent d'être terminées" },
  rdv_demain: { subjects: ["intervention"], watch: "les rendez-vous clients prévus prochainement" },
  conflit_planning: { subjects: ["planning", "equipe", "intervention"], watch: "les interventions d'un même intervenant qui se chevauchent" },
  intervention_annulee: { subjects: ["intervention"], watch: "les interventions qui viennent d'être annulées" },
  tache_en_retard: { subjects: ["tache"], watch: "les tâches dont l'échéance est dépassée" },
  tache_terminee: { subjects: ["tache"], watch: "les tâches qui viennent d'être terminées" },
  tache_sans_responsable: { subjects: ["tache", "equipe"], watch: "les tâches ouvertes que personne ne prend" },
  chantier_sans_responsable: { subjects: ["chantier", "equipe"], watch: "les chantiers actifs sans chef de chantier désigné" },
  equipe_surchargee: { subjects: ["equipe"], watch: "les intervenants qui ont trop de travail ouvert" },
  stock_bas: { subjects: ["materiau"], watch: "les matériaux passés sous leur seuil d'alerte" },
  nouveau_lead: { subjects: ["lead", "client"], watch: "les nouvelles demandes reçues via votre formulaire public" },
  nouveau_client: { subjects: ["client"], watch: "les fiches client nouvellement créées dans votre Workspace" },
  nouveau_chantier: { subjects: ["chantier"], watch: "les fiches chantier nouvellement créées dans votre Workspace" },
  pointage_manquant: { subjects: ["pointage", "equipe"], watch: "les employés qui n'ont pas pointé récemment" },
  heures_a_valider: { subjects: ["pointage", "equipe"], watch: "les heures pointées qui attendent votre validation" },
  heures_incoherentes: { subjects: ["pointage", "equipe"], extra: ["bizarre", "aberrant", "anormal", "incoherent", "louche"], watch: "les heures pointées anormalement élevées" },
  chantier_trop_heures: { subjects: ["chantier", "pointage"], watch: "les chantiers qui consomment trop d'heures de main-d'œuvre" },
  document_a_regulariser: { subjects: ["document"], watch: "les documents manquants ou déjà expirés" },
  assurance_expiree: { subjects: ["document", "sous_traitant"], watch: "les sous-traitants dont la décennale est expirée" },
  clients_doublons: { subjects: ["client"], watch: "les fiches clients en double" },
  client_mauvais_payeur: { subjects: ["client", "facture_client"], watch: "les clients qui cumulent plusieurs factures impayées" },
  sous_traitant_a_probleme: { subjects: ["sous_traitant"], watch: "les sous-traitants qui cumulent des réserves ouvertes" },
  sous_traitant_sans_assurance: { subjects: ["sous_traitant", "document"], watch: "les sous-traitants sans assurance décennale renseignée" },
  documents_a_classer: { subjects: ["document"], extra: ["a classer", "non range", "en vrac", "ranger", "classer"], watch: "les documents déposés sans rattachement" },
  chantier_sans_photo: { subjects: ["chantier", "document"], extra: ["photo"], watch: "les chantiers terminés sans aucune photo au dossier" },
  intervention_sans_responsable: { subjects: ["intervention", "equipe"], watch: "les interventions ouvertes sans personne d'assignée" },
  intervention_sans_date: { subjects: ["intervention", "planning"], watch: "les interventions ouvertes sans date prévue" },
  intervention_en_retard: { subjects: ["intervention"], watch: "les interventions dont la date prévue est dépassée" },
  commande_en_retard: { subjects: ["commande", "sous_traitant"], watch: "les commandes fournisseurs livrées en retard" },
  achat_non_affecte: { subjects: ["facture_fournisseur", "chantier"], watch: "les achats et dépenses rattachés à aucun chantier" },
  facture_fournisseur_a_payer: { subjects: ["facture_fournisseur"], watch: "les factures fournisseurs à payer dont l'échéance est dépassée" },
  chantier_sans_budget: { subjects: ["chantier"], watch: "les chantiers actifs sans budget renseigné" },
  client_inactif: {
    subjects: ["client"],
    // L'artisan dit « ceux qui dorment », « qu'on a perdus de vue », sans jamais
    // prononcer le mot « client ». Sans ces mots, on lui posait une question inutile.
    extra: ["dorment", "dort", "endormi", "inactif", "perdu de vue", "perdus de vue", "recontacte", "recontacter", "plus de nouvelles", "pas vus", "pas vu depuis", "rien commande", "depuis longtemps"],
    watch: "les clients sans aucune activité depuis longtemps",
  },
  rappel_echu: { subjects: ["rappel", "tache"], watch: "les rappels programmés arrivés à échéance" },
  devis_accepte_sans_chantier: { subjects: ["devis", "chantier"], watch: "les devis acceptés dont le chantier n'a pas été ouvert" },
  chantier_termine_non_facture: { subjects: ["chantier", "facture_client"], watch: "les chantiers terminés qui n'ont pas encore été facturés" },
  facture_brouillon_non_envoyee: { subjects: ["facture_client"], watch: "les factures restées en brouillon, jamais envoyées" },
};

/** Ce que l'agent surveillera vraiment, en une phrase. Jamais généré par le LLM. */
export function describeWatcher(watcher: WatcherKey): string {
  return WATCHER_PROFILES[watcher]?.watch ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 bis. « EST-CE QU'IL A LA DATA ? » — sur quoi l'agent se base pour travailler.
//
//   Un agent « relance mes impayés » sur un Workspace SANS AUCUNE FACTURE s'affichait
//   « Actif » et ne faisait jamais rien. Le preflight ne sondait que deux tables
//   (employees, materials) : tout le reste passait.
//
//   MAIS attention au faux refus symétrique — les veilleurs sont de DEUX familles :
//     • ÉTAT (« les factures ÉCHUES impayées ») : ils examinent le stock existant.
//       Table vide = l'agent ne se déclenchera JAMAIS. C'est un mensonge → on bloque.
//     • ARRIVÉE (« dès qu'un NOUVEAU client est créé ») : ils attendent les fiches
//       FUTURES. Table vide aujourd'hui = parfaitement normal → on ne bloque RIEN.
//   Un veilleur ABSENT de cette table est, par défaut, un veilleur d'arrivée : ne
//   rien exiger est le défaut sûr (on refuse un artisan à tort, jamais).
// ─────────────────────────────────────────────────────────────────────────────

/** Veilleurs d'ÉTAT : la table doit contenir quelque chose, sinon ils tournent à vide. */
export const WATCHER_PROBE: Partial<Record<WatcherKey, { table: string; noun: string }>> = {
  chantier_en_retard: { table: "chantiers", noun: "chantier" },
  chantier_fin_proche: { table: "chantiers", noun: "chantier" },
  chantier_hors_budget: { table: "chantiers", noun: "chantier" },
  chantier_sans_activite: { table: "chantiers", noun: "chantier" },
  chantier_sans_devis: { table: "chantiers", noun: "chantier" },
  chantier_sans_responsable: { table: "chantiers", noun: "chantier" },
  chantier_sans_budget: { table: "chantiers", noun: "chantier" },
  chantier_trop_heures: { table: "chantiers", noun: "chantier" },
  chantier_sans_photo: { table: "chantiers", noun: "chantier" },
  chantier_termine_non_facture: { table: "chantiers", noun: "chantier" },
  devis_non_signe: { table: "devis", noun: "devis" },
  devis_expire_bientot: { table: "devis", noun: "devis" },
  devis_accepte_sans_chantier: { table: "devis", noun: "devis" },
  facture_impayee: { table: "factures", noun: "facture" },
  facture_echeance_proche: { table: "factures", noun: "facture" },
  facture_brouillon_non_envoyee: { table: "factures", noun: "facture" },
  client_mauvais_payeur: { table: "factures", noun: "facture" },
  client_inactif: { table: "clients", noun: "client" },
  clients_doublons: { table: "clients", noun: "client" },
  demande_urgente: { table: "interventions", noun: "intervention" },
  rdv_demain: { table: "interventions", noun: "intervention" },
  conflit_planning: { table: "interventions", noun: "intervention" },
  intervention_sans_responsable: { table: "interventions", noun: "intervention" },
  intervention_sans_date: { table: "interventions", noun: "intervention" },
  intervention_en_retard: { table: "interventions", noun: "intervention" },
  tache_en_retard: { table: "tasks", noun: "tâche" },
  tache_sans_responsable: { table: "tasks", noun: "tâche" },
  equipe_surchargee: { table: "employees", noun: "employé" },
  pointage_manquant: { table: "employees", noun: "employé" },
  heures_a_valider: { table: "pointages", noun: "pointage" },
  heures_incoherentes: { table: "pointages", noun: "pointage" },
  echeance_proche: { table: "documents", noun: "document" },
  document_a_regulariser: { table: "documents", noun: "document" },
  documents_a_classer: { table: "documents", noun: "document" },
  assurance_expiree: { table: "suppliers", noun: "fournisseur ou sous-traitant" },
  sous_traitant_a_probleme: { table: "suppliers", noun: "fournisseur ou sous-traitant" },
  sous_traitant_sans_assurance: { table: "suppliers", noun: "fournisseur ou sous-traitant" },
  commande_en_retard: { table: "commandes", noun: "commande" },
  achat_non_affecte: { table: "depenses", noun: "achat" },
  facture_fournisseur_a_payer: { table: "depenses", noun: "facture fournisseur" },
  rappel_echu: { table: "rappels", noun: "rappel" },
  stock_bas: { table: "materials", noun: "matériau" },
};

/** Inventaire lisible de ce que Biltia SAIT surveiller (servi lors d'un refus). */
export function listWatchableSubjects(): string[] {
  return [...new Set(WATCHER_KEYS.flatMap((k) => WATCHER_PROFILES[k]?.subjects ?? []))].map(
    (s) => SUBJECTS[s].label
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TEST DE COHÉRENCE — le veilleur parle-t-il du même objet que la demande ?
//
//    Réussite = AU MOINS un mot du lexique d'AU MOINS un sujet du veilleur apparaît
//    dans la demande. C'est volontairement permissif : on ne cherche pas à valider
//    que le veilleur est le MEILLEUR, seulement qu'il n'est pas HORS SUJET. Le seul
//    échec qu'on veut attraper, c'est le rapprochement absurde — celui qui a produit
//    l'incident.
// ─────────────────────────────────────────────────────────────────────────────

export type CoherenceResult = {
  /** false = le veilleur retenu ne parle pas de la même chose que la demande. */
  coherent: boolean;
  /** Ce que le veilleur surveille réellement (pour l'expliquer à l'artisan). */
  watch: string;
};

export function checkWatcherCoherence(watcher: WatcherKey, instruction: string): CoherenceResult {
  const profile = WATCHER_PROFILES[watcher];
  // Veilleur inconnu du registre (ajouté dans agent-watchers.ts sans profil ici) :
  // fail-closed. Un veilleur qu'on ne sait pas décrire ne doit pas partir en prod.
  if (!profile) return { coherent: false, watch: "" };

  const text = ` ${normalizeText(instruction)} `;
  const hasTerm = (term: string) => text.includes(` ${term}`) || text.includes(`${term} `);
  const hit =
    profile.subjects.some((s) => SUBJECTS[s].lexique.some(hasTerm)) ||
    (profile.extra ?? []).some(hasTerm);
  return { coherent: hit, watch: profile.watch };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SOURCES NON DÉTECTABLES — ce que Biltia ne sait PAS capter, et pourquoi.
//
//    C'est le filet déterministe. Il ne dépend d'aucun modèle : si l'artisan nomme
//    l'une de ces sources comme DÉCLENCHEUR, on refuse et on explique, quoi qu'ait
//    répondu le LLM. Chaque entrée dit la vérité, y compris quand elle est nuancée
//    (l'agenda : Biltia sait le LIRE pour transmettre un planning, mais ne sait pas
//    le SURVEILLER — les deux moitiés de la phrase comptent).
// ─────────────────────────────────────────────────────────────────────────────

export type UnsensableSource = {
  id: string;
  /** Ce que l'artisan a nommé (« votre agenda », « Twitter »…). */
  label: string;
  /** Le refus honnête, prêt à servir. Zéro fausse promesse, zéro « bientôt ». */
  explanation: string;
};

const UNSENSABLE: { id: string; label: string; test: RegExp; explanation: string }[] = [
  {
    id: "calendrier_externe",
    label: "votre agenda",
    // \b sur un mot accentué ne matche pas en JS après normalisation ; on teste le
    // texte NORMALISÉ (sans accents), donc « evenement », « agenda », « calendrier ».
    test: /\b(agenda|calendrier|google calendar|google agenda|outlook calendar|ical|calendly)\b/,
    explanation:
      "Je sais **lire** votre agenda pour transmettre un planning à vos équipes, mais je ne sais pas encore le **surveiller** : rien ne me prévient quand un événement y est ajouté. Je ne peux donc pas déclencher un agent là-dessus.",
  },
  {
    id: "boite_mail_entrante",
    label: "les emails que vous recevez",
    test: /\b(quand je recois un (mail|email|e mail)|des que je recois un (mail|email)|mail entrant|email entrant|ma boite mail|boite de reception|nouveau mail)\b/,
    explanation:
      "Je sais **envoyer** des emails depuis votre messagerie, mais je ne lis pas votre boîte de réception : je ne peux pas me déclencher sur un email que vous recevez.",
  },
  {
    id: "reseaux_sociaux",
    label: "les réseaux sociaux",
    test: /\b(twitter|tweet|instagram|facebook|linkedin|tiktok|youtube|reseau social|reseaux sociaux|publication|je publie|je poste)\b/,
    explanation:
      "Biltia n'est connecté à aucun réseau social. Je ne vois pas ce que vous y publiez, donc je ne peux rien déclencher dessus.",
  },
  {
    id: "messagerie_entrante",
    label: "les messages reçus",
    test: /\b(whatsapp|sms recu|quand je recois un sms|quand je recois un message|message entrant|appel telephonique|quand on m appelle|quand je recois un appel)\b/,
    explanation:
      "Je ne reçois ni vos SMS, ni vos messages WhatsApp, ni vos appels. Aucun agent ne peut se déclencher là-dessus.",
  },
  {
    id: "etat_physique",
    label: "votre situation personnelle",
    // Le motif porte sur l'ACTION, pas sur la tournure qui l'introduit : « quand je
    // me réveille » et « chaque fois que je me réveille » disent la même chose, et
    // n'ancrer que sur « quand » laissait passer la seconde.
    test: /\b(je me reveille|je me leve|je me couche|j arrive (sur|au|a) |je suis sur place|ma position|geolocalisation|gps|je rentre chez)\b/,
    explanation:
      "Je ne sais pas où vous êtes ni ce que vous faites : je n'ai aucun capteur sur vous. Pour ce genre de mission, dites-moi plutôt une **heure fixe** (« chaque matin à 7h ») et je m'en occupe.",
  },
  {
    id: "meteo",
    label: "la météo",
    test: /\b(meteo|il pleut|la pluie|quand il fait beau|temperature|gel|neige|canicule)\b/,
    explanation:
      "Biltia n'a pas de source météo. Je ne peux pas déclencher un agent sur le temps qu'il fait.",
  },
  {
    id: "compta_externe",
    label: "votre logiciel de comptabilité",
    test: /\b(mon expert comptable|logiciel de compta|comptabilite|sage|ciel compta|pennylane|quickbooks|banque|mon compte bancaire|virement recu|releve bancaire)\b/,
    explanation:
      "Je ne suis branché ni à votre banque ni à votre logiciel de comptabilité. Je surveille les factures **de votre Workspace Biltia**, pas les mouvements de votre compte.",
  },
];

/**
 * L'artisan nomme-t-il une source que Biltia ne sait pas capter ?
 * `null` si tout va bien. Appelé sur les agents ÉVÉNEMENTIELS (« dès que… ») :
 * une mission planifiée à heure fixe n'a pas besoin de capteur.
 */
export function findUnsensableSource(instruction: string): UnsensableSource | null {
  const text = normalizeText(instruction);
  for (const s of UNSENSABLE) {
    if (s.test.test(text)) return { id: s.id, label: s.label, explanation: s.explanation };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. LE VERDICT — la porte que createAgentRule franchit (ou pas) avant d'écrire
//    quoi que ce soit en base.
//
//    Trois issues, et une seule crée un agent :
//      • ok         → on continue (le preflight de capacité prend le relais).
//      • impossible → REFUS net et expliqué. Biltia n'a aucun capteur pour ça, et
//                     ce ne sera pas résolu en connectant quelque chose.
//      • unclear    → ON NE CRÉE RIEN et ON DEMANDE. Le veilleur proposé est
//                     hors sujet, ou la surveillance n'a trouvé aucun capteur :
//                     dans le doute, on parle à l'artisan plutôt que d'activer
//                     un agent au hasard.
//    Le doute ne produit JAMAIS d'agent. C'est toute la leçon de l'incident.
// ─────────────────────────────────────────────────────────────────────────────

export type FeasibilityVerdict =
  | { verdict: "ok" }
  | { verdict: "impossible" | "unclear"; message: string };

/** Trois exemples concrets de ce que Biltia sait vraiment surveiller. */
function examplesLine(locale: Locale): string {
  return pick(
    locale,
    "les devis restés sans réponse, les factures échues impayées, les chantiers en retard ou hors budget, le stock passé sous son seuil, les attestations qui expirent, les tâches en retard…",
    "quotes left unanswered, overdue unpaid invoices, jobs running late or over budget, stock below its threshold, expiring certificates, overdue tasks…"
  );
}

export function judgeFeasibility(input: {
  instruction: string;
  triggerType: "schedule" | "event";
  eventWatcher: WatcherKey | null;
  /** Verdict du modèle (« je ne sais pas capter ça »). */
  feasible: boolean;
  blockerReason: string;
  /** Une surveillance a été demandée mais aucun capteur n'a été retenu. */
  eventWithoutSensor: boolean;
  locale?: Locale;
}): FeasibilityVerdict {
  const { instruction, triggerType, eventWatcher, feasible, blockerReason, eventWithoutSensor, locale = "fr" } = input;

  const watching = triggerType === "event" || eventWithoutSensor;

  // (a) FILET DÉTERMINISTE — indépendant du modèle, donc il tient même quand le
  //     parsing part en repli heuristique (aucun LLM) ou quand le modèle s'entête.
  //     C'est lui qui aurait arrêté l'incident du 2026-07-14.
  if (watching) {
    const unsensable = findUnsensableSource(instruction);
    if (unsensable) {
      return {
        verdict: "impossible",
        message: pick(
          locale,
          `Je ne vais pas créer cet agent, et je préfère vous le dire franchement plutôt que de vous laisser croire qu'il tourne.\n\n${unsensable.explanation}\n\nCe que je surveille, ce sont les fiches de votre Workspace : ${examplesLine(locale)} Dites-moi ce que vous voulez que je surveille là-dedans et je m'en occupe tout de suite.`,
          `I won't create this agent, and I'd rather tell you straight than let you believe it's running.\n\n${unsensable.explanation}\n\nWhat I do watch is your Workspace records: ${examplesLine(locale)} Tell me what you want me to watch in there and I'll set it up right away.`
        ),
      };
    }
  }

  // (b) LE MODÈLE A DIT NON — on l'écoute, au lieu de le forcer à choisir quand même.
  if (!feasible) {
    const why = blockerReason.trim();
    return {
      verdict: "impossible",
      message: pick(
        locale,
        `Je ne sais pas faire cet agent.${why ? ` ${why}.` : ""}\n\nJe ne vais pas en activer un « à peu près » qui surveillerait autre chose : vous croiriez être couvert alors que vous ne le seriez pas. Ce que je sais surveiller, ce sont les fiches de votre Workspace : ${examplesLine(locale)}`,
        `I can't build this agent.${why ? ` ${why}.` : ""}\n\nI won't activate a "close enough" one that watches something else: you'd believe you were covered when you weren't. What I can watch is your Workspace records: ${examplesLine(locale)}`
      ),
    };
  }

  // (c) COHÉRENCE — le veilleur retenu parle-t-il du même objet que la demande ?
  //     Échec = on POSE LA QUESTION (le rapprochement est peut-être juste maladroit),
  //     on ne crée surtout pas l'agent.
  if (eventWatcher) {
    const { coherent, watch } = checkWatcherCoherence(eventWatcher, instruction);
    if (!coherent) {
      return {
        verdict: "unclear",
        message: pick(
          locale,
          `Je ne suis pas sûr d'avoir bien compris ce que vous voulez surveiller, et je ne vais pas activer un agent au hasard.\n\nCe que j'ai cru comprendre, c'est : **${watch}**. Si ce n'est pas ça, reformulez-moi la mission.\n\nJe peux me déclencher sur les fiches de votre Workspace : ${examplesLine(locale)}`,
          `I'm not sure I understood what you want me to watch, and I won't activate an agent at random.\n\nWhat I understood was: **${watch}**. If that's not it, rephrase the mission for me.\n\nI can trigger on your Workspace records: ${examplesLine(locale)}`
        ),
      };
    }
  }

  // (d) SURVEILLANCE SANS CAPTEUR — l'artisan a dit « dès que… », rien ne colle, et
  //     ce n'est pas une source connue comme non détectable. On demande.
  if (eventWithoutSensor) {
    return {
      verdict: "unclear",
      message: pick(
        locale,
        `Vous voulez que je réagisse **dès que** quelque chose se produit, mais je n'ai pas identifié quoi surveiller exactement.\n\nJe ne vais pas transformer ça en simple rappel quotidien dans votre dos. Précisez-moi le déclencheur : je sais veiller sur ${examplesLine(locale)}`,
        `You want me to react **as soon as** something happens, but I haven't identified what to watch exactly.\n\nI won't quietly turn that into a daily reminder behind your back. Tell me the trigger: I can watch ${examplesLine(locale)}`
      ),
    };
  }

  return { verdict: "ok" };
}
