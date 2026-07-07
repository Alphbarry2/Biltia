// ─────────────────────────────────────────────────────────────────────────────
// QUESTIONS PRÉALABLES À LA CRÉATION D'UNE APP — données partagées client/serveur.
//
// Source unique : /api/clarify les sert (avec 1-2 questions LLM en plus), et le
// client /generate les utilise en REPLI LOCAL si l'API ne répond pas. Règle
// produit ABSOLUE : on pose TOUJOURS les questions avant de créer une
// application — l'utilisateur peut les ignorer (« Tout ignorer »), mais elles
// doivent apparaître. Aucun chemin ne doit construire sans les avoir montrées.
// ─────────────────────────────────────────────────────────────────────────────

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

/** Questionnaire complet 100 % statique (zéro LLM, zéro réseau) — utilisé en
 *  repli côté client quand /api/clarify ne répond pas.
 *  On ne demande PLUS le support (mobile/desktop/tablette) ni l'organisation
 *  d'écran : les apps sont responsive par défaut (sidebar en grand, barre
 *  d'onglets/burger en petit) — la mise en page s'adapte à l'écran, pas à un
 *  choix. Ordre : spécifique → Palette. La question DONNÉES est injectée à part. */
export function buildStaticClarifyQuestions(): ClarifyQuestion[] {
  // La question DONNÉES (workspace / import / zéro) est posée SYSTÉMATIQUEMENT,
  // y compris dans ce repli hors-ligne (décision user 2026-07-07). La question
  // de portée workspace suit : le widget la saute si « workspace » n'est pas choisi.
  return [...FALLBACK_SPECIFIC.slice(0, 2), DATA_QUESTION, WORKSPACE_SCOPE_QUESTION, THEME_QUESTION];
}
