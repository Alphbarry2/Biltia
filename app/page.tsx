"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  ArrowRight, Building2, Calendar, Check, ChevronDown,
  FileText, HardHat, Mic, MicOff, Package, Shield,
  Users, Zap, Clock, BarChart3, Wrench, AlertCircle,
} from "lucide-react";

const SPRING = [0.16, 1, 0.3, 1] as const;

const containerV = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const itemV = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: SPRING as [number,number,number,number] } },
};

function Reveal({ children, delay = 0, className = "" }: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  const links: [string, string][] = [
    ["Comment ça marche", "#comment-ca-marche"],
    ["Exemples", "#exemples"],
    ["Tarifs", "#tarifs"],
  ];
  return (
    <>
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${scrolled ? "bg-[#F7F5EF]/90 backdrop-blur-xl border-b border-[#E7E2D7] shadow-depth-1" : "bg-transparent"}`}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-[#0F172A] flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
              <span className="font-display text-white font-bold text-[13px] leading-none">B</span>
            </div>
            <span className="font-display font-semibold text-[#0F172A] text-[15px]">Batify</span>
          </a>
          <div className="hidden md:flex items-center gap-1">
            {links.map(([label, href]) => (
              <a key={label} href={href} className="px-3.5 py-2 rounded-lg text-[14px] text-[#4B5563] hover:text-[#111827] hover:bg-[#F1EEE6] transition-all duration-200 font-medium">{label}</a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-2">
            <a href="/login" className="px-4 py-2 text-[14px] text-[#4B5563] hover:text-[#111827] font-medium transition-colors duration-200">Connexion</a>
            <a href="/signup" className="bg-[#0F172A] text-white font-semibold text-[14px] px-5 py-2.5 rounded-xl hover:bg-[#1E293B] active:scale-[0.98] transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.15),0_4px_12px_rgba(15,23,42,0.2)] flex items-center gap-1.5">
              Commencer <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <button onClick={() => setOpen(!open)} className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#F1EEE6] transition-colors" aria-label="Menu">
            <div className="relative w-4 h-3">
              <span className={`absolute left-0 h-px bg-[#111827] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "top-[5px] w-full rotate-45" : "top-0 w-full"}`} />
              <span className={`absolute left-0 top-[5px] h-px bg-[#111827] transition-all duration-300 ${open ? "opacity-0 w-0" : "opacity-100 w-3/4"}`} />
              <span className={`absolute left-0 h-px bg-[#111827] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "top-[5px] w-full -rotate-45" : "top-[10px] w-full"}`} />
            </div>
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden bg-[#F7F5EF]/98 backdrop-blur-xl flex flex-col items-center justify-center gap-6">
            {links.map(([label, href], i) => (
              <motion.a key={label} href={href} onClick={() => setOpen(false)}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="font-display text-2xl font-bold text-[#111827] tracking-tight">{label}</motion.a>
            ))}
            <motion.a href="/signup" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-[#0F172A] text-white font-semibold px-10 py-3.5 rounded-xl text-[15px] mt-2">
              Commencer gratuitement
            </motion.a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const DEMO_PROMPT = "Je veux un tableau de suivi de mes chantiers avec le client, l'avancement en % et les factures.";

function GenerationDemo() {
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    const durations: Record<number, number> = { 0: 3800, 1: 2000, 2: 5500 };
    const t = setTimeout(() => setPhase((p) => ((p + 1) % 3) as 0 | 1 | 2), durations[phase]);
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== 0) { setTyped(0); return; }
    const id = setInterval(() => setTyped((n) => n >= DEMO_PROMPT.length ? n : n + 1), 28);
    return () => clearInterval(id);
  }, [phase]);
  return (
    <div className="w-full rounded-3xl bg-white border border-[#E7E2D7] shadow-depth-3 overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#F1EEE6] bg-[#F7F5EF]">
        {["#FECACA","#FDE68A","#A7F3D0"].map((c,i) => <div key={i} className="w-3 h-3 rounded-full" style={{background:c}} />)}
        <div className="flex-1 mx-3 bg-white border border-[#E7E2D7] rounded-md h-5 flex items-center px-2.5 gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#14B8A6]" />
          <span className="text-[10px] text-[#9CA3AF]">batify.fr/app/suivi-chantiers</span>
        </div>
      </div>
      <div className="p-6 min-h-[220px] flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {phase === 0 && (
            <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-3">Votre description</p>
              <div className="rounded-2xl border border-[#E7E2D7] bg-[#F7F5EF] p-4 min-h-[72px]">
                <p className="text-[14px] text-[#111827] leading-relaxed">
                  {DEMO_PROMPT.slice(0, typed)}
                  {typed < DEMO_PROMPT.length && <span className="inline-block w-px h-4 bg-[#14B8A6] ml-0.5 align-middle animate-blink" />}
                </p>
              </div>
            </motion.div>
          )}
          {phase === 1 && (
            <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5 py-4">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-2 border-[#E7E2D7]" />
                <motion.div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#14B8A6]"
                  animate={{ rotate: 360 }} transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }} />
                <div className="absolute inset-[10px] rounded-full bg-teal-50 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-[#14B8A6]" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-[#111827] mb-1">Génération en cours…</p>
                <p className="text-[11px] text-[#9CA3AF]">Analyse · Construction · Déploiement</p>
              </div>
            </motion.div>
          )}
          {phase === 2 && (
            <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16,1,0.3,1] }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">Suivi Chantiers</p>
                <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 text-[#0F766E] text-[11px] font-medium border border-teal-100">
                  <Check className="w-3 h-3" strokeWidth={2.5} /> Prêt en 83s
                </motion.span>
              </div>
              <div className="divide-y divide-[#F1EEE6]">
                <div className="grid grid-cols-4 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                  <span className="col-span-2">Chantier</span><span>Avancement</span><span className="text-right">Facturé</span>
                </div>
                {[
                  { name: "Villa Dumont", pct: 78, val: "24 500 €" },
                  { name: "Résidence des Prés", pct: 100, val: "67 200 €", done: true },
                  { name: "École Bellevue", pct: 32, val: "12 000 €" },
                  { name: "Entrepôt Z.I. Nord", pct: 55, val: "38 700 €" },
                ].map((r, j) => (
                  <motion.div key={r.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + j * 0.07, duration: 0.4, ease: [0.16,1,0.3,1] }}
                    className="grid grid-cols-4 items-center gap-3 py-2.5">
                    <span className="col-span-2 text-[13px] text-[#111827] font-medium truncate">{r.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[#F1EEE6] rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${r.pct}%` }}
                          transition={{ duration: 1, ease: [0.16,1,0.3,1], delay: 0.3 + j * 0.08 }}
                          className={`h-full rounded-full ${r.done ? "bg-emerald-500" : "bg-[#14B8A6]"}`} />
                      </div>
                      <span className="text-[10px] text-[#9CA3AF] w-7 text-right tabular-nums">{r.pct}%</span>
                    </div>
                    <span className="text-[13px] text-[#111827] font-semibold text-right tabular-nums">{r.val}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-center gap-2 pb-4">
        {([0, 1, 2] as const).map((i) => (
          <motion.div key={i} animate={{ width: phase === i ? 20 : 5, opacity: phase === i ? 1 : 0.3 }}
            transition={{ duration: 0.3, ease: [0.16,1,0.3,1] }} className="h-1 rounded-full bg-[#14B8A6]" />
        ))}
      </div>
    </div>
  );
}

const PLACEHOLDERS = [
  "Un tableau de mes chantiers avec l'avancement et les factures…",
  "Un suivi de mes sous-traitants avec alertes QUALIBAT…",
  "Un planning de mes équipes par chantier et par semaine…",
  "Une fiche de pointage des heures par chantier et par ouvrier…",
];
const CHIPS = [
  { label: "Fiche Chantier", prompt: "Je veux une fiche de suivi de mes chantiers avec le nom du client, l'adresse, l'état d'avancement en %, le montant HT, les factures émises et ce qui reste à encaisser." },
  { label: "Devis BTP", prompt: "Je veux un outil de création de devis BTP avec désignation, quantité, unité, prix unitaire, calcul automatique du total HT et TTC avec TVA 10%." },
  { label: "Sous-traitants", prompt: "Je veux un tableau de suivi de mes sous-traitants avec SIRET, QUALIBAT, attestation URSSAF, date d'expiration et une alerte 30 jours avant." },
  { label: "Pointage", prompt: "Je veux un tableau de pointage des heures de mes ouvriers par chantier avec date, heures normales, heures supp et un total par semaine." },
];

function HeroSection() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [phIndex, setPhIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  useEffect(() => {
    if (input) return;
    const id = setInterval(() => setPhIndex((i) => (i + 1) % PLACEHOLDERS.length), 3200);
    return () => clearInterval(id);
  }, [input]);
  const handleSubmit = () => {
    if (!input.trim()) return;
    sessionStorage.setItem("batify_prompt", input.trim());
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
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden pt-28 pb-20 px-5 sm:px-8 bg-[#F7F5EF]">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-teal-400/10 blur-[120px] animate-glow-pulse pointer-events-none" />
      <div className="relative z-10 max-w-3xl w-full mx-auto flex flex-col items-center text-center">
        <div className="animate-reveal-up">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 text-[#0F766E] text-[12px] font-medium border border-teal-100 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] animate-glow-pulse" />
            Accès bêta ouvert · Gratuit
          </span>
        </div>
        <div className="overflow-hidden mb-2">
          <h1 className="font-clash text-[52px] sm:text-[68px] md:text-[80px] font-bold text-[#0F172A] leading-[1.0] tracking-[-0.03em] animate-reveal-up delay-100">
            Votre logiciel BTP,
          </h1>
        </div>
        <div className="overflow-hidden mb-2">
          <h1 className="font-clash text-[52px] sm:text-[68px] md:text-[80px] font-bold text-[#0F172A] leading-[1.0] tracking-[-0.03em] animate-reveal-up delay-200">
            conçu sur mesure.
          </h1>
        </div>
        <div className="overflow-hidden mb-7">
          <h1 className="font-clash text-[52px] sm:text-[68px] md:text-[80px] font-bold leading-[1.0] tracking-[-0.03em] animate-reveal-up delay-300">
            <span className="bg-gradient-to-r from-[#14B8A6] to-[#0D9488] bg-clip-text text-transparent animate-gradient-x">
              En 90 secondes.
            </span>
          </h1>
        </div>
        <p className="text-[18px] sm:text-[20px] text-[#4B5563] max-w-[540px] leading-[1.65] mb-10 animate-reveal-up delay-400">
          Décrivez ce dont vous avez besoin — en français, avec votre jargon BTP.
          Batify génère et déploie votre application, accessible depuis le chantier.
        </p>
        <div className="w-full max-w-2xl animate-reveal-up delay-500">
          <div className="rounded-2xl border border-[#E7E2D7] bg-white shadow-depth-2 overflow-hidden focus-within:border-[#14B8A6] focus-within:shadow-[0_0_0_3px_rgba(20,184,166,0.1),0_4px_20px_rgba(115,100,70,0.08)] transition-all duration-300">
            <div className="relative px-5 pt-5 pb-3 min-h-[88px] text-left">
              {!input && (
                <AnimatePresence mode="wait">
                  <motion.span key={phIndex} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
                    className="absolute top-5 left-5 right-5 text-[15px] text-[#9CA3AF] pointer-events-none select-none leading-relaxed">
                    {PLACEHOLDERS[phIndex]}
                  </motion.span>
                </AnimatePresence>
              )}
              <textarea ref={textareaRef} value={input}
                onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                rows={3} className="relative z-10 w-full bg-transparent text-[#111827] text-[15px] leading-relaxed resize-none focus:outline-none min-h-[76px]"
                style={{ caretColor: "#14B8A6" }} />
            </div>
            <div className="flex items-center justify-between px-4 pb-4 border-t border-[#F1EEE6] pt-3 gap-3">
              <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
                <button onClick={toggleVoice}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 ${isListening ? "bg-rose-50 text-rose-600 border border-rose-200" : "text-[#6B7280] hover:text-[#111827] hover:bg-[#F1EEE6] border border-transparent"}`}>
                  {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isListening ? "Écoute…" : "Voix"}</span>
                </button>
                <div className="w-px h-4 bg-[#E7E2D7] mx-1 flex-shrink-0" />
                {CHIPS.map((chip) => (
                  <button key={chip.label} onClick={() => { setInput(chip.prompt); textareaRef.current?.focus(); }}
                    className="flex-shrink-0 text-[12px] text-[#6B7280] hover:text-[#111827] px-2.5 py-1.5 rounded-full hover:bg-[#F1EEE6] transition-all duration-200 whitespace-nowrap">
                    {chip.label}
                  </button>
                ))}
              </div>
              <button onClick={handleSubmit} disabled={!input.trim()}
                className="flex-shrink-0 bg-[#0F172A] text-white font-semibold text-[13px] px-5 py-2 rounded-xl hover:bg-[#1E293B] active:scale-[0.98] transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.15),0_4px_12px_rgba(15,23,42,0.2)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-1.5 whitespace-nowrap">
                Générer <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p className="text-center text-[12px] text-[#9CA3AF] mt-3">Entrée pour générer · Aucune carte bancaire requise</p>
        </div>
        <div className="mt-14 flex flex-col items-center gap-3 animate-reveal-up delay-600">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">Exemple en direct</p>
          <svg className="w-4 h-4 text-[#9CA3AF]" fill="none" viewBox="0 0 16 16">
            <path d="M8 2v12M3 9l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div className="relative z-10 w-full max-w-xl mx-auto mt-8 animate-reveal-scale delay-600">
        <GenerationDemo />
      </div>
    </section>
  );
}

function PainSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const pains = [
    { severity: "critical", icon: <FileText className="w-4 h-4" />, title: "Un fichier Excel géré par une seule personne", body: "Quand cette personne n'est pas là, tout est bloqué. Une formule cassée, une feuille mal partagée — et votre chantier tourne à l'aveugle." },
    { severity: "warning", icon: <Wrench className="w-4 h-4" />, title: "Des ERP conçus pour les comptables", body: "Batigest, EBP : trop complexes, trop chers, trop longs à former. En pratique, personne ne les utilise vraiment sur le terrain." },
    { severity: "critical", icon: <Clock className="w-4 h-4" />, title: "2 à 3 heures par jour perdues en administration", body: "Saisie, relances, paperasse. Du temps que vous ne pouvez pas facturer — et qui s'accumule semaine après semaine." },
  ];
  return (
    <section className="py-28 px-5 sm:px-8 bg-white border-y border-[#E7E2D7]">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-4">Le problème</p>
          <h2 className="font-clash text-[40px] sm:text-[52px] font-bold text-[#0F172A] tracking-tight leading-[1.05] mb-14">
            Vos outils actuels ne sont pas faits pour le terrain.
          </h2>
        </Reveal>
        <motion.div ref={ref} variants={containerV} initial="hidden" animate={inView ? "show" : "hidden"} className="grid sm:grid-cols-3 gap-4 mb-4">
          {pains.map((p) => (
            <motion.div key={p.title} variants={itemV}
              className={`rounded-2xl bg-white border border-[#E7E2D7] shadow-depth-1 overflow-hidden card-hover ${p.severity === "critical" ? "border-l-4 border-l-rose-400" : "border-l-4 border-l-amber-400"}`}>
              <div className="px-5 py-3 border-b border-[#F1EEE6] flex items-center gap-2.5">
                <span className={p.severity === "critical" ? "text-rose-500" : "text-amber-500"}>{p.icon}</span>
                <h3 className="text-[13px] font-semibold text-[#111827] leading-snug">{p.title}</h3>
              </div>
              <div className="px-5 py-4"><p className="text-[13px] text-[#6B7280] leading-relaxed">{p.body}</p></div>
            </motion.div>
          ))}
        </motion.div>
        <Reveal delay={0.25}>
          <div className="flex items-start gap-4 rounded-2xl border border-[#E7E2D7] border-l-4 border-l-emerald-500 bg-white shadow-depth-1 px-5 py-5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Zap className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-[#111827] text-[14px] mb-1.5">Batify résout les trois à la fois.</p>
              <p className="text-[13px] text-[#6B7280] leading-relaxed">Vous décrivez ce dont vous avez besoin — en français, avec votre jargon BTP. L'application est générée, déployée et accessible à toute votre équipe en moins de 90 secondes.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const steps = [
    { n: "01", icon: <Mic className="w-5 h-5" />, title: "Décrivez", body: "En quelques phrases, en français, avec votre jargon BTP. Batify comprend exactement ce que vous voulez — DPGF, DOE, lot TCE, QUALIBAT." },
    { n: "02", icon: <Zap className="w-5 h-5" />, title: "Batify construit", body: "Votre application est générée et déployée en moins de 90 secondes. Vous la voyez apparaître composant par composant, en direct." },
    { n: "03", icon: <ArrowRight className="w-5 h-5" />, title: "Vous utilisez", body: "Un lien accessible depuis n'importe quel téléphone. Vos équipes l'utilisent sur le chantier dès le soir même, sans installation." },
  ];
  return (
    <section id="comment-ca-marche" className="py-28 px-5 sm:px-8 bg-[#F7F5EF]">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-16">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-4">Comment ça marche</p>
          <h2 className="font-clash text-[40px] sm:text-[52px] font-bold text-[#0F172A] tracking-tight">Simple comme une conversation.</h2>
        </Reveal>
        <motion.div ref={ref} variants={containerV} initial="hidden" animate={inView ? "show" : "hidden"} className="grid md:grid-cols-3 gap-4">
          {steps.map((step) => (
            <motion.div key={step.title} variants={itemV}
              className="relative rounded-2xl bg-white border border-[#E7E2D7] shadow-depth-1 overflow-hidden card-hover">
              <div className="absolute top-4 right-5 font-clash text-[72px] font-bold text-[#F1EEE6] leading-none select-none">{step.n}</div>
              <div className="px-5 py-3 border-b border-[#F1EEE6] flex items-center gap-2.5">
                <span className="text-[#0D9488]">{step.icon}</span>
                <h3 className="text-[14px] font-semibold text-[#111827]">{step.title}</h3>
              </div>
              <div className="px-5 py-4"><p className="text-[13px] text-[#6B7280] leading-relaxed">{step.body}</p></div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function ShowcaseSection() {
  return (
    <section id="exemples" className="py-28 px-5 sm:px-8 bg-white border-y border-[#E7E2D7]">
      <div className="max-w-6xl mx-auto">
        <Reveal className="mb-14">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-4">Ce que vous pouvez créer</p>
          <h2 className="font-clash text-[40px] sm:text-[52px] font-bold text-[#0F172A] tracking-tight mb-3">Des applications prêtes à l'emploi.</h2>
          <p className="text-[16px] text-[#6B7280] max-w-md leading-relaxed">Générées en 90 secondes, hébergées et adaptées à votre façon de travailler.</p>
        </Reveal>
        <div className="flex flex-col lg:flex-row gap-4">
          <Reveal className="lg:flex-[7] min-w-0">
            <div className="rounded-3xl bg-white border border-[#E7E2D7] shadow-depth-2 overflow-hidden h-full card-hover">
              <div className="flex items-center gap-1.5 px-5 py-3.5 border-b border-[#F1EEE6] bg-[#F7F5EF]">
                {["#FECACA","#FDE68A","#A7F3D0"].map((c,i) => <div key={i} className="w-2.5 h-2.5 rounded-full" style={{background:c}} />)}
                <span className="text-[10px] text-[#9CA3AF] ml-2">batify.fr/app/suivi-chantiers</span>
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-1">Suivi Chantiers</p>
                    <p className="text-[#6B7280] text-[12px]">4 chantiers actifs</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[#9CA3AF] mb-0.5">Total facturé</p>
                    <p className="font-clash text-2xl font-bold text-[#0F172A] tabular-nums">142 400 €</p>
                  </div>
                </div>
                <div className="divide-y divide-[#F1EEE6]">
                  <div className="grid grid-cols-4 pb-2.5 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                    <span className="col-span-2">Chantier</span><span>Avancement</span><span className="text-right">Facturé</span>
                  </div>
                  {[
                    { name: "Villa Dumont — Maçonnerie", pct: 78, val: "24 500 €" },
                    { name: "Résidence des Prés", pct: 100, val: "67 200 €", done: true },
                    { name: "École Bellevue — Gros œuvre", pct: 32, val: "12 000 €" },
                    { name: "Entrepôt Z.I. Nord", pct: 55, val: "38 700 €" },
                  ].map((row, j) => (
                    <div key={row.name} className="grid grid-cols-4 items-center gap-3 py-2.5">
                      <span className="col-span-2 text-[13px] text-[#111827] font-medium truncate">{row.name}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex-1 h-1.5 bg-[#F1EEE6] rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} whileInView={{ width: `${row.pct}%` }} viewport={{ once: true }}
                            transition={{ duration: 1, ease: [0.16,1,0.3,1], delay: 0.2 + j * 0.1 }}
                            className={`h-full rounded-full ${row.done ? "bg-emerald-500" : "bg-[#14B8A6]"}`} />
                        </div>
                        <span className="text-[10px] text-[#9CA3AF] w-7 text-right tabular-nums flex-shrink-0">{row.pct}%</span>
                      </div>
                      <span className="text-[13px] text-[#111827] font-semibold text-right tabular-nums">{row.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
          <div className="lg:flex-[5] flex flex-col gap-4 min-w-0">
            <Reveal delay={0.1} className="flex-1">
              <div className="rounded-3xl bg-white border border-[#E7E2D7] shadow-depth-1 overflow-hidden h-full card-hover">
                <div className="px-5 py-3 border-b border-[#F1EEE6] flex items-center gap-2.5">
                  <Users className="w-3.5 h-3.5 text-[#0D9488]" />
                  <h2 className="text-[14px] font-semibold text-[#111827]">Sous-traitants</h2>
                </div>
                <div className="px-5 py-4 space-y-2">
                  {[
                    { name: "Élec Martin SARL", status: "Valide", detail: "QUALIBAT N4113", ok: true },
                    { name: "Plomberie Roux", status: "Expire dans 12j", detail: "URSSAF", ok: false },
                    { name: "Maçonnerie BTP35", status: "Valide", detail: "QUALIBAT N1111", ok: true },
                  ].map((b) => (
                    <div key={b.name} className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-[12px] ${b.ok ? "bg-emerald-50 border border-emerald-100" : "bg-amber-50 border border-amber-100"}`}>
                      <div>
                        <p className="font-medium text-[#111827]">{b.name}</p>
                        <p className="text-[#9CA3AF] text-[10px]">{b.detail}</p>
                      </div>
                      <span className={`text-[11px] font-medium ${b.ok ? "text-emerald-700" : "text-amber-700"}`}>{b.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.18} className="flex-1">
              <div className="rounded-3xl bg-white border border-[#E7E2D7] shadow-depth-1 overflow-hidden h-full card-hover">
                <div className="px-5 py-3 border-b border-[#F1EEE6] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-3.5 h-3.5 text-[#0D9488]" />
                    <h2 className="text-[14px] font-semibold text-[#111827]">Devis BTP</h2>
                  </div>
                  <span className="font-clash text-xl font-bold text-[#0F172A] tabular-nums">14 835 €</span>
                </div>
                <div className="px-5 py-4 space-y-2.5">
                  {[
                    { ref: "A1", desc: "Terrassement m²", total: "2 160 €" },
                    { ref: "A2", desc: "Béton fondations m³", total: "4 275 €" },
                    { ref: "B1", desc: "Maçonnerie briques", total: "8 400 €" },
                  ].map((l) => (
                    <div key={l.ref} className="flex items-center gap-3 text-[13px]">
                      <span className="text-[#9CA3AF] w-5 flex-shrink-0 text-[11px] font-bold">{l.ref}</span>
                      <span className="flex-1 text-[#6B7280] truncate">{l.desc}</span>
                      <span className="text-[#111827] font-semibold tabular-nums">{l.total}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-[#F1EEE6]">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">Total HT</span>
                    <span className="text-[14px] font-bold text-[#111827] tabular-nums">14 835 €</span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
        <Reveal delay={0.3} className="mt-5">
          <div className="flex flex-wrap gap-2">
            {[
              { icon: <HardHat className="w-3.5 h-3.5" />, label: "Fiche chantier" },
              { icon: <Calendar className="w-3.5 h-3.5" />, label: "Planning" },
              { icon: <Clock className="w-3.5 h-3.5" />, label: "Pointage heures" },
              { icon: <Package className="w-3.5 h-3.5" />, label: "Stock matériaux" },
              { icon: <Building2 className="w-3.5 h-3.5" />, label: "DOE automatisé" },
              { icon: <Shield className="w-3.5 h-3.5" />, label: "Carnet SAV" },
              { icon: <BarChart3 className="w-3.5 h-3.5" />, label: "Rapport mensuel" },
              { icon: <AlertCircle className="w-3.5 h-3.5" />, label: "Et tout ce que vous décrivez →" },
            ].map((t) => (
              <span key={t.label} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#E7E2D7] bg-[#F7F5EF] text-[12px] text-[#6B7280] hover:text-[#111827] hover:border-[#14B8A6] hover:bg-teal-50 transition-all duration-200 cursor-default">
                <span className="text-[#0D9488]">{t.icon}</span>{t.label}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PricingSection() {
  const plans = [
    { name: "Artisan", price: "29", desc: "Indépendant · Auto-entrepreneur", credits: "50 crédits / mois", features: ["1 utilisateur", "Apps mobile + desktop", "8 templates BTP inclus", "Génération voix + texte", "Hébergement inclus", "Support email"], highlight: false },
    { name: "PME", price: "89", desc: "5 à 20 salariés", credits: "200 crédits / mois", badge: "Recommandé", features: ["5 utilisateurs", "Tout Artisan inclus", "Suivi QUALIBAT + URSSAF", "Alertes expiration auto", "Lien public à votre nom", "Support prioritaire"], highlight: true },
    { name: "Pro", price: "249", desc: "20 à 100 salariés", credits: "600 crédits / mois", features: ["Utilisateurs illimités", "Tout PME inclus", "Chorus Pro", "EBP / Batigest", "Mode hors-ligne", "Support dédié"], highlight: false },
  ];
  return (
    <section id="tarifs" className="py-28 px-5 sm:px-8 bg-[#F7F5EF]">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-14">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-4">Tarifs</p>
          <h2 className="font-clash text-[40px] sm:text-[52px] font-bold text-[#0F172A] tracking-tight mb-3">Un prix. Pas de mauvaise surprise.</h2>
          <p className="text-[16px] text-[#6B7280]">Vous payez les générations, pas les saisies.</p>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-4 items-start">
          {plans.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.1}>
              <div className={`relative rounded-3xl overflow-hidden card-hover ${plan.highlight ? "bg-[#0F172A] border border-[#0F172A] shadow-depth-3 md:-mt-3 md:mb-3" : "bg-white border border-[#E7E2D7] shadow-depth-1"}`}>
                {plan.badge && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#14B8A6] text-white text-[11px] font-bold rounded-full whitespace-nowrap">{plan.badge}</div>}
                <div className="px-6 py-7">
                  <p className={`font-display font-bold text-lg tracking-tight mb-0.5 ${plan.highlight ? "text-white" : "text-[#111827]"}`}>{plan.name}</p>
                  <p className={`text-[13px] mb-6 ${plan.highlight ? "text-white/50" : "text-[#6B7280]"}`}>{plan.desc}</p>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className={`font-clash text-5xl font-bold tabular-nums tracking-tight ${plan.highlight ? "text-white" : "text-[#0F172A]"}`}>{plan.price}€</span>
                    <span className={`text-[13px] ${plan.highlight ? "text-white/40" : "text-[#9CA3AF]"}`}>/mois</span>
                  </div>
                  <p className={`text-[12px] mb-7 ${plan.highlight ? "text-teal-400" : "text-[#14B8A6]"}`}>{plan.credits}</p>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-[13px]">
                        <Check className={`w-3.5 h-3.5 flex-shrink-0 ${plan.highlight ? "text-teal-400" : "text-emerald-500"}`} strokeWidth={2.5} />
                        <span className={plan.highlight ? "text-white/70" : "text-[#4B5563]"}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="/signup" className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-semibold transition-all duration-200 active:scale-[0.98] ${plan.highlight ? "bg-[#14B8A6] text-white hover:bg-[#0D9488] shadow-[0_2px_12px_rgba(20,184,166,0.35)]" : "bg-[#0F172A] text-white hover:bg-[#1E293B] shadow-[0_1px_2px_rgba(0,0,0,0.15),0_4px_12px_rgba(15,23,42,0.18)]"}`}>
                    Commencer <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.3}><p className="text-center text-[12px] text-[#9CA3AF] mt-6">Sans engagement · Sans carte bancaire · Crédits reportés 2 mois</p></Reveal>
      </div>
    </section>
  );
}

function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const faqs = [
    { q: "Ai-je besoin de savoir coder ?", a: "Non. Si vous savez expliquer ce que vous voulez à un collègue, vous savez utiliser Batify. Vous décrivez, l'application apparaît." },
    { q: "Comment fonctionnent les crédits ?", a: "Chaque génération consomme 2 crédits. Les modifications consomment 1 crédit. La saisie de données dans une app existante est toujours gratuite. Les crédits non utilisés sont reportés sur 2 mois." },
    { q: "Où sont hébergées mes applications ?", a: "Chaque app est mise en ligne automatiquement à une adresse à son nom, accessible partout depuis un simple lien — sur le chantier, au bureau, par vos équipes." },
    { q: "Mes données sont-elles en sécurité ?", a: "Oui. Toutes les données sont hébergées en France. Chaque application est isolée. Vos données ne sont jamais utilisées pour entraîner des modèles d'IA." },
    { q: "Compatible avec Batigest ou EBP ?", a: "Les connecteurs EBP et Batigest arrivent sur le plan Pro. En attendant, toutes les apps exportent en CSV et Excel." },
  ];
  return (
    <section className="py-28 px-5 sm:px-8 bg-white border-t border-[#E7E2D7]">
      <div className="max-w-2xl mx-auto">
        <Reveal className="text-center mb-12">
          <h2 className="font-clash text-[40px] sm:text-[48px] font-bold text-[#0F172A] tracking-tight">Vos questions.</h2>
        </Reveal>
        <div className="space-y-2">
          {faqs.map(({ q, a }, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <div className="rounded-2xl border border-[#E7E2D7] bg-white shadow-depth-1 overflow-hidden">
                <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#F7F5EF] transition-colors duration-200">
                  <span className="font-semibold text-[#111827] text-[14px] pr-4">{q}</span>
                  <motion.div animate={{ rotate: openIdx === i ? 180 : 0 }} transition={{ duration: 0.3, ease: [0.16,1,0.3,1] }}>
                    <ChevronDown className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {openIdx === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16,1,0.3,1] }} className="overflow-hidden">
                      <p className="px-5 pb-5 text-[13px] text-[#6B7280] leading-relaxed">{a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  const router = useRouter();
  const [input, setInput] = useState("");
  return (
    <section className="py-28 px-5 sm:px-8 bg-[#F7F5EF]">
      <div className="max-w-4xl mx-auto">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-[#0F172A] px-8 py-24 sm:px-16 text-center shadow-depth-3">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-teal-500/10 blur-[80px] animate-glow-pulse pointer-events-none" />
            <div className="relative">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-400 mb-5">Commençons</p>
              <h2 className="font-clash text-[40px] sm:text-[52px] font-bold text-white tracking-tight mb-4">Votre premier outil en 90 secondes.</h2>
              <p className="text-white/50 mb-10 max-w-md mx-auto text-[16px] leading-relaxed">Aucune carte bancaire. Décrivez ce que vous voulez, l'application est prête.</p>
              <div className="flex flex-col sm:flex-row gap-2 max-w-lg mx-auto">
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) { sessionStorage.setItem("batify_prompt", input.trim()); router.push("/signup?from=prompt"); } }}
                  placeholder="Je veux un suivi de mes chantiers avec…"
                  className="flex-1 px-4 py-3 rounded-xl bg-white/8 border border-white/10 text-white placeholder-white/25 text-[14px] focus:outline-none focus:border-teal-400/50 transition-colors duration-200" />
                <button onClick={() => { if (input.trim()) { sessionStorage.setItem("batify_prompt", input.trim()); router.push("/signup?from=prompt"); } }}
                  className="bg-[#14B8A6] text-white font-semibold text-[14px] px-6 py-3 rounded-xl hover:bg-[#0D9488] active:scale-[0.98] transition-all duration-200 whitespace-nowrap shadow-[0_2px_12px_rgba(20,184,166,0.4)] flex items-center justify-center gap-1.5">
                  Générer mon outil <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#E7E2D7] bg-white py-8 px-5 sm:px-8">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#0F172A] flex items-center justify-center">
            <span className="font-display text-white font-bold text-[11px] leading-none">B</span>
          </div>
          <span className="font-display font-semibold text-[#0F172A]">Batify</span>
          <span className="text-[#9CA3AF] text-[13px] ml-1">© 2025</span>
        </div>
        <div className="flex items-center gap-6">
          {[["CGU","#"],["Confidentialité","#"],["Contact","#"]].map(([l,href]) => (
            <a key={l} href={href} className="text-[13px] text-[#9CA3AF] hover:text-[#111827] transition-colors duration-200">{l}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <main className="bg-[#F7F5EF] min-h-screen overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <PainSection />
      <HowItWorksSection />
      <ShowcaseSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </main>
  );
}
