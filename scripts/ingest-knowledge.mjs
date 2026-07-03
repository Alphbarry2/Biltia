// ─────────────────────────────────────────────────────────────────────────────
// INGESTION du corpus GLOBAL du RAG (data/knowledge/*.md → knowledge_chunks).
//
// Usage :
//   npm run ingest:knowledge
//   (équiv. : node --env-file=.env.local scripts/ingest-knowledge.mjs)
//
// Nécessite dans .env.local :
//   OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Idempotent : une fiche inchangée (même checksum) est ignorée. Une fiche
// modifiée est ré-ingérée (l'ancien document + ses chunks sont supprimés).
// Écrit via service_role → tenant_id = NULL (bibliothèque globale).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { embedTexts } from "../lib/embeddings.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(__dirname, "..", "data", "knowledge");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local).");
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY requis (.env.local).");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Parsing frontmatter ────────────────────────────────────────────────────
function parseDoc(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    meta[key] = val;
  }
  const trade_ids = (meta.trade_ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    title: meta.title || "Sans titre",
    source_url: meta.source_url || null,
    source_type: meta.source_type || "guide",
    license: meta.license || "public",
    trade_ids,
    body: m[2].trim(),
  };
}

// ── Découpage en chunks (~1500 caractères, coupé aux paragraphes) ────────────
function chunkText(text, maxLen = 1500) {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const p of paras) {
    if (current && (current.length + p.length + 2) > maxLen) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function checksumOf(str) {
  return createHash("sha256").update(str).digest("hex");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const files = readdirSync(KNOWLEDGE_DIR).filter(
    (f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md"
  );

  let created = 0;
  let skipped = 0;
  let totalChunks = 0;

  for (const file of files) {
    const raw = readFileSync(path.join(KNOWLEDGE_DIR, file), "utf8");
    const doc = parseDoc(raw);
    if (!doc) {
      console.warn(`⚠️  ${file} : frontmatter invalide, ignoré.`);
      continue;
    }

    const checksum = checksumOf(doc.body);

    // Doc global existant portant ce titre ?
    const { data: existing } = await supabase
      .from("knowledge_documents")
      .select("id, checksum")
      .is("tenant_id", null)
      .eq("title", doc.title)
      .maybeSingle();

    if (existing && existing.checksum === checksum) {
      skipped++;
      console.log(`⏭️  ${doc.title} (inchangé)`);
      continue;
    }
    if (existing) {
      // Modifié → on supprime l'ancien (cascade sur les chunks) et on recrée.
      await supabase.from("knowledge_documents").delete().eq("id", existing.id);
    }

    const chunks = chunkText(doc.body);
    const embeddings = await embedTexts(chunks);
    if (!embeddings) {
      console.error("❌ Échec embeddings (clé OpenAI ?). Arrêt.");
      process.exit(1);
    }

    const { data: inserted, error: docErr } = await supabase
      .from("knowledge_documents")
      .insert({
        tenant_id: null,
        title: doc.title,
        source_url: doc.source_url,
        source_type: doc.source_type,
        license: doc.license,
        trade_ids: doc.trade_ids,
        checksum,
      })
      .select("id")
      .single();

    if (docErr || !inserted) {
      console.error(`❌ ${doc.title} : insertion document échouée`, docErr?.message);
      continue;
    }

    const rows = chunks.map((content, i) => ({
      document_id: inserted.id,
      tenant_id: null,
      content,
      embedding: embeddings[i],
      trade_ids: doc.trade_ids,
      chunk_index: i,
      token_count: Math.round(content.length / 4),
    }));

    const { error: chunkErr } = await supabase.from("knowledge_chunks").insert(rows);
    if (chunkErr) {
      console.error(`❌ ${doc.title} : insertion chunks échouée`, chunkErr.message);
      await supabase.from("knowledge_documents").delete().eq("id", inserted.id);
      continue;
    }

    created++;
    totalChunks += rows.length;
    console.log(`✅ ${doc.title} (${rows.length} chunk(s))`);
  }

  console.log(
    `\n${created} fiche(s) ingérée(s), ${skipped} inchangée(s), ${totalChunks} chunk(s) vectorisé(s).`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
