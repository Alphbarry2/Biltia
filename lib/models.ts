// ─────────────────────────────────────────────────────────────────────────────
// CATALOGUE DE MODÈLES — le « parc » de LLM/modèles que Biltia peut mobiliser.
//
// Philosophie : on ne prend PAS tous les modèles. Pour CHAQUE cas d'usage du
// produit (design, code, raisonnement profond, recherche, images, analyse de
// données…), on retient le/les meilleur(s) modèle(s), toutes marques confondues
// (Anthropic / OpenAI / Google). Le routeur (`model-router.ts`) choisit ensuite,
// selon le problème exprimé par le prospect, le modèle le plus efficace.
//
// Frontière avec les autres routeurs :
//   • `router.ts`      → choisit le MÉTIER (électricien, plombier…).
//   • `kind-router.ts` → choisit le FORMAT de sortie (document/action/module).
//   • `model-router.ts`→ choisit le MOTEUR (quel modèle) via ce catalogue.
//
// `wired` = exécutable AUJOURD'HUI (SDK + clé + intégration en place). Seul
// Anthropic est câblé pour la génération ; OpenAI/Google sont « prêts au
// catalogue » (le routeur peut les recommander et retombe sur le meilleur modèle
// câblé tant qu'ils ne sont pas branchés). Voir `model-router.ts`.
//
// ⚠️ TARIFS : ordres de grandeur au 2026-07 (USD / 1M tokens), À VÉRIFIER sur la
// page pricing de chaque fournisseur avant toute facturation réelle. Les valeurs
// Anthropic reprennent celles déjà utilisées dans `ai-usage.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export type ModelProvider = "anthropic" | "openai" | "google";

/** Cas d'usage produit — une capacité dominante par demande. */
export type ModelCapability =
  | "design" //     UI/UX, maquette, landing, charte, HTML/CSS, visuel d'interface
  | "code" //       écriture / débogage / refactor de code, agentic coding
  | "reasoning" //  réflexion profonde, raisonnement multi-étapes, stratégie
  | "research" //   recherche web / deep research, sourcé, veille, marché
  | "image" //      génération / édition d'images (sortie visuelle)
  | "data" //       analyse de données, tableaux, extraction, rapprochement
  | "writing" //    rédaction générale, documents, e-mails, Q&A (défaut sûr)
  | "fast"; //      classification / routage bon marché (usage interne)

export type ModelModality = "text" | "image";

export type ModelPricing = {
  /** USD / 1M tokens d'entrée. */
  input: number;
  /** USD / 1M tokens de sortie. */
  output: number;
  /** USD / 1M tokens d'entrée servis depuis le cache (si supporté). */
  cachedInput?: number;
  /** USD / image générée (modèles d'image, qualité standard ~1024²). */
  perImage?: number;
};

export type ModelEntry = {
  /** ID API EXACT attendu par le SDK du fournisseur (ne pas suffixer de date). */
  id: string;
  provider: ModelProvider;
  /** Nom lisible pour l'UI. */
  label: string;
  /** Sortie principale du modèle. */
  modality: ModelModality;
  /** Ce à quoi ce modèle EXCELLE (pas « ce qu'il sait faire »). */
  capabilities: ModelCapability[];
  /** Fenêtre de contexte en tokens (0 pour les modèles d'image purs). */
  contextWindow: number;
  pricing: ModelPricing;
  /** Argumentaire court (affiché à l'utilisateur / debug). */
  strengths: string;
  /** Nécessite un outil web / grounding pour donner sa pleine valeur. */
  needsWeb?: boolean;
  /** Exécutable aujourd'hui dans Biltia (sinon : recommandable mais à brancher). */
  wired: boolean;
};

// ── LE PARC ──────────────────────────────────────────────────────────────────
// Clé = ID API du modèle (stable, unique).

export const MODELS: Record<string, ModelEntry> = {
  // ---- Anthropic (Claude) — CÂBLÉ (SDK @anthropic-ai/sdk + ANTHROPIC_API_KEY) --
  "claude-opus-4-8": {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Claude Opus 4.8",
    modality: "text",
    capabilities: ["design", "code", "reasoning", "writing"],
    contextWindow: 1_000_000,
    pricing: { input: 5, output: 25, cachedInput: 0.5 }, // réel (platform.claude.com) 2026-07
    strengths:
      "Référence pour le code et le design d'interfaces (HTML/CSS soigné) ; raisonnement adaptatif fort. Le meilleur choix câblé pour générer des apps/documents Biltia.",
    wired: true,
  },
  "claude-fable-5": {
    id: "claude-fable-5",
    provider: "anthropic",
    label: "Claude Fable 5",
    modality: "text",
    capabilities: ["reasoning", "code"],
    contextWindow: 1_000_000,
    pricing: { input: 25, output: 125, cachedInput: 2.5 }, // APPROX — > tier Opus
    strengths:
      "Modèle le plus capable : réflexion profonde toujours active, horizons longs, tâches agentiques les plus dures. À réserver aux raisonnements critiques (coût élevé).",
    wired: true,
  },
  "claude-sonnet-5": {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    modality: "text",
    capabilities: ["writing", "code", "design"],
    contextWindow: 1_000_000,
    // On facture au tarif STANDARD (3/15, en vigueur au 2026-09-01) alors que
    // l'intro (2/10 jusqu'au 2026-08-31) s'applique côté Anthropic : jamais de
    // sous-facturation, bascule automatique, marge bonus pendant l'intro.
    // ⚠️ Nouveau tokenizer : ~+30 % de tokens pour le même texte que Sonnet 4.6.
    pricing: { input: 3, output: 15, cachedInput: 0.3 }, // réel (platform.claude.com) 2026-07
    strengths:
      "Successeur de Sonnet 4.6, meilleur et au même prix standard (moins cher pendant l'intro). Équilibre qualité/coût pour la rédaction, les documents, la vision et la génération courante.",
    wired: true,
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    modality: "text",
    capabilities: ["writing", "code", "design"],
    contextWindow: 1_000_000,
    pricing: { input: 3, output: 15, cachedInput: 0.3 },
    strengths:
      "Ancien palier moyen (remplacé par Sonnet 5). Conservé au catalogue pour le pricing de l'historique ai_usage.",
    wired: true,
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    modality: "text",
    capabilities: ["fast", "writing"],
    contextWindow: 200_000,
    pricing: { input: 1, output: 5, cachedInput: 0.1 }, // réel (platform.claude.com) 2026-07 — l'ancien 0.8/4 était le tarif Haiku 3.5 (retiré)
    strengths:
      "Rapide et bon marché : classification, routage, extractions courtes. Déjà utilisé par les routeurs métier et polymorphe.",
    wired: true,
  },

  // ---- OpenAI (ChatGPT) — PRÊT AU CATALOGUE (à brancher : OPENAI_API_KEY + exec)
  "gpt-5.5": {
    id: "gpt-5.5",
    provider: "openai",
    label: "GPT-5.5",
    modality: "text",
    capabilities: ["code", "reasoning", "data", "research"],
    contextWindow: 400_000,
    pricing: { input: 5, output: 30, cachedInput: 0.5 }, // réel (developers.openai.com) 2026-07
    strengths:
      "Flagship OpenAI : code et débogage de pointe, agentique multi-outils, analyse de données et de documents, raisonnement. Excellent généraliste haut de gamme.",
    needsWeb: false,
    wired: false,
  },
  "gpt-5.5-pro": {
    id: "gpt-5.5-pro",
    provider: "openai",
    label: "GPT-5.5 Pro",
    modality: "text",
    capabilities: ["reasoning", "code", "data"],
    contextWindow: 400_000,
    pricing: { input: 15, output: 120, cachedInput: 1.5 }, // APPROX
    strengths:
      "Variante « Pro » : raisonnement le plus poussé d'OpenAI pour les problèmes les plus difficiles. Coût élevé, à réserver aux cas critiques.",
    wired: false,
  },
  "gpt-5.4": {
    id: "gpt-5.4",
    provider: "openai",
    label: "GPT-5.4",
    modality: "text",
    capabilities: ["code", "writing", "data"],
    contextWindow: 1_000_000,
    pricing: { input: 2.5, output: 15, cachedInput: 0.25 }, // réel (developers.openai.com) 2026-07
    strengths:
      "Frontier « travail pro » : code, computer use, recherche d'outils, 1M de contexte. Robuste et efficient pour le volume.",
    wired: false,
  },
  "gpt-5.4-mini": {
    id: "gpt-5.4-mini",
    provider: "openai",
    label: "GPT-5.4 mini",
    modality: "text",
    capabilities: ["fast", "writing"],
    contextWindow: 400_000,
    pricing: { input: 0.25, output: 2, cachedInput: 0.025 }, // APPROX
    strengths:
      "Milieu de gamme rapide et économique côté OpenAI. Bon pour les tâches courantes à fort volume.",
    wired: false,
  },
  "gpt-5.4-nano": {
    id: "gpt-5.4-nano",
    provider: "openai",
    label: "GPT-5.4 nano",
    modality: "text",
    capabilities: ["fast"],
    contextWindow: 400_000,
    pricing: { input: 0.05, output: 0.4, cachedInput: 0.005 }, // APPROX
    strengths:
      "Le plus rapide et le moins cher d'OpenAI : classification et routage à très haut volume.",
    wired: false,
  },
  "gpt-image-2": {
    id: "gpt-image-2",
    provider: "openai",
    label: "GPT Image 2",
    modality: "image",
    capabilities: ["image"],
    contextWindow: 0,
    pricing: { input: 0, output: 0, perImage: 0.08 }, // APPROX (varie selon taille/qualité)
    strengths:
      "Génération/édition d'images agentique : raisonne et planifie la composition avant de dessiner. Rendu et fidélité de haut niveau, entrées image haute résolution.",
    wired: false,
  },

  // ---- Google (Gemini) — PRÊT AU CATALOGUE (à brancher : GEMINI_API_KEY + exec) -
  "gemini-3.1-pro": {
    id: "gemini-3.1-pro",
    provider: "google",
    label: "Gemini 3.1 Pro",
    modality: "text",
    capabilities: ["reasoning", "research", "data"],
    contextWindow: 1_000_000,
    pricing: { input: 1.25, output: 10, cachedInput: 0.31 }, // APPROX
    strengths:
      "Raisonnement adaptatif + grounding Google Search intégré, 1M de contexte. Excellent pour la recherche sourcée, l'analyse de gros volumes de données et le multimodal.",
    needsWeb: true,
    wired: false,
  },
  "gemini-3.5-flash": {
    id: "gemini-3.5-flash",
    provider: "google",
    label: "Gemini 3.5 Flash",
    modality: "text",
    capabilities: ["code", "writing", "fast"],
    contextWindow: 1_000_000,
    pricing: { input: 0.3, output: 2.5, cachedInput: 0.075 }, // APPROX
    strengths:
      "Frontier agentique/code rapide (modèle derrière gemini-flash-latest). Très bon rapport intelligence/latence/coût pour le volume.",
    wired: false,
  },
  "gemini-3-pro-image": {
    id: "gemini-3-pro-image",
    provider: "google",
    label: "Gemini 3 Pro Image (Nano Banana Pro)",
    modality: "image",
    capabilities: ["image"],
    contextWindow: 0,
    pricing: { input: 0, output: 0, perImage: 0.13 }, // APPROX
    strengths:
      "Image premium : cohérence de marque, localisation, rendu de texte fiable jusqu'en 4K, contrôle créatif précis. Idéal pour du visuel de document/branding.",
    wired: false,
  },
  "gemini-3.1-flash-image": {
    id: "gemini-3.1-flash-image",
    provider: "google",
    label: "Gemini 3.1 Flash Image (Nano Banana 2)",
    modality: "image",
    capabilities: ["image"],
    contextWindow: 0,
    pricing: { input: 0, output: 0, perImage: 0.04 }, // APPROX
    strengths:
      "Image « workhorse » polyvalente : 4K, connaissance du monde, rendu de texte, multi-références. Bon compromis vitesse/qualité/coût.",
    wired: false,
  },
  "gemini-3.1-flash-lite": {
    id: "gemini-3.1-flash-lite",
    provider: "google",
    label: "Gemini 3.1 Flash-Lite",
    modality: "text",
    capabilities: ["fast"],
    contextWindow: 1_000_000,
    pricing: { input: 0.1, output: 0.4, cachedInput: 0.025 }, // APPROX
    strengths:
      "Le plus économique de la gamme Gemini : basse latence, pensé pour le très haut volume et le routage.",
    wired: false,
  },
};

export const MODEL_LIST: ModelEntry[] = Object.values(MODELS);

// ── CLASSEMENT PAR CAPACITÉ ───────────────────────────────────────────────────
// Pour chaque cas d'usage : le meilleur modèle EN PREMIER, puis des alternatives
// d'autres marques (chaîne de repli). Le routeur descend cette liste jusqu'au
// premier modèle réellement câblé quand `requireWired` est demandé.

export const CAPABILITY_RANKING: Record<ModelCapability, string[]> = {
  // Design/UI : Claude excelle sur HTML/CSS et le goût visuel ; GPT-5.5 très bon.
  design: ["claude-opus-4-8", "gpt-5.5", "gemini-3.1-pro", "claude-sonnet-4-6"],
  // Code : Opus 4.8 et GPT-5.5 au coude-à-coude ; Gemini 3.5 Flash pour le volume.
  code: ["claude-opus-4-8", "gpt-5.5", "gemini-3.5-flash", "claude-sonnet-4-6"],
  // Réflexion profonde : Fable 5 (le plus capable) puis les gros raisonneurs.
  reasoning: ["claude-fable-5", "gpt-5.5-pro", "gpt-5.5", "gemini-3.1-pro", "claude-opus-4-8"],
  // Recherche : besoin de web/grounding — OpenAI deep research & Gemini grounding.
  research: ["gpt-5.5", "gemini-3.1-pro", "claude-opus-4-8"],
  // Images : gpt-image-2 (agentique) & Nano Banana Pro (texte/marque). Aucun câblé.
  image: ["gpt-image-2", "gemini-3-pro-image", "gemini-3.1-flash-image"],
  // Données : GPT-5.5 (tableurs/analyse) & Gemini 3.1 Pro (très long contexte).
  data: ["gpt-5.5", "gemini-3.1-pro", "claude-opus-4-8"],
  // Rédaction générale : Sonnet 5 (équilibre) — défaut sûr et câblé.
  writing: ["claude-sonnet-5", "gpt-5.4", "gemini-3.5-flash", "claude-opus-4-8"],
  // Rapide / routage interne : Haiku (câblé) puis les nanos des autres marques.
  fast: ["claude-haiku-4-5", "gpt-5.4-nano", "gemini-3.1-flash-lite"],
};

// ── LES 3 PALIERS OFFICIELS (décision user 2026-07-05) ───────────────────────
// Tâche hyper simple → Haiku ; tâche moyenne/mi-complexe → Sonnet ; tâche
// complexe → Opus. TOUJOURS les derniers modèles Anthropic : quand Anthropic
// sort un successeur, on ne change QUE ces trois constantes (le pricing du
// catalogue suit, ai-usage.ts calcule les crédits automatiquement).
export const TIER_SIMPLE = "claude-haiku-4-5";
export const TIER_MEDIUM = "claude-sonnet-5";
export const TIER_COMPLEX = "claude-opus-4-8";

// ── HELPERS ───────────────────────────────────────────────────────────────────

export function getModel(id: string): ModelEntry | undefined {
  return MODELS[id];
}

/** Chaîne de repli complète (ordonnée) pour une capacité, résolue en entrées. */
export function fallbackChain(
  capability: ModelCapability,
  opts: { onlyWired?: boolean } = {}
): ModelEntry[] {
  const chain = (CAPABILITY_RANKING[capability] ?? [])
    .map((id) => MODELS[id])
    .filter((m): m is ModelEntry => !!m);
  return opts.onlyWired ? chain.filter((m) => m.wired) : chain;
}

/**
 * Meilleur modèle « théorique » pour une capacité (best-in-class, marque
 * indifférente) — même s'il n'est pas encore câblé. Sert à AFFICHER la
 * recommandation idéale au prospect.
 */
export function recommendedModelFor(capability: ModelCapability): ModelEntry | undefined {
  return fallbackChain(capability)[0];
}

/**
 * Meilleur modèle réellement EXÉCUTABLE aujourd'hui pour une capacité (premier
 * `wired` de la chaîne). Repli ultime : Sonnet 4.6, jamais indéfini.
 */
export function executableModelFor(capability: ModelCapability): ModelEntry {
  return fallbackChain(capability, { onlyWired: true })[0] ?? MODELS["claude-sonnet-4-6"];
}
