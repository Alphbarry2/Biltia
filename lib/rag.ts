// ─────────────────────────────────────────────────────────────────────────────
// RAG — Retrieval Augmented Generation.
//
// Récupère des extraits de sources VÉRIFIÉES (bibliothèque BTP globale +
// documents privés du tenant) et les met en forme pour le prompt de génération.
//
// Philosophie (reprise de lib/router.ts) : on TENTE le RAG, on retombe
// proprement (retourne []/"" ), on ne throw JAMAIS. La génération ne doit
// jamais casser parce que Mistral ou pgvector est indisponible.
//
// Isolation : la RPC match_knowledge est SECURITY INVOKER → la RLS s'applique.
// On passe un client Supabase AUTHENTIFIÉ → le tenant ne voit que le global +
// ses propres documents.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { embedQuery } from "./embeddings";

/**
 * Découpe un texte en chunks (~1500 caractères), coupés aux paragraphes pour
 * préserver le sens. Partagé par l'ingestion tenant (app/api/knowledge).
 */
export function chunkText(text: string, maxLen = 1500): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paras) {
    if (current && current.length + p.length + 2 > maxLen) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export type RetrievedChunk = {
  id: string;
  document_id: string;
  content: string;
  title: string;
  source_url: string | null;
  source_type: string;
  trade_ids: string[];
  similarity: number;
};

interface RetrieveParams {
  supabase: SupabaseClient;
  tenantId: string;
  prompt: string;
  tradeIds?: string[];
  limit?: number;
  /** Filtre optionnel : ignore les extraits sous ce score de similarité cosine. */
  minSimilarity?: number;
}

/**
 * Récupère les extraits les plus pertinents pour la demande. Retourne toujours
 * un tableau (vide si RAG indisponible, sans clé, ou en cas d'erreur).
 */
export async function retrieveContext({
  supabase,
  tenantId,
  prompt,
  tradeIds = [],
  limit = 6,
  minSimilarity = 0,
}: RetrieveParams): Promise<RetrievedChunk[]> {
  try {
    const vector = await embedQuery(prompt);
    if (!vector) return []; // pas de clé Mistral → dégradation propre

    const { data, error } = await supabase.rpc("match_knowledge", {
      query_embedding: vector,
      match_count: limit,
      p_tenant_id: tenantId,
      p_trade_ids: tradeIds.length > 0 ? tradeIds : null,
    });

    if (error || !Array.isArray(data)) return [];

    const chunks = data as RetrievedChunk[];
    return minSimilarity > 0
      ? chunks.filter((c) => c.similarity >= minSimilarity)
      : chunks;
  } catch {
    // Réseau, quota, RPC absente (migration non appliquée)… → repli silencieux.
    return [];
  }
}

/**
 * Met en forme les extraits récupérés en un bloc à injecter dans le system
 * prompt. Chaque extrait est tracé (titre + URL) pour permettre au modèle de
 * citer sa source. Retourne "" si aucun extrait (aucun impact sur le prompt).
 */
export function buildSourcesBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";

  const sources = chunks
    .map((c, i) => {
      const tag = c.source_url ? `${c.title} — ${c.source_url}` : c.title;
      return `[Source ${i + 1} : ${tag}]\n${c.content.trim()}`;
    })
    .join("\n\n");

  return `
# SOURCES VÉRIFIÉES (à privilégier absolument)

Les extraits ci-dessous proviennent de sources documentaires fiables. RÈGLE STRICTE :
- Pour toute affirmation RÉGLEMENTAIRE, NORMATIVE, CHIFFRÉE (taux de TVA, sections de câble, seuils, calculs, obligations) : appuie-toi UNIQUEMENT sur ces sources.
- Si l'information nécessaire ne figure PAS dans ces extraits : reste prudent, ne l'invente pas, et signale que la valeur doit être vérifiée par un professionnel plutôt que d'affirmer un chiffre incertain.
- Quand tu utilises une source, tu peux la citer discrètement dans le document généré (ex : mention « source : … »).

${sources}
`.trim();
}
