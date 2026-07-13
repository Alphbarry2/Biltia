// ─────────────────────────────────────────────────────────────────────────────
// AIGUILLEUR DE FOURNISSEUR — un seul client pour Anthropic ET OpenRouter.
//
// OpenRouter expose le format Anthropic NATIVEMENT (POST /api/v1/messages, mêmes
// content blocks, mêmes tool_use, même streaming). On peut donc pointer le SDK
// Anthropic dessus : aucun traducteur, aucun code d'appel à réécrire.
//
// Règle d'aiguillage : un identifiant qui contient « / » (ex. deepseek/deepseek-v4-flash)
// part chez OpenRouter ; sinon (ex. claude-opus-4-8) il part chez Anthropic.
//
// Les fichiers appelants ne changent QUE leur import :
//     - const client = new Anthropic();
//     + import { client } from "@/lib/llm";
// Le reste (`client.messages.create({ model, ... })`) est identique.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const openrouterKey = process.env.OPENROUTER_API_KEY;
const openrouter =
  openrouterKey && !openrouterKey.startsWith("your_")
    ? new Anthropic({
        // Le SDK ajoute lui-même « /v1/messages » → l'URL s'arrête à /api.
        baseURL: "https://openrouter.ai/api",
        authToken: openrouterKey, // OpenRouter attend Authorization: Bearer
        apiKey: null,
        defaultHeaders: {
          "HTTP-Referer": "https://www.biltia.com",
          "X-Title": "Biltia",
        },
      })
    : null;

/** Un modèle « fournisseur/modele » va chez OpenRouter ; sinon chez Anthropic. */
export function isOpenRouter(model: string): boolean {
  return typeof model === "string" && model.includes("/");
}

/**
 * Ce modèle a-t-il une clé pour partir ?
 *
 * ⚠️ À UTILISER À LA PLACE DE TOUT `if (!process.env.ANTHROPIC_API_KEY)`.
 * Le produit tournait avec CINQ garde-fous codés en dur sur la clé Anthropic —
 * héritage de l'époque où tout partait chez Anthropic. Depuis la bascule vers
 * OpenRouter, plus AUCUN appel n'y va… mais ces contrôles, eux, sont restés.
 * Résultat : retirer la clé Anthropic (morte, sans crédit, et donc à révoquer)
 * ÉTEIGNAIT le produit — génération en 503, copilote en 503, questionnaire
 * retombé sur ses questions génériques. Une panne totale, causée par l'absence
 * d'une clé dont plus rien ne se sert.
 *
 * On vérifie donc la clé du fournisseur RÉELLEMENT appelé, jamais « une » clé.
 */
export function hasKeyFor(model: string): boolean {
  if (isOpenRouter(model)) return !!openrouter;
  const k = process.env.ANTHROPIC_API_KEY;
  return !!k && !k.startsWith("your_");
}

/**
 * Y a-t-il UNE clé IA, quelle qu'elle soit ?
 *
 * Pour les garde-fous du type « peut-on appeler l'IA ici ? » qui n'ont pas de
 * modèle sous la main. Préférer `hasKeyFor(model)` quand le modèle est connu.
 */
export function hasAnyLlmKey(): boolean {
  if (openrouter) return true;
  const k = process.env.ANTHROPIC_API_KEY;
  return !!k && !k.startsWith("your_");
}

export function clientFor(model: string): Anthropic {
  if (!isOpenRouter(model)) return anthropic;
  if (!openrouter) {
    throw new Error(
      `Le modèle « ${model} » passe par OpenRouter, mais OPENROUTER_API_KEY est absente.`
    );
  }
  return openrouter;
}

/**
 * Prépare les paramètres. Les modèles OpenRouter (DeepSeek, Qwen, GLM…) activent
 * souvent un « reasoning » par défaut qui BRÛLE des tokens de sortie sans rien
 * apporter à nos tâches — et qui peut tronquer la réponse en heurtant max_tokens.
 * Mesuré : une réponse d'un mot passe de 107 tokens à 2 quand on le coupe.
 * On le désactive donc par défaut ; `reasoning` explicite dans les params gagne.
 */
function prepare<T extends { model: string }>(params: T): T {
  if (!isOpenRouter(params.model)) return params;

  const extra: Record<string, unknown> = {};

  // ── LE PLUS RAPIDE, TOUJOURS ────────────────────────────────────────────────
  // Un même modèle est servi par PLUSIEURS opérateurs sur OpenRouter (le poids du
  // modèle est identique, seule l'infra change). Par défaut, OpenRouter choisit le
  // MOINS CHER — pas le plus rapide. Mesuré sur la même requête et le même modèle :
  // DeepSeek V4 Flash met 26,2 s chez l'opérateur par défaut… et 4,5 s chez le plus
  // rapide. C'est ce qui faisait perdre au questionnaire sa course contre le
  // chronomètre (→ repli → questions génériques) et ce qui plombait toutes les
  // latences du produit.
  //
  // On IMPOSE donc le débit maximal sur CHAQUE appel, sans exception. Un appelant
  // peut affiner d'autres options (data_collection, ordre…), mais jamais désactiver
  // le tri par vitesse : on fusionne, on ne remplace pas.
  // `allow_fallbacks` : si le plus rapide est saturé/en panne, OpenRouter bascule
  // sur le suivant plutôt que d'échouer — mieux vaut un peu plus lent que rien.
  const providerOpts = (params as { provider?: Record<string, unknown> }).provider ?? {};
  extra.provider = { ...providerOpts, sort: "throughput", allow_fallbacks: true };

  // LE RELEVÉ, TOUJOURS. OpenRouter renvoie alors `usage.cost` : le montant
  // RÉELLEMENT facturé, opérateur compris.
  //
  // Sans lui, on facturait le client sur le PRIX CATALOGUE — celui du fournisseur
  // le moins cher. Or on route vers le plus RAPIDE, qui est souvent 4× plus cher
  // (DeepSeek V4 Pro : 0,87 $/M chez DeepSeek… 3,48 $/M chez Fireworks). Mesuré
  // sur 30 apps : catalogue 0,0106 $, facture réelle 0,0428 $. Le crédit étant
  // débité au coût, on débitait 4 crédits au lieu de 14 → marge 60 % au lieu de
  // 88 %, sous le plancher de 70 %. Une fuite invisible, à chaque application.
  extra.usage = { include: true };

  // RAISONNEMENT FORCÉ — le piège le plus vicieux de cette intégration.
  // DeepSeek V4 Pro et GLM 5.2 raisonnent par défaut et DÉPENSENT TOUT le budget
  // de sortie en blocs `thinking` : la réponse ne contient alors AUCUN texte. Le
  // copilote renvoyait littéralement du vide, et le questionnaire perdait sa course
  // contre le chronomètre.
  // On parle à OpenRouter en FORMAT ANTHROPIC : c'est donc le paramètre Anthropic
  // `thinking` qui fait foi, pas le `reasoning` d'OpenAI (mesuré : `reasoning` est
  // purement ignoré ; `thinking:{type:"disabled"}` fait tomber la sortie de 200
  // tokens à 20 et rend le texte).
  if (!("thinking" in params)) extra.thinking = { type: "disabled" };

  return { ...params, ...extra } as T;
}

type CreateParams = Parameters<Anthropic["messages"]["create"]>[0];
type StreamParams = Parameters<Anthropic["messages"]["stream"]>[0];

/**
 * Remplaçant direct de `new Anthropic()`. Même surface, aiguillage transparent.
 * Seuls `messages.create` et `messages.stream` sont exposés : c'est tout ce que
 * le produit utilise (23 appels, 16 fichiers).
 */
export type LlmClient = {
  messages: {
    create: Anthropic["messages"]["create"];
    stream: Anthropic["messages"]["stream"];
  };
};

/**
 * Le coût RÉELLEMENT facturé par OpenRouter pour cet appel, s'il est disponible.
 * À passer à `trackAiUsage({ realCostUsd })` : c'est lui, et pas le catalogue,
 * qui garantit que la marge est juste. Renvoie `undefined` chez Anthropic (le
 * catalogue y est exact, il n'y a qu'un seul opérateur).
 */
export function realCostOf(usage: unknown): number | undefined {
  const c = (usage as { cost?: unknown } | null | undefined)?.cost;
  return typeof c === "number" && Number.isFinite(c) && c > 0 ? c : undefined;
}

export const client: LlmClient = {
  messages: {
    create: ((params: CreateParams, options?: unknown) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (clientFor(params.model as string).messages.create as any)(prepare(params as never), options)) as Anthropic["messages"]["create"],

    stream: ((params: StreamParams, options?: unknown) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (clientFor(params.model as string).messages.stream as any)(prepare(params as never), options)) as Anthropic["messages"]["stream"],
  },
};

export default client;
