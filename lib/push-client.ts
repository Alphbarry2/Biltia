// ─────────────────────────────────────────────────────────────────────────────
// Web Push côté client — activation best-effort (onboarding, réglages).
// Ne lève jamais : renvoie true si l'abonnement est en place.
// ─────────────────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Demande la permission de notifier puis abonne CET appareil au push.
 * À appeler depuis un geste utilisateur (clic) pour que la demande s'affiche.
 */
export async function enablePushNotifications(): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    if (!reg) return false;

    const existing = await reg.pushManager.getSubscription();
    if (existing) return true;

    const cfg = await fetch("/api/push").then((r) => r.json()).catch(() => null);
    if (!cfg?.enabled || !cfg.publicKey) return false;

    const sub = await Promise.race([
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.publicKey).buffer as ArrayBuffer,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
    ]);

    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
    return res.ok;
  } catch {
    return false;
  }
}
