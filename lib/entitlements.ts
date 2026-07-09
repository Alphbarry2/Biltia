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
  limits: PlanLimits;
}

const FREE_ENTITLEMENTS: Entitlements = {
  plan: "free",
  status: "free",
  writable: FREE_TENANT_WRITABLE,
  frozen: false,
  paymentIssue: false,
  periodEnd: null,
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
        limits: getPlan("free").limits,
      };
    }

    // Plan effectif conservé tant que l'abonnement n'est pas gelé (grâce incluse).
    const plan: PlanId = isPaidPlanId(data.plan) ? data.plan : "free";
    const paymentIssue = GRACE_STATUSES.has(status);

    return {
      plan,
      status,
      writable: true, // active | trialing | past_due (grâce) | statut inconnu
      frozen: false,
      paymentIssue,
      periodEnd,
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

/** Inviter des collaborateurs (sièges / workspace partagé) — plans payants. */
export function canInviteTeam(ent: Entitlements): boolean {
  return ent.limits.sharedWorkspace;
}

/** Message standard quand une fonctionnalité nécessite un plan payant (réponse 403,
 *  accompagnée de `upgrade: true` pour que le client propose le passage à Pro). */
export const UPGRADE_MESSAGE =
  "Cette fonctionnalité fait partie du plan Pro. Passez à un plan payant depuis Paramètres → Facturation pour l'activer.";

/** Message standard renvoyé quand une écriture est refusée pour cause de gel. */
export const FROZEN_MESSAGE =
  "Votre espace est en lecture seule : votre abonnement a expiré. Réactivez-le pour reprendre votre activité (vos données restent consultables et exportables).";
