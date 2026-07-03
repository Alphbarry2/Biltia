// ─────────────────────────────────────────────────────────────────────────────
// /api/analyze — ANALYSE DE DOCUMENTS (produit « Analyse de documents »).
//
// L'utilisateur joint un ou plusieurs fichiers (PDF, image) à la barre /generate.
// Claude Sonnet les lit nativement, en extrait l'essentiel (montants, échéances,
// références, lignes) et répond à la question éventuelle. RIEN n'est écrit en
// base : le résultat est un APERÇU. L'UI propose ensuite « Enregistrer dans le
// workspace » (→ /api/data), conformément à la décision produit.
//
// Coûte 1 crédit par document (remboursé si l'analyse échoue).
// Ossature calquée sur app/api/ask/route.ts.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { trackAiUsage } from "@/lib/ai-usage";
import {
  VISION_MODEL,
  EXTRACT_TOOL,
  buildFileBlocks,
  validateFiles,
  coerceExtraction,
  ValidationError,
} from "@/lib/vision";

const client = new Anthropic();
const MAX_TOKENS = 2000;

// Outil dédié à l'analyse : l'extraction structurée (partagée avec /automate) +
// une réponse libre à la question de l'utilisateur, en un seul appel forcé.
const ANALYZE_TOOL: Anthropic.Tool = {
  name: "analyze_document",
  description:
    "Extrait les informations clés du/des document(s) fourni(s) et répond à la question de l'utilisateur si elle est posée.",
  input_schema: {
    type: "object",
    properties: {
      ...(EXTRACT_TOOL.input_schema.properties as Record<string, unknown>),
      reponse: {
        type: "string",
        description:
          "Réponse à la question de l'utilisateur, appuyée UNIQUEMENT sur le contenu des documents. Chaîne vide si aucune question n'est posée.",
      },
    },
    required: [
      ...((EXTRACT_TOOL.input_schema.required as string[]) ?? []),
      "reponse",
    ],
    additionalProperties: false,
  },
};

function buildSystem(): string {
  return `Tu es l'analyste documentaire de Batify, expert du BTP français. On te fournit un ou plusieurs documents (devis, facture, bon de livraison, courrier, plan, attestation…). Tu les LIS et tu en extrais fidèlement l'essentiel.

RÈGLES ABSOLUES :
- N'invente JAMAIS une valeur. Si une information n'est pas visible dans le document, mets null (ou chaîne vide pour la réponse).
- Montants en euros, nombres bruts (ex : 1234.56, sans symbole ni espace).
- Dates au format AAAA-MM-JJ quand c'est possible.
- Le résumé fait 1-2 phrases, factuelles.
- Si l'utilisateur pose une question, réponds-y de façon concise dans "reponse", en te basant strictement sur les documents.

Réponds UNIQUEMENT en appelant l'outil analyze_document.`;
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

    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null)
      .limit(1)
      .single();
    if (!membership) {
      return Response.json({ error: "Aucun espace de travail trouvé." }, { status: 403 });
    }
    const tenantId = membership.tenant_id;

    let body: { files?: unknown; question?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    // Validation des fichiers (types, nombre, taille) → 400 explicite.
    let files;
    try {
      files = validateFiles(body.files);
    } catch (e) {
      if (e instanceof ValidationError) {
        return Response.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const question = typeof body.question === "string" ? body.question.trim().slice(0, 2000) : "";

    // 1 crédit par document (remboursé si échec).
    const creditCost = files.length;
    const { data: credited } = await supabase.rpc("deduct_credits", { p_amount: creditCost });
    if (!credited) {
      return Response.json(
        { error: "Crédits insuffisants. Rechargez votre compte pour continuer." },
        { status: 402 }
      );
    }

    async function refund() {
      const admin = createAdminClient();
      if (admin) {
        try {
          await admin.rpc("refund_credits", { p_user_id: user!.id, p_amount: creditCost });
        } catch (err) {
          console.error("Refund failed after analyze error:", err);
        }
      }
    }

    const userBlocks = buildFileBlocks(files);
    userBlocks.push({
      type: "text",
      text: question
        ? `Analyse le(s) document(s) ci-dessus et réponds à cette question : « ${question} »`
        : "Analyse le(s) document(s) ci-dessus et extrais-en l'essentiel.",
    });

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystem(),
        tools: [ANALYZE_TOOL],
        tool_choice: { type: "tool", name: "analyze_document" },
        messages: [{ role: "user", content: userBlocks }],
      });
    } catch (err) {
      await refund();
      throw err;
    }

    const toolBlock = message.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      await refund();
      return Response.json(
        { error: "L'analyse n'a rien renvoyé. Réessayez — vos crédits ont été remboursés." },
        { status: 502 }
      );
    }

    const input = toolBlock.input as Record<string, unknown>;
    const extraction = coerceExtraction(input);
    const answer = typeof input.reponse === "string" ? input.reponse.trim() : "";

    // Tracking best-effort (ne bloque jamais la réponse).
    try {
      await trackAiUsage({
        supabase,
        userId: user.id,
        tenantId,
        action: "analyze",
        model: VISION_MODEL,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      });
    } catch {
      // ignore
    }

    return Response.json({
      kind: "analysis",
      extraction,
      answer,
      fileCount: files.length,
      creditsUsed: creditCost,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    let msg = "Erreur d'analyse. Réessayez.";
    let status = 500;
    if (err instanceof Anthropic.APIError) {
      status = err.status ?? 500;
      if (err.status === 429) msg = "Trop de requêtes. Patientez quelques secondes.";
      else if (err.status === 401) msg = "Clé API Anthropic invalide.";
      else msg = `Erreur Anthropic (${err.status}).`;
    }
    return Response.json({ error: msg }, { status });
  }
}
