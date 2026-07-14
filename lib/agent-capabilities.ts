// ─────────────────────────────────────────────────────────────────────────────
// AGENT CAPABILITIES — le REGISTRE des outils d'un agent, et leur état pour un
// user/tenant donné. C'est la brique « est-ce que j'ai l'outil, et est-il
// branché ? » (demande user 2026-07-10 : un agent doit COMPRENDRE ce qu'on lui
// demande, en déduire les outils nécessaires, puis vérifier deux choses —
//   1. supported : Biltia sait-il faire ça du tout ? (sinon « hors de mes capacités »)
//   2. connected : est-ce branché pour CET utilisateur ? (sinon « connectez X »).
//
// On sépare volontairement l'ÉTAT d'un outil (ici, générique) de la POLITIQUE
// « tel agent a-t-il besoin de tel outil, est-ce bloquant ou juste recommandé »
// (lib/agent-readiness.ts). Ajouter un outil = une entrée ici + une ligne dans la
// dérivation des besoins. STRICTEMENT CÔTÉ SERVEUR. Ne throw jamais.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { canSendOutbound } from "./outbound-email";
import { canSendSms } from "./outbound-sms";
import { calendarConnected } from "./calendar";
import { pick, type Locale } from "./i18n/config";

/** Les outils qu'un agent peut mobiliser. Étendre ici quand un connecteur arrive. */
export type CapabilityId = "email_send" | "sms_send" | "calendar_read" | "push_notify";

export type CapabilityStatus = {
  id: CapabilityId;
  /** Nom humain de l'outil (« envoi d'emails », « agenda Google »). */
  label: string;
  /** Biltia sait-il faire ça du tout ? false = hors capacités (rien à connecter). */
  supported: boolean;
  /** L'outil est-il branché/utilisable pour ce user/tenant maintenant ? */
  connected: boolean;
  /** Où le brancher (bouton de la pop-up). Absent si rien à faire côté utilisateur. */
  fix?: { label: string; href: string };
};

const HREF_CONNECTORS = "/connectors";
const HREF_NOTIFICATIONS = "/settings?section=notifications";

/**
 * Photographie l'état de TOUS les outils pour un user/tenant, en une passe.
 * Chaque sonde est isolée (try/catch) : un outil illisible est considéré non
 * branché plutôt que de faire échouer la vérification entière (fail-open).
 */
export async function getCapabilityStatuses(opts: {
  supabase: SupabaseClient;
  tenantId: string;
  userId: string | null;
  /** Langue de l'interface : les libellés voyagent jusqu'à la pop-up. Défaut FR. */
  locale?: Locale;
}): Promise<Record<CapabilityId, CapabilityStatus>> {
  const { supabase, tenantId, userId, locale = "fr" } = opts;

  // Email sortant : Gmail connecté OU envoi Biltia (Resend) configuré.
  let emailConnected = false;
  try {
    emailConnected = (await canSendOutbound(tenantId, userId)).ok;
  } catch {
    /* indéterminé → non connecté */
  }

  // Agenda (lecture du planning) : Google Agenda OU Outlook Calendar connecté.
  let calendarConn = false;
  try {
    if (userId) calendarConn = await calendarConnected(tenantId, userId);
  } catch {
    /* indéterminé → non connecté */
  }

  // Notifications push : au moins un appareil abonné.
  let pushConnected = false;
  try {
    if (userId) {
      const { count } = await supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      pushConnected = (count ?? 0) > 0;
    }
  } catch {
    /* indéterminé → non connecté */
  }

  // SMS : dépend d'un fournisseur configuré au niveau plateforme (Twilio).
  // Pas de connexion par utilisateur — supporté = fournisseur présent.
  const smsSupported = canSendSms();

  return {
    email_send: {
      id: "email_send",
      label: pick(locale, "envoi d'emails", "sending emails"),
      supported: true,
      connected: emailConnected,
      // Gmail OU Outlook : nommer un seul fournisseur enverrait un artisan sous
      // Microsoft 365 ouvrir un compte chez le concurrent de sa messagerie.
      fix: { label: pick(locale, "Connecter votre messagerie", "Connect your mailbox"), href: HREF_CONNECTORS },
    },
    calendar_read: {
      id: "calendar_read",
      label: pick(locale, "agenda", "calendar"),
      supported: true,
      connected: calendarConn,
      fix: { label: pick(locale, "Connecter l'agenda", "Connect the calendar"), href: HREF_CONNECTORS },
    },
    push_notify: {
      id: "push_notify",
      label: pick(locale, "notifications", "notifications"),
      supported: true,
      connected: pushConnected,
      fix: { label: pick(locale, "Activer les notifications", "Turn on notifications"), href: HREF_NOTIFICATIONS },
    },
    sms_send: {
      id: "sms_send",
      label: pick(locale, "envoi de SMS", "sending texts"),
      // L'outil n'existe que si la plateforme a un fournisseur SMS branché.
      supported: smsSupported,
      connected: smsSupported,
    },
  };
}
