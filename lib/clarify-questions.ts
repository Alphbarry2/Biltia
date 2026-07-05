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
  type?: "color-palette" | "layout-preview"; // rendu spécial dans le widget
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

// ── Q palette couleurs (toujours en avant-dernière position) ──────────────────
export const THEME_QUESTION: ClarifyQuestion = {
  id: "theme",
  question: "Quelle palette de couleurs pour votre application ?",
  multi: false,
  type: "color-palette",
  options: [
    { value: "surprise",  label: "Surprenez-moi",      hint: "Biltia choisit une palette adaptée à votre métier",    palette: ["#7C3AED","#EC4899","#3B82F6"] },
    { value: "violet",    label: "Violet / Indigo",     hint: "Moderne, énergique",                                   palette: ["#4F46E5","#7C3AED","#A855F7"] },
    { value: "ocean",     label: "Bleu océan",          hint: "Sobre et professionnel",                               palette: ["#0369A1","#0EA5E9","#BAE6FD"] },
    { value: "foret",     label: "Vert forêt",          hint: "Naturel, apaisant",                                    palette: ["#166534","#16A34A","#BBF7D0"] },
    { value: "chantier",  label: "Ambre chantier",      hint: "Chaleureux, terrain",                                  palette: ["#92400E","#D97706","#FDE68A"] },
    { value: "graphite",  label: "Graphite",            hint: "Minimal, sobre, élégant",                              palette: ["#111827","#374151","#9CA3AF"] },
    { value: "rouge",     label: "Rouge / Corail",      hint: "Dynamique, accrocheur",                                palette: ["#991B1B","#EF4444","#FCA5A5"] },
    { value: "beige",     label: "Beige / Brun",        hint: "Chaleureux, naturel, matières",                        palette: ["#78350F","#A16207","#FEF3C7"] },
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
];

/** Questionnaire complet 100 % statique (zéro LLM, zéro réseau) — utilisé en
 *  repli côté client quand /api/clarify ne répond pas. Ordre : Device → DONNÉES
 *  → spécifique → Palette → Layout. La question DONNÉES est toujours en 2ᵉ. */
export function buildStaticClarifyQuestions(): ClarifyQuestion[] {
  return [DEVICE_QUESTION, DATA_QUESTION, ...FALLBACK_SPECIFIC.slice(0, 1), THEME_QUESTION, LAYOUT_QUESTION];
}
