"use client";

import { useEffect } from "react";

// Enregistre le service worker en production uniquement (évite les conflits HMR en dev).
export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Échec silencieux : l'app fonctionne sans PWA.
      });
    };

    // ⚠️ Si l'événement `load` est DÉJÀ passé au montage (hydratation tardive,
    // navigation client), addEventListener("load") ne tirerait jamais → SW
    // jamais enregistré (et `serviceWorker.ready` pendrait indéfiniment).
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
