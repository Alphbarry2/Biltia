// ─────────────────────────────────────────────────────────────────────────────
// ENTITLEMENTS — droits d'un utilisateur selon son abonnement. CÔTÉ SERVEUR.
//
// Source unique des règles d'ACCÈS. Deux notions distinctes (décision produit) :
//   • ABONNEMENT = droit d'utiliser Biltia comme logiciel (créer/modifier une app,
//     saisir un chantier à la main, faire tourner l'espace). → champ `writable`.
//   • CRÉDITS   = actions IA qui produisent de la valeur neuve (gérés ailleurs,
//     lib/ai-usage.ts + deduct_credits). Le CRUD manuel ne consomme JAMAIS de crédit.
//
// Cycle de vie d'un abonnement payant :
//   active | trialing            → plein accès (writable)
//   past_due                     → FENÊTRE DE GRÂCE : accès complet + bandeau
//                                  « paiement refusé » (paymentIssue). writable reste vrai.
//   canceled | unpaid | …        → GEL : espace en LECTURE SEULE (frozen). Consultation
//                                  et export restent ouverts ; toute écriture est refusée.
//
// Free (aucun abonnement) : essai / petit palier gratuit. Reste writable pour que
// l'onboarding fonctionne (voir FREE_TENANT_WRITABLE ci-dessous).
//
// NB : la table `subscriptions` n'est pas dans database.types.ts → client structurel
// non typé (cf. lib/ai-usage.ts pour `ai_usage`).
// ─────────────────────────────────────────────────────────────────────────────

import { getPlan, type PlanId, type PlanLimits } from "./plans";
import { pick, type Locale } from "./i18n/config";

/** Vue minimale d'un client Supabase, compatible client typé ET service_role. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

// ── Cartographie des statuts Stripe ──────────────────────────────────────────
// « active » / « trialing » = plein accès (branche writable par défaut ci-dessous) ;
// seuls les statuts de grâce et de gel ont besoin d'un traitement explicite.
/** Grâce : paiement échoué, accès maintenu ~5 j (config dunning Stripe). */
const GRACE_STATUSES = new Set(["past_due"]);
/** Gel : abonnement terminé → lecture seule. */
const FROZEN_STATUSES = new Set([
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
]);

/**
 * POLITIQUE Free (jamais payé) : `true` = un tenant sans abonnement reste
 * writable (essai + petit palier gratuit, onboarding non cassé). Passer à
 * `false` pour figer aussi le Free en lecture seule dès que le déclencheur
 * d'expiration de l'essai est défini (ex. crédits d'essai épuisés).
 * Décision utilisateur en attente — voir [[project_pricing_billing]].
 */
export const FREE_TENANT_WRITABLE = true;

export interface Entitlements {
  /** Plan EFFECTIF pour le gating des features (frozen → "free"). */
  plan: PlanId;
  /** Statut brut de l'abonnement ("active", "past_due", "canceled"…). */
  status: string;
  /** Droit de CRÉER / MODIFIER (CRUD manuel + actions IA). Lecture toujours ouverte. */
  writable: boolean;
  /** Abonnement payant terminé → espace en lecture seule (bandeau rouge). */
  frozen: boolean;
  /** Paiement échoué, fenêtre de grâce en cours → bandeau orange « régularisez ». */
  paymentIssue: boolean;
  /** Fin de période courante (ISO) — info + point d'ancrage du décompte de grâce. */
  periodEnd: string | null;
  /** Fonctions de COLLABORATION débloquées (plan Équipe = Pro + 50 €). Un Pro solo
   *  ne les a pas : invitations d'équipe, comptes collaborateurs, portail
   *  client/sous-traitant, périmètre employé, agents collaboratifs. */
  collaboration: boolean;
  limits: PlanLimits;
}

const FREE_ENTITLEMENTS: Entitlements = {
  plan: "free",
  status: "free",
  writable: FREE_TENANT_WRITABLE,
  frozen: false,
  paymentIssue: false,
  periodEnd: null,
  collaboration: false,
  limits: getPlan("free").limits,
};

/** Un statut inconnu ne doit pas verrouiller un client légitime : fail-open sur
 *  l'écriture, mais jamais plus permissif que "free" pour les features. */
function isPaidPlanId(p: unknown): p is PlanId {
  return p === "pro";
}

/**
 * Résout les droits à partir du tenant DÉJÀ connu (évite de re-résoudre le
 * membership quand l'appelant l'a déjà — routes API notamment).
 */
export async function getEntitlementsForTenant(
  supabase: QueryableClient,
  tenantId: string
): Promise<Entitlements> {
  try {
    const { data } = await supabase
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    // Aucune ligne d'abonnement → tenant Free (essai).
    if (!data) return FREE_ENTITLEMENTS;

    const status: string = data.status ?? "free";
    const periodEnd: string | null = data.current_period_end ?? null;

    // GEL : abonnement payant terminé → lecture seule, features Free.
    if (FROZEN_STATUSES.has(status)) {
      return {
        plan: "free",
        status,
        writable: false,
        frozen: true,
        paymentIssue: false,
        periodEnd,
        collaboration: false,
        limits: getPlan("free").limits,
      };
    }

    // Plan effectif conservé tant que l'abonnement n'est pas gelé (grâce incluse).
    // COLLABORATION : débloque les fonctions d'équipe (invitation, portail client,
    // agents collaboratifs). Tant que l'add-on Équipe (+50 €) n'a pas sa source de
    // droit branchée côté Stripe/checkout, TOUT plan payant (Pro) l'obtient — c'est
    // le comportement d'avant (sharedWorkspace) : on ne dégrade pas les clients
    // payants existants. Un futur plan "equipe" en base l'active aussi. Le Free ne
    // l'a jamais. NE PAS restreindre au seul "equipe" avant que l'achat existe.
    const rawPlan: string | null = data.plan ?? null;
    const collaboration = isPaidPlanId(rawPlan) || rawPlan === "equipe";
    const plan: PlanId = isPaidPlanId(rawPlan) || collaboration ? "pro" : "free";
    const paymentIssue = GRACE_STATUSES.has(status);

    return {
      plan,
      status,
      writable: true, // active | trialing | past_due (grâce) | statut inconnu
      frozen: false,
      paymentIssue,
      periodEnd,
      collaboration,
      limits: getPlan(plan).limits,
    };
  } catch {
    // Fail-safe : jamais plus permissif que Free (writable reste selon la politique Free).
    return FREE_ENTITLEMENTS;
  }
}

/**
 * Charge les droits de l'utilisateur (résout d'abord son workspace). Dégrade
 * vers Free si aucun workspace / aucun abonnement / erreur.
 */
export async function getEntitlements(
  supabase: QueryableClient,
  userId: string
): Promise<Entitlements> {
  try {
    // Workspace (tenant) de l'utilisateur — le plus ancien accepté.
    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .not("accepted_at", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const tenantId: string | undefined = membership?.tenant_id;
    if (!tenantId) return FREE_ENTITLEMENTS;

    return getEntitlementsForTenant(supabase, tenantId);
  } catch {
    return FREE_ENTITLEMENTS;
  }
}

/** Raccourci : l'utilisateur peut-il déployer une app en Live ? */
export function canDeployLive(ent: Entitlements): boolean {
  return ent.limits.liveDeploy;
}

/** Envoi automatique d'emails / SMS (apps + agents) — réservé aux plans payants. */
export function canSendMessages(ent: Entitlements): boolean {
  return ent.limits.autoMessaging;
}

/** Agents qui AGISSENT (relance, compte-rendu, rapport, planning). Les alertes
 *  (notify) restent ouvertes à tous ; ceci ne gate QUE les actions payantes. */
export function canUseAgentActions(ent: Entitlements): boolean {
  return ent.limits.agentActions;
}

/** Fonctions de COLLABORATION — réservées au plan Équipe (Pro + 50 €) : inviter des
 *  collaborateurs, portail client/sous-traitant, périmètre employé, agents
 *  collaboratifs. Un Pro solo ne les a pas. */
export function canCollaborate(ent: Entitlements): boolean {
  return ent.collaboration;
}

/** Inviter des collaborateurs — réservé au plan Équipe (collaboration). */
export function canInviteTeam(ent: Entitlements): boolean {
  return ent.collaboration;
}

/** Message standard quand une fonctionnalité nécessite un plan payant (réponse 403,
 *  accompagnée de `upgrade: true` pour que le client propose le passage à Pro). */
export const UPGRADE_MESSAGE =
  "Cette fonctionnalité fait partie du plan Pro. Passez à un plan payant depuis Paramètres → Facturation pour l'activer.";

/** Message quand une fonction de COLLABORATION nécessite le plan Équipe (Pro + 50 €). */
export const EQUIPE_UPGRADE_MESSAGE =
  "Cette fonctionnalité fait partie du plan Équipe. Ajoutez la collaboration (+50 €/mois) depuis Paramètres → Facturation pour inviter votre équipe, ouvrir un portail à vos clients et sous-traitants, et activer les agents collaboratifs.";

/** Message standard renvoyé quand une écriture est refusée pour cause de gel. */
export const FROZEN_MESSAGE =
  "Votre espace est en lecture seule : votre abonnement a expiré. Réactivez-le pour reprendre votre activité (vos données restent consultables et exportables).";

// ── i18n : versions locale-aware des 3 messages ci-dessus ────────────────────
// Les constantes FR restent exportées (compat : elles servent de source). Les
// routes qui répondent à un NAVIGATEUR doivent utiliser ces fonctions, pour que
// le message suive la langue de l'interface.

/** Gel (abonnement expiré) — dans la langue de l'utilisateur. */
export function frozenMessage(locale: Locale): string {
  return pick(
    locale,
    FROZEN_MESSAGE,
    "Your workspace is read-only: your subscription has expired. Reactivate it to resume work (your data stays viewable and exportable).",
  );
}

/** Fonctionnalité réservée au plan Pro — dans la langue de l'utilisateur. */
export function upgradeMessage(locale: Locale): string {
  return pick(
    locale,
    UPGRADE_MESSAGE,
    "This feature is part of the Pro plan. Switch to a paid plan from Settings → Billing to enable it.",
  );
}

/** Fonctionnalité réservée au plan Équipe — dans la langue de l'utilisateur. */
export function equipeUpgradeMessage(locale: Locale): string {
  return pick(
    locale,
    EQUIPE_UPGRADE_MESSAGE,
    "This feature is part of the Team plan. Add collaboration (+€50/month) from Settings → Billing to invite your team, open a portal for your clients and subcontractors, and enable collaborative agents.",
  );
}
