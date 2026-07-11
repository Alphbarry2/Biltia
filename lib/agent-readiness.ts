// ─────────────────────────────────────────────────────────────────────────────
// AGENT READINESS — le PREFLIGHT de capacité (« est-ce que je peux VRAIMENT le
// faire ? ») exécuté À L'ACTIVATION / AU RECRUTEMENT, pas des heures plus tard au
// premier tick du cron.
//
// Le raisonnement (demande user 2026-07-10), comme le ferait un employé :
//   1. COMPRENDRE la demande  → déjà fait par le parsing (action + veilleur).
//   2. QUELS OUTILS ça exige  → requiredCapabilities(plan) ci-dessous.
//   3. Ai-je l'outil / est-il branché ?  → le registre lib/agent-capabilities.ts.
//      • outil inexistant (supported=false)  → « hors de mes capacités » (block).
//      • outil non branché (connected=false) → « connectez X » (block ou warn
//        selon qu'il existe un repli pour la mission).
//   4. Les DONNÉES nécessaires sont-elles là ? (équipe joignable, seuils de stock).
//
// On distingue block (l'agent ne PEUT PAS agir → activation refusée) et warn
// (il agit en mode dégradé → activé mais signalé). STRICTEMENT CÔTÉ SERVEUR.
// Ne throw jamais : un preflight indisponible ne bloque pas l'activation.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCapabilityStatuses, type CapabilityId } from "./agent-capabilities";
import type { AgentActionType, AgentRecipientKind } from "./agent-rules";
import type { WatcherKey } from "./agent-watchers";

/** Un moyen/une donnée qui manque pour que l'agent travaille vraiment. */
export type CapabilityGap = {
  /** Identifiant stable (email_send, push_notify, calendar_read, team_email, stock_seuil…). */
  code: string;
  /** block = l'agent ne peut pas agir ; warn = il agit en mode dégradé. */
  severity: "block" | "warn";
  /** Titre court de la puce (« Aucun moyen d'envoyer des emails »). */
  title: string;
  /** Explication en une phrase, orientée artisan. */
  detail: string;
  /** Où aller le corriger (bouton dans la pop-up). */
  fix?: { label: string; href: string };
};

/** Ce que l'agent VA faire — assez pour en déduire ses besoins. */
export type AgentReadinessPlan = {
  actionType: AgentActionType;
  recipientKind: AgentRecipientKind;
  /** Veilleur si c'est un agent-événement (sinon null). */
  watcher?: WatcherKey | null;
};

export type ReadinessResult = {
  /** true si aucun manque BLOQUANT (les warnings n'empêchent pas l'activation). */
  ok: boolean;
  gaps: CapabilityGap[];
};

const HREF_WORKSPACE = "/workspace";

// ── ÉTAPE 2 : de la demande comprise aux OUTILS requis ───────────────────────
// Chaque besoin dit QUEL outil, si c'est BLOQUANT (pas de repli) ou RECOMMANDÉ
// (repli existant), et la phrase à montrer si l'outil manque. La copie vit ici
// (elle dépend de la mission) ; l'état de l'outil vient du registre.
type Requirement = {
  cap: CapabilityId;
  severity: "block" | "warn";
  /** Titre affiché si l'outil n'est pas branché. */
  title: string;
  /** Explication affichée si l'outil n'est pas branché. */
  detail: string;
};

function requiredCapabilities(plan: AgentReadinessPlan): Requirement[] {
  const reqs: Requirement[] = [];

  // Écrire à un client / à l'équipe → il faut un canal d'envoi. Pas de repli : block.
  if (plan.actionType === "send_email" || plan.actionType === "team_planning") {
    reqs.push({
      cap: "email_send",
      severity: "block",
      title: "Aucun moyen d'envoyer des emails",
      detail:
        "Cet agent écrit à votre place, mais aucune boîte d'envoi n'est branchée. Connectez votre Gmail pour qu'il envoie depuis votre adresse.",
    });
  }

  // Transmettre le planning → l'agenda est le mieux, mais le Workspace sert de
  // repli → recommandé (warn), pas bloquant.
  if (plan.actionType === "team_planning") {
    reqs.push({
      cap: "calendar_read",
      severity: "warn",
      title: "Google Calendar non connecté",
      detail:
        "Sans agenda branché, Biltia transmettra les interventions planifiées de votre Workspace. Connectez Google Calendar pour envoyer votre vrai planning.",
    });
  }

  // Prévenir le patron → ça passe par les notifications. Repli : consultable dans
  // /agents → recommandé (warn). Le compte-rendu livre d'abord un document : la
  // notif y est secondaire, on ne la réclame pas.
  const alertsOwner =
    plan.recipientKind === "me" && (plan.actionType === "notify" || plan.actionType === "report");
  if (alertsOwner) {
    reqs.push({
      cap: "push_notify",
      severity: "warn",
      title: "Notifications non activées",
      detail:
        "Cet agent vous prévient par notification. Activez-les pour être alerté en direct — en attendant, chaque alerte reste consultable dans Agents.",
    });
  }

  return reqs;
}

/**
 * Vérifie que l'agent décrit par `plan` a tout ce qu'il lui faut MAINTENANT.
 * Ne throw jamais : au moindre imprévu, on considère la vérification neutre
 * (fail-open) pour ne pas bloquer un artisan à tort.
 */
export async function checkAgentReadiness(opts: {
  supabase: SupabaseClient;
  tenantId: string;
  userId: string | null;
  userEmail: string | null;
  plan: AgentReadinessPlan;
}): Promise<ReadinessResult> {
  const { supabase, tenantId, userId, plan } = opts;
  const gaps: CapabilityGap[] = [];

  // ── ÉTAPE 3 : pour chaque outil requis, l'ai-je (supported) et est-il branché
  //    (connected) ? Une seule photographie du registre pour tous les besoins. ──
  const reqs = requiredCapabilities(plan);
  if (reqs.length > 0) {
    let statuses: Awaited<ReturnType<typeof getCapabilityStatuses>> | null = null;
    try {
      statuses = await getCapabilityStatuses({ supabase, tenantId, userId });
    } catch {
      statuses = null; // registre indisponible → on ne bloque pas (fail-open)
    }
    if (statuses) {
      for (const req of reqs) {
        const st = statuses[req.cap];
        if (!st) continue;
        if (!st.supported) {
          // Hors de mes capacités : l'outil n'existe pas encore côté Biltia.
          gaps.push({
            code: req.cap,
            severity: "block",
            title: `${st.label} : pas encore disponible`,
            detail: `Biltia ne sait pas encore ${st.label} automatiquement pour un agent. Cette mission n'est pas dans mes capacités pour l'instant.`,
          });
        } else if (!st.connected) {
          // L'outil existe mais n'est pas branché → on dit quoi connecter.
          gaps.push({
            code: req.cap,
            severity: req.severity,
            title: req.title,
            detail: req.detail,
            fix: st.fix,
          });
        }
      }
    }
  }

  // ── ÉTAPE 4 : les DONNÉES nécessaires sont-elles présentes ? ────────────────
  // (distinct des outils : un canal branché ne sert à rien sans destinataire ni
  //  rien à surveiller.)

  // Une équipe joignable pour le planning (destinataires du send).
  if (plan.actionType === "team_planning" || plan.recipientKind === "team") {
    try {
      const { data } = await supabase
        .from("employees")
        .select("email")
        .eq("tenant_id", tenantId)
        .limit(200);
      const rows = (data ?? []) as { email: string | null }[];
      const withEmail = rows.filter((r) => r.email && r.email.includes("@"));
      if (rows.length === 0) {
        gaps.push({
          code: "team_empty",
          severity: "block",
          title: "Aucun employé dans votre espace",
          detail:
            "Cet agent envoie le planning à votre équipe, mais aucun employé n'est enregistré. Ajoutez vos employés dans le Workspace.",
          fix: { label: "Ajouter mon équipe", href: HREF_WORKSPACE },
        });
      } else if (withEmail.length === 0) {
        gaps.push({
          code: "team_email",
          severity: "block",
          title: "Aucun employé n'a d'email",
          detail:
            "Vos employés sont enregistrés mais aucun n'a d'adresse email : impossible de leur transmettre le planning. Complétez leurs fiches.",
          fix: { label: "Compléter les fiches", href: HREF_WORKSPACE },
        });
      }
    } catch {
      // lecture indisponible → on ne bloque pas (fail-open)
    }
  }

  // Y a-t-il quelque chose à surveiller ? (le veilleur stock exige un seuil.)
  if (plan.watcher === "stock_bas") {
    try {
      const { count } = await supabase
        .from("materials")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .not("seuil_alerte", "is", null)
        .gt("seuil_alerte", 0);
      if ((count ?? 0) === 0) {
        gaps.push({
          code: "stock_seuil",
          severity: "warn",
          title: "Aucun seuil d'alerte défini",
          detail:
            "L'agent surveille les matériaux passés sous leur seuil d'alerte, mais aucun matériau n'a de seuil. Définissez-en dans le Workspace pour qu'il se déclenche.",
          fix: { label: "Définir un seuil", href: HREF_WORKSPACE },
        });
      }
    } catch {
      // matériaux illisibles → on ignore (fail-open)
    }
  }

  const ok = gaps.every((g) => g.severity !== "block");
  return { ok, gaps };
}

/** Rend les manques en une phrase pour un message de chat (« il me manque X ; Y »). */
export function summarizeGaps(gaps: CapabilityGap[]): string {
  return gaps.map((g) => g.title.toLowerCase()).join(" ; ");
}
