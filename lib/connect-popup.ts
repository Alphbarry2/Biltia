// ─────────────────────────────────────────────────────────────────────────────
// CONNEXION EN POP-UP — lance le flux OAuth d'un connecteur SANS quitter la page
// (chat du copilote, activation d'un agent). Le callback renvoie une page qui
// postMessage à cette fenêtre ; on résout la promesse quand le message arrive,
// ou on considère « annulé » si l'utilisateur ferme la pop-up.
//
// Strictement côté navigateur (utilise window). Aucun secret : l'URL d'autorisation
// est fabriquée par /api/connections (serveur).
// ─────────────────────────────────────────────────────────────────────────────

export type ConnectResult = {
  ok: boolean;
  provider?: string;
  error?: string;
  /** true si l'utilisateur a fermé la fenêtre sans finir (pas une erreur à afficher). */
  canceled?: boolean;
};

export async function connectViaPopup(connectorId: string): Promise<ConnectResult> {
  // 1. Demander l'URL d'autorisation (le serveur mémorise l'état + le mode popup).
  let url: string;
  try {
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", connectorId, mode: "popup" }),
    });
    const json = await res.json();
    if (!res.ok || !json.url) return { ok: false, error: json.error ?? "Connexion impossible." };
    url = json.url as string;
  } catch {
    return { ok: false, error: "Connexion impossible pour le moment. Réessayez." };
  }

  // 2. Ouvrir la pop-up centrée.
  const w = 520;
  const h = 640;
  const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
  const popup = window.open(url, "biltia-oauth", `width=${w},height=${h},left=${left},top=${top}`);
  if (!popup) {
    return {
      ok: false,
      error: "Le navigateur a bloqué la fenêtre de connexion. Autorisez les pop-ups puis réessayez.",
    };
  }

  // 3. Attendre le retour (message du callback) ou la fermeture manuelle.
  return await new Promise<ConnectResult>((resolve) => {
    let settled = false;
    const finish = (r: ConnectResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
      resolve(r);
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { source?: string; ok?: boolean; provider?: string; error?: string } | null;
      if (!d || d.source !== "biltia-oauth") return;
      try {
        popup.close();
      } catch {
        // déjà fermée
      }
      finish({ ok: !!d.ok, provider: d.provider, error: d.error });
    };
    window.addEventListener("message", onMessage);

    // Filet : si la fenêtre est fermée sans message → annulation.
    const timer = setInterval(() => {
      if (popup.closed) finish({ ok: false, canceled: true });
    }, 500);
  });
}
