// ─────────────────────────────────────────────────────────────────────────────
// /api/ask — COPILOTE UNIFIÉ de Biltia (données du workspace + normes BTP).
//
// L'artisan pose une question. Deux natures possibles, gérées au même endroit :
//   • DONNÉES — « quels chantiers sont en retard ? », « quelles attestations
//     expirent ce mois ? ». Le copilote interroge le workspace via l'outil
//     query_workspace (lecture seule, tenant_id forcé, RLS appliquée), puis
//     raisonne sur les lignes récupérées.
//   • NORMES — « épaisseur de chape ? », « section de câble ? ». Le copilote
//     s'appuie sur les extraits de sources vérifiées (RAG), sans inventer.
//
// Boucle tool-use (max 5 tours). Coûte 1 crédit par question (remboursé si échec).
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { TIER_MEDIUM } from "@/lib/models";
import { routeRequest } from "@/lib/router";
import { classifyQuestionTopic } from "@/lib/question-topics";
import { getCategory } from "@/lib/sectors";
import { retrieveContext, type RetrievedChunk } from "@/lib/rag";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { trackAiUsage, reconcileCredits } from "@/lib/ai-usage";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, FROZEN_MESSAGE } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { ENTITIES, ALLOWED_ENTITIES } from "@/lib/data-entities";
import { listAppCollections, listAppRecords } from "@/lib/app-records";
import type { SupabaseClient } from "@supabase/supabase-js";

const client = new Anthropic();
const MODEL = TIER_MEDIUM;
const MAX_TOKENS = 1500;
const MAX_TURNS = 5;

// ── Outil de lecture du workspace (lecture seule, whitelist d'entités) ─────────
const QUERY_TOOL: Anthropic.Tool = {
  name: "query_workspace",
  description:
    "Récupère des lignes d'une entité du workspace de l'utilisateur (lecture seule, isolée à son entreprise). Utilise-le pour toute question portant sur SES données. Récupère les lignes puis raisonne toi-même (compter les retards, les budgets dépassés, les dates d'expiration).",
  input_schema: {
    type: "object",
    properties: {
      entity: {
        type: "string",
        enum: ALLOWED_ENTITIES,
        description: "Entité à interroger.",
      },
      match: {
        type: "object",
        description: "Filtres d'égalité optionnels (ex : { statut: \"en_retard\" }).",
        additionalProperties: true,
      },
      order: { type: "string", description: "Colonne de tri optionnelle." },
      ascending: { type: "boolean", description: "Ordre croissant (défaut true)." },
      limit: { type: "number", description: "Nombre max de lignes (défaut 50, max 100)." },
    },
    required: ["entity"],
    additionalProperties: false,
  },
};

// ── Lecture des données d'apps hors entités standard (collections libres) ──────
const APP_COLLECTIONS_TOOL: Anthropic.Tool = {
  name: "app_collections",
  description:
    "Liste les COLLECTIONS de données créées par les applications de l'utilisateur (données hors entités workspace standard) : chaque nom + son nombre de fiches. Appelle-le AVANT de conclure « je n'ai pas cette donnée » : elle est peut-être dans une collection d'app.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
};

const APP_DATA_TOOL: Anthropic.Tool = {
  name: "app_data_list",
  description:
    "Lit les fiches d'une collection d'app (nom exact via app_collections). `match` filtre par égalité sur les champs. Lecture seule.",
  input_schema: {
    type: "object",
    properties: {
      collection: { type: "string", description: "Nom exact de la collection (voir app_collections)." },
      match: {
        type: "object",
        description: "Filtres d'égalité optionnels (ex : { statut: \"en_retard\" }).",
        additionalProperties: true,
      },
      limit: { type: "number", description: "Nombre max de fiches (défaut 50, max 200)." },
    },
    required: ["collection"],
    additionalProperties: false,
  },
};

const ASK_TOOLS: Anthropic.Tool[] = [QUERY_TOOL, APP_COLLECTIONS_TOOL, APP_DATA_TOOL];

type QueryArgs = {
  entity?: string;
  match?: Record<string, unknown>;
  order?: string;
  ascending?: boolean;
  limit?: number;
};

async function runQuery(
  supabase: SupabaseClient,
  tenantId: string,
  args: QueryArgs
): Promise<Record<string, unknown>> {
  const entity = args.entity ?? "";
  if (!ALLOWED_ENTITIES.includes(entity)) {
    return { error: `Entité inconnue : ${entity}. Disponibles : ${ALLOWED_ENTITIES.join(", ")}.` };
  }
  const table = ENTITIES[entity].table;
  // Nom de table validé par whitelist ; le client typé refuse un nom variable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase.from as any)(table).select("*").eq("tenant_id", tenantId);
  if (args.match && typeof args.match === "object") q = q.match(args.match);
  if (typeof args.order === "string") q = q.order(args.order, { ascending: args.ascending !== false });
  q = q.limit(Math.min(Number(args.limit) || 50, 100));
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { rows: data ?? [], count: Array.isArray(data) ? data.length : 0 };
}

// ── Prompt système ────────────────────────────────────────────────────────────
function buildSystemPrompt(chunks: RetrievedChunk[], today: string): string {
  const docs =
    chunks.length > 0
      ? chunks
          .map(
            (c, i) =>
              `[Source ${i + 1} — ${c.source_url ? `${c.title} (${c.source_url})` : c.title}]\n${c.content.trim()}`
          )
          .join("\n\n")
      : "(aucun extrait de norme trouvé dans la base)";

  const entityList = ALLOWED_ENTITIES.map((k) => `- \`${k}\` — ${ENTITIES[k].label} : ${ENTITIES[k].fields}`).join(
    "\n"
  );

  return `Tu es le copilote de Biltia, l'assistant du chef d'entreprise du BTP français. Tu réponds à DEUX types de questions, au même endroit :

## 1. Questions sur SES DONNÉES (workspace)
Ex : « quels chantiers sont en retard ? », « lesquels dépassent leur budget ? », « quelles attestations expirent ce mois ? », « combien d'employés actifs ? ».
→ Utilise l'outil \`query_workspace\` pour récupérer les lignes pertinentes, puis RAISONNE toi-même :
  - « en retard » : statut = en_retard, OU date_fin_prevue < aujourd'hui alors que statut ≠ termine.
  - « dépasse le budget » : budget_engage > budget.
  - « expire bientôt » : expires_at dans les 30 prochains jours.
  - Compte, filtre, trie sur les lignes récupérées. Tu peux appeler l'outil plusieurs fois (entités différentes).
Aujourd'hui = ${today}.

Entités disponibles :
${entityList}

Certaines apps stockent aussi des données dans des COLLECTIONS libres (hors de ces entités). Si la question peut les concerner, ou si l'entité standard ne contient rien, appelle \`app_collections\` (inventaire) puis \`app_data_list(collection)\`. Ne conclus « je n'ai pas cette donnée » qu'APRÈS avoir vérifié les entités ET les collections d'app.

## 2. Questions de NORME BTP
Ex : « épaisseur minimum d'une chape ? », « section de câble ? », « taux de TVA en rénovation ? ».
→ Appuie-toi UNIQUEMENT sur les extraits de sources vérifiées ci-dessous. Cite la source. Si la réponse n'y figure pas, dis-le et n'invente AUCUN chiffre.

## Règles absolues
- Ne mélange pas : une question sur les données se répond avec query_workspace, pas avec les normes.
- N'invente jamais une donnée ni un chiffre réglementaire. Si l'information manque (données absentes ou norme non couverte), dis-le clairement.
- Réponds en français, de façon concise et concrète, avec le vocabulaire du métier. Donne des nombres précis quand tu les as comptés.
- Si une question porte sur un montant dû/facturé et que le workspace ne contient pas cette information (pas de table factures avec montants), dis-le honnêtement.

[EXTRAITS DE NORMES VÉRIFIÉES]
${docs}`;
}

function dedupeSources(chunks: RetrievedChunk[]) {
  const seen = new Set<string>();
  const out: { title: string; source_url: string | null; similarity: number }[] = [];
  for (const c of chunks) {
    if (seen.has(c.document_id)) continue;
    seen.add(c.document_id);
    out.push({ title: c.title, source_url: c.source_url, similarity: c.similarity });
  }
  return out;
}

export async function POST(req: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith("your_")) {
      return Response.json({ error: "Clé API Anthropic non configurée." }, { status: 503 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Authentification requise." }, { status: 401 });
    }

    // Rate limiting : rejette un flood au plus tôt (avant toute lecture DB).
    const limited = await enforceRateLimit("ask", user.id, LIMITS.ask);
    if (limited) return limited;

    const membership = await getActiveMembershipServer(supabase, user.id);
    if (!membership) {
      return Response.json({ error: "Aucun espace de travail trouvé." }, { status: 403 });
    }
    const tenantId = membership.tenant_id;

    // GEL LECTURE SEULE : un abonnement expiré ne peut plus interroger l'IA.
    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) {
      return Response.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
    }

    let body: { question?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return Response.json({ error: "Posez une question." }, { status: 400 });
    }
    if (question.length > 2000) {
      return Response.json({ error: "Question trop longue (2000 caractères max)." }, { status: 400 });
    }

    // Pré-autorisation (hold), réconciliée au coût réel après la réponse.
    // Compte fondateur : jamais de hold ni de débit (usage journalisé quand même).
    const founder = isFounderEmail(user.email);
    // Pré-autorisation basse : une question coûte réellement ~1 à 10 crédits
    // (réconcilié au coût réel après la réponse). On ne « réserve » pas 15.
    const HOLD = founder ? 0 : 5;
    if (HOLD > 0) {
      const { data: credited } = await supabase.rpc("deduct_credits", { p_amount: HOLD });
      if (!credited) {
        // Signal d'upsell (best-effort) : l'utilisateur tape le mur des crédits.
        try {
          await supabase.from("app_events").insert({
            user_id: user.id,
            tenant_id: tenantId,
            event_type: "credits_blocked",
            metadata: { at: "ask", needed: HOLD },
          });
        } catch {
          // le tracking ne bloque jamais la réponse
        }
        return Response.json(
          { error: "Crédits insuffisants. Rechargez votre compte pour continuer." },
          { status: 402 }
        );
      }
    }

    async function refund() {
      if (HOLD <= 0) return;
      const admin = createAdminClient();
      if (admin) {
        try {
          await admin.rpc("refund_credits", { p_user_id: user!.id, p_amount: HOLD });
        } catch (err) {
          console.error("Refund failed after ask error:", err);
        }
      }
    }

    // Secteur + routage pour cibler la récupération des normes.
    const { data: profile } = await supabase
      .from("profiles")
      .select("sector")
      .eq("user_id", user.id)
      .single();
    const sector = profile?.sector ?? null;

    const route = await routeRequest({ prompt: question, sector });
    // Tracking best-effort du routage Haiku (invisible jusque-là dans ai_usage).
    if (route.usage) {
      void trackAiUsage({
        supabase,
        userId: user.id,
        tenantId,
        action: "route_agent",
        model: route.usage.model,
        inputTokens: route.usage.inputTokens,
        outputTokens: route.usage.outputTokens,
        sector: sector ?? undefined,
        internal: true, // routage : coût réel journalisé, pas de plancher 5cr
      }).catch(() => {});
    }
    const cat = route.agent !== "generalist" ? getCategory(route.agent) : undefined;
    const tradeIds = cat ? cat.subTrades.map((s) => s.id) : [];

    // Normes (jamais bloquant : [] si RAG indisponible).
    const chunks = await retrieveContext({ supabase, tenantId, prompt: question, tradeIds, limit: 6 });

    const today = new Date().toISOString().slice(0, 10);
    const system = buildSystemPrompt(chunks, today);

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
    const queried = new Set<string>();
    let answer = "";
    let inTok = 0;
    let outTok = 0;

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const message = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system,
          tools: ASK_TOOLS,
          messages,
        });
        inTok += message.usage.input_tokens;
        outTok += message.usage.output_tokens;

        // Texte éventuel de ce tour.
        const text = message.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        if (text) answer = text;

        if (message.stop_reason !== "tool_use") break;

        // Exécuter chaque appel query_workspace et renvoyer les résultats.
        const toolUses = message.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );
        if (toolUses.length === 0) break;

        messages.push({ role: "assistant", content: message.content });

        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          let result: Record<string, unknown>;
          if (tu.name === "app_collections") {
            const collections = await listAppCollections(supabase, tenantId);
            result = { count: collections.length, collections };
          } else if (tu.name === "app_data_list") {
            const a = (tu.input ?? {}) as { collection?: string; match?: Record<string, unknown>; limit?: number };
            result = (await listAppRecords(supabase, tenantId, a.collection ?? "", {
              match: a.match,
              limit: a.limit,
            })) as Record<string, unknown>;
          } else {
            const args = (tu.input ?? {}) as QueryArgs;
            if (args.entity) queried.add(args.entity);
            result = await runQuery(supabase, tenantId, args);
          }
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(result).slice(0, 60000),
          });
        }
        messages.push({ role: "user", content: results });
      }
    } catch (err) {
      await refund();
      throw err;
    }

    if (!answer) {
      await refund();
      return Response.json(
        { error: "Réponse vide. Réessayez — votre crédit a été remboursé." },
        { status: 502 }
      );
    }

    // Tracking + réconciliation du hold au coût réel (best-effort).
    let creditsUsed = HOLD;
    try {
      const realCredits = await trackAiUsage({
        supabase,
        userId: user.id,
        tenantId,
        action: "ask",
        model: MODEL,
        inputTokens: inTok,
        outputTokens: outTok,
        agent: route.agent,
        sector: sector ?? undefined,
      });
      if (founder) {
        creditsUsed = 0; // journalisé pour le suivi des coûts, jamais débité
      } else {
        await reconcileCredits(supabase, createAdminClient(), user.id, HOLD, realCredits);
        creditsUsed = realCredits;
      }
    } catch {
      // ignore
    }

    // Sujet de la question (heuristique gratuite) → data admin « sur quoi les
    // pros posent des questions ». Best-effort, jamais bloquant.
    try {
      await supabase.from("app_events").insert({
        user_id: user.id,
        tenant_id: tenantId,
        event_type: "question_asked",
        agent: route.agent,
        sector,
        prompt_length: question.length,
        metadata: { topic: classifyQuestionTopic(question), question: question.slice(0, 200) },
      });
    } catch {
      // le tracking ne bloque jamais la réponse
    }

    return Response.json({
      answer,
      sources: dedupeSources(chunks),
      ragUsed: chunks.length > 0,
      queried: [...queried],
      creditsUsed,
    });
  } catch (err) {
    console.error("Ask error:", err);
    let msg = "Erreur. Réessayez.";
    let status = 500;
    if (err instanceof Anthropic.APIError) {
      status = err.status ?? 500;
      if (err.status === 429) msg = "Trop de requêtes. Patientez quelques secondes.";
      else msg = `Erreur Anthropic (${err.status}).`;
    }
    return Response.json({ error: msg }, { status });
  }
}
