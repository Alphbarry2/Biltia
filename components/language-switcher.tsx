"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Sélecteur de langue FR / EN. Un clic bascule TOUT le logiciel instantanément
// (voir lib/i18n/context.tsx). Deux variantes visuelles :
//   • "nav"     — pilule claire, pour la navigation du site (fond clair).
//   • "sidebar" — ligne discrète, pour la barre latérale de l'app connectée.
//   • "ghost"   — bouton nu compact (menu mobile).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/i18n/config";

export function LanguageSwitcher({
  variant = "nav",
  className = "",
}: {
  variant?: "nav" | "sidebar" | "ghost";
  className?: string;
}) {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (l: Locale) => {
    if (l !== locale) setLocale(l);
    setOpen(false);
  };

  const trigger =
    variant === "sidebar"
      ? "flex w-full items-center gap-2 rounded-xl border border-[#E7E7E4] bg-white px-3 py-2 text-[13px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F7F4FD]"
      : variant === "ghost"
        ? "inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#0A0A0A]"
        : "inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white/70 px-3 py-2 text-[13px] font-semibold text-[#4A4A56] transition-colors hover:text-[#0A0A0A] hover:bg-white";

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={locale === "fr" ? "Changer de langue" : "Change language"}
        className={trigger}
      >
        <Globe className="w-[15px] h-[15px]" />
        <span>{LOCALE_META[locale].short}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute z-[80] min-w-[168px] rounded-2xl border border-black/[0.06] bg-white p-1.5 shadow-[0_20px_60px_rgba(60,40,120,0.18)] ${
            variant === "sidebar" ? "bottom-full mb-2 left-0" : "top-full mt-2 right-0"
          }`}
        >
          {LOCALES.map((l) => {
            const meta = LOCALE_META[l];
            const active = l === locale;
            return (
              <button
                key={l}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => choose(l)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] transition-colors ${
                  active ? "bg-[#F5F3FF] text-[#0A0A0A] font-semibold" : "text-[#4A4A56] hover:bg-black/[0.03]"
                }`}
              >
                <span className="text-[15px] leading-none">{meta.flag}</span>
                <span className="flex-1">{meta.label}</span>
                {active && <Check className="w-3.5 h-3.5 text-[#7C3AED]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
