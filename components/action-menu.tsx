"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Menu d'actions Biltia — petit popover déclenché par un bouton, pour les
// actions ponctuelles (envoyer, ajouter au calendrier…). Complément du
// Dropdown (qui, lui, sélectionne une valeur). Même langage visuel.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

export type ActionItem = {
  key: string;
  label: string;
  /** Texte secondaire sous le libellé. */
  hint?: string;
  icon: React.ReactNode;
  /**
   * Exécute l'action. Peut renvoyer un message de statut (affiché sous le
   * menu, qui reste alors ouvert) ; sinon le menu se ferme.
   */
  run: () => void | string | Promise<void | string>;
};

export function ActionMenu({
  label,
  icon,
  actions,
  buttonClassName,
  menuClassName = "w-[264px]",
  title,
}: {
  label: string;
  icon: React.ReactNode;
  actions: ActionItem[];
  buttonClassName: string;
  menuClassName?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setNote(null);
  }, [open]);

  const select = async (a: ActionItem) => {
    if (busy) return;
    setBusy(a.key);
    setNote(null);
    try {
      const msg = await a.run();
      if (typeof msg === "string" && msg) setNote(msg);
      else setOpen(false);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Action impossible. Réessayez.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title ?? label}
        className={buttonClassName}
      >
        {icon}
        {label}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            className={`absolute right-0 top-full mt-2 z-50 rounded-2xl border border-[#ECE7F6] bg-white p-1.5 shadow-[0_30px_80px_rgba(60,40,120,0.28)] ${menuClassName}`}
          >
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                role="menuitem"
                disabled={busy !== null}
                onClick={() => select(a)}
                className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#F6F4FB] disabled:opacity-60"
              >
                <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-[#F3EFFC] text-[#7C3AED]">
                  {busy === a.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : a.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-[#0A0A0A]">{a.label}</span>
                  {a.hint && <span className="block text-[11px] leading-snug text-[#8B8B96]">{a.hint}</span>}
                </span>
              </button>
            ))}
            {note && (
              <p className="mx-1.5 mb-1 mt-1.5 rounded-lg bg-[#F3EFFC] px-2.5 py-2 text-[11px] leading-snug text-[#7C3AED]">
                {note}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
