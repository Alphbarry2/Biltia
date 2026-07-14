"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EFFETS VISUELS SANS DÉPENDANCE LOURDE.
//
// ⚠️ POURQUOI CE FICHIER EXISTE : `components/site.tsx` importe framer-motion (42 kB),
// tout le catalogue produits (`lib/products`, 16,7 kB), les aperçus de modèles, la
// réservation de démo et le sélecteur de langue. Un import ES tire le MODULE ENTIER :
// il suffisait donc qu'une page de l'application demande `useTypewriter` — trois
// lignes de logique — pour embarquer tout ce graphe dans son bundle.
//
// C'était le cas de /generate, /dashboard, de l'écran de connexion et de l'onboarding.
//
// Ce fichier ne contient QUE ce dont l'application a besoin, et n'importe QUE React.
// `site.tsx` le ré-exporte pour la landing : rien ne change côté vitrine.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";

/** Courbe d'accélération de la marque (identique partout). */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Vrai si l'utilisateur a demandé des animations réduites (réglage système). */
function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

/** Texte qui s'écrit tout seul. Portage EXACT de site.tsx, sans framer-motion :
 *  seul `useReducedMotion` en venait, et matchMedia fait la même chose. */
export function useTypewriter(
  phrases: string[],
  opts?: { type?: number; del?: number; pause?: number }
) {
  const { type = 45, del = 22, pause = 1600 } = opts ?? {};
  const [text, setText] = useState("");
  const reduce = usePrefersReducedMotion();
  useEffect(() => {
    if (reduce) {
      setText(phrases[0] ?? "");
      return;
    }
    let p = 0,
      c = 0,
      deleting = false;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      const phrase = phrases[p] ?? "";
      if (!deleting) {
        c++;
        setText(phrase.slice(0, c));
        if (c >= phrase.length) {
          deleting = true;
          t = setTimeout(step, pause);
          return;
        }
        t = setTimeout(step, type);
      } else {
        c--;
        setText(phrase.slice(0, c));
        if (c <= 0) {
          deleting = false;
          p = (p + 1) % phrases.length;
          t = setTimeout(step, 350);
          return;
        }
        t = setTimeout(step, del);
      }
    };
    t = setTimeout(step, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);
  return text;
}

// ── Fond maillé : mesh multicolore + grille qui s'illumine au curseur ────────
//
// 100 % CSS (aucun canvas, aucun framer-motion). Deux gardes de performance, et
// elles comptent : les deux calques du bas suivent --gx/--gy, et chaque écriture
// de ces variables REPEINT DEUX SURFACES PLEIN ÉCRAN.
//
//   1. `pointermove` peut tirer jusqu'à 1 000 fois par seconde sur une souris à
//      haute fréquence. Sans throttle par frame, on demandait au navigateur mille
//      repaints plein écran par seconde. Le processeur restait libre — le
//      COMPOSITEUR saturait. C'était ça, la sensation que « cliquer est lourd ».
//   2. Sur un écran tactile il n'y a PAS de curseur : le halo ne peut rien suivre.
//      On ne monte donc ni le listener ni les deux calques. Idem si l'utilisateur
//      a demandé des animations réduites.
export function InteractiveMesh({ strong = false, grid = true }: { strong?: boolean; grid?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [track, setTrack] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !grid) return;

    if (typeof window.matchMedia === "function") {
      if (window.matchMedia("(pointer: coarse)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    }
    setTrack(true);

    let raf = 0;
    let x = 0;
    let y = 0;
    const flush = () => {
      raf = 0;
      el.style.setProperty("--gx", `${x}px`);
      el.style.setProperty("--gy", `${y}px`);
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, [grid]);

  const o = strong ? 1 : 0.8;
  return (
    // `contain: paint` : le navigateur sait que rien ne déborde de ce fond, il n'a
    // donc pas à recalculer la peinture du RESTE de la page quand le halo bouge.
    <div
      ref={ref}
      className="absolute inset-0 isolate overflow-hidden pointer-events-none"
      style={{ contain: "paint" }}
    >
      <div className="absolute inset-0 bg-[#FCFCFD]" />
      {/* Wash pastel multicolore (couleurs Biltia), volontairement doux pour laisser voir la grille */}
      <div className="mesh-blob absolute -top-[16%] -left-[8%] w-[62vw] h-[62vw] max-w-[820px] rounded-full blur-[120px] animate-drift-a" style={{ background: `radial-gradient(circle, rgba(99,102,241,${0.26 * o}), transparent 68%)` }} />
      <div className="mesh-blob absolute -top-[6%] right-[-10%] w-[56vw] h-[56vw] max-w-[740px] rounded-full blur-[130px] animate-drift-c" style={{ background: `radial-gradient(circle, rgba(168,85,247,${0.22 * o}), transparent 68%)` }} />
      <div className="mesh-blob absolute bottom-[-22%] left-[6%] w-[60vw] h-[60vw] max-w-[800px] rounded-full blur-[130px] animate-drift-b" style={{ background: `radial-gradient(circle, rgba(236,72,153,${0.22 * o}), transparent 68%)` }} />
      <div className="mesh-blob absolute bottom-[-16%] right-[2%] w-[50vw] h-[50vw] max-w-[660px] rounded-full blur-[130px] animate-drift-d" style={{ background: `radial-gradient(circle, rgba(251,146,60,${0.18 * o}), transparent 68%)` }} />
      {grid && (
        <>
          {/* Quadrillage très discret, teinté marque. STATIQUE : il ne suit pas le
              curseur, il ne repeint donc jamais. On le garde toujours. */}
          <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to right, rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,102,241,0.07) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
          {track && (
            <>
              {/* Le quadrillage s'illumine (doux) autour du curseur */}
              <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to right, rgba(109,74,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(236,72,153,0.38) 1px, transparent 1px)", backgroundSize: "40px 40px", WebkitMaskImage: "radial-gradient(circle 280px at var(--gx,-400px) var(--gy,-400px), #000 0%, rgba(0,0,0,0.35) 55%, transparent 80%)", maskImage: "radial-gradient(circle 280px at var(--gx,-400px) var(--gy,-400px), #000 0%, rgba(0,0,0,0.35) 55%, transparent 80%)" }} />
              {/* Halo coloré (léger) autour du curseur */}
              <div className="absolute inset-0" style={{ background: "radial-gradient(320px circle at var(--gx,-400px) var(--gy,-400px), rgba(139,92,246,0.1), rgba(236,72,153,0.06) 48%, transparent 76%)" }} />
            </>
          )}
        </>
      )}
    </div>
  );
}
