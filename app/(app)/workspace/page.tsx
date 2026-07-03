"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  Boxes,
  HardHat,
  Users,
  UserCog,
  FileText,
  Hammer,
  Package,
  Wrench,
  Truck,
  ListChecks,
  AppWindow,
  GitBranch,
  MessageSquare,
  Search,
  ArrowLeft,
  X,
  Loader2,
  ChevronRight,
  Building2,
  Phone,
  Mail,
  MapPin,
  Euro,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Workspace — la mémoire de l'entreprise.
// Toutes les entités partagées (isolées par tenant + RLS) lues via /api/data.
// Rien n'est un module ERP : ce sont des vues sur une mémoire reliée.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type DataMap = Record<string, Row[]>;

type EntityMeta = {
  label: string;
  icon: LucideIcon;
  accent: string; // classe de teinte pour l'icône
  title: (r: Row) => string;
  subtitle: (r: Row) => string;
  search: (r: Row) => string;
  detailFields: string[];
};

const CHANTIER_STATUT: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "En attente", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  en_cours: { label: "En cours", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  en_retard: { label: "En retard", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  termine: { label: "Terminé", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  annule: { label: "Annulé", cls: "bg-slate-100 text-slate-400 border-slate-200" },
};

const joinTruthy = (...xs: (string | null | undefined)[]) => xs.filter(Boolean).join(" · ");

const ENTITY_META: Record<string, EntityMeta> = {
  chantiers: {
    label: "Chantiers",
    icon: HardHat,
    accent: "text-violet-600 bg-violet-50",
    title: (r) => r.nom ?? "Chantier",
    subtitle: (r) => joinTruthy(r.ville, CHANTIER_STATUT[r.statut]?.label ?? r.statut),
    search: (r) => joinTruthy(r.nom, r.ville, r.adresse, r.description),
    detailFields: ["adresse", "ville", "code_postal", "budget", "avancement", "date_debut", "date_fin_prevue", "description"],
  },
  clients: {
    label: "Clients",
    icon: Users,
    accent: "text-sky-600 bg-sky-50",
    title: (r) => r.nom ?? "Client",
    subtitle: (r) => joinTruthy(r.type, r.ville),
    search: (r) => joinTruthy(r.nom, r.email, r.ville, r.siret),
    detailFields: ["type", "email", "tel", "adresse", "ville", "code_postal", "siret", "notes"],
  },
  employees: {
    label: "Employés",
    icon: UserCog,
    accent: "text-emerald-600 bg-emerald-50",
    title: (r) => joinTruthy(r.prenom, r.nom) || "Employé",
    subtitle: (r) => joinTruthy(r.role, r.corps_metier),
    search: (r) => joinTruthy(r.prenom, r.nom, r.role, r.corps_metier, r.email),
    detailFields: ["role", "corps_metier", "email", "tel", "date_embauche", "taux_horaire", "statut", "notes"],
  },
  documents: {
    label: "Documents",
    icon: FileText,
    accent: "text-indigo-600 bg-indigo-50",
    title: (r) => r.nom ?? "Document",
    subtitle: (r) => joinTruthy(r.type, r.statut),
    search: (r) => joinTruthy(r.nom, r.type, r.notes),
    detailFields: ["type", "statut", "expires_at", "url", "notes"],
  },
  interventions: {
    label: "Interventions",
    icon: Hammer,
    accent: "text-amber-600 bg-amber-50",
    title: (r) => r.type ?? "Intervention",
    subtitle: (r) => joinTruthy(r.statut, r.date_prevue),
    search: (r) => joinTruthy(r.type, r.description, r.rapport),
    detailFields: ["statut", "date_prevue", "date_reelle", "duree_heures", "description", "rapport"],
  },
  materials: {
    label: "Matériaux",
    icon: Package,
    accent: "text-orange-600 bg-orange-50",
    title: (r) => r.nom ?? "Matériau",
    subtitle: (r) => joinTruthy(r.categorie, r.statut),
    search: (r) => joinTruthy(r.nom, r.reference, r.categorie),
    detailFields: ["reference", "categorie", "quantite", "unite", "statut", "date_retour", "notes"],
  },
  equipment: {
    label: "Équipement",
    icon: Wrench,
    accent: "text-teal-600 bg-teal-50",
    title: (r) => r.nom ?? "Équipement",
    subtitle: (r) => joinTruthy(r.marque, r.statut),
    search: (r) => joinTruthy(r.nom, r.reference, r.marque, r.numero_serie),
    detailFields: ["reference", "type", "marque", "numero_serie", "statut", "date_achat", "prochain_controle", "notes"],
  },
  suppliers: {
    label: "Fournisseurs",
    icon: Truck,
    accent: "text-rose-600 bg-rose-50",
    title: (r) => r.nom ?? "Fournisseur",
    subtitle: (r) => joinTruthy(r.type, r.ville),
    search: (r) => joinTruthy(r.nom, r.email, r.ville, r.siret),
    detailFields: ["type", "email", "tel", "adresse", "ville", "code_postal", "siret", "notes"],
  },
  tasks: {
    label: "Tâches",
    icon: ListChecks,
    accent: "text-fuchsia-600 bg-fuchsia-50",
    title: (r) => r.title ?? "Tâche",
    subtitle: (r) => joinTruthy(r.status, r.priority),
    search: (r) => joinTruthy(r.title, r.description),
    detailFields: ["status", "priority", "due_date", "done_at", "description"],
  },
};

const ENTITY_ORDER = [
  "chantiers", "clients", "employees", "documents",
  "interventions", "materials", "equipment", "suppliers", "tasks",
];

const FIELD_LABELS: Record<string, string> = {
  adresse: "Adresse", ville: "Ville", code_postal: "Code postal", budget: "Budget (€)",
  avancement: "Avancement", date_debut: "Début", date_fin_prevue: "Fin prévue", description: "Description",
  type: "Type", email: "Email", tel: "Téléphone", siret: "SIRET", notes: "Notes",
  role: "Rôle", corps_metier: "Corps de métier", date_embauche: "Embauche", taux_horaire: "Taux horaire (€)",
  statut: "Statut", status: "Statut", expires_at: "Expire le", url: "Lien", reference: "Référence",
  categorie: "Catégorie", quantite: "Quantité", unite: "Unité", date_retour: "Retour prévu",
  marque: "Marque", numero_serie: "N° série", date_achat: "Achat", prochain_controle: "Prochain contrôle",
  date_prevue: "Prévue le", date_reelle: "Réalisée le", duree_heures: "Durée (h)", rapport: "Rapport",
  priority: "Priorité", due_date: "Échéance", done_at: "Terminée le",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";

async function listEntity(entity: string): Promise<Row[]> {
  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, action: "list", order: "created_at", ascending: false, limit: 200 }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

// ─── Petit renderer de valeur de champ ──────────────────────────────────────
function FieldRow({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined || v === "") return null;
  const isDate = /_at$|date|expires|controle/.test(k) && typeof v === "string" && v.length >= 8;
  let display: React.ReactNode = String(v);
  if (k === "avancement") display = `${v}%`;
  else if (isDate) display = fmtDate(String(v));
  else if (k === "url" && typeof v === "string") {
    display = (
      <a href={v} target="_blank" rel="noreferrer" className="text-violet-600 hover:underline break-all">
        Ouvrir
      </a>
    );
  }
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[#F1F1EC] last:border-0">
      <span className="text-[12px] text-[#9A9A97] flex-shrink-0">{FIELD_LABELS[k] ?? k}</span>
      <span className="text-[13px] text-[#0A0A0A] text-right break-words">{display}</span>
    </div>
  );
}

// ─── Ligne « objet relié » cliquable ────────────────────────────────────────
function RelatedItem({
  entity, row, onOpen,
}: { entity: string; row: Row; onOpen: (entity: string, id: string) => void }) {
  const meta = ENTITY_META[entity];
  const Icon = meta.icon;
  return (
    <button
      onClick={() => onOpen(entity, row.id)}
      className="group flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl hover:bg-black/[0.03] transition-colors"
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.accent}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-[#0A0A0A] truncate">{meta.title(row)}</span>
        {meta.subtitle(row) && (
          <span className="block text-[11px] text-[#9A9A97] truncate">{meta.subtitle(row)}</span>
        )}
      </span>
      <ChevronRight className="w-4 h-4 text-[#C9C9C4] group-hover:text-[#6E6E6C] flex-shrink-0" />
    </button>
  );
}

function RelatedGroup({
  label, entity, rows, onOpen,
}: { label: string; entity: string; rows: Row[]; onOpen: (entity: string, id: string) => void }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] px-3 mb-1">
        {label} <span className="tabular-nums">({rows.length})</span>
      </p>
      <div className="space-y-0.5">
        {rows.map((r) => <RelatedItem key={r.id} entity={entity} row={r} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

// ─── Panneau de détail (drawer) ─────────────────────────────────────────────
function DetailDrawer({
  entity, id, data, onClose, onOpen,
}: {
  entity: string;
  id: string;
  data: DataMap;
  onClose: () => void;
  onOpen: (entity: string, id: string) => void;
}) {
  const meta = ENTITY_META[entity];
  const row = (data[entity] ?? []).find((r) => r.id === id);

  const related = useMemo(() => {
    if (!row) return null;
    if (entity === "chantiers") {
      const byChantier = (e: string) => (data[e] ?? []).filter((r) => r.chantier_id === row.id);
      return {
        client: (data.clients ?? []).find((c) => c.id === row.client_id) ?? null,
        chef: (data.employees ?? []).find((e) => e.id === row.chef_chantier_id) ?? null,
        documents: byChantier("documents"),
        interventions: byChantier("interventions"),
        materials: byChantier("materials"),
        equipment: byChantier("equipment"),
        tasks: byChantier("tasks"),
      };
    }
    return null;
  }, [entity, row, data]);

  if (!row) return null;
  const Icon = meta.icon;

  // Rattachements ascendants (pour toute entité qui pointe vers un chantier/client/employé)
  const parentChantier = row.chantier_id ? (data.chantiers ?? []).find((c) => c.id === row.chantier_id) : null;
  const parentClient = row.client_id ? (data.clients ?? []).find((c) => c.id === row.client_id) : null;
  const parentEmployee = row.employee_id ? (data.employees ?? []).find((e) => e.id === row.employee_id) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="w-full max-w-[440px] h-full bg-white border-l border-[#EDEDE9] shadow-[-16px_0_50px_rgba(60,40,120,0.10)] flex flex-col animate-[slideIn_.3s_cubic-bezier(0.16,1,0.3,1)]">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-[#EDEDE9] flex-shrink-0">
          <span className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.accent}`}>
            <Icon className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A97]">{meta.label}</p>
            <h2 className="text-lg font-bold text-[#0A0A0A] tracking-[-0.01em] leading-tight">{meta.title(row)}</h2>
            {entity === "chantiers" && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${CHANTIER_STATUT[row.statut]?.cls ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                  {CHANTIER_STATUT[row.statut]?.label ?? row.statut}
                </span>
                <span className="text-[11px] text-[#9A9A97] tabular-nums">{row.avancement ?? 0}%</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-black/[0.05] flex items-center justify-center text-[#9A9A97] hover:text-[#0A0A0A] transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Avancement (chantier) */}
          {entity === "chantiers" && (
            <div className="h-1.5 w-full bg-[#F1F1EC] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, row.avancement ?? 0))}%` }}
              />
            </div>
          )}

          {/* Rattachements ascendants */}
          {(parentChantier || parentClient || parentEmployee) && (
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] px-3 mb-1">Rattaché à</p>
              {parentChantier && <RelatedItem entity="chantiers" row={parentChantier} onOpen={onOpen} />}
              {parentClient && <RelatedItem entity="clients" row={parentClient} onOpen={onOpen} />}
              {parentEmployee && <RelatedItem entity="employees" row={parentEmployee} onOpen={onOpen} />}
            </div>
          )}

          {/* Relations d'un chantier (le cœur du « tout est relié ») */}
          {related && (
            <div className="space-y-5">
              {(related.client || related.chef) && (
                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] px-3 mb-1">Acteurs</p>
                  {related.client && <RelatedItem entity="clients" row={related.client} onOpen={onOpen} />}
                  {related.chef && <RelatedItem entity="employees" row={related.chef} onOpen={onOpen} />}
                </div>
              )}
              <RelatedGroup label="Documents" entity="documents" rows={related.documents} onOpen={onOpen} />
              <RelatedGroup label="Interventions" entity="interventions" rows={related.interventions} onOpen={onOpen} />
              <RelatedGroup label="Matériaux" entity="materials" rows={related.materials} onOpen={onOpen} />
              <RelatedGroup label="Équipement" entity="equipment" rows={related.equipment} onOpen={onOpen} />
              <RelatedGroup label="Tâches" entity="tasks" rows={related.tasks} onOpen={onOpen} />
            </div>
          )}

          {/* Champs bruts */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] px-3 mb-1">Détails</p>
            <div className="px-3">
              {meta.detailFields.map((k) => <FieldRow key={k} k={k} v={row[k]} />)}
            </div>
          </div>
        </div>
      </aside>
      <style jsx global>{`
        @keyframes slideIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      `}</style>
    </div>
  );
}

// ─── Carte-tuile d'entité (vue d'ensemble) ──────────────────────────────────
function EntityTile({
  entity, rows, onClick,
}: { entity: string; rows: Row[]; onClick: () => void }) {
  const meta = ENTITY_META[entity];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className="group text-left bg-white border border-[#E7E7E4] rounded-2xl p-5 transition-all duration-300 hover:border-[#C9C9C4] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-center justify-between mb-4">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.accent}`}>
          <Icon className="w-5 h-5" />
        </span>
        <span className="text-2xl font-black text-[#0A0A0A] tabular-nums tracking-[-0.02em]">{rows.length}</span>
      </div>
      <h3 className="text-sm font-semibold text-[#0A0A0A]">{meta.label}</h3>
      <p className="text-[12px] text-[#9A9A97] truncate mt-0.5">
        {rows.length ? rows.slice(0, 3).map((r) => meta.title(r)).join(", ") : "Aucune donnée"}
      </p>
    </button>
  );
}

function SoonTile({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  return (
    <div className="bg-white/60 border border-dashed border-[#E7E7E4] rounded-2xl p-5 select-none">
      <div className="flex items-center justify-between mb-4">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-black/[0.03] text-[#C9C9C4]">
          <Icon className="w-5 h-5" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9A9A97] bg-black/[0.04] px-2 py-1 rounded-full">Bientôt</span>
      </div>
      <h3 className="text-sm font-semibold text-[#9A9A97]">{label}</h3>
      <p className="text-[12px] text-[#C9C9C4] mt-0.5">En cours de branchement</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const [data, setData] = useState<DataMap>({});
  const [appsCount, setAppsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null); // entité sélectionnée (null = vue d'ensemble)
  const [drawer, setDrawer] = useState<{ entity: string; id: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const entries = await Promise.all(
      ENTITY_ORDER.map(async (k) => [k, await listEntity(k)] as const)
    );
    setData(Object.fromEntries(entries));

    // Applications (modules) — lues en direct comme le fait le dashboard.
    try {
      const supabase = createClient();
      const { count } = await supabase
        .from("modules")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
      setAppsCount(count ?? 0);
    } catch {
      setAppsCount(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDrawer = useCallback((entity: string, id: string) => setDrawer({ entity, id }), []);

  const total = useMemo(
    () => ENTITY_ORDER.reduce((n, k) => n + (data[k]?.length ?? 0), 0),
    [data]
  );

  // Recherche globale sur toutes les entités chargées
  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return [];
    const out: { entity: string; row: Row }[] = [];
    for (const entity of ENTITY_ORDER) {
      for (const row of data[entity] ?? []) {
        if (norm(ENTITY_META[entity].search(row)).includes(q)) out.push({ entity, row });
      }
    }
    return out.slice(0, 40);
  }, [query, data]);

  const searching = query.trim().length > 0;

  return (
    <div className="min-h-full bg-[#FCFCFD]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center">
            <Boxes className="w-5 h-5 text-violet-600" />
          </span>
          <h1 className="text-2xl font-black text-[#0A0A0A] tracking-[-0.03em]">Workspace</h1>
        </div>
        <p className="text-[14px] text-[#6E6E6C] mb-6 ml-12">
          La mémoire de votre entreprise. {loading ? "Chargement…" : `${total} éléments reliés.`}
        </p>

        {/* Recherche globale */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#9A9AA6]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher partout : un client, un chantier, un document…"
            className="w-full pl-12 pr-11 py-3.5 rounded-2xl border border-[#E7E7EE] bg-white text-[14px] text-[#0A0A0A] placeholder-[#9A9AA6] focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 transition-all"
          />
          {searching && (
            <button onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9A9A97] hover:text-[#0A0A0A]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-[#9A9A97]">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : searching ? (
          // ─── Résultats de recherche ─────────────────────────────────────
          <div>
            <p className="text-[13px] text-[#6E6E6C] mb-3">
              {results.length} résultat{results.length > 1 ? "s" : ""} pour « {query.trim()} »
            </p>
            {results.length === 0 ? (
              <p className="text-sm text-[#9A9A97] py-12 text-center">Rien trouvé dans votre mémoire.</p>
            ) : (
              <div className="bg-white border border-[#E7E7E4] rounded-2xl p-2 divide-y divide-[#F1F1EC]">
                {results.map(({ entity, row }) => (
                  <div key={`${entity}-${row.id}`} className="py-0.5">
                    <RelatedItem entity={entity} row={row} onOpen={openDrawer} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : selected ? (
          // ─── Vue d'une entité ───────────────────────────────────────────
          <div>
            <button
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6E6E6C] hover:text-[#0A0A0A] mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Vue d&apos;ensemble
            </button>
            <div className="flex items-center gap-2.5 mb-4">
              {(() => { const I = ENTITY_META[selected].icon; return (
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${ENTITY_META[selected].accent}`}>
                  <I className="w-5 h-5" />
                </span>
              ); })()}
              <h2 className="text-lg font-bold text-[#0A0A0A]">{ENTITY_META[selected].label}</h2>
              <span className="text-[13px] text-[#9A9A97] tabular-nums">{data[selected]?.length ?? 0}</span>
            </div>
            {(data[selected]?.length ?? 0) === 0 ? (
              <p className="text-sm text-[#9A9A97] py-12 text-center">Aucune donnée pour le moment.</p>
            ) : (
              <div className="bg-white border border-[#E7E7E4] rounded-2xl p-2 divide-y divide-[#F1F1EC]">
                {(data[selected] ?? []).map((row) => (
                  <div key={row.id} className="py-0.5">
                    <RelatedItem entity={selected} row={row} onOpen={openDrawer} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          // ─── Vue d'ensemble ─────────────────────────────────────────────
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {ENTITY_ORDER.map((entity) => (
              <EntityTile key={entity} entity={entity} rows={data[entity] ?? []} onClick={() => setSelected(entity)} />
            ))}

            {/* Applications → renvoient vers la Bibliothèque */}
            <Link
              href="/library"
              className="group text-left bg-white border border-[#E7E7E4] rounded-2xl p-5 transition-all duration-300 hover:border-[#C9C9C4] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)]"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-pink-600 bg-pink-50">
                  <AppWindow className="w-5 h-5" />
                </span>
                <span className="text-2xl font-black text-[#0A0A0A] tabular-nums tracking-[-0.02em]">
                  {appsCount ?? "—"}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[#0A0A0A] flex items-center gap-1">
                Applications <ChevronRight className="w-3.5 h-3.5 text-[#C9C9C4] group-hover:text-[#6E6E6C]" />
              </h3>
              <p className="text-[12px] text-[#9A9A97] mt-0.5">Voir dans la Bibliothèque</p>
            </Link>

            <SoonTile label="Automatisations" icon={GitBranch} />
            <SoonTile label="Conversations" icon={MessageSquare} />
          </div>
        )}

        {/* État vide global */}
        {!loading && !searching && total === 0 && appsCount === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center mt-4">
            <div className="w-14 h-14 rounded-2xl border border-[#E7E7EE] bg-[#FAFAFC] flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-violet-600" strokeWidth={1.5} />
            </div>
            <h3 className="text-base font-bold text-[#0A0A0A] mb-1.5">Votre mémoire est encore vide</h3>
            <p className="text-sm text-[#6E6E6C] max-w-sm leading-relaxed">
              Dès que Batify traitera vos chantiers, clients et documents, tout apparaîtra ici, relié.
            </p>
          </div>
        )}
      </div>

      {drawer && (
        <DetailDrawer
          entity={drawer.entity}
          id={drawer.id}
          data={data}
          onClose={() => setDrawer(null)}
          onOpen={openDrawer}
        />
      )}
    </div>
  );
}
