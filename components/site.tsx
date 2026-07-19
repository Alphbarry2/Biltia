"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BiltiaLogo } from "@/components/brand";
import {
  motion, AnimatePresence, useInView, useReducedMotion,
  useMotionValue, useSpring,
} from "framer-motion";
import {
  Menu, X, ChevronLeft, ChevronRight, ArrowRight,
  FileText, LayoutGrid, Zap, ScanLine, MessageCircle, FolderKanban, Bot,
  Monitor, Tablet, Smartphone,
} from "lucide-react";
import { PRODUCTS, localizeProduct } from "@/lib/products";
import { BRAND } from "@/lib/brand-entity";
import { TEMPLATE_PREVIEWS, localizeTemplatePreview, type TemplatePreview } from "@/lib/template-previews";
import { ReserveDemoButton } from "@/components/demo-booking";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT, useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";

// EASE, useTypewriter et InteractiveMesh vivent désormais dans site-fx.tsx (ZÉRO
// dépendance lourde). Un import ES tire le module ENTIER : les pages de l'app qui
// demandaient juste `useTypewriter` embarquaient tout CE fichier — framer-motion,
// le catalogue produits, la réservation de démo. On les réexporte pour la landing.
export { EASE, useTypewriter, InteractiveMesh } from "@/components/site-fx";
import { EASE } from "@/components/site-fx";
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

// ── Fond : mesh multicolore + grille interactive qui s'illumine au curseur ───


// Mesh simple (overlays sans grille, ex. menu mobile).
export function Mesh() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[#FCFCFD]" />
      <div className="mesh-blob absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full blur-[110px]" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.5), transparent 66%)" }} />
      <div className="mesh-blob absolute bottom-[-24%] right-[-8%] w-[66vw] h-[66vw] rounded-full blur-[120px]" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.46), transparent 66%)" }} />
    </div>
  );
}

// ── Navigation partagée (dropdown Produits) ──────────────────────────────────

export function SiteNav() {
  const t = useT();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  // Nav réduite : on raconte l'usage (comment ça marche / agents / solutions), plus
  // le catalogue de 7 produits. Les ancres pointent vers la landing en absolu pour
  // fonctionner depuis n'importe quelle page publique. Les pages /produits/[slug]
  // existent toujours (SEO) mais ne sont plus dans la nav — elles vivent au footer.
  const links = [
    { href: "/#demo", label: t("Comment ça marche", "How it works") },
    { href: "/#agents", label: t("Agents", "Agents") },
    { href: "/#solutions", label: t("Solutions", "Solutions") },
    { href: "/tarifs", label: t("Tarifs", "Pricing") },
  ];

  return (
    <>
      <nav className="fixed top-0 inset-x-0 z-50 px-3 sm:px-5 pt-3 sm:pt-4">
        <div className={`relative max-w-6xl mx-auto h-[66px] px-3.5 sm:px-5 flex items-center justify-between rounded-[22px] border transition-all duration-300 ${scrolled ? "bg-white/85 backdrop-blur-2xl border-white/80 shadow-[0_18px_50px_-10px_rgba(76,40,140,0.22),inset_0_1px_0_rgba(255,255,255,0.9)]" : "bg-white/65 backdrop-blur-xl border-white/70 shadow-[0_12px_38px_-12px_rgba(76,40,140,0.15),inset_0_1px_0_rgba(255,255,255,0.85)]"}`}>
          <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/50 to-transparent" />
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(true)} aria-label={t("Menu", "Menu")}
              className="md:hidden w-9 h-9 rounded-[11px] bg-black/[0.05] hover:bg-black/[0.09] flex items-center justify-center transition-colors">
              <Menu className="w-[18px] h-[18px] text-[#0A0A0A]" />
            </button>
            <Link href="/" className="flex items-center gap-2.5">
              <BiltiaLogo className="h-[28px] w-auto text-[#0A0A0A]" />
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="px-3.5 py-2 rounded-lg text-[14px] text-[#5B5B66] hover:text-[#0A0A0A] hover:bg-black/[0.04] transition-colors font-medium">{l.label}</Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="nav" className="hidden sm:block" />
            <a href="/login" className="hidden sm:inline-flex px-4 py-2 text-[14px] text-[#5B5B66] hover:text-[#0A0A0A] font-medium transition-colors">{t("Se connecter", "Sign in")}</a>
            <Magnetic>
              <a href="/signup" className={`${BLACK} text-[14px] font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-1.5`}>{t("Essayer Biltia", "Try Biltia")}</a>
            </Magnetic>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] md:hidden bg-white/90 backdrop-blur-xl overflow-y-auto">
            <Mesh />
            <button onClick={() => setOpen(false)} aria-label={t("Fermer", "Close")} className="absolute top-5 right-5 w-9 h-9 rounded-[11px] bg-black/[0.05] flex items-center justify-center z-10"><X className="w-[18px] h-[18px]" /></button>
            <div className="min-h-[100dvh] flex flex-col justify-center px-6 py-20 gap-6">
              <div className="flex flex-col gap-3 text-[20px] font-bold text-[#0A0A0A]">
                {links.map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</Link>
                ))}
                <Link href="/login" onClick={() => setOpen(false)}>{t("Se connecter", "Sign in")}</Link>
              </div>
              <div className="pt-1"><LanguageSwitcher variant="nav" /></div>
              <a href="/signup" className={`${BLACK} font-semibold px-8 py-3.5 rounded-full text-[15px] text-center`}>{t("Essayer Biltia", "Try Biltia")}</a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Galerie de modèles (aperçu live via iframe /t/[id]) ──────────────────────

// Aperçu qui S'ADAPTE à la place disponible : mesure la largeur du conteneur et
// rend l'app à une résolution de référence (desktop large / mobile étroit selon
// la place) mise à l'échelle pour REMPLIR la largeur SANS rien rogner. Le vrai
// design de l'app apparaît en entier, joliment cadré, quelle que soit la taille.
// L'aperçu est mis en cache PUBLIC : la langue passe par l'URL, jamais par le
// cookie (sinon le cache servirait l'anglais au visiteur français suivant).
function previewSrc(id: string, locale: Locale): string {
  return locale === "en" ? `/t/${id}?lang=en` : `/t/${id}`;
}

function ScaledPreview({ id, title, maxH }: { id: string; title: string; maxH?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const u = () => setW(el.clientWidth);
    u();
    const ro = new ResizeObserver(u);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // ≥480px : rendu DESKTOP (1240) réduit pour tenir → mini-tableau de bord net.
  // <480px : rendu MOBILE à la taille NATIVE (scale 1, jamais agrandi/flou), hauteur clippée.
  const desktop = w >= 480;
  const refW = desktop ? 1240 : Math.max(w, 300);
  const refH = desktop ? 800 : 1100;
  const scale = desktop && w ? w / refW : 1;
  const h = Math.min(desktop ? Math.round(refH * scale) || 240 : Math.round(w * 1.42) || 260, maxH ?? 9999);
  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ height: h, background: "#FBFBFD" }}>
      {w > 0 && (
        <iframe
          src={previewSrc(id, locale)}
          title={title}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          className="absolute top-0 left-0 border-0 pointer-events-none select-none"
          style={{ width: refW, height: refH, transform: `scale(${scale})`, transformOrigin: "top left" }}
        />
      )}
    </div>
  );
}

function TemplateCard({ t, onActivate, ctaLabel }: { t: TemplatePreview; onActivate: (t: TemplatePreview) => void; ctaLabel: string }) {
  const tr = useT();
  return (
    <div
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
          {tr("Aperçu live", "Live preview")}
        </span>
      </div>
      <ScaledPreview id={t.id} title={t.name} />
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

// Appareil réel du visiteur : mobile < 768px, tablette < 1024px, sinon bureau.
// Détermine QUELS formats d'aperçu sont proposés (on ne propose jamais un format
// plus large que l'écran réel : sur tablette pas de « bureau », sur mobile rien).
type PreviewDevice = "desktop" | "tablet" | "mobile";
function useVisitorDevice(): PreviewDevice {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setDevice(w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop");
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return device;
}

const DEVICE_META: Record<PreviewDevice, { Icon: typeof Monitor }> = {
  desktop: { Icon: Monitor },
  tablet: { Icon: Tablet },
  mobile: { Icon: Smartphone },
};

function deviceLabel(t: (fr: string, en: string) => string, d: PreviewDevice): string {
  return d === "desktop" ? t("Bureau", "Desktop") : d === "tablet" ? t("Tablette", "Tablet") : t("Mobile", "Mobile");
}

// Modale d'aperçu plein cadre (template interactif) + sélecteur bureau/tablette/mobile + CTA.
function TemplatePreviewModal({ t, onClose, onUse }: { t: TemplatePreview; onClose: () => void; onUse: (t: TemplatePreview) => void }) {
  const tr = useT();
  const locale = useLocale();
  const visitor = useVisitorDevice();
  // Formats proposés = tous ceux ≤ l'appareil du visiteur. Bureau → 3, tablette → 2, mobile → 1.
  const options: PreviewDevice[] =
    visitor === "desktop" ? ["desktop", "tablet", "mobile"]
    : visitor === "tablet" ? ["tablet", "mobile"]
    : ["mobile"];
  const [device, setDevice] = useState<PreviewDevice>(visitor);
  // Défaut = l'appareil du visiteur ; recale si un changement d'écran rend le format courant impossible.
  useEffect(() => {
    setDevice((d) => (options.includes(d) ? d : options[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitor]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#0A0A0F]/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-[78vw] max-w-[1560px] h-[92vh] sm:h-[88vh] bg-white rounded-[24px] overflow-hidden shadow-[0_50px_130px_rgba(20,20,50,0.45)] flex flex-col">
        <div className="flex items-center gap-3 px-5 h-14 border-b border-[#ECECF2] flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.accent }} />
            <h3 className="font-bold text-[#0A0A0A] tracking-[-0.01em] truncate">{t.name}</h3>
            <span className="hidden sm:inline flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: t.accent, background: `${t.accent}14`, border: `1px solid ${t.accent}2e` }}>{t.category}</span>
          </div>
          {/* Sélecteur de format (masqué sur mobile : mobile par défaut, rien à changer). */}
          {options.length > 1 && (
            <div className="flex items-center gap-0.5 bg-[#F6F6F9] rounded-full p-0.5 flex-shrink-0">
              {options.map((d) => {
                const { Icon } = DEVICE_META[d];
                const label = deviceLabel(tr, d);
                const previewLabel = tr(`Aperçu ${label.toLowerCase()}`, `${label} preview`);
                return (
                  <button
                    key={d}
                    onClick={() => setDevice(d)}
                    title={previewLabel}
                    aria-label={previewLabel}
                    aria-pressed={device === d}
                    className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${device === d ? "bg-white text-[#0A0A0A] shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-[#9A9AA6] hover:text-[#0A0A0A]"}`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-end flex-1">
            <button onClick={onClose} aria-label={tr("Fermer", "Close")} className="w-9 h-9 rounded-full hover:bg-black/[0.05] flex items-center justify-center text-[#6E6E7A] flex-shrink-0"><X className="w-[18px] h-[18px]" /></button>
          </div>
        </div>
        <div className={`relative flex-1 bg-[#FBFBFD] min-h-0 ${device === "desktop" ? "" : "flex items-center justify-center overflow-auto p-4 sm:p-6"}`}>
          <div
            className={
              device === "desktop"
                ? "absolute inset-0"
                : device === "tablet"
                  ? "w-[820px] max-w-full h-[1100px] max-h-full flex-shrink-0 overflow-hidden rounded-[1.5rem] bg-white shadow-[0_24px_70px_rgba(60,40,120,0.16)]"
                  : "w-[390px] max-w-full h-[844px] max-h-full flex-shrink-0 overflow-hidden rounded-[1.5rem] bg-white shadow-[0_24px_70px_rgba(60,40,120,0.2)]"
            }
          >
            <iframe src={previewSrc(t.id, locale)} title={t.name} sandbox="allow-scripts allow-same-origin" className="w-full h-full border-0" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[#ECECF2] flex-shrink-0">
          <p className="hidden sm:block text-[13px] text-[#5B5B66] truncate">{t.tagline}</p>
          <button onClick={() => onUse(t)} className="ml-auto inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white font-semibold px-6 py-3 rounded-full shadow-[0_12px_32px_rgba(124,58,190,0.35)] hover:brightness-105 active:scale-[0.98] transition">
            {tr("Utiliser ce template", "Use this template")} <ArrowRight className="w-4 h-4" />
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
  const tr = useT();
  const locale = useLocale();
  const [open, setOpen] = useState<TemplatePreview | null>(null);
  const activate = preview ? setOpen : onUse;
  const ctaLabel = preview ? tr("Voir le template", "View template") : tr("Utiliser ce modèle", "Use this template");
  // Nom / catégorie / accroche dans la langue de l'interface → la recherche
  // porte sur le texte réellement affiché.
  const templates = TEMPLATE_PREVIEWS.map((tp) => localizeTemplatePreview(tp, locale));
  const q = query.trim().toLowerCase();
  const list = q
    ? templates.filter((t) => `${t.name} ${t.category} ${t.tagline}`.toLowerCase().includes(q))
    : templates;
  return (
    <>
      {list.length === 0 ? (
        <p className="text-[13px] text-[#6E6E6C] py-10 text-center">{tr("Aucun modèle ne correspond à votre recherche.", "No template matches your search.")}</p>
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
  const tr = useT();
  const locale = useLocale();
  const items = TEMPLATE_PREVIEWS.map((tp) => localizeTemplatePreview(tp, locale));
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
  const slideW = Math.round(Math.min(Math.max(w * (isNarrow ? 0.88 : 0.62), 240), 960));
  // Aperçu : ≥480px = app desktop réduite (mini, net) ; <480px = app mobile NATIVE (jamais agrandie).
  const pvDesktop = slideW >= 480;
  const pvRefW = pvDesktop ? 1240 : slideW;
  const pvRefH = pvDesktop ? 800 : 1100;
  const pvScale = pvDesktop ? slideW / pvRefW : 1;
  const previewH = pvDesktop ? Math.round(pvRefH * pvScale) : Math.round(slideW * 1.42);
  const cardH = previewH + 118;
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
                    {tr("Aperçu live", "Live preview")}
                  </span>
                </div>
                <div className="relative overflow-hidden" style={{ height: previewH, background: "#FBFBFD" }}>
                  <iframe
                    src={previewSrc(t.id, locale)}
                    title={t.name}
                    loading="lazy"
                    sandbox="allow-scripts allow-same-origin"
                    className="absolute top-0 left-0 border-0 pointer-events-none select-none"
                    style={{ width: pvRefW, height: pvRefH, transform: `scale(${pvScale})`, transformOrigin: "top left" }}
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
                      {tr("Utiliser", "Use")} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => go(-1)} aria-label={tr("Modèle précédent", "Previous template")} className="absolute left-3 sm:left-10 z-20 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-[#ECECF2] shadow-[0_10px_28px_rgba(20,20,50,0.14)] flex items-center justify-center text-[#0A0A0A] hover:scale-105 active:scale-95 transition" style={{ top: arrowTop }}>
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button onClick={() => go(1)} aria-label={tr("Modèle suivant", "Next template")} className="absolute right-3 sm:right-10 z-20 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-[#ECECF2] shadow-[0_10px_28px_rgba(20,20,50,0.14)] flex items-center justify-center text-[#0A0A0A] hover:scale-105 active:scale-95 transition" style={{ top: arrowTop }}>
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
  const t = useT();
  const locale = useLocale();
  // Les noms de produits du footer viennent de lib/products.ts → à localiser.
  const products = PRODUCTS.map((p) => localizeProduct(p, locale));
  return (
    <footer className="border-t border-[#EDEDEB] py-12 px-5 sm:px-8 bg-[#FCFCFD]">
      <div className="max-w-6xl mx-auto grid sm:grid-cols-[1.2fr_1fr_1fr] gap-8 mb-10">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <BiltiaLogo className="h-6 w-auto text-[#0A0A0A]" />
          </div>
          <p className="text-[13px] text-[#7A7A86] max-w-[280px] leading-relaxed">{t("Décrivez ce qui doit être fait. Biltia utilise les données de votre entreprise pour réaliser vos tâches, préparer vos documents et automatiser ce qui revient chaque semaine.", "Describe what needs doing. Biltia uses your company's data to carry out your tasks, prepare your documents, and automate what comes back every week.")}</p>
          {/* LinkedIn : lien externe (nouvel onglet) + rel de sécurité. L'URL vient
              de lib/brand-entity.ts, la même qui alimente le sameAs du JSON-LD. */}
          <a
            href={BRAND.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn Biltia"
            className="inline-flex items-center justify-center h-9 w-9 mt-4 rounded-lg border border-[#EDEDEB] text-[#7A7A86] hover:text-[#0A76B4] hover:border-[#0A76B4] transition-colors"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
            </svg>
          </a>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-[#9A9AA6] mb-3">{t("Solutions", "Solutions")}</p>
          <ul className="space-y-2">
            {products.slice(0, 5).map((p) => (
              <li key={p.slug}><Link href={`/produits/${p.slug}`} className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">{p.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-[#9A9AA6] mb-3">{t("Entreprise", "Company")}</p>
          <ul className="space-y-2">
            <li><Link href="/blog" className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">{t("Blog", "Blog")}</Link></li>
            <li><Link href="/tarifs" className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">{t("Tarifs", "Pricing")}</Link></li>
            <li><Link href="/connecteurs" className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">{t("Connecteurs", "Connectors")}</Link></li>
            <li><Link href="/#demo" className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">{t("En action", "In action")}</Link></li>
            <li><ReserveDemoButton className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">{t("Réserver une démo", "Book a demo")}</ReserveDemoButton></li>
            <li><a href="mailto:contact@biltia.com" className="text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] transition-colors">{t("Contact", "Contact")}</a></li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-[#EDEDEB]">
        <span className="text-[13px] text-[#B0B0B8]">© 2026 Biltia</span>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {[[t("Mentions légales", "Legal notice"), "/mentions-legales"], [t("CGU", "Terms"), "/cgu"], [t("CGV", "Sales terms"), "/cgv"], [t("Confidentialité", "Privacy"), "/confidentialite"]].map(([l, href]) => (<a key={href} href={href} className="text-[13px] text-[#9A9AA6] hover:text-[#0A0A0A] transition-colors">{l}</a>))}
        </div>
      </div>
    </footer>
  );
}
