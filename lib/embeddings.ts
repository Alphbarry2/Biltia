// ─────────────────────────────────────────────────────────────────────────────
// EMBEDDINGS — OpenAI (`text-embedding-3-small`, 1536 dimensions).
//
// Anthropic ne fournit pas d'API d'embeddings. On utilise OpenAI (clé déjà
// présente dans l'environnement). Appel HTTP direct via `fetch` — pas de
// nouvelle dépendance npm.
//
// ⚠️ La dimension (1536) est liée au schéma SQL : `knowledge_chunks.embedding
// vector(1536)`. Changer de modèle/dimension = re-migrer + ré-embed.
//
// Contrat :
//   • Clé absente        → retourne `null` (l'appelant dégrade proprement).
//   • Erreur API/réseau  → THROW (l'ingestion doit échouer bruyamment ;
//                          la récupération, elle, attrape et retombe sur []).
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

// OpenAI accepte de gros lots ; on reste raisonnable pour la robustesse.
const BATCH_SIZE = 96;

export function hasEmbeddingKey(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return !!key && !key.startsWith("your_") && key.length > 20;
}

type OpenAIEmbeddingResponse = {
  data: { embedding: number[]; index: number }[];
  usage?: { prompt_tokens: number; total_tokens: number };
};

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as OpenAIEmbeddingResponse;
  // On garde l'ordre : OpenAI renvoie `index` par item.
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/**
 * Vectorise une liste de textes. Retourne `null` uniquement si la clé n'est pas
 * configurée. Lève une erreur en cas d'échec API (pour l'ingestion).
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!hasEmbeddingKey()) return null;
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    out.push(...(await embedBatch(batch)));
  }
  return out;
}

/**
 * Vectorise une seule requête (côté récupération). Retourne `null` si pas de clé.
 */
export async function embedQuery(text: string): Promise<number[] | null> {
  const vectors = await embedTexts([text]);
  return vectors ? vectors[0] : null;
}
