"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown maison Biltia — même langage que le sélecteur de crédits des tarifs
// (portail fixe, animation framer-motion, listbox accessible, clavier complet).
// À utiliser partout à la place des <select> natifs.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

export type DropdownOption = {
  value: string;
  label: string;
  /** Texte secondaire aligné à droite (prix, rôle, etc.). */
  hint?: string;
  /** Icône ou emoji affiché à gauche du libellé. */
  icon?: React.ReactNode;
  /** Regroupe les options sous un intertitre (ordre d'apparition conservé). */
  group?: string;
};

type Placement = { top?: number; bottom?: number; left: number; width: number; maxHeight: number };

export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Sélectionner",
  label,
  ariaLabel,
  disabled = false,
  size = "md",
  className = "",
}: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  /** Petit libellé au-dessus du bouton (optionnel). */
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Placement | null>(null);
  const [hi, setHi] = useState(-1);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);
  const groups = useMemo(() => {
    const out: { label: string | null; options: DropdownOption[] }[] = [];
    for (const o of options) {
      const g = o.group ?? null;
      const last = out[out.length - 1];
      if (last && last.label === g) last.options.push(o);
      else out.push({ label: g, options: [o] });
    }
    return out;
  }, [options]);

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const below = window.innerHeight - b.bottom - 12;
    const above = b.top - 12;
    if (below < 260 && above > below) {
      setPos({ bottom: window.innerHeight - b.top + 8, left: b.left, width: b.width, maxHeight: Math.min(300, above) });
    } else {
      setPos({ top: b.bottom + 8, left: b.left, width: b.width, maxHeight: Math.min(300, Math.max(below, 180)) });
    }
  };

  const openMenu = () => {
    if (disabled) return;
    setHi(options.findIndex((o) => o.value === value));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setHi((h) => {
          const d = e.key === "ArrowDown" ? 1 : -1;
          return (h + d + options.length) % options.length;
        });
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setHi((h) => {
          const o = options[h];
          if (o) { onChange(o.value); setOpen(false); btnRef.current?.focus(); }
          return h;
        });
      }
    };
    // capture:true → les scrolls de conteneurs internes (modales) ferment aussi.
    const onReflow = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReflow, { passive: true, capture: true });
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReflow, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onReflow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options.length]);

  useEffect(() => {
    if (!open || hi < 0) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-idx="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const sm = size === "sm";
  let idx = -1;

  return (
    <div className={className}>
      {label && <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">{label}</label>}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); openMenu(); }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? label ?? placeholder}
        className={`group flex w-full items-center justify-between text-left transition-all duration-200 ${
          sm ? "gap-2 rounded-xl px-3 py-2" : "gap-3 rounded-2xl px-4 py-3"
        } border bg-white ${
          disabled
            ? "cursor-not-allowed border-[#ECECF2] opacity-60"
            : open
              ? "border-[#7C3AED] ring-2 ring-[#7C3AED]/25 shadow-[0_12px_30px_rgba(124,58,190,0.18)]"
              : "border-[#E6E1F0] hover:border-[#C9BEF0] hover:shadow-[0_8px_22px_rgba(124,58,190,0.12)]"
        }`}
      >
        <span className={`flex min-w-0 items-center ${sm ? "gap-2" : "gap-2.5"}`}>
          {current?.icon && <span className="flex-shrink-0 leading-none">{current.icon}</span>}
          <span className={`truncate ${sm ? "text-[13px]" : "text-[14px]"} ${current ? "font-semibold text-[#0A0A0A]" : "font-medium text-[#9A9AA6]"}`}>
            {current ? current.label : placeholder}
          </span>
        </span>
        <span className={`flex flex-shrink-0 items-center ${sm ? "gap-1.5" : "gap-2.5"}`}>
          {!sm && current?.hint && <span className="text-[13px] font-bold tabular-nums text-[#7C3AED]">{current.hint}</span>}
          <span className={`grid place-items-center rounded-full bg-[#F1ECFB] text-[#7C3AED] transition-transform duration-200 ${sm ? "h-5 w-5" : "h-6 w-6"} ${open ? "rotate-180" : ""}`}>
            <ChevronDown className={sm ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2.5} />
          </span>
        </span>
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={menuRef}
              style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, zIndex: 100 }}
              initial={{ opacity: 0, y: pos.bottom ? 8 : -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.bottom ? 8 : -8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: EASE }}
              role="listbox"
              aria-label={ariaLabel ?? label ?? placeholder}
              className="overflow-y-auto overscroll-contain rounded-2xl border border-[#ECE7F6] bg-white p-1.5 shadow-[0_30px_80px_rgba(60,40,120,0.28)]"
            >
              {groups.map((g, gi) => (
                <div key={`${g.label ?? "_"}-${gi}`} className="mb-0.5 last:mb-0">
                  {g.label && <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#B4ADC4]">{g.label}</p>}
                  {g.options.map((o) => {
                    idx += 1;
                    const i = idx;
                    const active = o.value === value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="option"
                        data-idx={i}
                        aria-selected={active}
                        onMouseEnter={() => setHi(i)}
                        onClick={() => { onChange(o.value); setOpen(false); btnRef.current?.focus(); }}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition-colors ${sm ? "py-2" : "py-2.5"} ${
                          active ? "bg-[#F3EFFC]" : hi === i ? "bg-[#F6F4FB]" : ""
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border ${active ? "border-transparent bg-gradient-to-br from-indigo-500 to-pink-500" : "border-[#D6D0E4]"}`}>
                            {active && <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />}
                          </span>
                          {o.icon && <span className="flex-shrink-0 leading-none">{o.icon}</span>}
                          <span className={`truncate ${sm ? "text-[13px]" : "text-[13.5px]"} ${active ? "font-bold text-[#0A0A0A]" : "font-medium text-[#3A3A46]"}`}>{o.label}</span>
                        </span>
                        {o.hint && <span className={`flex-shrink-0 ${sm ? "text-[12px]" : "text-[13px]"} tabular-nums ${active ? "font-bold text-[#7C3AED]" : "text-[#8B8B96]"}`}>{o.hint}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
