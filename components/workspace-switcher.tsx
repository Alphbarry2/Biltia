"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Sélecteur de workspace (sidebar) — multi-entreprises façon Notion/Slack.
//
//   • Affiche l'entreprise active (un workspace = une entreprise).
//   • Bascule d'un espace à l'autre (cookie biltia_active_tenant + reload).
//   • Renomme un espace (owner/admin) — édition inline dans le menu.
//   • Crée une nouvelle entreprise (elle naît en plan Free et devient active).
//
// Même langage visuel que components/dropdown.tsx (portail fixe, framer-motion).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronsUpDown, Pencil, Plus, Loader2 } from "lucide-react";
import { writeActiveTenantCookie } from "@/lib/tenant";
import { useT, useLocale } from "@/lib/i18n/context";

const EASE = [0.16, 1, 0.3, 1] as const;

const ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Admin",
  manager: "Manager",
  member: "Membre",
  viewer: "Lecture seule",
};
const ROLE_LABELS_EN: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  viewer: "Read-only",
};

type Workspace = { id: string; name: string; role: string; active: boolean };

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const tr = useT();
  const locale = useLocale();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const active = workspaces.find((w) => w.active) ?? workspaces[0] ?? null;

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.workspaces)) setWorkspaces(data.workspaces);
      })
      .catch(() => {});
  }, []);

  const openMenu = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const width = 252;
    setPos({
      top: b.bottom + 8,
      left: Math.max(8, Math.min(b.left, window.innerWidth - width - 8)),
      width,
    });
    setError(null);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
      setRenamingId(null);
      setCreating(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (renamingId || creating) {
          setRenamingId(null);
          setCreating(false);
        } else {
          setOpen(false);
        }
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, renamingId, creating]);

  const switchTo = (w: Workspace) => {
    if (w.active) {
      setOpen(false);
      return;
    }
    writeActiveTenantCookie(w.id);
    // Reload complet : tout l'état client (crédits, listes, contexte) est par tenant.
    window.location.assign("/dashboard");
  };

  const submitRename = async () => {
    const name = draft.trim();
    const target = workspaces.find((w) => w.id === renamingId);
    if (!target || !name || name === target.name) {
      setRenamingId(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: target.id, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? tr("Renommage impossible.", "Rename failed."));
      setWorkspaces((ws) => ws.map((w) => (w.id === target.id ? { ...w, name } : w)));
      setRenamingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Renommage impossible.", "Rename failed."));
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    const name = draft.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? tr("Création impossible.", "Creation failed."));
      // Cookie posé par le serveur → le nouvel espace est actif au reload.
      window.location.assign("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Création impossible.", "Creation failed."));
      setBusy(false);
    }
  };

  const initial = (active?.name ?? "B")[0].toUpperCase();

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tr("Changer d'espace de travail", "Switch workspace")}
        title={collapsed ? active?.name ?? tr("Espace de travail", "Workspace") : undefined}
        className={`group flex w-full items-center rounded-xl transition-colors hover:bg-black/[0.04] ${
          collapsed ? "justify-center py-2" : "gap-2.5 px-2 py-2"
        }`}
      >
        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-xs font-bold leading-none text-white">
          {initial}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold tracking-[-0.01em] text-[#0A0A0A]">
              {active?.name ?? "…"}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-[#9A9A97] transition-colors group-hover:text-[#0A0A0A]" />
          </>
        )}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={menuRef}
                style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 100 }}
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.16, ease: EASE }}
                role="menu"
                aria-label={tr("Espaces de travail", "Workspaces")}
                className="overflow-hidden rounded-2xl border border-[#ECE7F6] bg-white p-1.5 shadow-[0_30px_80px_rgba(60,40,120,0.28)]"
              >
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#B4ADC4]">
                  {tr("Espaces de travail", "Workspaces")}
                </p>

                <div className="max-h-[260px] overflow-y-auto overscroll-contain">
                  {workspaces.map((w) =>
                    renamingId === w.id ? (
                      <div key={w.id} className="flex items-center gap-2 rounded-xl bg-[#F6F4FB] px-3 py-2">
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitRename();
                          }}
                          onBlur={submitRename}
                          maxLength={60}
                          disabled={busy}
                          aria-label={tr("Nouveau nom de l'espace", "New workspace name")}
                          className="w-full bg-transparent text-[13px] font-semibold text-[#0A0A0A] outline-none placeholder:text-[#9A9AA6]"
                          placeholder={tr("Nom de l'entreprise", "Company name")}
                        />
                        {busy && <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-[#7C3AED]" />}
                      </div>
                    ) : (
                      <div
                        key={w.id}
                        className={`group/row flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${
                          w.active ? "bg-[#F3EFFC]" : "hover:bg-[#F6F4FB]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => switchTo(w)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-[10px] font-bold leading-none text-white">
                            {w.name[0]?.toUpperCase() ?? "?"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[13px] ${w.active ? "font-bold text-[#0A0A0A]" : "font-medium text-[#3A3A46]"}`}>
                              {w.name}
                            </span>
                            <span className="block text-[10.5px] text-[#9A9AA6]">
                              {(locale === "en" ? ROLE_LABELS_EN : ROLE_LABELS)[w.role] ?? w.role}
                            </span>
                          </span>
                        </button>
                        {["owner", "admin"].includes(w.role) && (
                          <button
                            type="button"
                            onClick={() => {
                              setDraft(w.name);
                              setCreating(false);
                              setRenamingId(w.id);
                            }}
                            title={tr("Renommer", "Rename")}
                            aria-label={tr(`Renommer ${w.name}`, `Rename ${w.name}`)}
                            className="hidden h-6 w-6 flex-shrink-0 place-items-center rounded-md text-[#9A9A97] transition-colors hover:bg-black/[0.06] hover:text-[#0A0A0A] group-hover/row:grid show-touch-grid"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {w.active && <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={3} />}
                      </div>
                    )
                  )}
                </div>

                <div className="mx-1.5 my-1 border-t border-[#F0EDF8]" />

                {creating ? (
                  <div className="flex items-center gap-2 rounded-xl bg-[#F6F4FB] px-3 py-2">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitCreate();
                      }}
                      maxLength={60}
                      disabled={busy}
                      aria-label={tr("Nom de la nouvelle entreprise", "New company name")}
                      className="w-full bg-transparent text-[13px] font-semibold text-[#0A0A0A] outline-none placeholder:text-[#9A9AA6]"
                      placeholder={tr("Nom de la nouvelle entreprise", "New company name")}
                    />
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-[#7C3AED]" />
                    ) : (
                      <button
                        type="button"
                        onClick={submitCreate}
                        aria-label={tr("Créer l'espace", "Create workspace")}
                        className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md bg-[#7C3AED] text-white transition-transform hover:scale-105 active:scale-95"
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft("");
                      setRenamingId(null);
                      setCreating(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[#F6F4FB]"
                  >
                    <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg border border-dashed border-[#C9BEF0] text-[#7C3AED]">
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                    <span className="text-[13px] font-semibold text-[#7C3AED]">{tr("Nouvelle entreprise", "New company")}</span>
                  </button>
                )}

                {error && <p className="px-3 pb-1.5 pt-1 text-[11px] font-medium text-red-500">{error}</p>}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
