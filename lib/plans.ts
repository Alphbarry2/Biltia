// ─────────────────────────────────────────────────────────────────────────────
// BILTIA — Plans & tarification (SOURCE DE VÉRITÉ)
//
// Ce fichier est CLIENT-SAFE : aucune donnée secrète (pas de clé Stripe, pas de
// price ID). Il est importé aussi bien par la landing que par les routes serveur.
// La résolution des Stripe Price IDs se fait côté serveur uniquement
// (voir lib/stripe.ts), à partir du nom de variable d'env retourné ici.
//
// Tarifs validés le 2026-07-02.
// ─────────────────────────────────────────────────────────────────────────────

import type { Locale } from "@/lib/i18n/config";

export type PlanId = "free" | "pro" | "equipe";

/** Un palier de crédits mensuels pour un plan payant. */
export interface CreditTier {
  /** Crédits IA inclus, renouvelés à chaque échéance mensuelle. */
  credits: number;
  /** Prix mensuel en euros (TTC affiché). */
  priceEur: number;
}

export interface PlanLimits {
  /** Nombre d'apps simultanées (Infinity = illimité). */
  maxApps: number;
  /** Sièges / utilisateurs (Infinity = illimité). */
  maxUsers: number;
  voice: boolean;
  offlineFirst: boolean;
  sharedWorkspace: boolean;
  whiteLabel: boolean;
  customUrl: boolean;
  multiNiche: boolean;
  accountingConnectors: boolean;
  /** Envoi automatique d'emails / SMS depuis les apps ET les agents. */
  autoMessaging: boolean;
  /** Agents qui AGISSENT (relance email, compte-rendu, rapport, planning équipe).
   *  Les alertes (notify) restent libres, même en Free : « le Free goûte, le Pro exécute ». */
  agentActions: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** À qui s'adresse le plan (affiché en évidence sur la carte). */
  audience: string;
  /** Paliers de crédits (vide pour Free). */
  tiers: CreditTier[];
  /** Crédits offerts à l'inscription (Free uniquement, non renouvelables). */
  signupCredits?: number;
  /** Palier mis en avant par défaut dans l'UI. */
  defaultCredits?: number;
  /** Puces marketing affichées sur la carte tarifaire. */
  features: string[];
  limits: PlanLimits;
}

export const UNLIMITED = Number.POSITIVE_INFINITY;

/**
 * Coût interne (EUR) qu'UN crédit « achète ». C'est le levier de marge :
 *   marge = 1 − CREDIT_COST_EUR / prix_net_par_crédit.
 * MESURÉ (OpenRouter, juillet 2026) : les modèles de prod (DeepSeek/Mistral/Qwen)
 * coûtent en réalité ~0,0001 à 0,0015 €/crédit selon l'action (une app ≈ 0,08 $
 * pour 300 crédits ≈ 0,0003 €/cr ; une question ≈ 0,0015 €/cr, le PIRE cas).
 * On garde 0,001 comme PLAFOND prudent (≈ pire cas × 1,5, buffer volatilité des
 * providers) : la marge réelle est donc ≥ celle calculée ici, jamais l'inverse.
 */
export const CREDIT_COST_EUR = 0.001;

// ─────────────────────────────────────────────────────────────────────────────
// LE TARIF D'UNE ACTION — SOURCE UNIQUE DE VÉRITÉ (code ET page /tarifs).
//
// ⚠️ Le crédit est un PRIX, pas un compteur de coût.
//
// Avant, le produit débitait au COÛT RÉEL de l'IA : il réservait 250 crédits pour
// une app, puis remboursait tout ce qui dépassait la facture du modèle. Tant que
// le moteur tournait chez Anthropic, ça donnait ~97 crédits par app — proche de la
// grille. Mais en basculant sur OpenRouter (8× moins cher), la même app est tombée
// à 15 crédits : un abonné à 49 € pouvait générer **133 applications**.
//
// Conséquence : le palier d'entrée couvrait les besoins de TOUT LE MONDE. Plus
// personne ne monte, l'ARPU s'écrase sur 49 €, et les paliers supérieurs ne servent
// plus à rien. Un prix d'entrée qui suffit à tous n'est pas un prix d'entrée, c'est
// un plafond.
//
// Donc : le tarif est FIXE, indépendant du modèle et de son coût. Baisser le coût
// améliore la marge — ça ne brade pas l'offre. Le coût réel reste journalisé dans
// `ai_usage.cost_usd` pour surveiller la marge (console admin), mais il ne pilote
// PLUS le débit.
//
// ── LE PRIX SUIT LA VALEUR, PAS LE COÛT (décision user 2026-07-14) ───────────
//
// Une fois le débit détaché du coût, il restait à décider ce que vaut une action.
// Le coût ne peut pas répondre : à 98-99 % de marge, TOUTES les réponses sont
// rentables. Un crédit se vend 0,0196 € net (49 € TTC / 2 000 cr, hors TVA 21 % et
// Stripe) ; une app coûte 0,042 € à produire. Le vrai critère, c'est donc :
// qu'est-ce qui fait monter un client de palier ?
//
// Deux architectures étaient possibles : plafonner (N apps, N agents par plan) ou
// compter (crédits seuls). Le user a tranché pour LES CRÉDITS SEULS : « tout est
// inclus, seul le volume change » — aucune fonctionnalité bridée, aucun quota.
//
// ── L'APPLICATION EST L'HAMEÇON, L'AGENT EST LE MOTEUR ───────────────────────
//
// Le compteur étant le seul levier, la question devient : QUEL poste doit le faire
// tourner ? Une application est un ACHAT : créée une fois, gardée, retouchée. Après
// le premier mois elle ne consomme plus rien — s'en servir est gratuit (CRUD, devis,
// factures, PDF, imports : zéro token). Un artisan équipé de ses 4 apps ne rapporte
// plus jamais un crédit sur ce poste.
//
// Un agent, lui, est un ABONNEMENT DANS L'ABONNEMENT. Il tourne tous les matins, il
// fait un travail que quelqu'un faisait avant, et le jour où on l'éteint la corvée
// revient. C'est le SEUL poste qui se paie tous les mois, pour toujours.
//
// Donc : app bon marché (elle amène le workspace, qui nourrit les agents), agent
// cher (il est irremplaçable). Une app à 600 cr faisait l'inverse : elle taxait
// l'acquisition et laissait l'agent — le vrai actif — à 13 € par mois.
//
// ── LA RÈGLE DE CONCEPTION DES PALIERS (user, 2026-07-14) ────────────────────
//
// « Chaque plan doit suffire à 90 % à celui à qui il est destiné. Il doit être
//   satisfait, mais toujours avoir ce petit truc au fond de lui pour passer au
//   suivant. »
//
// Ça se vérifie, ce n'est pas une intention. Le persona du palier doit en consommer
// ~90 %, et l'AGENT SUIVANT ne doit pas rentrer. C'est ce qui fixe agent_redaction
// au crédit près (voir plus bas) — et c'est ce que le test de lib/plans vérifie :
//
//   49 € (2 000) · artisan solo      → 1 800 cr · 90 % · un 2ᵉ agent ne rentre pas
//   89 € (3 000) · solo intensif     → 2 800 cr · 93 % · un 3ᵉ agent ne rentre pas
//  129 € (5 000) · solo équipé / TPE → 4 600 cr · 92 % · un 4ᵉ agent ne rentre pas
//
// À chaque palier, c'est l'agent suivant qui débloque le suivant. Sans jamais brider
// quoi que ce soit : l'échelle est une échelle d'AGENTS, pas une grille de features.
//
// Corollaire sur les applications : à 300 cr, le forfait d'entrée en paie 6 par mois.
// Un solo n'en créera pas 20 DANS SA VIE. L'app ne contraint donc JAMAIS personne —
// et c'est voulu : elle sert à l'accrocher, pas à le facturer.
//
// Une question reste à 3 cr : quasi gratuite. C'est elle qui crée l'habitude, elle
// ne doit JAMAIS faire hésiter.
//
// Ces valeurs sont exactement celles annoncées sur /tarifs : le bloc « Ce que ça
// coûte » ET le panier y sont recalculés depuis cette constante, et le panier tombe
// PILE sur le volume vendu. Un prix écrit en dur ment tôt ou tard.
// ─────────────────────────────────────────────────────────────────────────────
export const ACTION_CREDITS = {
  /** Une question au copilote (réponse texte). */
  question: 3,
  /** Une écriture directe dans le workspace (« ajoute un client Jean »). */
  donnee: 5,
  /** Lire une photo / un document (OCR), PAR FICHIER. */
  lecture_fichier: 10,
  /** Une dictée vocale transformée en devis structuré. */
  dictee_devis: 15,
  /** Annoter / transformer un document existant. */
  annotation: 15,
  /** Un livrable officiel : devis PDF, facture, courrier, PV, attestation. */
  document: 30,
  /** Un passage d'agent qui LIT chaque nouvelle fiche pour juger si elle mérite une
   *  alerte. Une alerte par GABARIT (« ce devis n'est pas signé ») ne coûte RIEN :
   *  aucun token, l'exécuteur ne débite pas. */
  agent_passage: 20,
  /** Un passage d'agent qui RÉDIGE (relance client, compte-rendu, rapport).
   *
   *  ⚠️ C'EST LE PRIX LE PLUS IMPORTANT DU PRODUIT, et il est calibré au crédit près.
   *  × 22 jours ouvrés = 880 cr/mois. C'est le seul poste qui revient TOUS LES MOIS
   *  (une app, une fois créée, ne consomme plus rien), donc le seul qui fait monter
   *  un client de palier.
   *
   *  Il est coincé entre deux murs, et il n'y a pas beaucoup de place entre les deux :
   *   • TROP BAS (25 cr → 550/mois) : le forfait à 49 € absorbe 3 agents. Plus personne
   *     ne monte, l'ARPU s'écrase sur le palier d'entrée.
   *   • TROP HAUT (50 cr → 1 100/mois) : le courant d'un solo (15 devis + 80 questions
   *     + 13 photos + 1 retouche = 920 cr) plus UN agent fait 2 020 — il dépasse son
   *     forfait dès le premier mois, avec un seul agent. Le plan vendu aux solos ne
   *     tient même pas l'agent qu'on lui vend. C'est une promesse trahie, pas un levier.
   *
   *  À 40 : 920 + 880 = 1 800, soit 90 % du forfait à 49 €. Le solo est servi, et le
   *  DEUXIÈME agent ne rentre pas. C'est la règle de conception du user (2026-07-14) :
   *  « chaque plan doit suffire à 90 % à celui à qui il est destiné, en lui laissant
   *  toujours ce petit truc au fond de lui pour passer au suivant ». */
  agent_redaction: 40,
  /** Un passage d'agent qui AGIT : boucle agentique (outils workspace, jusqu'à 10
   *  itérations × 4 fiches). Coût réel au plafond : 0,165 $ ≈ 0,15 € — 10× une simple
   *  relance, et de loin l'action la plus coûteuse du produit. C'est aussi la plus
   *  précieuse (« occupe-t'en » : l'agent FAIT le travail, il n'alerte pas).
   *  100 crédits ≈ 1,96 € net → marge ~92 %. */
  agent_action: 100,
  /** Un rendu client (« voilà à quoi ressemblera votre salle de bain »), joint au devis.
   *  Coût réel MESURÉ : 0,0388 $ ≈ 0,036 € — de loin l'action la plus CHÈRE du produit
   *  hors génération d'app (une question au copilote coûte 0,003 $, soit 13× moins).
   *  40 crédits ≈ 0,98 € au tarif d'entrée → marge ~96 %, et le prix reste juste : un
   *  artisan qui MONTRE le résultat gagne le chantier. Ça vaut plus qu'un document. */
  rendu_client: 40,
  /** Modifier une application existante.
   *  ⚠️ Le COÛT réel dit l'inverse : une modification coûte PLUS cher qu'une création
   *  (0,070 $ contre 0,046 $ — on renvoie tout le HTML au modèle à chaque tour). La
   *  facturer au tiers d'une création est un choix PRODUIT, pas un calcul : un artisan
   *  qui hésite à retoucher son application finit par l'abandonner. */
  modification_app: 100,
  /** Créer une application sur mesure. L'HAMEÇON — voir l'en-tête : une app bon marché
   *  amène le workspace, et le workspace nourrit les agents, qui sont le vrai moteur.
   *  300 crédits ≈ 7,35 € au tarif d'entrée. */
  application: 300,
} as const;

export type ActionCredit = keyof typeof ACTION_CREDITS;

// ── L'ESSAI GRATUIT (décision user, 2026-07-14) ──────────────────────────────
//
// Plus de plan Free PERMANENT : un essai borné par DEUX limites, la première
// atteinte gagne — les crédits, ou le temps.
//
// ⚠️ LE VRAI VERROU, C'EST LES CRÉDITS. Le chronomètre est le second, et il ne
// démarre PAS à l'inscription : il démarre à la PREMIÈRE APPLICATION CRÉÉE.
//
// Pourquoi ce décalage. Les deux limites ne mordent jamais sur la même personne :
//   • l'artisan engagé brûle ses 400 crédits en 2 ou 3 jours → c'est le PLAFOND DE
//     CRÉDITS qui l'arrête, et c'est lui qui le convertit. Le chronomètre ne se
//     déclenche jamais pour lui.
//   • l'artisan lent — dans le BTP, c'est la norme : il est sur un toit, pas devant
//     un écran — s'inscrit, crée son app, part trois semaines sur un chantier. Un
//     chronomètre lancé à l'INSCRIPTION le gèlerait au jour 15 alors qu'il lui reste
//     des crédits et qu'il n'a pas encore eu le déclic.
//
// Un compte à rebours lancé à l'inscription ne se déclenche donc QUE sur les gens
// qu'on n'a pas convaincus. Lancé à la première app, il dit la bonne chose : « tu as
// vu ce que ça fait, tu as deux semaines pour décider. »
//
// Coût du risque d'abus, pour mémoire : 400 crédits d'essai = ~0,08 € de LLM réel.
// Mille faux comptes coûteraient 80 €. Aucune forteresse anti-abus ne se rentabilise
// contre 8 centimes par tête — et elle ennuierait les vrais clients bien avant
// d'arrêter un fraudeur.
export const TRIAL_DAYS = 14;

/** Crédits offerts à la création d'un compte Free (miroir de handle_new_user).
 *
 *  DOIT rester > ACTION_CREDITS.application : le plan Free promet « Créez votre
 *  première application », et le hold est prélevé d'AVANCE. Si le solde offert ne
 *  couvre pas une app, l'essai gratuit se heurte à « crédits insuffisants » avant
 *  d'avoir rien produit — la pire première impression possible, et rien dans le code
 *  ne relie les deux constantes.
 *  400 = 1 app (300) + une trentaine de questions ensuite.
 *  ⚠️ Miroir SQL : supabase/migrations/053_signup_credits.sql. */
export const SIGNUP_FREE_CREDITS = 400;

// ── Paliers de crédits ───────────────────────────────────────────────────────
// Un seul plan payant en self-service (Pro). Toutes les fonctionnalités produit
// sont incluses ; le prix ne varie qu'avec le volume de crédits. Le premium
// (marque blanche, multi-métiers, SSO, revente) passe par l'offre Entreprise,
// sur devis (voir ENTERPRISE ci-dessous).

// Grille dégressive resserrée (2026-07-09) : 6 paliers, regroupés en 2 cartes
// (Solo/TPE ≤ 3 000, Business ≤ 25 000) sur la page tarifs. Un seul plan payant,
// toutes les fonctionnalités incluses ; seul le VOLUME de crédits change. Le
// meilleur tarif au crédit est intégré dans le saut de palier (dégressif jusqu'à
// -22 %), c'est ce qui pousse à l'upgrade — pas un blocage de features.
// ⚠️ Chaque palier a besoin de son Price Stripe (STRIPE_PRICE_PRO_<crédits>).
//    Créer les prix AVANT de déployer (sinon checkout 503) : scripts/stripe-sync-prices.ts.
const PRO_TIERS: CreditTier[] = [
  // Grille LINÉAIRE (décision user 2026-07-15) : UN seul plan payant, un curseur de
  // crédits, tout inclus. Prix ∝ crédits (~0,025 €/cr constant) → 2× de crédits =
  // ~2× le prix. Le coût réel (OpenRouter, cf. CREDIT_COST_EUR) étant dérisoire, la
  // marge est ~92-99 % partout : les crédits ne sont plus une contrainte de coût mais
  // un curseur de VALEUR, calibré pour une "mini-frustration" (chaque profil BTP tient
  // dans son palier et déborde en grandissant). Au-delà de 60 000 : Entreprise (devis).
  { credits: 2000, priceEur: 49 }, //   artisan solo
  { credits: 4000, priceEur: 99 }, //   artisan + compagnons
  { credits: 6000, priceEur: 149 }, //  TPE
  { credits: 10000, priceEur: 249 }, // TPE / PME
  { credits: 20000, priceEur: 499 }, // PME
  { credits: 40000, priceEur: 999 }, // entreprise générale
  { credits: 60000, priceEur: 1490 }, // grand compte / multi-sites
];

// ── Traduire des crédits en euros / en mois d'agent ──────────────────────────
// Source UNIQUE de ces deux conversions. Elles étaient jusqu'ici recopiées à la
// main dans la landing et la page tarifs, où elles ont fini par mentir : la
// landing annonçait « un agent ≈ 300 crédits/mois » alors qu'il en consomme 550.

/** Jours ouvrés retenus pour annoncer le coût MENSUEL d'un agent quotidien. */
export const AGENT_WORKING_DAYS_PER_MONTH = 22;

/** Ce que consomme un agent qui RÉDIGE (relance, compte-rendu) chaque jour ouvré. */
export const AGENT_CREDITS_PER_MONTH =
  ACTION_CREDITS.agent_redaction * AGENT_WORKING_DAYS_PER_MONTH;

/** Ce que « vaut » un crédit au palier d'ENTRÉE, c'est-à-dire le TARIF LE PLUS CHER
 *  (49 € / 2 000 cr = 0,0245 €). On annonce toujours au prix le plus cher : un client
 *  qui monte de palier paiera MOINS que ce qu'on lui a promis, jamais l'inverse. */
export function creditsToEur(credits: number): number {
  const entry = PRO_TIERS[0];
  return (credits * entry.priceEur) / entry.credits;
}

// Paliers ÉQUIPE (Pro + collaboration). Grille FINALE user 2026-07-10. 5000 = Pro
// 5000 (129) + 50 € d'add-on collaboration = 179 ; 10000/25000 propres à Équipe.
// Source unique partagée par PLANS.equipe (facturation) ET EQUIPE (page tarifs).
// ⚠️ Chaque palier a son Price Stripe (STRIPE_PRICE_EQUIPE_<crédits>[_ANNUAL]).
const EQUIPE_TIERS: CreditTier[] = [
  { credits: 5000, priceEur: 179 },
  { credits: 10000, priceEur: 449 },
  { credits: 25000, priceEur: 999 },
];

// Anciens paliers RETIRÉS de la vente, conservés UNIQUEMENT pour reconnaître au
// webhook les abonnements déjà en cours (leur renouvellement doit continuer à
// créditer). Jamais proposés à l'achat (isValidTier ne les accepte pas). Leurs
// Price Stripe (STRIPE_PRICE_PRO_<crédits>) restent donc en place tant qu'un
// abonné y est. Voir findTierByPriceId (lib/stripe.ts).
export const LEGACY_PRO_TIERS: CreditTier[] = [
  // Retirés de la vente : conservés pour créditer les abonnements en cours.
  { credits: 1000, priceEur: 49 },
  { credits: 2000, priceEur: 89 },
  { credits: 15000, priceEur: 579 },
  { credits: 25000, priceEur: 949 },
  { credits: 4000, priceEur: 199 },
  { credits: 8000, priceEur: 399 },
  { credits: 12000, priceEur: 579 },
  { credits: 20000, priceEur: 949 },
  { credits: 30000, priceEur: 1399 },
  { credits: 40000, priceEur: 1799 },
  { credits: 50000, priceEur: 2199 },
  { credits: 75000, priceEur: 3699 },
  { credits: 100000, priceEur: 4399 },
  { credits: 150000, priceEur: 6490 },
  { credits: 200000, priceEur: 8499 },
];

// ── Définition des plans ─────────────────────────────────────────────────────

export const PLANS: Record<PlanId, Plan> = {
  // Ce n'est plus un palier gratuit PERMANENT : c'est un ESSAI (décision user
  // 2026-07-14), borné par deux limites dont la première atteinte gagne — les
  // crédits (le vrai verrou) et le temps (TRIAL_DAYS, à partir de la première app
  // créée, pas de l'inscription). Voir l'en-tête de TRIAL_DAYS.
  free: {
    id: "free",
    name: "Essai gratuit",
    tagline: "Voyez ce que ça fait, puis décidez",
    audience: "Sans carte bancaire",
    tiers: [],
    signupCredits: SIGNUP_FREE_CREDITS,
    features: [
      `${SIGNUP_FREE_CREDITS} crédits offerts, puis ${TRIAL_DAYS} jours à partir de votre première application`,
      "Créez votre première application sur mesure",
      "Générez un vrai devis, lisez vos documents",
      "1 utilisateur, 1 application",
      "À la fin : vos données sont conservées, l'espace passe en lecture seule",
    ],
    limits: {
      maxApps: 1,
      maxUsers: 1,
      voice: false,
      offlineFirst: false,
      sharedWorkspace: false,
      whiteLabel: false,
      customUrl: false,
      multiNiche: false,
      accountingConnectors: false,
      autoMessaging: false,
      agentActions: false,
    },
  },

  pro: {
    id: "pro",
    name: "Pro",
    tagline: "L'outil complet, sans limite de features",
    audience: "Pour les indépendants, artisans et TPE",
    tiers: PRO_TIERS,
    defaultCredits: 5000,
    features: [
      "Tout l'outil, aucune fonctionnalité bridée",
      "Apps, devis, questions et agents selon vos crédits IA",
      "Commande vocale et mode hors-ligne",
      "Workspace partagé, sièges inclus",
      "Connecteurs comptables inclus",
      "Crédits renouvelés chaque mois",
    ],
    limits: {
      maxApps: UNLIMITED,
      maxUsers: UNLIMITED,
      voice: true,
      offlineFirst: true,
      sharedWorkspace: true,
      whiteLabel: false, // réservé à l'offre Entreprise (sur devis)
      customUrl: false, // réservé à l'offre Entreprise (sur devis)
      multiNiche: false, // réservé à l'offre Entreprise (sur devis)
      accountingConnectors: true,
      autoMessaging: true,
      agentActions: true,
    },
  },

  // ÉQUIPE = Pro + collaboration (invitation, portail client/sous-traitant, agents
  // collaboratifs). Mêmes limites produit que Pro ; le déblocage collaboration se
  // fait via l'entitlement (subscriptions.plan="equipe" → collaboration=true).
  equipe: {
    id: "equipe",
    name: "Équipe",
    tagline: "Pour faire travailler vos salariés, clients et sous-traitants dans Biltia.",
    audience: "Artisans avec salariés, PME",
    tiers: EQUIPE_TIERS,
    defaultCredits: 5000,
    features: [
      "Tout le plan Pro, pour toute l'équipe",
      "Invitez vos collaborateurs : rôles et permissions",
      "Comptes employés : chacun ne voit que ses chantiers",
      "Portail client et sous-traitant, partage sécurisé",
      "Agents qui assignent, relancent et rendent compte",
      "Support prioritaire",
    ],
    limits: {
      maxApps: UNLIMITED,
      maxUsers: UNLIMITED,
      voice: true,
      offlineFirst: true,
      sharedWorkspace: true,
      whiteLabel: false,
      customUrl: false,
      multiNiche: false,
      accountingConnectors: true,
      autoMessaging: true,
      agentActions: true,
    },
  },
};

export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.pro];
export const PAID_PLAN_IDS: PlanId[] = ["pro", "equipe"];

// ── Plan Entreprise (sur devis, non facturé en self-service) ──────────────────
// Pas un PlanId : pas de Stripe Price, pas de paliers. Purement présentation +
// point de contact commercial. Le volume et le contrat sont négociés.

export const ENTERPRISE = {
  name: "Entreprise",
  tagline: "Sur devis",
  audience: "Pour les grands comptes et le secteur public",
  contactEmail: "contact@biltia.com",
  features: [
    "Capacité IA personnalisée, au meilleur tarif",
    "Marque blanche et URL personnalisée",
    "Multi-métiers (plusieurs activités)",
    "SSO et provisioning des comptes",
    "Contrat, DPA et hébergement dédié",
    "SLA, support et onboarding dédiés",
  ],
} as const;

// ── Offre Équipe (collaboration) ─────────────────────────────────────────────
// PRÉSENTATION UNIQUEMENT pour l'instant : le branchement Stripe et le flag
// d'entitlement `collaboration` (gates équipe/portail/périmètre + split agent)
// viennent ensuite. Équipe = Pro + LA COLLABORATION : tout ce qui « fait entrer
// quelqu'un d'autre dans Biltia » (inviter des salariés, comptes employés à
// périmètre, portail client/sous-traitant, rôles, agents qui interagissent avec
// l'externe). Le reste (créer/modifier, devis, questions, agents SOLO) est déjà
// dans Pro. L'add-on collaboration = +50 € sur le plan Pro 5 000 (129 → 179). Les
// paliers 10 000 et 25 000 n'ont pas d'équivalent Pro (Pro s'arrête à 5 000) : ils
// sont propres à Équipe. Volumes ≥ 5 000 : collaborer suppose déjà un usage sérieux.
export const COLLABORATION_ADDON_EUR = 50;

export const EQUIPE = {
  name: "Équipe",
  tagline: "Pour faire travailler vos salariés, clients et sous-traitants dans Biltia.",
  audience: "Artisans avec salariés, PME",
  /** 5 000 = Pro 5 000 (129 €) + 50 €. 10 000/25 000 sont propres à Équipe.
   *  Source partagée avec PLANS.equipe.tiers (pas de divergence de prix). */
  tiers: EQUIPE_TIERS,
  features: [
    "Tout le plan Pro, pour toute l'équipe",
    "Invitez vos collaborateurs : rôles et permissions",
    "Comptes employés : chacun ne voit que ses chantiers",
    "Portail client et sous-traitant, partage sécurisé",
    "Agents qui assignent, relancent et rendent compte",
    "Support prioritaire",
  ],
} as const;

// ── Packs de crédits (recharges one-time, NON expirables) ─────────────────────
// Achetés à l'unité quand le solde est bas. Volontairement PLUS CHERS au crédit
// que l'abonnement équivalent : recharger doit toujours coûter plus que monter
// d'un cran de forfait, pour pousser l'upgrade (modèle usage-based). One-time
// (Stripe mode:payment), crédités dans user_credits.topup_balance (ne périme
// jamais, cf. migration 027).
export interface CreditPack {
  credits: number;
  priceEur: number;
}

export const CREDIT_PACKS: CreditPack[] = [
  // Recharge = prix de l'abonnement équivalent + 10 € (décision user 2026-07-15) :
  // recharger coûte toujours un peu plus que monter d'un cran de forfait → pousse
  // l'upgrade. Le 1 000 (dépannage) reste à 29 €.
  { credits: 1000, priceEur: 29 }, //   dépannage ponctuel
  { credits: 2000, priceEur: 59 }, //   49 + 10
  { credits: 4000, priceEur: 109 }, //  99 + 10
  { credits: 6000, priceEur: 159 }, //  149 + 10
  { credits: 10000, priceEur: 259 }, // 249 + 10
  { credits: 20000, priceEur: 509 }, // 499 + 10
];

export function getPack(credits: number): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.credits === credits);
}

export function isValidPack(credits: number): boolean {
  return !!getPack(credits);
}

/** Nom de la variable d'env contenant le Stripe Price ID (one-time) d'un pack.
 *  Ex : 1000 → "STRIPE_PACK_1000". Retourne le NOM, jamais la valeur (pas de secret). */
export function stripePackEnvVar(credits: number): string {
  return `STRIPE_PACK_${credits}`;
}

// ── Regroupement des paliers par profil (pour le sélecteur de crédits) ────────
// Le plan Pro couvre tous les profils : ce découpage sert UNIQUEMENT à orienter
// l'utilisateur ("c'est destiné à qui") et à rendre 2 cartes sur la page tarifs,
// pas à la facturation. Solo/TPE = 1 000 à 3 000 ; Business = 10 000 à 25 000.
// Au-delà de 25 000 : offre Entreprise, sur devis.

export const TIER_SEGMENTS: { label: string; maxCredits: number }[] = [
  { label: "Solo / TPE", maxCredits: 6000 },
  { label: "Business", maxCredits: UNLIMITED },
];

/** Segment (profil) auquel appartient un volume de crédits. */
export function segmentForCredits(credits: number): string {
  return (TIER_SEGMENTS.find((s) => credits <= s.maxCredits) ?? TIER_SEGMENTS[TIER_SEGMENTS.length - 1]).label;
}

/** Paliers d'un plan regroupés par profil, dans l'ordre, groupes vides omis. */
export function groupTiers(tiers: CreditTier[]): { label: string; tiers: CreditTier[] }[] {
  return TIER_SEGMENTS
    .map((s, i) => {
      const min = i === 0 ? 0 : TIER_SEGMENTS[i - 1].maxCredits;
      return { label: s.label, tiers: tiers.filter((t) => t.credits > min && t.credits <= s.maxCredits) };
    })
    .filter((g) => g.tiers.length > 0);
}

// ── i18n : textes des plans en anglais ───────────────────────────────────────
// Le contenu FR (name/tagline/audience/features) reste la source ; on surcharge
// avec l'anglais quand l'interface est en EN. Les prix/limites/ids ne changent pas.
type PlanText = { name: string; tagline: string; audience: string; features: string[] };
const PLAN_EN: Record<string, PlanText> = {
  free: {
    name: "Free trial",
    tagline: "See what it does, then decide",
    audience: "No credit card",
    features: [
      `${SIGNUP_FREE_CREDITS} free credits, then ${TRIAL_DAYS} days from your first app`,
      "Build your first custom app",
      "Generate a real quote, read your documents",
      "1 user, 1 app",
      "When it ends: your data is kept, the workspace goes read-only",
    ],
  },
  pro: {
    name: "Pro",
    tagline: "The complete tool, no feature limits",
    audience: "For freelancers, tradespeople and small businesses",
    features: [
      "The whole tool, nothing held back",
      "Apps, quotes, questions and agents, per your AI credits",
      "Voice commands and offline mode",
      "Shared workspace, seats included",
      "Accounting connectors included",
      "Credits renewed every month",
    ],
  },
  equipe: {
    name: "Team",
    tagline: "Put your staff, clients and subcontractors to work inside Biltia.",
    audience: "Tradespeople with staff, SMBs",
    features: [
      "The whole Pro plan, for the whole team",
      "Invite your teammates: roles and permissions",
      "Employee accounts: each sees only their own job sites",
      "Client and subcontractor portal, secure sharing",
      "Agents that assign, follow up and report back",
      "Priority support",
    ],
  },
  enterprise: {
    name: "Enterprise",
    tagline: "Custom quote",
    audience: "For large accounts and the public sector",
    features: [
      "Custom AI capacity, at the best rate",
      "White-label and custom URL",
      "Multi-trade (several activities)",
      "SSO and account provisioning",
      "Contract, DPA and dedicated hosting",
      "Dedicated SLA, support and onboarding",
    ],
  },
};

const TIER_SEGMENT_EN: Record<string, string> = {
  "Solo / TPE": "Solo / Small biz",
  "Business": "Business",
};

/** Plan (free/pro/equipe) avec textes EN si l'interface est en anglais. */
export function localizePlan<T extends { id: PlanId; name: string; tagline: string; audience: string; features: string[] }>(plan: T, locale: Locale): T {
  if (locale !== "en") return plan;
  const en = PLAN_EN[plan.id];
  return en ? { ...plan, ...en } : plan;
}
// ENTERPRISE et EQUIPE sont figés `as const` (types littéraux en lecture seule) :
// on ne peut pas y réinjecter des chaînes EN sans élargir le type de retour.
export type LocalizedOffer = {
  name: string;
  tagline: string;
  audience: string;
  features: readonly string[];
};

/** Offre Entreprise (sur devis) avec textes EN. */
export function localizeEnterprise(locale: Locale): LocalizedOffer & { contactEmail: string } {
  return locale === "en" ? { ...ENTERPRISE, ...PLAN_EN.enterprise } : ENTERPRISE;
}
/** Offre Équipe (page tarifs) avec textes EN. */
export function localizeEquipe(locale: Locale): LocalizedOffer & { tiers: CreditTier[] } {
  return locale === "en" ? { ...EQUIPE, ...PLAN_EN.equipe } : EQUIPE;
}
/** Libellé de segment de crédits (Solo / TPE · Business) traduit si EN. */
export function tierSegmentLabel(label: string, locale: Locale): string {
  return locale === "en" ? TIER_SEGMENT_EN[label] ?? label : label;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getPlan(id: PlanId): Plan {
  return PLANS[id];
}

export function isPaidPlan(id: PlanId): id is "pro" | "equipe" {
  return id !== "free";
}

/** Retourne le palier {credits, priceEur} d'un plan payant, ou undefined. */
export function getTier(planId: PlanId, credits: number): CreditTier | undefined {
  return getPlan(planId).tiers.find((t) => t.credits === credits);
}

/** Vrai si (plan, credits) est une combinaison de facturation valide. */
export function isValidTier(planId: PlanId, credits: number): boolean {
  return isPaidPlan(planId) && !!getTier(planId, credits);
}

export function getLimits(planId: PlanId): PlanLimits {
  return getPlan(planId).limits;
}

// ── Cycle de facturation (mensuel / annuel) ──────────────────────────────────
// L'annuel offre 2 mois : total/an = mensuel × 10 (soit ~17 % d'économie). Les
// prix mensuels de PRO_TIERS restent la référence ; l'annuel s'en déduit.

export type BillingCycle = "monthly" | "annual";

/** Nombre de mois facturés sur un engagement annuel (2 mois offerts). */
export const ANNUAL_MONTHS_BILLED = 10;

/** Total facturé sur un an à partir d'un prix mensuel. */
export function annualTotalEur(monthlyEur: number): number {
  return monthlyEur * ANNUAL_MONTHS_BILLED;
}

/** Équivalent mensuel affiché quand on paie à l'année (arrondi à l'euro). */
export function annualMonthlyEur(monthlyEur: number): number {
  return Math.round((monthlyEur * ANNUAL_MONTHS_BILLED) / 12);
}

/** Prix mensuel AFFICHÉ d'un palier selon le cycle (annuel = équivalent/mois). */
export function tierDisplayMonthlyEur(tier: CreditTier, cycle: BillingCycle): number {
  return cycle === "annual" ? annualMonthlyEur(tier.priceEur) : tier.priceEur;
}

/**
 * Nom de la variable d'environnement contenant le Stripe Price ID de ce palier.
 * Ex : ("pro", 4000) → "STRIPE_PRICE_PRO_4000" ; annuel → suffixe "_ANNUAL".
 * NB : retourne le NOM de la variable, jamais sa valeur (pas de secret ici).
 */
export function stripePriceEnvVar(planId: PlanId, credits: number, cycle: BillingCycle = "monthly"): string {
  const base = `STRIPE_PRICE_${planId.toUpperCase()}_${credits}`;
  return cycle === "annual" ? `${base}_ANNUAL` : base;
}

/** Formate un montant en euros à la française : 1799 → "1 799 €". */
export function formatEur(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} €`;
}
