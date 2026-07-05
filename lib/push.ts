// ─────────────────────────────────────────────────────────────────────────────
// WEB PUSH — envoi de notifications push (PWA). STRICTEMENT CÔTÉ SERVEUR.
//
// Clés VAPID dans l'env (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
// VAPID_SUBJECT). Les abonnements vivent dans `push_subscriptions` (RLS :
// l'utilisateur gère les siens) ; la LECTURE pour envoi passe par service_role.
//
// Best-effort absolu : ne throw jamais — une notification qui échoue ne doit
// jamais casser la fonctionnalité qui l'a déclenchée. Les abonnements morts
// (404/410 : appareil désabonné) sont purgés au fil de l'eau.
// ─────────────────────────────────────────────────────────────────────────────

import webpush from "web-push";
import { createAdminClient } from "./supabase-admin";

export type PushPayload = {
  title: string;
  body: string;
  /** Chemin ouvert au clic (défaut /dashboard). */
  url?: string;
  /** Regroupe les notifications de même nature (remplace au lieu d'empiler). */
  tag?: string;
};

function vapidConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const priv = process.env.VAPID_PRIVATE_KEY ?? "";
  return pub.length > 20 && priv.length > 20;
}

let vapidReady = false;
function ensureVapid(): boolean {
  if (!vapidConfigured()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:contact@biltia.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    vapidReady = true;
  }
  return true;
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Envoie une notification push à TOUS les appareils abonnés d'un utilisateur.
 * Retourne le nombre d'envois réussis (0 si non configuré / aucun abonnement).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  try {
    if (!ensureVapid()) return 0;
    const admin = createAdminClient();
    if (!admin) return 0;

    const { data } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);

    const subs = (data ?? []) as SubRow[];
    if (!subs.length) return 0;

    const body = JSON.stringify(payload);
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body
          );
          sent++;
        } catch (err) {
          // 404/410 : l'appareil s'est désabonné → on purge la ligne.
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
          }
        }
      })
    );
    return sent;
  } catch (err) {
    console.error("sendPushToUser failed:", err);
    return 0;
  }
}
