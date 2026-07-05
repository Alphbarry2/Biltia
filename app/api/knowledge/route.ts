// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE (docs privés par tenant) — enrichit le RAG avec les documents propres
// à l'entreprise (catalogues prix, CCTP, modèles de devis, notes internes…).
//
// POST : ajoute un document texte à la base de connaissances DU TENANT de
//        l'utilisateur (owner/admin/manager uniquement). Chunk + embed + insert.
// GET  : liste les documents visibles (bibliothèque globale + docs du tenant).
//
// L'isolation est garantie par la RLS (client authentifié) : un tenant ne peut
// écrire/lire que ses propres documents (+ le corpus global en lecture).
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { trackAiUsage } from "@/lib/ai-usage";
import { embedTexts, hasEmbeddingKey } from "@/lib/embeddings";
import { chunkText } from "@/lib/rag";
import { VISION_MODEL } from "@/lib/vision";

const WRITE_ROLES = ["owner", "admin", "manager"];

async function resolveMembership() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { supabase, user: null, membership: null };

  const membership = await getActiveMembershipServer(supabase, user.id);

  return { supabase, user, membership };
}

export async function GET() {
  const { supabase, user } = await resolveMembership();
  if (!user) return Response.json({ error: "Authentification requise." }, { status: 401 });

  // RLS filtre automatiquement : global (tenant_id null) + docs du tenant.
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("id, tenant_id, title, source_url, source_type, license, trade_ids, created_at")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: "Lecture impossible." }, { status: 500 });
  return Response.json({ documents: data ?? [] });
}

export async function POST(req: Request) {
  const { supabase, user, membership } = await resolveMembership();
  if (!user) return Response.json({ error: "Authentification requise." }, { status: 401 });
  if (!membership) return Response.json({ error: "Aucun espace de travail." }, { status: 403 });

  if (!WRITE_ROLES.includes(membership.role)) {
    return Response.json(
      { error: "Seuls owner, admin ou manager peuvent enrichir la base de connaissances." },
      { status: 403 }
    );
  }
  if (!hasEmbeddingKey()) {
    return Response.json(
      { error: "Vectorisation non configurée (OPENAI_API_KEY manquante)." },
      { status: 503 }
    );
  }

  let body: {
    title?: string;
    content?: string;
    source_url?: string;
    source_type?: string;
    trade_ids?: string[];
    file?: { name?: string; mediaType?: string; data?: string };
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  let content = typeof body.content === "string" ? body.content.trim() : "";

  // Upload d'un PDF : extraction du texte par Claude (vision), puis ingestion
  // identique au copier-coller. Les .txt/.md/.csv sont lus côté client.
  if (!content && body.file?.data && body.file.mediaType === "application/pdf") {
    const approxBytes = Math.floor(body.file.data.length * 0.75);
    if (approxBytes > 3.5 * 1024 * 1024) {
      return Response.json({ error: "PDF trop lourd (3,5 Mo max)." }, { status: 400 });
    }
    try {
      const client = new Anthropic();
      const msg = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: body.file.data },
              },
              {
                type: "text",
                text: "Extrais TOUT le texte de ce document, brut et complet, sans commentaire ni reformulation.",
              },
            ],
          },
        ],
      });
      const block = msg.content[0];
      content = (block && block.type === "text" ? block.text : "").trim();
      // Tracking best-effort de l'extraction PDF (Sonnet vision, gros inputs) :
      // appel API réel jusqu'ici invisible dans ai_usage. Jamais bloquant.
      void trackAiUsage({
        supabase,
        userId: user.id,
        tenantId: membership.tenant_id,
        action: "knowledge_extract",
        model: VISION_MODEL,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      }).catch(() => {});
    } catch {
      return Response.json(
        { error: "Extraction du PDF impossible. Réessayez, ou collez le texte directement." },
        { status: 502 }
      );
    }
  }

  if (!title || !content) {
    return Response.json({ error: "« title » et « content » sont requis." }, { status: 400 });
  }
  if (content.length > 50000) {
    return Response.json({ error: "Document trop long (50000 caractères max)." }, { status: 400 });
  }

  const source_url =
    typeof body.source_url === "string" && body.source_url.trim() ? body.source_url.trim() : null;
  const source_type =
    typeof body.source_type === "string" && body.source_type.trim()
      ? body.source_type.trim()
      : "interne";
  const trade_ids = Array.isArray(body.trade_ids)
    ? body.trade_ids.filter((t): t is string => typeof t === "string")
    : [];

  const chunks = chunkText(content);

  let embeddings: number[][] | null;
  try {
    embeddings = await embedTexts(chunks);
  } catch {
    return Response.json({ error: "Échec de la vectorisation (Mistral)." }, { status: 502 });
  }
  if (!embeddings) {
    return Response.json({ error: "Vectorisation non configurée." }, { status: 503 });
  }

  const tenantId = membership.tenant_id;

  // Insert du document (RLS : refusé si l'utilisateur n'a pas le bon rôle).
  const { data: inserted, error: docErr } = await supabase
    .from("knowledge_documents")
    .insert({
      tenant_id: tenantId,
      title,
      source_url,
      source_type,
      license: "private",
      trade_ids,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (docErr || !inserted) {
    return Response.json({ error: "Insertion refusée (droits insuffisants ?)." }, { status: 403 });
  }

  const rows = chunks.map((c, i) => ({
    document_id: inserted.id,
    tenant_id: tenantId,
    content: c,
    // Les types générés représentent `vector` en string ; le client accepte le
    // number[] et le sérialise correctement côté PostgREST.
    embedding: embeddings![i] as unknown as string,
    trade_ids,
    chunk_index: i,
    token_count: Math.round(c.length / 4),
  }));

  const { error: chunkErr } = await supabase.from("knowledge_chunks").insert(rows);
  if (chunkErr) {
    // Rollback best-effort : on retire le document orphelin.
    await supabase.from("knowledge_documents").delete().eq("id", inserted.id);
    return Response.json({ error: "Insertion des extraits échouée." }, { status: 500 });
  }

  return Response.json({ ok: true, documentId: inserted.id, chunks: rows.length });
}
