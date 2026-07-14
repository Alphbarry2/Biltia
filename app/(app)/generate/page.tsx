"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";
import { injectAppBrand } from "@/lib/app-brand";
import { brandFromTenant, type BrandKit } from "@/lib/brand";
import { isFounderEmail } from "@/lib/founder";
import { saveConversation, loadConversation } from "@/lib/conversations";
import { looksLikePureQuestion, classifyKindHeuristic } from "@/lib/kind-heuristic";
import { playCompletionChime } from "@/lib/chime";
import { VoiceRecorder } from "@/components/voice-recorder";
import { ClarifyWidget, type ClarifyQuestion } from "@/components/clarify-widget";
import DataStartModal from "@/components/data-start-modal";
import { computeStoredScope } from "@/lib/data-scope";
import { buildStaticClarifyQuestions } from "@/lib/clarify-questions";
import { CreditsUpsell } from "@/components/credits-upsell";
import { ConnectCard } from "@/components/connect-card";
import {
  AnalysisView,
  ReportView,
  fmtEur,
  type AnalysisResult,
  type Proposition,
  type ReportResult,
} from "@/components/report-views";
import { AnnotationCanvas, type Annotation, type AnnotationDoc } from "@/components/annotation-canvas";
import type { Json } from "@/lib/database.types";
import { useTypewriter } from "@/components/site-fx";
import { TEMPLATE_PREVIEWS, localizeTemplatePreview } from "@/lib/template-previews";
import { ShareMenu } from "@/components/share-menu";
import { useSession } from "@/components/session-provider";
import { useT, useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";
// ⚠️ Le navigateur LIT la grille, il n'en garde pas de copie. Il en gardait une, et
// elle avait dérivé sur QUATRE lignes : app 300 (serveur : 600), modification 60
// (150), fichier 25 (10), annotation 30 (15). Conséquences réelles : l'écran de
// recharge annonçait le mauvais montant (l'artisan rechargeait, réessayait, se
// faisait refuser à nouveau), et le pré-contrôle bloquait des gens qui avaient
// pourtant assez de crédits. Un prix écrit en dur ment tôt ou tard.
import { ACTION_CREDITS } from "@/lib/plans";
import {
  Mic,
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
  Tablet,
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
  Plus,
  Image as ImageIcon,
  Share2,
  Link2,
  ArrowRight,
  RefreshCw,
  Upload,
  Menu,
  X,
  AlertTriangle,
  Download,
} from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
  /** Bulle d'échec : affiche un bouton « Réessayer » qui REJOUE LA DEMANDE D'ORIGINE
   *  (avec ses fichiers, sa portée de données, son format), et non le mot « réessaye »
   *  — qui ne veut rien dire tout seul et repartait de zéro. */
  retryable?: boolean;
  /** Rendu client généré : l'image s'affiche dans la bulle, avec un lien de
   *  téléchargement pour la joindre au devis. */
  imageUrl?: string;
};

// Portée des données transmise à /api/generate (branchement de l'app).
// Au niveau du module : `GenOpts` s'en sert, et `GenOpts` sert au retry.
type DataScope =
  | { source: "workspace"; mode: "all" }
  | { source: "workspace"; mode: "select"; records: { entity: string; id: string }[] }
  | { source: "import" }
  | { source: "zero" };

/** Options d'une génération. Nommé pour pouvoir MÉMORISER une tentative et la rejouer. */
type GenOpts = {
  formatOverride?: Format;
  files?: { name: string; mediaType: string; data: string }[];
  // Document : contexte déjà fourni par l'utilisateur → ne pas re-poser de
  // questions côté serveur (la porte « contexte suffisant ? » est franchie).
  contextProvided?: boolean;
  // L'utilisateur a VU le prix de la création et a dit oui (questionnaire
  // pré-création, ou carte de confirmation). Sans ce OUI, le serveur refuse de
  // construire et renvoie le tarif : rien de cher ne part par surprise.
  costAck?: boolean;
  // Portée des données choisie au questionnaire (workspace / import / zéro).
  dataScope?: DataScope;
  // Remplissage d'un document joint : force kind=document côté serveur pour
  // qu'un fichier + « complète-le » produise le document (et pas une réponse).
  docFill?: boolean;
  // App CONSTRUITE À PARTIR d'un fichier joint (Excel/CSV/PDF/photo) : force
  // kind=module côté serveur, sinon « crée une app à partir de ce fichier »
  // retombait en document ou en analyse. Les données sortent du fichier.
  appFromFiles?: boolean;
  // Phase 2 : cette passe est une CORRECTION automatique de branchement (ne
  // réinitialise pas le budget anti-boucle, ne se re-corrige pas elle-même).
  isCorrection?: boolean;
};

// Flux de connexion proposé dans le fil. Gardé HORS de `messages` (donc non
// persisté) : c'est une UI éphémère attachée au dernier tour de l'assistant.
//
// ⚠️ Les connecteurs sont des ALTERNATIVES, pas une checklist (corrigé 2026-07-14).
// `["gmail","outlook"]` veut dire « branchez CELLE DE VOS DEUX que vous utilisez »,
// pas « branchez les deux ». L'ancien code les parcourait en séquence (index++) :
// l'artisan connectait son Gmail, se voyait réclamer Outlook par-dessus, et sa
// demande n'était JAMAIS rejouée tant qu'il n'avait pas les deux. On affiche donc
// toutes les cartes d'un coup, et la PREMIÈRE connexion réussie relance la suite.
// S'il en manquait vraiment une autre, le serveur le redira (il refait le preflight).
type ConnectFlow = {
  connectors: string[];
  /** Demande à rejouer une fois connecté (chemins email / agenda / tâche). */
  resumePrompt: string;
  /**
   * Agent DÉJÀ CRÉÉ (bloqué, en attente de connexion) : on l'active par son id au
   * lieu de rejouer la demande — la rejouer en créerait un SECOND.
   */
  pendingRuleId?: string;
};

type Format = "auto" | "mobile" | "desktop";

// Auto-fix UNIQUEMENT dans cette fenêtre après (re)chargement de l'app. Passé ce
// délai, l'utilisateur S'EN SERT : une erreur déclenchée par un clic ne doit PLUS
// recharger l'iframe (sinon l'app se réinitialise = « boutons qui marchent 1 fois sur 2 »).
const AUTOFIX_WINDOW_MS = 8000;

/**
 * Lit un flux SSE de /api/generate et renvoie l'événement final.
 *
 * ⚠️ /api/generate répond TOUJOURS en `text/event-stream` pour une génération —
 * il n'existe aucune branche qui renverrait du JSON contenant `html`. Faire
 * `await res.json()` dessus lève donc SYSTÉMATIQUEMENT un SyntaxError.
 *
 * C'est exactement ce que faisait l'auto-correction, dans un `catch` vide :
 * l'utilisateur lisait « correction automatique en cours (1/3)… » puis plus
 * rien, jamais — pendant que le serveur, lui, générait la correction ET LA
 * DÉBITAIT. Il payait une réparation qui n'arrivait pas.
 */
async function readGenerationDone(
  res: Response
): Promise<{ html?: string; error?: string; creditsUsed?: number } | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out: { html?: string; error?: string; creditsUsed?: number } | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const raw of events) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      let evt: { type?: string; html?: string; error?: string; creditsUsed?: number };
      try {
        evt = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      if (evt.type === "done") out = { html: evt.html, creditsUsed: evt.creditsUsed };
      else if (evt.type === "error" && typeof evt.error === "string") out = { error: evt.error };
    }
  }
  return out;
}

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
const DOC_LABELS_EN: Record<string, string> = {
  avenant: "Change order",
  pv_reception: "Handover report",
  mise_en_demeure: "Formal notice",
  devis: "Quote",
  facture: "Invoice",
  attestation: "Certificate",
  courrier: "Letter",
  ordre_de_service: "Work order",
  bon_de_commande: "Purchase order",
  levee_reserves: "Snag clearance",
};

function docLabel(docType: string | null, locale: Locale): string {
  if (!docType) return "";
  const dict = locale === "en" ? DOC_LABELS_EN : DOC_LABELS;
  return dict[docType] ?? docType.replace(/_/g, " ");
}

function kindLabel(kind: Kind, docType: string | null, locale: Locale): string {
  if (kind === "document") {
    const d = docLabel(docType, locale);
    return d ? (locale === "en" ? `Document · ${d}` : `Document · ${d}`) : "Document";
  }
  return kind === "action" ? "Action" : "Module";
}

// Intention « produis / MODIFIE un document » sur un fichier joint : on distingue
// la RÉGÉNÉRATION — remplir, compléter, MAIS AUSSI modifier / ajouter / supprimer /
// reformuler / traduire → document propre, prévisualisable + téléchargeable en PDF —
// de la simple ANALYSE (résumer, vérifier, « combien de… »). Heuristique tolérante
// aux accents ; en cas de doute, on retombe sur l'analyse (lecture seule, défaut).
function looksLikeDocumentEdit(text: string): boolean {
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!t.trim()) return false;
  // Verbes qui PRODUISENT ou MODIFIENT un document (→ régénération + PDF).
  const editVerb =
    /(complet|rempli|remplir|redig|etabli|etablir|prepar|gener|fais(?:-| )?(?:moi )?|cree|creer|ecri|reecri|refai|mets? ?a ?jour|modif|ajout|rajout|supprim|enlev|retir|chang|corrig|remplac|inser|reformul|raccourci|allong|tradui|renomm|transform|adapt)/;
  const docNoun =
    /(document|devis|facture|attestation|courrier|lettre|contrat|avenant|clause|article|paragraphe|bon de (commande|livraison)|mise en demeure|ordre de service|recu|avoir|certificat|\bpv\b|proces[- ]verbal|releve|formulaire|cerfa|situation de travaux)/;
  // « complète-le », « modifie ce document », « supprime le paragraphe », « ajoute la clause »
  if (
    /(complet|rempli|remplir|redig|modif|ajout|rajout|supprim|enlev|retir|chang|corrig|remplac|inser|reformul|tradui|adapt).{0,16}(le|la|l|ce|cet|cette|ca|celui|celle|dessus|dedans|ici|document|fichier|formulaire|texte|paragraphe|clause|article)/.test(
      t
    )
  )
    return true;
  if (editVerb.test(t) && docNoun.test(t)) return true;
  // Verbe d'édition + anaphore courte (sous-entend le fichier joint).
  if (editVerb.test(t) && /\b(le|la|l|ce|cet|cette|ca|dessus|dedans|ici)\b/.test(t)) return true;
  return false;
}

// Intention « annote / repère / numérote / entoure » sur un fichier joint → mode
// ANNOTATION IA (overlay corrigeable, relié au workspace) — ni analyse, ni édition.
function looksLikeAnnotate(text: string): boolean {
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!t.trim()) return false;
  return /(annot|numerot|entour|encadr|surlign|repere|reper|marque(?:-| )|marquer|flech|pointe(?:-| )|localise|montre(?:-| )?moi ou|indique ou|mets? un repere)/.test(t);
}

// Intention « à la main / moi-même / sans IA » → mode annotation MANUEL : on ouvre
// la couche vierge sur l'image jointe, sans appel IA ni crédit. À vérifier AVANT
// l'annotation IA (les deux partagent le mot « annote »).
function looksLikeManualAnnotate(text: string): boolean {
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!t.trim()) return false;
  return /(a la main|moi[- ]meme|manuel|manuelle|sans ia|sans l ia|sans l'ia|laisse[- ]moi|je vais annoter|je veux annoter|annoter moi|annote moi)/.test(t);
}


const FORMATS: { id: Format; label: string; icon: React.ReactNode }[] = [
  { id: "auto", label: "Auto", icon: <LayoutTemplate className="w-3.5 h-3.5" /> },
  { id: "mobile", label: "Mobile", icon: <Smartphone className="w-3.5 h-3.5" /> },
  { id: "desktop", label: "Desktop", icon: <Monitor className="w-3.5 h-3.5" /> },
];

const GEN_PLACEHOLDERS_FR = [
  "Sors-moi l'avenant pour le carrelage validé, 45 m²…",
  "Quels chantiers sont en retard cette semaine ?",
  "Vérifie les prix de ces 30 bons de livraison…",
  "Un suivi de mes chantiers avec l'avancement…",
  "Rédige une mise en demeure pour la facture impayée…",
];
const GEN_PLACEHOLDERS_EN = [
  "Draft the change order for the approved tiling, 45 m²…",
  "Which job sites are behind schedule this week?",
  "Check the prices on these 30 delivery notes…",
  "A tracker for my job sites with progress…",
  "Draft a formal notice for the unpaid invoice…",
];

export default function GeneratePage() {
  const t = useT();
  const locale = useLocale();
  const [messages, setMessages] = useState<Message[]>([]);

  // ── LA MÉMOIRE DU COPILOTE ─────────────────────────────────────────────────
  // Le fil, en ref : `executeGeneration` doit lire les messages AU MOMENT DE
  // L'ENVOI, pas ceux figés dans sa closure. Sans ça, le serveur ne recevait
  // QUE le message courant — d'où « Je t'écoute. De quoi as-tu besoin ? »
  // en réponse à « réessaye », alors que le besoin venait d'être expliqué.
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // La dernière demande envoyée, telle quelle (prompt + fichiers + portée).
  // C'est elle que rejoue le bouton « Réessayer ».
  const lastAttemptRef = useRef<{ prompt: string; opts?: GenOpts } | null>(null);

  // Connexions à proposer dans le fil (null = aucune en cours). Mirroir en ref
  // pour l'avancement depuis les callbacks des cartes sans closure périmée.
  const [connectFlow, setConnectFlow] = useState<ConnectFlow | null>(null);
  const connectFlowRef = useRef<ConnectFlow | null>(null);
  useEffect(() => {
    connectFlowRef.current = connectFlow;
  }, [connectFlow]);
  const [input, setInput] = useState("");
  const typed = useTypewriter(locale === "en" ? GEN_PLACEHOLDERS_EN : GEN_PLACEHOLDERS_FR);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHTML, setGeneratedHTML] = useState("");
  const [appName, setAppName] = useState(locale === "en" ? "My app" : "Mon application");
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  // Id sauvegardé, lisible dans les callbacks async sans closure périmée.
  const savedIdRef = useRef<string | null>(null);
  // AppSpec V1 déclarée par le modèle à la dernière génération (Phase 1) →
  // transmise à /api/modules/save. null hors création (la spec y est dérivée).
  const appSpecRef = useRef<unknown>(null);
  // Phase 2 : une seule passe corrective de branchement workspace par demande
  // utilisateur (anti-boucle). Réinitialisé à chaque génération non-corrective.
  const wsCorrectionRef = useRef(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  // Phase 7 : historique des versions + rollback (branche les endpoints Phase 0).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<
    { id: string; version: number; changeType: string; description: string; createdAt: string }[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [format, setFormat] = useState<Format>("auto");
  const [kind, setKind] = useState<Kind | null>(null);
  const [docType, setDocType] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  // Identité visuelle du tenant : sert à coiffer l'APERÇU du logo de l'artisan.
  // Jamais « cuite » dans le HTML enregistré — sinon changer de logo laisserait
  // l'ancien gravé dans toutes les apps déjà créées.
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);

  // Ce que montre l'iframe : le HTML généré, coiffé du logo de l'artisan. Le HTML
  // ENREGISTRÉ, lui, reste vierge de toute URL de logo — l'injection se fait à
  // l'affichage, pour que changer de logo mette à jour TOUTES les apps d'un coup.
  const previewHTML = useMemo(
    () => (brandKit && generatedHTML ? injectAppBrand(generatedHTML, brandKit) : generatedHTML),
    [generatedHTML, brandKit]
  );
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
  const [plusOpen, setPlusOpen] = useState(false);
  // Mobile : on affiche SOIT le chat SOIT l'app (jamais les deux entassés).
  // Balayer vers la droite = chat, vers la gauche = app ; boutons d'en-tête en repli.
  const [mobileView, setMobileView] = useState<"chat" | "app">("app");
  const swipeStartX = useRef<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  // Aperçu desktop : format simulé (bureau / tablette / mobile) qui redimensionne l'iframe.
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const htmlSetAtRef = useRef(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  // Fichiers de la DERNIÈRE analyse, conservés pour qu'un clic sur une
  // proposition (« crée l'app de métré ») puisse rebâtir à partir du document.
  const [analyzedFiles, setAnalyzedFiles] = useState<{ name: string; mediaType: string; data: string }[]>([]);
  const [annotationDoc, setAnnotationDoc] = useState<AnnotationDoc | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [savingEntity, setSavingEntity] = useState(false);
  const [entitySaved, setEntitySaved] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const GENERATION_PHASES = [
    { label: t("Analyse du besoin métier…", "Analyzing your business need…"), sub: t("Identification des champs et règles BTP", "Identifying fields and construction rules") },
    { label: t("Architecture de l'interface…", "Designing the interface…"), sub: t("Structure des vues et navigation", "View structure and navigation") },
    { label: t("Construction des fonctionnalités…", "Building the features…"), sub: t("CRUD, calculs, persistance localStorage", "CRUD, calculations, localStorage persistence") },
    { label: t("Finalisation & contrôle qualité…", "Finalizing & quality check…"), sub: t("Vérification des formules et des données", "Checking formulas and data") },
  ];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const iframeErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingErrorsRef = useRef<string[]>([]);
  const autoFixInProgressRef = useRef(false);
  // Kind courant, lu dans les callbacks (auto-fix) sans dépendre de la closure.
  const kindRef = useRef<Kind | null>(null);
  const docTypeRef = useRef<string | null>(null);
  useEffect(() => { kindRef.current = kind; docTypeRef.current = docType; }, [kind, docType]);
  // Instruction de contrôle par lot énoncée AVANT de joindre les fichiers.
  const pendingActionRef = useRef<string>("");
  // Envoi groupé en attente de validation (aperçu kind=task) : mémorisé jusqu'à
  // ce que l'utilisateur confirme (« oui, envoie ») ou change d'avis.
  const pendingTaskRef = useRef<{ audience: string; subject: string; body: string } | null>(null);
  // Pré-aiguillage instantané côté client : une pure question n'affiche JAMAIS
  // l'écran de construction (phases), juste la bulle « je vous réponds ».
  const [expectingBuild, setExpectingBuild] = useState(true);
  // Questions préalables avant production : "module" = questionnaire de création
  // d'app (façon Lovable) ; "document" = porte « contexte suffisant ? » (l'employé
  // demande les infos manquantes avant de rédiger le PDF).
  const [clarify, setClarify] = useState<{ questions: ClarifyQuestion[]; prompt: string; kind?: "module" | "document"; files?: { name: string; mediaType: string; data: string }[] } | null>(null);
  // Chooser « comment démarrer les données ? » à l'usage d'un template (vierge / import / workspace).
  const [tplChooser, setTplChooser] = useState<{ id: string; name: string; accent: string } | null>(null);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  // Crédits insuffisants (pré-vérification client OU 402 serveur) → widget
  // d'upgrade affiché dans le fil, jamais un simple message sans issue.
  const [upsell, setUpsell] = useState<{ required?: number } | null>(null);
  // PORTE DE COÛT : le serveur a reconnu une création d'application et refuse de
  // construire tant que l'utilisateur n'a pas VU le prix et dit oui. Rien n'a été
  // débité à ce stade — on rejoue sa demande TELLE QU'ELLE ÉTAIT s'il accepte.
  const [costAsk, setCostAsk] = useState<{ credits: number; prompt: string; opts?: GenOpts } | null>(null);
  // Compte fondateur : jamais bloqué par les crédits (cf. lib/founder.ts).
  const [founderAccount, setFounderAccount] = useState(false);
  // Historique : id de la conversation en cours (créée au premier échange).
  const conversationIdRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Portée des données choisie au questionnaire (vierge/import/workspace) pour la
  // CRÉATION en chat → persistée sur le module au 1er enregistrement (data_scope).
  const dataScopeRef = useRef<unknown>(null);

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
            { role: "assistant", content: t("Impossible de rouvrir cette conversation (introuvable ou accès refusé). Décrivez votre besoin pour en démarrer une nouvelle.", "Couldn't reopen this conversation (not found or access denied). Describe your need to start a new one.") },
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
                  t("Impossible de charger cette application (introuvable ou accès refusé). Décrivez l'outil dont vous avez besoin pour en créer une nouvelle.", "Couldn't load this app (not found or access denied). Describe the tool you need to create a new one."),
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
              // Fini le SPAM : on ne rajoute PLUS de message « rechargée à droite »
              // à chaque ouverture (il était persisté → il se multipliait). On filtre
              // aussi ceux déjà accumulés dans l'historique existant.
              const history = Array.isArray(conv?.messages)
                ? (conv.messages as unknown as Message[]).filter(
                    (m) =>
                      m &&
                      (m.role === "user" || m.role === "assistant") &&
                      typeof m.content === "string" &&
                      !(m.role === "assistant" && /est (re)?chargée à droite/.test(m.content))
                  )
                : [];
              if (conv) conversationIdRef.current = conv.id;
              setMessages(history);
            });
        });
      return;
    }

    // 1) "Utiliser ce modèle" → on demande d'abord COMMENT démarrer les données
    //    (vierge / import / workspace), puis on instancie avec la portée choisie.
    if (tpl) {
      const metaRaw = TEMPLATE_PREVIEWS.find((p) => p.id === tpl);
      const meta = metaRaw ? localizeTemplatePreview(metaRaw, locale) : undefined;
      const name = meta?.name ?? (locale === "en" ? "My app" : "Mon application");
      const accent = meta?.accent ?? "#4F46E5";
      setAppName(name);
      setKind("module");
      kindRef.current = "module";
      setMessages([
        {
          role: "assistant",
          content: t(`**${name}** — choisissez comment démarrer : à partir de zéro, en important un fichier Excel/CSV, ou depuis votre workspace. Tout ce que vous saisirez restera synchronisé dans votre workspace.`, `**${name}** — choose how to start: from scratch, by importing an Excel/CSV file, or from your workspace. Everything you enter stays synced to your workspace.`),
        },
      ]);
      setTplChooser({ id: tpl, name, accent });
      return;
    }

    // 1bis) Démarrage FRAIS demandé (ex. « Recruter un agent » depuis /agents) :
    //       page assistant VIERGE — on n'ouvre NI la dernière app NI le dernier fil
    //       (sinon on retombe sur une app existante, cf. bug remonté). Selon
    //       l'intention (?new=agent), on oriente le message d'accueil.
    const fresh = params.get("new");
    if (fresh) {
      conversationIdRef.current = null;
      if (fresh === "agent") {
        setMessages([
          {
            role: "assistant",
            content:
              t("Décrivez la **mission permanente** que je dois prendre en charge, et je m'en occupe tout seul, en temps et en heure.\n\nPar exemple :\n• « Chaque lundi à 8h, envoie-moi la liste de mes factures impayées »\n• « Relance le client Martin tous les 3 jours tant qu'il n'a pas payé »\n• « Tous les soirs à 18h, fais-moi le récap des heures pointées du jour »\n\nQue voulez-vous me déléguer ?", "Describe the **standing mission** you want me to take over, and I'll handle it on my own, on time.\n\nFor example:\n• “Every Monday at 8am, send me the list of my unpaid invoices”\n• “Chase client Martin every 3 days until he pays”\n• “Every evening at 6pm, give me the recap of the day's logged hours”\n\nWhat would you like to delegate to me?"),
          },
        ]);
      }
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

  // L'utilisateur, le workspace ET le solde de crédits sont DÉJÀ résolus par la
  // session partagée (getUser était un appel réseau sérialisé par un verrou global).
  // Il ne reste ici qu'une seule vraie requête : l'identité visuelle.
  const { user: sessionUser, membership: sessionMembership, billing, loading: sessionLoading } = useSession();

  useEffect(() => {
    if (sessionLoading || !sessionUser) return;
    setFounderAccount(isFounderEmail(sessionUser.email));
    // Solde total = abonnement (balance) + packs (topup_balance, non expirable).
    if (billing) setCredits(billing.credits);
    if (!sessionMembership?.tenant_id) return;
    setTenantId(sessionMembership.tenant_id);

    // Identité visuelle : l'aperçu doit montrer le logo de l'artisan dès la première
    // seconde, comme l'app une fois ouverte.
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("tenants")
      .select("name, logo_url, company_info")
      .eq("id", sessionMembership.tenant_id)
      .maybeSingle()
      .then(({ data: tenant }) => {
        if (!cancelled && tenant) setBrandKit(brandFromTenant(tenant));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, sessionUser?.id, sessionMembership?.tenant_id, billing?.credits]);

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

  // ── Auto-hauteur de la barre de saisie ───────────────────────────────────
  // La barre grandit avec le texte et le montre EN ENTIER (frappe, dictée
  // vocale, collage, restauration d'un brouillon). On recalcule à CHAQUE
  // changement de `input`, pas seulement à la frappe : sinon la dictée (valeur
  // posée par React, sans événement natif) resterait clippée à une seule ligne.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

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

  // Repli quand on ferme le chooser ou qu'un modèle n'est pas instanciable :
  // on charge la maquette dans l'atelier pour l'adapter au chat (le modèle
  // d'origine ne bouge pas, l'utilisateur crée sa propre version).
  // IMPORTANT : variante « /live » (SDK RÉEL → workspace de l'utilisateur), PAS
  // /t/[id] qui embarque le jeu de DÉMO. Dans le produit connecté, un workspace
  // vide DOIT s'afficher vide — jamais de donnée fabriquée (SCI Méditerranée…).
  const loadTemplatePreview = useCallback((tpl: string, name: string) => {
    fetch(`/t/${encodeURIComponent(tpl)}/live`)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((html) => {
        setGeneratedHTML(injectErrorCapture(html));
        setMessages([
          {
            role: "assistant",
            content: t(`Voici le modèle **${name}**, prêt à l'emploi à droite. Dites-moi ce que vous voulez adapter (couleurs, colonnes, champs, textes…). Vos changements créent votre propre version : le modèle d'origine ne bouge pas.`, `Here is the **${name}** template, ready to use on the right. Tell me what you'd like to adapt (colors, columns, fields, text…). Your changes create your own version: the original template stays unchanged.`),
          },
        ]);
      })
      .catch(() => {
        setMessages([{ role: "assistant", content: t("Impossible de charger ce modèle. Décrivez plutôt l'outil dont vous avez besoin.", "Couldn't load this template. Describe the tool you need instead.") }]);
      });
  }, [injectErrorCapture]);

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
        content: t(`🔧 Erreurs détectées, correction automatique en cours (${fixCount + 1}/3)…\n\`\`\`\n${errorSummary}\n\`\`\``, `🔧 Errors detected, auto-fixing (${fixCount + 1}/3)…\n\`\`\`\n${errorSummary}\n\`\`\``),
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

      // La réponse est un flux SSE, jamais du JSON. Cf. readGenerationDone().
      const data = await readGenerationDone(res);

      // Le compteur DOIT avancer même en échec. Il vivait auparavant dans la
      // branche de succès — jamais atteinte — donc le garde-fou « 3 tentatives
      // max » ne se déclenchait pas : chaque nouvelle erreur JS relançait une
      // correction facturée, indéfiniment.
      setAutoFixCount(fixCount + 1);

      if (!res.ok || !data?.html) {
        // Ne JAMAIS rester muet : la correction a été tentée (et facturée), on le
        // dit, et on rend la main plutôt que de laisser un « en cours… » éternel.
        const why = data?.error;
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: why
              ? t(`Je n'ai pas pu corriger automatiquement : ${why}`, `I couldn't auto-fix this: ${why}`)
              : t(
                "Je n'ai pas réussi à corriger automatiquement. Dites-moi ce qui ne va pas et je m'en occupe.",
                "I couldn't auto-fix this. Tell me what's wrong and I'll take care of it."
              ),
          },
        ]);
        return;
      }

      setGeneratedHTML(data.html);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: t(`✓ Correction ${fixCount + 1} appliquée. Vérification…`, `✓ Fix ${fixCount + 1} applied. Checking…`) },
      ]);
      // L'app vit déjà dans les ateliers → la correction y part aussi (silencieux),
      // via le chemin autoritaire : une version « autofix » est enregistrée sans
      // toucher au nom/à la description (le garde-fou ne bloque pas un auto-fix).
      if (savedIdRef.current) {
        void saveModuleApi({
          moduleId: savedIdRef.current,
          html: data.html,
          changeType: 'autofix',
          sourcePrompt: 'Correction automatique',
        });
      }
    } catch {
      // Réseau coupé en plein flux : on consomme quand même une tentative et on
      // le dit. Un échec muet laissait « correction en cours… » à l'écran pour
      // toujours.
      setAutoFixCount(fixCount + 1);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: t(
            "La correction automatique n'a pas abouti (connexion interrompue). Dites-moi ce qui ne va pas.",
            "Auto-fix didn't complete (connection lost). Tell me what's wrong."
          ),
        },
      ]);
    } finally {
      autoFixInProgressRef.current = false;
      setIsAutoFixing(false);
    }
  }, [format]);

  // Horodate chaque (re)chargement d'app → borne la fenêtre d'auto-fix.
  useEffect(() => {
    if (generatedHTML) htmlSetAtRef.current = Date.now();
  }, [generatedHTML]);

  // ── Écouter les messages de l'iframe ─────────────────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // GARDE DE PROVENANCE — ne PAS retirer.
      // Ce pont proxifie /api/* avec les cookies de session de l'utilisateur. Sans
      // ce contrôle, TOUTE fenêtre capable de nous poster un message (site tiers
      // qui nous encadre, popup, opener) pilotait l'API en son nom : lecture du
      // workspace, envoi d'emails, consommation des crédits. On n'accepte donc que
      // les messages dont la fenêtre émettrice EST notre propre iframe.
      const frame = iframeRef.current?.contentWindow ?? null;
      if (!frame || event.source !== frame) return;

      // Pont API : l'iframe ne fait jamais fetch elle-même → elle envoie
      // BILTIA_API_CALL, on proxifie vers /api/data en same-origin.
      if (event.data?.type === 'BILTIA_API_CALL') {
        const { id, body } = event.data as { id: string; body: unknown };
        // Répondre à la fenêtre émettrice, désormais vérifiée comme étant la
        // nôtre, et sur une cible explicite (jamais '*').
        const reply = (payload: Record<string, unknown>) => {
          frame.postMessage({ type: 'BILTIA_API_RESPONSE', id, ...payload }, window.location.origin);
        };
        const ep = (body as { __endpoint?: string } | null)?.__endpoint;
        const apiUrl =
          ep === 'app-ai' ? '/api/app-ai'
            : ep === 'email' ? '/api/app-email'
            : ep === 'document' ? '/api/app-document'
            : ep === 'sms' ? '/api/app-sms'
            : ep === 'agents' ? '/api/app-agents'
            : ep === 'telemetry' ? '/api/app-telemetry'
            : '/api/data';
        // Aperçu (app pas encore enregistrée) : on joint la portée choisie au
        // questionnaire pour que « vierge » s'affiche VIDE dès l'aperçu (et une
        // sélection reste filtrée). since=maintenant → masque l'existant.
        const previewScope = !ep ? computeStoredScope(dataScopeRef.current, new Date().toISOString()) : null;
        const outBody =
          !ep && body && typeof body === 'object'
            ? { ...(body as Record<string, unknown>), dataScope: previewScope }
            : (ep === 'agents' || ep === 'telemetry') && body && typeof body === 'object'
              ? { ...(body as Record<string, unknown>), moduleId: savedIdRef.current }
              : body;
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(outBody),
        })
          .then(async (res) => {
            const result = await res.json().catch(() => null);
            if (!res.ok) reply({ error: result?.error ?? t(`Erreur ${res.status}`, `Error ${res.status}`) });
            else reply({ result });
          })
          .catch((err: unknown) => {
            reply({ error: err instanceof Error ? err.message : t('Réseau indisponible', 'Network unavailable') });
          });
        return;
      }

      if (event.data?.type === 'BILTIA_JS_ERROR') {
        const errors: string[] = event.data.errors ?? [];
        if (!errors.length || autoFixInProgressRef.current) return;
        // Passé la fenêtre initiale, l'app est EN USAGE → on ne la recharge JAMAIS
        // (une erreur déclenchée par un clic ne doit pas remettre l'app à zéro).
        if (Date.now() - htmlSetAtRef.current > AUTOFIX_WINDOW_MS) return;

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
        const desc: string = event.data.desc ?? t('cet élément', 'this element');
        setInput(t(`Modifie ${desc} : `, `Edit ${desc}: `));
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
          setFileError(t(`Type non supporté : ${f.name} (PDF, PNG, JPEG, WebP uniquement).`, `Unsupported type: ${f.name} (PDF, PNG, JPEG, WebP only).`));
          continue;
        }
        if (f.size > MAX_FILE_BYTES_CLIENT) {
          setFileError(t(`Fichier trop lourd : ${f.name} (3,5 Mo max).`, `File too large: ${f.name} (3.5 MB max).`));
          continue;
        }
        try {
          accepted.push({ name: f.name, mediaType: f.type, data: await fileToBase64(f), size: f.size });
        } catch {
          setFileError(t(`Lecture impossible : ${f.name}.`, `Couldn't read: ${f.name}.`));
        }
      }
      if (accepted.length) {
        setAttached((prev) => {
          const merged = [...prev, ...accepted].slice(0, MAX_FILES_CLIENT);
          if (prev.length + accepted.length > MAX_FILES_CLIENT) {
            setFileError(t(`${MAX_FILES_CLIENT} fichiers maximum par analyse.`, `${MAX_FILES_CLIENT} files maximum per analysis.`));
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
  // Le tarif vient de la grille : lecture_fichier, PAR FICHIER.
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
        title: (title || t("Rapport", "Report")).slice(0, 120),
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
    const creditCost = attached.length * ACTION_CREDITS.lecture_fichier;

    if (!founderAccount && credits !== null && credits < creditCost) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("⚠️ Crédits insuffisants. Rechargez votre compte pour continuer.", "⚠️ Not enough credits. Top up your account to continue.") },
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
          : t(`📎 Analyse de ${attached.length} fichier(s) : ${fileNames}`, `📎 Analysis of ${attached.length} file(s): ${fileNames}`),
      },
    ]);
    setInput("");
    setAttached([]);
    setAnalysis(null);
    setReport(null);
    setAnnotationDoc(null);
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
        throw new Error(data.error ?? t("Erreur inconnue", "Unknown error"));
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
        void persistReport("controle", question || t(`Contrôle de ${rep.items.length} fichier(s)`, `Check of ${rep.items.length} file(s)`), rep.items.length, rep);
        const n = rep.anomalies.length;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              n > 0
                ? t(`✓ Rapport prêt : **${n} anomalie(s)** détectée(s) sur ${rep.items.length} fichier(s). Détail à droite.`, `✓ Report ready: **${n} anomaly(ies)** found across ${rep.items.length} file(s). Details on the right.`)
                : t(`✓ Contrôle terminé sur ${rep.items.length} fichier(s) : **aucune anomalie** détectée.`, `✓ Check complete on ${rep.items.length} file(s): **no anomaly** found.`),
          },
        ]);
      } else {
        const result: AnalysisResult = {
          extraction: data.extraction,
          answer: typeof data.answer === "string" ? data.answer : "",
          fileCount: data.fileCount ?? 1,
          comptages: Array.isArray(data.comptages) ? data.comptages : [],
          incertitudes: Array.isArray(data.incertitudes) ? data.incertitudes : [],
          confiance: data.confiance ?? null,
          // Ce que Biltia sait tirer de CE document (app de métré depuis un plan…).
          propositions: Array.isArray(data.propositions) ? data.propositions : [],
        };
        setAnalysis(result);
        // On GARDE les fichiers analysés : cliquer une proposition doit pouvoir
        // reconstruire l'app à partir du document (sinon le plan est perdu et
        // l'app se génère à vide). `attached` a été vidé pour libérer la barre.
        setAnalyzedFiles(payload);
        void persistReport(
          "analyse",
          question || t(`Analyse : ${result.extraction?.type_document ?? "document"} — ${fileNames}`, `Analysis: ${result.extraction?.type_document ?? "document"} — ${fileNames}`),
          result.fileCount,
          result
        );
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.answer
              ? t(`✓ ${result.answer}\n\nDétail extrait à droite. Vous pouvez l'enregistrer dans le workspace.`, `✓ ${result.answer}\n\nExtracted details on the right. You can save it to the workspace.`)
              : t(`✓ Document analysé. L'essentiel est extrait à droite : relisez, puis **Enregistrer dans le workspace**.`, `✓ Document analyzed. The essentials are extracted on the right: review, then **Save to workspace**.`),
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ ${err instanceof Error ? err.message : t("Erreur lors de l'analyse. Réessayez.", "Error during analysis. Try again.")}`,
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Mode ANNOTATION : l'IA propose des repères sur le document joint (overlay
  // corrigeable, relié au workspace). Un seul document à la fois.
  const handleAnnotate = async (instruction: string) => {
    const file = attached[0];
    if (!file) return;
    const creditCost = ACTION_CREDITS.annotation;
    if (!founderAccount && credits !== null && credits < creditCost) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("⚠️ Crédits insuffisants. Rechargez votre compte pour continuer.", "⚠️ Not enough credits. Top up your account to continue.") },
      ]);
      setUpsell({ required: creditCost });
      return;
    }
    setUpsell(null);
    setMessages((prev) => [...prev, { role: "user", content: `${instruction}\n\n📎 ${file.name}` }]);
    setInput("");
    setAttached([]);
    setAnalysis(null);
    setReport(null);
    setGeneratedHTML("");
    setKind(null);
    setExpectingBuild(false);
    setIsGenerating(true);
    try {
      const res = await fetch("/api/annotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: { name: file.name, mediaType: file.mediaType, data: file.data }, instruction }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) setUpsell({ required: creditCost });
        throw new Error(data.error ?? t("Erreur inconnue", "Unknown error"));
      }
      updateCreditsDisplay(data.creditsUsed ?? creditCost);
      const anns: Annotation[] = Array.isArray(data.annotations) ? data.annotations : [];
      setAnnotations(anns);
      setAnnotationDoc({ name: file.name, mediaType: file.mediaType, dataUrl: file.data });
      const uncertain = anns.filter((a) => a.incertain).length;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t(`✓ ${data.resume || `${anns.length} repère(s) proposé(s).`}${uncertain ? ` **${uncertain} à vérifier.**` : ""}\n\nAjustez les repères à droite (glisser / ajouter / supprimer), puis reliez-les au workspace (tâche ou réserve).`, `✓ ${data.resume || `${anns.length} marker(s) proposed.`}${uncertain ? ` **${uncertain} to check.**` : ""}\n\nAdjust the markers on the right (drag / add / remove), then link them to the workspace (task or snag).`),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ ${err instanceof Error ? err.message : t("Erreur d'annotation. Réessayez.", "Annotation error. Try again.")}` },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Mode ANNOTATION MANUEL : on ouvre la couche d'annotation vierge sur l'image
  // jointe — l'utilisateur pose ses repères lui-même. Aucun appel IA, aucun crédit.
  const handleManualAnnotate = () => {
    const file = attached[0];
    if (!file) return;
    const isImg = file.mediaType.startsWith("image/");
    setMessages((prev) => [...prev, { role: "user", content: `${t("Annoter à la main", "Annotate manually")}\n\n📎 ${file.name}` }]);
    setInput("");
    setAttached([]);
    setAnalysis(null);
    setReport(null);
    setGeneratedHTML("");
    setKind(null);
    setExpectingBuild(false);
    setUpsell(null);
    setAnnotations([]);
    setAnnotationDoc({ name: file.name, mediaType: file.mediaType, dataUrl: file.data });
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: isImg
          ? t("✍️ À vous de jouer : cliquez « Ajouter un repère » puis sur le plan pour poser vos annotations, glissez-les pour ajuster, et reliez-les au workspace (tâche / réserve).", "✍️ Your turn: click “Add a marker” then on the plan to place your annotations, drag to adjust, and link them to the workspace (task / snag).")
          : t("L'annotation à la main nécessite une **image** (photo ou capture du plan) — pour un PDF, l'overlay arrive bientôt.", "Manual annotation needs an **image** (photo or screenshot of the plan) — for a PDF, the overlay is coming soon."),
      },
    ]);
  };

  // ── CLIC SUR UNE PROPOSITION ISSUE DE LA LECTURE DU DOCUMENT ────────────────
  // Biltia a LU le document et propose ce qu'il sait en tirer (app de métré
  // depuis un plan, app de gestion depuis un tableau, document depuis un
  // courrier). Rien ne part sans ce clic : créer une app est l'action la plus chère
  // du produit (cf. ACTION_CREDITS dans lib/plans.ts) et on ne la déclenche JAMAIS
  // par surprise sur un simple dépôt de fichier (décision 2026-07-12).
  // Les fichiers analysés repartent avec la demande → l'app se bâtit sur le
  // document réel, jamais à vide.
  const handleProposition = async (p: Proposition) => {
    if (isGenerating) return;
    if (p.action === "extract") {
      await saveAnalysisToWorkspace();
      return;
    }
    const files = analyzedFiles.length ? analyzedFiles : undefined;
    setMessages((prev) => [...prev, { role: "user", content: p.prompt }]);
    setAnalysis(null); // l'atelier remplace l'écran d'analyse
    setUpsell(null);
    if (p.action === "module") {
      setKind("module");
      kindRef.current = "module";
      // La carte de proposition AFFICHE déjà le prix (« Création d'application ·
      // N crédits », cf. components/report-views). Ce clic EST le consentement :
      // la porte de coût serveur ne doit pas le redemander, sinon on fait confirmer
      // deux fois un prix déjà annoncé et déjà accepté.
      await executeGeneration(p.prompt, { files, appFromFiles: true, costAck: true });
    } else {
      setKind("document");
      kindRef.current = "document";
      await executeGeneration(p.prompt, { files, docFill: true });
    }
  };

  // Enregistre l'extraction comme document du workspace (aperçu → confirmation).
  const saveAnalysisToWorkspace = async () => {
    if (!analysis || savingEntity) return;
    setSavingEntity(true);
    const ex = analysis.extraction;
    const notesParts = [
      ex.resume,
      ex.montant_ttc != null ? t(`TTC ${fmtEur(ex.montant_ttc)}`, `Incl. tax ${fmtEur(ex.montant_ttc)}`) : null,
      ex.emetteur ? t(`Émetteur : ${ex.emetteur}`, `Issuer: ${ex.emetteur}`) : null,
    ].filter(Boolean);
    const values = {
      nom: ex.reference || ex.type_document || t("Document analysé", "Analyzed document"),
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
      if (!res.ok) throw new Error(data.error ?? t("Enregistrement impossible.", "Save failed."));
      setEntitySaved(true);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t(`✓ Enregistré dans le workspace (Documents) : **${values.nom}**.`, `✓ Saved to the workspace (Documents): **${values.nom}**.`) },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ ${err instanceof Error ? err.message : t("Enregistrement impossible.", "Save failed.")}` },
      ]);
    } finally {
      setSavingEntity(false);
    }
  };

  // Exécute un envoi groupé validé (« oui, envoie ») : appelle /api/task/execute,
  // qui ré-résout le groupe à frais et envoie. Rapport factuel dans le chat.
  async function executePendingTask(pending: { audience: string; subject: string; body: string }) {
    setIsGenerating(true);
    setLoadingLabel(t("J'envoie…", "Sending…"));
    try {
      const res = await fetch("/api/task/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
      });
      const data = await res.json().catch(() => ({}));
      const msg =
        typeof data?.message === "string" && data.message
          ? data.message
          : typeof data?.error === "string" && data.error
            ? `⚠️ ${data.error}`
            : res.ok
              ? t("Envoi effectué.", "Sent.")
              : t("⚠️ Je n'ai pas pu envoyer. Réessaie dans un instant.", "⚠️ I couldn't send it. Try again in a moment.");
      setMessages((prev) => [...prev, { role: "assistant", content: msg }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("⚠️ Je n'ai pas pu envoyer (réseau). Réessaie dans un instant.", "⚠️ I couldn't send it (network). Try again in a moment.") },
      ]);
    } finally {
      setLoadingLabel(null);
      setIsGenerating(false);
    }
  }

  const handleGenerate = async (promptOverride?: string) => {
    const trimmed = (promptOverride ?? input).trim();
    if (isGenerating) return;

    // Fichiers joints AVEC une app ouverte dans l'atelier → CONTEXTE de la
    // modification (capture d'écran du problème, document de référence) :
    // ils partent avec la demande à /api/generate, PAS vers l'analyse workspace.
    if (attached.length > 0 && generatedHTML && kindRef.current !== "document") {
      const files = attached.map((f) => ({ name: f.name, mediaType: f.mediaType, data: f.data }));
      const fileNames = attached.map((f) => f.name).join(", ");
      const instruction = trimmed || t("Regarde les fichiers joints et corrige le problème qu'ils montrent.", "Look at the attached files and fix the problem they show.");
      setMessages((prev) => [...prev, { role: "user", content: `${instruction}\n\n📎 ${fileNames}` }]);
      setInput("");
      setAttached([]);
      setUpsell(null);
      await executeGeneration(instruction, { files });
      return;
    }

    // Fichier joint + intention « à la main / sans IA » → mode ANNOTATION MANUEL :
    // couche vierge sur l'image, l'utilisateur pose ses repères (aucun crédit).
    // Reste une REGEX à dessein : consigne explicite, zéro IA, zéro crédit.
    if (attached.length > 0 && !generatedHTML && looksLikeManualAnnotate(trimmed)) {
      handleManualAnnotate();
      return;
    }

    // ── FICHIER(S) JOINT(S), SANS APP OUVERTE : L'AIGUILLEUR DÉCIDE ────────────
    // Quatre portes : ANALYSER (lecture seule) · ANNOTER · en tirer un DOCUMENT ·
    // en tirer une APPLICATION. Ce choix se faisait par regex (verbe d'édition +
    // petit mot) : « CRÉE-moi une app à partir de CE fichier » partait en
    // régénération de PDF, et aucun chemin ne menait au générateur d'app.
    // Désormais /api/file-intent tranche (même modèle que le reste de
    // l'aiguillage) ; les regex ne servent plus que de REPLI si l'API échoue.
    if (attached.length > 0 && !generatedHTML) {
      const files = attached.map((f) => ({ name: f.name, mediaType: f.mediaType, data: f.data }));
      const fileNames = attached.map((f) => f.name).join(", ");

      let intent: "analyze" | "annotate" | "document" | "module" | null = null;
      if (trimmed) {
        setLoadingLabel(t("J'analyse votre demande…", "Analyzing your request…"));
        setExpectingBuild(false);
        setIsGenerating(true);
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 20000);
          try {
            const res = await fetch("/api/file-intent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: trimmed }),
              signal: ctrl.signal,
            });
            clearTimeout(to);
            const data = await res.json();
            if (res.ok && (data.intent === "analyze" || data.intent === "annotate" || data.intent === "document" || data.intent === "module")) {
              intent = data.intent;
            }
          } catch {
            clearTimeout(to);
          }
        } finally {
          setLoadingLabel(null);
          setIsGenerating(false);
        }
      }

      // Repli déterministe si l'aiguilleur n'a pas répondu (API lente/KO) :
      // les anciennes heuristiques, dans leur ordre historique.
      if (!intent) {
        intent = looksLikeAnnotate(trimmed)
          ? "annotate"
          : looksLikeDocumentEdit(trimmed)
            ? "document"
            : "analyze";
      }

      if (intent === "annotate") {
        await handleAnnotate(trimmed);
        return;
      }

      // DOCUMENT : feuille A4 propre, prévisualisable + téléchargeable en PDF,
      // reconstruite à partir du fichier source + fiche entreprise + workspace.
      if (intent === "document") {
        setMessages((prev) => [...prev, { role: "user", content: `${trimmed}\n\n📎 ${fileNames}` }]);
        setInput("");
        setAttached([]);
        setUpsell(null);
        setKind("document");
        kindRef.current = "document";
        await executeGeneration(trimmed, { files, docFill: true });
        return;
      }

      // MODULE : une VRAIE application dont les données sortent du fichier joint
      // (le chemin qui n'existait pas). Le fichier part en contexte multimodal.
      if (intent === "module") {
        setMessages((prev) => [...prev, { role: "user", content: `${trimmed}\n\n📎 ${fileNames}` }]);
        setInput("");
        setAttached([]);
        setUpsell(null);
        setKind("module");
        kindRef.current = "module";
        await executeGeneration(trimmed, { files, appFromFiles: true });
        return;
      }

      // ANALYSE (défaut) : 1 fichier → /api/analyze, ≥2 → /api/automate.
      // Si un contrôle a été demandé AVANT de joindre les fichiers, on reprend
      // cette instruction mémorisée (promesse « décrivez le contrôle »).
      const instruction = trimmed || pendingActionRef.current;
      pendingActionRef.current = "";
      await handleFiles(instruction);
      return;
    }

    // Fichiers joints (app ouverte gérée plus haut) → analyse / automatisation.
    if (attached.length > 0) {
      const instruction = trimmed || pendingActionRef.current;
      pendingActionRef.current = "";
      await handleFiles(instruction);
      return;
    }

    if (!trimmed) return;

    // ── Envoi groupé en attente de validation : le message précédent était un
    // APERÇU (kind=task). Une affirmation (« oui, envoie ») lance l'envoi réel ;
    // toute autre réponse annule l'aperçu et repart sur une demande neuve.
    if (pendingTaskRef.current) {
      const pending = pendingTaskRef.current;
      const startsAffirm =
        /^\s*(oui|ouais|ok|okay|d'accord|daccord|c'est bon|cest bon|c bon|parfait|vas[- ]?y|envoie|envoies|envoyer|go|valide|valider|confirme|confirmer)\b/i.test(
          trimmed
        );
      // Garde-fou : « oui MAIS change le sujet » ne doit PAS envoyer. Une réserve
      // explicite annule l'affirmation → on repart sur une demande neuve.
      const hasReservation = /(mais|plutot|plutôt|change|modifie|corrige|non|annule|attends|au lieu)/i.test(trimmed);
      if (startsAffirm && !hasReservation) {
        pendingTaskRef.current = null;
        setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
        setInput("");
        await executePendingTask(pending);
        return;
      }
      // Pas une validation → on abandonne l'aperçu et on traite la demande normalement.
      pendingTaskRef.current = null;
    }

    // Le serveur aiguille (question, document, app…) et c'est lui qui décide du
    // tarif. Côté client on ne bloque donc qu'en dessous du MINIMUM possible — le
    // prix d'une question — sans quoi on refuserait des demandes payables.
    const isModification = generatedHTML.length > 0;

    if (!founderAccount && credits !== null && credits < ACTION_CREDITS.question) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("⚠️ Crédits insuffisants. Rechargez votre compte pour continuer.", "⚠️ Not enough credits. Top up your account to continue.") },
      ]);
      setUpsell({}); // le coût exact dépend de l'aiguillage serveur, pas encore connu
      return;
    }

    setClarify(null); // un nouveau message remplace un éventuel questionnaire ouvert
    setUpsell(null);
    setCostAsk(null); // ... et une confirmation de coût restée ouverte
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    // Questions préalables (façon Lovable) avant de CRÉER une application —
    // jamais pour une modification, une question, un document ou des fichiers.
    // RÈGLE ABSOLUE : le questionnaire s'affiche TOUJOURS avant une création
    // d'app. Si l'API ne répond pas, on bascule sur les questions statiques
    // locales — on ne construit JAMAIS sans être passé par les questions.
    if (!isModification && classifyKindHeuristic(trimmed).kind === "module") {
      setLoadingLabel(t("J'analyse votre besoin…", "Analyzing your need…"));
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
        setClarify({ questions: buildStaticClarifyQuestions(locale), prompt: trimmed });
        return;
      } finally {
        setLoadingLabel(null);
        setIsGenerating(false);
      }
    }

    await executeGeneration(trimmed);
  };

  // `structured` permet de lire la réponse device pour forcer le format.
  const onClarifyDone = (answersText: string | null, structured?: Record<string, string[]>) => {
    const base = clarify?.prompt ?? "";
    const clarifyKind = clarify?.kind ?? "module";
    // Document joint à remplir : on garde le fichier pour le 2e passage (sinon la
    // génération perd le document une fois les infos manquantes fournies).
    const clarifyFiles = clarify?.files;
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

    // Portée des données choisie au questionnaire (question `donnees` + picker
    // workspace). Décide comment l'app se branche aux données : tout le workspace,
    // une sélection d'éléments précis, un import de fichier, ou zéro (exemples).
    let dataScope: DataScope | undefined;
    if (!isDoc) {
      const donnees = structured?.donnees?.[0];
      if (donnees === "workspace") {
        const scope = structured?.workspace_scope ?? [];
        if (scope.includes("__all__")) {
          dataScope = { source: "workspace", mode: "all" };
        } else {
          const records = scope
            .filter((t) => t.includes(":"))
            .map((t) => {
              const i = t.indexOf(":");
              return { entity: t.slice(0, i), id: t.slice(i + 1) };
            });
          dataScope = records.length
            ? { source: "workspace", mode: "select", records }
            : { source: "workspace", mode: "all" };
        }
      } else if (donnees === "import") {
        dataScope = { source: "import" };
      } else if (donnees === "zero") {
        dataScope = { source: "zero" };
      }
    }

    // Le questionnaire de CRÉATION affiche le prix sur son bouton (ClarifyWidget) :
    // le valider, c'est donc avoir vu le tarif et dit oui. On franchit la porte de
    // coût. Un document (30 cr) n'en a pas : il n'est pas concerné.
    const genOpts: GenOpts = isDoc
      ? { contextProvided: true, files: clarifyFiles, docFill: !!clarifyFiles?.length }
      : { formatOverride, dataScope, costAck: true };
    const header = isDoc
      ? "# CONTEXTE FOURNI PAR L'UTILISATEUR (à utiliser tel quel, ne rien inventer)"
      : "# PRÉCISIONS DE L'UTILISATEUR (questionnaire avant création)";

    if (answersText) {
      setMessages((prev) => [...prev, { role: "user", content: t(`📋 Mes réponses :\n${answersText}`, `📋 My answers:\n${answersText}`) }]);
      void executeGeneration(`${base}\n\n${header}\n${answersText}`, genOpts);
    } else {
      void executeGeneration(base, genOpts);
    }
  };

  // Lance réellement la génération (le message utilisateur est déjà affiché).
  // ── Connexions inline « étape par étape » ─────────────────────────────────
  // Démarre le flux à partir d'une réponse serveur portant `connectors`. Retourne
  // true si un flux a été lancé (le message factuel est déjà affiché à part).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startConnectFlowFromData = (data: any, resumePrompt: string): boolean => {
    const raw: unknown[] = Array.isArray(data?.connectors) ? data.connectors : [];
    const connectors = [...new Set(raw.filter((c): c is string => typeof c === "string" && c.length > 0))];
    if (connectors.length === 0) return false;
    const pendingRuleId = typeof data?.pendingRuleId === "string" ? data.pendingRuleId : undefined;
    setConnectFlow({ connectors, resumePrompt, pendingRuleId });
    return true;
  };

  // Une connexion réussie → on enchaîne SANS attendre les autres cartes (ce sont des
  // alternatives). Deux suites possibles :
  //   • un agent attend déjà en base (pendingRuleId) → on l'ACTIVE par son id. Le
  //     serveur refait le preflight : s'il manque encore quelque chose, il le dit et
  //     les cartes restent. Rejouer la demande créerait un doublon.
  //   • sinon (email / agenda / tâche) → on rejoue la demande d'origine.
  const handleConnectorConnected = () => {
    const cf = connectFlowRef.current;
    if (!cf) return;
    setConnectFlow(null);

    if (cf.pendingRuleId) {
      void (async () => {
        try {
          const res = await fetch("/api/agents/activate-pending", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ruleId: cf.pendingRuleId }),
          });
          const data = await res.json();
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                typeof data?.message === "string" && data.message
                  ? data.message
                  : t("Connecté ✅. L'agent est activé.", "Connected ✅. The agent is active."),
            },
          ]);
          // Il manque encore une connexion (mauvais fournisseur branché, pop-up
          // fermée trop tôt) : on redonne les cartes plutôt que de laisser croire
          // que c'est réglé.
          if (data?.activated === false) startConnectFlowFromData({ ...data, pendingRuleId: cf.pendingRuleId }, cf.resumePrompt);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: t(
                "Connecté ✅, mais je n'ai pas réussi à activer l'agent à l'instant. Ouvrez **Agents** pour le lancer.",
                "Connected ✅, but I couldn't activate the agent just now. Open **Agents** to start it."
              ),
            },
          ]);
        }
      })();
      return;
    }

    setMessages((prev) => [...prev, { role: "assistant", content: t("Parfait, c'est connecté ✅. Je continue.", "Perfect, it's connected ✅. Continuing.") }]);
    void executeGeneration(cf.resumePrompt);
  };

  // Refus d'une connexion → on arrête là, sans reprise ni fausse promesse.
  const handleConnectorRefused = () => {
    setConnectFlow(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: t("Pas de souci — dis-moi si tu changes d'avis, ou demande-moi autre chose.", "No worries — tell me if you change your mind, or ask me something else.") },
    ]);
  };

  const executeGeneration = async (apiPrompt: string, opts?: GenOpts) => {
    // MÉMORISE LA TENTATIVE. C'est ce qui rend « Réessayer » honnête : on rejoue la
    // demande TELLE QU'ELLE ÉTAIT (fichiers joints, portée des données, format),
    // pas une paraphrase. Les corrections automatiques ne s'auto-mémorisent pas.
    if (!opts?.isCorrection) lastAttemptRef.current = { prompt: apiPrompt, opts };

    const isModification = generatedHTML.length > 0;
    const creditCost = isModification ? ACTION_CREDITS.modification_app : ACTION_CREDITS.application;
    // Nouvelle demande utilisateur → budget de correction workspace remis à neuf.
    if (!opts?.isCorrection) wsCorrectionRef.current = false;
    // Toute nouvelle demande supersède un flux de connexion resté ouvert.
    setConnectFlow(null);
    // Une génération d'app/document reprend la main sur un panneau d'annotation.
    if (!isModification) setAnnotationDoc(null);
    setExpectingBuild(!looksLikePureQuestion(apiPrompt));
    setIsGenerating(true);
    const effectiveFormat = opts?.formatOverride ?? format;
    // Mémorise le choix de portée pour le poser sur le module à sa 1re sauvegarde
    // (uniquement en CRÉATION ; une modification garde la portée d'origine).
    if (!isModification) dataScopeRef.current = opts?.dataScope ?? null;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: apiPrompt,
          previousHTML: isModification ? generatedHTML : undefined,
          format: effectiveFormat,
          // En itération, on conserve le format d'origine (pas de reclassement).
          // Remplissage de document → kind=document ; app tirée d'un fichier →
          // kind=module (sinon le serveur reclasse et on repart en document/analyse).
          kind: isModification
            ? kind ?? undefined
            : opts?.docFill
              ? "document"
              : opts?.appFromFiles
                ? "module"
                : undefined,
          docType: isModification ? docType ?? undefined : undefined,
          contextProvided: opts?.contextProvided,
          // L'utilisateur a VU le prix de la création et a dit oui. Sans ce OUI, le
          // serveur renvoie le tarif au lieu de construire (porte de coût).
          costAck: opts?.costAck,
          // Captures / documents joints comme contexte de la demande.
          files: opts?.files,
          // Portée des données (workspace tout/sélection, import, zéro).
          dataScope: opts?.dataScope,
          // ── LE FIL DE LA CONVERSATION ────────────────────────────────────
          // Le dernier message du fil EST la demande courante (elle est déjà
          // peinte dans le chat avant l'appel) : on la retire, le serveur la
          // rajoute lui-même. Sans ce filtre, elle partait en double.
          history: (() => {
            const fil = messagesRef.current.filter((m) => m.content.trim().length > 0);
            const sansCourant =
              fil.length > 0 && fil[fil.length - 1].role === "user" ? fil.slice(0, -1) : fil;
            return sansCourant.slice(-12).map((m) => ({ role: m.role, content: m.content }));
          })(),
        }),
      });

      // ── Flux SSE : soit une RÉPONSE copilote (texte token par token), soit une
      // GÉNÉRATION streamée (le HTML arrive au fur et à mesure → l'aperçu se
      // construit EN DIRECT, fini l'attente aveugle). On distingue par le type
      // d'événement : delta = réponse ; html/done = génération.
      const ctype = res.headers.get("content-type") ?? "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = null;
      if (res.ok && ctype.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let answer = "";
        let started = false; // stream « réponse » commencé
        let buildHtml = ""; // accumulateur du HTML généré
        let isBuild = false; // ce flux est une génération
        let sawError = false; // un événement { type:"error" } a déjà été affiché
        let lastPaint = 0;
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let evt: any;
            try {
              evt = JSON.parse(line.slice(5));
            } catch {
              continue;
            }
            if (evt.type === "delta" && typeof evt.text === "string") {
              // Copilote : réponse texte, token par token.
              setExpectingBuild(false);
              answer += evt.text;
              if (!started) {
                started = true;
                setMessages((prev) => [...prev, { role: "assistant", content: evt.text ?? "" }]);
              } else {
                paint(answer);
              }
            } else if (evt.type === "html" && typeof evt.text === "string") {
              // Génération : construction de l'aperçu EN DIRECT. Uniquement pour une
              // NOUVELLE création — pour une modification, on garde l'app existante
              // affichée jusqu'au résultat final (jamais de preview cassée).
              isBuild = true;
              buildHtml += evt.text;
              if (!isModification) {
                const now = Date.now();
                if (now - lastPaint > 250) {
                  lastPaint = now;
                  // ⚠️ On ne peint QU'À PARTIR du document. Le modèle préfixe parfois
                  // sa sortie (« Voici le code HTML complet de l'application… ») : ce
                  // texte se retrouvait AFFICHÉ EN HAUT DE L'APP pendant les 3 minutes
                  // de construction. L'artisan ne doit jamais voir un mot de jargon.
                  // Tant que le document n'a pas commencé, on ne peint rien.
                  const debut = buildHtml.search(/<!doctype\s+html|<html[\s>]/i);
                  setGeneratedHTML(debut >= 0 ? buildHtml.slice(debut) : "");
                }
              }
            } else if (evt.type === "done") {
              if (isBuild || typeof evt.html === "string") {
                data = evt; // → finalisation ci-dessous (sauvegarde, crédits, message)
              } else {
                updateCreditsDisplay(evt.creditsUsed ?? 10); // réponse copilote terminée
              }
            } else if (evt.type === "error" && typeof evt.error === "string") {
              sawError = true;
              if (isBuild) {
                if (!isModification) setGeneratedHTML("");
                // `retryable` → bouton « Réessayer » sous la bulle, qui rejoue la
                // demande d'origine avec tout son contexte.
                setMessages((prev) => [...prev, { role: "assistant", content: evt.error, retryable: true }]);
              } else if (started) {
                paint(evt.error);
              } else {
                setMessages((prev) => [...prev, { role: "assistant", content: evt.error, retryable: true }]);
              }
            }
          }
        }
        // Réponse copilote / erreur → terminé ici. Génération réussie → on retombe
        // dans la finalisation ci-dessous avec `data` (le payload de l'événement done).
        if (!data) {
          // FLUX MORT SANS `done`. Sur une génération, cela signifie que la
          // fonction serveur a été TUÉE en plein vol (timeout plateforme,
          // redéploiement) : le `catch` serveur qui rembourse ne s'exécute pas.
          // Le code faisait ici un `return` MUET : l'artisan restait avec un
          // aperçu à moitié construit, aucun message, et ses crédits partis. Il
          // ne pouvait même pas savoir qu'il devait réessayer.
          if (isBuild && !sawError) {
            if (!isModification) setGeneratedHTML("");
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: t(
                  "La génération a été interrompue avant la fin : elle a dépassé le temps imparti. Rien n'a été enregistré. Réessayez avec une application plus simple, ou construisez-la en deux fois (une première version, puis vous l'enrichissez).",
                  "The build was cut short: it exceeded the time limit. Nothing was saved. Try again with a simpler app, or build it in two passes (a first version, then enrich it)."
                ),
                retryable: true,
              },
            ]);
          }
          return;
        }
      }

      if (!data) {
        data = await res.json();
      }

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
        setClarify({ questions: data.questions, prompt: apiPrompt, kind: "document", files: opts?.files });
        return;
      }

      // PORTE DE COÛT : le serveur a compris qu'il fallait CRÉER une application,
      // et il refuse de la construire tant qu'on n'a pas dit le prix. C'est le cas
      // où l'heuristique du navigateur n'avait PAS vu l'app (donc pas de
      // questionnaire) : sans cette porte, 300 crédits partaient en silence sur une
      // phrase que l'utilisateur ne pensait pas coûteuse. Rien n'est débité ici.
      if (data.needsCostAck && typeof data.credits === "number") {
        setCostAsk({ credits: data.credits, prompt: apiPrompt, opts });
        return;
      }

      // Contrôle par lot reconnu, mais aucun fichier joint : on mémorise
      // l'instruction (gratuit) et on invite à glisser les fichiers.
      // Agent recruté (mission permanente) : le serveur a créé la règle et
      // renvoie le message du chat (« jamais muet »), y compris si l'agent est
      // né « bloqué » (info manquante réclamée). Rien à générer.
      if (data.kind === "rule" && typeof data.message === "string" && data.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
        // Agent bloqué faute de connexion → cartes inline ; une fois connecté, on
        // rejoue la demande et l'agent est créé (une seule fois : il n'existe pas encore).
        startConnectFlowFromData(data, apiPrompt);
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

      // Envoi groupé (« task ») : soit un APERÇU à valider, soit un message
      // factuel (0 client, pas connecté, email manquant…). Sur l'aperçu, on
      // mémorise la charge : l'utilisateur confirmera par « oui, envoie ».
      if (data.kind === "task" && typeof data.message === "string" && data.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
        if (data.status === "preview" && data.task && typeof data.task.audience === "string") {
          pendingTaskRef.current = {
            audience: data.task.audience,
            subject: typeof data.task.subject === "string" ? data.task.subject : "",
            body: typeof data.task.body === "string" ? data.task.body : "",
          };
        }
        // Pas de canal d'envoi → carte Gmail inline, puis reprise (aperçu du groupe).
        startConnectFlowFromData(data, apiPrompt);
        return;
      }

      // Email / Agenda : l'agent a agi via l'outil connecté (Gmail / Google
      // Agenda), ou explique qu'il n'est pas connecté. Message factuel.
      if ((data.kind === "email" || data.kind === "calendar") && typeof data.message === "string" && data.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
        // Gmail/Agenda pas connecté → cartes inline, puis reprise (envoi / lecture).
        startConnectFlowFromData(data, apiPrompt);
        return;
      }

      // RENDU CLIENT : l'image arrive, on l'affiche DANS le fil. C'est une
      // illustration commerciale — l'artisan la montre à son client, il ne
      // construit pas dessus. Le message qui l'accompagne le dit explicitement.
      if (data.kind === "image" && typeof data.imageUrl === "string" && data.imageUrl) {
        updateCreditsDisplay(data.creditsUsed ?? 0);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.answer ?? "", imageUrl: data.imageUrl },
        ]);
        return;
      }

      // Réponse texte non streamée (ex. lecture seule : le serveur refuse la
      // création et explique). Rendu propre, sans traiter ça comme une erreur.
      if (data.kind === "answer" && typeof data.answer === "string" && data.answer) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
        return;
      }

      if (res.ok && data.kind === "action" && data.needsFiles) {
        pendingActionRef.current = apiPrompt;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              t("⚡ C'est un contrôle par lot. Glissez vos fichiers dans la barre ci-dessous (PDF, photos de bons de livraison, factures…) ou cliquez sur le trombone, puis envoyez : je vérifie tout d'un coup et je signale les écarts — prix incohérents, références inconnues, doublons.", "⚡ This is a batch check. Drop your files into the bar below (PDF, photos of delivery notes, invoices…) or click the paperclip, then send: I check everything at once and flag discrepancies — inconsistent prices, unknown references, duplicates."),
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
        // Livrable long prêt (app / document / action) → sonnerie de fin. Le
        // chat/réponse rapide ne passe jamais par ici : pas de bip pour une question.
        playCompletionChime();
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

        // AppSpec V1 déclarée par le modèle (création) → mémorisée pour la sauvegarde.
        appSpecRef.current = data.appSpec ?? null;

        // Sauvegarde automatique : généré = enregistré, immédiatement.
        const autoSaved = await autoSaveGenerated({
          html: finalHtml,
          name: data.name,
          kindValue: newKind,
          tid: (typeof data.tenantId === "string" && data.tenantId) || tenantId,
          description: apiPrompt.slice(0, 300),
          fmt: effectiveFormat,
        });

        const saveNote =
          autoSaved === true
            ? newKind === "document"
              ? t(" Enregistré dans votre bibliothèque.", " Saved to your library.")
              : t(" Enregistrée dans vos ateliers.", " Saved to your workspaces.")
            : "";
        let content: string;
        if (isModification) {
          content =
            newKind === "document"
              ? t(`✓ Document mis à jour.${saveNote} Consultez-le à droite, puis **Imprimer / Enregistrer en PDF**.`, `✓ Document updated.${saveNote} View it on the right, then **Print / Save as PDF**.`)
              : t(`✓ Modification appliquée et sauvegardée.${data.specDiff ? ` ✏️ *${data.specDiff}.*` : ""} Consultez la prévisualisation à droite. Vous pouvez continuer à itérer.`, `✓ Change applied and saved.${data.specDiff ? ` ✏️ *${data.specDiff}.*` : ""} Check the preview on the right. You can keep iterating.`);
        } else if (newKind === "document") {
          content = t(`✓ **${data.name}** prêt.${saveNote} Ouvrez-le à droite : bouton **Imprimer / Enregistrer en PDF**, et signez du bout du doigt dans les cadres prévus. Dites-moi quoi ajuster.`, `✓ **${data.name}** ready.${saveNote} Open it on the right: **Print / Save as PDF** button, and sign with your fingertip in the boxes provided. Tell me what to adjust.`);
        } else if (data.actionFallback) {
          content = t(`✓ **${data.name}** générée.${saveNote} ⚡ Demande de *traitement par lot* reconnue : pour contrôler des fichiers, glissez-les directement dans la barre. En attendant, voici un module opérationnel.`, `✓ **${data.name}** generated.${saveNote} ⚡ *Batch processing* request recognized: to check files, drop them straight into the bar. In the meantime, here's a working module.`);
        } else {
          content = t(`✓ Application **${data.name}** générée.${saveNote} Elle est entièrement fonctionnelle : ajoutez, modifiez, supprimez des données — tout est sauvegardé. Dites-moi ce que vous voulez ajuster.`, `✓ App **${data.name}** generated.${saveNote} It's fully functional: add, edit, delete data — everything is saved. Tell me what you'd like to adjust.`);
        }
        setMessages((prev) => [...prev, { role: "assistant", content }]);
        // Le serveur signale `truncated` quand le modèle a atteint sa limite de
        // sortie et que le HTML a été recollé de force (</body></html> ajoutés).
        // Ce drapeau n'était LU NULLE PART : une app amputée était enregistrée et
        // facturée en annonçant « entièrement fonctionnelle ». On le dit.
        if (data.truncated) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: t(
                "⚠️ Cette application est **incomplète** : elle était trop longue à écrire d'un seul tenant et a été coupée. Ce que vous voyez fonctionne, mais il manque probablement la fin. Demandez-moi d'ajouter ce qui manque, ou repartez d'une version plus simple.",
                "⚠️ This app is **incomplete**: it was too long to write in one go and got cut off. What you see works, but the end is likely missing. Ask me to add what's missing, or start from a simpler version."
              ),
            },
          ]);
        }
        if (autoSaved === "declined") {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                t("⚠️ Modification **non enregistrée** : elle supprimait des éléments importants de l'application (une vue, un formulaire ou la connexion aux données). L'aperçu la montre quand même. Cliquez **Sauvegarder** pour la forcer, ou reformulez votre demande.", "⚠️ Change **not saved**: it removed important parts of the app (a view, a form, or the data connection). The preview still shows it. Click **Save** to force it, or rephrase your request."),
            },
          ]);
        } else if (autoSaved === false) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                t("⚠️ Sauvegarde automatique impossible (droits d'équipe ou espace de travail introuvable). Utilisez le bouton **Sauvegarder** en haut à droite.", "⚠️ Auto-save failed (team permissions or workspace not found). Use the **Save** button at the top right."),
            },
          ]);
        }

        // ── VALIDATION POST-GÉNÉRATION (Phase 2) ── une erreur CRITIQUE de
        // branchement workspace déclenche UNE passe corrective automatique
        // (bornée par wsCorrectionRef → jamais de boucle). Les warnings, eux,
        // ne dérangent pas l'utilisateur (télémétrie serveur uniquement).
        if (
          newKind === "module" &&
          !opts?.isCorrection &&
          !wsCorrectionRef.current &&
          data.validation?.critical &&
          typeof data.validation.correctionPrompt === "string"
        ) {
          wsCorrectionRef.current = true;
          const correctionPrompt = data.validation.correctionPrompt as string;
          trackUsage("generation_auto_fixed", { coverage: data.validation.coverageScore });
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: t("🔧 Le branchement aux données du workspace était incomplet — je corrige automatiquement…", "🔧 The connection to workspace data was incomplete — fixing it automatically…"),
            },
          ]);
          // Laisser l'état se stabiliser (generatedHTML posé) avant de ré-entrer.
          setTimeout(() => {
            void executeGeneration(correctionPrompt, { isCorrection: true });
          }, 500);
        }

        // ── SUGGESTIONS D'AUTOMATISATION (mission 12.4) ── à la création d'une app,
        // si le contrat déclare des automatisations utiles, on les PROPOSE (l'utilisateur
        // valide en langage naturel → flux agent existant). On n'active jamais tout seul.
        if (
          newKind === "module" &&
          !isModification &&
          !opts?.isCorrection &&
          data.appSpec &&
          Array.isArray(data.appSpec.suggestedAutomations) &&
          data.appSpec.suggestedAutomations.length
        ) {
          const sugg = data.appSpec.suggestedAutomations
            .slice(0, 3)
            .filter((s: { title?: string }) => s && typeof s.title === "string" && s.title.trim());
          if (sugg.length) {
            trackUsage("automation_suggested", { count: sugg.length });
            const list = sugg
              .map((s: { title: string; purpose?: string }) => `- **${s.title}**${s.purpose ? ` — ${s.purpose}` : ""}`)
              .join("\n");
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: t(`💡 **Automatisations possibles** pour cette app :\n${list}\n\nDites-moi « active [le titre] » et je recrute l'agent qui s'en occupe (rien n'est activé sans votre accord).`, `💡 **Possible automations** for this app:\n${list}\n\nTell me “activate [the title]” and I'll hire the agent that handles it (nothing is activated without your consent).`),
              },
            ]);
          }
        }
      } else {
        throw new Error(data.error ?? t("Erreur inconnue", "Unknown error"));
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ ${err instanceof Error ? err.message : t("Erreur lors de la génération. Réessayez.", "Error during generation. Try again.")}`,
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
  // ── CHEMIN D'ÉCRITURE AUTORITAIRE (Phase 0) ──────────────────────────────────
  // Toute persistance d'app passe désormais par /api/modules/save : le serveur
  // versionne (module_versions), incrémente modules.version et applique le
  // garde-fou anti-réécriture destructive. On ne touche PLUS `modules` en direct
  // (sauf data_scope, métadonnée non versionnée).
  type SaveOk = { ok: true; moduleId: string; version: number; slug?: string; createdAt?: string };
  type SaveErr = { ok: false; needsConfirmation?: boolean; losses?: string[]; error?: string };
  const saveModuleApi = async (a: {
    moduleId: string | null;
    name?: string;
    html: string;
    description?: string;
    fmt?: Format;
    kindValue?: Kind | null;
    sourcePrompt?: string;
    changeType?: "create" | "full_rewrite" | "manual_edit" | "autofix" | "patch";
    confirmDestructive?: boolean;
    appSpec?: unknown;
  }): Promise<SaveOk | SaveErr> => {
    try {
      const res = await fetch("/api/modules/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId: a.moduleId ?? undefined,
          name: a.name,
          html: a.html,
          description: a.description,
          format: a.fmt,
          kind: a.kindValue === "document" ? "document" : a.kindValue ? "app" : undefined,
          sourcePrompt: a.sourcePrompt,
          changeType: a.changeType,
          confirmDestructive: a.confirmDestructive,
          appSpec: a.appSpec,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409 && data?.needsConfirmation) {
        return { ok: false, needsConfirmation: true, losses: data.losses ?? [] };
      }
      if (!res.ok || !data?.ok) return { ok: false, error: data?.error ?? t(`Erreur ${res.status}`, `Error ${res.status}`) };
      return { ok: true, moduleId: data.moduleId, version: data.version, slug: data.slug, createdAt: data.createdAt };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : t("Réseau indisponible", "Network unavailable") };
    }
  };

  // Garde-fou 4.4 : si le serveur bloque une modification destructive, on demande
  // une confirmation EXPLICITE puis on ré-applique avec le drapeau de forçage.
  const saveWithGuardrail = async (
    a: Parameters<typeof saveModuleApi>[0]
  ): Promise<SaveOk | SaveErr> => {
    let r = await saveModuleApi(a);
    if (!r.ok && r.needsConfirmation) {
      const list = (r.losses ?? []).map((l) => `• ${l}`).join("\n");
      const forced =
        typeof window !== "undefined" &&
        window.confirm(
          t(`⚠️ Cette mise à jour supprimerait :\n\n${list}\n\nElle n'a pas été appliquée. L'appliquer quand même ?`, `⚠️ This update would remove:\n\n${list}\n\nIt was not applied. Apply it anyway?`)
        );
      if (!forced) return r; // refus → l'app n'est PAS écrasée
      r = await saveModuleApi({ ...a, confirmDestructive: true });
    }
    return r;
  };

  // Applique la portée des données (métadonnée) après création — non versionné.
  const applyDataScope = async (moduleId: string, createdAt?: string) => {
    const stored = computeStoredScope(dataScopeRef.current, String(createdAt ?? ""));
    if (!stored) return;
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("modules") as any).update({ data_scope: stored }).eq("id", moduleId);
    } catch {
      /* best-effort */
    }
  };

  // Télémétrie d'usage (Phase 10) : événements côté atelier (best-effort, jamais bloquant).
  const trackUsage = (type: string, meta?: Record<string, unknown>) => {
    try {
      void fetch("/api/app-telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [{ type, meta: meta ?? {} }], moduleId: savedIdRef.current }),
      });
    } catch {
      /* best-effort */
    }
  };

  const autoSaveGenerated = async (args: {
    html: string;
    name: string;
    kindValue: Kind;
    tid: string | null;
    description: string;
    fmt: Format;
  }): Promise<boolean | "declined"> => {
    if (!savedIdRef.current && !args.tid) return false;
    const isNew = !savedIdRef.current;
    const r = await saveWithGuardrail({
      moduleId: savedIdRef.current,
      name: args.name,
      html: args.html,
      description: args.description,
      fmt: args.fmt,
      kindValue: args.kindValue,
      sourcePrompt: args.description,
      changeType: isNew ? "create" : "full_rewrite",
      appSpec: appSpecRef.current,
    });
    if (!r.ok) return r.needsConfirmation ? "declined" : false;
    if (isNew) {
      savedIdRef.current = r.moduleId;
      setSavedId(r.moduleId);
      if (r.slug) setSlug(r.slug);
      await applyDataScope(r.moduleId, r.createdAt);
    }
    return true;
  };

  // ── HISTORIQUE & ROLLBACK (Phase 7) ── consomme /api/modules/versions + restore.
  const openHistory = async () => {
    if (!savedId) return;
    setShareOpen(false);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/modules/versions?moduleId=${savedId}`);
      const data = await res.json().catch(() => null);
      setVersions(Array.isArray(data?.versions) ? data.versions : []);
    } catch {
      setVersions([]);
    }
    setHistoryLoading(false);
  };

  const restoreVersion = async (versionId: string) => {
    if (!savedId || restoringId) return;
    setRestoringId(versionId);
    try {
      const res = await fetch("/api/modules/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId: savedId, versionId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && typeof data.html === "string") {
        setGeneratedHTML(injectErrorCapture(data.html));
        setHistoryOpen(false);
        setMessages((prev) => [...prev, { role: "assistant", content: t("↩ Version restaurée. L'aperçu a été mis à jour.", "↩ Version restored. The preview has been updated.") }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: t(`❌ Restauration impossible${data?.error ? ` : ${data.error}` : ""}.`, `❌ Restore failed${data?.error ? `: ${data.error}` : ""}.`) }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("❌ Restauration impossible (réseau).", "❌ Restore failed (network).") }]);
    }
    setRestoringId(null);
  };

  const handleSave = async () => {
    if (!generatedHTML || isSaving) return;
    setIsSaving(true);

    const description = messages.find((m) => m.role === "user")?.content ?? "";

    // Toute erreur (RLS : rôle Employé/Lecture seule sans droit de création,
    // réseau…) est REMONTÉE à l'utilisateur — jamais de faux « Sauvegardé ».
    const saveFailed = (detail?: string | null) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t(`❌ Sauvegarde impossible${detail ? ` : ${detail}` : ""}. Si vous êtes membre d'une équipe, seuls les rôles Manager, Admin et Propriétaire peuvent enregistrer des applications.`, `❌ Save failed${detail ? `: ${detail}` : ""}. If you're on a team, only Manager, Admin and Owner roles can save apps.`),
        },
      ]);
    };

    if (!savedId && !tenantId) {
      saveFailed(t("aucun espace de travail trouvé", "no workspace found"));
      setIsSaving(false);
      return;
    }

    const r = await saveWithGuardrail({
      moduleId: savedId,
      name: appName,
      html: generatedHTML,
      description,
      fmt: format,
      kindValue: kind,
      sourcePrompt: description,
      changeType: savedId ? "manual_edit" : "create",
      appSpec: appSpecRef.current,
    });

    if (r.ok) {
      if (!savedId) {
        setSavedId(r.moduleId);
        savedIdRef.current = r.moduleId;
        if (r.slug) setSlug(r.slug);
        await applyDataScope(r.moduleId, r.createdAt);
      }
    } else if (!r.needsConfirmation) {
      // needsConfirmation refusé par l'utilisateur = choix volontaire, pas une erreur.
      saveFailed(r.error);
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
        alert(data.error ?? t("Erreur de déploiement.", "Deployment error."));
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
            ? t(`✓ **${appName}** est en ligne. Toute personne disposant du lien peut l'utiliser : ${publicUrl}`, `✓ **${appName}** is online. Anyone with the link can use it: ${publicUrl}`)
            : t(`✓ **${appName}** est repassée en privé. Le lien public est désactivé.`, `✓ **${appName}** is private again. The public link is disabled.`),
        },
      ]);
    }
    setIsPublishing(false);
  };

  // App connectée au workspace (SDK window.biltia) : le lien public montre
  // l'interface, mais les DONNÉES ne sont visibles que par l'équipe connectée.
  const isConnectedApp = generatedHTML.includes("window.biltia");

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
        { role: 'assistant', content: t('👆 Cliquez sur un élément de l\'application pour le modifier.', '👆 Click an element of the app to edit it.') },
      ]);
    }
  };

  const reset = () => {
    conversationIdRef.current = null; // « Recommencer » = nouvelle conversation
    setClarify(null);
    setUpsell(null);
    setMessages([]);
    setGeneratedHTML("");
    setAppName(locale === "en" ? "My app" : "Mon application");
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
    Boolean(generatedHTML) || Boolean(analysis) || Boolean(report) || Boolean(annotationDoc) || (isGenerating && expectingBuild);

  return (
    <div
      ref={rootRef}
      data-no-swipe-back
      className="flex flex-col md:flex-row h-full bg-[#FCFCFD]"
      onTouchStart={(e) => { swipeStartX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        if (swipeStartX.current == null || !showStudio || previewHidden) { swipeStartX.current = null; return; }
        const dx = (e.changedTouches[0]?.clientX ?? 0) - swipeStartX.current;
        if (Math.abs(dx) > 60) setMobileView(dx > 0 ? "chat" : "app");
        swipeStartX.current = null;
      }}
    >
      {/* ── Panneau conversation (plein écran en mode chat) ── */}
      <div
        className={`flex-col flex-shrink-0 pt-safe md:pt-0 ${resizing ? "" : "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"} ${
          !showStudio || previewHidden
            ? "flex w-full h-full bg-[#FCFCFD]"
            : sidebarOpen
              ? `bg-white md:flex md:w-[420px] md:min-w-[380px] md:h-full ${mobileView === "chat" ? "flex w-full h-full" : "hidden"}`
              : "bg-white w-0 md:w-0 overflow-hidden h-0 md:h-full md:flex"
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
            <h1 className="font-bold tracking-[-0.01em] text-[#0A0A0A] text-[15px] truncate min-w-0">{showStudio ? (appName || t("Atelier", "Studio")) : t("Assistant", "Assistant")}</h1>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Mobile : flèche → application (pas de texte, pas de crédits). */}
            {showStudio && !previewHidden && (
              <button
                onClick={() => setMobileView("app")}
                className="md:hidden grid h-9 w-9 place-items-center rounded-full bg-[#0A0A0A] text-white active:scale-95 transition-transform"
                title={t("Voir l'application", "View the app")}
              >
                <ArrowRight className="w-[18px] h-[18px]" />
              </button>
            )}
            {showStudio && previewHidden && (
              <button
                onClick={() => setPreviewHidden(false)}
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#0A0A0A] text-white transition-all"
                title={t("Réafficher l'application", "Show the app again")}
              >
                <LayoutTemplate className="w-3.5 h-3.5" /> {t("Aperçu", "Preview")}
              </button>
            )}
            {showStudio && !previewHidden && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="hidden md:flex p-1.5 text-[#6E6E6C] hover:text-[#0A0A0A] rounded-lg hover:bg-[#F6F6F9] transition-colors"
                title={t("Réduire le panneau", "Collapse panel")}
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
                {t("Quel problème réglons-nous ?", "What problem are we solving?")}
              </h2>
              <p className={`text-[#6E6E6C] leading-relaxed ${!showStudio ? "text-[15px] max-w-[440px]" : "text-sm max-w-[280px]"}`}>
                {t("Posez une question, dictez un document, décrivez un outil ou glissez des fichiers à contrôler. Biltia choisit la bonne forme : réponse, PDF, application ou rapport.", "Ask a question, dictate a document, describe a tool, or drop in files to check. Biltia picks the right form: answer, PDF, app, or report.")}
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
              <div className="max-w-[85%] flex flex-col items-start gap-2">
                <div
                  className={`whitespace-pre-wrap px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#0A0A0A] text-white rounded-tr-sm"
                      : "bg-[#F6F6F9] text-[#0A0A0A] rounded-tl-sm border border-[#ECECF2]"
                  }`}
                >
                  {msg.content}
                </div>

                {/* RENDU CLIENT — l'image est le livrable, pas une décoration :
                    elle s'affiche en grand et se télécharge en un clic pour partir
                    avec le devis. Le libellé rappelle que c'est une ILLUSTRATION :
                    l'artisan la montre, il ne construit pas dessus. */}
                {msg.imageUrl && (
                  <figure className="w-full overflow-hidden rounded-2xl border border-[#ECECF2] bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={msg.imageUrl}
                      alt={t("Rendu du projet fini", "Render of the finished project")}
                      className="block w-full h-auto"
                    />
                    <figcaption className="flex items-center justify-between gap-3 px-3 py-2 border-t border-[#ECECF2]">
                      <span className="text-[11px] text-[#6E6E6C]">
                        {t("Illustration — non contractuelle", "Illustration — not contractual")}
                      </span>
                      <a
                        href={msg.imageUrl}
                        download="rendu-biltia.png"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#ECECF2] bg-white px-2.5 py-1 text-xs font-semibold text-[#0A0A0A] transition hover:bg-[#F6F6F9]"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t("Télécharger", "Download")}
                      </a>
                    </figcaption>
                  </figure>
                )}

                {/* RÉESSAYER — rejoue la demande d'ORIGINE (son prompt, ses fichiers,
                    sa portée de données), pas le mot « réessaye ». C'est toute la
                    différence : taper « réessaye » envoyait deux mots hors contexte,
                    et l'assistant répondait « Je t'écoute. De quoi as-tu besoin ? ».
                    Ne s'affiche que sur la DERNIÈRE bulle : un vieil échec plus haut
                    dans le fil n'a plus rien à rejouer. */}
                {msg.retryable && i === messages.length - 1 && lastAttemptRef.current && (
                  <button
                    type="button"
                    onClick={() => {
                      const a = lastAttemptRef.current;
                      if (!a || isGenerating) return;
                      // On retire la bulle d'échec : elle est remplacée par la
                      // nouvelle tentative, pas empilée avec elle.
                      setMessages((prev) => prev.slice(0, -1));
                      void executeGeneration(a.prompt, a.opts);
                    }}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#ECECF2] bg-white px-3 py-1.5 text-xs font-semibold text-[#0A0A0A] transition hover:bg-[#F6F6F9] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    {t("Réessayer", "Try again")}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Toutes les cartes d'un coup : ce sont des ALTERNATIVES (« Gmail OU
              Outlook »), pas une checklist. La première connexion réussie referme
              le flux et enchaîne (activation de l'agent en attente, ou reprise de
              la demande). */}
          {connectFlow && !isGenerating && (
            <div className="flex flex-col items-start gap-2 pl-8">
              {connectFlow.connectors.map((cid) => (
                <ConnectCard
                  key={cid}
                  connectorId={cid}
                  onConnected={handleConnectorConnected}
                  onRefused={handleConnectorRefused}
                />
              ))}
            </div>
          )}

          {clarify && !isGenerating && (
            <div className="flex justify-start">
              {/* Le prix n'est annoncé que pour une CRÉATION d'app. Le questionnaire
                  « document » (30 cr) sert à récupérer un contexte manquant, pas à
                  autoriser une dépense — l'y afficher serait du bruit. */}
              <ClarifyWidget
                questions={clarify.questions}
                onSubmit={onClarifyDone}
                costCredits={
                  (clarify.kind ?? "module") === "module" && !founderAccount
                    ? ACTION_CREDITS.application
                    : undefined
                }
              />
            </div>
          )}

          {/* PORTE DE COÛT — « rien de cher ne part sans un OUI ».
              Le serveur a compris qu'il fallait CRÉER une application (300 cr) sur une
              phrase où le navigateur n'avait rien vu venir : pas de questionnaire, donc
              aucune annonce. Sans cette carte, les crédits partaient en silence. Rien
              n'est débité tant qu'il n'a pas cliqué. */}
          {costAsk && !isGenerating && (
            <div className="flex justify-start">
              <div className="max-w-[560px] rounded-2xl border border-[#E6E1F0] bg-white p-4 shadow-[0_4px_14px_rgba(60,40,120,0.06)]">
                <p className="text-[14.5px] font-semibold text-[#0A0A0A]">
                  {t("Je vais vous créer une application sur mesure.", "I'll build you a custom app.")}
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-[#5B5B66]">
                  {t(
                    `Ça coûte ${costAsk.credits} crédits. Vous en avez ${credits ?? "—"}. Rien n'est débité tant que vous n'avez pas dit oui.`,
                    `It costs ${costAsk.credits} credits. You have ${credits ?? "—"}. Nothing is charged until you say yes.`
                  )}
                </p>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const ask = costAsk;
                      setCostAsk(null);
                      void executeGeneration(ask.prompt, { ...ask.opts, costAck: true });
                    }}
                    className="rounded-xl bg-[#0A0A0A] px-4 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    {t(`Créer · ${costAsk.credits} crédits`, `Create · ${costAsk.credits} credits`)}
                  </button>
                  <button
                    onClick={() => setCostAsk(null)}
                    className="rounded-xl border border-[#E6E1F0] px-4 py-2.5 text-[13.5px] font-semibold text-[#5B5B66] transition-colors hover:bg-[#F6F4FB]"
                  >
                    {t("Annuler", "Cancel")}
                  </button>
                </div>
              </div>
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
                    {loadingLabel ?? (expectingBuild ? t("Biltia construit votre solution…", "Biltia is building your solution…") : t("Biltia vous répond…", "Biltia is replying…"))}
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
                  <span className="text-sm text-amber-600">{t("Correction automatique des erreurs…", "Auto-fixing errors…")}</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
        </div>

        {/* Sélecteur de format supprimé : les apps générées sont responsive (auto) —
            sidebar sur grand écran, barre d'onglets/burger sur mobile, automatiquement. */}

        {/* Input area */}
        <div
          className={`px-4 pt-2 flex-shrink-0 ${showStudio ? "border-t border-[#ECECF2]" : ""}`}
          style={{ paddingBottom: "calc(1rem + var(--safe-bottom))" }}
        >
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
                    title={t("Retirer", "Remove")}
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
            className="chatcard flex flex-col gap-1.5 bg-white border border-[#ECECF2] rounded-[18px] px-3 py-2.5 transition-all"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
          >
            {isListening ? (
              <div className="w-full">
                <VoiceRecorder
                  initialText={input}
                  onCancel={() => setIsListening(false)}
                  onCommit={(text) => {
                    setInput(text);
                    setIsListening(false);
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                />
              </div>
            ) : (
              <>
            {/* Le texte grandit ; les contrôles restent FIXES en dessous. */}
            <div className="relative w-full min-w-0 px-1">
              {!input && !generatedHTML && messages.length === 0 && (
                <span className="absolute top-0 left-1 right-1 text-[#6E6E6C] text-sm pointer-events-none select-none leading-relaxed">
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
                      ? t("Contrôle à faire (ex : détecte les doublons)…", "Check to run (e.g. detect duplicates)…")
                      : t("Question sur le document, ou laissez vide pour extraire…", "Question about the document, or leave empty to extract…")
                    : !input && !generatedHTML && messages.length === 0
                    ? ""
                    : generatedHTML
                    ? t("Dites ce que vous voulez modifier…", "Tell me what you want to change…")
                    : t("Décrivez votre outil BTP… (Entrée pour envoyer)", "Describe your construction tool… (Enter to send)")
                }
                rows={1}
                className="relative block w-full bg-transparent text-[#0A0A0A] placeholder-[#9A9AA6] text-sm resize-none focus:outline-none min-h-[26px] max-h-[240px] overflow-y-auto leading-relaxed"
                style={{ height: "auto" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }}
              />
            </div>

            {/* Rangée de contrôles STATIQUE : + (pièces jointes) à gauche, micro + envoi à droite. */}
            <div className="flex items-center justify-between gap-2">
              <div className="relative">
                <button
                  onClick={() => setPlusOpen((v) => !v)}
                  aria-label={t("Ajouter une pièce jointe", "Add an attachment")}
                  aria-expanded={plusOpen}
                  className={`relative w-9 h-9 flex items-center justify-center rounded-full active:scale-95 transition-all ${plusOpen ? "bg-black/[0.06] text-[#0A0A0A]" : "text-[#4A4A56] hover:bg-black/[0.05]"}`}
                >
                  <Plus className={`w-5 h-5 transition-transform duration-200 ${plusOpen ? "rotate-45" : ""}`} />
                  {attached.length > 0 && !plusOpen && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[#7C3AED] text-white text-[10px] font-bold leading-none">{attached.length}</span>
                  )}
                </button>
                {plusOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setPlusOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 z-30 w-56 origin-bottom-left animate-scale-in bg-white border border-[#ECECF2] rounded-2xl shadow-[0_16px_50px_rgba(60,40,120,0.16)] p-1.5">
                      {([
                        { icon: Camera, label: t("Prendre une photo", "Take a photo"), onClick: () => { setPlusOpen(false); cameraInputRef.current?.click(); } },
                        { icon: ImageIcon, label: t("Importer une photo", "Import a photo"), onClick: () => { setPlusOpen(false); fileInputRef.current?.click(); } },
                        { icon: Paperclip, label: t("Joindre un document (PDF)", "Attach a document (PDF)"), onClick: () => { setPlusOpen(false); fileInputRef.current?.click(); } },
                      ] as const).map(({ icon: Icon, label, onClick }) => (
                        <button
                          key={label}
                          onClick={onClick}
                          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13.5px] text-[#2A2A32] hover:bg-[#F4F4F7] transition-colors text-left"
                        >
                          <Icon className="w-[18px] h-[18px] text-[#7C3AED] flex-shrink-0" strokeWidth={1.9} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsListening(true)}
                  aria-label={t("Dictée vocale", "Voice dictation")}
                  title={t("Parler (dictée)", "Speak (dictation)")}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-[#4A4A56] hover:bg-black/[0.05] active:scale-95 transition-all"
                >
                  <Mic className="w-[18px] h-[18px]" />
                </button>
                <button
                  onClick={() => handleGenerate()}
                  disabled={(!input.trim() && attached.length === 0) || isGenerating}
                  aria-label={t("Envoyer", "Send")}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white rounded-full shadow-[0_6px_20px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_28px_rgba(139,92,246,0.55)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
              </>
            )}
          </div>
          </div>
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
          title={t("Glisser pour redimensionner · jusqu'au bord pour fermer un panneau", "Drag to resize · to the edge to close a panel")}
        >
          <div className="w-[3px] h-12 rounded-full bg-[#D6D6DE] group-hover:bg-[#A78BFA] transition-colors" />
        </div>
      )}

      {/* ── Atelier : prévisualisation, uniquement quand on produit ── */}
      {showStudio && !previewHidden && (
      <div ref={previewContainerRef} className={`flex-col flex-1 min-w-0 bg-[#FCFCFD] pt-safe md:pt-0 md:flex md:h-full ${mobileView === "app" ? "flex h-full w-full" : "hidden"}`}>
        {/* Preview header — DESKTOP uniquement (sur mobile, barre flottante en bas). */}
        <div className="hidden md:flex items-center justify-between px-5 h-14 border-b border-[#ECECF2] bg-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="hidden md:flex p-1.5 text-[#6E6E6C] hover:text-[#0A0A0A] rounded-lg hover:bg-[#F6F6F9] transition-colors flex-shrink-0"
                title={t("Ouvrir le panneau", "Open panel")}
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="min-w-0 flex-1 bg-transparent px-1 py-1 text-[15px] font-semibold text-[#0A0A0A] focus:outline-none truncate"
              placeholder={t("Nom de l'application", "App name")}
            />
            {generatedHTML && isAutoFixing && (
              <Loader2 className="w-4 h-4 text-amber-500 animate-spin flex-shrink-0" />
            )}
          </div>
          {/* Sélecteur de format d'aperçu AU CENTRE (bureau / tablette / mobile). */}
          <div className="flex items-center justify-center flex-shrink-0">
            {generatedHTML && (
              <div className="flex items-center gap-0.5 bg-[#F6F6F9] rounded-full p-0.5">
                {([["desktop", Monitor, t("Vue bureau", "Desktop view")], ["tablet", Tablet, t("Vue tablette", "Tablet view")], ["mobile", Smartphone, t("Vue mobile", "Mobile view")]] as const).map(([d, Icon, label]) => (
                  <button
                    key={d}
                    onClick={() => setPreviewDevice(d)}
                    title={label}
                    className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${previewDevice === d ? "bg-white text-[#0A0A0A] shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-[#9A9AA6] hover:text-[#0A0A0A]"}`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-1 justify-end">
            {generatedHTML && (
              <button onClick={() => setReloadNonce((n) => n + 1)} title={t("Actualiser l'aperçu", "Refresh preview")} className="p-1.5 text-[#6E6E6C] hover:text-[#0A0A0A] rounded-lg hover:bg-[#F6F6F9] transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            {generatedHTML && savedId && (
              <a href={`/apps/${savedId}`} target="_blank" rel="noopener" title={t("Ouvrir en plein écran", "Open full screen")} className="p-1.5 text-[#6E6E6C] hover:text-[#0A0A0A] rounded-lg hover:bg-[#F6F6F9] transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {generatedHTML && !isGenerating && (
              <button
                onClick={toggleVisualEdit}
                title={visualEditMode ? t("Arrêter l'édition visuelle", "Stop visual editing") : t("Édition visuelle (cliquer un élément)", "Visual editing (click an element)")}
                className={`p-2 rounded-full transition-colors ${
                  visualEditMode
                    ? "bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white"
                    : "text-[#6E6E6C] hover:text-[#7C3AED] hover:bg-[#F3EFFC]"
                }`}
              >
                <Pencil className="w-[18px] h-[18px]" />
              </button>
            )}
            {generatedHTML && (
              <button
                onClick={() => setShareOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0A0A0A] text-white text-[13px] font-semibold rounded-full active:scale-95 transition-transform"
              >
                <Share2 className="w-4 h-4" /> {t("Partager", "Share")}
              </button>
            )}
          </div>
        </div>

        {/* Feuille « Partager » : publier, copier le lien, ouvrir, déployer — tout ici,
            plus de barres empilées dans le cadre. Bottom sheet sur mobile. */}
        {shareOpen && generatedHTML && (
          <>
            <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={() => setShareOpen(false)} />
            <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:right-4 sm:top-16 sm:w-[340px] bg-white rounded-t-3xl sm:rounded-2xl border border-[#ECECF2] shadow-[0_-10px_50px_rgba(0,0,0,0.18)] animate-reveal-up">
              <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[#E7E7E4] sm:hidden" />
              <div className="flex items-center justify-between px-5 pt-4 pb-1">
                <p className="text-[16px] font-bold text-[#0A0A0A]">{t("Partager le projet", "Share the project")}</p>
                <button onClick={() => setShareOpen(false)} className="p-1 text-[#9A9AA6] hover:text-[#0A0A0A] transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-3 pb-6 sm:pb-3">
                {savedId ? (
                  <button onClick={togglePublish} disabled={isPublishing} className="flex w-full items-center gap-3 px-3 py-3 rounded-2xl hover:bg-[#F6F6F9] transition-colors text-left disabled:opacity-60">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#F3EFFC] text-[#7C3AED] flex-shrink-0">{isPublishing ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Globe className="w-[18px] h-[18px]" />}</span>
                    <span className="min-w-0"><span className="block text-[14px] font-semibold text-[#0A0A0A]">{isPublic ? t("En ligne — retirer le lien", "Online — remove the link") : t("Mettre en ligne", "Publish online")}</span><span className="block text-[12px] text-[#9A9AA6] truncate">{isPublic ? publicUrl.replace(/^https?:\/\//, "") : t("Lien partageable à votre équipe", "Shareable link for your team")}</span></span>
                  </button>
                ) : (
                  <button onClick={handleSave} disabled={isSaving} className="flex w-full items-center gap-3 px-3 py-3 rounded-2xl hover:bg-[#F6F6F9] transition-colors text-left disabled:opacity-60">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#F6F6F9] text-[#0A0A0A] flex-shrink-0">{isSaving ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Save className="w-[18px] h-[18px]" />}</span>
                    <span className="text-[14px] font-semibold text-[#0A0A0A]">{t("Sauvegarder dans mes ateliers", "Save to my workspaces")}</span>
                  </button>
                )}
                {isPublic && slug && (
                  <button onClick={copyLink} className="flex w-full items-center gap-3 px-3 py-3 rounded-2xl hover:bg-[#F6F6F9] transition-colors text-left">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#F6F6F9] text-[#0A0A0A] flex-shrink-0">{copied ? <CheckCircle className="w-[18px] h-[18px] text-emerald-500 animate-scale-in" /> : <Link2 className="w-[18px] h-[18px]" />}</span>
                    <span className="text-[14px] font-semibold text-[#0A0A0A]">{copied ? t("Lien copié !", "Link copied!") : t("Copier le lien", "Copy link")}</span>
                  </button>
                )}
                {savedId && (
                  <a href={`/apps/${savedId}`} target="_blank" rel="noopener" onClick={() => setShareOpen(false)} className="flex w-full items-center gap-3 px-3 py-3 rounded-2xl hover:bg-[#F6F6F9] transition-colors text-left">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#F6F6F9] text-[#0A0A0A] flex-shrink-0"><ExternalLink className="w-[18px] h-[18px]" /></span>
                    <span className="text-[14px] font-semibold text-[#0A0A0A]">{t("Ouvrir en plein écran", "Open full screen")}</span>
                  </a>
                )}
                {savedId && (
                  <button onClick={openHistory} className="flex w-full items-center gap-3 px-3 py-3 rounded-2xl hover:bg-[#F6F6F9] transition-colors text-left">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#F6F6F9] text-[#0A0A0A] flex-shrink-0"><RotateCcw className="w-[18px] h-[18px]" /></span>
                    <span className="min-w-0"><span className="block text-[14px] font-semibold text-[#0A0A0A]">{t("Historique & restaurer", "History & restore")}</span><span className="block text-[12px] text-[#9A9AA6] truncate">{t("Revenir à une version précédente", "Go back to a previous version")}</span></span>
                  </button>
                )}
                <button onClick={handleDeploy} disabled={isDeploying} className="flex w-full items-center gap-3 px-3 py-3 rounded-2xl hover:bg-[#F6F6F9] transition-colors text-left disabled:opacity-60">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#F6F6F9] text-[#0A0A0A] flex-shrink-0">{isDeploying ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : deploymentUrl ? <CheckCircle className="w-[18px] h-[18px] text-emerald-500" /> : <Globe className="w-[18px] h-[18px]" />}</span>
                  <span className="min-w-0"><span className="block text-[14px] font-semibold text-[#0A0A0A]">{isDeploying ? t("Déploiement…", "Deploying…") : deploymentUrl ? t("Redéployer", "Redeploy") : t("Déployer (hébergement dédié)", "Deploy (dedicated hosting)")}</span>{deploymentUrl && <span className="block text-[12px] text-[#9A9AA6] truncate">{deploymentUrl}</span>}</span>
                </button>
                {kind === "document" && (
                  <div className="px-3 pt-2"><ShareMenu getDocument={() => iframeRef.current?.contentDocument ?? null} title={appName} /></div>
                )}
              </div>
            </div>
          </>
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
                </div>
                <div className="h-1.5 bg-[#E7E7E4] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${Math.min(96, 100 * (1 - Math.exp(-buildSeconds / 28)))}%` }}
                  />
                </div>
                <p className="mt-3 text-center text-[11.5px] text-[#9A9AA6] leading-relaxed">
                  {buildSeconds < 30
                    ? t("Biltia écrit votre application ligne par ligne…", "Biltia is writing your app line by line…")
                    : buildSeconds < 75
                    ? t("Une application complète prend 1 à 2 minutes. Tout avance normalement.", "A full app takes 1 to 2 minutes. Everything is going fine.")
                    : t("Application riche en cours de finition — encore quelques instants.", "A rich app is being finished — just a few more moments.")}
                </p>
              </div>
            </div>
          )}

          {/* Bandeau Visual Edit actif */}
          {visualEditMode && (
            <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-center gap-2 py-2 bg-[#7C3AED]/90 text-white text-xs font-semibold pointer-events-none">
              <Pencil className="w-3.5 h-3.5" />
              {t("Cliquez sur un élément pour le modifier", "Click an element to edit it")}
            </div>
          )}

          {annotationDoc ? (
            <AnnotationCanvas doc={annotationDoc} initial={annotations} resume={undefined} startAdding={annotations.length === 0} />
          ) : report ? (
            <ReportView report={report} />
          ) : analysis ? (
            <AnalysisView
              analysis={analysis}
              onSave={saveAnalysisToWorkspace}
              saving={savingEntity}
              saved={entitySaved}
              onPropose={handleProposition}
              proposing={isGenerating}
            />
          ) : generatedHTML ? (
            <div className={`h-full w-full ${previewDevice === "desktop" ? "" : "flex items-center justify-center overflow-auto p-4 sm:p-6"}`}>
              <div
                className={
                  previewDevice === "desktop"
                    ? "w-full h-full"
                    : previewDevice === "tablet"
                      ? "w-[820px] max-w-full h-[1100px] max-h-full flex-shrink-0 overflow-hidden rounded-[1.5rem] border border-[#ECECF2] bg-white shadow-[0_24px_70px_rgba(60,40,120,0.16)]"
                      : "w-[390px] max-w-full h-[844px] max-h-full flex-shrink-0 overflow-hidden rounded-[2.4rem] border-[8px] border-[#0A0A0A] bg-white shadow-[0_24px_70px_rgba(60,40,120,0.2)]"
                }
              >
                <iframe
                  ref={iframeRef}
                  key={`${generatedHTML.slice(0, 50)}-${reloadNonce}`}
                  srcDoc={previewHTML}
                  sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
                  allow="camera; microphone; geolocation; clipboard-write"
                  className={`w-full h-full border-0 ${resizing ? "pointer-events-none" : ""}`}
                  title={t("Application générée", "Generated app")}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-white border border-[#ECECF2] flex items-center justify-center mb-4 shadow-[0_4px_14px_rgba(60,40,120,0.08)]">
                <Wrench className="w-7 h-7 text-[#6E6E6C]" />
              </div>
              <h3 className="font-semibold tracking-[-0.01em] text-[#0A0A0A] mb-2">{t("Prévisualisation", "Preview")}</h3>
              <p className="text-sm text-[#6E6E6C] max-w-xs leading-relaxed">
                {t("Décrivez votre outil dans le panneau gauche. L'application apparaîtra ici, prête à l'emploi.", "Describe your tool in the left panel. The app will appear here, ready to use.")}
              </p>
            </div>
          )}
        </div>

        {/* Barre flottante mobile : ‹ Chat + actualiser + Partager (façon Lovable).
            Boutons pleins et contrastés (lisibles d'un coup d'œil), zone home
            indicator réservée en bas (pb-bar-safe) pour ne pas être coupée. */}
        <div className="md:hidden flex items-center justify-between gap-2 px-3 pt-2.5 pb-bar-safe border-t border-[#ECECF2] bg-white flex-shrink-0">
          <button
            onClick={() => setMobileView("chat")}
            className="flex items-center gap-1 pl-3 pr-4 h-11 rounded-full bg-[#0A0A0A] text-[14px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] active:scale-95 transition-transform"
          >
            <ChevronLeft className="w-4 h-4" /> {t("Chat", "Chat")}
          </button>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setReloadNonce((n) => n + 1)}
              title={t("Actualiser l'aperçu", "Refresh preview")}
              aria-label={t("Actualiser l'aperçu", "Refresh preview")}
              className="grid h-11 w-11 place-items-center rounded-full bg-[#F1F1F4] text-[#0A0A0A] shadow-[0_1px_3px_rgba(0,0,0,0.08)] active:scale-90 active:bg-[#E7E7EC] transition-all"
            >
              <RefreshCw className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => setShareOpen(true)}
              title={t("Partager", "Share")}
              aria-label={t("Partager", "Share")}
              className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_4px_14px_rgba(139,92,246,0.4)] active:scale-90 transition-all"
            >
              <Upload className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </div>
      )}

      {tplChooser && (
        <DataStartModal
          templateId={tplChooser.id}
          templateName={tplChooser.name}
          accent={tplChooser.accent}
          onCreated={(appId) => window.location.assign(`/apps/${appId}`)}
          onFallback={() => {
            const t = tplChooser;
            setTplChooser(null);
            loadTemplatePreview(t.id, t.name);
          }}
          onClose={() => {
            const t = tplChooser;
            setTplChooser(null);
            loadTemplatePreview(t.id, t.name);
          }}
        />
      )}

      {/* Phase 7 — Historique des versions & rollback */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-5"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2 sticky top-0 bg-white">
              <p className="text-[16px] font-bold text-[#0A0A0A]">{t("Historique des versions", "Version history")}</p>
              <button onClick={() => setHistoryOpen(false)} className="p-1 text-[#9A9AA6] hover:text-[#0A0A0A] transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-3 pb-6 sm:pb-3">
              {historyLoading ? (
                <div className="py-10 text-center text-[#9A9AA6]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
              ) : versions.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-[#9A9AA6]">{t("Aucune version enregistrée pour l'instant. Chaque modification sauvegardée en créera une.", "No version saved yet. Each saved change will create one.")}</p>
              ) : (
                versions.map((v, i) => (
                  <div key={v.id} className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-[#F6F6F9] transition-colors">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#F6F6F9] text-[#0A0A0A] text-[12px] font-bold flex-shrink-0">v{v.version}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-[#0A0A0A] truncate">
                        {(locale === "en" ? CHANGE_LABEL_EN : CHANGE_LABEL)[v.changeType] ?? t("Modification", "Change")}{v.description ? ` — ${v.description}` : ""}
                      </span>
                      <span className="block text-[11.5px] text-[#9A9AA6]">{new Date(v.createdAt).toLocaleString(locale === "en" ? "en-US" : "fr-FR")}</span>
                    </span>
                    {i === 0 ? (
                      <span className="text-[11px] font-semibold text-emerald-600 flex-shrink-0">{t("actuelle", "current")}</span>
                    ) : (
                      <button
                        onClick={() => restoreVersion(v.id)}
                        disabled={!!restoringId}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0A0A0A] text-white text-[12px] font-semibold hover:bg-[#26262E] transition-colors disabled:opacity-60 flex-shrink-0"
                      >
                        {restoringId === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} {t("Restaurer", "Restore")}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CHANGE_LABEL: Record<string, string> = {
  create: "Création",
  full_rewrite: "Réécriture complète",
  patch: "Modification ciblée",
  manual_edit: "Édition",
  rollback: "Restauration",
  autofix: "Correction automatique",
};
const CHANGE_LABEL_EN: Record<string, string> = {
  create: "Created",
  full_rewrite: "Full rewrite",
  patch: "Targeted change",
  manual_edit: "Edit",
  rollback: "Restore",
  autofix: "Auto-fix",
};
