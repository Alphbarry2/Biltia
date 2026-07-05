"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BiltiaLogo } from "@/components/brand";
import {
  motion, AnimatePresence, useInView, useReducedMotion,
  useMotionValue, useSpring,
} from "framer-motion";
import {
  Menu, X, ChevronDown, ChevronLeft, ChevronRight, ArrowRight,
  FileText, LayoutGrid, Zap, ScanLine, MessageCircle, FolderKanban, Bot,
} from "lucide-react";
import { PRODUCTS } from "@/lib/products";
import { TEMPLATE_PREVIEWS, type TemplatePreview } from "@/lib/template-previews";

export const EASE = [0.16, 1, 0.3, 1] as const;
export const BLACK = "bg-[#0A0A0A] text-white hover:bg-[#222] transition-colors";
export const GRAD = "bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PRODUCT_ICONS: Record<string, any> = { FileText, LayoutGrid, Zap, ScanLine, MessageCircle, FolderKanban, Bot };

// ── Primitives ───────────────────────────────────────────────────────────────

export function Reveal({ children, delay = 0, y = 22, className = "" }: {
  children: React.ReactNode; delay?: number; y?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-70px" });
  const reduce = useReducedMotion();
  return (
    <motion.div ref={ref} initial={reduce ? false : { opacity: 0, y }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.75, ease: EASE, delay }} className={className}>
      {children}
    </motion.div>
  );
}

export function Spot({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return <div ref={ref} onMouseMove={onMove} className={`spotlight ${className}`}>{children}</div>;
}

export function Magnetic({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 240, damping: 17 });
  const sy = useSpring(y, { stiffness: 240, damping: 17 });
  const reduce = useReducedMotion();
  const onMove = (e: React.MouseEvent) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * 0.3);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.3);
  };
  const reset = () => { x.set(0); y.set(0); };
  return (
    <motion.div ref={ref} onMouseMove={onMove} onMouseLeave={reset} style={{ x: sx, y: sy }} className={className}>
      {children}
    </motion.div>
  );
}

// Effet machine à écrire : écrit une phrase, l'efface, passe à la suivante, en boucle.
export function useTypewriter(phrases: string[], opts?: { type?: number; del?: number; pause?: number }) {
  const { type = 45, del = 22, pause = 1600 } = opts ?? {};
  const [text, setText] = useState("");
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { setText(phrases[0] ?? ""); return; }
    let p = 0, c = 0, deleting = false;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      const phrase = phrases[p] ?? "";
      if (!deleting) {
        c++;
        setText(phrase.slice(0, c));
        if (c >= phrase.length) { deleting = true; t = setTimeout(step, pause); return; }
        t = setTimeout(step, type);
      } else {
        c--;
        setText(phrase.slice(0, c));
        if (c <= 0) { deleting = false; p = (p + 1) % phrases.length; t = setTimeout(step, 350); return; }
        t = setTimeout(step, del);
      }
    };
    t = setTimeout(step, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);
  return text;
}

// ── Fond : mesh multicolore + grille interactive qui s'illumine au curseur ───

export function InteractiveMesh({ strong = false, grid = true }: { strong?: boolean; grid?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--gx", `${e.clientX - r.left}px`);
      el.style.setProperty("--gy", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, []);
  const o = strong ? 1 : 0.8;
  return (
    <div ref={ref} className="absolute inset-0 isolate overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[#FCFCFD]" />
      {/* Wash pastel multicolore (couleurs Biltia), volontairement doux pour laisser voir la grille */}
      <div className="absolute -top-[16%] -left-[8%] w-[62vw] h-[62vw] max-w-[820px] rounded-full blur-[120px] animate-drift-a" style={{ background: `radial-gradient(circle, rgba(99,102,241,${0.26 * o}), transparent 68%)` }} />
      <div className="absolute -top-[6%] right-[-10%] w-[56vw] h-[56vw] max-w-[740px] rounded-full blur-[130px] animate-drift-c" style={{ background: `radial-gradient(circle, rgba(168,85,247,${0.22 * o}), transparent 68%)` }} />
      <div className="absolute bottom-[-22%] left-[6%] w-[60vw] h-[60vw] max-w-[800px] rounded-full blur-[130px] animate-drift-b" style={{ background: `radial-gradient(circle, rgba(236,72,153,${0.22 * o}), transparent 68%)` }} />
      <div className="absolute bottom-[-16%] right-[2%] w-[50vw] h-[50vw] max-w-[660px] rounded-full blur-[130px] animate-drift-d" style={{ background: `radial-gradient(circle, rgba(251,146,60,${0.18 * o}), transparent 68%)` }} />
      {grid && (
        <>
          {/* Quadrillage très discret, teinté marque */}
          <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to right, rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,102,241,0.07) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
          {/* Le quadrillage s'illumine (doux) autour du curseur */}
          <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to right, rgba(109,74,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(236,72,153,0.38) 1px, transparent 1px)", backgroundSize: "40px 40px", WebkitMaskImage: "radial-gradient(circle 280px at var(--gx,-400px) var(--gy,-400px), #000 0%, rgba(0,0,0,0.35) 55%, transparent 80%)", maskImage: "radial-gradient(circle 280px at var(--gx,-400px) var(--gy,-400px), #000 0%, rgba(0,0,0,0.35) 55%, transparent 80%)" }} />
          {/* Halo coloré (léger) autour du curseur */}
          <div className="absolute inset-0" style={{ background: "radial-gradient(320px circle at var(--gx,-400px) var(--gy,-400px), rgba(139,92,246,0.1), rgba(236,72,153,0.06) 48%, transparent 76%)" }} />
        </>
      )}
    </div>
  );
}

// Mesh simple (overlays sans grille, ex. menu mobile).
export function Mesh() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[#FCFCFD]" />
      <div className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full blur-[110px]" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.5), transparent 66%)" }} />
      <div className="absolute bottom-[-24%] right-[-8%] w-[66vw] h-[66vw] rounded-full blur-[120px]" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.46), transparent 66%)" }} />
    </div>
  );
}

// ── Navigation partagée (dropdown Produits) ──────────────────────────────────

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  const openMenu = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setMenu(true); };
  const scheduleClose = () => { closeTimer.current = setTimeout(() => setMenu(false), 120); };

  return (
    <>
      <nav className="fixed top-0 inset-x-0 z-50 px-3 sm:px-5 pt-3 sm:pt-4">
        <div className={`max-w-6xl mx-auto h-[58px] px-3 sm:px-4 flex items-center justify-between rounded-2xl border transition-all duration-300 ${scrolled ? "bg-white/85 backdrop-blur-xl border-[#E7E7EF] shadow-[0_12px_44px_rgba(60,40,120,0.12)]" : "bg-white/70 backdrop-blur-md border-[#ECECF2] shadow-[0_6px_28px_rgba(60,40,120,0.07)]"}`}>
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(true)} aria-label="Menu"
              className="md:hidden w-9 h-9 rounded-[11px] bg-black/[0.05] hover:bg-black/[0.09] flex items-center justify-center transition-colors">
              <Menu className="w-[18px] h-[18px] text-[#0A0A0A]" />
            </button>
            <Link href="/" className="flex items-center gap-2.5">
              <BiltiaLogo className="h-[26px] w-auto text-[#0A0A0A]" />
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-1">
            <div className="relative" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
              <button className="flex items-center gap-1 px-3.5 py-2 rounded-lg text-[14px] text-[#5B5B66] hover:text-[#0A0A0A] hover:bg-black/[0.04] transition-colors font-medium">
                Produits <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menu ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {menu && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2, ease: EASE }}
                    className="absolute left-1/2 -translate-x-1/2 top-full pt-3">
                    <div className="glass rounded-[22px] p-2.5 w-[560px] grid grid-cols-2 gap-1.5 shadow-[0_30px_80px_rgba(60,40,120,0.18)]">
                      {PRODUCTS.map((p) => {
                        const Icon = PRODUCT_ICONS[p.icon];
                        return (
                          <Link key={p.slug} href={`/produits/${p.slug}`} onClick={() => setMenu(false)}
                            className="group flex items-start gap-3 rounded-2xl p-3 hover:bg-white/70 transition-colors">
                            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${p.accent[0]}, ${p.accent[1]})` }}>
                              <Icon className="w-[18px] h-[18px]" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[13.5px] font-semibold text-[#0A0A0A]">{p.name}</span>
                              <span className="block text-[12px] text-[#7A7A86] leading-snug">{p.tagline}</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Link href="/#demo" className="px-3.5 py-2 rounded-lg text-[14px] text-[#5B5B66] hover:text-[#0A0A0A] hover:bg-black/[0.04] transition-colors font-medium">En action</Link>
            <Link href="/blog" className="px-3.5 py-2 rounded-lg text-[14px] text-[#5B5B66] hover:text-[#0A0A0A] hover:bg-black/[0.04] transition-colors font-medium">Blog</Link>
            <Link href="/tarifs" className="px-3.5 py-2 rounded-lg text-[14px] text-[#5B5B66] hover:text-[#0A0A0A] hover:bg-black/[0.04] transition-colors font-medium">Tarifs</Link>
          </div>

          <div className="flex items-center gap-2">
            <a href="/login" className="hidden sm:inline-flex px-4 py-2 text-[14px] text-[#5B5B66] hover:text-[#0A0A0A] font-medium transition-colors">Se connecter</a>
            <Magnetic>
              <a href="/signup" className={`${BLACK} text-[14px] font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-1.5`}>Commencer</a>
            </Magnetic>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] md:hidden bg-white/90 backdrop-blur-xl overflow-y-auto">
            <Mesh />
            <button onClick={() => setOpen(false)} aria-label="Fermer" className="absolute top-5 right-5 w-9 h-9 rounded-[11px] bg-black/[0.05] flex items-center justify-center z-10"><X className="w-[18px] h-[18px]" /></button>
            <div className="min-h-[100dvh] flex flex-col justify-center px-6 py-20 gap-6">
              <p className="text-[12px] font-bold uppercase tracking-wider text-[#9A9AA6]">Produits</p>
              <div className="grid gap-2">
                {PRODUCTS.map((p) => {
                  const Icon = PRODUCT_ICONS[p.icon];
                  return (
                    <Link key={p.slug} href={`/produits/${p.slug}`} onClick={() => setOpen(false)} className="glass flex items-center gap-3 rounded-2xl p-3">
                      <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${p.accent[0]}, ${p.accent[1]})` }}><Icon className="w-[18px] h-[18px]" /></span>
                      <span className="text-[14px] font-semibold text-[#0A0A0A]">{p.name}</span>
                    </Link>
                  );
                })}
              </div>
              <div className="flex items-center gap-5 pt-2 text-[16px] font-semibold text-[#0A0A0A]">
                <Link href="/#demo" onClick={() => setOpen(false)}>En action</Link>
                <Link href="/blog" onClick={() => setOpen(false)}>Blog</Link>
                <Link href="/tarifs" onClick={() => setOpen(false)}>Tarifs</Link>
                <Link href="/login" onClick={() => setOpen(false)}>Se connecter</Link>
              </div>
              <a href="/signup" className={`${BLACK} font-semibold px-8 py-3.5 rounded-full text-[15px] text-center`}>Commencer</a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Galerie de modèles (aperçu live via iframe /t/[id]) ──────────────────────

function TemplateCard({ t, onActivate, ctaLabel }: { t: TemplatePreview; onActivate: (t: TemplatePreview) => void; ctaLabel: string }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onActivate(t)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onActivate(t); }}
      className="group cursor-pointer rounded-[22px] overflow-hidden border border-[#EBEBF1] bg-white shadow-[0_12px_44px_rgba(60,40,120,0.07)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_28px_70px_rgba(60,40,120,0.16)]"
    >
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#F1F1F5] bg-[#FBFBFD]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-2 flex items-center gap-1.5 text-[10.5px] font-medium text-[#9A9AA6]">
          <span className="w-1.5 h-1.5 rounded-full animate-glow-pulse" style={{ background: t.accent }} />
          Aperçu live
        </span>
      </div>
      <div className="relative h-[230px] overflow-hidden" style={{ background: "#F7F5EF" }}>
        <iframe
          src={`/t/${t.id}`}
          title={t.name}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          className="absolute top-0 left-0 border-0 pointer-events-none select-none origin-top-left"
          style={{ width: "1280px", height: "900px", transform: hover ? "scale(0.315)" : "scale(0.30)", transition: "transform 600ms cubic-bezier(0.16,1,0.3,1)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/[0.04] to-transparent pointer-events-none" />
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <h3 className="text-[16px] font-bold text-[#0A0A0A] tracking-[-0.01em] truncate">{t.name}</h3>
          <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: t.accent, background: `${t.accent}14`, border: `1px solid ${t.accent}2e` }}>{t.category}</span>
        </div>
        <p className="text-[13px] text-[#5B5B66] leading-relaxed mb-4">{t.tagline}</p>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold group-hover:gap-2.5 transition-all" style={{ color: t.accent }}>
          {ctaLabel} <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
}

// Modale d'aperçu plein cadre (template interactif) + CTA.
function TemplatePreviewModal({ t, onClose, onUse }: { t: TemplatePreview; onClose: () => void; onUse: (t: TemplatePreview) => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#0A0A0F]/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl h-[88vh] bg-white rounded-[24px] overflow-hidden shadow-[0_50px_130px_rgba(20,20,50,0.45)] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-[#ECECF2] flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.accent }} />
            <h3 className="font-bold text-[#0A0A0A] tracking-[-0.01em] truncate">{t.name}</h3>
            <span className="hidden sm:inline flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: t.accent, background: `${t.accent}14`, border: `1px solid ${t.accent}2e` }}>{t.category}</span>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full hover:bg-black/[0.05] flex items-center justify-center text-[#6E6E7A] flex-shrink-0"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="relative flex-1 bg-[#FBFBFD] min-h-0">
          <iframe src={`/t/${t.id}`} title={t.name} sandbox="allow-scripts allow-same-origin" className="absolute inset-0 w-full h-full border-0" />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[#ECECF2] flex-shrink-0">
          <p className="hidden sm:block text-[13px] text-[#5B5B66] truncate">{t.tagline}</p>
          <button onClick={() => onUse(t)} className="ml-auto inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white font-semibold px-6 py-3 rounded-full shadow-[0_12px_32px_rgba(124,58,190,0.35)] hover:brightness-105 active:scale-[0.98] transition">
            Utiliser ce template <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Grille (utilisée dans l'app connectée).
export function TemplateGallery({
  onUse,
  className = "",
  preview = false,
  query = "",
}: {
  onUse: (t: TemplatePreview) => void;
  className?: string;
  preview?: boolean;
  query?: string;
}) {
  const [open, setOpen] = useState<TemplatePreview | null>(null);
  const activate = preview ? setOpen : onUse;
  const ctaLabel = preview ? "Voir le template" : "Utiliser ce modèle";
  const q = query.trim().toLowerCase();
  const list = q
    ? TEMPLATE_PREVIEWS.filter((t) => `${t.name} ${t.category} ${t.tagline}`.toLowerCase().includes(q))
    : TEMPLATE_PREVIEWS;
  return (
    <>
      {list.length === 0 ? (
        <p className="text-[13px] text-[#6E6E6C] py-10 text-center">Aucun modèle ne correspond à votre recherche.</p>
      ) : (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 ${className}`}>
          {list.map((t, k) => (
            <Reveal key={t.id} delay={(k % 3) * 0.05}>
              <TemplateCard t={t} onActivate={activate} ctaLabel={ctaLabel} />
            </Reveal>
          ))}
        </div>
      )}
      {open && <TemplatePreviewModal t={open} onClose={() => setOpen(null)} onUse={onUse} />}
    </>
  );
}

// Carrousel coverflow (landing) : le modèle central s'affiche en grand, les
// autres plus petits sur les côtés ; flèches + défilement auto lent.
export function TemplateCarousel({ onUse }: { onUse: (t: TemplatePreview) => void }) {
  const items = TEMPLATE_PREVIEWS;
  const n = items.length;
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<TemplatePreview | null>(null);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const [w, setW] = useState(1100);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (paused || open || reduce) return;
    const id = setInterval(() => setActive((a) => (a + 1) % n), 3600);
    return () => clearInterval(id);
  }, [paused, open, reduce, n]);

  const isNarrow = w < 640;
  // Carte quasi pleine largeur sur mobile, grande et centrée sur desktop.
  const slideW = Math.round(Math.min(Math.max(w * (isNarrow ? 0.88 : 0.62), 240), 940));
  const previewH = Math.round(slideW * (isNarrow ? 1.12 : 0.74));
  const cardH = previewH + 128;
  const arrowTop = 46 + previewH / 2;
  const go = (d: number) => setActive((a) => (a + d + n) % n);
  const accent = items[active].accent;
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 44) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  return (
    <div
      className="relative select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Halo coloré derrière la carte centrale (contraste avec le fond clair) */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[48px] blur-[90px] transition-colors duration-700"
        style={{ top: 24, width: slideW * 0.92, height: cardH - 48, background: accent, opacity: 0.22, zIndex: 0 }}
      />
      <div ref={wrapRef} className="relative z-[1] mx-auto overflow-hidden" style={{ height: cardH }}>
        {items.map((t, i) => {
          let d = i - active;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          const ad = Math.abs(d);
          const isActive = ad === 0;
          const sc = isActive ? 1 : ad === 1 ? 0.66 : 0.5;
          const tx = d * slideW * 0.82;
          const opacity = isActive ? 1 : ad === 1 ? 0.42 : ad === 2 ? 0.16 : 0;
          const blurPx = isActive ? 0 : ad === 1 ? 2 : 4;
          return (
            <div
              key={t.id}
              onClick={() => (isActive ? setOpen(t) : ad <= 1 ? setActive(i) : undefined)}
              aria-hidden={!isActive}
              className="absolute top-0 left-1/2 cursor-pointer transition-all duration-[650ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: slideW,
                transform: `translateX(-50%) translateX(${tx}px) scale(${sc})`,
                opacity,
                filter: isActive ? "none" : `blur(${blurPx}px)`,
                zIndex: 10 - ad,
                pointerEvents: ad <= 1 ? "auto" : "none",
              }}
            >
              <div
                className="rounded-[22px] overflow-hidden border bg-white transition-shadow duration-500"
                style={{ borderColor: isActive ? "#E2E2EA" : "#EBEBF1", boxShadow: isActive ? `0 42px 90px -20px ${t.accent}55, 0 26px 70px rgba(24,16,54,0.26)` : "0 14px 38px rgba(60,40,120,0.09)" }}
              >
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#F1F1F5] bg-[#FBFBFD]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                  <span className="ml-2 flex items-center gap-1.5 text-[10.5px] font-medium text-[#9A9AA6]">
                    <span className="w-1.5 h-1.5 rounded-full animate-glow-pulse" style={{ background: t.accent }} />
                    Aperçu live
                  </span>
                </div>
                <div className="relative overflow-hidden" style={{ height: previewH, background: "#FBFBFD" }}>
                  <iframe
                    src={`/t/${t.id}`}
                    title={t.name}
                    loading="lazy"
                    sandbox="allow-scripts allow-same-origin"
                    className="absolute top-0 left-0 border-0 pointer-events-none select-none"
                    style={{ width: slideW, height: 1400 }}
                  />
                </div>
                <div className="p-5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[16px] font-bold text-[#0A0A0A] tracking-[-0.01em] truncate">{t.name}</h3>
                      <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: t.accent, background: `${t.accent}14`, border: `1px solid ${t.accent}2e` }}>{t.category}</span>
                    </div>
                    <p className="text-[12.5px] text-[#5B5B66] mt-1 truncate">{t.tagline}</p>
                  </div>
                  {isActive && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onUse(t); }}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white text-[13px] font-semibold px-4 py-2.5 rounded-full shadow-[0_10px_26px_rgba(124,58,190,0.32)] hover:brightness-105 active:scale-[0.98] transition"
                    >
                      Utiliser <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => go(-1)} aria-label="Modèle précédent" className="absolute left-3 sm:left-10 z-20 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-[#ECECF2] shadow-[0_10px_28px_rgba(20,20,50,0.14)] flex items-center justify-center text-[#0A0A0A] hover:scale-105 active:scale-95 transition" style={{ top: arrowTop }}>
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button onClick={() => go(1)} aria-label="Modèle suivant" className="absolute right-3 sm:right-10 z-20 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-[#ECECF2] shadow-[0_10px_28px_rgba(20,20,50,0.14)] flex items-center justify-center text-[#0A0A0A] hover:scale-105 active:scale-95 transition" style={{ top: arrowTop }}>
        <ChevronRight className="w-5 h-5" />
      </button>

      <div className="flex items-center justify-center gap-2 mt-8">
        {items.map((t, i) => (
          <button key={t.id} onClick={() => setActive(i)} aria-label={t.name} className="h-2 rounded-full transition-all duration-300" style={{ width: i === active ? 26 : 8, background: i === active ? t.accent : "#D4D4DE" }} />
        ))}
      </div>

      {open && <TemplatePreviewModal t={open} onClose={() => setOpen(null)} onUse={onUse} />}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[#EDEDEB] py-12 px-5 sm:px-8 bg-[#FCFCFD]">
      <div className="max-w-6xl mx-auto grid sm:grid-cols-[1.2fr_1fr_1fr] gap-8 mb-10">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <BiltiaLogo className="h-6 w-auto text-[#0A0A0A]" />
          </div>
          <p className="text-[13px] text-[#7A7A86] max-w-[240px] leading-relaxed">L&apos;OS conversationnel du BTP. Dictez votre problème, repartez avec la solution.</p>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-[#9A9AA6] mb-3">Produits</p>
          <ul className="space-y-2">
            {PRODUCTS.slice(0, 5).map((p) => (
              <li key={p.slug}><Link href={`/produits/${p.slug}`} className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">{p.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-[#9A9AA6] mb-3">Entreprise</p>
          <ul className="space-y-2">
            <li><Link href="/blog" className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">Blog</Link></li>
            <li><Link href="/tarifs" className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">Tarifs</Link></li>
            <li><Link href="/#demo" className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">En action</Link></li>
            <li><a href="#" className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">Contact</a></li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-[#EDEDEB]">
        <span className="text-[13px] text-[#B0B0B8]">© 2026 Biltia</span>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {[["Mentions légales", "/mentions-legales"], ["CGU", "/cgu"], ["CGV", "/cgv"], ["Confidentialité", "/confidentialite"]].map(([l, href]) => (<a key={l} href={href} className="text-[13px] text-[#9A9AA6] hover:text-[#0A0A0A] transition-colors">{l}</a>))}
        </div>
      </div>
    </footer>
  );
}
