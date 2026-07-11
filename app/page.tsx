"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, Mic, MicOff,
  FileText, LayoutGrid, MessageCircle, Zap,
  Users, Building2, HardHat, Clock, FolderKanban,
  Bot, CheckCircle, Pause,
} from "lucide-react";
import { PRODUCTS } from "@/lib/products";
import {
  EASE, PRODUCT_ICONS, useTypewriter,
  Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter, TemplateCarousel,
} from "@/components/site";

// ── Héros ────────────────────────────────────────────────────────────────────

const PLACEHOLDERS = [
  "Relance mes devis sans réponse tous les jours à 9h…",
  "Sors-moi l'avenant pour le carrelage validé, 45 m²…",
  "Un suivi de mes chantiers avec l'avancement…",
  "Chaque soir à 18h, fais le point sur mes impayés…",
  "Quels chantiers sont en retard cette semaine ?",
];
function FormatPills() {
  const items = [
    { l: "Agent autonome", I: Bot }, { l: "Application", I: LayoutGrid },
    { l: "Document", I: FileText }, { l: "Réponse", I: MessageCircle },
    { l: "Automatisation", I: Zap },
  ];
  const [a, setA] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setA((k) => (k + 1) % items.length), 1700);
    return () => clearInterval(id);
  }, [reduce, items.length]);
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
      <span className="text-[13px] text-[#8B8B96]">Biltia choisit</span>
      {items.map((it, k) => {
        const I = it.I; const on = k === a;
        return (
          <motion.span key={it.l} animate={{ scale: on ? 1 : 0.97 }} transition={{ duration: 0.4, ease: EASE }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors duration-500 ${on ? "grad-border text-[#0A0A0A]" : "glass text-[#8B8B96] border-white/50"}`}>
            <I className="w-3.5 h-3.5" />{it.l}
          </motion.span>
        );
      })}
    </div>
  );
}

function HeroSection() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const typed = useTypewriter(PLACEHOLDERS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const handleSubmit = () => {
    if (!input.trim()) return;
    sessionStorage.setItem("biltia_prompt", input.trim());
    router.push("/signup?from=prompt");
  };
  const toggleVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { alert("Utilisez Chrome pour la reconnaissance vocale."); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const r = new SR();
    r.lang = "fr-FR"; r.continuous = false; r.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => setInput((p) => (p ? p + " " : "") + e.results[0][0].transcript);
    r.onend = () => setIsListening(false);
    r.onerror = () => setIsListening(false);
    r.start(); recognitionRef.current = r; setIsListening(true);
  };
  return (
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden px-5 sm:px-8 pt-28 pb-20">
      <InteractiveMesh strong />
      <div className="relative z-10 max-w-3xl w-full mx-auto flex flex-col items-center text-center">
        <span className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-[#4A4A56] mb-5 animate-reveal-up">
          <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500" />
          Conçu pour les artisans du BTP
        </span>
        {/* Titres alternatifs à A/B tester :
            "Vous apportez le problème. Biltia apporte la solution."
            "Parlez de votre problème. Repartez avec la solution."
            "Dites ce qui vous bloque." */}
        <h1 className="animate-reveal-up delay-100">
          <span className="block font-semibold text-[#2A2A32] text-[17px] sm:text-[21px] md:text-[24px] tracking-[-0.01em] mb-2.5">Décrivez votre problème.</span>
          <span className="block font-black text-gradient animate-gradient-x text-[46px] sm:text-[74px] md:text-[92px] leading-[0.88] tracking-[-0.05em] pb-2">Biltia s&apos;occupe du reste.</span>
        </h1>
        <p className="text-[16px] sm:text-[18px] text-[#5B5B66] max-w-[400px] leading-[1.55] mt-4 mb-16 animate-reveal-up delay-200">
          Il gère <span className="font-semibold text-[#0A0A0A]">tout votre métier</span>. Vos agents travaillent 24h/24.
        </p>
        <div className="w-full max-w-2xl animate-reveal-up delay-300">
          {/* Deux lueurs discrètes (haut-droite / bas-gauche) tournent autour de la carte (.chatframe). */}
          <div className="chatframe" style={{ borderRadius: 30 }}>
          <div className="chatcard bg-white rounded-[30px] p-2.5 border border-[#ECECF2] shadow-[0_20px_60px_rgba(60,40,120,0.12)] focus-within:shadow-[0_24px_70px_rgba(60,40,120,0.18)] transition-shadow">
            <div className="relative px-4 pt-4 pb-2 min-h-[72px] text-left">
              {!input && (
                <span className="absolute top-4 left-4 right-4 text-[15px] sm:text-[16px] text-[#9A9AA6] pointer-events-none select-none leading-relaxed">
                  {typed}
                  <span aria-hidden className="inline-block w-[2px] h-[0.95em] translate-y-[2px] bg-[#7C3AED]/80 ml-0.5 animate-blink" />
                </span>
              )}
              <textarea ref={textareaRef} value={input}
                onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                rows={2} className="relative z-10 w-full bg-transparent text-[#0A0A0A] text-[15px] sm:text-[16px] leading-relaxed resize-none focus:outline-none min-h-[44px]"
                style={{ caretColor: "#7C3AED" }} aria-label="Décrivez votre problème" />
            </div>
            <div className="flex items-center justify-between gap-3 px-2 pb-1">
              <button onClick={toggleVoice} aria-label="Dicter"
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors ${isListening ? "bg-rose-100 text-rose-600" : "bg-black/[0.04] border border-black/[0.06] text-[#4A4A56] hover:bg-black/[0.07]"}`}>
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isListening ? "Écoute…" : "Voix"}
              </button>
              <button onClick={handleSubmit} disabled={!input.trim()} aria-label="Lancer"
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_6px_20px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_28px_rgba(139,92,246,0.55)] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none">
                <ArrowUpRight className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
          </div>
        </div>
        <div className="animate-reveal-up delay-500"><FormatPills /></div>
      </div>
    </section>
  );
}

// ── Produits ─────────────────────────────────────────────────────────────────

function ProductsSection() {
  return (
    <section id="produits" className="relative px-5 sm:px-8 py-28 sm:py-36 overflow-hidden">
      <div className="mesh-blob absolute top-0 right-[-8%] w-[42vw] h-[42vw] max-w-[560px] rounded-full blur-[130px] pointer-events-none animate-drift-c" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.18), transparent 68%)" }} />
      <div className="relative max-w-6xl mx-auto">
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="text-[38px] sm:text-[56px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[0.98]">Une barre. <span className="text-gradient">Tous vos outils.</span></h2>
          <p className="text-[16px] text-[#5B5B66] mt-4 leading-relaxed">Selon votre demande, Biltia bascule sur le bon produit. Vous ne le choisissez jamais.</p>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRODUCTS.map((p, k) => {
            const Icon = PRODUCT_ICONS[p.icon];
            // 7 produits dans une grille de 3 laisseraient la dernière carte seule
            // avec 2 trous à droite. On la fait s'étendre en pleine largeur (carte
            // horizontale « socle ») : zéro espace bête, et c'est cohérent — le
            // workspace est la base qui unifie tout le reste.
            const isLast = k === PRODUCTS.length - 1;
            return (
              <Reveal key={p.slug} delay={(k % 3) * 0.06} className={isLast ? "md:col-span-2 lg:col-span-3" : ""}>
                <Link href={`/produits/${p.slug}`} className="block h-full">
                  {isLast ? (
                    <Spot className="glass glass-hover h-full rounded-[26px] p-7 overflow-hidden group flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                      <div className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${p.accent[0]}, ${p.accent[1]})` }}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[19px] font-bold text-[#0A0A0A] tracking-[-0.01em]">{p.name}</h3>
                        <p className="text-[13.5px] text-[#5B5B66] leading-relaxed">{p.tagline}.</p>
                      </div>
                      <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0A0A0A] group-hover:gap-2.5 transition-all">En savoir plus <ArrowRight className="w-3.5 h-3.5" /></span>
                    </Spot>
                  ) : (
                    <Spot className="glass glass-hover h-full rounded-[26px] p-7 overflow-hidden group">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-6" style={{ background: `linear-gradient(135deg, ${p.accent[0]}, ${p.accent[1]})` }}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <h3 className="text-[19px] font-bold text-[#0A0A0A] mb-1.5 tracking-[-0.01em]">{p.name}</h3>
                      <p className="text-[13.5px] text-[#5B5B66] leading-relaxed mb-5">{p.tagline}.</p>
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0A0A0A] group-hover:gap-2.5 transition-all">En savoir plus <ArrowRight className="w-3.5 h-3.5" /></span>
                    </Spot>
                  )}
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Démo : aperçu produit ────────────────────────────────────────────────────

function Row({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "accent" | "grand" }) {
  const lab = tone === "accent" ? "text-[#7C3AED] font-medium" : tone === "grand" ? "font-semibold text-[#0F172A]" : "text-[#9CA3AF]";
  const val = tone === "accent" ? "text-[#7C3AED] font-semibold" : tone === "grand" ? "font-bold text-[#0F172A]" : "text-[#6B7280]";
  return (
    <div className={`flex justify-between ${tone === "grand" ? "pt-1.5 border-t border-[#F1F1EC]" : ""}`}>
      <span className={lab}>{label}</span><span className={`tabular-nums ${val}`}>{value}</span>
    </div>
  );
}
function DocResult() {
  return (
    <div className="rounded-2xl border border-[#ECECEA] bg-white p-4">
      <div className="flex items-start justify-between mb-3">
        <div><p className="text-[11px] text-[#9CA3AF]">Avenant AV-2026-014</p><p className="text-[13px] font-semibold text-[#0F172A]">Villa Dumont, carrelage</p></div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-[#7C3AED] text-[10px] font-semibold border border-violet-100"><FileText className="w-2.5 h-2.5" /> PDF prêt</span>
      </div>
      <div className="space-y-1.5 text-[12px]">
        <Row label="Montant initial HT" value="18 400 €" /><Row label="Avenant (+45 m²)" value="+ 1 890 €" tone="accent" /><Row label="Nouveau total HT" value="20 290 €" tone="grand" />
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        {["L'entreprise", "Le client"].map((s) => (
          <div key={s} className="rounded-lg border border-dashed border-[#D8D8E0] px-2 py-2"><p className="text-[9px] text-[#9CA3AF]">{s}</p><p className="text-[11px] text-[#CBCBD6] italic mt-1">Signature</p></div>
        ))}
      </div>
    </div>
  );
}
function AppResult() {
  const rows = [{ name: "Villa Dumont", pct: 78, val: "24 500 €" }, { name: "Résidence des Prés", pct: 100, val: "67 200 €", done: true }, { name: "École Bellevue", pct: 32, val: "12 000 €" }];
  return (
    <div className="rounded-2xl border border-[#ECECEA] bg-white p-4">
      <div className="flex items-center justify-between mb-3"><p className="text-[12px] font-semibold text-[#0F172A]">Suivi chantiers</p><span className="text-[11px] text-[#9CA3AF]">3 actifs</span></div>
      <div className="divide-y divide-[#F1F1EC]">
        {rows.map((r, j) => (
          <div key={r.name} className="grid grid-cols-4 items-center gap-2 py-2">
            <span className="col-span-2 text-[12px] text-[#0F172A] font-medium truncate">{r.name}</span>
            <div className="flex items-center gap-1.5"><div className="flex-1 h-1.5 bg-[#F1F1EC] rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${r.pct}%` }} transition={{ duration: 0.9, ease: EASE, delay: 0.2 + j * 0.08 }} className={`h-full rounded-full ${r.done ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-violet-500"}`} /></div><span className="text-[9px] text-[#9CA3AF] w-6 text-right tabular-nums">{r.pct}%</span></div>
            <span className="text-[12px] text-[#0F172A] font-semibold text-right tabular-nums">{r.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function AnswerResult() {
  return (
    <div className="rounded-2xl border border-[#ECECEA] bg-white p-4">
      <p className="text-[13px] text-[#0F172A] leading-relaxed mb-2.5"><span className="font-semibold">2 chantiers</span> sont en retard cette semaine :</p>
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-100 px-3 py-2"><span className="text-[12px] text-[#0F172A] font-medium">École Bellevue</span><span className="text-[11px] text-[#B45309] font-medium">J+6, 32%</span></div>
        <div className="flex items-center justify-between rounded-lg bg-rose-50 border border-rose-100 px-3 py-2"><span className="text-[12px] text-[#0F172A] font-medium">Entrepôt Z.I. Nord</span><span className="text-[11px] text-[#E11D48] font-medium">Budget +8%</span></div>
      </div>
      <p className="text-[10px] text-[#9CA3AF] mt-2.5">Source : Workspace, mis à jour il y a 2 h</p>
    </div>
  );
}
function AutoResult() {
  return (
    <div className="rounded-2xl border border-[#ECECEA] bg-white p-4">
      <p className="text-[12px] font-semibold text-[#0F172A] mb-3">30 bons de livraison analysés</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-center"><p className="text-xl font-bold text-emerald-600 tabular-nums">28</p><p className="text-[10px] text-emerald-700">conformes</p></div>
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 text-center"><p className="text-xl font-bold text-amber-600 tabular-nums">2</p><p className="text-[10px] text-amber-700">écarts</p></div>
      </div>
      <div className="space-y-1 text-[11px]"><Row label="BL-1042, placo BA13" value="+ 120 € vs devis" /><div className="flex justify-between"><span className="text-[#6B7280]">BL-1057, réf. inconnue</span><span className="text-[#B45309] font-medium">à vérifier</span></div></div>
    </div>
  );
}
function AgentResult() {
  return (
    <div className="rounded-2xl border border-[#ECECEA] bg-white p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[13px] font-semibold text-[#0F172A]">Relance des devis en attente</p>
          <p className="text-[11px] text-[#9CA3AF]">tous les jours à 09:00 · prochain passage demain</p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold border border-emerald-100"><CheckCircle className="w-2.5 h-2.5" /> Actif</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between rounded-lg bg-[#FAFAF9] border border-[#F1F1EC] px-3 py-2">
          <span className="text-[11.5px] text-[#0F172A]">✓ Relance envoyée à Dubois SARL</span>
          <span className="text-[10px] text-[#9CA3AF] tabular-nums">hier 09:00</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-[#FAFAF9] border border-[#F1F1EC] px-3 py-2">
          <span className="text-[11.5px] text-[#0F172A]">✓ Devis D-2026-04 accepté, relances stoppées</span>
          <span className="text-[10px] text-[#9CA3AF] tabular-nums">lun. 09:00</span>
        </div>
      </div>
      <p className="text-[10px] text-[#9CA3AF] mt-2.5">Chaque passage est tracé. Vous pouvez le mettre en pause à tout moment.</p>
    </div>
  );
}
type Scenario = { problem: string; short: string; route: string; Icon: React.ComponentType<{ className?: string }>; accent: [string, string]; result: React.ReactNode };
const SCENARIOS: Scenario[] = [
  { problem: "Relance mes devis sans réponse tous les jours à 9h.", short: "Relancer mes devis", route: "Agent", Icon: Bot, accent: ["#6366F1", "#22D3EE"], result: <AgentResult /> },
  { problem: "Un suivi de mes chantiers avec l'avancement et le reste à facturer.", short: "Suivi de chantiers", route: "Application", Icon: LayoutGrid, accent: ["#6366F1", "#A855F7"], result: <AppResult /> },
  { problem: "Sors-moi l'avenant pour le carrelage validé, 45 m² à 42 €/m².", short: "Faire un avenant", route: "Document", Icon: FileText, accent: ["#A855F7", "#EC4899"], result: <DocResult /> },
  { problem: "Quels chantiers sont en retard cette semaine ?", short: "Chantiers en retard ?", route: "Réponse", Icon: MessageCircle, accent: ["#3B82F6", "#6366F1"], result: <AnswerResult /> },
  { problem: "Vérifie les prix de ces 30 bons de livraison vs mes devis.", short: "Vérifier 30 bons", route: "Automatisation", Icon: Zap, accent: ["#F59E0B", "#F97316"], result: <AutoResult /> },
];

function RouterDemo() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const sc = SCENARIOS[active];
  // Défile lentement jusqu'à la première interaction, puis reste sur le choix.
  useEffect(() => {
    if (reduce || touched) return;
    const id = setInterval(() => setActive((p) => (p + 1) % SCENARIOS.length), 4200);
    return () => clearInterval(id);
  }, [reduce, touched]);
  const pick = (k: number) => { setTouched(true); setActive(k); };
  return (
    <div className="w-full">
      {/* Exemples cliquables */}
      <div className="flex flex-wrap justify-center gap-2 mb-7">
        {SCENARIOS.map((s, k) => (
          <button key={s.route} onClick={() => pick(k)} aria-pressed={active === k}
            className={`px-3.5 py-2 rounded-full text-[12.5px] font-medium border transition-all duration-200 ${active === k ? "text-white border-transparent shadow-[0_8px_22px_-8px_rgba(76,40,140,0.55)]" : "text-[#4A4A56] bg-white/70 border-[#ECECF2] hover:border-[#D6D0E4] hover:bg-white"}`}
            style={active === k ? { background: `linear-gradient(135deg, ${s.accent[0]}, ${s.accent[1]})` } : undefined}>
            {s.short}
          </button>
        ))}
      </div>

      <div className="relative rounded-[26px] bg-white/90 backdrop-blur-xl border border-white/70 shadow-[0_30px_80px_rgba(60,40,120,0.16)] p-5 sm:p-7">
        {/* Le problème décrit */}
        <div className="flex justify-center">
          <div className="max-w-[92%] rounded-2xl rounded-br-md bg-[#0A0A0A] px-4 py-2.5 text-center text-[13.5px] leading-relaxed text-white">
            «&nbsp;{sc.problem}&nbsp;»
          </div>
        </div>
        {/* Connecteur de routage */}
        <div className="my-4 flex flex-col items-center gap-1.5">
          <span className="text-[10.5px] text-[#9CA3AF]">Biltia analyse et choisit l&apos;outil</span>
          <span className="h-4 w-px bg-gradient-to-b from-[#C4B5FD] to-transparent" />
        </div>
        {/* Rail des 5 outils, le bon s'allume */}
        <div className="mb-6 grid grid-cols-5 gap-1.5 sm:gap-3">
          {SCENARIOS.map((s, k) => {
            const on = active === k;
            return (
              <button key={s.route} onClick={() => pick(k)} aria-pressed={on}
                className={`relative flex flex-col items-center gap-2 rounded-2xl px-1 py-3 sm:py-4 border transition-all duration-300 ${on ? "border-transparent bg-white scale-[1.04]" : "border-[#ECECF2] bg-white/40 opacity-50 hover:opacity-100"}`}
                style={on ? { boxShadow: `0 14px 34px -12px ${s.accent[1]}80` } : undefined}>
                {on && <motion.span layoutId="router-dot" className="absolute -top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: s.accent[1] }} />}
                <span className="grid h-9 w-9 place-items-center rounded-xl text-white transition-colors duration-300 sm:h-11 sm:w-11"
                  style={{ background: on ? `linear-gradient(135deg, ${s.accent[0]}, ${s.accent[1]})` : "#CDCDD6" }}>
                  <s.Icon className="h-[17px] w-[17px] sm:h-5 sm:w-5" />
                </span>
                <span className={`text-center text-[10px] font-semibold leading-tight sm:text-[11.5px] ${on ? "text-[#0A0A0A]" : "text-[#9A9AA6]"}`}>{s.route}</span>
              </button>
            );
          })}
        </div>
        {/* Résultat de l'outil choisi */}
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
            <div className="mb-3 flex items-center justify-center gap-2">
              <span className="text-[11px] text-[#9CA3AF]">Biltia a choisi</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: `linear-gradient(135deg, ${sc.accent[0]}, ${sc.accent[1]})` }}>
                <sc.Icon className="h-3 w-3" />{sc.route}
              </span>
            </div>
            <div className="mx-auto max-w-xl">{sc.result}</div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function DemoSection() {
  return (
    <section id="demo" className="relative px-5 sm:px-8 py-28 sm:py-36 overflow-hidden">
      <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(60% 50% at 50% 50%, rgba(139,92,246,0.08), transparent 70%)" }} />
      <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-12">
        <Reveal><h2 className="text-[38px] sm:text-[56px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[0.98]">Vous ne choisissez jamais.</h2></Reveal>
        <Reveal delay={0.08}><p className="text-[16px] sm:text-[18px] text-[#5B5B66] leading-relaxed mt-5 max-w-xl mx-auto">Décrivez votre problème en une phrase. Biltia choisit le bon outil parmi cinq et vous livre le résultat. Vous, vous ne choisissez rien.</p></Reveal>
        <Reveal delay={0.14}><p className="text-[13px] font-semibold text-[#9A9AA6] mt-4">Cliquez un exemple pour voir Biltia trancher.</p></Reveal>
      </div>
      <Reveal delay={0.1} className="max-w-2xl mx-auto relative">
        <div className="absolute -inset-10 -z-10 rounded-[48px] blur-3xl opacity-70" style={{ background: "radial-gradient(closest-side, rgba(168,85,247,0.3), rgba(236,72,153,0.16), transparent)" }} />
        <RouterDemo />
      </Reveal>
    </section>
  );
}

// ── Agents autonomes (« recruter ») ──────────────────────────────────────────

function AgentsSection() {
  const missions = [
    "Relance mes devis sans réponse tous les jours à 9h.",
    "Chaque soir à 18h, fais le point sur mes factures impayées.",
    "Préviens-moi dès qu'un document d'un sous-traitant expire.",
  ];
  return (
    <section id="agents" className="relative px-5 sm:px-8 py-28 sm:py-36 overflow-hidden">
      <div className="mesh-blob absolute top-[10%] right-[-6%] w-[40vw] h-[40vw] max-w-[520px] rounded-full blur-[130px] pointer-events-none animate-drift-b" style={{ background: "radial-gradient(circle, rgba(34,211,238,0.16), transparent 68%)" }} />
      <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <Reveal className="order-2 lg:order-1">
          <div className="glass rounded-[26px] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
                <div><p className="text-[13px] font-semibold text-[#0A0A0A] leading-tight">Relance des devis en attente</p><p className="text-[11px] text-[#9A9AA6]">tous les jours à 09:00</p></div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200"><CheckCircle className="w-3 h-3" /> Actif</span>
            </div>
            <div className="space-y-2 mb-4">
              {[
                { t: "Relance envoyée à Dubois SARL", d: "aujourd'hui 09:00" },
                { t: "Devis D-2026-04 accepté, relances stoppées", d: "hier 09:00" },
                { t: "Il me manque l'email de Martin, je vous l'ai demandé", d: "lun. 09:00", warn: true },
              ].map((r) => (
                <div key={r.t} className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 border ${r.warn ? "bg-amber-50/70 border-amber-200" : "bg-white/70 border-white/60"}`}>
                  <span className="text-[12.5px] text-[#0A0A0A]">{r.warn ? "⚠️" : "✓"} {r.t}</span>
                  <span className="text-[10.5px] text-[#9A9AA6] tabular-nums flex-shrink-0 ml-3">{r.d}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#8B8B96]">
              <span className="inline-flex items-center gap-1.5"><Pause className="w-3 h-3" /> Pause à tout moment</span>
              <span>≈ 10 crédits / passage, inclus dans le forfait</span>
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.15} className="order-1 lg:order-2">
          <h2 className="text-[36px] sm:text-[52px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[0.98] mb-5">Des employés autonomes, <span className="text-gradient">au travail 24h/24.</span></h2>
          <p className="text-[16px] text-[#5B5B66] leading-relaxed mb-5 max-w-md">
            Les relances, les contrôles du soir, les rappels d&apos;échéances : dites-le une seule fois, et un agent s&apos;en occupe tous les jours, en temps et en heure, pendant que vous êtes sur le chantier. Il connaît vos clients, vos chantiers et vos devis. Il vous rend compte de chaque passage.
          </p>
          <ul className="space-y-2.5 mb-6 max-w-md">
            {missions.map((m) => (
              <li key={m} className="flex items-start gap-2.5 text-[14px] text-[#4A4A56]">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 flex-shrink-0" />
                <span>«&nbsp;{m}&nbsp;»</span>
              </li>
            ))}
          </ul>
          <p className="text-[13.5px] text-[#8B8B96] leading-relaxed mb-6 max-w-md">
            Un agent qui relance vos clients chaque matin utilise environ 300 crédits par mois : l&apos;équivalent de 15&nbsp;€ de votre forfait. Un salarié pour la même corvée&nbsp;: 4&nbsp;000&nbsp;€.
          </p>
          <Link href="/produits/agents" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0A0A0A] hover:gap-2.5 transition-all">Découvrir les agents <ArrowRight className="w-4 h-4" /></Link>
        </Reveal>
      </div>
    </section>
  );
}

// ── Workspace ────────────────────────────────────────────────────────────────

function WorkspaceSection() {
  const entities = [
    { icon: <Users className="w-4 h-4" />, label: "Clients" }, { icon: <Building2 className="w-4 h-4" />, label: "Chantiers" },
    { icon: <FileText className="w-4 h-4" />, label: "Documents" }, { icon: <HardHat className="w-4 h-4" />, label: "Équipes" },
    { icon: <LayoutGrid className="w-4 h-4" />, label: "Applications" }, { icon: <Clock className="w-4 h-4" />, label: "Historique" },
  ];
  return (
    <section className="relative px-5 sm:px-8 py-28 sm:py-36 overflow-hidden">
      <div className="mesh-blob absolute bottom-0 left-[-6%] w-[40vw] h-[40vw] max-w-[520px] rounded-full blur-[130px] pointer-events-none animate-drift-a" style={{ background: "radial-gradient(circle, rgba(45,212,191,0.18), transparent 68%)" }} />
      <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <Reveal>
          <h2 className="text-[36px] sm:text-[52px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[0.98] mb-5">Une mémoire <span className="text-gradient">qui grandit.</span></h2>
          <p className="text-[16px] text-[#5B5B66] leading-relaxed mb-6 max-w-md">Chaque demande enrichit un espace unique : clients, chantiers, documents, équipes, applications et historique. Plus vous utilisez Biltia, plus il devient pertinent.</p>
          <Link href="/produits/workspace" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0A0A0A] hover:gap-2.5 transition-all">Découvrir le Workspace <ArrowRight className="w-4 h-4" /></Link>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="glass rounded-[26px] p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0A0A0A] flex items-center justify-center"><FolderKanban className="w-4 h-4 text-white" /></div>
                <div><p className="text-[13px] font-semibold text-[#0A0A0A] leading-tight">Bâtiment Dumont</p><p className="text-[11px] text-[#9A9AA6]">Workspace</p></div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 text-[#4A4A56] text-[11px] font-medium border border-white/60"><span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 animate-glow-pulse" /> vivant</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {entities.map((e) => (
                <div key={e.label} className="rounded-2xl bg-white/60 border border-white/60 px-4 py-4 transition-colors hover:bg-white/80">
                  <div className="text-[#7C3AED] mb-2">{e.icon}</div>
                  <p className="text-[13px] font-semibold text-[#0A0A0A]">{e.label}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Philosophie ──────────────────────────────────────────────────────────────

function PhilosophySection() {
  return (
    <section className="relative px-5 sm:px-8 py-28 sm:py-40 overflow-hidden">
      <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(50% 60% at 50% 50%, rgba(99,102,241,0.07), transparent 70%)" }} />
      <Reveal className="max-w-4xl mx-auto text-center">
        <p className="text-[30px] sm:text-[46px] font-black text-[#0A0A0A] leading-[1.1] tracking-[-0.03em]">
          Moins de temps derrière un écran. <span className="text-gradient">Plus de temps sur vos chantiers.</span>
        </p>
        <p className="text-[16px] sm:text-[18px] text-[#8B8B96] mt-5">Et pendant ce temps, vos agents travaillent.</p>
      </Reveal>
    </section>
  );
}

// ── Templates (aperçu live via /t/[id]) ──────────────────────────────────────

function TemplatesSection() {
  const router = useRouter();
  const use = (t: { name: string }) => {
    sessionStorage.setItem("biltia_prompt", `Je veux ${t.name.toLowerCase()} pour mon entreprise.`);
    router.push("/signup?from=prompt");
  };
  return (
    <section id="templates" className="relative py-28 sm:py-36 overflow-hidden">
      <div className="mesh-blob absolute top-[8%] left-[-8%] w-[42vw] h-[42vw] max-w-[560px] rounded-full blur-[130px] pointer-events-none animate-drift-b" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.16), transparent 68%)" }} />
      <div className="relative max-w-6xl mx-auto px-5 sm:px-8">
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="text-[36px] sm:text-[56px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[0.98]">Prêts à l&apos;emploi. <span className="text-gradient">Ou sur mesure.</span></h2>
          <p className="text-[16px] text-[#5B5B66] mt-4 leading-relaxed">Des applications complètes, en aperçu live. Cliquez sur un modèle, Biltia l&apos;adapte à votre entreprise.</p>
        </Reveal>
      </div>
      <div className="relative max-w-[1500px] mx-auto px-3 sm:px-8">
        <TemplateCarousel onUse={use} />
      </div>
    </section>
  );
}

// ── CTA ──────────────────────────────────────────────────────────────────────

function CTASection() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const go = () => { if (!input.trim()) return; sessionStorage.setItem("biltia_prompt", input.trim()); router.push("/signup?from=prompt"); };
  return (
    <section className="relative px-5 sm:px-8 py-32 sm:py-44 overflow-hidden">
      <InteractiveMesh strong grid={false} />
      <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,0.55), transparent 75%)" }} />
      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <Reveal>
          <h2 className="text-[48px] sm:text-[78px] font-black text-[#0A0A0A] tracking-[-0.045em] leading-[0.92] mb-9">Votre prochain <span className="text-gradient">problème</span> ?</h2>
          <div className="glass glass-hover rounded-[26px] sm:rounded-full p-2 sm:p-1.5 flex flex-col sm:flex-row gap-2 max-w-lg mx-auto">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} placeholder="Décrivez-le…" className="flex-1 bg-transparent px-5 py-3 text-[15px] text-[#0A0A0A] placeholder-[#9A9AA6] focus:outline-none" />
            <button onClick={go} className="w-full sm:w-auto bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white font-semibold text-[14px] px-6 py-3.5 sm:py-3 rounded-full whitespace-nowrap flex items-center justify-center gap-1.5 shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] transition-shadow">Commencer <ArrowRight className="w-4 h-4" /></button>
          </div>
          <p className="text-[12px] text-[#9A9AA6] mt-4">Aucune carte bancaire requise. <Link href="/tarifs" className="underline underline-offset-2 hover:text-[#0A0A0A]">Voir les tarifs</Link></p>
        </Reveal>
      </div>
    </section>
  );
}

// Données structurées de la MARQUE (Organization + WebSite), SANS aucune date :
// dit à Google « page d'accueil permanente d'une entreprise », pas un article
// daté. C'est le bon signal pour décourager la date « il y a X jours » dans le
// résultat de recherche et enrichir le référencement. Rendu au SSR (Googlebot le lit).
const SITE_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.biltia.com/#organization",
      name: "Biltia",
      url: "https://www.biltia.com",
      logo: "https://www.biltia.com/icon.png",
      description:
        "L'OS conversationnel du BTP : décrivez votre problème, Biltia livre la solution — document, application, réponse ou automatisation.",
    },
    {
      "@type": "WebSite",
      "@id": "https://www.biltia.com/#website",
      name: "Biltia",
      url: "https://www.biltia.com",
      publisher: { "@id": "https://www.biltia.com/#organization" },
      inLanguage: "fr-FR",
    },
  ],
};

export default function Home() {
  return (
    <main className="bg-[#FCFCFD] min-h-screen overflow-x-hidden text-[#0A0A0A]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSONLD) }}
      />
      <SiteNav />
      <HeroSection />
      <AgentsSection />
      <ProductsSection />
      <DemoSection />
      <TemplatesSection />
      <WorkspaceSection />
      <PhilosophySection />
      <CTASection />
      <SiteFooter />
    </main>
  );
}
