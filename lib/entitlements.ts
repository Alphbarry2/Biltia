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
 * POLITIQUE Free : un tenant sans abonnement reste writable TANT QUE son essai
 * court. Ce n'est plus un palier gratuit permanent (décision user 2026-07-14) :
 * c'est un ESSAI, borné par deux limites dont la première atteinte gagne —
 *   • les CRÉDITS (400) : le vrai verrou, il s'applique tout seul (deduct_credits) ;
 *   • le TEMPS (TRIAL_DAYS), à partir de la PREMIÈRE APPLICATION CRÉÉE.
 * Tant que `tenants.trial_ends_at` est NULL (rien construit), il reste writable :
 * ses crédits le bornent déjà. Une fois la date passée → GEL (lecture seule).
 */
export const FREE_TENANT_WRITABLE = true;

/** Vrai si l'essai gratuit de ce tenant est terminé (date posée ET dépassée).
 *  NULL = essai pas encore démarré → pas expiré. */
function trialIsOver(trialEndsAt: string | null): boolean {
  if (!trialEndsAt) return false;
  const end = Date.parse(trialEndsAt);
  return Number.isFinite(end) && end <= Date.now();
}

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
  /** Fin de l'essai gratuit (ISO), ou null si l'essai n'a pas démarré / plan payant.
   *  Posé à la PREMIÈRE application créée — pas à l'inscription. */
  trialEndsAt: string | null;
  /** L'essai gratuit est terminé → espace en lecture seule (distinct de `frozen`,
   *  qui, lui, dit « ton abonnement PAYANT a expiré » : ce ne sont pas les mêmes
   *  gens, ni le même message, ni le même bouton). */
  trialExpired: boolean;
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
  trialEndsAt: null,
  trialExpired: false,
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

    // ── AUCUN ABONNEMENT → ESSAI GRATUIT ───────────────────────────────────────
    // Deux limites, la première atteinte gagne. Les CRÉDITS sont le vrai verrou et
    // s'appliquent tout seuls (deduct_credits refuse quand le solde est vide) ; ici
    // on ne traite que le TEMPS. Tant que `trial_ends_at` est NULL, il n'a encore
    // rien construit : on ne le gèle pas, ses crédits le bornent déjà.
    if (!data) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("trial_ends_at")
        .eq("id", tenantId)
        .maybeSingle();

      const trialEndsAt: string | null = tenant?.trial_ends_at ?? null;
      const trialExpired = trialIsOver(trialEndsAt);

      return {
        ...FREE_ENTITLEMENTS,
        trialEndsAt,
        trialExpired,
        // Essai terminé → LECTURE SEULE. Les données et les applications restent
        // consultables et exportables : on ne détruit rien, c'est justement ce qui
        // rend coûteux le fait de partir.
        writable: trialExpired ? false : FREE_TENANT_WRITABLE,
      };
    }

    const status: string = data.status ?? "free";
    const periodEnd: string | null = data.current_period_end ?? null;

    // GEL : abonnement payant terminé → lecture seule, features Free.
    // NB : un ancien abonné n'est PAS renvoyé dans l'essai gratuit (`trialExpired`
    // reste faux) — il a déjà payé, son message et son bouton sont différents.
    if (FROZEN_STATUSES.has(status)) {
      return {
        plan: "free",
        status,
        writable: false,
        frozen: true,
        paymentIssue: false,
        periodEnd,
        collaboration: false,
        trialEndsAt: null,
        trialExpired: false,
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
      // Un abonné PAYANT n'a plus d'essai : la date en base est ignorée, sinon un
      // client qui paie se retrouverait gelé par un chrono d'essai périmé.
      trialEndsAt: null,
      trialExpired: false,
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

/** Fin de l'ESSAI (jamais payé) — à ne pas confondre avec un abonnement expiré :
 *  ce ne sont pas les mêmes gens, et leur dire « votre abonnement a expiré » alors
 *  qu'ils n'en ont jamais eu serait absurde. Ses données restent intactes. */
export const TRIAL_OVER_MESSAGE =
  "Votre essai gratuit est terminé. Vos applications et vos données sont conservées : passez au plan Pro (49 €/mois) pour reprendre là où vous en étiez.";

/** Fin de l'essai gratuit — dans la langue de l'utilisateur. */
export function trialOverMessage(locale: Locale): string {
  return pick(
    locale,
    TRIAL_OVER_MESSAGE,
    "Your free trial has ended. Your apps and data are kept: switch to the Pro plan (€49/month) to pick up where you left off.",
  );
}

/** Gel — dans la langue de l'utilisateur. Distingue l'essai terminé (jamais payé)
 *  de l'abonnement expiré : même verrou, deux messages, deux boutons. */
export function frozenMessage(locale: Locale, ent?: Entitlements): string {
  if (ent?.trialExpired) return trialOverMessage(locale);
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
