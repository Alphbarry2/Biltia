"use client";

// ─────────────────────────────────────────────────────────────────────────────
// APP EN PLEIN ÉCRAN — la porte d'entrée de l'employé.
//
// Même app, mêmes données, mais SANS le châssis Biltia : pas de barre latérale,
// pas de Bibliothèque à traverser. Installée en PWA (cf. le manifeste par app),
// elle devient une icône sur l'écran d'accueil : le gars sur le toit tape sur
// « Pointage » et il y est.
//
// Ce que cette page apporte, et qui n'existe nulle part ailleurs :
//   • elle BRANCHE le pont (lib/app-bridge) → l'app voit vraiment les données ;
//   • elle PROLONGE la session côté serveur (/api/auth/keepalive) → sur iPhone,
//     les cookies cessent d'être plafonnés à 7 jours et l'employé reste connecté.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { createBridgeHandler } from "@/lib/app-bridge";
import { useT } from "@/lib/i18n/context";

export function StandaloneApp({ moduleId, html }: { moduleId: string; html: string }) {
  const t = useT();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Pont : sans lui, l'app poste dans le vide et gèle 30 s par écran.
  useEffect(() => {
    const handler = createBridgeHandler({
      moduleId,
      resolveFrame: (source) =>
        source && source === iframeRef.current?.contentWindow ? source : null,
      labels: {
        httpError: (status) => t(`Erreur ${status}`, `Error ${status}`),
        network: t("Réseau indisponible", "Network unavailable"),
      },
    });
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  // Session : à chaque ouverture (et à chaque retour au premier plan), on demande
  // au SERVEUR de reposer les cookies. C'est ce qui évite la déconnexion au bout
  // d'une semaine sur iOS. Best-effort : un échec ne doit jamais bloquer l'app.
  useEffect(() => {
    let last = 0;
    const keepAlive = () => {
      const now = Date.now();
      if (now - last < 300_000) return; // au plus une fois toutes les 5 min
      last = now;
      fetch("/api/auth/keepalive", { method: "POST", credentials: "same-origin" }).catch(() => {});
    };
    keepAlive();
    const onVisible = () => {
      if (document.visibilityState === "visible") keepAlive();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      // ⚠️ `allow-same-origin` est OBLIGATOIRE, et pas par confort : sans lui,
      // l'iframe a une origine opaque et notre réponse `postMessage` — ciblée sur
      // notre origine, jamais '*' — ne lui serait JAMAIS remise. L'app gèlerait
      // 30 s par écran. Mêmes attributs que la visionneuse, à dessein.
      // `allow` : biltia.extract (photo) et biltia.transcribe (dictée) en ont besoin.
      sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
      allow="camera; microphone; geolocation; clipboard-write"
      // dvh et non vh : sur mobile, la barre d'URL rétractable fausse vh et
      // coupe le bas de l'app.
      className="w-full h-[100dvh] border-0 block"
      title="app"
    />
  );
}
