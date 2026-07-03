"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { slugify, shortId } from "@/lib/slug";
import { useTypewriter } from "@/components/site";
import { TEMPLATE_PREVIEWS } from "@/lib/template-previews";
import {
  Mic,
  MicOff,
  Sparkles,
  ChevronLeft,
  Save,
  ExternalLink,
  Loader2,
  CheckCircle,
  Wrench,
  Send,
  RotateCcw,
  Smartphone,
  Monitor,
  LayoutTemplate,
  Globe,
  Copy,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
  Maximize2,
  Minimize2,
  FileText,
  Zap,
  Paperclip,
  X,
  AlertTriangle,
  ScanLine,
  Check,
} from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Format = "auto" | "mobile" | "desktop";

// Format de sortie chirurgical décidé par l'aiguillage (cf. lib/kind-router.ts).
type Kind = "document" | "action" | "module";

// ── Fichiers joints & résultats d'analyse (produits Analyse / Automatisations) ──
type AttachedFile = { name: string; mediaType: string; data: string; size: number };

type ExtractionLine = {
  designation: string;
  quantite?: number | null;
  unite?: string | null;
  pu_ht?: number | null;
  total_ht?: number | null;
};
type Extraction = {
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
type AnalysisResult = { extraction: Extraction; answer: string; fileCount: number };

type Anomaly = { type: string; gravite: string; detail: string; fichiers?: string[] };
type ReportItem = { fichier: string; resume: string };
type ReportResult = { items: ReportItem[]; anomalies: Anomaly[]; answer?: string };

// Types MIME acceptés côté client (miroir de lib/vision.ts).
const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILES_CLIENT = 5;
const MAX_FILE_BYTES_CLIENT = 3.5 * 1024 * 1024;

function fmtEur(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// Lit un fichier en base64 pur (sans préfixe data-URL).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result);
      const comma = res.indexOf(",");
      resolve(comma !== -1 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

function gravityClass(g: string): string {
  const v = (g || "").toLowerCase();
  if (v.startsWith("haut") || v === "critique" || v === "elevee" || v === "élevée")
    return "bg-[#fdf2f0] text-danger border-danger/30";
  if (v.startsWith("moy") || v === "attention")
    return "bg-[#fffbeb] text-[#b45309] border-[#fde68a]";
  return "bg-muted text-muted-foreground border-border";
}

// Aperçu d'extraction d'un document analysé (produit « Analyse de documents »).
function AnalysisView({
  analysis,
  onSave,
  saving,
  saved,
}: {
  analysis: AnalysisResult;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
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
          <div className="w-9 h-9 rounded-xl bg-accent-soft border border-accent/30 flex items-center justify-center">
            <ScanLine className="w-[18px] h-[18px] text-accent-deep" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-foreground leading-tight">Document analysé</h3>
            <p className="text-xs text-muted-foreground capitalize">{ex.type_document}</p>
          </div>
        </div>

        {analysis.answer && (
          <div className="mb-4 p-3.5 rounded-xl bg-accent-soft border border-accent/20 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {analysis.answer}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {fields.map((f) => (
            <div key={f.label} className="p-3 rounded-xl bg-card border border-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1 truncate">
                {f.label}
              </p>
              <p className="text-sm font-semibold text-foreground truncate" title={f.value}>
                {f.value}
              </p>
            </div>
          ))}
        </div>

        {ex.lignes.length > 0 && (
          <div className="mb-4 rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left font-semibold text-muted-foreground px-3 py-2 text-xs">Désignation</th>
                  <th className="text-right font-semibold text-muted-foreground px-3 py-2 text-xs">Qté</th>
                  <th className="text-right font-semibold text-muted-foreground px-3 py-2 text-xs">PU HT</th>
                  <th className="text-right font-semibold text-muted-foreground px-3 py-2 text-xs">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {ex.lignes.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">{l.designation}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                      {l.quantite != null ? `${l.quantite}${l.unite ? " " + l.unite : ""}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{fmtEur(l.pu_ht)}</td>
                    <td className="px-3 py-2 text-right text-foreground tabular-nums">{fmtEur(l.total_ht)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ex.resume && (
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">{ex.resume}</p>
        )}

        <button
          onClick={onSave}
          disabled={saving || saved}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-depth-1 hover:shadow-depth-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
        <p className="text-xs text-muted-foreground mt-2">
          Ajouté à vos Documents. Rien n&apos;est enregistré sans votre validation.
        </p>
      </div>
    </div>
  );
}

// Rapport de contrôle par lot (produit « Automatisations »).
function ReportView({ report }: { report: ReportResult }) {
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-accent-soft border border-accent/30 flex items-center justify-center">
            <Zap className="w-[18px] h-[18px] text-accent-deep" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-foreground leading-tight">Rapport de contrôle</h3>
            <p className="text-xs text-muted-foreground">
              {report.items.length} fichier(s) · {report.anomalies.length} anomalie(s)
            </p>
          </div>
        </div>

        {report.answer && (
          <div className="mb-4 p-3.5 rounded-xl bg-accent-soft border border-accent/20 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {report.answer}
          </div>
        )}

        {report.anomalies.length === 0 ? (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-[#f0fdf9] border border-[#99f6e4] text-sm text-[#0d9488] mb-4">
            <Check className="w-4 h-4 flex-shrink-0" /> Aucune anomalie détectée.
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            {report.anomalies.map((a, i) => (
              <div key={i} className="p-3.5 rounded-xl bg-card border border-border">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${gravityClass(
                      a.gravite
                    )}`}
                  >
                    {a.gravite || "info"}
                  </span>
                  <span className="text-xs font-semibold text-foreground capitalize">
                    {(a.type || "").replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{a.detail}</p>
                {a.fichiers && a.fichiers.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5 truncate">
                    📎 {a.fichiers.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {report.items.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-2">
              Fichiers traités
            </p>
            <div className="space-y-1.5">
              {report.items.map((it, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 border border-border">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{it.fichier}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{it.resume}</p>
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

const DOC_LABELS: Record<string, string> = {
  avenant: "Avenant",
  pv_reception: "PV de réception",
  mise_en_demeure: "Mise en demeure",
  devis: "Devis",
  facture: "Facture",
  attestation: "Attestation",
  courrier: "Courrier",
  ordre_de_service: "Ordre de service",
  bon_de_commande: "Bon de commande",
  levee_reserves: "Levée de réserves",
};

function docLabel(docType: string | null): string {
  if (!docType) return "";
  return DOC_LABELS[docType] ?? docType.replace(/_/g, " ");
}

function kindLabel(kind: Kind, docType: string | null): string {
  if (kind === "document") {
    const d = docLabel(docType);
    return d ? `Document · ${d}` : "Document";
  }
  return kind === "action" ? "Action" : "Module";
}


const FORMATS: { id: Format; label: string; icon: React.ReactNode }[] = [
  { id: "auto", label: "Auto", icon: <LayoutTemplate className="w-3.5 h-3.5" /> },
  { id: "mobile", label: "Mobile", icon: <Smartphone className="w-3.5 h-3.5" /> },
  { id: "desktop", label: "Desktop", icon: <Monitor className="w-3.5 h-3.5" /> },
];

const GEN_PLACEHOLDERS = [
  "Sors-moi l'avenant pour le carrelage validé, 45 m²…",
  "Quels chantiers sont en retard cette semaine ?",
  "Vérifie les prix de ces 30 bons de livraison…",
  "Un suivi de mes chantiers avec l'avancement…",
  "Rédige une mise en demeure pour la facture impayée…",
];

export default function GeneratePage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const typed = useTypewriter(GEN_PLACEHOLDERS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHTML, setGeneratedHTML] = useState("");
  const [appName, setAppName] = useState("Mon application");
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [format, setFormat] = useState<Format>("auto");
  const [kind, setKind] = useState<Kind | null>(null);
  const [docType, setDocType] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixCount, setAutoFixCount] = useState(0);
  const [visualEditMode, setVisualEditMode] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [generationPhase, setGenerationPhase] = useState(0);
  // Analyse de fichiers (produits Analyse / Automatisations).
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [savingEntity, setSavingEntity] = useState(false);
  const [entitySaved, setEntitySaved] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const GENERATION_PHASES = [
    { label: "Analyse du besoin métier…", sub: "Identification des champs et règles BTP" },
    { label: "Architecture de l'interface…", sub: "Structure des vues et navigation" },
    { label: "Construction des fonctionnalités…", sub: "CRUD, calculs, persistance localStorage" },
    { label: "Finalisation & contrôle qualité…", sub: "Vérification des formules et des données" },
  ];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const iframeErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingErrorsRef = useRef<string[]>([]);
  const autoFixInProgressRef = useRef(false);
  // Kind courant, lu dans les callbacks (auto-fix) sans dépendre de la closure.
  const kindRef = useRef<Kind | null>(null);
  const docTypeRef = useRef<string | null>(null);
  useEffect(() => { kindRef.current = kind; docTypeRef.current = docType; }, [kind, docType]);

  // Amorçage : modèle à ouvrir, ou prompt (avec génération directe).
  const [bootPrompt, setBootPrompt] = useState<string | null>(null);
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const tpl = params.get("template");

    // 1) "Utiliser ce modèle" : on charge l'aperçu live, le chat modifie une copie perso.
    if (tpl) {
      const meta = TEMPLATE_PREVIEWS.find((p) => p.id === tpl);
      const name = meta?.name ?? "Mon application";
      setAppName(name);
      setKind("module");
      kindRef.current = "module";
      fetch(`/t/${encodeURIComponent(tpl)}`)
        .then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((html) => {
          setGeneratedHTML(injectErrorCapture(html));
          setMessages([
            {
              role: "assistant",
              content: `Voici le modèle **${name}**, prêt à l'emploi à droite. Dites-moi ce que vous voulez adapter (couleurs, colonnes, champs, textes…). Vos changements créent votre propre version : le modèle d'origine ne bouge pas.`,
            },
          ]);
        })
        .catch(() => {
          setMessages([
            { role: "assistant", content: "Impossible de charger ce modèle. Décrivez plutôt l'outil dont vous avez besoin." },
          ]);
        });
      return;
    }

    // 2) Prompt depuis l'accueil : on génère directement, sans écran intermédiaire.
    const saved = sessionStorage.getItem("batify_prompt");
    const auto = sessionStorage.getItem("batify_autostart");
    sessionStorage.removeItem("batify_prompt");
    sessionStorage.removeItem("batify_autostart");
    if (saved) {
      if (auto) setBootPrompt(saved);
      else setInput(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lance la génération automatique une fois le prompt d'amorçage prêt.
  useEffect(() => {
    if (bootPrompt) {
      handleGenerate(bootPrompt);
      setBootPrompt(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootPrompt]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);

      const [{ data: creditsData }, { data: membership }] = await Promise.all([
        supabase.from("user_credits").select("balance").eq("user_id", user.id).single(),
        supabase
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", user.id)
          .not("accepted_at", "is", null)
          .limit(1)
          .single(),
      ]);

      if (creditsData) setCredits(creditsData.balance);
      if (membership) setTenantId(membership.tenant_id);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  // ── Generation phase cycling ──────────────────────────────────────────────
  useEffect(() => {
    if (!isGenerating) { setGenerationPhase(0); return; }
    setGenerationPhase(0);
    const timers = [
      setTimeout(() => setGenerationPhase(1), 4000),
      setTimeout(() => setGenerationPhase(2), 10000),
      setTimeout(() => setGenerationPhase(3), 18000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isGenerating]);

  // ── Fullscreen toggle ─────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    const el = previewContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ── Injection du capteur d'erreurs dans le HTML généré ───────────────────
  const injectErrorCapture = useCallback((html: string): string => {
    const injectedScript = `
<script>
(function() {
  // ── Capture d'erreurs JS ──────────────────────────────────
  var MAX_ERRORS = 5;
  var errors = [];
  function sendErrors() {
    if (!errors.length) return;
    window.parent.postMessage({ type: 'BATIFY_JS_ERROR', errors: errors.slice() }, '*');
  }
  window.onerror = function(msg, src, line) {
    if (errors.length >= MAX_ERRORS) return;
    errors.push('[JS] ' + msg + (line ? ' (ligne ' + line + ')' : ''));
    clearTimeout(window.__batifyErrTimer);
    window.__batifyErrTimer = setTimeout(sendErrors, 300);
  };
  window.addEventListener('unhandledrejection', function(e) {
    if (errors.length >= MAX_ERRORS) return;
    var msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    errors.push('[Promise] ' + msg);
    clearTimeout(window.__batifyErrTimer);
    window.__batifyErrTimer = setTimeout(sendErrors, 300);
  });
  setTimeout(function() {
    if (!errors.length) window.parent.postMessage({ type: 'BATIFY_READY' }, '*');
  }, 2000);

  // ── Visual Edit : écouter l'activation depuis le parent ──
  var visualEditActive = false;
  var overlay = null;

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'BATIFY_VISUAL_EDIT_ON') {
      visualEditActive = true;
      document.body.style.cursor = 'crosshair';
      // Overlay semi-transparent pour indiquer le mode
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;border:2px solid #14B8A6;';
        document.body.appendChild(overlay);
      }
    }
    if (e.data && e.data.type === 'BATIFY_VISUAL_EDIT_OFF') {
      visualEditActive = false;
      document.body.style.cursor = '';
      if (overlay) { overlay.remove(); overlay = null; }
    }
  });

  document.addEventListener('click', function(e) {
    if (!visualEditActive) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    // Décrire l'élément cliqué
    var tag = el.tagName ? el.tagName.toLowerCase() : 'élément';
    var text = (el.textContent || '').trim().slice(0, 80);
    var cls = (el.className && typeof el.className === 'string') ? el.className.trim().split(' ').slice(0, 3).join(' ') : '';
    var id = el.id ? '#' + el.id : '';
    var desc = tag + (id || (cls ? '.' + cls.replace(/ /g,'.') : '')) + (text ? ' "' + text + '"' : '');
    window.parent.postMessage({ type: 'BATIFY_ELEMENT_CLICKED', desc: desc }, '*');
  }, true);
})();
<\/script>`;
    if (html.toLowerCase().includes('<head>')) {
      return html.replace(/<head>/i, '<head>' + injectedScript);
    }
    return injectedScript + html;
  }, []);

  // ── Auto-correction sur erreurs JS captées ────────────────────────────────
  const autoFix = useCallback(async (errors: string[], currentHTML: string, fixCount: number) => {
    if (autoFixInProgressRef.current || fixCount >= 3) return;
    autoFixInProgressRef.current = true;
    setIsAutoFixing(true);

    const errorSummary = errors.slice(0, 5).join('\n');
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `🔧 Erreurs détectées, correction automatique en cours (${fixCount + 1}/3)…\n\`\`\`\n${errorSummary}\n\`\`\``,
      },
    ]);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Corrige ces erreurs JavaScript dans l'application :\n${errorSummary}\n\nNe modifie pas les fonctionnalités, corrige uniquement les bugs.`,
          previousHTML: currentHTML,
          format,
          kind: kindRef.current ?? undefined,
          docType: docTypeRef.current ?? undefined,
          isAutoFix: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.html) {
        setGeneratedHTML(data.html);
        setAutoFixCount(fixCount + 1);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `✓ Correction ${fixCount + 1} appliquée. Vérification…` },
        ]);
      }
    } catch {
      // Silencieux — ne pas bloquer l'user sur une erreur d'auto-fix
    } finally {
      autoFixInProgressRef.current = false;
      setIsAutoFixing(false);
    }
  }, [format]);

  // ── Écouter les messages de l'iframe ─────────────────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'BATIFY_JS_ERROR') {
        const errors: string[] = event.data.errors ?? [];
        if (!errors.length || autoFixInProgressRef.current) return;

        // Accumuler les erreurs avec un délai pour éviter les doublons
        pendingErrorsRef.current = [...new Set([...pendingErrorsRef.current, ...errors])];

        if (iframeErrorTimeoutRef.current) clearTimeout(iframeErrorTimeoutRef.current);
        iframeErrorTimeoutRef.current = setTimeout(() => {
          const toFix = pendingErrorsRef.current.slice();
          pendingErrorsRef.current = [];
          // On passe par une ref pour avoir le HTML courant au moment du timeout
          setGeneratedHTML((html) => {
            autoFix(toFix, html, autoFixCount);
            return html;
          });
        }, 500);
      }
      // BATIFY_READY : app chargée sans erreur → reset compteur
      if (event.data?.type === 'BATIFY_READY') {
        setAutoFixCount(0);
        pendingErrorsRef.current = [];
      }

      // BATIFY_ELEMENT_CLICKED : Visual Edit — pré-remplir le prompt
      if (event.data?.type === 'BATIFY_ELEMENT_CLICKED') {
        const desc: string = event.data.desc ?? 'cet élément';
        setInput(`Modifie ${desc} : `);
        setVisualEditMode(false);
        iframeRef.current?.contentWindow?.postMessage({ type: 'BATIFY_VISUAL_EDIT_OFF' }, '*');
        textareaRef.current?.focus();
      }
    };

    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (iframeErrorTimeoutRef.current) clearTimeout(iframeErrorTimeoutRef.current);
    };
  }, [autoFix, autoFixCount]);

  // Les crédits sont déduits côté serveur — on met juste à jour l'affichage local
  const updateCreditsDisplay = useCallback((amount: number) => {
    setCredits((prev) => (prev !== null ? prev - amount : null));
  }, []);

  // ── Fichiers joints ────────────────────────────────────────────────────────
  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      setFileError(null);
      const incoming = Array.from(list);
      const accepted: AttachedFile[] = [];
      for (const f of incoming) {
        if (!ACCEPTED_TYPES.includes(f.type)) {
          setFileError(`Type non supporté : ${f.name} (PDF, PNG, JPEG, WebP uniquement).`);
          continue;
        }
        if (f.size > MAX_FILE_BYTES_CLIENT) {
          setFileError(`Fichier trop lourd : ${f.name} (3,5 Mo max).`);
          continue;
        }
        try {
          accepted.push({ name: f.name, mediaType: f.type, data: await fileToBase64(f), size: f.size });
        } catch {
          setFileError(`Lecture impossible : ${f.name}.`);
        }
      }
      if (accepted.length) {
        setAttached((prev) => {
          const merged = [...prev, ...accepted].slice(0, MAX_FILES_CLIENT);
          if (prev.length + accepted.length > MAX_FILES_CLIENT) {
            setFileError(`${MAX_FILES_CLIENT} fichiers maximum par analyse.`);
          }
          return merged;
        });
      }
    },
    []
  );

  const removeAttached = (idx: number) =>
    setAttached((prev) => prev.filter((_, i) => i !== idx));

  // Analyse (1 fichier) ou automatisation par lot (≥2 fichiers).
  const handleFiles = async (question: string) => {
    const isBatch = attached.length > 1;
    const endpoint = isBatch ? "/api/automate" : "/api/analyze";
    const creditCost = attached.length;

    if (credits !== null && credits < creditCost) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Crédits insuffisants. Rechargez votre compte pour continuer." },
      ]);
      return;
    }

    const payload = attached.map((f) => ({ name: f.name, mediaType: f.mediaType, data: f.data }));
    const fileNames = attached.map((f) => f.name).join(", ");
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: question
          ? `${question}\n\n📎 ${fileNames}`
          : `📎 Analyse de ${attached.length} fichier(s) : ${fileNames}`,
      },
    ]);
    setInput("");
    setAttached([]);
    setAnalysis(null);
    setReport(null);
    setEntitySaved(false);
    setGeneratedHTML("");
    setKind(null);
    setIsGenerating(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isBatch ? { files: payload, instruction: question } : { files: payload, question }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");

      updateCreditsDisplay(data.creditsUsed ?? creditCost);
      if (data.tenantId) setTenantId(data.tenantId);

      if (isBatch) {
        const rep: ReportResult = {
          items: Array.isArray(data.items) ? data.items : [],
          anomalies: Array.isArray(data.anomalies) ? data.anomalies : [],
          answer: typeof data.answer === "string" ? data.answer : undefined,
        };
        setReport(rep);
        const n = rep.anomalies.length;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              n > 0
                ? `✓ Rapport prêt : **${n} anomalie(s)** détectée(s) sur ${rep.items.length} fichier(s). Détail à droite.`
                : `✓ Contrôle terminé sur ${rep.items.length} fichier(s) : **aucune anomalie** détectée.`,
          },
        ]);
      } else {
        const result: AnalysisResult = {
          extraction: data.extraction,
          answer: typeof data.answer === "string" ? data.answer : "",
          fileCount: data.fileCount ?? 1,
        };
        setAnalysis(result);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.answer
              ? `✓ ${result.answer}\n\nDétail extrait à droite. Vous pouvez l'enregistrer dans le workspace.`
              : `✓ Document analysé. L'essentiel est extrait à droite : relisez, puis **Enregistrer dans le workspace**.`,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ ${err instanceof Error ? err.message : "Erreur lors de l'analyse. Réessayez."}`,
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Enregistre l'extraction comme document du workspace (aperçu → confirmation).
  const saveAnalysisToWorkspace = async () => {
    if (!analysis || savingEntity) return;
    setSavingEntity(true);
    const ex = analysis.extraction;
    const notesParts = [
      ex.resume,
      ex.montant_ttc != null ? `TTC ${fmtEur(ex.montant_ttc)}` : null,
      ex.emetteur ? `Émetteur : ${ex.emetteur}` : null,
    ].filter(Boolean);
    const values = {
      nom: ex.reference || ex.type_document || "Document analysé",
      type: ex.type_document || "autre",
      expires_at: ex.echeance || null,
      statut: "valide",
      notes: notesParts.join(" · "),
    };
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ entity: "documents", action: "create", values }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      setEntitySaved(true);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `✓ Enregistré dans le workspace (Documents) : **${values.nom}**.` },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ ${err instanceof Error ? err.message : "Enregistrement impossible."}` },
      ]);
    } finally {
      setSavingEntity(false);
    }
  };

  const handleGenerate = async (promptOverride?: string) => {
    const trimmed = (promptOverride ?? input).trim();
    if (isGenerating) return;

    // Fichiers joints → analyse (1) ou automatisation par lot (≥2).
    if (attached.length > 0) {
      await handleFiles(trimmed);
      return;
    }

    if (!trimmed) return;

    const isModification = generatedHTML.length > 0;
    const creditCost = isModification ? 1 : 2;

    if (credits !== null && credits < creditCost) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Crédits insuffisants. Rechargez votre compte pour continuer." },
      ]);
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setIsGenerating(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          previousHTML: isModification ? generatedHTML : undefined,
          format,
          // En itération, on conserve le format d'origine (pas de reclassement).
          kind: isModification ? kind ?? undefined : undefined,
          docType: isModification ? docType ?? undefined : undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.html) {
        const newKind: Kind =
          data.kind === "document" || data.kind === "action" ? data.kind : "module";
        const newDocType: string | null =
          typeof data.docType === "string" ? data.docType : null;
        setKind(newKind);
        setDocType(newDocType);
        kindRef.current = newKind;
        docTypeRef.current = newDocType;

        pendingErrorsRef.current = [];
        setAutoFixCount(0);
        // Les documents n'embarquent pas la capture d'erreurs JS (pas d'auto-fix).
        setGeneratedHTML(newKind === "document" ? data.html : injectErrorCapture(data.html));
        setAppName(data.name);
        setSavedId(null);
        // Mise à jour affichage — la déduction réelle est faite côté serveur
        updateCreditsDisplay(data.creditsUsed ?? creditCost);
        if (data.tenantId) setTenantId(data.tenantId);

        let content: string;
        if (isModification) {
          content =
            newKind === "document"
              ? "✓ Document mis à jour. Consultez-le à droite, puis **Imprimer / Enregistrer en PDF**."
              : "✓ Modification appliquée. Consultez la prévisualisation à droite. Vous pouvez continuer à itérer.";
        } else if (newKind === "document") {
          content = `✓ **${data.name}** prêt. Ouvrez-le à droite : bouton **Imprimer / Enregistrer en PDF**, et signez du bout du doigt dans les cadres prévus. Dites-moi quoi ajuster.`;
        } else if (data.actionFallback) {
          content = `✓ **${data.name}** générée. ⚡ J'ai reconnu une demande de *traitement par lot* (widget d'action) — cette brique arrive bientôt ; en attendant, voici un module opérationnel.`;
        } else {
          content = `✓ Application **${data.name}** générée. Elle est entièrement fonctionnelle : ajoutez, modifiez, supprimez des données — tout est sauvegardé. Dites-moi ce que vous voulez ajuster.`;
        }
        setMessages((prev) => [...prev, { role: "assistant", content }]);
      } else {
        throw new Error(data.error ?? "Erreur inconnue");
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ ${err instanceof Error ? err.message : "Erreur lors de la génération. Réessayez."}`,
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedHTML || isSaving) return;
    setIsSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsSaving(false); return; }

    const description = messages.find((m) => m.role === "user")?.content ?? "";

    if (savedId) {
      await supabase
        .from("modules")
        .update({ name: appName, html_content: generatedHTML, description, format, updated_at: new Date().toISOString() })
        .eq("id", savedId);
    } else {
      if (!tenantId) {
        console.error("Impossible de sauvegarder : aucun tenant trouvé.");
        setIsSaving(false);
        return;
      }
      const newSlug = `${slugify(appName)}-${shortId()}`;
      const { data } = await supabase
        .from("modules")
        .insert({
          user_id: user.id,
          tenant_id: tenantId,
          created_by: user.id,
          name: appName,
          description,
          html_content: generatedHTML,
          format,
          slug: newSlug,
          is_public: false,
        })
        .select("id, slug")
        .single();
      if (data) {
        setSavedId(data.id);
        setSlug(data.slug);
      }
    }

    setIsSaving(false);
  };

  const handleDeploy = async () => {
    if (!generatedHTML || isDeploying) return;
    // Save first if not already saved
    if (!savedId) await handleSave();
    // Re-read savedId via closure won't work, use a small workaround
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch the saved app id
    const { data: apps } = await supabase
      .from("modules")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", appName)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1);

    const appId = savedId ?? apps?.[0]?.id;
    if (!appId) return;

    setIsDeploying(true);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      const data = await res.json();
      if (data.url) {
        setDeploymentUrl(data.url);
      } else {
        alert(data.error ?? "Erreur de déploiement.");
      }
    } finally {
      setIsDeploying(false);
    }
  };

  const publicUrl = slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/app/${slug}` : "";

  const copyLink = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Reconnaissance vocale non supportée. Utilisez Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }
      setInput((finalText + interim).trimStart());
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const toggleVisualEdit = () => {
    const next = !visualEditMode;
    setVisualEditMode(next);
    iframeRef.current?.contentWindow?.postMessage(
      { type: next ? 'BATIFY_VISUAL_EDIT_ON' : 'BATIFY_VISUAL_EDIT_OFF' },
      '*'
    );
    if (next) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '👆 Cliquez sur un élément de l\'application pour le modifier.' },
      ]);
    }
  };

  const reset = () => {
    setMessages([]);
    setGeneratedHTML("");
    setAppName("Mon application");
    setSavedId(null);
    setSlug(null);
    setKind(null);
    setDocType(null);
    kindRef.current = null;
    docTypeRef.current = null;
    setInput("");
    setAutoFixCount(0);
    setIsAutoFixing(false);
    setVisualEditMode(false);
    pendingErrorsRef.current = [];
    autoFixInProgressRef.current = false;
  };

  return (
    <div className="flex flex-col md:flex-row h-full bg-background">
      {/* ── Left Panel: Conversation ── */}
      <div
        className={`flex flex-col flex-shrink-0 bg-card transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          sidebarOpen
            ? "w-full md:w-[420px] md:min-w-[380px] h-[50vh] md:h-full md:border-r border-border"
            : "w-0 md:w-0 overflow-hidden h-0 md:h-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-display font-bold text-foreground text-base">Générateur</h1>
          </div>
          <div className="flex items-center gap-2">
            {credits !== null && (
              <span className="text-xs text-accent-deep font-semibold bg-accent-soft border border-border px-2.5 py-1 rounded-full tabular">
                ⚡ {credits} crédits
              </span>
            )}
            {messages.length > 0 && (
              <button
                onClick={reset}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                title="Recommencer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setSidebarOpen(false)}
              className="hidden md:flex p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              title="Réduire le panneau"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && !generatedHTML && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mb-4 shadow-depth-2">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h2 className="font-display font-bold text-foreground text-lg mb-2">Votre atelier</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]">
                Décrivez l&apos;outil dont vous avez besoin, en une phrase. Batify pose une question ou deux si nécessaire, puis le construit.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center flex-shrink-0 mt-1 mr-2">
                  <span className="text-white text-xs font-black leading-none">B</span>
                </div>
              )}
              <div
                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-white rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm border border-border"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isGenerating && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center flex-shrink-0 mt-1 mr-2">
                <span className="text-white text-xs font-black leading-none">B</span>
              </div>
              <div className="bg-muted border border-border px-4 py-3 rounded-2xl rounded-tl-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-accent animate-spin" />
                  <span className="text-sm text-muted-foreground">Construction de votre application…</span>
                </div>
              </div>
            </div>
          )}

          {isAutoFixing && !isGenerating && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-lg bg-warning/80 flex items-center justify-center flex-shrink-0 mt-1 mr-2">
                <Wrench className="w-3 h-3 text-white" />
              </div>
              <div className="bg-[#fdf8ee] border border-warning/30 px-4 py-3 rounded-2xl rounded-tl-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-warning animate-spin" />
                  <span className="text-sm text-warning">Correction automatique des erreurs…</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Format selector — cible device, sans objet pour un document A4 ou une analyse */}
        {kind !== "document" && !analysis && !report && (
        <div className="px-4 pt-3 pb-1 flex-shrink-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Format de l&apos;application</p>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted rounded-xl">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  format === f.id
                    ? "bg-card text-accent-deep shadow-depth-1"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.icon}
                {f.label}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Input area */}
        <div className="px-4 pb-4 pt-2 flex-shrink-0 border-t border-border">
          {/* Chips fichiers joints */}
          {attached.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attached.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1.5 max-w-[200px] pl-2 pr-1 py-1 rounded-lg bg-accent-soft border border-accent/30 text-xs text-accent-deep"
                >
                  <Paperclip className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <button
                    onClick={() => removeAttached(i)}
                    className="flex-shrink-0 p-0.5 rounded hover:bg-accent/20"
                    title="Retirer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {fileError && (
            <p className="text-xs text-danger mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {fileError}
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div
            className="flex items-end gap-2 bg-muted/60 border border-border rounded-2xl px-3 py-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-all"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
          >
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 mb-0.5 p-1.5 rounded-xl transition-colors text-muted-foreground hover:text-accent-deep hover:bg-accent-soft"
              title="Joindre un document (PDF, image) à analyser"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              onClick={isListening ? stopVoice : startVoice}
              className={`flex-shrink-0 mb-0.5 p-1.5 rounded-xl transition-colors ${
                isListening
                  ? "bg-[#fdf2f0] text-danger animate-pulse"
                  : "text-muted-foreground hover:text-accent-deep hover:bg-accent-soft"
              }`}
              title={isListening ? "Arrêter l'écoute" : "Parler"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <div className="relative flex-1 min-w-0">
              {!input && !generatedHTML && messages.length === 0 && (
                <span className="absolute top-0 left-0 right-0 text-muted-foreground text-sm pointer-events-none select-none leading-relaxed">
                  {typed}
                  <span aria-hidden className="inline-block w-[2px] h-[0.95em] translate-y-[2px] bg-accent ml-0.5 animate-blink" />
                </span>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  attached.length > 0
                    ? attached.length > 1
                      ? "Contrôle à faire (ex : détecte les doublons)…"
                      : "Question sur le document, ou laissez vide pour extraire…"
                    : !input && !generatedHTML && messages.length === 0
                    ? ""
                    : generatedHTML
                    ? "Dites ce que vous voulez modifier…"
                    : "Décrivez votre outil BTP… (Entrée pour envoyer)"
                }
                rows={1}
                className="relative w-full bg-transparent text-foreground placeholder-muted-foreground text-sm resize-none focus:outline-none min-h-[24px] max-h-32 leading-relaxed"
                style={{ height: "auto" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }}
              />
            </div>

            <button
              onClick={() => handleGenerate()}
              disabled={(!input.trim() && attached.length === 0) || isGenerating}
              className="flex-shrink-0 mb-0.5 p-1.5 bg-primary text-white rounded-xl shadow-depth-1 hover:shadow-depth-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {attached.length > 0
              ? `${attached.length} fichier(s) · ${attached.length} crédit(s) · ${attached.length > 1 ? "contrôle par lot" : "analyse"}`
              : generatedHTML
              ? "1 crédit par modification"
              : "2 crédits par génération"}
          </p>
        </div>
      </div>

      {/* ── Right Panel: Preview ── */}
      <div ref={previewContainerRef} className="flex flex-col flex-1 min-w-0 h-[50vh] md:h-full border-t md:border-t-0 border-border bg-background">
        {/* Preview header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="hidden md:flex p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                title="Ouvrir le panneau"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
            <div className="flex gap-1.5 flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-border" />
              <div className="w-3 h-3 rounded-full bg-border" />
              <div className="w-3 h-3 rounded-full bg-border" />
            </div>
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="flex-1 min-w-0 bg-muted/60 border border-border rounded-lg px-2.5 py-1 text-sm text-foreground focus:outline-none focus:border-accent truncate"
              placeholder="Nom de l'application"
            />
            {/* Statut auto-fix */}
            {generatedHTML && !isGenerating && (
              isAutoFixing ? (
                <span className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-warning bg-[#fdf8ee] border border-warning/30 px-2 py-1 rounded-full">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Correction…
                </span>
              ) : autoFixCount > 0 ? (
                <span className="flex-shrink-0 text-xs font-semibold text-success bg-[#f4f9ec] border border-success/30 px-2 py-1 rounded-full">
                  ✓ Corrigé
                </span>
              ) : null
            )}
            {/* Format de sortie décidé par l'aiguillage */}
            {generatedHTML && kind && (
              <span
                className={`flex-shrink-0 hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border ${
                  kind === "document"
                    ? "text-[#0D9488] bg-[#EEF9F7] border-[#99F6E4]"
                    : kind === "action"
                      ? "text-[#D89B2B] bg-[#FFFBEB] border-[#FDE68A]"
                      : "text-muted-foreground bg-muted border-border"
                }`}
                title={`Format de sortie : ${kindLabel(kind, docType)}`}
              >
                {kind === "document" ? (
                  <FileText className="w-3 h-3" />
                ) : kind === "action" ? (
                  <Zap className="w-3 h-3" />
                ) : (
                  <LayoutTemplate className="w-3 h-3" />
                )}
                {kindLabel(kind, docType)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            {/* Bouton Visual Edit */}
            {generatedHTML && !isGenerating && (
              <button
                onClick={toggleVisualEdit}
                title={visualEditMode ? "Désactiver Visual Edit" : "Cliquer sur un élément pour le modifier"}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  visualEditMode
                    ? "bg-accent text-white border-accent shadow-depth-1"
                    : "bg-muted border-border text-muted-foreground hover:text-accent-deep hover:bg-accent-soft hover:border-accent"
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{visualEditMode ? "Annuler" : "Visual Edit"}</span>
              </button>
            )}
            {generatedHTML && savedId && (
              <Link
                href={`/apps/${savedId}`}
                target="_blank"
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                title="Ouvrir en plein écran"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
            )}
            {generatedHTML && (
              <>
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0D9488] text-white text-xs font-semibold rounded-lg shadow-depth-1 hover:bg-[#0f766e] transition-all disabled:opacity-60"
                  title="Déployer sur Vercel"
                >
                  {isDeploying ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : deploymentUrl ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Globe className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {isDeploying ? "Déploiement…" : deploymentUrl ? "Redéployer" : "Publier"}
                  </span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg shadow-depth-1 hover:shadow-depth-2 transition-all disabled:opacity-60"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : savedId ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {savedId ? "Sauvegardé" : "Sauvegarder"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Public link bar (after save) */}
        {slug && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-accent-soft border-b border-border flex-shrink-0">
            <Globe className="w-3.5 h-3.5 text-accent-deep flex-shrink-0" />
            <span className="text-xs text-accent-deep font-medium flex-shrink-0 hidden sm:inline">
              En ligne :
            </span>
            <code className="text-xs text-foreground bg-card border border-border rounded-md px-2 py-1 truncate flex-1 min-w-0">
              /app/{slug}
            </code>
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-primary text-white text-xs font-semibold rounded-md shadow-depth-1 hover:shadow-depth-2 transition-all flex-shrink-0"
            >
              {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copié" : "Copier le lien"}
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-accent-deep hover:text-foreground rounded-md hover:bg-card transition-colors flex-shrink-0"
              title="Ouvrir l'application en ligne"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Deployment URL bar */}
        {deploymentUrl && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-[#f0fdfa] border-b border-[#99f6e4] flex-shrink-0">
            <Globe className="w-3.5 h-3.5 text-[#0D9488] flex-shrink-0" />
            <span className="text-xs text-[#0D9488] font-medium flex-shrink-0 hidden sm:inline">
              Déployé :
            </span>
            <code className="text-xs text-foreground bg-white border border-[#99f6e4] rounded-md px-2 py-1 truncate flex-1 min-w-0">
              {deploymentUrl}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(deploymentUrl)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0D9488] text-white text-xs font-semibold rounded-md hover:bg-[#0f766e] transition-all flex-shrink-0"
            >
              <Copy className="w-3 h-3" />
              <span className="hidden sm:inline">Copier</span>
            </button>
            <a
              href={deploymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-[#0D9488] hover:text-foreground rounded-md hover:bg-white transition-colors flex-shrink-0"
              title="Ouvrir le site déployé"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* iframe preview */}
        <div className="flex-1 relative bg-muted overflow-auto">
          {isGenerating && (
            <div className="absolute inset-0 bg-[#F7F5EF]/95 backdrop-blur-sm flex flex-col items-center justify-center z-10 gap-6 px-8">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center shadow-depth-3">
                  <Sparkles className="w-8 h-8 text-white animate-float" />
                </div>
                <div className="absolute -inset-2 rounded-2xl border border-accent/30 animate-ping" />
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-foreground text-base mb-1">
                  {GENERATION_PHASES[generationPhase].label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {GENERATION_PHASES[generationPhase].sub}
                </p>
              </div>
              {/* Phase steps */}
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {GENERATION_PHASES.map((phase, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                      i < generationPhase
                        ? "bg-accent"
                        : i === generationPhase
                        ? "bg-accent animate-pulse"
                        : "bg-border"
                    }`}>
                      {i < generationPhase ? (
                        <CheckCircle className="w-3 h-3 text-white" />
                      ) : i === generationPhase ? (
                        <Loader2 className="w-3 h-3 text-white animate-spin" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                      )}
                    </div>
                    <span className={`text-xs transition-colors duration-300 ${
                      i < generationPhase
                        ? "text-accent font-medium line-through opacity-60"
                        : i === generationPhase
                        ? "text-foreground font-semibold"
                        : "text-muted-foreground"
                    }`}>
                      {phase.label.replace("…", "")}
                    </span>
                  </div>
                ))}
              </div>
              {/* Progress bar */}
              <div className="w-full max-w-xs h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-[#0D9488] rounded-full transition-all duration-[3000ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{ width: `${[15, 40, 70, 90][generationPhase]}%` }}
                />
              </div>
            </div>
          )}

          {/* Bandeau Visual Edit actif */}
          {visualEditMode && (
            <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-center gap-2 py-2 bg-accent/90 text-white text-xs font-semibold pointer-events-none">
              <Pencil className="w-3.5 h-3.5" />
              Cliquez sur un élément pour le modifier
            </div>
          )}

          {report ? (
            <ReportView report={report} />
          ) : analysis ? (
            <AnalysisView
              analysis={analysis}
              onSave={saveAnalysisToWorkspace}
              saving={savingEntity}
              saved={entitySaved}
            />
          ) : generatedHTML ? (
            format === "mobile" ? (
              // Phone mockup
              <div className="flex items-center justify-center min-h-full py-6 px-4">
                <div className="w-[390px] max-w-full h-[760px] bg-[#0f172a] rounded-[2.5rem] p-3 shadow-depth-4 flex-shrink-0">
                  <div className="relative w-full h-full bg-card rounded-[2rem] overflow-hidden">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#0f172a] rounded-b-2xl z-10" />
                    <iframe
                      ref={iframeRef}
                      key={generatedHTML.slice(0, 50)}
                      srcDoc={generatedHTML}
                      sandbox="allow-scripts allow-forms allow-same-origin"
                      className="w-full h-full border-0"
                      title="Application générée"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                key={generatedHTML.slice(0, 50)}
                srcDoc={generatedHTML}
                sandbox="allow-scripts allow-forms allow-same-origin"
                className={`w-full h-full border-0 ${visualEditMode ? "pointer-events-none" : ""}`}
                title="Application générée"
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mb-4 shadow-depth-1">
                <Wrench className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="font-display font-semibold text-foreground mb-2">Prévisualisation</h3>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                Décrivez votre outil dans le panneau gauche. L&apos;application
                apparaîtra ici, prête à l&apos;emploi.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
