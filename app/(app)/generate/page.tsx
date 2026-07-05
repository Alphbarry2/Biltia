"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";
import { isFounderEmail } from "@/lib/founder";
import { saveConversation, loadConversation } from "@/lib/conversations";
import { looksLikePureQuestion, classifyKindHeuristic } from "@/lib/kind-heuristic";
import { ClarifyWidget, type ClarifyQuestion } from "@/components/clarify-widget";
import { buildStaticClarifyQuestions } from "@/lib/clarify-questions";
import { CreditsUpsell } from "@/components/credits-upsell";
import {
  AnalysisView,
  ReportView,
  fmtEur,
  type AnalysisResult,
  type ReportResult,
} from "@/components/report-views";
import type { Json } from "@/lib/database.types";
import { slugify, shortId } from "@/lib/slug";
import { useTypewriter } from "@/components/site";
import { TEMPLATE_PREVIEWS } from "@/lib/template-previews";
import { ShareMenu } from "@/components/share-menu";
import {
  Mic,
  MicOff,
  Camera,
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

// Types MIME acceptés côté client (miroir de lib/vision.ts).
const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILES_CLIENT = 5;
const MAX_FILE_BYTES_CLIENT = 3.5 * 1024 * 1024;


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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const typed = useTypewriter(GEN_PLACEHOLDERS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHTML, setGeneratedHTML] = useState("");
  const [appName, setAppName] = useState("Mon application");
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  // Id sauvegardé, lisible dans les callbacks async sans closure périmée.
  const savedIdRef = useRef<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
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
  // ── Séparateur chat/app redimensionnable (desktop) ────────────────────────
  // Glisser la poignée redimensionne le chat ; tirer au bord gauche ferme le
  // chat (app plein écran), tirer au bord droit masque l'app (chat plein écran).
  const [chatW, setChatW] = useState(420);
  const [previewHidden, setPreviewHidden] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [resizing, setResizing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    setResizing(true);
    const onMove = (ev: PointerEvent) => {
      const x = ev.clientX - rect.left;
      if (x < 170) {
        // Bord gauche : chat fermé, l'application prend tout l'écran.
        setSidebarOpen(false);
        setPreviewHidden(false);
        return;
      }
      setSidebarOpen(true);
      if (x > rect.width - 240) {
        // Bord droit : application masquée, le chat prend tout l'écran.
        setPreviewHidden(true);
        return;
      }
      setPreviewHidden(false);
      setChatW(Math.min(Math.max(x, 300), rect.width - 360));
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [generationPhase, setGenerationPhase] = useState(0);
  const [buildSeconds, setBuildSeconds] = useState(0);
  // Analyse de fichiers (produits Analyse / Automatisations).
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [savingEntity, setSavingEntity] = useState(false);
  const [entitySaved, setEntitySaved] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
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
  // Instruction de contrôle par lot énoncée AVANT de joindre les fichiers.
  const pendingActionRef = useRef<string>("");
  // Pré-aiguillage instantané côté client : une pure question n'affiche JAMAIS
  // l'écran de construction (phases), juste la bulle « je vous réponds ».
  const [expectingBuild, setExpectingBuild] = useState(true);
  // Questions préalables avant production : "module" = questionnaire de création
  // d'app (façon Lovable) ; "document" = porte « contexte suffisant ? » (l'employé
  // demande les infos manquantes avant de rédiger le PDF).
  const [clarify, setClarify] = useState<{ questions: ClarifyQuestion[]; prompt: string; kind?: "module" | "document" } | null>(null);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  // Crédits insuffisants (pré-vérification client OU 402 serveur) → widget
  // d'upgrade affiché dans le fil, jamais un simple message sans issue.
  const [upsell, setUpsell] = useState<{ required?: number } | null>(null);
  // Compte fondateur : jamais bloqué par les crédits (cf. lib/founder.ts).
  const [founderAccount, setFounderAccount] = useState(false);
  // Historique : id de la conversation en cours (créée au premier échange).
  const conversationIdRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Amorçage : modèle à ouvrir, ou prompt (avec génération directe).
  const [bootPrompt, setBootPrompt] = useState<string | null>(null);
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const tpl = params.get("template");
    const editId = params.get("edit");
    const chatId = params.get("chat");

    // -1) Réouverture d'une conversation depuis la Bibliothèque : on restaure
    //     tout le fil, et l'app liée s'il y en a une (prévisualisation comprise).
    if (chatId) {
      loadConversation(chatId).then(async (conv) => {
        if (!conv) {
          setMessages([
            { role: "assistant", content: "Impossible de rouvrir cette conversation (introuvable ou accès refusé). Décrivez votre besoin pour en démarrer une nouvelle." },
          ]);
          return;
        }
        conversationIdRef.current = conv.id;
        setMessages(conv.messages);
        if (conv.app_id) {
          const supabase = createClient();
          const { data } = await supabase
            .from("modules")
            .select("id, name, html_content, slug, is_public, format")
            .eq("id", conv.app_id)
            .maybeSingle();
          if (data) {
            setAppName(data.name);
            setSavedId(data.id);
            savedIdRef.current = data.id;
            setSlug(data.slug);
            setIsPublic(!!data.is_public);
            if (data.format === "mobile" || data.format === "desktop") setFormat(data.format);
            const k: Kind = conv.kind === "document" ? "document" : "module";
            setKind(k);
            kindRef.current = k;
            setGeneratedHTML(k === "document" ? data.html_content : injectErrorCapture(data.html_content));
          }
        }
      });
      return;
    }

    // 0) "Modifier" depuis la bibliothèque / le dashboard : on charge l'app
    //    sauvegardée dans l'atelier (savedId → le bouton Sauvegarder met à jour).
    if (editId) {
      const supabase = createClient();
      supabase
        .from("modules")
        .select("id, name, description, html_content, slug, is_public, format")
        .eq("id", editId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) {
            setMessages([
              {
                role: "assistant",
                content:
                  "Impossible de charger cette application (introuvable ou accès refusé). Décrivez l'outil dont vous avez besoin pour en créer une nouvelle.",
              },
            ]);
            return;
          }
          setAppName(data.name);
          setSavedId(data.id);
          savedIdRef.current = data.id;
          setSlug(data.slug);
          setIsPublic(!!data.is_public);
          if (data.format === "mobile" || data.format === "desktop") setFormat(data.format);
          setKind("module");
          kindRef.current = "module";
          setGeneratedHTML(injectErrorCapture(data.html_content));
          // HISTORIQUE : on recharge la DERNIÈRE conversation liée à cette app
          // pour continuer le fil — jamais repartir de zéro sur une app existante.
          void supabase
            .from("conversations")
            .select("id, messages")
            .eq("app_id", editId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(({ data: conv }) => {
              const history = Array.isArray(conv?.messages)
                ? (conv.messages as unknown as Message[]).filter(
                    (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
                  )
                : [];
              if (conv && history.length) {
                conversationIdRef.current = conv.id;
                setMessages([
                  ...history,
                  {
                    role: "assistant",
                    content: `**${data.name}** est rechargée à droite avec votre historique. Chaque modification est appliquée et sauvegardée automatiquement.`,
                  },
                ]);
              } else {
                setMessages([
                  {
                    role: "assistant",
                    content: `**${data.name}** est chargée à droite. Dites-moi ce que vous voulez modifier — chaque changement est appliqué et sauvegardé automatiquement.`,
                  },
                ]);
              }
            });
        });
      return;
    }

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
    const saved = sessionStorage.getItem("biltia_prompt");
    const auto = sessionStorage.getItem("biltia_autostart");
    sessionStorage.removeItem("biltia_prompt");
    sessionStorage.removeItem("biltia_autostart");
    if (saved) {
      if (auto) setBootPrompt(saved);
      else setInput(saved);
      return;
    }

    // 3) Visite directe SANS intention nouvelle : LA CONVERSATION RESTE.
    //    On restaure le dernier fil (et son app) exactement là où il en était —
    //    « Recommencer » (bouton ↺) démarre un nouveau fil quand on le veut.
    void (async () => {
      const supabase = createClient();
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, messages, app_id, kind")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const history = Array.isArray(conv?.messages)
        ? (conv.messages as unknown as Message[]).filter(
            (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
          )
        : [];
      if (!conv || !history.length) return; // aucun fil précédent → accueil vierge
      conversationIdRef.current = conv.id;
      setMessages(history);
      if (conv.app_id) {
        const { data } = await supabase
          .from("modules")
          .select("id, name, html_content, slug, is_public, format")
          .eq("id", conv.app_id)
          .maybeSingle();
        if (data) {
          setAppName(data.name);
          setSavedId(data.id);
          savedIdRef.current = data.id;
          setSlug(data.slug);
          setIsPublic(!!data.is_public);
          if (data.format === "mobile" || data.format === "desktop") setFormat(data.format);
          const k: Kind = conv.kind === "document" ? "document" : "module";
          setKind(k);
          kindRef.current = k;
          setGeneratedHTML(k === "document" ? data.html_content : injectErrorCapture(data.html_content));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Historique façon ChatGPT : chaque évolution du fil est persistée (débouncé,
  // best-effort — un échec de sauvegarde ne perturbe jamais la conversation).
  useEffect(() => {
    if (!messages.some((m) => m.role === "user")) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      const id = await saveConversation({
        id: conversationIdRef.current,
        tenantId,
        messages,
        appId: savedId,
        kind,
      });
      if (id) conversationIdRef.current = id;
    }, 800);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [messages, savedId, kind, tenantId]);

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
      setFounderAccount(isFounderEmail(user.email));

      const [{ data: creditsData }, membership] = await Promise.all([
        supabase.from("user_credits").select("balance").eq("user_id", user.id).single(),
        getActiveMembership(supabase, user.id),
      ]);

      if (creditsData) setCredits(creditsData.balance);
      if (membership) setTenantId(membership.tenant_id);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  // ── Écran de construction : temps écoulé + progression continue ──────────
  // Un compteur de secondes VISIBLE et une barre qui avance en permanence :
  // l'utilisateur voit qu'il se passe quelque chose, jamais un spinner figé.
  useEffect(() => {
    if (!isGenerating) {
      setGenerationPhase(0);
      setBuildSeconds(0);
      return;
    }
    setGenerationPhase(0);
    setBuildSeconds(0);
    const timer = setInterval(() => {
      setBuildSeconds((s) => {
        const next = s + 1;
        setGenerationPhase(next < 6 ? 0 : next < 15 ? 1 : next < 32 ? 2 : 3);
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
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
    window.parent.postMessage({ type: 'BILTIA_JS_ERROR', errors: errors.slice() }, '*');
  }
  window.onerror = function(msg, src, line) {
    if (errors.length >= MAX_ERRORS) return;
    errors.push('[JS] ' + msg + (line ? ' (ligne ' + line + ')' : ''));
    clearTimeout(window.__biltiaErrTimer);
    window.__biltiaErrTimer = setTimeout(sendErrors, 300);
  };
  window.addEventListener('unhandledrejection', function(e) {
    if (errors.length >= MAX_ERRORS) return;
    var msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    errors.push('[Promise] ' + msg);
    clearTimeout(window.__biltiaErrTimer);
    window.__biltiaErrTimer = setTimeout(sendErrors, 300);
  });
  setTimeout(function() {
    if (!errors.length) window.parent.postMessage({ type: 'BILTIA_READY' }, '*');
  }, 2000);

  // ── Visual Edit : écouter l'activation depuis le parent ──
  var visualEditActive = false;
  var overlay = null;

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'BILTIA_VISUAL_EDIT_ON') {
      visualEditActive = true;
      document.body.style.cursor = 'crosshair';
      // Overlay semi-transparent pour indiquer le mode
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;border:2px solid #14B8A6;';
        document.body.appendChild(overlay);
      }
    }
    if (e.data && e.data.type === 'BILTIA_VISUAL_EDIT_OFF') {
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
    window.parent.postMessage({ type: 'BILTIA_ELEMENT_CLICKED', desc: desc }, '*');
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
        // L'app vit déjà dans les ateliers → la correction y part aussi (silencieux).
        if (savedIdRef.current) {
          void createClient()
            .from('modules')
            .update({ html_content: data.html, updated_at: new Date().toISOString() })
            .eq('id', savedIdRef.current)
            .then(() => {});
        }
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
      // Pont API : l'iframe (origin:null) ne peut pas faire fetch directement →
      // elle envoie BILTIA_API_CALL, on proxifie vers /api/data en same-origin.
      if (event.data?.type === 'BILTIA_API_CALL') {
        const { id, body } = event.data as { id: string; body: unknown };
        const src = event.source as Window | null;
        fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        })
          .then(async (res) => {
            const result = await res.json().catch(() => null);
            if (!res.ok) {
              src?.postMessage({ type: 'BILTIA_API_RESPONSE', id, error: result?.error ?? `Erreur ${res.status}` }, '*');
            } else {
              src?.postMessage({ type: 'BILTIA_API_RESPONSE', id, result }, '*');
            }
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Réseau indisponible';
            src?.postMessage({ type: 'BILTIA_API_RESPONSE', id, error: msg }, '*');
          });
        return;
      }

      if (event.data?.type === 'BILTIA_JS_ERROR') {
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
      // BILTIA_READY : app chargée sans erreur → reset compteur
      if (event.data?.type === 'BILTIA_READY') {
        setAutoFixCount(0);
        pendingErrorsRef.current = [];
      }

      // BILTIA_ELEMENT_CLICKED : Visual Edit — pré-remplir le prompt
      if (event.data?.type === 'BILTIA_ELEMENT_CLICKED') {
        const desc: string = event.data.desc ?? 'cet élément';
        setInput(`Modifie ${desc} : `);
        setVisualEditMode(false);
        iframeRef.current?.contentWindow?.postMessage({ type: 'BILTIA_VISUAL_EDIT_OFF' }, '*');
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
  // Miroir des holds serveur : 25 crédits par fichier (réconcilié au coût réel).
  // Persistance Bibliothèque (onglets Rapports / Automatisations) — best-effort.
  const persistReport = async (
    type: "analyse" | "controle",
    title: string,
    fileCount: number,
    payload: unknown
  ) => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !tenantId) return;
      await supabase.from("reports").insert({
        tenant_id: tenantId,
        user_id: user.id,
        type,
        title: (title || "Rapport").slice(0, 120),
        file_count: fileCount,
        payload: payload as Json,
        conversation_id: conversationIdRef.current,
      });
    } catch {
      // La persistance ne bloque jamais le résultat affiché.
    }
  };

  const handleFiles = async (question: string) => {
    const isBatch = attached.length > 1;
    const endpoint = isBatch ? "/api/automate" : "/api/analyze";
    const creditCost = attached.length * 25;

    if (!founderAccount && credits !== null && credits < creditCost) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Crédits insuffisants. Rechargez votre compte pour continuer." },
      ]);
      setUpsell({ required: creditCost });
      return;
    }
    setUpsell(null);

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
    setExpectingBuild(false); // analyse/contrôle : pas d'écran de construction
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
      if (!res.ok) {
        if (res.status === 402) setUpsell({ required: creditCost });
        throw new Error(data.error ?? "Erreur inconnue");
      }

      updateCreditsDisplay(data.creditsUsed ?? creditCost);
      if (data.tenantId) setTenantId(data.tenantId);

      if (isBatch) {
        const rep: ReportResult = {
          items: Array.isArray(data.items) ? data.items : [],
          anomalies: Array.isArray(data.anomalies) ? data.anomalies : [],
          answer: typeof data.answer === "string" ? data.answer : undefined,
        };
        setReport(rep);
        void persistReport("controle", question || `Contrôle de ${rep.items.length} fichier(s)`, rep.items.length, rep);
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
        void persistReport(
          "analyse",
          question || `Analyse : ${result.extraction?.type_document ?? "document"} — ${fileNames}`,
          result.fileCount,
          result
        );
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

    // Fichiers joints AVEC une app ouverte dans l'atelier → CONTEXTE de la
    // modification (capture d'écran du problème, document de référence) :
    // ils partent avec la demande à /api/generate, PAS vers l'analyse workspace.
    if (attached.length > 0 && generatedHTML && kindRef.current !== "document") {
      const files = attached.map((f) => ({ name: f.name, mediaType: f.mediaType, data: f.data }));
      const fileNames = attached.map((f) => f.name).join(", ");
      const instruction = trimmed || "Regarde les fichiers joints et corrige le problème qu'ils montrent.";
      setMessages((prev) => [...prev, { role: "user", content: `${instruction}\n\n📎 ${fileNames}` }]);
      setInput("");
      setAttached([]);
      setUpsell(null);
      await executeGeneration(instruction, { files });
      return;
    }

    // Fichiers joints → analyse (1) ou automatisation par lot (≥2).
    // Si un contrôle a été demandé AVANT de joindre les fichiers, on reprend
    // cette instruction mémorisée (promesse « décrivez le contrôle »).
    if (attached.length > 0) {
      const instruction = trimmed || pendingActionRef.current;
      pendingActionRef.current = "";
      await handleFiles(instruction);
      return;
    }

    if (!trimmed) return;

    // Miroir des holds serveur (app/api/generate) : 300 création / 60 modification /
    // 10 question, réconciliés au coût réel. Le serveur aiguille (une question ne
    // coûte que ~10 crédits) : côté client on ne bloque qu'en dessous du minimum.
    const isModification = generatedHTML.length > 0;

    if (!founderAccount && credits !== null && credits < 10) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Crédits insuffisants. Rechargez votre compte pour continuer." },
      ]);
      setUpsell({}); // coût exact inconnu à ce stade (question 10 / app 300)
      return;
    }

    setClarify(null); // un nouveau message remplace un éventuel questionnaire ouvert
    setUpsell(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    // Questions préalables (façon Lovable) avant de CRÉER une application —
    // jamais pour une modification, une question, un document ou des fichiers.
    // RÈGLE ABSOLUE : le questionnaire s'affiche TOUJOURS avant une création
    // d'app. Si l'API ne répond pas, on bascule sur les questions statiques
    // locales — on ne construit JAMAIS sans être passé par les questions.
    if (!isModification && classifyKindHeuristic(trimmed).kind === "module") {
      setLoadingLabel("J'analyse votre besoin…");
      setExpectingBuild(false);
      setIsGenerating(true);
      try {
        const clarifyCtrl = new AbortController();
        const clarifyTimeout = setTimeout(() => clarifyCtrl.abort(), 20000);
        try {
          const res = await fetch("/api/clarify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: trimmed }),
            signal: clarifyCtrl.signal,
          });
          clearTimeout(clarifyTimeout);
          const data = await res.json();
          // Le serveur (aiguilleur) a reconnu un AUTRE besoin qu'une app : agent
          // (mission permanente), document/PDF, réponse ou contrôle de fichiers.
          // Pas de questionnaire d'app : on laisse /api/generate router — c'est
          // le correctif du bug « quel support ? » posé à « envoie un email tous
          // les jours… ».
          if (res.ok && data.skipClarify) {
            setLoadingLabel(null);
            setIsGenerating(false);
            await executeGeneration(trimmed);
            return;
          }
          if (res.ok && Array.isArray(data.questions) && data.questions.length) {
            setClarify({ questions: data.questions, prompt: trimmed });
            return; // la génération partira à la validation (ou l'ignorance) du widget
          }
        } catch {
          clearTimeout(clarifyTimeout);
        }
        // API en échec ou trop lente → questionnaire statique local, sans réseau.
        setClarify({ questions: buildStaticClarifyQuestions(), prompt: trimmed });
        return;
      } finally {
        setLoadingLabel(null);
        setIsGenerating(false);
      }
    }

    await executeGeneration(trimmed);
  };

  // Réponses du questionnaire → prompt enrichi → génération.
  // `structured` permet de lire la réponse device pour forcer le format.
  const onClarifyDone = (answersText: string | null, structured?: Record<string, string[]>) => {
    const base = clarify?.prompt ?? "";
    const clarifyKind = clarify?.kind ?? "module";
    setClarify(null);

    // Synchronise le format avec le device choisi dans le questionnaire (app only).
    const deviceAnswer = structured?.device?.[0];
    let formatOverride: Format | undefined;
    if (deviceAnswer === "mobile")  { formatOverride = "mobile";  setFormat("mobile"); }
    if (deviceAnswer === "desktop") { formatOverride = "desktop"; setFormat("desktop"); }
    if (deviceAnswer === "tablet")  { formatOverride = "auto";    setFormat("auto"); }

    // Document : les réponses SONT le contexte manquant → on relance avec
    // contextProvided (la porte est franchie). App : précisions du questionnaire.
    const isDoc = clarifyKind === "document";
    const genOpts = isDoc ? { contextProvided: true } : { formatOverride };
    const header = isDoc
      ? "# CONTEXTE FOURNI PAR L'UTILISATEUR (à utiliser tel quel, ne rien inventer)"
      : "# PRÉCISIONS DE L'UTILISATEUR (questionnaire avant création)";

    if (answersText) {
      setMessages((prev) => [...prev, { role: "user", content: `📋 Mes réponses :\n${answersText}` }]);
      void executeGeneration(`${base}\n\n${header}\n${answersText}`, genOpts);
    } else {
      void executeGeneration(base, genOpts);
    }
  };

  // Lance réellement la génération (le message utilisateur est déjà affiché).
  const executeGeneration = async (
    apiPrompt: string,
    opts?: {
      formatOverride?: Format;
      files?: { name: string; mediaType: string; data: string }[];
      // Document : contexte déjà fourni par l'utilisateur → ne pas re-poser de
      // questions côté serveur (la porte « contexte suffisant ? » est franchie).
      contextProvided?: boolean;
    }
  ) => {
    const isModification = generatedHTML.length > 0;
    const creditCost = isModification ? 60 : 300;
    setExpectingBuild(!looksLikePureQuestion(apiPrompt));
    setIsGenerating(true);
    const effectiveFormat = opts?.formatOverride ?? format;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: apiPrompt,
          previousHTML: isModification ? generatedHTML : undefined,
          format: effectiveFormat,
          // En itération, on conserve le format d'origine (pas de reclassement).
          kind: isModification ? kind ?? undefined : undefined,
          docType: isModification ? docType ?? undefined : undefined,
          contextProvided: opts?.contextProvided,
          // Captures / documents joints comme contexte de la demande.
          files: opts?.files,
        }),
      });

      // ── Copilote streamé (SSE) : une question → le texte arrive token par
      // token, premier mot en < 1 s. On ne touche ni au livrable ouvert ni à
      // la prévisualisation.
      const ctype = res.headers.get("content-type") ?? "";
      if (res.ok && ctype.includes("text/event-stream") && res.body) {
        setExpectingBuild(false);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let answer = "";
        let started = false;
        const paint = (content: string) => {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "assistant", content };
            return next;
          });
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const raw of events) {
            const line = raw.trim();
            if (!line.startsWith("data:")) continue;
            let evt: { type?: string; text?: string; creditsUsed?: number; error?: string };
            try {
              evt = JSON.parse(line.slice(5));
            } catch {
              continue;
            }
            if (evt.type === "delta" && typeof evt.text === "string") {
              answer += evt.text;
              if (!started) {
                started = true;
                setMessages((prev) => [...prev, { role: "assistant", content: evt.text ?? "" }]);
              } else {
                paint(answer);
              }
            } else if (evt.type === "done") {
              updateCreditsDisplay(evt.creditsUsed ?? 10);
            } else if (evt.type === "error" && evt.error) {
              if (started) paint(evt.error);
              else setMessages((prev) => [...prev, { role: "assistant", content: evt.error ?? "" }]);
            }
          }
        }
        return;
      }

      const data = await res.json();

      // Crédits insuffisants côté serveur → widget d'upgrade dans le fil,
      // en plus du message d'erreur (levé plus bas avec le texte serveur).
      if (res.status === 402) {
        setUpsell({ required: creditCost });
      }

      // Document : contexte insuffisant → Biltia se comporte comme un employé et
      // DEMANDE les infos manquantes (récap + 1 à 3 questions) au lieu d'inventer.
      // La réponse relance la génération avec contextProvided → la porte est
      // franchie, il rédige avec les vraies données. Rien n'a été facturé.
      if (data.needsContext && Array.isArray(data.questions) && data.questions.length) {
        if (typeof data.recap === "string" && data.recap.trim()) {
          setMessages((prev) => [...prev, { role: "assistant", content: data.recap }]);
        }
        setClarify({ questions: data.questions, prompt: apiPrompt, kind: "document" });
        return;
      }

      // Contrôle par lot reconnu, mais aucun fichier joint : on mémorise
      // l'instruction (gratuit) et on invite à glisser les fichiers.
      // Agent recruté (mission permanente) : le serveur a créé la règle et
      // renvoie le message du chat (« jamais muet »), y compris si l'agent est
      // né « bloqué » (info manquante réclamée). Rien à générer.
      if (data.kind === "rule" && typeof data.message === "string" && data.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
        return;
      }

      // Opération workspace exécutée depuis le chat (« ajoute un client… »,
      // « supprime le client… ») : confirmation factuelle, pas de génération.
      if (data.kind === "data" && typeof data.message === "string" && data.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
        if (typeof data.creditsUsed === "number" && data.creditsUsed > 0) {
          updateCreditsDisplay(data.creditsUsed);
        }
        return;
      }

      if (res.ok && data.kind === "action" && data.needsFiles) {
        pendingActionRef.current = apiPrompt;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "⚡ C'est un contrôle par lot. Glissez vos fichiers dans la barre ci-dessous (PDF, photos de bons de livraison, factures…) ou cliquez sur le trombone, puis envoyez : je vérifie tout d'un coup et je signale les écarts — prix incohérents, références inconnues, doublons.",
          },
        ]);
        return;
      }

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
        const finalHtml = newKind === "document" ? data.html : injectErrorCapture(data.html);
        setGeneratedHTML(finalHtml);
        setAppName(data.name);
        // Création : nouveau livrable → nouvel enregistrement. Modification :
        // on GARDE l'id pour mettre à jour le même atelier (jamais de doublon).
        if (!isModification) {
          setSavedId(null);
          savedIdRef.current = null;
          setSlug(null);
        }
        // Mise à jour affichage — la déduction réelle est faite côté serveur
        updateCreditsDisplay(data.creditsUsed ?? creditCost);
        if (data.tenantId) setTenantId(data.tenantId);

        // Sauvegarde automatique : généré = enregistré, immédiatement.
        const autoSaved = await autoSaveGenerated({
          html: finalHtml,
          name: data.name,
          kindValue: newKind,
          tid: (typeof data.tenantId === "string" && data.tenantId) || tenantId,
          description: apiPrompt.slice(0, 300),
          fmt: effectiveFormat,
        });

        const saveNote = autoSaved
          ? newKind === "document"
            ? " Enregistré dans votre bibliothèque."
            : " Enregistrée dans vos ateliers."
          : "";
        let content: string;
        if (isModification) {
          content =
            newKind === "document"
              ? `✓ Document mis à jour.${saveNote} Consultez-le à droite, puis **Imprimer / Enregistrer en PDF**.`
              : `✓ Modification appliquée et sauvegardée. Consultez la prévisualisation à droite. Vous pouvez continuer à itérer.`;
        } else if (newKind === "document") {
          content = `✓ **${data.name}** prêt.${saveNote} Ouvrez-le à droite : bouton **Imprimer / Enregistrer en PDF**, et signez du bout du doigt dans les cadres prévus. Dites-moi quoi ajuster.`;
        } else if (data.actionFallback) {
          content = `✓ **${data.name}** générée.${saveNote} ⚡ Demande de *traitement par lot* reconnue : pour contrôler des fichiers, glissez-les directement dans la barre. En attendant, voici un module opérationnel.`;
        } else {
          content = `✓ Application **${data.name}** générée.${saveNote} Elle est entièrement fonctionnelle : ajoutez, modifiez, supprimez des données — tout est sauvegardé. Dites-moi ce que vous voulez ajuster.`;
        }
        setMessages((prev) => [...prev, { role: "assistant", content }]);
        if (!autoSaved) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "⚠️ Sauvegarde automatique impossible (droits d'équipe ou espace de travail introuvable). Utilisez le bouton **Sauvegarder** en haut à droite.",
            },
          ]);
        }
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

  // SAUVEGARDE AUTOMATIQUE : tout livrable généré part DIRECTEMENT dans les
  // ateliers / la bibliothèque, sans cliquer « Sauvegarder » (exigence produit).
  // L'utilisateur peut supprimer ensuite ; la base est : généré = enregistré.
  // Valeurs passées en arguments (jamais lues depuis l'état : closures périmées).
  const autoSaveGenerated = async (args: {
    html: string;
    name: string;
    kindValue: Kind;
    tid: string | null;
    description: string;
    fmt: Format;
  }): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const dbKind = args.kindValue === "document" ? "document" : "app";

      if (savedIdRef.current) {
        const { error } = await supabase
          .from("modules")
          .update({
            name: args.name,
            html_content: args.html,
            description: args.description,
            format: args.fmt,
            kind: dbKind,
            updated_at: new Date().toISOString(),
          })
          .eq("id", savedIdRef.current);
        return !error;
      }

      if (!args.tid) return false;
      const newSlug = `${slugify(args.name)}-${shortId()}`;
      const { data: row, error } = await supabase
        .from("modules")
        .insert({
          user_id: user.id,
          tenant_id: args.tid,
          created_by: user.id,
          name: args.name,
          description: args.description,
          html_content: args.html,
          format: args.fmt,
          kind: dbKind,
          slug: newSlug,
          is_public: false,
        })
        .select("id, slug")
        .single();
      if (error || !row) return false;
      savedIdRef.current = row.id;
      setSavedId(row.id);
      setSlug(row.slug);
      return true;
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    if (!generatedHTML || isSaving) return;
    setIsSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsSaving(false); return; }

    const description = messages.find((m) => m.role === "user")?.content ?? "";

    // Toute erreur (RLS : rôle Employé/Lecture seule sans droit de création,
    // réseau…) est REMONTÉE à l'utilisateur — jamais de faux « Sauvegardé ».
    const saveFailed = (detail?: string | null) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Sauvegarde impossible${detail ? ` : ${detail}` : ""}. Si vous êtes membre d'une équipe, seuls les rôles Manager, Admin et Propriétaire peuvent enregistrer des applications.`,
        },
      ]);
    };

    if (savedId) {
      const { error } = await supabase
        .from("modules")
        .update({ name: appName, html_content: generatedHTML, description, format, kind: kind === "document" ? "document" : "app", updated_at: new Date().toISOString() })
        .eq("id", savedId);
      if (error) saveFailed(error.message);
    } else {
      if (!tenantId) {
        saveFailed("aucun espace de travail trouvé");
        setIsSaving(false);
        return;
      }
      const newSlug = `${slugify(appName)}-${shortId()}`;
      const { data, error } = await supabase
        .from("modules")
        .insert({
          user_id: user.id,
          tenant_id: tenantId,
          created_by: user.id,
          name: appName,
          description,
          html_content: generatedHTML,
          format,
          kind: kind === "document" ? "document" : "app",
          slug: newSlug,
          is_public: false,
        })
        .select("id, slug")
        .single();
      if (data) {
        setSavedId(data.id);
        savedIdRef.current = data.id;
        setSlug(data.slug);
      } else {
        saveFailed(error?.message);
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

  // Publication : bascule is_public sur le module sauvegardé. Le lien /app/<slug>
  // ne fonctionne QUE public (RLS apps_public_select) — on ne montre donc jamais
  // un lien mort.
  const togglePublish = async () => {
    if (!savedId || isPublishing) return;
    setIsPublishing(true);
    const supabase = createClient();
    const next = !isPublic;
    const { error } = await supabase
      .from("modules")
      .update({ is_public: next, updated_at: new Date().toISOString() })
      .eq("id", savedId);
    if (!error) {
      setIsPublic(next);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: next
            ? `✓ **${appName}** est en ligne. Toute personne disposant du lien peut l'utiliser : ${publicUrl}`
            : `✓ **${appName}** est repassée en privé. Le lien public est désactivé.`,
        },
      ]);
    }
    setIsPublishing(false);
  };

  // App connectée au workspace (SDK window.biltia) : le lien public montre
  // l'interface, mais les DONNÉES ne sont visibles que par l'équipe connectée.
  const isConnectedApp = generatedHTML.includes("window.biltia");

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
      { type: next ? 'BILTIA_VISUAL_EDIT_ON' : 'BILTIA_VISUAL_EDIT_OFF' },
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
    conversationIdRef.current = null; // « Recommencer » = nouvelle conversation
    setClarify(null);
    setUpsell(null);
    setMessages([]);
    setGeneratedHTML("");
    setAppName("Mon application");
    setSavedId(null);
    savedIdRef.current = null;
    setSlug(null);
    setIsPublic(false);
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

  // Deux expériences distinctes : CHAT plein écran (questions/réponses, façon
  // ChatGPT) tant que rien n'est produit ; ATELIER en écran scindé dès qu'on
  // produit quelque chose (app, document, analyse, rapport).
  const showStudio =
    Boolean(generatedHTML) || Boolean(analysis) || Boolean(report) || (isGenerating && expectingBuild);

  return (
    <div ref={rootRef} className="flex flex-col md:flex-row h-full bg-[#FCFCFD]">
      {/* ── Panneau conversation (plein écran en mode chat) ── */}
      <div
        className={`flex flex-col flex-shrink-0 ${resizing ? "" : "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"} ${
          !showStudio || previewHidden
            ? "w-full h-full bg-[#FCFCFD]"
            : sidebarOpen
              ? "bg-white w-full md:w-[420px] md:min-w-[380px] h-[50vh] md:h-full"
              : "bg-white w-0 md:w-0 overflow-hidden h-0 md:h-full"
        }`}
        style={
          isDesktop && showStudio && !previewHidden && sidebarOpen
            ? { width: chatW, minWidth: 300 }
            : undefined
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-[#ECECF2] flex-shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-[#6E6E6C] hover:text-[#0A0A0A] transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-bold tracking-[-0.01em] text-[#0A0A0A] text-base">{showStudio ? "Générateur" : "Assistant"}</h1>
          </div>
          <div className="flex items-center gap-2">
            {(credits !== null || founderAccount) && (
              <span className="text-xs text-[#7C3AED] font-semibold bg-[#F3EFFC] border border-[#ECECF2] px-2.5 py-1 rounded-full tabular-nums">
                ⚡ {founderAccount ? "∞" : credits} crédits
              </span>
            )}
            {messages.length > 0 && (
              <button
                onClick={reset}
                className="p-1.5 text-[#6E6E6C] hover:text-[#0A0A0A] rounded-lg hover:bg-[#F6F6F9] transition-colors"
                title="Recommencer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            {/* App masquée (séparateur tiré au bord droit) → bouton de retour */}
            {showStudio && previewHidden && (
              <button
                onClick={() => setPreviewHidden(false)}
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_4px_14px_rgba(139,92,246,0.3)] hover:shadow-[0_6px_20px_rgba(139,92,246,0.45)] transition-all"
                title="Réafficher l'application"
              >
                <LayoutTemplate className="w-3.5 h-3.5" />
                Aperçu
              </button>
            )}
            {showStudio && !previewHidden && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="hidden md:flex p-1.5 text-[#6E6E6C] hover:text-[#0A0A0A] rounded-lg hover:bg-[#F6F6F9] transition-colors"
                title="Réduire le panneau"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className={`flex min-h-full flex-col gap-3 ${!showStudio ? "mx-auto w-full max-w-[760px]" : ""}`}>
          {messages.length === 0 && !generatedHTML && (
            <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 flex items-center justify-center mb-4 shadow-[0_8px_24px_rgba(60,40,120,0.12)]">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h2 className={`text-[#0A0A0A] mb-2 ${!showStudio ? "text-[26px] font-black tracking-[-0.02em]" : "text-lg font-bold tracking-[-0.01em]"}`}>
                Quel problème réglons-nous ?
              </h2>
              <p className={`text-[#6E6E6C] leading-relaxed ${!showStudio ? "text-[15px] max-w-[440px]" : "text-sm max-w-[280px]"}`}>
                Posez une question, dictez un document, décrivez un outil ou glissez des fichiers à contrôler. Biltia choisit la bonne forme : réponse, PDF, application ou rapport.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 flex items-center justify-center flex-shrink-0 mt-1 mr-2">
                  <span className="text-white text-xs font-black leading-none">B</span>
                </div>
              )}
              <div
                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#0A0A0A] text-white rounded-tr-sm"
                    : "bg-[#F6F6F9] text-[#0A0A0A] rounded-tl-sm border border-[#ECECF2]"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {clarify && !isGenerating && (
            <div className="flex justify-start">
              <ClarifyWidget questions={clarify.questions} onSubmit={onClarifyDone} />
            </div>
          )}

          {upsell && !isGenerating && (
            <div className="flex justify-start">
              <CreditsUpsell balance={credits} required={upsell.required} />
            </div>
          )}

          {isGenerating && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 flex items-center justify-center flex-shrink-0 mt-1 mr-2">
                <span className="text-white text-xs font-black leading-none">B</span>
              </div>
              <div className="bg-[#F6F6F9] border border-[#ECECF2] px-4 py-3 rounded-2xl rounded-tl-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-[#7C3AED] animate-spin" />
                  <span className="text-sm text-[#6E6E6C]">
                    {loadingLabel ?? (expectingBuild ? "Biltia construit votre solution…" : "Biltia vous répond…")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {isAutoFixing && !isGenerating && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0 mt-1 mr-2">
                <Wrench className="w-3 h-3 text-white" />
              </div>
              <div className="bg-amber-50 border border-amber-200 px-4 py-3 rounded-2xl rounded-tl-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                  <span className="text-sm text-amber-600">Correction automatique des erreurs…</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
        </div>

        {/* Format selector — atelier uniquement (bruit inutile en mode chat) */}
        {showStudio && kind !== "document" && !analysis && !report && (
        <div className="px-4 pt-3 pb-1 flex-shrink-0">
          <p className="text-[10px] font-bold text-[#6E6E6C] uppercase tracking-[0.12em] mb-1.5">Format de l&apos;application</p>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F6F6F9] rounded-xl">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  const prev = format;
                  setFormat(f.id);
                  // Si une app est déjà générée ET que le format change réellement,
                  // on adapte automatiquement la navigation (sidebar ↔ bottom tabbar).
                  if (generatedHTML && f.id !== prev && f.id !== "auto") {
                    const toMobile = f.id === "mobile";
                    const adaptMsg = toMobile
                      ? "Adapte UNIQUEMENT la navigation pour mobile : remplace la sidebar/menu du haut par une barre d'onglets en bas (bottom tabbar, 4 icônes max + labels). Si pas de sidebar, ajoute un header avec menu burger. Conserve toutes les fonctionnalités et données."
                      : "Adapte UNIQUEMENT la navigation pour desktop : remplace la barre d'onglets en bas (bottom tabbar) ou le menu burger par une sidebar latérale élégante sur la gauche. Conserve toutes les fonctionnalités et données.";
                    setMessages((prev) => [...prev, { role: "user", content: toMobile ? "📱 Passage en mode mobile" : "🖥️ Passage en mode desktop" }]);
                    void executeGeneration(adaptMsg, { formatOverride: f.id as Format });
                  }
                }}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  format === f.id
                    ? "bg-white text-[#7C3AED] shadow-[0_4px_14px_rgba(60,40,120,0.08)]"
                    : "text-[#6E6E6C] hover:text-[#0A0A0A]"
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
        <div className={`px-4 pb-4 pt-2 flex-shrink-0 ${showStudio ? "border-t border-[#ECECF2]" : ""}`}>
        <div className={!showStudio ? "mx-auto w-full max-w-[760px]" : undefined}>
          {/* Chips fichiers joints */}
          {attached.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attached.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1.5 max-w-[200px] pl-2 pr-1 py-1 rounded-lg bg-[#F3EFFC] border border-[#E2D9F8] text-xs text-[#7C3AED]"
                >
                  <Paperclip className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <button
                    onClick={() => removeAttached(i)}
                    className="flex-shrink-0 p-0.5 rounded hover:bg-violet-500/15"
                    title="Retirer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {fileError && (
            <p className="text-xs text-rose-600 mb-2 flex items-center gap-1">
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
          {/* Appareil photo du téléphone (bon de livraison, chantier…).
              Sur desktop, `capture` est ignoré → simple sélecteur d'image. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {/* Bordure lumineuse animée signature (même effet que la barre de la landing). */}
          <div className="chatframe" style={{ borderRadius: 18 }}>
          <div
            className="chatcard flex items-end gap-2 bg-white border border-[#ECECF2] rounded-[18px] px-3 py-2.5 transition-all"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
          >
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 mb-0.5 p-1.5 rounded-xl transition-colors text-[#6E6E6C] hover:text-[#7C3AED] hover:bg-[#F3EFFC]"
              title="Joindre un document (PDF, image) à analyser"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex-shrink-0 mb-0.5 p-1.5 rounded-xl transition-colors text-[#6E6E6C] hover:text-[#7C3AED] hover:bg-[#F3EFFC]"
              title="Prendre une photo (bon de livraison, chantier…)"
            >
              <Camera className="w-4 h-4" />
            </button>

            <button
              onClick={isListening ? stopVoice : startVoice}
              className={`flex-shrink-0 mb-0.5 p-1.5 rounded-xl transition-colors ${
                isListening
                  ? "bg-rose-50 text-rose-600 animate-pulse"
                  : "text-[#6E6E6C] hover:text-[#7C3AED] hover:bg-[#F3EFFC]"
              }`}
              title={isListening ? "Arrêter l'écoute" : "Parler"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <div className="relative flex-1 min-w-0">
              {!input && !generatedHTML && messages.length === 0 && (
                <span className="absolute top-0 left-0 right-0 text-[#6E6E6C] text-sm pointer-events-none select-none leading-relaxed">
                  {typed}
                  <span aria-hidden className="inline-block w-[2px] h-[0.95em] translate-y-[2px] bg-[#7C3AED]/80 ml-0.5 animate-blink" />
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
                className="relative w-full bg-transparent text-[#0A0A0A] placeholder-[#9A9AA6] text-sm resize-none focus:outline-none min-h-[24px] max-h-32 leading-relaxed"
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
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white rounded-full shadow-[0_6px_20px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_28px_rgba(139,92,246,0.55)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          </div>
          <p className="text-xs text-[#6E6E6C] mt-2 text-center">
            {attached.length > 0
              ? `${attached.length} fichier(s) · ≈ ${attached.length * 25} crédits · ${attached.length > 1 ? "contrôle par lot" : "analyse"}`
              : generatedHTML
              ? "Question ≈ 10 crédits · modification ≈ 60 (ajusté au coût réel)"
              : "Question ≈ 10 crédits · application ≈ 300 (ajusté au coût réel)"}
          </p>
        </div>
        </div>
      </div>

      {/* ── Poignée de redimensionnement chat ↔ app (desktop) ──
          Glisser au bord gauche = app plein écran ; au bord droit = chat
          plein écran (l'app se masque, bouton « Aperçu » pour la rouvrir). */}
      {showStudio && !previewHidden && (
        <div
          onPointerDown={startResize}
          className="hidden md:flex w-[9px] flex-shrink-0 cursor-col-resize items-center justify-center group border-l border-r border-[#ECECF2] bg-white hover:bg-[#F3EFFC] transition-colors select-none touch-none"
          title="Glisser pour redimensionner · jusqu'au bord pour fermer un panneau"
        >
          <div className="w-[3px] h-12 rounded-full bg-[#D6D6DE] group-hover:bg-[#A78BFA] transition-colors" />
        </div>
      )}

      {/* ── Atelier : prévisualisation, uniquement quand on produit ── */}
      {showStudio && !previewHidden && (
      <div ref={previewContainerRef} className="flex flex-col flex-1 min-w-0 h-[50vh] md:h-full border-t md:border-t-0 border-[#ECECF2] bg-[#FCFCFD]">
        {/* Preview header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-[#ECECF2] bg-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="hidden md:flex p-1.5 text-[#6E6E6C] hover:text-[#0A0A0A] rounded-lg hover:bg-[#F6F6F9] transition-colors flex-shrink-0"
                title="Ouvrir le panneau"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
            <div className="flex gap-1.5 flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-[#E7E7E4]" />
              <div className="w-3 h-3 rounded-full bg-[#E7E7E4]" />
              <div className="w-3 h-3 rounded-full bg-[#E7E7E4]" />
            </div>
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="flex-1 min-w-0 bg-[#F6F6F9] border border-[#ECECF2] rounded-lg px-2.5 py-1 text-sm text-[#0A0A0A] focus:outline-none focus:border-[#7C3AED] truncate"
              placeholder="Nom de l'application"
            />
            {/* Statut auto-fix */}
            {generatedHTML && !isGenerating && (
              isAutoFixing ? (
                <span className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Correction…
                </span>
              ) : autoFixCount > 0 ? (
                <span className="flex-shrink-0 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                  ✓ Corrigé
                </span>
              ) : null
            )}
            {/* Format de sortie décidé par l'aiguillage */}
            {generatedHTML && kind && (
              <span
                className={`flex-shrink-0 hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border ${
                  kind === "document"
                    ? "text-[#7C3AED] bg-[#F3EFFC] border-[#E2D9F8]"
                    : kind === "action"
                      ? "text-[#D89B2B] bg-[#FFFBEB] border-[#FDE68A]"
                      : "text-[#6E6E6C] bg-[#F6F6F9] border-[#ECECF2]"
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
              className="p-1.5 text-[#6E6E6C] hover:text-[#0A0A0A] rounded-lg hover:bg-[#F6F6F9] transition-colors"
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
                    ? "bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white border-[#7C3AED] shadow-[0_4px_14px_rgba(60,40,120,0.08)]"
                    : "bg-[#F6F6F9] border-[#ECECF2] text-[#6E6E6C] hover:text-[#7C3AED] hover:bg-[#F3EFFC] hover:border-[#C9BEF0]"
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
                className="p-1.5 text-[#6E6E6C] hover:text-[#0A0A0A] rounded-lg hover:bg-[#F6F6F9] transition-colors"
                title="Ouvrir en plein écran"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
            )}
            {/* Document officiel : envoi direct au client (WhatsApp, email, PDF). */}
            {generatedHTML && !isGenerating && kind === "document" && (
              <ShareMenu
                getDocument={() => iframeRef.current?.contentDocument ?? null}
                title={appName}
              />
            )}
            {generatedHTML && (
              <>
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white text-xs font-semibold rounded-lg shadow-[0_6px_18px_rgba(139,92,246,0.35)] hover:shadow-[0_8px_24px_rgba(139,92,246,0.5)] transition-all disabled:opacity-60"
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
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0A0A0A] text-white text-xs font-semibold rounded-lg shadow-[0_4px_14px_rgba(60,40,120,0.08)] hover:shadow-[0_8px_24px_rgba(60,40,120,0.12)] transition-all disabled:opacity-60"
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

        {/* Public link bar (after save) — le lien /app/<slug> n'existe que public */}
        {slug && savedId && (
          isPublic ? (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-[#F3EFFC] border-b border-[#ECECF2] flex-shrink-0">
              <Globe className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0" />
              <span className="text-xs text-[#7C3AED] font-medium flex-shrink-0 hidden sm:inline">
                En ligne :
              </span>
              <code className="text-xs text-[#0A0A0A] bg-white border border-[#ECECF2] rounded-md px-2 py-1 truncate flex-1 min-w-0">
                /app/{slug}
              </code>
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0A0A0A] text-white text-xs font-semibold rounded-md shadow-[0_4px_14px_rgba(60,40,120,0.08)] hover:shadow-[0_8px_24px_rgba(60,40,120,0.12)] transition-all flex-shrink-0"
              >
                {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copié" : "Copier le lien"}
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-[#7C3AED] hover:text-[#0A0A0A] rounded-md hover:bg-white transition-colors flex-shrink-0"
                title="Ouvrir l'application en ligne"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={togglePublish}
                disabled={isPublishing}
                className="text-xs text-[#6E6E6C] hover:text-rose-600 font-medium flex-shrink-0 transition-colors disabled:opacity-50"
                title="Désactiver le lien public"
              >
                {isPublishing ? "…" : "Retirer"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-[#F6F6F9] border-b border-[#ECECF2] flex-shrink-0">
              <Globe className="w-3.5 h-3.5 text-[#6E6E6C] flex-shrink-0" />
              <span className="text-xs text-[#6E6E6C] flex-1 min-w-0 truncate">
                {isConnectedApp
                  ? "App connectée au workspace — le lien sert à votre équipe (données visibles une fois connecté à Biltia)."
                  : "Application privée — mettez-la en ligne pour obtenir un lien partageable."}
              </span>
              <button
                onClick={togglePublish}
                disabled={isPublishing}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white text-xs font-semibold rounded-md shadow-[0_4px_14px_rgba(60,40,120,0.08)] hover:shadow-[0_8px_24px_rgba(60,40,120,0.12)] transition-all flex-shrink-0 disabled:opacity-60"
              >
                {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                Mettre en ligne
              </button>
            </div>
          )
        )}

        {/* Deployment URL bar */}
        {deploymentUrl && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-[#F3EFFC] border-b border-[#E2D9F8] flex-shrink-0">
            <Globe className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0" />
            <span className="text-xs text-[#7C3AED] font-medium flex-shrink-0 hidden sm:inline">
              Déployé :
            </span>
            <code className="text-xs text-[#0A0A0A] bg-white border border-[#E2D9F8] rounded-md px-2 py-1 truncate flex-1 min-w-0">
              {deploymentUrl}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(deploymentUrl)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#7C3AED] text-white text-xs font-semibold rounded-md hover:bg-[#6D28D9] transition-all flex-shrink-0"
            >
              <Copy className="w-3 h-3" />
              <span className="hidden sm:inline">Copier</span>
            </button>
            <a
              href={deploymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-[#7C3AED] hover:text-[#0A0A0A] rounded-md hover:bg-white transition-colors flex-shrink-0"
              title="Ouvrir le site déployé"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* iframe preview */}
        <div className="flex-1 relative bg-[#F6F6F9] overflow-auto">
          {isGenerating && expectingBuild && (
            <div className="absolute inset-0 bg-[#FCFCFD] flex flex-col items-center justify-center z-10 gap-6 px-8">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 flex items-center justify-center shadow-[0_16px_40px_rgba(60,40,120,0.16)]">
                  <Sparkles className="w-8 h-8 text-white animate-float" />
                </div>
                <div className="absolute -inset-2 rounded-2xl border border-[#E2D9F8] animate-ping" />
              </div>
              <div className="text-center">
                <p className="font-bold tracking-[-0.01em] text-[#0A0A0A] text-base mb-1">
                  {GENERATION_PHASES[generationPhase].label}
                </p>
                <p className="text-xs text-[#6E6E6C]">
                  {GENERATION_PHASES[generationPhase].sub}
                </p>
              </div>
              {/* Phase steps */}
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {GENERATION_PHASES.map((phase, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                      i < generationPhase
                        ? "bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500"
                        : i === generationPhase
                        ? "bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 animate-pulse"
                        : "bg-[#E7E7E4]"
                    }`}>
                      {i < generationPhase ? (
                        <CheckCircle className="w-3 h-3 text-white" />
                      ) : i === generationPhase ? (
                        <Loader2 className="w-3 h-3 text-white animate-spin" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#C9C9D2]" />
                      )}
                    </div>
                    <span className={`text-xs transition-colors duration-300 ${
                      i < generationPhase
                        ? "text-[#7C3AED] font-medium line-through opacity-60"
                        : i === generationPhase
                        ? "text-[#0A0A0A] font-semibold"
                        : "text-[#6E6E6C]"
                    }`}>
                      {phase.label.replace("…", "")}
                    </span>
                  </div>
                ))}
              </div>
              {/* Progression continue : elle avance CHAQUE seconde (asymptote
                  vers 96 %) — preuve visible que rien n'est figé. */}
              <div className="w-full max-w-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-[#7C3AED] tabular-nums">
                    {Math.min(96, Math.round(100 * (1 - Math.exp(-buildSeconds / 28))))}%
                  </span>
                  <span className="text-[11px] text-[#9A9AA6] tabular-nums">
                    {buildSeconds < 60 ? `${buildSeconds} s` : `${Math.floor(buildSeconds / 60)} min ${String(buildSeconds % 60).padStart(2, "0")}`}
                  </span>
                </div>
                <div className="h-1.5 bg-[#E7E7E4] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${Math.min(96, 100 * (1 - Math.exp(-buildSeconds / 28)))}%` }}
                  />
                </div>
                <p className="mt-3 text-center text-[11.5px] text-[#9A9AA6] leading-relaxed">
                  {buildSeconds < 30
                    ? "Biltia écrit votre application ligne par ligne…"
                    : buildSeconds < 75
                    ? "Une application complète prend 1 à 2 minutes. Tout avance normalement."
                    : "Application riche en cours de finition — encore quelques instants."}
                </p>
              </div>
            </div>
          )}

          {/* Bandeau Visual Edit actif */}
          {visualEditMode && (
            <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-center gap-2 py-2 bg-[#7C3AED]/90 text-white text-xs font-semibold pointer-events-none">
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
                <div className="w-[390px] max-w-full h-[760px] bg-[#0A0A0A] rounded-[2.5rem] p-3 shadow-[0_24px_70px_rgba(60,40,120,0.2)] flex-shrink-0">
                  <div className="relative w-full h-full bg-white rounded-[2rem] overflow-hidden">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#0A0A0A] rounded-b-2xl z-10" />
                    <iframe
                      ref={iframeRef}
                      key={generatedHTML.slice(0, 50)}
                      srcDoc={generatedHTML}
                      sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
                      className={`w-full h-full border-0 ${resizing ? "pointer-events-none" : ""}`}
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
                sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
                className={`w-full h-full border-0 ${resizing ? "pointer-events-none" : ""}`}
                title="Application générée"
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-white border border-[#ECECF2] flex items-center justify-center mb-4 shadow-[0_4px_14px_rgba(60,40,120,0.08)]">
                <Wrench className="w-7 h-7 text-[#6E6E6C]" />
              </div>
              <h3 className="font-semibold tracking-[-0.01em] text-[#0A0A0A] mb-2">Prévisualisation</h3>
              <p className="text-sm text-[#6E6E6C] max-w-xs leading-relaxed">
                Décrivez votre outil dans le panneau gauche. L&apos;application
                apparaîtra ici, prête à l&apos;emploi.
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
