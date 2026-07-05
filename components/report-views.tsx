"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Vues Analyse de document & Rapport de contrôle — partagées entre l'atelier
// (/generate, panneau droit) et la Bibliothèque (/reports/[id], réouverture).
// ─────────────────────────────────────────────────────────────────────────────

import { ScanLine, Zap, Check, CheckCircle, Loader2, Save, FileText } from "lucide-react";

export type ExtractionLine = {
  designation: string;
  quantite?: number | null;
  unite?: string | null;
  pu_ht?: number | null;
  total_ht?: number | null;
};
export type Extraction = {
  type_document: string;
  emetteur: string | null;
  client: string | null;
  reference: string | null;
  date: string | null;
  echeance: string | null;
  montant_ht: number | null;
  montant_tva: number | null;
  montant_ttc: number | null;
  lignes: ExtractionLine[];
  resume: string;
};
export type AnalysisResult = { extraction: Extraction; answer: string; fileCount: number };

export type Anomaly = { type: string; gravite: string; detail: string; fichiers?: string[] };
export type ReportItem = { fichier: string; resume: string };
export type ReportResult = { items: ReportItem[]; anomalies: Anomaly[]; answer?: string };

export function fmtEur(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function gravityClass(g: string): string {
  const v = (g || "").toLowerCase();
  if (v.startsWith("haut") || v === "critique" || v === "elevee" || v === "élevée")
    return "bg-rose-50 text-rose-600 border-rose-200";
  if (v.startsWith("moy") || v === "attention")
    return "bg-[#fffbeb] text-[#b45309] border-[#fde68a]";
  return "bg-[#F6F6F9] text-[#6E6E6C] border-[#ECECF2]";
}

// Aperçu d'extraction d'un document analysé (produit « Analyse de documents »).
// `onSave` absent → mode lecture seule (réouverture depuis la Bibliothèque).
export function AnalysisView({
  analysis,
  onSave,
  saving = false,
  saved = false,
}: {
  analysis: AnalysisResult;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
}) {
  const ex = analysis.extraction;
  const fields: { label: string; value: string }[] = [
    { label: "Émetteur", value: ex.emetteur ?? "—" },
    { label: "Client", value: ex.client ?? "—" },
    { label: "Référence", value: ex.reference ?? "—" },
    { label: "Date", value: ex.date ?? "—" },
    { label: "Échéance", value: ex.echeance ?? "—" },
    { label: "Montant HT", value: fmtEur(ex.montant_ht) },
    { label: "TVA", value: fmtEur(ex.montant_tva) },
    { label: "Montant TTC", value: fmtEur(ex.montant_ttc) },
  ];
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[#F3EFFC] border border-[#E2D9F8] flex items-center justify-center">
            <ScanLine className="w-[18px] h-[18px] text-[#7C3AED]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold tracking-[-0.01em] text-[#0A0A0A] leading-tight">Document analysé</h3>
            <p className="text-xs text-[#6E6E6C] capitalize">{ex.type_document}</p>
          </div>
        </div>

        {analysis.answer && (
          <div className="mb-4 p-3.5 rounded-xl bg-[#F3EFFC] border border-[#E2D9F8] text-sm text-[#0A0A0A] leading-relaxed whitespace-pre-wrap">
            {analysis.answer}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {fields.map((f) => (
            <div key={f.label} className="p-3 rounded-xl bg-white border border-[#ECECF2]">
              <p className="text-[10px] font-bold text-[#6E6E6C] uppercase tracking-[0.1em] mb-1 truncate">
                {f.label}
              </p>
              <p className="text-sm font-semibold text-[#0A0A0A] truncate" title={f.value}>
                {f.value}
              </p>
            </div>
          ))}
        </div>

        {ex.lignes.length > 0 && (
          <div className="mb-4 rounded-xl border border-[#ECECF2] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F6F6F9]">
                  <th className="text-left font-semibold text-[#6E6E6C] px-3 py-2 text-xs">Désignation</th>
                  <th className="text-right font-semibold text-[#6E6E6C] px-3 py-2 text-xs">Qté</th>
                  <th className="text-right font-semibold text-[#6E6E6C] px-3 py-2 text-xs">PU HT</th>
                  <th className="text-right font-semibold text-[#6E6E6C] px-3 py-2 text-xs">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {ex.lignes.map((l, i) => (
                  <tr key={i} className="border-t border-[#ECECF2]">
                    <td className="px-3 py-2 text-[#0A0A0A]">{l.designation}</td>
                    <td className="px-3 py-2 text-right text-[#6E6E6C] tabular-nums">
                      {l.quantite != null ? `${l.quantite}${l.unite ? " " + l.unite : ""}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-[#6E6E6C] tabular-nums">{fmtEur(l.pu_ht)}</td>
                    <td className="px-3 py-2 text-right text-[#0A0A0A] tabular-nums">{fmtEur(l.total_ht)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ex.resume && (
          <p className="text-sm text-[#6E6E6C] leading-relaxed mb-5">{ex.resume}</p>
        )}

        {onSave && (
          <>
            <button
              onClick={onSave}
              disabled={saving || saved}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A0A0A] text-white text-sm font-semibold shadow-[0_4px_14px_rgba(60,40,120,0.08)] hover:shadow-[0_8px_24px_rgba(60,40,120,0.12)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saved ? (
                <>
                  <CheckCircle className="w-4 h-4" /> Enregistré
                </>
              ) : saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Enregistrer dans le workspace
                </>
              )}
            </button>
            <p className="text-xs text-[#6E6E6C] mt-2">
              Ajouté à vos Documents. Rien n&apos;est enregistré sans votre validation.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Rapport de contrôle par lot (produit « Automatisations »).
export function ReportView({ report }: { report: ReportResult }) {
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[#F3EFFC] border border-[#E2D9F8] flex items-center justify-center">
            <Zap className="w-[18px] h-[18px] text-[#7C3AED]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold tracking-[-0.01em] text-[#0A0A0A] leading-tight">Rapport de contrôle</h3>
            <p className="text-xs text-[#6E6E6C]">
              {report.items.length} fichier(s) · {report.anomalies.length} anomalie(s)
            </p>
          </div>
        </div>

        {report.answer && (
          <div className="mb-4 p-3.5 rounded-xl bg-[#F3EFFC] border border-[#E2D9F8] text-sm text-[#0A0A0A] leading-relaxed whitespace-pre-wrap">
            {report.answer}
          </div>
        )}

        {report.anomalies.length === 0 ? (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 mb-4">
            <Check className="w-4 h-4 flex-shrink-0" /> Aucune anomalie détectée.
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            {report.anomalies.map((a, i) => (
              <div key={i} className="p-3.5 rounded-xl bg-white border border-[#ECECF2]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${gravityClass(
                      a.gravite
                    )}`}
                  >
                    {a.gravite || "info"}
                  </span>
                  <span className="text-xs font-semibold text-[#0A0A0A] capitalize">
                    {(a.type || "").replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-sm text-[#0A0A0A] leading-relaxed">{a.detail}</p>
                {a.fichiers && a.fichiers.length > 0 && (
                  <p className="text-xs text-[#6E6E6C] mt-1.5 truncate">
                    📎 {a.fichiers.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {report.items.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-[#6E6E6C] uppercase tracking-[0.12em] mb-2">
              Fichiers traités
            </p>
            <div className="space-y-1.5">
              {report.items.map((it, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-[#F6F6F9] border border-[#ECECF2]">
                  <FileText className="w-4 h-4 text-[#6E6E6C] flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0A0A0A] truncate">{it.fichier}</p>
                    <p className="text-xs text-[#6E6E6C] leading-relaxed">{it.resume}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
