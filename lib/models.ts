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

export type ModelProvider = "anthropic" | "openai" | "google" | "openrouter";

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
  /**
   * CE MODÈLE A-T-IL DES YEUX ? (accepte un bloc `image` ou `document` en entrée)
   *
   * ⚠️ Ce n'est PAS un détail de catalogue. Envoyer une image à un modèle aveugle
   * fait échouer l'appel en 404 (« No endpoints found that support image input »)
   * — c'est arrivé le 2026-07-13 : joindre un plan et demander une app plantait,
   * parce que la génération tourne sur DeepSeek V4 Pro, qui est AVEUGLE. L'info
   * était pourtant écrite… dans le champ `strengths`, en toutes lettres, où aucun
   * code ne pouvait la lire. Un fait dont le produit dépend doit être VÉRIFIABLE.
   */
  vision: boolean;
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
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
    vision: true,
    wired: false,
  },
};

// ---- OpenRouter — CÂBLÉ (SDK Anthropic pointé sur OpenRouter, voir lib/llm.ts) --
// Tarifs relevés sur l'API OpenRouter le 2026-07-13. Ils DOIVENT être justes :
// ai-usage.ts calcule les crédits du client à partir d'eux (un tarif absent ferait
// retomber sur un défaut à 3 $/15 $ et surfacturerait d'un facteur ~20).
//
// Mesuré au banc (135 apps réellement chargées et pilotées au navigateur) :
//   DeepSeek V4 Flash → 95 % de code sans erreur JS, 100 % des bonnes entités, 0,005 $/app
//   DeepSeek V4 Pro   → 100 % sans erreur, 100 % des entités, 0,072 $/app (meilleure qualité)
//   Qwen3-VL-30B      → même score que Sonnet 5 sur un devis BTP français (11/12), 15× moins cher
//   GLM 5.2           → ÉCARTÉ : 67 % des bonnes entités, plus cher que Haiku, 10 échecs API /30
Object.assign(MODELS, {
  "deepseek/deepseek-v4-flash": {
    id: "deepseek/deepseek-v4-flash",
    provider: "openrouter",
    label: "DeepSeek V4 Flash",
    modality: "text",
    capabilities: ["fast", "code", "data"],
    contextWindow: 1_048_576,
    pricing: { input: 0.08, output: 0.15 },
    strengths:
      "Le meilleur rapport qualité/prix mesuré : 16× moins cher que Haiku pour un code aussi propre. AVEUGLE (pas de vision). Idéal pour routage, classification, JSON, e-mails d'agents.",
    vision: false,
    wired: true,
  },
  "deepseek/deepseek-v4-pro": {
    id: "deepseek/deepseek-v4-pro",
    provider: "openrouter",
    label: "DeepSeek V4 Pro",
    modality: "text",
    capabilities: ["code", "reasoning", "writing", "data"],
    contextWindow: 1_048_576,
    // ⚠️ 1,74 / 3,48 — PAS les 0,43 / 0,87 affichés par le catalogue OpenRouter.
    //
    // Ce modèle est servi par 16 opérateurs, de 0,87 $/M (DeepSeek en direct) à
    // 3,48 $/M (Fireworks, Together, BaseTen…). Le catalogue n'affiche QUE le moins
    // cher. Or on route par `sort:"throughput"` → vers le PLUS RAPIDE, qui est dans
    // la tranche haute. Le prix ci-dessous est donc celui qu'on paie VRAIMENT.
    //
    // Vérifié par deux chemins indépendants : (1) le facteur ×4,0 déduit du montant
    // facturé sur 30 applications réelles, (2) le relevé /endpoints d'OpenRouter.
    // Les deux donnent 1,74 / 3,5.
    //
    // Ce que ça coûtait de se tromper : le crédit étant débité AU COÛT, on débitait
    // 4 crédits au lieu de 14 par application → marge 60 % au lieu de 88 %, SOUS le
    // plancher de 70 % de lib/plans.ts. Une fuite invisible, à chaque app.
    //
    // Ce prix reste un REPLI : quand le relevé réel est disponible (usage.cost via
    // lib/llm.ts → realCostUsd), c'est LUI qui fait foi. Cf. lib/ai-usage.ts.
    pricing: { input: 1.74, output: 3.48 },
    strengths:
      "Meilleure qualité de code du banc : SEUL modèle à sortir 30 apps /30 sans une erreur JS (campagne du 13/07, 124 apps notées au navigateur). Français naturel pour le copilote, 0 hallucination. AVEUGLE (pas de vision).",
    vision: false,
    wired: true,
  },
  "qwen/qwen3-vl-30b-a3b-instruct": {
    id: "qwen/qwen3-vl-30b-a3b-instruct",
    provider: "openrouter",
    label: "Qwen3-VL 30B (vision)",
    modality: "text",
    capabilities: ["data", "fast"],
    contextWindow: 262_144,
    pricing: { input: 0.13, output: 0.52 },
    strengths:
      "VISION : même score que Sonnet 5 sur un devis BTP français (SIRET, deux taux de TVA, accents), 2× plus rapide, 15× moins cher. Non testé sur photo dégradée ni plan d'architecte.",
    vision: true,
    wired: true,
  },
  "qwen/qwen3-vl-235b-a22b-instruct": {
    id: "qwen/qwen3-vl-235b-a22b-instruct",
    provider: "openrouter",
    label: "Qwen3-VL 235B (vision)",
    modality: "text",
    capabilities: ["data", "reasoning"],
    contextWindow: 262_144,
    // Mesuré : ×1,3 le prix catalogue (l'opérateur rapide est plus cher).
    pricing: { input: 0.25, output: 1.12 },
    strengths:
      "VISION RETENUE. Banc du 13/07 (8 documents BTP, dont 4 photographiés de travers) : 99,1 % des champs justes, 2× plus rapide que le 30B, 0,0005 $/document. Le 30B, lui, rendait le TTC à la place du HT sur un avoir — une erreur comptable invisible.",
    vision: true,
    wired: true,
  },
  "qwen/qwen3.5-flash-02-23": {
    id: "qwen/qwen3.5-flash-02-23",
    provider: "openrouter",
    label: "Qwen3.5 Flash",
    modality: "text",
    capabilities: ["fast", "data"],
    contextWindow: 1_000_000,
    pricing: { input: 0.07, output: 0.26 },
    strengths:
      "CLASSIFICATION RETENUE. Banc du 13/07 (40 demandes étiquetées, 3 passages) : 97,5 % de justesse, 1,7 s, et il n'a JAMAIS oublié d'appeler l'outil — là où DeepSeek Flash et Ling l'ont oublié 4 fois (repli silencieux sur l'heuristique).",
    vision: false,
    wired: true,
  },
  "mistralai/mistral-medium-3.1": {
    id: "mistralai/mistral-medium-3.1",
    provider: "openrouter",
    label: "Mistral Medium 3.1",
    modality: "text",
    capabilities: ["writing", "data", "reasoning"],
    contextWindow: 131_072,
    // Mesuré : ×1,1 le prix catalogue.
    pricing: { input: 0.43, output: 2.15 },
    strengths:
      "QUESTIONNAIRE RETENU. Modèle européen. Banc du 13/07 : p95 à 2,8 s contre 14,8 s pour DeepSeek Flash — c'est CE dépassement du délai de 20 s qui faisait tomber le questionnaire sur ses questions génériques. Questions vraiment métier (pour un contrat de chaudière : marque, modèle, n° de série). Voit les images.",
    vision: true,
    wired: true,
  },
  "google/gemini-2.5-flash-image": {
    id: "google/gemini-2.5-flash-image",
    provider: "openrouter",
    label: "Gemini 2.5 Flash Image",
    modality: "image",
    capabilities: ["image"],
    contextWindow: 32_768,
    // MESURÉ (banc du 2026-07-13, 2 rounds, 4 sujets) : 0,0388 $/image, 8 s.
    // Aucun de ces modèles ne PUBLIE de tarif par image — celui-ci est un relevé.
    pricing: { input: 0.3, output: 2.5, perImage: 0.0388 },
    strengths:
      "RENDU CLIENT RETENU. Sur une photo (salle de bain, façade, combles) : indiscernable de Gemini 3 Pro Image, pour 3,5× moins cher et 3× plus vite. ⚠️ NE SAIT PAS ÉCRIRE : dès qu'on lui demande un mot, il sort « Isolation Thermètic par l'Extréiure ». lib/image-gen.ts lui INTERDIT donc toute image contenant du texte.",
    vision: true,
    wired: true,
  },
  "google/gemini-3-pro-image": {
    id: "google/gemini-3-pro-image",
    provider: "openrouter",
    label: "Gemini 3 Pro Image",
    modality: "image",
    capabilities: ["image"],
    contextWindow: 32_768,
    // MESURÉ : 0,1374 $/image, 19 s.
    pricing: { input: 2, output: 12, perImage: 0.1374 },
    strengths:
      "Le SEUL du banc qui sache écrire dans une image : coupe technique d'ITE rendue sans une faute (4 couches, étiquettes françaises, épaisseurs plausibles). Non retenu par défaut (3,5× le prix du Flash pour un écart invisible sur une photo). À activer le jour où on veut illustrer une technique AVEC ses légendes.",
    vision: true,
    wired: false,
  },
  "z-ai/glm-5.2": {
    id: "z-ai/glm-5.2",
    provider: "openrouter",
    label: "GLM 5.2",
    modality: "text",
    capabilities: ["code"],
    contextWindow: 1_048_576,
    pricing: { input: 0.42, output: 1.32 },
    strengths:
      "ÉCARTÉ au banc : 67 % seulement des bonnes entités workspace, plus cher que Haiku, 10 générations ratées sur 30 (timeouts fournisseur).",
    vision: false,
    wired: true,
  },
  "anthropic/claude-sonnet-5": {
    id: "anthropic/claude-sonnet-5",
    provider: "openrouter",
    label: "Claude Sonnet 5 (via OpenRouter)",
    modality: "text",
    capabilities: ["design", "code", "writing"],
    contextWindow: 1_000_000,
    // Tarif Anthropic standard (3/15), servi tel quel par OpenRouter. La clé
    // Anthropic DIRECTE est sans crédit → on fait passer le design de Claude par
    // OpenRouter, qui a du crédit (c'est déjà lui qui sert DeepSeek).
    pricing: { input: 3, output: 15 },
    strengths:
      "Design proche d'Opus. REPLI de création d'app depuis le 2026-07-16 (voir Grok 4.5). ⚠️ Prix ci-dessus (3/15) = tarif STANDARD Anthropic, en vigueur à partir du 2026-09-01. Jusqu'au 2026-08-31, tarif d'INTRODUCTION 2/10 (celui du banc A/B). Le relevé réel (usage.cost) prime de toute façon. La vraie main de designer Claude, via OpenRouter.",
    vision: true,
    wired: true,
  },
  "x-ai/grok-4.5": {
    id: "x-ai/grok-4.5",
    provider: "openrouter",
    label: "Grok 4.5 (via OpenRouter)",
    modality: "text",
    capabilities: ["design", "code", "writing", "reasoning"],
    contextWindow: 500_000,
    // Tarif xAI standard, servi par OpenRouter. AUCUNE hausse annoncée — contrairement
    // à Sonnet 5, qui passe de 2/10 à 3/15 le 2026-09-01 : à cette date Grok devient
    // ~2,5× moins cher que Sonnet (×1,65 aujourd'hui). Le RELEVÉ réel (usage.cost via
    // lib/llm.ts → realCostUsd) prime de toute façon sur ce catalogue (cf. ai-usage.ts) ;
    // ce prix n'est qu'un repli.
    pricing: { input: 2, output: 6 },
    strengths:
      "CRÉATION D'APPLICATION RETENUE (banc A/B des 15-16/07, choix user). Design le plus proche d'Opus/Sonnet, apps riches (~21k tokens, ~59 Ko) et le MOINS cher des modèles « riches » : ~0,14 €/app, ~40 % sous Sonnet aujourd'hui, 2,5× sous Sonnet après le 2026-09-01. Voit les images. Repli syntaxe couvert par le réparateur silencieux (lib/app-syntax.ts).",
    vision: true,
    wired: true,
  },
} satisfies Record<string, ModelEntry>);

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

// ── LES PALIERS ──────────────────────────────────────────────────────────────
// Tâche hyper simple → palier SIMPLE ; moyenne → MEDIUM ; complexe → COMPLEX.
// Deux tâches ont leur propre variable, parce qu'elles ne veulent PAS le même
// modèle que leur palier : la VISION (il faut des yeux) et la CLASSIFICATION.
//
// PILOTABLES SANS DÉPLOIEMENT : on bascule un palier vers un modèle OpenRouter en
// posant une variable d'env — l'aiguillage est transparent (lib/llm.ts).
//
// Campagne du 2026-07-13 — 964 mesures réelles, 12 modèles, 3 passages minimum
// (un seul passage ne mesure pas la fiabilité, il mesure la chance) :
//
//   MODEL_KIND=qwen/qwen3.5-flash-02-23           # 97,5 % · 1,7 s · n'oublie jamais l'outil
//   MODEL_TIER_SIMPLE=mistralai/mistral-medium-3.1 # questionnaire : p95 2,8 s (vs 14,8 s)
//   MODEL_TIER_MEDIUM=deepseek/deepseek-v4-pro     # documents, itérations légères, copilote
//   MODEL_TIER_COMPLEX=deepseek/deepseek-v4-pro    # grosses tâches agents — N'EST PLUS le
//                                                  # modèle de création d'app (voir MODEL_APP_BUILD)
//   MODEL_APP_BUILD=x-ai/grok-4.5                  # CRÉATION D'APP : le design prime (bancs A/B
//                                                  # 15-16/07, choix user : design ≈ Sonnet, ~40 %
//                                                  # moins cher, 2,5× moins cher que Sonnet dès le 1/09)
//   MODEL_VISION=qwen/qwen3-vl-235b-a22b-instruct  # 99,1 % des champs · 0,0005 $/document
//
// Challengers ÉCARTÉS, et pourquoi (mesuré, pas supposé) :
//   qwen3-coder-next  → 3,5× moins cher MAIS 1 app sur 2 plante, et 8 apps sur 30
//                       écrivent dans localStorage : la saisie ne part JAMAIS dans
//                       le workspace. L'app a l'air de marcher. C'est le pire bug.
//   minimax-m2.7      → 100 % propre sur 8 apps… 70 % sur 30. Et plus cher que Pro.
//   kimi-k2.7-code    → timeout 2 fois sur 2 sur une app complexe. Le plus cher.
//   glm-5.2           → 67 % des bonnes entités, 10 échecs API sur 30.
//   Les deux derniers REFUSENT `thinking:{type:"disabled"}` (HTTP 400 « Reasoning is
//   mandatory ») que lib/llm.ts force sur chaque appel : incompatibles en l'état.
//
// Sans variable : on reste sur Anthropic (comportement d'origine, zéro risque).
const env = (k: string, fallback: string) => {
  const v = process.env[k];
  return v && !v.startsWith("your_") ? v.trim() : fallback;
};

export const TIER_SIMPLE = env("MODEL_TIER_SIMPLE", "claude-haiku-4-5");
export const TIER_MEDIUM = env("MODEL_TIER_MEDIUM", "claude-sonnet-5");
export const TIER_COMPLEX = env("MODEL_TIER_COMPLEX", "claude-opus-4-8");

/**
 * Modèle de CRÉATION D'APPLICATION — le moment « wow » où le DESIGN prime.
 *
 * Séparé des paliers de TAILLE génériques (TIER_*) : générer une app est une tâche
 * de DESIGN, pas de code brut. Les paliers, eux, restent pilotés vers le modèle de
 * code le moins cher pour les agents, la classification et le copilote.
 *
 * Défaut = Grok 4.5 via OpenRouter (décision user 2026-07-16, après deux bancs A/B
 * les 15 et 16/07 sur 8 apps BTP réelles : suivi de chantier, finance, kanban, stock,
 * planning, CRM, pointage, trésorerie, gestion d'équipe). Pourquoi Grok :
 *   • DESIGN : jugé le plus proche d'Opus/Sonnet à l'œil (apps riches ~21k tokens,
 *     ~59 Ko), très au-dessus de DeepSeek (hero plat) et de Luna/Gemini (maigres ou
 *     incohérents). Opus reste la référence mais coûte ~4×.
 *   • COÛT : le MOINS cher des modèles « riches ». ~0,14 €/app, soit ~40 % sous Sonnet
 *     aujourd'hui — et ~2,5× sous Sonnet à partir du 2026-09-01, quand Sonnet 5 quitte
 *     son tarif d'introduction (2/10 → 3/15). Grok, lui, n'a aucune hausse annoncée.
 *   • MARGE : l'app se vend un prix FIXE (ACTION_CREDITS = 300 cr ≈ 7,35 €), donc le
 *     coût du modèle ne touche que la marge — ~98 % avec Grok, sur tous les paliers.
 *   • FIABILITÉ : une rare erreur JS est rattrapée en silence (lib/app-syntax.ts).
 *   • la clé Anthropic DIRECTE est sans crédit → tout passe par OpenRouter (qui a du
 *     crédit) ; d'où les ID « fournisseur/modèle ».
 *
 * Repli d'une ligne : MODEL_APP_BUILD=anthropic/claude-sonnet-5 (design ≈ équivalent,
 * plus cher), ou =anthropic/claude-opus-4.8 pour le haut de gamme, ou un modèle
 * OpenRouter bon marché pour revenir en arrière. Pilotable sans déploiement.
 */
export const MODEL_APP_BUILD = env("MODEL_APP_BUILD", "x-ai/grok-4.5");

/** Modèle de VISION (photos, plans, PDF). Séparé des paliers : tous les modèles
 *  texte bon marché (DeepSeek, GLM) sont AVEUGLES — seuls Claude, Qwen et Mistral
 *  lisent une image. Ne le bascule que vers un modèle réellement multimodal. */
export const MODEL_VISION = env("MODEL_VISION", TIER_MEDIUM);

/** Modèle de CLASSIFICATION (lib/kind-router.ts). Séparé du palier MEDIUM, qui
 *  sert aussi à GÉNÉRER les petites apps : les deux tâches n'ont rien à voir.
 *  Trier une demande en 9 cases est court, doit être JUSTE (une erreur = la
 *  mauvaise porte : l'artisan demande une app, il reçoit un paragraphe) et
 *  surtout RAPIDE — ça tourne à chaque message. */
export const MODEL_KIND = env("MODEL_KIND", TIER_MEDIUM);

/** Modèle de RENDU CLIENT (image générée jointe à un devis).
 *
 *  Banc du 2026-07-13, 2 rounds, 20 images, 5 modèles — coûts reproduits à
 *  l'identique d'un round à l'autre :
 *    Gemini 2.5 Flash Image  0,0388 $ ·  8 s  ← RETENU (photo : irréprochable)
 *    GPT-5 Image mini        0,0449 $ · 47 s
 *    Gemini 3.1 Flash Image  0,0673 $ · 12 s
 *    Gemini 3 Pro Image      0,1374 $ · 19 s  ← le SEUL qui sache écrire
 *    GPT-5 Image             0,2098 $ · 64 s  ← éliminé : le plus cher, le plus
 *                                               lent, et il rate la cotation.
 *
 *  ⚠️ Le modèle retenu NE SAIT PAS ÉCRIRE. lib/image-gen.ts refuse donc toute
 *  demande d'image contenant du texte, et toute image TECHNIQUE (plan, coupe,
 *  cotation) — celle-là serait INVENTÉE, et l'artisan commande son matériel dessus. */
export const MODEL_IMAGE = env("MODEL_IMAGE", "google/gemini-2.5-flash-image");

// ── HELPERS ───────────────────────────────────────────────────────────────────

export function getModel(id: string): ModelEntry | undefined {
  return MODELS[id];
}

/**
 * Ce modèle peut-il recevoir une image / un PDF ?
 *
 * Défaut PRUDENT : un modèle inconnu du catalogue est réputé AVEUGLE. Se tromper
 * dans ce sens ne coûte qu'une passe de vision en plus ; se tromper dans l'autre
 * sens fait planter la requête en 404 et l'artisan perd son travail.
 */
export function canSeeImages(id: string): boolean {
  return getModel(id)?.vision === true;
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
