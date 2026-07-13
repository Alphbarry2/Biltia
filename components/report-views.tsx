"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Vues Analyse de document & Rapport de contrôle — partagées entre l'atelier
// (/generate, panneau droit) et la Bibliothèque (/reports/[id], réouverture).
// ─────────────────────────────────────────────────────────────────────────────

import { ScanLine, Zap, Check, CheckCircle, Loader2, Save, FileText, LayoutGrid } from "lucide-react";
import { useT } from "@/lib/i18n/context";

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
export type Confiance = "elevee" | "moyenne" | "faible";
export type Comptage = { libelle: string; quantite: number; confiance: Confiance };
export type Incertitude = { libelle: string; raison: string };
/** Ce que Biltia sait TIRER du document, une fois lu : une app de métré depuis un
 *  plan, une app de gestion depuis un tableau, un document depuis un courrier.
 *  Rendu en cartes cliquables sous l'analyse — l'action ne part qu'au CLIC (une
 *  app coûte 300 crédits : jamais de dépense par surprise sur un dépôt de fichier). */
export type Proposition = {
  titre: string;
  description: string;
  action: "module" | "document" | "extract";
  prompt: string;
};
export type AnalysisResult = {
  extraction: Extraction;
  answer: string;
  fileCount: number;
  comptages?: Comptage[];
  incertitudes?: Incertitude[];
  confiance?: Confiance | null;
  propositions?: Proposition[];
};

const CONF_META: Record<Confiance, { cls: string }> = {
  elevee: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  moyenne: { cls: "bg-[#fffbeb] text-[#b45309] border-[#fde68a]" },
  faible: { cls: "bg-rose-50 text-rose-600 border-rose-200" },
};

function confLabel(t: (fr: string, en: string) => string, c: Confiance): string {
  return c === "elevee" ? t("Confiance élevée", "High confidence") : c === "faible" ? t("Confiance faible", "Low confidence") : t("Confiance moyenne", "Medium confidence");
}

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
  onPropose,
  proposing = false,
}: {
  analysis: AnalysisResult;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
  /** Clic sur une proposition (créer l'app de métré, produire le document…).
   *  Absent → mode lecture seule (réouverture depuis la Bibliothèque). */
  onPropose?: (p: Proposition) => void;
  proposing?: boolean;
}) {
  const t = useT();
  const ex = analysis.extraction;
  const fields: { label: string; value: string }[] = [
    { label: t("Émetteur", "Issuer"), value: ex.emetteur ?? "—" },
    { label: t("Client", "Client"), value: ex.client ?? "—" },
    { label: t("Référence", "Reference"), value: ex.reference ?? "—" },
    { label: t("Date", "Date"), value: ex.date ?? "—" },
    { label: t("Échéance", "Due date"), value: ex.echeance ?? "—" },
    { label: t("Montant HT", "Amount excl. tax"), value: fmtEur(ex.montant_ht) },
    { label: t("TVA", "VAT"), value: fmtEur(ex.montant_tva) },
    { label: t("Montant TTC", "Amount incl. tax"), value: fmtEur(ex.montant_ttc) },
  ];
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[#F3EFFC] border border-[#E2D9F8] flex items-center justify-center">
            <ScanLine className="w-[18px] h-[18px] text-[#7C3AED]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold tracking-[-0.01em] text-[#0A0A0A] leading-tight">{t("Document analysé", "Analyzed document")}</h3>
            <p className="text-xs text-[#6E6E6C] capitalize">{ex.type_document}</p>
          </div>
        </div>

        {analysis.answer && (
          <div className="mb-4 p-3.5 rounded-xl bg-[#F3EFFC] border border-[#E2D9F8] text-sm text-[#0A0A0A] leading-relaxed whitespace-pre-wrap">
            {analysis.answer}
          </div>
        )}

        {/* FIABILITÉ — comptages avec niveau de confiance (jamais un nombre sec). */}
        {analysis.comptages && analysis.comptages.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {analysis.comptages.map((c, i) => {
              const meta = CONF_META[c.confiance] ?? CONF_META.moyenne;
              return (
                <div key={i} className="p-3 rounded-xl bg-white border border-[#ECECF2]">
                  <p className="text-2xl font-bold text-[#0A0A0A] tabular-nums leading-none mb-1">{c.quantite}</p>
                  <p className="text-[12px] font-medium text-[#0A0A0A] truncate capitalize" title={c.libelle}>{c.libelle}</p>
                  <span className={`mt-1.5 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.cls}`}>
                    {confLabel(t, c.confiance)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* FIABILITÉ — éléments à VÉRIFIER (l'incertitude assumée, pas cachée). */}
        {analysis.incertitudes && analysis.incertitudes.length > 0 && (
          <div className="mb-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3.5">
            <p className="text-[13px] font-semibold text-[#b45309] mb-2">
              {t(`⚠️ ${analysis.incertitudes.length} élément${analysis.incertitudes.length > 1 ? "s" : ""} à vérifier`, `⚠️ ${analysis.incertitudes.length} item${analysis.incertitudes.length > 1 ? "s" : ""} to check`)}
            </p>
            <ul className="space-y-1.5">
              {analysis.incertitudes.map((it, i) => (
                <li key={i} className="text-[13px] text-[#7c5410] leading-snug">
                  <span className="font-medium text-[#0A0A0A]">{it.libelle}</span>
                  {it.raison ? <span className="text-[#8a6d3b]"> — {it.raison}</span> : null}
                </li>
              ))}
            </ul>
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
                  <th className="text-left font-semibold text-[#6E6E6C] px-3 py-2 text-xs">{t("Désignation", "Description")}</th>
                  <th className="text-right font-semibold text-[#6E6E6C] px-3 py-2 text-xs">{t("Qté", "Qty")}</th>
                  <th className="text-right font-semibold text-[#6E6E6C] px-3 py-2 text-xs">{t("PU HT", "Unit excl. tax")}</th>
                  <th className="text-right font-semibold text-[#6E6E6C] px-3 py-2 text-xs">{t("Total HT", "Total excl. tax")}</th>
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
                  <CheckCircle className="w-4 h-4" /> {t("Enregistré", "Saved")}
                </>
              ) : saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("Enregistrement…", "Saving…")}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> {t("Enregistrer dans le workspace", "Save to workspace")}
                </>
              )}
            </button>
            <p className="text-xs text-[#6E6E6C] mt-2">
              {t("Ajouté à vos Documents. Rien n'est enregistré sans votre validation.", "Added to your Documents. Nothing is saved without your approval.")}
            </p>
          </>
        )}

        {/* CE QUE BILTIA PEUT EN TIRER — propositions déduites de la LECTURE du
            document (plan → app de métré, tableau → app de gestion…). Rien ne
            part sans un clic : une app coûte 300 crédits. */}
        {onPropose && analysis.propositions && analysis.propositions.length > 0 && (
          <div className="mt-6 pt-5 border-t border-[#EDEDEC]">
            <p className="text-sm font-semibold text-[#0A0A0A] mb-1">
              {t("Ce que je peux en faire", "What I can do with this")}
            </p>
            <p className="text-xs text-[#6E6E6C] mb-3">
              {t("D'après ce que j'ai lu dans le document.", "Based on what I read in the document.")}
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {analysis.propositions.map((p, i) => (
                <button
                  key={i}
                  onClick={() => onPropose(p)}
                  disabled={proposing}
                  className="text-left p-3.5 rounded-xl border border-[#EDEDEC] bg-white hover:border-[#6E56CF] hover:shadow-[0_4px_14px_rgba(60,40,120,0.08)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-[#0A0A0A]">
                    {p.action === "module" ? (
                      <LayoutGrid className="w-4 h-4 shrink-0 text-[#6E56CF]" />
                    ) : p.action === "document" ? (
                      <FileText className="w-4 h-4 shrink-0 text-[#6E56CF]" />
                    ) : (
                      <Save className="w-4 h-4 shrink-0 text-[#6E56CF]" />
                    )}
                    {p.titre}
                  </span>
                  {p.description && (
                    <span className="block text-xs text-[#6E6E6C] mt-1 leading-relaxed">{p.description}</span>
                  )}
                  {p.action === "module" && (
                    <span className="block text-[11px] text-[#8A8A88] mt-1.5">
                      {t("Création d'application · 300 crédits", "App creation · 300 credits")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Rapport de contrôle par lot (produit « Automatisations »).
export function ReportView({ report }: { report: ReportResult }) {
  const t = useT();
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[#F3EFFC] border border-[#E2D9F8] flex items-center justify-center">
            <Zap className="w-[18px] h-[18px] text-[#7C3AED]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold tracking-[-0.01em] text-[#0A0A0A] leading-tight">{t("Rapport de contrôle", "Check report")}</h3>
            <p className="text-xs text-[#6E6E6C]">
              {t(`${report.items.length} fichier(s) · ${report.anomalies.length} anomalie(s)`, `${report.items.length} file(s) · ${report.anomalies.length} anomaly(ies)`)}
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
            <Check className="w-4 h-4 flex-shrink-0" /> {t("Aucune anomalie détectée.", "No anomaly detected.")}
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
              {t("Fichiers traités", "Processed files")}
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
