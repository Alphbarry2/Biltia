// ─────────────────────────────────────────────────────────────────────────────
// PONT APP ↔ SERVEUR — l'unique répondeur de window.biltia.
//
// Une app générée ne fait JAMAIS fetch elle-même (elle tourne dans une iframe
// srcdoc, origine opaque). Elle poste BILTIA_API_CALL à window.parent et attend
// BILTIA_API_RESPONSE. La page HÔTE proxifie l'appel en same-origin : les cookies
// authentifient, la RLS isole le tenant.
//
// Ce fichier est le SEUL endroit où cette logique vit. Elle était copiée dans le
// générateur et dans la visionneuse ; toute troisième copie ferait diverger la
// garde de provenance ci-dessous, qui est ce qui empêche un site tiers de piloter
// l'API au nom de l'utilisateur. Une page qui veut héberger une app importe ceci.
//
// Corollaire (cf. lib/app-connectivity.ts) : une surface qui ne branche PAS ce
// pont ne doit pas servir une app porteuse du SDK — elle gèlerait 30 s par écran.
// ─────────────────────────────────────────────────────────────────────────────

/** Traduit une erreur en langue de l'utilisateur (la page hôte connaît sa locale). */
export type BridgeLabels = {
  httpError: (status: number) => string;
  network: string;
};

/** Route un appel du SDK vers l'endpoint serveur correspondant. */
function endpointFor(body: unknown): string {
  const ep = (body as { __endpoint?: string } | null)?.__endpoint;
  switch (ep) {
    case "app-ai":
      return "/api/app-ai";
    case "email":
      return "/api/app-email";
    case "document":
      return "/api/app-document";
    case "sms":
      return "/api/app-sms";
    case "calendar":
      return "/api/app-calendar";
    case "agents":
      return "/api/app-agents";
    case "telemetry":
      return "/api/app-telemetry";
    default:
      return "/api/data";
  }
}

export function createBridgeHandler(opts: {
  /** L'app hébergée : filtre les lectures, rattache les agents, attribue l'usage. */
  moduleId: string;
  /** Rend la fenêtre de l'iframe SI le message vient bien d'elle, sinon null. */
  resolveFrame: (source: Window | null) => Window | null;
  labels: BridgeLabels;
  /**
   * Une action a échoué faute de connecteur (agenda, etc.) : le serveur renvoie
   * `connectors: string[]`. Le host affiche la carte de connexion PAR-DESSUS
   * l'app — mais on répond quand même l'erreur à l'iframe tout de suite (le SDK
   * a un timeout de 30 s, largement trop court pour un aller-retour OAuth : pas
   * de retry automatique). L'app affiche son toast d'erreur habituel ; une fois
   * connecté, le PROCHAIN clic sur l'action aboutit pour de vrai.
   */
  onNeedsConnect?: (connectors: string[]) => void;
}): (event: MessageEvent) => void {
  const { moduleId, resolveFrame, labels, onNeedsConnect } = opts;

  return (event: MessageEvent) => {
    // GARDE DE PROVENANCE — ne PAS retirer. Ce pont proxifie /api/* AVEC les
    // cookies de session : n'accepter que les messages émis par notre propre
    // iframe. Sans ce contrôle, tout site tiers capable de nous poster un message
    // pilotait l'API au nom de l'utilisateur connecté.
    const frame = resolveFrame(event.source as Window | null);
    if (!frame) return;
    if (event.data?.type !== "BILTIA_API_CALL") return;

    const { id: callId, body } = event.data as { id: string; body: unknown };

    // Cible explicite (jamais '*') : on répond à l'iframe vérifiée ci-dessus.
    const reply = (payload: Record<string, unknown>) => {
      frame.postMessage({ type: "BILTIA_API_RESPONSE", id: callId, ...payload }, window.location.origin);
    };

    const ep = (body as { __endpoint?: string } | null)?.__endpoint;
    // /api/data, /api/app-agents et /api/app-telemetry ont besoin de l'id du
    // module : filtrer la LECTURE (data), rattacher/lister les agents (agents),
    // attribuer les événements d'usage à CETTE app (telemetry).
    const outBody =
      (!ep || ep === "agents" || ep === "telemetry") && body && typeof body === "object"
        ? { ...(body as Record<string, unknown>), moduleId }
        : body;

    fetch(endpointFor(body), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(outBody),
    })
      .then(async (res) => {
        const result = await res.json().catch(() => null);
        if (!res.ok) {
          const connectors = Array.isArray((result as { connectors?: unknown })?.connectors)
            ? (result as { connectors: unknown[] }).connectors.filter(
                (c): c is string => typeof c === "string" && c.length > 0
              )
            : [];
          if (connectors.length > 0) onNeedsConnect?.(connectors);
          reply({ error: result?.error ?? labels.httpError(res.status) });
          return;
        }
        reply({ result });
      })
      .catch((err: unknown) =>
        reply({ error: err instanceof Error ? err.message : labels.network })
      );
  };
}
