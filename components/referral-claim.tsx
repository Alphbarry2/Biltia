"use client";

import { useEffect } from "react";

// Réclame le parrainage une fois l'utilisateur connecté. Lit le code mémorisé au
// signup (localStorage `biltia_ref`), l'envoie à /api/referral/claim (idempotent),
// puis nettoie. Silencieux : aucune UI, aucun blocage si l'appel échoue. Monté
// dans le layout (app) → s'exécute au 1ᵉʳ chargement authentifié quelle que soit
// la page d'atterrissage (onboarding, dashboard…).
export function ReferralClaim() {
  useEffect(() => {
    let code = "";
    try {
      code = localStorage.getItem("biltia_ref") || "";
    } catch {
      /* localStorage indisponible */
    }
    if (!code) return;

    fetch("/api/referral/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then((res) => {
        // 'linked' | 'already' | 'self' | 'unknown' : dans tous les cas on ne
        // retentera pas (le lien est posé ou le code est invalide/à soi).
        if (res && res.ok) {
          try {
            localStorage.removeItem("biltia_ref");
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        /* réseau : on retentera au prochain chargement (code encore en storage) */
      });
  }, []);

  return null;
}
