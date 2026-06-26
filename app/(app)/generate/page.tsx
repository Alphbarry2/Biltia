"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { slugify, shortId } from "@/lib/slug";
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
} from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Format = "auto" | "mobile" | "desktop";

type Template = { label: string; cat: string; prompt: string };

const TEMPLATES: Template[] = [
  {
    label: "Suivi de chantiers",
    cat: "Gestion",
    prompt:
      "Je veux une fiche de suivi de mes chantiers avec : nom du chantier, adresse, nom du client, téléphone client, état d'avancement en pourcentage, montant HT total, ce qui est déjà facturé, et un champ notes. Je dois pouvoir ajouter, modifier et supprimer des chantiers, et filtrer par état.",
  },
  {
    label: "Devis BTP",
    cat: "Commercial",
    prompt:
      "Je veux un outil de création de devis BTP avec : référence client, désignation des travaux, quantité, unité (m², ml, u, forfait), prix unitaire HT, et calcul automatique du total HT. TVA à 10% par défaut. Calcul du total TTC automatique. Possibilité d'ajouter plusieurs lignes. Bouton imprimer.",
  },
  {
    label: "Factures & acomptes",
    cat: "Commercial",
    prompt:
      "Je veux un outil de facturation BTP : numéro de facture, client, chantier, lignes de prestations avec montant HT, TVA 10% ou 20%, total TTC, facture d'acompte (30%), retenue de garantie 5%, statut payé/impayé et date d'échéance. Total du chiffre d'affaires en haut.",
  },
  {
    label: "Pointage des heures",
    cat: "RH",
    prompt:
      "Je veux un tableau de pointage des heures de mes ouvriers par chantier. Pour chaque entrée : nom de l'ouvrier, chantier, date, heures normales, heures supplémentaires, panier repas, commentaire. Je veux voir le total des heures par ouvrier et par chantier. Export CSV.",
  },
  {
    label: "Sous-traitants & conformité",
    cat: "Conformité",
    prompt:
      "Je veux un tableau de suivi de mes sous-traitants avec : raison sociale, SIRET, qualification QUALIBAT, attestation URSSAF de vigilance, attestation décennale, date d'expiration de chaque document, et contact. Alerte rouge si un document expire dans moins de 30 jours.",
  },
  {
    label: "Commandes matériaux",
    cat: "Logistique",
    prompt:
      "Je veux un suivi des commandes de matériaux : fournisseur, référence, désignation, quantité commandée, quantité reçue, date de commande, date de livraison prévue, chantier destinataire, prix HT total. Signaler en rouge les livraisons en retard.",
  },
  {
    label: "Électricité — installations",
    cat: "Électricité",
    prompt:
      "Je veux un suivi de mes installations électriques par chantier : client, type de logement, tableau électrique, nombre de circuits, nombre de prises et points lumineux, conformité NF C 15-100, passage du Consuel (oui/non + date), montant HT. Alerte si le Consuel n'est pas passé.",
  },
  {
    label: "Plomberie/CVC — entretien",
    cat: "Plomberie · CVC",
    prompt:
      "Je veux un carnet d'entretien de chaudières et pompes à chaleur : client, adresse, type d'appareil (chaudière gaz, PAC, ballon), marque, date du dernier entretien, date du prochain entretien, attestation d'entretien fournie, et un champ observations. Alerte quand un entretien arrive à échéance.",
  },
  {
    label: "Métré au m² (carrelage/peinture)",
    cat: "Second œuvre",
    prompt:
      "Je veux un outil de métré pour carrelage et peinture : pièce, longueur, largeur, hauteur, calcul automatique de la surface au sol et des murs en m², déduction des ouvertures (portes/fenêtres), quantité de matériau nécessaire avec marge de 10%, et prix total HT.",
  },
  {
    label: "Couverture / toiture",
    cat: "Charpente · Couverture",
    prompt:
      "Je veux un suivi de mes chantiers de couverture : client, type de couverture (tuile, ardoise, zinc), surface en m², état (devis, en cours, terminé), présence d'un échafaudage, montant HT, et dates de début et fin. Filtre par état.",
  },
  {
    label: "Planning chantiers",
    cat: "Planning",
    prompt:
      "Je veux un planning de mes chantiers sous forme de liste par semaine : chantier, équipe assignée, date de début, date de fin prévue, tâche en cours, et statut (à venir, en cours, terminé, en retard). Mettre en évidence les chantiers en retard.",
  },
  {
    label: "SAV & réserves",
    cat: "SAV",
    prompt:
      "Je veux un carnet de SAV et de levée de réserves après réception : chantier, client, date de la réception, description de la réserve ou du désordre, photo (lien), date limite de levée (garantie de parfait achèvement), responsable, et statut (ouvert / levé). Alerte si la date limite approche.",
  },
];

const FORMATS: { id: Format; label: string; icon: React.ReactNode }[] = [
  { id: "auto", label: "Auto", icon: <LayoutTemplate className="w-3.5 h-3.5" /> },
  { id: "mobile", label: "Mobile", icon: <Smartphone className="w-3.5 h-3.5" /> },
  { id: "desktop", label: "Desktop", icon: <Monitor className="w-3.5 h-3.5" /> },
];

export default function GeneratePage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
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
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixCount, setAutoFixCount] = useState(0);
  const [visualEditMode, setVisualEditMode] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [generationPhase, setGenerationPhase] = useState(0);
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

  // Pre-fill prompt from landing page
  useEffect(() => {
    const saved = sessionStorage.getItem("batify_prompt");
    if (saved) {
      setInput(saved);
      sessionStorage.removeItem("batify_prompt");
    }
  }, []);

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

  const handleGenerate = async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;

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
        }),
      });

      const data = await res.json();

      if (res.ok && data.html) {
        pendingErrorsRef.current = [];
        setAutoFixCount(0);
        setGeneratedHTML(injectErrorCapture(data.html));
        setAppName(data.name);
        setSavedId(null);
        // Mise à jour affichage — la déduction réelle est faite côté serveur
        updateCreditsDisplay(data.creditsUsed ?? creditCost);
        if (data.tenantId) setTenantId(data.tenantId);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: isModification
              ? "✓ Modification appliquée. Consultez la prévisualisation à droite. Vous pouvez continuer à itérer."
              : `✓ Application **${data.name}** générée. Elle est entièrement fonctionnelle : ajoutez, modifiez, supprimez des données — tout est sauvegardé. Dites-moi ce que vous voulez ajuster.`,
          },
        ]);
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
        .from("apps")
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
        .from("apps")
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
      .from("apps")
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

  const loadTemplate = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
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
          {messages.length === 0 && (
            <div className="flex flex-col h-full px-1">
              <div className="text-center px-4 pt-2 pb-5">
                <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mb-4 shadow-depth-2 mx-auto">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <h2 className="font-display font-bold text-foreground text-base mb-2">BatifyAI</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Décrivez votre outil avec vos mots — Batify comprend tous les
                  métiers du BTP. Parlez, tapez, ou partez d&apos;un modèle&nbsp;:
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 px-1 pb-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => loadTemplate(t.prompt)}
                    className="group text-left p-3 bg-card border border-border rounded-xl shadow-depth-1 hover:shadow-depth-2 transition-all"
                  >
                    <p className="text-[10px] font-bold text-accent uppercase tracking-wide mb-0.5 truncate">
                      {t.cat}
                    </p>
                    <p className="text-xs font-semibold text-foreground group-hover:text-accent-deep leading-snug">
                      {t.label}
                    </p>
                  </button>
                ))}
              </div>
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

        {/* Format selector */}
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

        {/* Template chips (visible after first message) */}
        {messages.length > 0 && !isGenerating && (
          <div className="px-4 pb-1 pt-2 flex gap-2 overflow-x-auto">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => loadTemplate(t.prompt)}
                className="text-xs px-2.5 py-1.5 bg-card border border-border text-muted-foreground rounded-full hover:bg-accent-soft hover:text-accent-deep transition-colors whitespace-nowrap flex-shrink-0"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="px-4 pb-4 pt-2 flex-shrink-0 border-t border-border">
          <div className="flex items-end gap-2 bg-muted/60 border border-border rounded-2xl px-3 py-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-all">
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

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                generatedHTML
                  ? "Dites ce que vous voulez modifier…"
                  : "Décrivez votre outil BTP… (Entrée pour envoyer)"
              }
              rows={1}
              className="flex-1 bg-transparent text-foreground placeholder-muted-foreground text-sm resize-none focus:outline-none min-h-[24px] max-h-32 leading-relaxed"
              style={{ height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
            />

            <button
              onClick={handleGenerate}
              disabled={!input.trim() || isGenerating}
              className="flex-shrink-0 mb-0.5 p-1.5 bg-primary text-white rounded-xl shadow-depth-1 hover:shadow-depth-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {generatedHTML ? "1 crédit par modification" : "2 crédits par génération"}
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

          {generatedHTML ? (
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
