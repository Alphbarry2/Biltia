// ─────────────────────────────────────────────────────────────────────────────
// QUESTIONS PRÉALABLES À LA CRÉATION D'UNE APP — données partagées client/serveur.
//
// Source unique : /api/clarify les sert (avec 1-2 questions LLM en plus), et le
// client /generate les utilise en REPLI LOCAL si l'API ne répond pas. Règle
// produit ABSOLUE : on pose TOUJOURS les questions avant de créer une
// application — l'utilisateur peut les ignorer (« Tout ignorer »), mais elles
// doivent apparaître. Aucun chemin ne doit construire sans les avoir montrées.
//
// i18n : chaque question a une version FR (défaut) et EN. On garde les constantes
// FR (source lisible) + des constantes EN parallèles, et des FABRIQUES
// `xxxQuestion(locale)` qui choisissent. Les `value` (slugs) ne changent JAMAIS —
// seul le texte visible (question / label / hint) est traduit.
// ─────────────────────────────────────────────────────────────────────────────

import type { Locale } from "@/lib/i18n/config";

export type ClarifyOption = {
  value: string;
  label: string;
  hint?: string;
  palette?: string[];            // couleurs hex pour type "color-palette"
  wireframeId?: string;          // clé wireframe pour type "layout-preview"
  forDevice?: "mobile" | "desktop" | "tablet"; // filtre côté widget
};

export type ClarifyQuestion = {
  id: string;
  question: string;
  multi: boolean;
  options: ClarifyOption[];
  type?: "color-palette" | "layout-preview" | "workspace-picker"; // rendu spécial dans le widget
};

// ── Q1 : Support (toujours présente en premier) ───────────────────────────────
export const DEVICE_QUESTION: ClarifyQuestion = {
  id: "device",
  question: "Sur quel support l'application sera-t-elle principalement utilisée ?",
  multi: false,
  options: [
    { value: "desktop", label: "Ordinateur (Desktop)", hint: "Gestion depuis le bureau, grand écran" },
    { value: "mobile",  label: "Smartphone (Mobile)",  hint: "Sur chantier, dans la poche, toujours disponible" },
    { value: "tablet",  label: "Tablette",              hint: "Grand écran tactile, en déplacement" },
  ],
};
const DEVICE_QUESTION_EN: ClarifyQuestion = {
  id: "device",
  question: "Which device will the app mainly be used on?",
  multi: false,
  options: [
    { value: "desktop", label: "Computer (Desktop)", hint: "Managed from the office, large screen" },
    { value: "mobile",  label: "Smartphone (Mobile)", hint: "On site, in your pocket, always available" },
    { value: "tablet",  label: "Tablet",              hint: "Large touch screen, on the move" },
  ],
};

// ── Q données ─────────────────────────────────────────────────────────────────
export const DATA_QUESTION: ClarifyQuestion = {
  id: "donnees",
  question: "Comment souhaitez-vous gérer les données de l'application ?",
  multi: false,
  options: [
    { value: "zero",      label: "On part de zéro",                  hint: "Saisie au fur et à mesure, exemples fictifs pour tester" },
    { value: "workspace", label: "Données déjà dans le workspace",   hint: "Clients, chantiers, employés… déjà enregistrés dans Biltia" },
    { value: "import",    label: "Importer un fichier Excel / CSV",  hint: "J'ai déjà des données à intégrer" },
  ],
};
const DATA_QUESTION_EN: ClarifyQuestion = {
  id: "donnees",
  question: "How would you like to handle the app's data?",
  multi: false,
  options: [
    { value: "zero",      label: "Start from scratch",            hint: "Enter data as you go, sample records to test" },
    { value: "workspace", label: "Data already in the workspace", hint: "Clients, projects, staff… already saved in Biltia" },
    { value: "import",    label: "Import an Excel / CSV file",    hint: "I already have data to bring in" },
  ],
};

// ── Q portée workspace (n'apparaît QUE si « Données du workspace » a été choisi) ─
// Le widget la SAUTE automatiquement si la réponse à `donnees` n'est pas
// "workspace". Ses options sont chargées en direct (type "workspace-picker") :
// « Tout le workspace » ou une sélection d'éléments précis (recherche + cases).
export const WORKSPACE_SCOPE_QUESTION: ClarifyQuestion = {
  id: "workspace_scope",
  question: "Quelles données du workspace l'application doit-elle utiliser ?",
  multi: true,
  type: "workspace-picker",
  options: [], // dynamiques : chargées depuis /api/workspace/records
};
const WORKSPACE_SCOPE_QUESTION_EN: ClarifyQuestion = {
  id: "workspace_scope",
  question: "Which workspace data should the app use?",
  multi: true,
  type: "workspace-picker",
  options: [],
};

// ── Q palette (toujours en avant-dernière position) ───────────────────────────
// PALETTE de couleurs UNIES (décision user 2026-07-07) : chaque choix est une
// palette de 2-3 couleurs SOLIDES (un accent + un ton assorti), JAMAIS un dégradé.
// Cliquer applique CETTE palette comme thème. L'utilisateur qui veut un dégradé
// le décrit dans le champ libre — c'est SON choix, pas le défaut qu'on impose.
export const THEME_QUESTION: ClarifyQuestion = {
  id: "theme",
  question: "Quelle palette de couleurs pour votre application ?",
  multi: false,
  type: "color-palette",
  options: [
    { value: "surprise",  label: "Surprenez-moi",   hint: "Biltia choisit une palette adaptée à votre métier", palette: ["#7C3AED", "#EC4899", "#3B82F6"] },
    { value: "violet",    label: "Violet & lilas",  hint: "Moderne, énergique",            palette: ["#7C3AED", "#EDE9FE"] },
    { value: "ocean",     label: "Bleu & ciel",     hint: "Sobre et professionnel",        palette: ["#2563EB", "#DBEAFE"] },
    { value: "foret",     label: "Vert & menthe",   hint: "Naturel, apaisant",             palette: ["#16A34A", "#DCFCE7"] },
    { value: "chantier",  label: "Ambre & crème",   hint: "Chaleureux, terrain",           palette: ["#D97706", "#FEF3C7"] },
    { value: "graphite",  label: "Graphite & gris", hint: "Minimal, sobre, élégant",       palette: ["#111827", "#E5E7EB"] },
    { value: "rouge",     label: "Rouge & rosé",    hint: "Dynamique, accrocheur",         palette: ["#DC2626", "#FEE2E2"] },
    { value: "beige",     label: "Brun & beige",    hint: "Chaleureux, naturel, matières", palette: ["#92400E", "#F5E6D3"] },
  ],
};
const THEME_QUESTION_EN: ClarifyQuestion = {
  id: "theme",
  question: "Which color palette for your app?",
  multi: false,
  type: "color-palette",
  options: [
    { value: "surprise",  label: "Surprise me",      hint: "Biltia picks a palette suited to your trade", palette: ["#7C3AED", "#EC4899", "#3B82F6"] },
    { value: "violet",    label: "Violet & lilac",   hint: "Modern, energetic",          palette: ["#7C3AED", "#EDE9FE"] },
    { value: "ocean",     label: "Blue & sky",       hint: "Clean and professional",     palette: ["#2563EB", "#DBEAFE"] },
    { value: "foret",     label: "Green & mint",     hint: "Natural, calm",              palette: ["#16A34A", "#DCFCE7"] },
    { value: "chantier",  label: "Amber & cream",    hint: "Warm, field-ready",          palette: ["#D97706", "#FEF3C7"] },
    { value: "graphite",  label: "Graphite & grey",  hint: "Minimal, sober, elegant",    palette: ["#111827", "#E5E7EB"] },
    { value: "rouge",     label: "Red & rose",       hint: "Bold, eye-catching",         palette: ["#DC2626", "#FEE2E2"] },
    { value: "beige",     label: "Brown & beige",    hint: "Warm, natural, textured",    palette: ["#92400E", "#F5E6D3"] },
  ],
};

// ── Q layout (toujours en dernière position, filtrée par device côté widget) ──
export const LAYOUT_QUESTION: ClarifyQuestion = {
  id: "layout",
  question: "Quelle organisation d'écran préférez-vous ?",
  multi: false,
  type: "layout-preview",
  options: [
    // ── Desktop ──────────────────────────────────────────────────────────────
    { value: "sidebar-kpi",    label: "Sidebar + KPIs + cartes",    hint: "Dashboard avec navigation latérale",         wireframeId: "sidebar-kpi",    forDevice: "desktop" },
    { value: "sidebar-table",  label: "Sidebar + tableau dense",    hint: "Liste de données, filtres, recherche",       wireframeId: "sidebar-table",  forDevice: "desktop" },
    { value: "topnav-dash",    label: "Top nav + graphiques",       hint: "Vue synthèse avec indicateurs visuels",      wireframeId: "topnav-dash",    forDevice: "desktop" },
    { value: "simple-desktop", label: "Page unique",                hint: "Tout visible d'un coup, sans navigation",    wireframeId: "simple",         forDevice: "desktop" },
    // ── Mobile ───────────────────────────────────────────────────────────────
    { value: "bottom-tabs",    label: "Onglets en bas",             hint: "Navigation moderne, geste facile sur chantier", wireframeId: "bottom-tabs",  forDevice: "mobile" },
    { value: "burger-cards",   label: "Menu burger + cartes",       hint: "Hamburger en haut, contenu en cartes",       wireframeId: "burger-cards",   forDevice: "mobile" },
    { value: "fab-list",       label: "Liste + bouton flottant",    hint: "Simple, rapide à saisir en mobilité",        wireframeId: "fab-list",       forDevice: "mobile" },
    { value: "simple-mobile",  label: "Page unique",                hint: "Scroll vertical, zéro navigation",           wireframeId: "simple",         forDevice: "mobile" },
    // ── Tablet ───────────────────────────────────────────────────────────────
    { value: "sidebar-tabs",   label: "Sidebar + onglets en bas",  hint: "Nav latérale + raccourcis bas (hybride)",     wireframeId: "sidebar-tabs",   forDevice: "tablet" },
    { value: "split-view",     label: "Vue fractionnée",           hint: "Liste à gauche, détail à droite",             wireframeId: "split-view",     forDevice: "tablet" },
    { value: "topnav-wide",    label: "Top nav + grille large",    hint: "Barre du haut, contenu en grille 2×2",        wireframeId: "topnav-wide",    forDevice: "tablet" },
    { value: "simple-tablet",  label: "Page unique",               hint: "Vue unifiée, adapté à l'écran tablette",      wireframeId: "simple",         forDevice: "tablet" },
  ],
};
const LAYOUT_QUESTION_EN: ClarifyQuestion = {
  id: "layout",
  question: "Which screen layout do you prefer?",
  multi: false,
  type: "layout-preview",
  options: [
    { value: "sidebar-kpi",    label: "Sidebar + KPIs + cards",  hint: "Dashboard with side navigation",           wireframeId: "sidebar-kpi",    forDevice: "desktop" },
    { value: "sidebar-table",  label: "Sidebar + dense table",   hint: "Data list, filters, search",               wireframeId: "sidebar-table",  forDevice: "desktop" },
    { value: "topnav-dash",    label: "Top nav + charts",        hint: "Overview with visual indicators",          wireframeId: "topnav-dash",    forDevice: "desktop" },
    { value: "simple-desktop", label: "Single page",             hint: "Everything visible at once, no navigation", wireframeId: "simple",        forDevice: "desktop" },
    { value: "bottom-tabs",    label: "Bottom tabs",             hint: "Modern navigation, easy tap on site",      wireframeId: "bottom-tabs",    forDevice: "mobile" },
    { value: "burger-cards",   label: "Burger menu + cards",     hint: "Hamburger on top, content in cards",       wireframeId: "burger-cards",   forDevice: "mobile" },
    { value: "fab-list",       label: "List + floating button",  hint: "Simple, quick to fill in on the move",     wireframeId: "fab-list",       forDevice: "mobile" },
    { value: "simple-mobile",  label: "Single page",             hint: "Vertical scroll, zero navigation",         wireframeId: "simple",         forDevice: "mobile" },
    { value: "sidebar-tabs",   label: "Sidebar + bottom tabs",   hint: "Side nav + bottom shortcuts (hybrid)",     wireframeId: "sidebar-tabs",   forDevice: "tablet" },
    { value: "split-view",     label: "Split view",              hint: "List on the left, detail on the right",    wireframeId: "split-view",     forDevice: "tablet" },
    { value: "topnav-wide",    label: "Top nav + wide grid",     hint: "Top bar, content in a 2×2 grid",           wireframeId: "topnav-wide",    forDevice: "tablet" },
    { value: "simple-tablet",  label: "Single page",             hint: "Unified view, fits the tablet screen",     wireframeId: "simple",         forDevice: "tablet" },
  ],
};

// ── Questions spécifiques de repli (quand le LLM est indisponible ou lent) ───
// NB : la question DONNÉES n'est PAS ici — elle est injectée de façon
// déterministe (buildStaticClarifyQuestions + /api/clarify) pour être TOUJOURS
// posée, y compris quand le LLM fournit ses propres questions spécifiques.
export const FALLBACK_SPECIFIC: ClarifyQuestion[] = [
  {
    id: "priorite",
    question: "Qu'est-ce qui vous pose le plus problème aujourd'hui ?",
    multi: true,
    options: [
      { value: "organisation", label: "M'organiser au quotidien",  hint: "Savoir qui fait quoi, et quand" },
      { value: "temps",        label: "Perdre du temps en paperasse", hint: "Ressaisies, documents éparpillés" },
      { value: "suivi",        label: "Suivre l'avancement",       hint: "Voir les retards avant qu'il soit trop tard" },
      { value: "argent",       label: "Suivre l'argent",           hint: "Budgets, impayés, marges" },
    ],
  },
  {
    id: "usage",
    question: "Qu'est-ce que vous voulez surtout pouvoir faire dans l'application ?",
    multi: true,
    options: [
      { value: "saisir",    label: "Saisir vite, sur le terrain", hint: "Ajouter une info en deux gestes" },
      { value: "retrouver", label: "Retrouver / rechercher",      hint: "Filtrer, chercher, ne rien perdre" },
      { value: "suivre",    label: "Suivre l'avancement",         hint: "Voir l'état d'un coup d'œil" },
      { value: "partager",  label: "Partager / exporter",         hint: "Envoyer, imprimer, PDF" },
    ],
  },
];
const FALLBACK_SPECIFIC_EN: ClarifyQuestion[] = [
  {
    id: "priorite",
    question: "What causes you the most trouble today?",
    multi: true,
    options: [
      { value: "organisation", label: "Staying organized day to day", hint: "Knowing who does what, and when" },
      { value: "temps",        label: "Wasting time on paperwork",    hint: "Re-typing, scattered documents" },
      { value: "suivi",        label: "Tracking progress",            hint: "Spot delays before it's too late" },
      { value: "argent",       label: "Tracking the money",           hint: "Budgets, unpaid invoices, margins" },
    ],
  },
  {
    id: "usage",
    question: "What do you most want to be able to do in the app?",
    multi: true,
    options: [
      { value: "saisir",    label: "Enter data fast, on site", hint: "Add an entry in two taps" },
      { value: "retrouver", label: "Find / search",            hint: "Filter, search, lose nothing" },
      { value: "suivre",    label: "Track progress",           hint: "See the status at a glance" },
      { value: "partager",  label: "Share / export",           hint: "Send, print, PDF" },
    ],
  },
];

// ── Fabriques locale-aware ────────────────────────────────────────────────────
export const dataQuestion = (locale: Locale): ClarifyQuestion =>
  locale === "en" ? DATA_QUESTION_EN : DATA_QUESTION;
export const deviceQuestion = (locale: Locale): ClarifyQuestion =>
  locale === "en" ? DEVICE_QUESTION_EN : DEVICE_QUESTION;
export const workspaceScopeQuestion = (locale: Locale): ClarifyQuestion =>
  locale === "en" ? WORKSPACE_SCOPE_QUESTION_EN : WORKSPACE_SCOPE_QUESTION;
export const themeQuestion = (locale: Locale): ClarifyQuestion =>
  locale === "en" ? THEME_QUESTION_EN : THEME_QUESTION;
export const layoutQuestion = (locale: Locale): ClarifyQuestion =>
  locale === "en" ? LAYOUT_QUESTION_EN : LAYOUT_QUESTION;
export const fallbackSpecific = (locale: Locale): ClarifyQuestion[] =>
  locale === "en" ? FALLBACK_SPECIFIC_EN : FALLBACK_SPECIFIC;

/** Questionnaire complet 100 % statique (zéro LLM, zéro réseau) — utilisé en
 *  repli côté client quand /api/clarify ne répond pas.
 *  On ne demande PLUS le support (mobile/desktop/tablette) ni l'organisation
 *  d'écran : les apps sont responsive par défaut (sidebar en grand, barre
 *  d'onglets/burger en petit) — la mise en page s'adapte à l'écran, pas à un
 *  choix. Ordre : spécifique → Palette. La question DONNÉES est injectée à part. */
export function buildStaticClarifyQuestions(locale: Locale = "fr"): ClarifyQuestion[] {
  // La question DONNÉES (workspace / import / zéro) est posée SYSTÉMATIQUEMENT,
  // y compris dans ce repli hors-ligne (décision user 2026-07-07). La question
  // de portée workspace suit : le widget la saute si « workspace » n'est pas choisi.
  return [
    ...fallbackSpecific(locale).slice(0, 2),
    dataQuestion(locale),
    workspaceScopeQuestion(locale),
    themeQuestion(locale),
  ];
}
