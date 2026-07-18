"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CRM prospection — console admin (outil INTERNE, un seul utilisateur : nous).
// Import CSV/Excel → kanban par statut (glisser-déposer OU menu déroulant) →
// fiche prospect avec notes horodatées. Rien à voir avec le CRM clients des
// apps générées (public.clients, migration 036) : ici pas de tenant, accès
// service_role gardé par la console admin (clé + liste blanche d'emails).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Upload, Plus, Search, X, StickyNote, Phone, Mail, Globe,
  MapPin, Loader2, ChevronDown, Trash2, Inbox, RefreshCw,
} from "lucide-react";

type Status = "prospect" | "contacted" | "pending" | "signed" | "refused";

type Prospect = {
  id: string;
  created_at: string;
  updated_at: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  sector: string | null;
  city: string | null;
  status: Status;
  source_file: string | null;
  notes_count: number;
};

type Note = { id: string; created_at: string; body: string; author: string | null };

const STATUS_COLUMNS: { id: Status; label: string; badgeCls: string; dotCls: string }[] = [
  { id: "prospect", label: "Prospect", badgeCls: "bg-[#EEF0FF] text-[#4338CA]", dotCls: "bg-[#6366F1]" },
  { id: "contacted", label: "Contacté", badgeCls: "bg-[#EFF6FF] text-[#2563EB]", dotCls: "bg-[#3B82F6]" },
  { id: "pending", label: "En attente", badgeCls: "bg-[#FEF3E2] text-[#B26A00]", dotCls: "bg-[#F59E0B]" },
  { id: "signed", label: "Signé", badgeCls: "bg-[#E7F7EC] text-[#1B8A4B]", dotCls: "bg-[#22C55E]" },
  { id: "refused", label: "Refusé", badgeCls: "bg-[#FDECEF] text-[#D1435B]", dotCls: "bg-[#F43F5E]" },
];
const statusMeta = (s: Status) => STATUS_COLUMNS.find((c) => c.id === s) ?? STATUS_COLUMNS[0];

const EMPTY_FORM = { company_name: "", contact_name: "", contact_email: "", contact_phone: "", website: "", sector: "", city: "" };

export default function CrmSection() {
  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Status | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ imported: number; skipped: number; warnings: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/crm/prospects", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || "Erreur de chargement."); return; }
      setProspects(json.prospects ?? []);
    } catch {
      setError("Réseau indisponible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sectors = useMemo(
    () => Array.from(new Set((prospects ?? []).map((p) => p.sector).filter((s): s is string => !!s))).sort(),
    [prospects]
  );

  const filtered = useMemo(() => {
    if (!prospects) return [];
    const q = search.trim().toLowerCase();
    return prospects.filter((p) => {
      if (sectorFilter && p.sector !== sectorFilter) return false;
      if (!q) return true;
      return [p.company_name, p.contact_name, p.sector, p.city, p.contact_email]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [prospects, search, sectorFilter]);

  const byStatus = useCallback((s: Status) => filtered.filter((p) => p.status === s), [filtered]);

  async function updateStatus(id: string, status: Status) {
    const prev = prospects;
    setProspects((cur) => (cur ?? []).map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      const res = await fetch(`/api/admin/crm/prospects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setProspects(prev ?? null);
      setError("Impossible de changer le statut. Réessayez.");
    }
  }

  async function addProspect(fields: typeof EMPTY_FORM) {
    const res = await fetch("/api/admin/crm/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Erreur de création.");
    setProspects((cur) => [json.prospect, ...(cur ?? [])]);
  }

  async function deleteProspect(id: string) {
    setProspects((cur) => (cur ?? []).filter((p) => p.id !== id));
    await fetch(`/api/admin/crm/prospects/${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setImportSummary(null);
    setError("");
    try {
      const mod = await import("xlsx");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX: any = (mod as any).read ? mod : (mod as any).default;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
      if (!json.length) {
        setError("Ce fichier ne contient aucune ligne exploitable.");
        return;
      }
      const res = await fetch("/api/admin/crm/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: json, fileName: file.name }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setError(out.error || "Erreur d'import."); return; }
      setImportSummary({ imported: out.imported ?? 0, skipped: out.skipped ?? 0, warnings: out.warnings ?? [] });
      await load();
    } catch {
      setError("Fichier illisible. Formats acceptés : CSV, Excel (.xlsx, .xls).");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const openProspect = openId ? (prospects ?? []).find((p) => p.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white">
            <Building2 className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h3 className="text-[15px] font-bold text-[#0A0A0A]">CRM prospection</h3>
            <p className="text-[12px] text-[#8B8B96]">{prospects ? `${prospects.length} prospect${prospects.length > 1 ? "s" : ""}` : "…"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B4B4BE]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-40 rounded-xl border border-[#ECECF2] bg-white py-2 pl-8 pr-3 text-[12.5px] text-[#0A0A0A] outline-none focus:border-[#C7C0F0] sm:w-52"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#5B5B66] transition-colors hover:bg-black/[0.05] disabled:opacity-40"
            aria-label="Rafraîchir"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#ECECF2] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F6F6F9]"
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#222] disabled:opacity-60"
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Importer CSV / Excel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      </div>

      {sectors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSectorFilter(null)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              sectorFilter === null ? "bg-[#0A0A0A] text-white" : "bg-[#F6F6F9] text-[#6E6E6C] hover:bg-[#ECECF2]"
            }`}
          >
            Tous les secteurs
          </button>
          {sectors.map((s) => (
            <button
              key={s}
              onClick={() => setSectorFilter(s === sectorFilter ? null : s)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                sectorFilter === s ? "bg-[#0A0A0A] text-white" : "bg-[#F6F6F9] text-[#6E6E6C] hover:bg-[#ECECF2]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="flex items-center justify-between gap-2 rounded-xl bg-[#FDECEF] px-3.5 py-2.5 text-[13px] font-medium text-[#D1435B]">
          {error}
          <button onClick={() => setError("")} aria-label="Fermer"><X className="h-3.5 w-3.5" /></button>
        </p>
      )}

      {importSummary && (
        <div className="rounded-xl bg-[#E7F7EC] px-3.5 py-2.5 text-[13px] text-[#1B8A4B]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">
              {importSummary.imported} prospect{importSummary.imported > 1 ? "s" : ""} importé{importSummary.imported > 1 ? "s" : ""}
              {importSummary.skipped > 0 ? ` · ${importSummary.skipped} ligne${importSummary.skipped > 1 ? "s" : ""} ignorée${importSummary.skipped > 1 ? "s" : ""} (entreprise vide)` : ""}
            </span>
            <button onClick={() => setImportSummary(null)} aria-label="Fermer"><X className="h-3.5 w-3.5" /></button>
          </div>
          {importSummary.warnings.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-[11.5px] text-[#2F7A4E]">
              {importSummary.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Kanban */}
      {loading && !prospects && (
        <div className="flex items-center gap-2 py-10 text-sm text-[#6E6E6C]">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      )}
      {prospects && prospects.length === 0 && !loading && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#ECECF2] py-14 text-center text-[#9A9AA6]">
          <Inbox className="h-7 w-7" />
          <p className="text-[13px]">Aucun prospect. Importez un fichier CSV/Excel ou ajoutez-en un.</p>
        </div>
      )}
      {prospects && prospects.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STATUS_COLUMNS.map((col) => (
            <div
              key={col.id}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
              onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) void updateStatus(id, col.id);
                setDragOverCol(null);
                setDragId(null);
              }}
              className={`flex w-[240px] shrink-0 flex-col rounded-2xl border p-3 transition-colors sm:w-[280px] ${
                dragOverCol === col.id ? "border-[#B7ACF2] bg-[#F7F5FF]" : "border-[#ECECF2] bg-[#FAFAFB]"
              }`}
            >
              <div className="mb-3 flex items-center justify-between px-0.5">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${col.badgeCls}`}>{col.label}</span>
                <span className="text-[11px] font-semibold text-[#9A9AA6]">{byStatus(col.id).length}</span>
              </div>
              <div className="flex min-h-[60px] flex-col gap-2">
                {byStatus(col.id).map((p) => (
                  <ProspectCard
                    key={p.id}
                    p={p}
                    dragging={dragId === p.id}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); setDragId(p.id); }}
                    onDragEnd={() => setDragId(null)}
                    onOpen={() => setOpenId(p.id)}
                    onStatusChange={(s) => void updateStatus(p.id, s)}
                  />
                ))}
                {byStatus(col.id).length === 0 && <p className="py-6 text-center text-[11px] text-[#C4C4CE]">—</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddProspectModal
          onClose={() => setShowAdd(false)}
          onSubmit={async (fields) => { await addProspect(fields); setShowAdd(false); }}
        />
      )}

      <AnimatePresence>
        {openProspect && (
          <ProspectDrawer
            key={openProspect.id}
            prospect={openProspect}
            onClose={() => setOpenId(null)}
            onStatusChange={(s) => void updateStatus(openProspect.id, s)}
            onUpdated={(patch) => setProspects((cur) => (cur ?? []).map((p) => (p.id === openProspect.id ? { ...p, ...patch } : p)))}
            onDeleted={() => { void deleteProspect(openProspect.id); setOpenId(null); }}
            onNoteAdded={() => setProspects((cur) => (cur ?? []).map((p) => (p.id === openProspect.id ? { ...p, notes_count: p.notes_count + 1 } : p)))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Carte prospect (kanban) ───────────────────────────────────────────────────
function ProspectCard({
  p, dragging, onDragStart, onDragEnd, onOpen, onStatusChange,
}: {
  p: Prospect;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onStatusChange: (s: Status) => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-xl border border-[#ECECF2] bg-white p-3 shadow-[0_2px_8px_rgba(60,40,120,0.05)] transition-opacity active:cursor-grabbing ${dragging ? "opacity-40" : ""}`}
    >
      <button onClick={onOpen} className="block w-full text-left">
        <p className="truncate text-[13px] font-bold text-[#0A0A0A]">{p.company_name}</p>
        {p.contact_name && <p className="truncate text-[11.5px] text-[#6E6E6C]">{p.contact_name}</p>}
        {(p.sector || p.city) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {p.sector && <span className="rounded-full bg-[#F6F6F9] px-1.5 py-0.5 text-[10px] font-medium text-[#6E6E6C]">{p.sector}</span>}
            {p.city && <span className="text-[10px] text-[#B4B4BE]">{p.city}</span>}
          </div>
        )}
      </button>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#F0F0F4] pt-2">
        <div className="relative">
          <select
            value={p.status}
            onChange={(e) => onStatusChange(e.target.value as Status)}
            onClick={(e) => e.stopPropagation()}
            className="cursor-pointer appearance-none rounded-lg border border-[#ECECF2] bg-white py-1 pl-2 pr-5 text-[10.5px] font-medium text-[#4B4B55] outline-none"
          >
            {STATUS_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-[#B4B4BE]" />
        </div>
        {p.notes_count > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-[#9A9AA6]">
            <StickyNote className="h-3 w-3" /> {p.notes_count}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Modale « Ajouter un prospect » ────────────────────────────────────────────
function AddProspectModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (fields: typeof EMPTY_FORM) => Promise<void> }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name.trim()) { setErr("Le nom de l'entreprise est requis."); return; }
    setSaving(true);
    setErr("");
    try {
      await onSubmit(form);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erreur de création.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" onClick={saving ? undefined : onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="anim-modal-in max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-safe shadow-2xl sm:max-w-md sm:rounded-3xl sm:pb-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold tracking-tight text-[#0A0A0A]">Ajouter un prospect</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg bg-[#F6F6F9] text-[#6E6E6C] hover:bg-[#ECECF2]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {err && <p className="mb-3 rounded-xl bg-[#FDECEF] px-3.5 py-2.5 text-[13px] font-medium text-[#D1435B]">{err}</p>}

        <div className="space-y-3">
          <Field label="Entreprise *" value={form.company_name} onChange={set("company_name")} autoFocus />
          <Field label="Contact / dirigeant" value={form.contact_name} onChange={set("contact_name")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" value={form.contact_email} onChange={set("contact_email")} type="email" />
            <Field label="Téléphone" value={form.contact_phone} onChange={set("contact_phone")} type="tel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Secteur" value={form.sector} onChange={set("sector")} />
            <Field label="Ville" value={form.city} onChange={set("city")} />
          </div>
          <Field label="Site web" value={form.website} onChange={set("website")} />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#0A0A0A] py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#222] disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Ajouter
        </button>
      </form>
    </div>,
    document.body
  );
}

function Field({
  label, value, onChange, type = "text", autoFocus,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#9A9AA6]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-[#ECECF2] px-3 py-2 text-[13.5px] text-[#0A0A0A] outline-none focus:border-[#C7C0F0]"
      />
    </label>
  );
}

// ── Fiche prospect (tiroir latéral) ───────────────────────────────────────────
function ProspectDrawer({
  prospect, onClose, onStatusChange, onUpdated, onDeleted, onNoteAdded,
}: {
  prospect: Prospect;
  onClose: () => void;
  onStatusChange: (s: Status) => void;
  onUpdated: (patch: Partial<Prospect>) => void;
  onDeleted: () => void;
  onNoteAdded: () => void;
}) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [form, setForm] = useState({
    company_name: prospect.company_name,
    contact_name: prospect.contact_name ?? "",
    contact_email: prospect.contact_email ?? "",
    contact_phone: prospect.contact_phone ?? "",
    website: prospect.website ?? "",
    sector: prospect.sector ?? "",
    city: prospect.city ?? "",
  });
  const [savingFields, setSavingFields] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setForm({
      company_name: prospect.company_name,
      contact_name: prospect.contact_name ?? "",
      contact_email: prospect.contact_email ?? "",
      contact_phone: prospect.contact_phone ?? "",
      website: prospect.website ?? "",
      sector: prospect.sector ?? "",
      city: prospect.city ?? "",
    });
  }, [prospect.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadNotes = useCallback(async () => {
    const res = await fetch(`/api/admin/crm/prospects/${prospect.id}/notes`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setNotes(res.ok ? json.notes ?? [] : []);
  }, [prospect.id]);

  useEffect(() => { void loadNotes(); }, [loadNotes]);

  async function addNote() {
    const body = noteText.trim();
    if (!body) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/admin/crm/prospects/${prospect.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erreur.");
      setNotes((cur) => [json.note, ...(cur ?? [])]);
      setNoteText("");
      onNoteAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur d'enregistrement de la note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function saveFields(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name.trim()) { setErr("Le nom de l'entreprise ne peut pas être vide."); return; }
    setSavingFields(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/crm/prospects/${prospect.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erreur de mise à jour.");
      onUpdated(json.prospect);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur de mise à jour.");
    } finally {
      setSavingFields(false);
    }
  }

  function remove() {
    if (!window.confirm(`Supprimer « ${prospect.company_name} » et ses notes ?`)) return;
    onDeleted();
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const meta = statusMeta(prospect.status);

  return createPortal(
    <div className="fixed inset-0 z-[250] flex justify-end" role="dialog" aria-modal="true" aria-label={`Fiche ${prospect.company_name}`}>
      <div className="absolute inset-0 bg-[#0A0A0F]/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#ECECF2] bg-white/90 p-5 backdrop-blur-md">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-black tracking-[-0.01em] text-[#0A0A0A]">{prospect.company_name}</p>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold ${meta.badgeCls}`}>{meta.label}</span>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#F6F6F9] text-[#6E6E6C] hover:bg-[#ECECF2]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {err && (
            <p className="flex items-center justify-between gap-2 rounded-xl bg-[#FDECEF] px-3.5 py-2.5 text-[13px] font-medium text-[#D1435B]">
              {err}
              <button onClick={() => setErr("")} aria-label="Fermer"><X className="h-3.5 w-3.5" /></button>
            </p>
          )}

          {/* Statut */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9A9AA6]">Où en est ce prospect ?</p>
            <div className="relative">
              <select
                value={prospect.status}
                onChange={(e) => onStatusChange(e.target.value as Status)}
                className="w-full cursor-pointer appearance-none rounded-xl border border-[#ECECF2] bg-white py-2.5 pl-3 pr-8 text-[13.5px] font-semibold text-[#0A0A0A] outline-none focus:border-[#C7C0F0]"
              >
                {STATUS_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B4B4BE]" />
            </div>
          </div>

          {/* Coordonnées, éditables */}
          <form onSubmit={saveFields} className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9AA6]">Coordonnées</p>
            <Field label="Entreprise" value={form.company_name} onChange={set("company_name")} />
            <Field label="Contact / dirigeant" value={form.contact_name} onChange={set("contact_name")} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" value={form.contact_email} onChange={set("contact_email")} type="email" />
              <Field label="Téléphone" value={form.contact_phone} onChange={set("contact_phone")} type="tel" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Secteur" value={form.sector} onChange={set("sector")} />
              <Field label="Ville" value={form.city} onChange={set("city")} />
            </div>
            <Field label="Site web" value={form.website} onChange={set("website")} />
            <button
              type="submit"
              disabled={savingFields}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-[#ECECF2] py-2 text-[12.5px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F6F6F9] disabled:opacity-60"
            >
              {savingFields ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Enregistrer les modifications
            </button>
          </form>

          {(prospect.contact_email || prospect.contact_phone || prospect.website) && (
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#6E6E6C]">
              {prospect.contact_email && <a href={`mailto:${prospect.contact_email}`} className="flex items-center gap-1 hover:text-[#0A0A0A]"><Mail className="h-3.5 w-3.5" />{prospect.contact_email}</a>}
              {prospect.contact_phone && <a href={`tel:${prospect.contact_phone}`} className="flex items-center gap-1 hover:text-[#0A0A0A]"><Phone className="h-3.5 w-3.5" />{prospect.contact_phone}</a>}
              {prospect.website && <a href={prospect.website.startsWith("http") ? prospect.website : `https://${prospect.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#0A0A0A]"><Globe className="h-3.5 w-3.5" />Site</a>}
              {prospect.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{prospect.city}</span>}
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9A9AA6]">Notes de suivi</p>
            <div className="flex gap-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Ajouter une note (appel, relance, objection…)"
                rows={2}
                className="flex-1 resize-none rounded-xl border border-[#ECECF2] px-3 py-2 text-[13px] text-[#0A0A0A] outline-none focus:border-[#C7C0F0]"
              />
              <button
                onClick={addNote}
                disabled={savingNote || !noteText.trim()}
                className="shrink-0 self-end rounded-xl bg-[#0A0A0A] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#222] disabled:opacity-40"
              >
                {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ajouter"}
              </button>
            </div>

            <div className="mt-3 space-y-2.5">
              {notes === null && <p className="text-[12px] text-[#9A9AA6]">Chargement…</p>}
              {notes && notes.length === 0 && <p className="text-[12px] text-[#B4B4BE]">Aucune note pour l&apos;instant.</p>}
              {notes?.map((n) => (
                <div key={n.id} className="rounded-xl border border-[#F0EEF6] p-3">
                  <p className="whitespace-pre-wrap text-[13px] text-[#0A0A0A]">{n.body}</p>
                  <p className="mt-1 text-[10.5px] text-[#B4B4BE]">{new Date(n.created_at).toLocaleString("fr-FR")}{n.author ? ` · ${n.author}` : ""}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={remove}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-[#FBDCE2] py-2 text-[12.5px] font-semibold text-[#D1435B] transition-colors hover:bg-[#FDECEF]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Supprimer ce prospect
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
