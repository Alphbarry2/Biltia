// ─────────────────────────────────────────────────────────────────────────────
// SÉLECTEUR DE MODÈLE — « quel MOTEUR pour ce problème ? »
//
// À partir du problème exprimé par le prospect (en langage courant), on identifie
// la CAPACITÉ dominante requise (design, code, réflexion, recherche, image,
// données, rédaction) puis on choisit le meilleur modèle du catalogue pour la
// servir. Objectif : efficacité — le bon modèle au bon besoin.
//
// Deux niveaux, comme `router.ts` / `kind-router.ts` :
//   1. Heuristique déterministe (gratuite) : score de signaux par capacité.
//   2. LLM léger (Haiku, tool use forcé) : classification fine du besoin.
// Repli TOUJOURS propre sur l'heuristique (jamais d'exception propagée).
//
// Réalité d'exécution : seul Anthropic est câblé aujourd'hui. On renvoie donc
// DEUX choses :
//   • `recommended` — le meilleur modèle « dans l'absolu » pour ce besoin (peut
//     être OpenAI/Google, à brancher) → à AFFICHER au prospect.
//   • `model` — le meilleur modèle réellement EXÉCUTABLE maintenant (repli câblé).
// Voir `models.ts` (flag `wired`) et [[project_polymorphic_router]].
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import {
  type ModelCapability,
  type ModelEntry,
  CAPABILITY_RANKING,
  TIER_SIMPLE,
  executableModelFor,
  fallbackChain,
  recommendedModelFor,
} from "./models";

const SELECTOR_MODEL = TIER_SIMPLE;

export type SelectMethod = "llm" | "heuristic" | "forced" | "default";

export type ModelSelection = {
  /** Capacité dominante détectée pour le problème. */
  capability: ModelCapability;
  /** Meilleur modèle réellement exécutable aujourd'hui (repli câblé garanti). */
  model: ModelEntry;
  /** Meilleur modèle « dans l'absolu » pour ce besoin (peut être à brancher). */
  recommended: ModelEntry;
  /** true si le modèle idéal n'est pas encore câblé (on a dégradé proprement). */
  degraded: boolean;
  /** Chaîne de repli ordonnée (pour l'exécution / debug). */
  fallbacks: ModelEntry[];
  /** Comment la décision a été prise. */
  method: SelectMethod;
  /** Confiance 0..1. */
  confidence: number;
  /** Explication courte (UI / tracking). */
  reasoning: string;
};

// ── 1. HEURISTIQUE ───────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Signaux par capacité. On vise les MOTS DU BESOIN, pas la marque du modèle.
// (Ordre indifférent ; c'est le total pondéré qui départage.)
const SIGNALS: Record<ModelCapability, string[]> = {
  design: [
    "design", "maquette", "ui", "ux", "interface", "landing", "page d'accueil",
    "charte", "charte graphique", "couleur", "logo", "esthetique", "visuel d'interface",
    "front", "front-end", "responsive", "ecran", "template", "theme", "mise en page",
  ],
  code: [
    "code", "coder", "script", "fonction", "bug", "debug", "deboguer", "corrige le code",
    "api", "sql", "requete", "algorithme", "programme", "refactor", "typescript",
    "javascript", "python", "developpe", "integration technique", "regex",
  ],
  reasoning: [
    "raisonne", "reflechis", "reflexion", "en profondeur", "strategie", "logique",
    "demonstration", "preuve", "planifie", "plan d'action", "arbitrage", "decision",
    "compare les options", "explique en detail", "probleme complexe", "optimisation",
  ],
  research: [
    "recherche", "cherche sur internet", "sur le web", "sources", "sourcee", "actualite",
    "dernieres", "marche", "veille", "concurrents", "concurrence", "benchmark", "etude",
    "tendances", "reglementation", "norme en vigueur", "prix du marche", "fournisseurs",
  ],
  image: [
    "image", "photo", "illustration", "genere une image", "cree une image", "dessine",
    "rendu", "mockup visuel", "banniere", "vignette", "icone", "visuel marketing",
    "photo produit", "rendu 3d", "generation d'image",
  ],
  data: [
    "donnees", "data", "dataset", "tableau de donnees", "csv", "excel", "tableur",
    "statistiques", "analyse ces chiffres", "extrais", "extraction", "agrege", "agregation",
    "rapproche", "rapprochement", "comptabilite", "kpi", "reporting", "croise les",
  ],
  writing: [
    "redige", "ecris", "courrier", "mail", "e-mail", "texte", "resume", "reformule",
    "traduis", "traduction", "corrige la faute", "orthographe", "message", "annonce",
  ],
  // `fast` n'est jamais déclenché par l'utilisateur : c'est un usage interne
  // (routage/classification). Aucun signal côté prospect.
  fast: [],
};

function countHits(text: string, kws: string[]): number {
  let n = 0;
  for (const kw of kws) if (text.includes(normalize(kw))) n++;
  return n;
}

/** Choix sans appel API : score des signaux, biais vers `writing` en cas de flou. */
export function selectCapabilityHeuristic(prompt: string): {
  capability: ModelCapability;
  confidence: number;
  method: SelectMethod;
  reasoning: string;
} {
  const text = normalize(prompt);

  let best: ModelCapability | null = null;
  let bestScore = 0;
  (Object.keys(SIGNALS) as ModelCapability[]).forEach((cap) => {
    const score = countHits(text, SIGNALS[cap]);
    if (score > bestScore) {
      bestScore = score;
      best = cap;
    }
  });

  if (best && bestScore > 0) {
    return {
      capability: best,
      confidence: Math.min(0.5 + bestScore * 0.12, 0.9),
      method: "heuristic",
      reasoning: `${bestScore} signal(aux) « ${best} » détecté(s)`,
    };
  }

  // Aucun signal fort → rédaction générale (défaut sûr et câblé).
  return {
    capability: "writing",
    confidence: 0.4,
    method: "default",
    reasoning: "aucun signal fort → rédaction générale par défaut",
  };
}

// ── 2. LLM (Haiku + tool use forcé) ──────────────────────────────────────────

// Capacités proposables au classifieur : toutes SAUF `fast` (usage interne de
// routage, jamais un besoin exprimé par un prospect).
const CAPABILITY_KEYS: ModelCapability[] = (Object.keys(CAPABILITY_RANKING) as ModelCapability[]).filter(
  (c) => c !== "fast"
);

function buildSelectorSystem(): string {
  return `Tu es le SÉLECTEUR DE MODÈLE de Biltia. On te donne le problème d'un prospect, exprimé en langage courant (français). Tu identifies la CAPACITÉ dominante requise pour le résoudre AU MIEUX. Tu ne résous rien : tu qualifies le besoin.

LES CAPACITÉS :
- "design" — concevoir une interface / un visuel d'interface : maquette, landing, charte graphique, UI/UX, HTML/CSS soigné.
- "code" — écrire, corriger, refactorer du code ou une intégration technique (API, SQL, script, algorithme).
- "reasoning" — RÉFLÉCHIR EN PROFONDEUR : stratégie, arbitrage complexe, planification, démonstration, optimisation difficile.
- "research" — CHERCHER de l'information à jour : web, sources, veille, marché, concurrents, réglementation. (Nécessite le web.)
- "image" — GÉNÉRER ou éditer une IMAGE : illustration, visuel marketing, photo produit, bannière, icône.
- "data" — ANALYSER DES DONNÉES : tableaux, CSV/Excel, extraction, agrégation, rapprochement, statistiques, KPI.
- "writing" — RÉDIGER un texte courant : courrier, e-mail, résumé, reformulation, traduction, message. (Défaut si rien d'autre ne domine.)

RÈGLES :
- Choisis la capacité DOMINANTE, celle qui conditionne la qualité du résultat.
- "image" seulement si la sortie attendue est une IMAGE, pas une description.
- "research" seulement si l'info doit être fraîche / sourcée sur le web.
- En cas de doute entre "writing" et une autre, choisis l'autre uniquement si elle est clairement requise ; sinon "writing".

"confidence" : 0 à 1.
Réponds UNIQUEMENT en appelant l'outil select_capability.`;
}

const SELECT_TOOL = {
  name: "select_capability",
  description: "Qualifie la capacité dominante requise par le problème du prospect.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      capability: {
        type: "string",
        enum: CAPABILITY_KEYS,
        description: "Capacité dominante requise.",
      },
      confidence: {
        type: "number",
        description: "Confiance de 0 à 1.",
      },
    },
    required: ["capability", "confidence"],
    additionalProperties: false,
  },
} as Anthropic.Tool;

async function selectCapabilityWithLLM(
  prompt: string,
  sector?: string | null
): Promise<{ capability: ModelCapability; confidence: number } | null> {
  const client = new Anthropic();

  const userContent = sector
    ? `Secteur du prospect : ${sector}\n\nProblème : « ${prompt} »`
    : `Problème : « ${prompt} »`;

  const message = await client.messages.create({
    model: SELECTOR_MODEL,
    max_tokens: 128,
    system: buildSelectorSystem(),
    tools: [SELECT_TOOL],
    tool_choice: { type: "tool", name: "select_capability" },
    messages: [{ role: "user", content: userContent }],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return null;

  const input = block.input as { capability?: string; confidence?: number };
  if (!input.capability || !CAPABILITY_KEYS.includes(input.capability as ModelCapability)) {
    return null;
  }

  return {
    capability: input.capability as ModelCapability,
    confidence: typeof input.confidence === "number" ? input.confidence : 0.7,
  };
}

// ── ASSEMBLAGE ────────────────────────────────────────────────────────────────

/** Construit la sélection finale (modèle exécutable + recommandation) pour une capacité. */
function resolveSelection(
  capability: ModelCapability,
  base: { confidence: number; method: SelectMethod; reasoning: string }
): ModelSelection {
  const recommended = recommendedModelFor(capability) ?? executableModelFor(capability);
  const model = executableModelFor(capability);
  const degraded = recommended.id !== model.id;

  const reasoning = degraded
    ? `${base.reasoning} → idéal : ${recommended.label} (à brancher), exécuté : ${model.label}`
    : `${base.reasoning} → ${model.label}`;

  return {
    capability,
    model,
    recommended,
    degraded,
    fallbacks: fallbackChain(capability, { onlyWired: true }),
    method: base.method,
    confidence: base.confidence,
    reasoning,
  };
}

// ── ENTRÉE PUBLIQUE ──────────────────────────────────────────────────────────

/**
 * Sélectionne le meilleur modèle pour un problème exprimé. Tente le LLM si une
 * clé Anthropic est dispo, retombe TOUJOURS proprement sur l'heuristique.
 *
 * @param forceCapability  court-circuite la détection (ex : la génération d'app
 *                         Biltia est intrinsèquement un besoin "design"/"code").
 */
export async function selectModel(opts: {
  prompt: string;
  sector?: string | null;
  forceCapability?: ModelCapability;
  useLLM?: boolean;
}): Promise<ModelSelection> {
  const { prompt, sector, forceCapability, useLLM = true } = opts;

  if (forceCapability) {
    return resolveSelection(forceCapability, {
      confidence: 1,
      method: "forced",
      reasoning: `capacité imposée « ${forceCapability} »`,
    });
  }

  const hasKey =
    !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");

  if (useLLM && hasKey) {
    try {
      const llm = await selectCapabilityWithLLM(prompt, sector);
      if (llm) {
        return resolveSelection(llm.capability, {
          confidence: llm.confidence,
          method: "llm",
          reasoning: "besoin qualifié par Haiku",
        });
      }
    } catch {
      // Crédits épuisés, réseau, etc. → repli silencieux sur l'heuristique.
    }
  }

  const h = selectCapabilityHeuristic(prompt);
  return resolveSelection(h.capability, {
    confidence: h.confidence,
    method: h.method,
    reasoning: h.reasoning,
  });
}
