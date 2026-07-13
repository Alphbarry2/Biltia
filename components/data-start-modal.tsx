"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CHOOSER « Comment démarrer les données ? » — s'affiche quand on utilise un
// template (ou à la création). Trois modes :
//   • Vierge  → l'app démarre VIDE ; les saisies alimentent le workspace.
//   • Import  → CSV/Excel parsé côté client (xlsx) → lignes envoyées à
//               /api/templates/instantiate qui les mappe + insère au workspace.
//   • Workspace → fenêtre sur le workspace : TOUT, ou une SÉLECTION d'éléments
//               (via /api/workspace/records).
// Le mode choisi est stocké en `data_scope` sur le module (voir lib/data-scope).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { FilePlus2, Upload, Database, Check, ChevronLeft, ChevronDown, Loader2, X, FileSpreadsheet } from "lucide-react";
import { useT } from "@/lib/i18n/context";

type WsRecord = { id: string; label: string; sub: string | null };
type WsEntity = { key: string; label: string; count: number; records: WsRecord[] };

type Props = {
  templateId: string;
  templateName: string;
  accent?: string;
  /** App créée → naviguer vers /apps/[id]. */
  onCreated: (appId: string) => void;
  /** 404 : pas une app phare instanciable → repli (adapter la maquette au chat). */
  onFallback: () => void;
  onClose: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClientScope = any;

export default function DataStartModal({ templateId, templateName, accent = "#4F46E5", onCreated, onFallback, onClose }: Props) {
  const t = useT();
  const [step, setStep] = useState<"choose" | "workspace" | "import">("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Workspace
  const [wsMode, setWsMode] = useState<"all" | "select">("all");
  const [wsEntities, setWsEntities] = useState<WsEntity[] | null>(null);
  const [wsLoading, setWsLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [openEntity, setOpenEntity] = useState<string | null>(null);

  // Import
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);

  const selectedCount = Object.values(selected).reduce((n, s) => n + s.size, 0);

  async function instantiate(dataScope: ClientScope, importRows?: Record<string, unknown>[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/templates/instantiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, dataScope, importRows }),
      });
      if (res.status === 404) {
        onFallback();
        return;
      }
      const data = await res.json().catch(() => null);
      if (res.ok && data?.id) {
        onCreated(String(data.id));
        return;
      }
      setError(data?.error || t("Création impossible.", "Creation failed."));
    } catch {
      setError(t("Réseau indisponible. Réessayez.", "Network unavailable. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function openWorkspace() {
    setStep("workspace");
    setError(null);
    if (wsEntities) return;
    setWsLoading(true);
    try {
      const res = await fetch("/api/workspace/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => null);
      setWsEntities(Array.isArray(data?.entities) ? data.entities : []);
    } catch {
      setWsEntities([]);
    } finally {
      setWsLoading(false);
    }
  }

  function confirmWorkspace() {
    if (wsMode === "all") return instantiate({ source: "workspace", mode: "all" });
    const records: { entity: string; id: string }[] = [];
    for (const [entity, ids] of Object.entries(selected)) ids.forEach((id) => records.push({ entity, id }));
    instantiate(records.length ? { source: "workspace", mode: "select", records } : { source: "workspace", mode: "all" });
  }

  function toggleRecord(entity: string, id: string) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[entity] ?? []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      next[entity] = set;
      return next;
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setError(null);
    setRows(null);
    try {
      const mod = await import("xlsx");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX: any = (mod as any).read ? mod : (mod as any).default;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
      if (!json.length) {
        setError(t("Ce fichier ne contient aucune ligne exploitable.", "This file contains no usable rows."));
        return;
      }
      setRows(json);
      setHeaders(Object.keys(json[0]).filter((h) => String(h).trim() !== ""));
    } catch {
      setError(t("Fichier illisible. Formats acceptés : CSV, Excel (.xlsx, .xls).", "Unreadable file. Accepted formats: CSV, Excel (.xlsx, .xls)."));
    } finally {
      setParsing(false);
    }
  }

  const A = accent;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-5" onClick={busy ? undefined : onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white pb-safe sm:pb-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            {step !== "choose" && (
              <button onClick={() => { setStep("choose"); setError(null); }} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800">
                <ChevronLeft className="w-3.5 h-3.5" /> {t("Retour", "Back")}
              </button>
            )}
            <h2 className="text-lg font-extrabold tracking-tight text-gray-900">
              {step === "choose" ? t("Comment démarrer ?", "How do you want to start?") : step === "workspace" ? t("Depuis le workspace", "From the workspace") : t("Importer un fichier", "Import a file")}
            </h2>
            <p className="text-[12.5px] text-gray-500 mt-0.5 truncate">{templateName}</p>
          </div>
          <button onClick={onClose} disabled={busy} className="shrink-0 w-8 h-8 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5">
          {error && <div className="mb-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-medium px-3.5 py-2.5">{error}</div>}

          {/* ── Étape : choix ── */}
          {step === "choose" && (
            <div className="space-y-2.5">
              <button
                onClick={() => instantiate({ source: "zero" })}
                disabled={busy}
                className="group w-full flex items-center gap-3.5 rounded-2xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-sm transition disabled:opacity-60"
              >
                <span className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${A}14`, color: A }}>
                  <FilePlus2 className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-gray-900">{t("Partir de zéro", "Start from scratch")}</span>
                  <span className="block text-[12.5px] text-gray-500">{t("Une app vide. Vous saisissez au fur et à mesure — tout se synchronise dans le workspace.", "An empty app. You enter data as you go — everything syncs to the workspace.")}</span>
                </span>
                {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </button>

              <button
                onClick={() => { setStep("import"); setError(null); }}
                disabled={busy}
                className="group w-full flex items-center gap-3.5 rounded-2xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-sm transition disabled:opacity-60"
              >
                <span className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${A}14`, color: A }}>
                  <Upload className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-gray-900">{t("Importer un fichier", "Import a file")}</span>
                  <span className="block text-[12.5px] text-gray-500">{t("Un fichier Excel ou CSV. On reconnaît les colonnes et on charge vos données.", "An Excel or CSV file. We recognize the columns and load your data.")}</span>
                </span>
              </button>

              <button
                onClick={openWorkspace}
                disabled={busy}
                className="group w-full flex items-center gap-3.5 rounded-2xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-sm transition disabled:opacity-60"
              >
                <span className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${A}14`, color: A }}>
                  <Database className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-gray-900">{t("Depuis mon workspace", "From my workspace")}</span>
                  <span className="block text-[12.5px] text-gray-500">{t("Utiliser vos données existantes : tout le workspace, ou une sélection d’éléments.", "Use your existing data: the whole workspace, or a selection of items.")}</span>
                </span>
              </button>
            </div>
          )}

          {/* ── Étape : workspace ── */}
          {step === "workspace" && (
            <div>
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                {(["all", "select"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setWsMode(m)}
                    className="rounded-2xl border p-3 text-left transition"
                    style={wsMode === m ? { borderColor: A, background: `${A}0D`, boxShadow: `0 0 0 1px ${A}` } : { borderColor: "#E5E7EB" }}
                  >
                    <span className="block font-bold text-[13.5px] text-gray-900">{m === "all" ? t("Tout le workspace", "The whole workspace") : t("Choisir des éléments", "Pick items")}</span>
                    <span className="block text-[11.5px] text-gray-500">{m === "all" ? t("L’app voit toutes vos données.", "The app sees all your data.") : t("Sélectionnez précisément.", "Select precisely.")}</span>
                  </button>
                ))}
              </div>

              {wsMode === "select" && (
                <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 max-h-[46vh] overflow-y-auto">
                  {wsLoading && (
                    <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> {t("Chargement de vos données…", "Loading your data…")}
                    </div>
                  )}
                  {!wsLoading && wsEntities && wsEntities.length === 0 && (
                    <div className="py-8 text-center text-[13px] text-gray-500">{t("Aucune donnée dans votre workspace pour l’instant. Choisissez « Partir de zéro » ou un import.", "No data in your workspace yet. Choose “Start from scratch” or an import.")}</div>
                  )}
                  {!wsLoading &&
                    (wsEntities ?? []).map((ent) => {
                      const sel = selected[ent.key]?.size ?? 0;
                      const open = openEntity === ent.key;
                      return (
                        <div key={ent.key}>
                          <button
                            onClick={() => setOpenEntity(open ? null : ent.key)}
                            className="w-full flex items-center gap-2 px-3.5 py-3 text-left hover:bg-gray-50"
                          >
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition ${open ? "" : "-rotate-90"}`} />
                            <span className="flex-1 font-semibold text-[13.5px] text-gray-800">{ent.label}</span>
                            {sel > 0 && <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: `${A}14`, color: A }}>{sel}</span>}
                            <span className="text-[11.5px] text-gray-400">{ent.count}</span>
                          </button>
                          {open && (
                            <div className="pb-1">
                              {ent.records.map((r) => {
                                const on = selected[ent.key]?.has(r.id) ?? false;
                                return (
                                  <button
                                    key={r.id}
                                    onClick={() => toggleRecord(ent.key, r.id)}
                                    className="w-full flex items-center gap-2.5 pl-9 pr-3.5 py-2 text-left hover:bg-gray-50"
                                  >
                                    <span
                                      className="shrink-0 w-4.5 h-4.5 rounded-md border flex items-center justify-center"
                                      style={on ? { background: A, borderColor: A } : { borderColor: "#D1D5DB", width: 18, height: 18 }}
                                    >
                                      {on && <Check className="w-3 h-3 text-white" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-[13px] text-gray-800 truncate">{r.label}</span>
                                      {r.sub && <span className="block text-[11px] text-gray-400 truncate">{r.sub}</span>}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              <button
                onClick={confirmWorkspace}
                disabled={busy}
                className="mt-4 w-full rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: A }}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {wsMode === "all" ? t("Utiliser tout le workspace", "Use the whole workspace") : selectedCount > 0 ? t(`Utiliser ${selectedCount} élément${selectedCount > 1 ? "s" : ""}`, `Use ${selectedCount} item${selectedCount > 1 ? "s" : ""}`) : t("Utiliser le workspace", "Use the workspace")}
              </button>
            </div>
          )}

          {/* ── Étape : import ── */}
          {step === "import" && (
            <div>
              <label className="block rounded-2xl border-2 border-dashed border-gray-200 hover:border-gray-300 p-6 text-center cursor-pointer transition">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <span className="mx-auto mb-2 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${A}14`, color: A }}>
                  <FileSpreadsheet className="w-5 h-5" />
                </span>
                <span className="block font-semibold text-[13.5px] text-gray-800">{fileName || t("Choisir un fichier Excel ou CSV", "Choose an Excel or CSV file")}</span>
                <span className="block text-[12px] text-gray-500 mt-0.5">{t(".xlsx, .xls ou .csv — la première ligne = les en-têtes de colonnes", ".xlsx, .xls or .csv — the first row = the column headers")}</span>
              </label>

              {parsing && (
                <div className="mt-3 flex items-center gap-2 text-[13px] text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("Lecture du fichier…", "Reading the file…")}
                </div>
              )}

              {rows && !parsing && (
                <div className="mt-3 rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-3">
                  <div className="text-[13px] font-semibold text-gray-800">{t(`${rows.length} ligne${rows.length > 1 ? "s" : ""} détectée${rows.length > 1 ? "s" : ""}`, `${rows.length} row${rows.length > 1 ? "s" : ""} detected`)}</div>
                  {headers.length > 0 && (
                    <div className="mt-1 text-[12px] text-gray-500">
                      {t("Colonnes", "Columns")} : {headers.slice(0, 8).join(", ")}
                      {headers.length > 8 ? "…" : ""}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => rows && rows.length && instantiate({ source: "import" }, rows)}
                disabled={busy || !rows || !rows.length}
                className="mt-4 w-full rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: A }}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {rows?.length ? t(`Importer ${rows.length} ligne${rows.length > 1 ? "s" : ""} et démarrer`, `Import ${rows.length} row${rows.length > 1 ? "s" : ""} and start`) : t("Choisissez un fichier", "Choose a file")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
