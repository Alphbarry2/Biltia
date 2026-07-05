// ─────────────────────────────────────────────────────────────────────────────
// CERVEAU COLLECTIF — transfer learning au niveau business.
//
// Deux fonctions, deux mondes :
//
//   • recordSignal()  — appelé DEPUIS une requête utilisateur (client authentifié,
//     RLS active). Journalise un SIGNAL DE SUCCÈS anonymisé et PRIVÉ au tenant.
//     Jamais bloquant, ne throw jamais (philosophie lib/rag.ts) : un échec de
//     capture ne doit JAMAIS casser l'action métier de l'utilisateur.
//
//   • promoteInsights() — appelé DEPUIS un job service_role (cron / route admin).
//     Agrège les signaux de TOUS les tenants (via la vue learning_signals_eligible
//     qui exclut déjà les opt-out), applique le K-ANONYMAT (un pattern n'est publié
//     que s'il est observé chez ≥ MIN_DISTINCT_TENANTS entreprises distinctes),
//     synthétise un insight GÉNÉRIQUE (Haiku), le vectorise et l'insère dans le
//     corpus GLOBAL du RAG (knowledge_documents.tenant_id = NULL). À partir de là,
//     match_knowledge le ressert automatiquement à tout le monde.
//
// Confidentialité (RGPD FR/BE) : aucun montant exact (→ tranches), aucun texte
// verbatim non filtré (→ stripPII + synthèse reformulée), aucune publication en
// dessous du seuil K. Un signal isolé ne sort JAMAIS.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { TIER_SIMPLE } from "./models";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts, hasEmbeddingKey } from "./embeddings";

// ── Réglages ─────────────────────────────────────────────────────────────────

/** Seuil de K-anonymat : nombre minimum de tenants DISTINCTS pour publier. */
export const MIN_DISTINCT_TENANTS = 5;

/** Modèle léger pour la synthèse d'insight (cohérent kind-router). */
const SYNTH_MODEL = TIER_SIMPLE;

/** Garde-fou coût : nombre max de groupes synthétisés par exécution. */
const MAX_GROUPS_PER_RUN = 8;

/** Types de signaux connus (extensible). */
export type SignalType =
  | "devis_accepte"
  | "devis_refuse"
  | "facture_payee"
  | "relance_reussie";

export type SignalOutcome = "success" | "fail";

// ── Anonymisation ────────────────────────────────────────────────────────────

/**
 * Filet de sécurité anti-PII. L'appelant DOIT déjà passer un contexte anonymisé
 * (jamais de nom client), mais on retire ici tout ce qui ressemble à un
 * identifiant direct : email, téléphone, SIRET/SIREN, IBAN, longues suites de
 * chiffres. Best-effort — l'objectif est de rendre une fuite improbable, pas de
 * remplacer une vraie détection PII.
 */
export function stripPII(input: string): string {
  return input
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[email]")
    .replace(/\b(?:FR|BE)?\d{2}[ ]?(?:\d{4}[ ]?){2,7}\d{1,4}\b/gi, "[iban]")
    .replace(/\b\d{9}(?:\d{5})?\b/g, "[id]") // SIREN (9) / SIRET (14)
    .replace(/(?:\+?\d[\s.-]?){9,}/g, "[tel]")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 600);
}

/** Montant exact → tranche (on ne stocke JAMAIS la valeur brute). */
export function amountBucket(montant: number | null | undefined): string | null {
  if (montant == null || !Number.isFinite(montant) || montant <= 0) return null;
  if (montant < 1000) return "0-1k";
  if (montant < 5000) return "1k-5k";
  if (montant < 15000) return "5k-15k";
  if (montant < 50000) return "15k-50k";
  return "50k+";
}

// ── 1. CAPTURE (côté requête utilisateur) ────────────────────────────────────

interface RecordSignalParams {
  /** Client Supabase AUTHENTIFIÉ (RLS : insert réservé au tenant). */
  supabase: SupabaseClient;
  tenantId: string;
  signalType: SignalType | string;
  outcome?: SignalOutcome;
  sector?: string | null;
  tradeIds?: string[];
  /** Montant brut — converti en tranche, jamais stocké tel quel. */
  montant?: number | null;
  /** Texte libre (conditions, motif…). Passé au filtre anti-PII. */
  context?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Journalise un signal de succès, anonymisé et privé au tenant. Best-effort :
 * respecte l'opt-out (si connu), filtre les PII, et n'échoue jamais bruyamment.
 * À appeler en fire-and-forget (`void recordSignal(...).catch(() => {})`).
 */
export async function recordSignal(params: RecordSignalParams): Promise<void> {
  const {
    supabase,
    tenantId,
    signalType,
    outcome = "success",
    sector = null,
    tradeIds = [],
    montant = null,
    context = "",
    meta = {},
  } = params;

  try {
    // Opt-out (défense en profondeur applicative). La garantie FORTE est la vue
    // learning_signals_eligible côté SQL ; ceci évite juste de stocker inutilement.
    // Fail-open : si la lecture échoue (RLS/réseau), on capture quand même — la
    // publication restera de toute façon filtrée par la vue à l'agrégation.
    const { data: t } = await supabase
      .from("tenants")
      .select("contributes_to_brain")
      .eq("id", tenantId)
      .maybeSingle();
    if (t && t.contributes_to_brain === false) return;

    await supabase.from("learning_signals").insert({
      tenant_id: tenantId,
      signal_type: signalType,
      outcome,
      sector: sector ? sector.slice(0, 80) : null,
      trade_ids: tradeIds.filter((x): x is string => typeof x === "string"),
      amount_bucket: amountBucket(montant),
      context: context ? stripPII(context) : "",
      meta,
    });
  } catch {
    // Capture best-effort : jamais de propagation vers l'action métier.
  }
}

// ── 2. PROMOTION (côté service_role) ─────────────────────────────────────────

type EligibleSignal = {
  id: string;
  tenant_id: string;
  signal_type: string;
  outcome: string;
  sector: string | null;
  trade_ids: string[];
  amount_bucket: string | null;
  context: string;
};

export type PromoteSummary = {
  scanned: number;
  groups: number;
  published: number;
  skippedBelowThreshold: number;
  insights: { signalType: string; title: string; tenants: number }[];
  note?: string;
};

const INSIGHT_TOOL: Anthropic.Tool = {
  name: "emit_insight",
  description:
    "Émet 1 à 3 bonnes pratiques GÉNÉRIQUES, réutilisables par n'importe quelle entreprise du BTP, tirées des cas fournis.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Titre court de l'enseignement (max 8 mots)." },
      insights: {
        type: "array",
        description:
          "1 à 3 recommandations actionnables, généralisées, SANS donnée client, SANS chiffre inventé.",
        items: { type: "string" },
      },
    },
    required: ["title", "insights"],
    additionalProperties: false,
  },
};

const SIGNAL_LABELS: Record<string, string> = {
  devis_accepte: "des devis ACCEPTÉS par le client",
  devis_refuse: "des devis REFUSÉS par le client",
  facture_payee: "des factures PAYÉES rapidement",
  relance_reussie: "des relances qui ont OBTENU une réponse",
};

/** Hash déterministe léger (dédoublonnage checksum) — pas de dépendance crypto. */
function cheapHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

async function synthesize(
  client: Anthropic,
  signalType: string,
  contexts: string[]
): Promise<{ title: string; insights: string[] } | null> {
  const label = SIGNAL_LABELS[signalType] ?? `des cas « ${signalType} »`;
  const corpus = contexts
    .filter(Boolean)
    .slice(0, 40)
    .map((c, i) => `Cas ${i + 1} : ${c}`)
    .join("\n");

  const system = `Tu es l'analyste du CERVEAU COLLECTIF de Biltia (BTP France/Belgique). On te donne des extraits ANONYMISÉS provenant de PLUSIEURS entreprises différentes, tous issus ${label}. Ton rôle : dégager ce qui REVIENT et le transformer en bonnes pratiques GÉNÉRIQUES, transférables à toute entreprise du secteur.

RÈGLES ABSOLUES :
- Généralise. N'énonce que des patterns présents dans PLUSIEURS cas.
- Zéro donnée nominative, zéro montant précis, zéro fait inventé.
- Formulations actionnables, concrètes, en français.
- Si les extraits ne révèlent aucun pattern net, renvoie une liste vide.

Réponds UNIQUEMENT en appelant l'outil emit_insight.`;

  try {
    const msg = await client.messages.create({
      model: SYNTH_MODEL,
      max_tokens: 500,
      system,
      tools: [INSIGHT_TOOL],
      tool_choice: { type: "tool", name: "emit_insight" },
      messages: [{ role: "user", content: corpus || "(aucun contexte)" }],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return null;
    const input = block.input as { title?: string; insights?: unknown };
    const insights = Array.isArray(input.insights)
      ? input.insights.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    if (insights.length === 0) return null;
    return { title: (input.title || "Enseignement").trim().slice(0, 120), insights };
  } catch {
    return null;
  }
}

/**
 * Agrège les signaux éligibles, applique le K-anonymat, synthétise et publie les
 * insights dans le corpus global du RAG. Service_role uniquement (bypass RLS).
 * Best-effort par groupe : un échec isolé n'interrompt pas les autres.
 */
export async function promoteInsights(
  admin: SupabaseClient,
  opts: { minTenants?: number } = {}
): Promise<PromoteSummary> {
  const minTenants = opts.minTenants ?? MIN_DISTINCT_TENANTS;
  const summary: PromoteSummary = {
    scanned: 0,
    groups: 0,
    published: 0,
    skippedBelowThreshold: 0,
    insights: [],
  };

  if (!hasEmbeddingKey()) {
    summary.note = "Vectorisation non configurée (OPENAI_API_KEY) — promotion suspendue.";
    return summary;
  }
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith("your_")) {
    summary.note = "Clé Anthropic absente — promotion suspendue.";
    return summary;
  }

  // Signaux de SUCCÈS non traités, hors tenants opt-out (garanti par la vue).
  const { data, error } = await admin
    .from("learning_signals_eligible")
    .select("id, tenant_id, signal_type, outcome, sector, trade_ids, amount_bucket, context")
    .eq("outcome", "success")
    .limit(5000);

  if (error || !Array.isArray(data)) {
    summary.note = "Lecture des signaux éligibles impossible.";
    return summary;
  }

  const signals = data as EligibleSignal[];
  summary.scanned = signals.length;

  // Groupement par type de signal.
  const groups = new Map<string, EligibleSignal[]>();
  for (const s of signals) {
    const g = groups.get(s.signal_type) ?? [];
    g.push(s);
    groups.set(s.signal_type, g);
  }
  summary.groups = groups.size;

  const client = new Anthropic();
  let processedGroups = 0;

  for (const [signalType, rows] of groups) {
    if (processedGroups >= MAX_GROUPS_PER_RUN) break;

    // K-ANONYMAT : compter les tenants DISTINCTS.
    const distinctTenants = new Set(rows.map((r) => r.tenant_id));
    if (distinctTenants.size < minTenants) {
      summary.skippedBelowThreshold += 1;
      continue; // laissé non traité → accumule vers le seuil aux prochains runs
    }
    processedGroups += 1;

    const contexts = rows.map((r) => r.context).filter((c) => c && c.trim().length > 0);
    const synth = await synthesize(client, signalType, contexts);
    if (!synth) continue;

    const label = SIGNAL_LABELS[signalType] ?? signalType;
    const bodyText = `Enseignements du cerveau collectif Biltia — ${label} (agrégé sur ${distinctTenants.size} entreprises).\n\n${synth.insights.map((x) => `- ${x}`).join("\n")}`;

    // Dédoublonnage : un checksum stable évite de republier un insight identique.
    const checksum = `insight:${signalType}:${cheapHash(synth.insights.join("|"))}`;
    const { data: existing } = await admin
      .from("knowledge_documents")
      .select("id")
      .eq("checksum", checksum)
      .limit(1);
    if (existing && existing.length > 0) {
      // Déjà publié — on marque quand même les signaux comme traités.
      await admin
        .from("learning_signals")
        .update({ processed_at: new Date().toISOString() })
        .in("id", rows.map((r) => r.id));
      continue;
    }

    // Vectorisation de l'insight.
    let embeddings: number[][] | null;
    try {
      embeddings = await embedTexts([bodyText]);
    } catch {
      continue; // on réessaiera au prochain run (signaux laissés non traités)
    }
    if (!embeddings || !embeddings[0]) continue;

    // Insert du document GLOBAL (tenant_id NULL) — service_role bypass RLS.
    const { data: doc, error: docErr } = await admin
      .from("knowledge_documents")
      .insert({
        tenant_id: null,
        title: `Cerveau collectif — ${synth.title}`,
        source_url: null,
        source_type: "insight",
        license: "public",
        trade_ids: [],
        checksum,
      })
      .select("id")
      .single();
    if (docErr || !doc) continue;

    const { error: chunkErr } = await admin.from("knowledge_chunks").insert({
      document_id: doc.id,
      tenant_id: null,
      content: bodyText,
      embedding: embeddings[0] as unknown as string,
      trade_ids: [],
      chunk_index: 0,
      token_count: Math.round(bodyText.length / 4),
    });
    if (chunkErr) {
      await admin.from("knowledge_documents").delete().eq("id", doc.id);
      continue;
    }

    // Marque les signaux consommés comme traités (ne comptent plus).
    await admin
      .from("learning_signals")
      .update({ processed_at: new Date().toISOString() })
      .in("id", rows.map((r) => r.id));

    summary.published += 1;
    summary.insights.push({ signalType, title: synth.title, tenants: distinctTenants.size });
  }

  return summary;
}
