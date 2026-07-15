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
import { getCapabilityStatuses } from "./agent-capabilities";
import { connectorsForCapability, type CapabilityId } from "./capabilities";
import { WATCHER_PROBE } from "./agent-feasibility";
import type { AgentActionType, AgentRecipientKind } from "./agent-rules";
import type { WatcherKey } from "./agent-watchers";
import { pick, type Locale } from "./i18n/config";

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

function requiredCapabilities(plan: AgentReadinessPlan, locale: Locale): Requirement[] {
  const reqs: Requirement[] = [];

  // Écrire à un TIERS (client, fournisseur, équipe) EN VOTRE NOM → il faut VOTRE
  // boîte. Une relance de facture qui part d'une adresse Biltia n'est pas la vôtre :
  // le client ne peut pas y répondre, et votre relance ne ressemble plus à vous.
  // Aucun repli acceptable → block. (C'est ce contrôle qui ne se déclenchait jamais :
  // il interrogeait un « ok » vrai dès que Resend était configuré, donc toujours.)
  const writesToThirdParty =
    (plan.actionType === "send_email" && plan.recipientKind !== "me") || plan.actionType === "team_planning";
  if (writesToThirdParty) {
    reqs.push({
      cap: "email_send",
      severity: "block",
      title: pick(locale, "Votre messagerie n'est pas connectée", "Your mailbox isn't connected"),
      detail: pick(
        locale,
        "Cet agent écrit en votre nom. Sans votre messagerie branchée, le message ne partirait pas de votre adresse et votre destinataire ne pourrait pas vous répondre. Connectez Gmail ou Outlook.",
        "This agent writes on your behalf. Without your mailbox connected, the message wouldn't come from your address and your recipient couldn't reply to you. Connect Gmail or Outlook."
      ),
    });
  }

  // Transmettre le planning → il faut l'AGENDA.
  //
  // ⚠️ La sévérité déclarée ici n'est qu'un PLANCHER : elle est relevée à "block"
  // plus bas dès qu'un connecteur "live" peut réparer le manque (ce qui est le cas
  // de l'agenda). Le repli « on enverra les interventions du Workspace » existe
  // techniquement, mais on ne s'en sert PAS pour activer quand même : envoyer un
  // planning qui n'est pas le vrai planning, c'est envoyer un faux planning à 26
  // personnes. Un agent ne se recrute pas tant que tout n'est pas connecté.
  if (plan.actionType === "team_planning") {
    reqs.push({
      cap: "calendar_read",
      severity: "warn",
      title: pick(locale, "Google Calendar non connecté", "Google Calendar not connected"),
      detail: pick(
        locale,
        "Sans agenda branché, Biltia transmettra les interventions planifiées de votre Workspace. Connectez Google Calendar pour envoyer votre vrai planning.",
        "Without a connected calendar, Biltia will send the jobs scheduled in your Workspace. Connect Google Calendar to send your real schedule."
      ),
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
      title: pick(locale, "Notifications non activées", "Notifications are off"),
      detail: pick(
        locale,
        "Cet agent vous prévient par notification. Activez-les pour être alerté en direct — en attendant, chaque alerte reste consultable dans Agents.",
        "This agent alerts you by notification. Turn them on to be warned in real time — in the meantime, every alert stays available under Agents."
      ),
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
  /** Langue de l'interface (les manques sont affichés tels quels). Défaut FR. */
  locale?: Locale;
}): Promise<ReadinessResult> {
  const { supabase, tenantId, userId, plan, locale = "fr" } = opts;
  const gaps: CapabilityGap[] = [];

  // ── ÉTAPE 3 : pour chaque outil requis, l'ai-je (supported) et est-il branché
  //    (connected) ? Une seule photographie du registre pour tous les besoins. ──
  const reqs = requiredCapabilities(plan, locale);
  if (reqs.length > 0) {
    let statuses: Awaited<ReturnType<typeof getCapabilityStatuses>> | null = null;
    try {
      statuses = await getCapabilityStatuses({ supabase, tenantId, userId, locale });
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
            title: pick(locale, `${st.label} : pas encore disponible`, `${st.label}: not available yet`),
            detail: pick(
              locale,
              `Biltia ne sait pas encore ${st.label} automatiquement pour un agent. Cette mission n'est pas dans mes capacités pour l'instant.`,
              `Biltia can't handle ${st.label} automatically for an agent yet. This mission is outside my capabilities for now.`
            ),
          });
        } else if (!st.connected) {
          // ── UN MANQUE QU'UN CLIC RÉPARE EST TOUJOURS BLOQUANT ────────────────
          // Règle produit, répétée et non négociable : ON NE RECRUTE PAS UN AGENT
          // TANT QUE TOUT N'EST PAS CONNECTÉ.
          //
          // Le « warn » (agir en mode dégradé) était doublement toxique ici :
          //   · les cartes « Connecter » ne sont tirées QUE des manques "block"
          //     (5 appelants) → un warn n'affichait AUCUN bouton ;
          //   · l'agent s'activait quand même, et annonçait « Actif ».
          // Résultat vécu en prod (2026-07-14) : un agent « planning hebdo aux
          // équipes » recruté, affiché actif, avec la mention « Google Calendar non
          // connecté » — et aucun moyen de le connecter. L'artisan croyait son
          // planning parti ; il serait parti FAUX (les interventions du workspace
          // au lieu de son vrai agenda). C'est l'« à peu près » que ce produit
          // refuse partout ailleurs.
          //
          // La sévérité n'est donc plus déclarée à la main : elle se DÉDUIT du
          // registre. Un connecteur "live" existe pour cette capacité ? Alors un
          // bouton peut la réparer, donc on l'exige. Sinon (notifications = une
          // permission du navigateur ; SMS = un fournisseur plateforme), aucun clic
          // n'y changerait rien : on garde le warn, et l'agent tourne en dégradé.
          const reparableParUnClic = connectorsForCapability(req.cap).length > 0;
          gaps.push({
            code: req.cap,
            severity: reparableParUnClic ? "block" : req.severity,
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
          title: pick(locale, "Aucun employé dans votre espace", "No employees in your workspace"),
          detail: pick(
            locale,
            "Cet agent envoie le planning à votre équipe, mais aucun employé n'est enregistré. Ajoutez vos employés dans le Workspace.",
            "This agent sends the schedule to your team, but no employee is on file. Add your employees in the Workspace."
          ),
          fix: { label: pick(locale, "Ajouter mon équipe", "Add my team"), href: HREF_WORKSPACE },
        });
      } else if (withEmail.length === 0) {
        gaps.push({
          code: "team_email",
          severity: "block",
          title: pick(locale, "Aucun employé n'a d'email", "No employee has an email address"),
          detail: pick(
            locale,
            "Vos employés sont enregistrés mais aucun n'a d'adresse email : impossible de leur transmettre le planning. Complétez leurs fiches.",
            "Your employees are on file but none has an email address, so the schedule can't reach them. Complete their records."
          ),
          fix: { label: pick(locale, "Compléter les fiches", "Complete the records"), href: HREF_WORKSPACE },
        });
      }
    } catch {
      // lecture indisponible → on ne bloque pas (fail-open)
    }
  }

  // ── « EST-CE QU'IL A LA DATA ? » (incident 2026-07-14) ──────────────────────
  // Un agent « relance mes impayés » sur un Workspace SANS AUCUNE FACTURE
  // s'affichait « Actif » et ne se déclenchait jamais. Le preflight ne sondait que
  // employees et materials : tout le reste passait au travers.
  //
  // On ne sonde QUE les veilleurs d'ÉTAT (WATCHER_PROBE) : ceux qui examinent le
  // stock existant. Les veilleurs d'ARRIVÉE (« dès qu'un nouveau client est créé »)
  // attendent le FUTUR — table vide aujourd'hui, c'est normal, on ne bloque rien.
  const probe = plan.watcher ? WATCHER_PROBE[plan.watcher] : undefined;
  if (probe) {
    try {
      const { count } = await supabase
        .from(probe.table)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if ((count ?? 0) === 0) {
        gaps.push({
          code: "data_empty",
          severity: "block",
          title: pick(
            locale,
            `Aucun ${probe.noun} dans votre Workspace`,
            `No ${probe.noun} in your Workspace`
          ),
          detail: pick(
            locale,
            `Cet agent se base sur vos ${probe.noun}s pour travailler, or votre Workspace n'en contient aucun : il ne se déclencherait jamais. Ajoutez ou importez vos ${probe.noun}s, puis redemandez-moi cet agent.`,
            `This agent works from your ${probe.noun}s, but your Workspace has none: it would never fire. Add or import your ${probe.noun}s, then ask me for this agent again.`
          ),
          fix: { label: pick(locale, "Ouvrir le Workspace", "Open the Workspace"), href: HREF_WORKSPACE },
        });
      }
    } catch {
      // table illisible → on ne bloque pas (fail-open)
    }
  }

  // Y a-t-il quelque chose à surveiller ? (le veilleur stock exige EN PLUS un seuil.)
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
          title: pick(locale, "Aucun seuil d'alerte défini", "No alert threshold set"),
          detail: pick(
            locale,
            "L'agent surveille les matériaux passés sous leur seuil d'alerte, mais aucun matériau n'a de seuil. Définissez-en dans le Workspace pour qu'il se déclenche.",
            "The agent watches for materials dropping below their alert threshold, but no material has one. Set thresholds in the Workspace so it can fire."
          ),
          fix: { label: pick(locale, "Définir un seuil", "Set a threshold"), href: HREF_WORKSPACE },
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
