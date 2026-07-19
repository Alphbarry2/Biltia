"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, Mic, MicOff, Check,
  Zap, LayoutGrid, MessageCircle, Bot,
  Users, Building2, HardHat, FolderKanban, FileText,
  Wallet, CalendarClock, ShieldCheck,
} from "lucide-react";
import { BRAND_JSONLD } from "@/lib/brand-entity";
import {
  useTypewriter, Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter, TemplateCarousel,
} from "@/components/site";
import { useT, useLocale } from "@/lib/i18n/context";

// ── Héros ────────────────────────────────────────────────────────────────────

const PLACEHOLDERS_FR = [
  "Relance automatiquement mes devis sans réponse…",
  "Prépare l'avenant du chantier Dupont…",
  "Quels chantiers nécessitent mon attention aujourd'hui ?",
  "Crée un suivi simple de mes interventions…",
  "Surveille mes factures impayées chaque semaine…",
];
const PLACEHOLDERS_EN = [
  "Automatically chase my unanswered quotes…",
  "Prepare the change order for the Dupont job…",
  "Which job sites need my attention today?",
  "Create a simple tracker for my site visits…",
  "Watch my unpaid invoices every week…",
];

function HeroSection() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const typed = useTypewriter(locale === "en" ? PLACEHOLDERS_EN : PLACEHOLDERS_FR);
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
    if (!SR) { alert(t("Utilisez Chrome pour la reconnaissance vocale.", "Use Chrome for voice recognition.")); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const r = new SR();
    r.lang = locale === "en" ? "en-US" : "fr-FR"; r.continuous = false; r.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => setInput((p) => (p ? p + " " : "") + e.results[0][0].transcript);
    r.onend = () => setIsListening(false);
    r.onerror = () => setIsListening(false);
    r.start(); recognitionRef.current = r; setIsListening(true);
  };

  const reassure = [
    t("Aucune carte bancaire", "No credit card"),
    t("Vous validez les actions sensibles", "You approve sensitive actions"),
    t("Vous voyez tout ce qui est fait", "You see everything that's done"),
  ];

  return (
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden px-5 sm:px-8 pt-28 pb-20">
      <InteractiveMesh strong />
      <div className="relative z-10 max-w-3xl w-full mx-auto flex flex-col items-center text-center">
        <span className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-[#4A4A56] mb-8 animate-reveal-up">
          <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500" />
          {t("Pour les artisans et entreprises du bâtiment", "For construction trades and companies")}
        </span>
        <h1 className="animate-reveal-up delay-100 mb-8">
          <span className="block font-black text-[#0A0A0A] text-[38px] sm:text-[56px] md:text-[66px] leading-[0.98] tracking-[-0.04em]">{t("Vous êtes sur le chantier.", "You're on site.")}</span>
          <span className="block font-black text-gradient animate-gradient-x text-[38px] sm:text-[56px] md:text-[66px] leading-[0.98] tracking-[-0.04em] pb-2">{t("Biltia s'occupe du reste.", "Biltia handles the rest.")}</span>
        </h1>
        <p className="text-[17px] sm:text-[19px] text-[#5B5B66] max-w-[500px] leading-[1.6] mb-12 animate-reveal-up delay-200">
          {t(
            "Décrivez ce qui doit être fait. Biltia utilise les données de votre entreprise, réalise le travail et vous rend compte.",
            "Describe what needs doing. Biltia uses your company's data, does the work, and reports back to you."
          )}
        </p>

        {/* Barre de demande — l'action principale */}
        <div className="w-full max-w-2xl animate-reveal-up delay-300">
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
                style={{ caretColor: "#7C3AED" }} aria-label={t("Que voulez-vous confier à Biltia ?", "What do you want to hand over to Biltia?")} />
            </div>
            <div className="flex items-center justify-between gap-3 px-2 pb-1">
              <button onClick={toggleVoice} aria-label={t("Dicter", "Dictate")}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors ${isListening ? "bg-rose-100 text-rose-600" : "bg-black/[0.04] border border-black/[0.06] text-[#4A4A56] hover:bg-black/[0.07]"}`}>
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isListening ? t("Écoute…", "Listening…") : t("Voix", "Voice")}
              </button>
              <button onClick={handleSubmit} disabled={!input.trim()} aria-label={t("Confier à Biltia", "Hand over to Biltia")}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_6px_20px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_28px_rgba(139,92,246,0.55)] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none">
                <ArrowUpRight className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
          </div>
        </div>

        {/* Réassurance : une seule ligne discrète */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-8 animate-reveal-up delay-500">
          {reassure.map((r) => (
            <span key={r} className="inline-flex items-center gap-1.5 text-[12.5px] text-[#8B8B96]">
              <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" strokeWidth={2.5} /> {r}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section 2 : chat animé (demande → résultat → switch) ─────────────────────

function AgentActionResult() {
  const t = useT();
  const steps = [
    t("Chantier Dupont déplacé au 24 juin", "Dupont job moved to June 24"),
    t("3 tâches replanifiées automatiquement", "3 tasks automatically rescheduled"),
    t("SMS envoyé à l'équipe · 4 personnes", "Text sent to the crew · 4 people"),
  ];
  return (
    <div className="w-full max-w-md rounded-2xl border border-[#ECECEA] bg-white p-5 shadow-[0_10px_30px_rgba(60,40,120,0.08)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
          <div>
            <p className="text-[13px] font-semibold text-[#0F172A] leading-tight">{t("Agent · Décalage de chantier", "Agent · Job reschedule")}</p>
            <p className="text-[11px] text-[#9CA3AF]">{t("exécuté à l'instant", "just now")}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold border border-emerald-100"><Check className="w-2.5 h-2.5" strokeWidth={3} /> {t("Terminé", "Done")}</span>
      </div>
      <div className="space-y-2">
        {steps.map((s) => (
          <div key={s} className="flex items-center gap-2 rounded-lg bg-[#FAFAF9] border border-[#F1F1EC] px-3 py-2 text-[12.5px] text-[#0F172A]">
            <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" strokeWidth={2.5} /> {s}
          </div>
        ))}
      </div>
    </div>
  );
}
function DocumentResult() {
  const t = useT();
  return (
    <div className="w-full max-w-sm mx-auto rounded-xl bg-white border border-[#ECECEA] shadow-[0_16px_40px_rgba(60,40,120,0.12)] overflow-hidden text-left">
      <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500" />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[13px] font-bold text-[#0F172A]">Bâtiment Dumont</p>
            <p className="text-[10px] text-[#9CA3AF]">{t("Avenant au devis · AV-2026-014", "Change order · AV-2026-014")}</p>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-[#7C3AED] text-[10px] font-semibold border border-violet-100"><FileText className="w-2.5 h-2.5" /> PDF</span>
        </div>
        <p className="text-[10px] text-[#9CA3AF] mb-0.5">{t("Client", "Client")}</p>
        <p className="text-[12px] font-medium text-[#0F172A] mb-3">Villa Dumont — {t("carrelage grand format", "large-format tiling")}</p>
        <div className="rounded-lg border border-[#F1F1EC] overflow-hidden mb-3">
          <div className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-1.5 text-[10px] bg-[#FAFAF9] text-[#9CA3AF] font-medium"><span>{t("Désignation", "Description")}</span><span>{t("Total HT", "Total")}</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-2 text-[12px] text-[#0F172A]"><span>{t("Carrelage — 45 m² × 42 €", "Tiling — 45 sq m × €42")}</span><span className="tabular-nums font-medium">1 890 €</span></div>
        </div>
        <div className="space-y-1 text-[11.5px]">
          <div className="flex justify-between text-[#6B7280]"><span>{t("Total HT", "Subtotal")}</span><span className="tabular-nums">1 890 €</span></div>
          <div className="flex justify-between text-[#6B7280]"><span>{t("TVA 20 %", "VAT 20%")}</span><span className="tabular-nums">378 €</span></div>
          <div className="flex justify-between pt-1.5 border-t border-[#F1F1EC] font-bold text-[#0F172A]"><span>{t("Total TTC", "Total")}</span><span className="tabular-nums">2 268 €</span></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[t("L'entreprise", "The company"), t("Le client", "The client")].map((s) => (
            <div key={s} className="rounded-lg border border-dashed border-[#D8D8E0] px-2 py-2"><p className="text-[9px] text-[#9CA3AF]">{s}</p><p className="text-[10px] text-[#CBCBD6] italic mt-1">{t("Signature", "Signature")}</p></div>
          ))}
        </div>
      </div>
    </div>
  );
}
// Vraie application générée : on affiche un template LIVE (iframe /t/[id]) mis à
// l'échelle, dans un châssis « fenêtre ». L'iframe est monté une seule fois (il
// reste dans le DOM même quand la démo est sur une autre étape) → pas de rechargement
// à chaque tour de boucle.
function AppPreview({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
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
  const refW = 1240;
  const refH = 900;
  const scale = w ? w / refW : 0;
  return (
    <div className="w-full max-w-lg mx-auto rounded-xl border border-[#E2E2EA] bg-white overflow-hidden shadow-[0_16px_40px_rgba(60,40,120,0.12)]">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#F1F1F5] bg-[#FBFBFD]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-2 text-[10.5px] font-medium text-[#9A9AA6]">{t("Suivi SAV · généré par Biltia", "After-sales tracker · generated by Biltia")}</span>
      </div>
      <div ref={ref} className="relative w-full overflow-hidden" style={{ height: 260, background: "#FBFBFD" }}>
        {w > 0 && (
          <iframe
            src={locale === "en" ? `/t/${id}?lang=en` : `/t/${id}`}
            title={t("Suivi SAV", "After-sales tracker")}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
            className="absolute top-0 left-0 border-0 pointer-events-none select-none"
            style={{ width: refW, height: refH, transform: `scale(${scale})`, transformOrigin: "top left" }}
          />
        )}
      </div>
    </div>
  );
}

function LiveDemo() {
  const t = useT();
  const reduce = useReducedMotion();
  const router = useRouter();
  const demos = [
    { tag: t("Action", "Action"), done: t("L'agent a exécuté la mission", "The agent ran the task"), request: t("Décale le chantier Dupont de 3 jours et préviens l'équipe.", "Push the Dupont job back 3 days and tell the crew.") },
    { tag: t("Document", "Document"), done: t("Document généré, prêt à signer", "Document generated, ready to sign"), request: t("Prépare l'avenant pour 45 m² de carrelage en plus.", "Prepare the change order for 45 extra sq m of tiling.") },
    { tag: t("Application", "App"), done: t("Application créée et reliée à vos données", "App created and connected to your data"), request: t("Crée un suivi simple de mes interventions SAV.", "Create a simple tracker for my after-sales visits.") },
  ];
  const [idx, setIdx] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [phase, setPhase] = useState<"typing" | "result">("typing");

  useEffect(() => {
    const full = demos[idx].request;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setTypedText("");
    setPhase("typing");
    if (reduce) {
      setTypedText(full);
      setPhase("result");
      timers.push(setTimeout(() => { if (!cancelled) setIdx((k) => (k + 1) % demos.length); }, 3800));
    } else {
      let i = 0;
      const type = () => {
        if (cancelled) return;
        i += 1;
        setTypedText(full.slice(0, i));
        if (i < full.length) {
          timers.push(setTimeout(type, 34));
        } else {
          timers.push(setTimeout(() => { if (!cancelled) setPhase("result"); }, 400));
          timers.push(setTimeout(() => { if (!cancelled) setIdx((k) => (k + 1) % demos.length); }, 400 + 3600));
        }
      };
      timers.push(setTimeout(type, 450));
    }
    return () => { cancelled = true; timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, reduce]);

  // Envoyer depuis le chat → droit à la création de compte, avec la demande en cours.
  const goSignup = () => {
    sessionStorage.setItem("biltia_prompt", demos[idx].request);
    router.push("/signup?from=prompt");
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Onglets (cliquables pour sauter à une démo) */}
      <div className="flex flex-wrap justify-center gap-2 mb-6">
        {demos.map((d, k) => (
          <button key={d.tag} onClick={() => setIdx(k)} aria-pressed={idx === k}
            className={`px-3.5 py-2 rounded-full text-[12.5px] font-semibold border transition-all duration-200 ${idx === k ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white border-transparent shadow-[0_8px_22px_-8px_rgba(76,40,140,0.55)]" : "text-[#4A4A56] bg-white/70 border-[#ECECF2] hover:bg-white"}`}>
            {d.tag}
          </button>
        ))}
      </div>

      {/* La barre de chat (même design que le héros) : la demande s'écrit toute seule.
          Le bouton d'envoi redirige vers la création de compte. */}
      <div className="chatframe" style={{ borderRadius: 28 }}>
        <div className="chatcard bg-white rounded-[28px] p-2.5 border border-[#ECECF2] shadow-[0_18px_50px_rgba(60,40,120,0.10)] text-left">
          <div className="relative px-4 pt-4 pb-2 min-h-[64px] text-[15px] sm:text-[16px] leading-relaxed text-[#0A0A0A]">
            {typedText}
            {phase === "typing" && <span aria-hidden className="inline-block w-[2px] h-[1em] translate-y-[3px] bg-[#7C3AED]/80 ml-0.5 animate-blink" />}
          </div>
          <div className="flex items-center justify-end px-2 pb-1">
            <button onClick={goSignup} aria-label={t("Envoyer", "Send")}
              className="w-9 h-9 flex items-center justify-center rounded-full text-white bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 shadow-[0_6px_18px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_24px_rgba(139,92,246,0.55)] active:scale-95 transition-all">
              <ArrowUpRight className="w-[17px] h-[17px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Scène des résultats (hauteur fixe) : les 3 couches se fondent l'une dans
          l'autre. La couche « application » garde son iframe monté en permanence,
          il ne se recharge donc pas à chaque tour de boucle. */}
      <div className="relative mt-6 h-[400px]">
        {demos.map((d, k) => {
          const visible = idx === k && phase === "result";
          return (
            <div key={k} aria-hidden={!visible}
              className="absolute inset-0 flex flex-col items-center justify-start transition-opacity duration-500"
              style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}>
              <div className="mb-3 inline-flex items-center gap-2 text-[11px] text-[#9CA3AF]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {d.done}
              </div>
              {k === 0 ? <AgentActionResult /> : k === 1 ? <DocumentResult /> : <AppPreview id="sav_maintenance" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DemoSection() {
  const t = useT();
  return (
    <section id="demo" className="relative px-5 sm:px-8 py-28 sm:py-36 overflow-hidden">
      <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(60% 50% at 50% 50%, rgba(139,92,246,0.07), transparent 70%)" }} />
      <div className="max-w-2xl mx-auto text-center mb-12">
        <Reveal>
          <h2 className="text-[36px] sm:text-[54px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[0.98]">
            {t("D'une demande,", "From a request,")} <span className="text-gradient">{t("un résultat.", "a result.")}</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="text-[16px] sm:text-[18px] text-[#5B5B66] leading-relaxed mt-5 max-w-lg mx-auto">
            {t(
              "Décrivez ce que vous voulez. Biltia choisit comment faire et vous montre exactement ce qu'il a produit.",
              "Describe what you want. Biltia works out how, and shows you exactly what it produced."
            )}
          </p>
        </Reveal>
      </div>
      <Reveal delay={0.1}><LiveDemo /></Reveal>
    </section>
  );
}

// ── Section 3 : agents prêts à travailler ────────────────────────────────────

function AgentsSection() {
  const t = useT();
  const agents = [
    { Icon: Wallet, name: t("Agent Impayés", "Unpaid-invoices agent"), body: t("Surveille les factures échues, prépare les relances et vous signale les dossiers qui nécessitent votre attention.", "Watches overdue invoices, drafts the follow-ups, and flags the cases that need your attention.") },
    { Icon: Building2, name: t("Agent Suivi de chantier", "Job-site agent"), body: t("Détecte les retards, surveille l'avancement et prépare votre bilan de la semaine.", "Spots delays, tracks progress, and prepares your weekly recap.") },
    { Icon: CalendarClock, name: t("Agent Échéances", "Deadlines agent"), body: t("Surveille les assurances et documents et vous prévient avant leur expiration.", "Keeps an eye on insurance and documents and warns you before they expire.") },
  ];
  return (
    <section id="agents" className="relative px-5 sm:px-8 py-28 sm:py-36 overflow-hidden">
      <div className="mesh-blob absolute top-[10%] right-[-6%] w-[40vw] h-[40vw] max-w-[520px] rounded-full blur-[130px] pointer-events-none animate-drift-b" style={{ background: "radial-gradient(circle, rgba(34,211,238,0.16), transparent 68%)" }} />
      <div className="relative max-w-3xl mx-auto text-center mb-12">
        <Reveal>
          <h2 className="text-[34px] sm:text-[50px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[1.02]">
            {t("Certaines missions ne devraient même plus", "Some tasks shouldn't even need")} <span className="text-gradient">{t("avoir besoin d'être demandées.", "to be asked for anymore.")}</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="text-[16px] sm:text-[18px] text-[#5B5B66] leading-relaxed mt-5 max-w-xl mx-auto">
            {t("Activez un agent une seule fois. Il surveille votre activité, agit au bon moment et vous rend compte de chaque passage.", "Turn an agent on once. It watches your activity, acts at the right time, and reports back on every run.")}
          </p>
        </Reveal>
      </div>

      <div className="max-w-6xl mx-auto grid gap-4 md:grid-cols-3">
        {agents.map((a, k) => (
          <Reveal key={a.name} delay={k * 0.08}>
            <Spot className="glass glass-hover rounded-[26px] p-7 h-full">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white mb-5 bg-gradient-to-br from-violet-600 to-cyan-500">
                <a.Icon className="w-5 h-5" />
              </div>
              <h3 className="text-[18px] font-bold text-[#0A0A0A] mb-2 tracking-[-0.01em]">{a.name}</h3>
              <p className="text-[14px] text-[#5B5B66] leading-relaxed">{a.body}</p>
            </Spot>
          </Reveal>
        ))}
      </div>

      <div className="text-center mt-10">
        <Link href="/produits/agents" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0A0A0A] hover:gap-2.5 transition-all">
          {t("Découvrir les agents", "Explore agents")} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}

// ── Section 4 : les 3 piliers ────────────────────────────────────────────────

function SolutionsSection() {
  const t = useT();
  const pillars = [
    { Icon: Zap, title: t("Faire le travail", "Do the work"), body: t("Biltia recherche vos informations, met à jour vos données, prépare les communications et exécute vos missions.", "Biltia looks up your information, updates your data, prepares communications, and carries out your tasks."), tags: [t("Relances", "Follow-ups"), t("Planning", "Scheduling"), t("Suivi de chantier", "Job tracking"), t("Contrôles", "Checks")] },
    { Icon: LayoutGrid, title: t("Créer ce qu'il vous manque", "Create what you're missing"), body: t("Documents, rapports et applications métier adaptés à la manière dont votre entreprise travaille.", "Documents, reports, and business apps shaped around the way your company works."), tags: [t("Devis et avenants", "Quotes & change orders"), t("Rapports", "Reports"), t("Applications internes", "Internal apps"), t("Formulaires", "Forms")] },
    { Icon: MessageCircle, title: t("Répondre à partir de votre entreprise", "Answer from your business"), body: t("Posez une question sur vos clients, chantiers, factures ou documents. Biltia répond à partir de vos vraies données.", "Ask a question about your clients, job sites, invoices, or documents. Biltia answers from your real data."), tags: [t("Quels chantiers sont en retard ?", "Which jobs are behind?"), t("Combien ce client nous doit-il ?", "How much does this client owe?")] },
  ];
  return (
    <section id="solutions" className="relative px-5 sm:px-8 py-28 sm:py-36 overflow-hidden">
      <div className="mesh-blob absolute top-0 right-[-8%] w-[42vw] h-[42vw] max-w-[560px] rounded-full blur-[130px] pointer-events-none animate-drift-c" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.16), transparent 68%)" }} />
      <div className="relative max-w-2xl mx-auto text-center mb-12">
        <Reveal>
          <h2 className="text-[36px] sm:text-[54px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[0.98]">
            {t("Un seul endroit pour", "One place to")} <span className="text-gradient">{t("demander, créer et déléguer.", "ask, create, and delegate.")}</span>
          </h2>
        </Reveal>
      </div>

      <div className="relative max-w-6xl mx-auto grid gap-4 md:grid-cols-3">
        {pillars.map((p, k) => (
          <Reveal key={p.title} delay={k * 0.08}>
            <div className="glass rounded-[26px] p-7 h-full flex flex-col">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-6 bg-gradient-to-br from-indigo-500 to-violet-500">
                <p.Icon className="w-6 h-6" />
              </div>
              <h3 className="text-[19px] font-bold text-[#0A0A0A] mb-2 tracking-[-0.01em]">{p.title}</h3>
              <p className="text-[14px] text-[#5B5B66] leading-relaxed mb-5">{p.body}</p>
              <div className="mt-auto flex flex-wrap gap-1.5">
                {p.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/70 border border-white/60 text-[12px] text-[#4A4A56]">{tag}</span>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ── Section 5 : modèles d'applications ───────────────────────────────────────

function TemplatesSection() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const use = (tpl: { name: string }) => {
    const prompt = locale === "en"
      ? `I want ${tpl.name.toLowerCase()} for my company.`
      : `Je veux ${tpl.name.toLowerCase()} pour mon entreprise.`;
    sessionStorage.setItem("biltia_prompt", prompt);
    router.push("/signup?from=prompt");
  };
  return (
    <section id="templates" className="relative py-28 sm:py-36 overflow-hidden">
      <div className="mesh-blob absolute top-[8%] left-[-8%] w-[42vw] h-[42vw] max-w-[560px] rounded-full blur-[130px] pointer-events-none animate-drift-b" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.16), transparent 68%)" }} />
      <div className="relative max-w-6xl mx-auto px-5 sm:px-8">
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="text-[36px] sm:text-[54px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[0.98]">{t("Des applications", "Ready-made apps")} <span className="text-gradient">{t("prêtes à l'emploi.", "for your trade.")}</span></h2>
          <p className="text-[16px] text-[#5B5B66] mt-4 leading-relaxed">{t("Cliquez un modèle, Biltia l'adapte à votre entreprise.", "Click a template and Biltia tailors it to your company.")}</p>
        </Reveal>
      </div>
      <div className="relative max-w-[1500px] mx-auto px-3 sm:px-8">
        <TemplateCarousel onUse={use} />
      </div>
    </section>
  );
}

// ── Section 6 : la mémoire de l'entreprise ───────────────────────────────────

function MemorySection() {
  const t = useT();
  const entities = [
    { icon: <Users className="w-4 h-4" />, label: t("Clients", "Clients") },
    { icon: <Building2 className="w-4 h-4" />, label: t("Chantiers", "Job sites") },
    { icon: <FileText className="w-4 h-4" />, label: t("Devis", "Quotes") },
    { icon: <Wallet className="w-4 h-4" />, label: t("Factures", "Invoices") },
    { icon: <HardHat className="w-4 h-4" />, label: t("Équipes", "Teams") },
    { icon: <FolderKanban className="w-4 h-4" />, label: t("Documents", "Documents") },
  ];
  return (
    <section className="relative px-5 sm:px-8 py-28 sm:py-36 overflow-hidden">
      <div className="mesh-blob absolute bottom-0 left-[-6%] w-[40vw] h-[40vw] max-w-[520px] rounded-full blur-[130px] pointer-events-none animate-drift-a" style={{ background: "radial-gradient(circle, rgba(45,212,191,0.18), transparent 68%)" }} />
      <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <Reveal>
          <h2 className="text-[34px] sm:text-[50px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[1.02] mb-5">
            {t("Biltia ne repart pas de zéro", "Biltia doesn't start from scratch")} <span className="text-gradient">{t("à chaque demande.", "on every request.")}</span>
          </h2>
          <p className="text-[16px] text-[#5B5B66] leading-relaxed mb-5 max-w-md">
            {t(
              "Clients, chantiers, devis, factures, équipes, documents et applications sont reliés dans une même mémoire. Biltia connaît le contexte de votre entreprise, retrouve les bonnes informations et les réutilise dans chaque mission.",
              "Clients, job sites, quotes, invoices, teams, documents, and apps are linked in a single memory. Biltia knows your company's context, finds the right information, and reuses it on every task."
            )}
          </p>
          <p className="inline-flex items-start gap-2 text-[13.5px] text-[#4A4A56] leading-relaxed max-w-md">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" strokeWidth={2.2} />
            {t(
              "Vos données restent isolées dans votre entreprise. Vous gardez le contrôle sur les actions sensibles.",
              "Your data stays isolated within your company. You keep control over sensitive actions."
            )}
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="glass rounded-[26px] p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0A0A0A] flex items-center justify-center"><FolderKanban className="w-4 h-4 text-white" /></div>
                <div><p className="text-[13px] font-semibold text-[#0A0A0A] leading-tight">Bâtiment Dumont</p><p className="text-[11px] text-[#9A9AA6]">{t("Mémoire de l'entreprise", "Company memory")}</p></div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 text-[#4A4A56] text-[11px] font-medium border border-white/60"><span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 animate-glow-pulse" /> {t("vivant", "live")}</span>
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

// ── Section 7 : CTA final ────────────────────────────────────────────────────

function CTASection() {
  const t = useT();
  const router = useRouter();
  const [input, setInput] = useState("");
  const go = () => {
    const v = input.trim();
    if (v) sessionStorage.setItem("biltia_prompt", v);
    router.push("/signup?from=prompt");
  };
  return (
    <section className="relative px-5 sm:px-8 py-32 sm:py-44 overflow-hidden">
      <InteractiveMesh strong grid={false} />
      <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,0.55), transparent 75%)" }} />
      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <Reveal>
          <h2 className="text-[38px] sm:text-[64px] font-black text-[#0A0A0A] tracking-[-0.04em] leading-[0.98] mb-5">
            {t("Quelle mission voulez-vous", "Which task would you like to")} <span className="text-gradient">{t("ne plus avoir à gérer ?", "never handle again?")}</span>
          </h2>
          <p className="text-[16px] sm:text-[18px] text-[#5B5B66] mb-9">{t("Décrivez-la à Biltia.", "Describe it to Biltia.")}</p>
          <div className="glass glass-hover rounded-[26px] sm:rounded-full p-2 sm:p-1.5 flex flex-col sm:flex-row gap-2 max-w-lg mx-auto">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} placeholder={t("Je veux que Biltia…", "I want Biltia to…")} className="flex-1 bg-transparent px-5 py-3 text-[15px] text-[#0A0A0A] placeholder-[#9A9AA6] focus:outline-none" />
            <button onClick={go} className="w-full sm:w-auto bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white font-semibold text-[14px] px-6 py-3.5 sm:py-3 rounded-full whitespace-nowrap flex items-center justify-center gap-1.5 shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] transition-shadow">{t("Commencer gratuitement", "Start free")} <ArrowRight className="w-4 h-4" /></button>
          </div>
          <p className="text-[12px] text-[#9A9AA6] mt-4">{t("Aucune carte bancaire requise.", "No credit card required.")}</p>
        </Reveal>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="bg-[#FCFCFD] min-h-screen overflow-x-hidden text-[#0A0A0A]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BRAND_JSONLD) }}
      />
      <SiteNav />
      <HeroSection />
      <DemoSection />
      <AgentsSection />
      <SolutionsSection />
      <TemplatesSection />
      <MemorySection />
      <CTASection />
      <SiteFooter />
    </main>
  );
}
