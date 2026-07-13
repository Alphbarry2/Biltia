"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AnnotationCanvas — mode « Annoter & enrichir » (l'IA propose, l'humain ajuste).
//
// Rend un document (image) + une COUCHE d'annotations positionnées en coordonnées
// normalisées (0..1) proposées par /api/annotate. L'utilisateur peut : déplacer un
// repère (best-effort corrigeable), en ajouter/supprimer, éditer le libellé, et
// RELIER une annotation au workspace (créer une tâche ou une réserve). Export en
// image (couche aplatie). Non destructif : le document d'origine n'est pas modifié.
//
// PDF : l'overlay visuel n'est pas encore branché (nécessite un rendu de page) →
// on affiche la LISTE des repères. Pour l'overlay, joindre une image du plan.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  MapPin, Plus, Download, Trash2, Check, Loader2, ListChecks, AlertTriangle, X,
} from "lucide-react";
import { useT } from "@/lib/i18n/context";

export type Confiance = "elevee" | "moyenne" | "faible";
export type Annotation = {
  id: string;
  type: "pin" | "circle";
  x: number; // centre X normalisé 0..1
  y: number; // centre Y normalisé 0..1
  rayon?: number | null; // pour circle : fraction de la largeur
  label: string;
  numero?: number | null;
  confiance: Confiance;
  incertain?: boolean;
};

export type AnnotationDoc = { name: string; mediaType: string; dataUrl: string };

const CONF_RING: Record<Confiance, string> = {
  elevee: "#059669",
  moyenne: "#B45309",
  faible: "#E11D48",
};

let uidCounter = 0;
const uid = () => `m${Date.now().toString(36)}_${uidCounter++}`;

export function AnnotationCanvas({
  doc,
  initial,
  resume,
  startAdding,
}: {
  doc: AnnotationDoc;
  initial: Annotation[];
  resume?: string;
  /** Ouvre directement en mode « poser un repère » (annotation à la main). */
  startAdding?: boolean;
}) {
  const t = useT();
  const isImage = doc.mediaType.startsWith("image/");
  const [annos, setAnnos] = useState<Annotation[]>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(Boolean(startAdding) && initial.length === 0 && isImage);
  const [linked, setLinked] = useState<Record<string, string>>({}); // id → "tâche"|"réserve"
  const [busy, setBusy] = useState<string | null>(null); // id en cours de liaison
  const [exporting, setExporting] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);

  const uncertainCount = annos.filter((a) => a.incertain).length;

  const normFromEvent = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }, []);

  const onWrapPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const n = normFromEvent(e.clientX, e.clientY);
    if (!n) return;
    setAnnos((prev) => prev.map((a) => (a.id === dragRef.current ? { ...a, x: n.x, y: n.y } : a)));
  };
  const endDrag = () => { dragRef.current = null; };

  const onWrapClick = (e: ReactMouseEvent) => {
    if (!adding) return;
    const n = normFromEvent(e.clientX, e.clientY);
    if (!n) return;
    const a: Annotation = { id: uid(), type: "pin", x: n.x, y: n.y, label: t("Repère", "Marker"), numero: null, confiance: "elevee" };
    setAnnos((prev) => [...prev, a]);
    setSelected(a.id);
    setAdding(false);
  };

  const updateLabel = (id: string, label: string) =>
    setAnnos((prev) => prev.map((a) => (a.id === id ? { ...a, label } : a)));
  const removeAnno = (id: string) => {
    setAnnos((prev) => prev.filter((a) => a.id !== id));
    if (selected === id) setSelected(null);
  };

  const linkToWorkspace = async (a: Annotation, entity: "tasks" | "reserves") => {
    setBusy(a.id);
    const ref = `${t("Repère", "Marker")} « ${a.label} »${a.numero ? ` (${t("n°", "#")}${a.numero})` : ""} ${t("sur le document", "on document")} « ${doc.name} »${a.incertain ? ` — ${t("à vérifier", "to verify")}` : ""}.`;
    const values =
      entity === "tasks"
        ? { title: a.label, description: ref, status: "todo", priority: a.incertain ? "high" : "normal" }
        : { titre: a.label, description: ref, type: a.incertain ? "incident" : "reserve", statut: "ouverte" };
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, action: "create", values }),
      });
      if (res.ok) setLinked((prev) => ({ ...prev, [a.id]: entity === "tasks" ? t("tâche", "task") : t("réserve", "reserve") }));
    } catch {
      /* silencieux : l'utilisateur peut réessayer */
    } finally {
      setBusy(null);
    }
  };

  const exportImage = async () => {
    if (!wrapRef.current || exporting) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(wrapRef.current, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      const url = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = url;
      link.download = `${doc.name.replace(/\.[^.]+$/, "")}-annote.png`;
      link.click();
    } catch {
      /* export best-effort */
    } finally {
      setExporting(false);
    }
  };

  const sel = annos.find((a) => a.id === selected) ?? null;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-5">
      <div className="max-w-3xl mx-auto">
        {/* En-tête */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-[#F3EFFC] border border-[#E2D9F8] flex items-center justify-center flex-shrink-0">
            <MapPin className="w-[18px] h-[18px] text-[#7C3AED]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold tracking-[-0.01em] text-[#0A0A0A] leading-tight truncate">{t("Document annoté", "Annotated document")}</h3>
            <p className="text-xs text-[#6E6E6C] truncate">{doc.name} · {annos.length} {t(annos.length > 1 ? "repères" : "repère", annos.length > 1 ? "markers" : "marker")}{uncertainCount > 0 ? ` · ${uncertainCount} ${t("à vérifier", "to verify")}` : ""}</p>
          </div>
          <button
            onClick={exportImage}
            disabled={exporting || !isImage}
            title={isImage ? t("Télécharger l'image annotée", "Download the annotated image") : t("Export dispo pour les images", "Export available for images")}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0A0A0A] bg-white border border-[#E7E7E4] rounded-full px-3 py-1.5 hover:border-[#C9C9C4] transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Image
          </button>
        </div>

        {resume && <p className="text-[13px] text-[#6E6E6C] leading-relaxed mb-3">{resume}</p>}

        {isImage ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setAdding((v) => !v)}
                className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-3 py-1.5 transition-colors border ${adding ? "bg-[#7C3AED] text-white border-[#7C3AED]" : "bg-white text-[#0A0A0A] border-[#E7E7E4] hover:border-[#C9C9C4]"}`}
              >
                <Plus className="w-3.5 h-3.5" /> {adding ? t("Cliquez sur le plan…", "Click on the plan…") : t("Ajouter un repère", "Add a marker")}
              </button>
              <span className="text-[11px] text-[#9A9AA6]">{t("Glissez un repère pour l’ajuster.", "Drag a marker to adjust it.")}</span>
            </div>

            {/* Couche image + annotations */}
            <div
              ref={wrapRef}
              onPointerMove={onWrapPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
              onClick={onWrapClick}
              className={`relative w-full select-none rounded-xl overflow-hidden border border-[#ECECF2] bg-white ${adding ? "cursor-crosshair" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={doc.dataUrl} alt={doc.name} className="block w-full h-auto pointer-events-none" draggable={false} />

              {annos.map((a) => {
                const color = a.incertain ? CONF_RING.moyenne : CONF_RING[a.confiance];
                if (a.type === "circle") {
                  const d = Math.max(0.02, a.rayon ?? 0.05) * 2; // diamètre = fraction de largeur
                  return (
                    <div
                      key={a.id}
                      onPointerDown={(e) => { e.stopPropagation(); dragRef.current = a.id; setSelected(a.id); }}
                      onClick={(e) => { e.stopPropagation(); setSelected(a.id); }}
                      style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${d * 100}%`, aspectRatio: "1 / 1", borderColor: color, boxShadow: selected === a.id ? `0 0 0 2px ${color}55` : undefined }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] cursor-move"
                      title={a.label}
                    >
                      {a.numero != null && (
                        <span style={{ background: color }} className="absolute -top-2 -left-2 min-w-5 h-5 px-1 grid place-items-center rounded-full text-white text-[11px] font-bold">{a.numero}</span>
                      )}
                    </div>
                  );
                }
                return (
                  <button
                    key={a.id}
                    onPointerDown={(e) => { e.stopPropagation(); dragRef.current = a.id; setSelected(a.id); }}
                    onClick={(e) => { e.stopPropagation(); setSelected(a.id); }}
                    style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, background: color, boxShadow: selected === a.id ? `0 0 0 3px ${color}55` : "0 1px 4px rgba(0,0,0,.35)" }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 min-w-[24px] h-6 px-1.5 grid place-items-center rounded-full text-white text-[12px] font-bold cursor-move border-2 border-white"
                    title={a.label}
                  >
                    {a.numero != null ? a.numero : a.incertain ? "?" : "•"}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="mb-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-[13px] text-[#7c5410]">
            {t("L’overlay visuel arrive pour les PDF. En attendant, voici les repères détectés — joignez une ", "The visual overlay is coming for PDFs. In the meantime, here are the detected markers — attach an ")}<b>image</b>{t(" du plan (photo ou capture) pour l’annotation visuelle.", " of the plan (photo or screenshot) for visual annotation.")}
          </div>
        )}

        {/* Éditeur du repère sélectionné */}
        {sel && (
          <div className="mt-3 rounded-xl border border-[#E2D9F8] bg-[#FBFAFF] p-3.5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {sel.incertain && <AlertTriangle className="w-4 h-4 text-[#B45309] flex-shrink-0" />}
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[#7C3AED]">{t("Repère", "Marker")} {sel.numero != null ? `${t("n°", "#")}${sel.numero}` : ""}</span>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#9A9AA6] hover:text-[#0A0A0A]"><X className="w-4 h-4" /></button>
            </div>
            <input
              value={sel.label}
              onChange={(e) => updateLabel(sel.id, e.target.value)}
              className="w-full rounded-lg border border-[#E7E7EE] bg-white px-3 py-2 text-[13.5px] text-[#0A0A0A] focus:outline-none focus:border-violet-400 mb-2.5"
              placeholder={t("Libellé du repère", "Marker label")}
            />
            {linked[sel.id] ? (
              <p className="text-[13px] font-semibold text-emerald-700 flex items-center gap-1.5"><Check className="w-4 h-4" /> {linked[sel.id]} {t("créée dans le workspace", "created in the workspace")}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => linkToWorkspace(sel, "tasks")}
                  disabled={busy === sel.id}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white bg-[#0A0A0A] rounded-full px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
                >
                  {busy === sel.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListChecks className="w-3.5 h-3.5" />} {t("Créer une tâche", "Create a task")}
                </button>
                <button
                  onClick={() => linkToWorkspace(sel, "reserves")}
                  disabled={busy === sel.id}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#B45309] bg-[#fffbeb] border border-[#fde68a] rounded-full px-3 py-1.5 hover:bg-[#fef3c7] disabled:opacity-50"
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> {t("Créer une réserve", "Create a reserve")}
                </button>
                <button
                  onClick={() => removeAnno(sel.id)}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#E11D48] hover:bg-rose-50 rounded-full px-2.5 py-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t("Supprimer", "Delete")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Liste des repères (source unique, cliquable) */}
        {annos.length > 0 && (
          <ul className="mt-3 space-y-1">
            {annos.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setSelected(a.id)}
                  className={`w-full flex items-center gap-2 text-left rounded-lg px-2.5 py-1.5 border transition-colors ${selected === a.id ? "border-[#E2D9F8] bg-[#F3EFFC]" : "border-transparent hover:bg-[#F6F6F9]"}`}
                >
                  <span style={{ background: a.incertain ? CONF_RING.moyenne : CONF_RING[a.confiance] }} className="w-5 h-5 grid place-items-center rounded-full text-white text-[10px] font-bold flex-shrink-0">
                    {a.numero != null ? a.numero : "•"}
                  </span>
                  <span className="text-[13px] text-[#0A0A0A] truncate flex-1">{a.label}</span>
                  {a.incertain && <span className="text-[11px] font-semibold text-[#B45309] flex-shrink-0">{t("à vérifier", "to verify")}</span>}
                  {linked[a.id] && <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
