"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Modale « Réserver une démo » : calendrier → heures → formulaire multi-étapes.
// Le SlotPicker est réutilisé sur la page de gestion (/demo/manage/[token]).
// Toutes les règles (créneaux, 48 h + 18 h) viennent de lib/demo-booking.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays, X, ChevronLeft, ChevronRight, Clock, ArrowRight, ArrowLeft,
  Check, Loader2, Building2, Globe, MessageSquare, User, Mail, Phone,
} from "lucide-react";
import {
  earliestBookableIso, isoOf, slotsForDate, tzLabel,
  headcountOptions, lookingForOptions, formatSlot, type Option,
} from "@/lib/demo-booking";
import { useT, useLocale } from "@/lib/i18n/context";

function monthLabel(y: number, m: number, locale: string): string {
  const s = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, 1)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Sélecteur de créneau (calendrier + heures) ────────────────────────────────
export function SlotPicker({
  date, time, onPick, minIso,
}: {
  date: string | null;
  time: string | null;
  onPick: (date: string, time: string | null) => void;
  minIso?: string; // date minimale réservable (défaut : règle 48 h + 18 h)
}) {
  const t = useT();
  const locale = useLocale();
  const WEEK_LABELS = t("L M M J V S D", "M T W T F S S").split(" ");
  const earliest = useMemo(() => minIso ?? earliestBookableIso(), [minIso]);
  const [view, setView] = useState(() => {
    const base = date ?? earliest;
    const [y, m] = base.split("-").map(Number);
    return { y, m };
  });

  const first = new Date(Date.UTC(view.y, view.m - 1, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  const atMinMonth = isoOf(view.y, view.m, 1) <= earliest && earliest <= isoOf(view.y, view.m, daysInMonth);
  const beforeMin = isoOf(view.y, view.m, daysInMonth) < earliest;

  const shift = (d: number) => {
    let { y, m } = view;
    m += d;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setView({ y, m });
  };

  const hours = date ? slotsForDate(date) : [];

  return (
    <div>
      {/* Calendrier */}
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#9A9AA6]">{t("1. Quel jour ?", "1. Which day?")}</p>
      <div className="rounded-2xl border border-[#ECECF2] bg-white p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shift(-1)}
            disabled={atMinMonth || beforeMin}
            aria-label={t("Mois précédent", "Previous month")}
            className="grid h-8 w-8 place-items-center rounded-lg text-[#5B5B66] transition-colors hover:bg-black/[0.05] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[14px] font-bold text-[#0A0A0A]">{monthLabel(view.y, view.m, locale)}</span>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label={t("Mois suivant", "Next month")}
            className="grid h-8 w-8 place-items-center rounded-lg text-[#5B5B66] transition-colors hover:bg-black/[0.05]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEK_LABELS.map((w, i) => (
            <div key={i} className="py-1 text-center text-[11px] font-semibold text-[#B4ADC4]">{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startWeekday }).map((_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const iso = isoOf(view.y, view.m, day);
            const disabled = iso < earliest;
            const selected = iso === date;
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => onPick(iso, iso === date ? time : null)}
                className={`aspect-square rounded-xl text-[13.5px] font-medium tabular-nums transition-all ${
                  selected
                    ? "bg-[#0A0A0A] text-white shadow-[0_6px_16px_rgba(10,10,10,0.28)]"
                    : disabled
                    ? "cursor-not-allowed text-[#D2D2DA]"
                    : "text-[#3A3A46] hover:bg-[#F3EFFC] hover:text-[#6D4AE0]"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Heures */}
      {date && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#9A9AA6]">
            {t("2. Quelle heure ?", "2. What time?")} <span className="font-medium normal-case tracking-normal text-[#B4ADC4]">({tzLabel(locale)})</span>
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {hours.map((h) => {
              const active = h === time;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => onPick(date, h)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[13.5px] font-semibold tabular-nums transition-all ${
                    active
                      ? "border-transparent bg-[#0A0A0A] text-white shadow-[0_6px_16px_rgba(10,10,10,0.25)]"
                      : "border-[#ECECF2] text-[#3A3A46] hover:border-[#C9BEF0] hover:bg-[#F6F4FB]"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 opacity-70" /> {h}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Champs du formulaire multi-étapes ─────────────────────────────────────────
type Fields = {
  company_name: string; website: string; headcount: string; looking_for: string;
  message: string; contact_name: string; contact_email: string; contact_phone: string;
};
const EMPTY: Fields = {
  company_name: "", website: "", headcount: "", looking_for: "",
  message: "", contact_name: "", contact_email: "", contact_phone: "",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function OptionGrid({ options, value, onChange }: { options: Option[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left text-[14px] font-medium transition-all ${
              active
                ? "border-[#7C3AED] bg-[#F5F2FD] text-[#0A0A0A] shadow-[0_6px_18px_rgba(124,58,190,0.14)]"
                : "border-[#ECECF2] text-[#3A3A46] hover:border-[#C9BEF0] hover:bg-[#F9F8FC]"
            }`}
          >
            {o.label}
            <span className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border ${active ? "border-transparent bg-gradient-to-br from-indigo-500 to-pink-500" : "border-[#D6D0E4]"}`}>
              {active && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TextField({ icon: Icon, ...props }: { icon: React.ElementType } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-[#ECECF2] bg-white px-4 py-3 focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-[#7C3AED]/20">
      <Icon className="h-4 w-4 flex-shrink-0 text-[#9A9AA6]" />
      <input {...props} className="w-full bg-transparent text-[14px] text-[#0A0A0A] outline-none placeholder:text-[#B4ADC4]" />
    </div>
  );
}

type StepDef = { key: string; title: string; subtitle: string };

// ── Modale complète ───────────────────────────────────────────────────────────
export default function DemoBookingModal({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const locale = useLocale();
  const STEPS: StepDef[] = [
    { key: "company", title: tr("Quelle est votre entreprise ?", "What's your company?"), subtitle: tr("Le nom de votre société.", "Your company name.") },
    { key: "website", title: tr("Votre site web ?", "Your website?"), subtitle: tr("Optionnel — pour mieux vous connaître.", "Optional — to get to know you better.") },
    { key: "headcount", title: tr("Vous êtes combien ?", "How many are you?"), subtitle: tr("L'effectif de votre entreprise.", "Your company's headcount.") },
    { key: "looking_for", title: tr("Que recherchez-vous ?", "What are you looking for?"), subtitle: tr("Ce qui vous amène chez Biltia.", "What brings you to Biltia.") },
    { key: "message", title: tr("Un mot sur votre besoin ?", "A word about your needs?"), subtitle: tr("Optionnel — quelques lignes suffisent.", "Optional — a few lines is enough.") },
    { key: "contact", title: tr("Vos coordonnées", "Your contact details"), subtitle: tr("Pour vous envoyer la confirmation.", "So we can send you the confirmation.") },
  ];
  const [phase, setPhase] = useState<"slot" | "form" | "sending" | "done" | "error">("slot");
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Fields>(EMPTY);
  const [errMsg, setErrMsg] = useState("");

  const set = (k: keyof Fields) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const stepValid = (i: number): boolean => {
    switch (STEPS[i].key) {
      case "company": return f.company_name.trim().length >= 2;
      case "headcount": return !!f.headcount;
      case "looking_for": return !!f.looking_for;
      case "contact": return f.contact_name.trim().length >= 2 && EMAIL_RE.test(f.contact_email.trim());
      default: return true; // website, message : optionnels
    }
  };

  const submit = async () => {
    setPhase("sending");
    setErrMsg("");
    try {
      const res = await fetch("/api/demo/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date, time,
          company_name: f.company_name.trim(),
          website: f.website.trim() || undefined,
          headcount: f.headcount || undefined,
          looking_for: f.looking_for || undefined,
          message: f.message.trim() || undefined,
          contact_name: f.contact_name.trim(),
          contact_email: f.contact_email.trim(),
          contact_phone: f.contact_phone.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrMsg(json.error || tr("Une erreur est survenue. Réessayez.", "Something went wrong. Please try again."));
        setPhase("error");
        return;
      }
      setPhase("done");
    } catch {
      setErrMsg(tr("Réseau indisponible. Réessayez.", "Network unavailable. Please try again."));
      setPhase("error");
    }
  };

  const canContinueSlot = !!date && !!time;
  const isLast = step === STEPS.length - 1;

  const body = (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={tr("Réserver une démo", "Book a demo")}>
      <div className="absolute inset-0 bg-[#0A0A0F]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[26px] bg-white shadow-[0_40px_120px_rgba(20,20,50,0.4)] sm:rounded-[26px]">
        <div aria-hidden className="h-[5px] w-full flex-shrink-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500" />

        {/* En-tête */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-[0_6px_16px_rgba(124,58,190,0.3)]">
              <CalendarDays className="h-[18px] w-[18px]" />
            </span>
            <h2 className="text-[16px] font-bold tracking-[-0.01em] text-[#0A0A0A]">{tr("Réserver une démo", "Book a demo")}</h2>
          </div>
          <button onClick={onClose} aria-label={tr("Fermer", "Close")} className="grid h-8 w-8 place-items-center rounded-full text-[#6E6E7A] transition-colors hover:bg-black/[0.05]">
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
          {phase === "slot" && (
            <>
              <p className="mb-4 text-[13.5px] leading-relaxed text-[#5B5B66]">
                {tr(
                  "Choisissez un jour et une heure. Vous recevrez un email de confirmation dès que le créneau est validé.",
                  "Pick a day and time. You'll receive a confirmation email as soon as the slot is confirmed.",
                )}
              </p>
              <SlotPicker
                date={date}
                time={time}
                onPick={(d, t) => { setDate(d); setTime(t); }}
              />
            </>
          )}

          {phase === "form" && (
            <div className="pt-1">
              <div className="mb-4 flex items-center gap-2">
                {STEPS.map((_, i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-gradient-to-r from-indigo-500 to-pink-500" : "bg-[#ECECF2]"}`} />
                ))}
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9A9AA6]">{tr("Étape", "Step")} {step + 1} {tr("sur", "of")} {STEPS.length}</p>
              <h3 className="mt-1 text-[19px] font-black tracking-[-0.02em] text-[#0A0A0A]">{STEPS[step].title}</h3>
              <p className="mb-4 mt-1 text-[13px] text-[#8B8B96]">{STEPS[step].subtitle}</p>

              {STEPS[step].key === "company" && (
                <TextField icon={Building2} value={f.company_name} onChange={(e) => set("company_name")(e.target.value)} placeholder={tr("Nom de l'entreprise", "Company name")} autoFocus maxLength={120} />
              )}
              {STEPS[step].key === "website" && (
                <TextField icon={Globe} value={f.website} onChange={(e) => set("website")(e.target.value)} placeholder={tr("https://votre-site.com", "https://your-site.com")} maxLength={200} inputMode="url" />
              )}
              {STEPS[step].key === "headcount" && (
                <OptionGrid options={headcountOptions(locale)} value={f.headcount} onChange={set("headcount")} />
              )}
              {STEPS[step].key === "looking_for" && (
                <OptionGrid options={lookingForOptions(locale)} value={f.looking_for} onChange={set("looking_for")} />
              )}
              {STEPS[step].key === "message" && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-[#ECECF2] bg-white px-4 py-3 focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-[#7C3AED]/20">
                  <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#9A9AA6]" />
                  <textarea value={f.message} onChange={(e) => set("message")(e.target.value)} placeholder={tr("Ex : je veux automatiser mes relances de devis…", "e.g. I want to automate my quote follow-ups…")} rows={4} maxLength={1000} className="w-full resize-none bg-transparent text-[14px] text-[#0A0A0A] outline-none placeholder:text-[#B4ADC4]" />
                </div>
              )}
              {STEPS[step].key === "contact" && (
                <div className="grid gap-2.5">
                  <TextField icon={User} value={f.contact_name} onChange={(e) => set("contact_name")(e.target.value)} placeholder={tr("Votre nom", "Your name")} autoFocus maxLength={120} />
                  <TextField icon={Mail} value={f.contact_email} onChange={(e) => set("contact_email")(e.target.value)} placeholder={tr("Email professionnel", "Work email")} type="email" maxLength={160} />
                  <TextField icon={Phone} value={f.contact_phone} onChange={(e) => set("contact_phone")(e.target.value)} placeholder={tr("Téléphone (optionnel)", "Phone (optional)")} type="tel" maxLength={40} />
                </div>
              )}

              {date && time && (
                <p className="mt-4 flex items-center gap-1.5 rounded-xl bg-[#F5F2FD] px-3 py-2 text-[12.5px] font-medium text-[#6D4AE0]">
                  <CalendarDays className="h-3.5 w-3.5" /> {formatSlot(date, time, locale)}
                </p>
              )}
            </div>
          )}

          {phase === "sending" && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#7C3AED]" />
              <p className="text-[14px] text-[#5B5B66]">{tr("Envoi de votre demande…", "Sending your request…")}</p>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-[0_10px_30px_rgba(124,58,190,0.35)]">
                <Check className="h-7 w-7" strokeWidth={3} />
              </span>
              <h3 className="text-[20px] font-black tracking-[-0.02em] text-[#0A0A0A]">{tr("Demande envoyée !", "Request sent!")}</h3>
              <p className="max-w-[360px] text-[13.5px] leading-relaxed text-[#5B5B66]">
                {tr(
                  "Vous recevrez un email de confirmation avec la date et l'heure que vous avez choisies :",
                  "You'll receive a confirmation email with the date and time you chose:",
                )}
              </p>
              {date && time && (
                <p className="flex items-center gap-1.5 rounded-xl bg-[#F5F2FD] px-3.5 py-2 text-[13px] font-semibold text-[#6D4AE0]">
                  <CalendarDays className="h-4 w-4" /> {formatSlot(date, time, locale)}
                </p>
              )}
            </div>
          )}

          {phase === "error" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-[14px] font-medium text-[#D1435B]">{errMsg}</p>
              <button onClick={() => setPhase(canContinueSlot ? "form" : "slot")} className="text-[13px] font-semibold text-[#7C3AED] hover:underline">
                {tr("Revenir en arrière", "Go back")}
              </button>
            </div>
          )}
        </div>

        {/* Pied — barre d'action */}
        {(phase === "slot" || phase === "form") && (
          <div className="flex items-center gap-3 border-t border-[#ECECF2] px-5 py-4 pb-[calc(1rem+var(--safe-bottom))] sm:px-6 sm:pb-4">
            {phase === "form" && (
              <button
                type="button"
                onClick={() => (step === 0 ? setPhase("slot") : setStep((s) => s - 1))}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-3 text-[14px] font-semibold text-[#5B5B66] transition-colors hover:bg-black/[0.04]"
              >
                <ArrowLeft className="h-4 w-4" /> {tr("Retour", "Back")}
              </button>
            )}
            <button
              type="button"
              disabled={phase === "slot" ? !canContinueSlot : !stepValid(step)}
              onClick={() => {
                if (phase === "slot") { setPhase("form"); setStep(0); return; }
                if (isLast) { submit(); return; }
                setStep((s) => s + 1);
              }}
              className="ml-auto inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 py-3 text-[14px] font-semibold text-white shadow-[0_10px_28px_rgba(124,58,190,0.4)] transition-all hover:shadow-[0_12px_34px_rgba(124,58,190,0.55)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:flex-none sm:px-8"
            >
              {phase === "slot" ? tr("Continuer", "Continue") : isLast ? tr("Confirmer", "Confirm") : tr("Suivant", "Next")} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}
