"use client";

/**
 * Comportements « natifs » d'une app installée (PWA), invisibles :
 *   1. Le clavier se ferme quand on tape à côté d'un champ (comme une vraie app).
 *   2. Glisser depuis le BORD GAUCHE ramène à l'écran précédent (swipe-back iOS/Android).
 *
 * Zéro rendu (retourne null). Monté une fois dans le layout ; se nettoie tout seul.
 * Une zone qui gère son propre geste horizontal peut s'exclure du swipe-back avec
 * l'attribut `data-no-swipe-back` sur un conteneur parent.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const FIELD_SELECTOR = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
const KEEP_FOCUS_SELECTOR =
  "input, textarea, select, [contenteditable=''], [contenteditable='true'], label, button, [role='button'], a, [role='menuitem'], [role='option']";

export default function NativeShell() {
  const router = useRouter();

  // 1) Clavier qui se ferme quand on tape dans le vide.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      const tag = active.tagName;
      const isField =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active.isContentEditable;
      if (!isField) return;
      const target = e.target as HTMLElement | null;
      // Tap sur un autre champ / label / bouton / lien → on laisse faire (ils
      // gèrent le focus eux-mêmes ; blur ici ferait « rater » le tap au moment où
      // le clavier se rétracte et déplace la cible).
      if (target && target.closest(KEEP_FOCUS_SELECTOR)) return;
      // Tap sur du vide → on ferme le clavier.
      active.blur();
    };
    // Capture : on veut décider AVANT que d'éventuels handlers ne stoppent l'event.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  // 2) Swipe-back depuis le bord gauche.
  useEffect(() => {
    const EDGE = 30; // zone de départ depuis le bord gauche (px)
    const THRESHOLD = 72; // distance horizontale mini pour déclencher (px)
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      if (t.clientX > EDGE) {
        tracking = false;
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el && el.closest("[data-no-swipe-back]")) {
        tracking = false;
        return;
      }
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      tracking = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      // Devient vertical → c'est un scroll, on abandonne.
      if (Math.abs(t.clientY - startY) > Math.abs(t.clientX - startX)) tracking = false;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (dx > THRESHOLD && Math.abs(dy) < 64 && Date.now() - startT < 600) {
        router.back();
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, [router]);

  return null;
}
