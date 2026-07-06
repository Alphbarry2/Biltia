// ─────────────────────────────────────────────────────────────────────────────
// /api/automate — AUTOMATISATIONS / TRAITEMENT PAR LOT (produit « Automatisations »).
//
// L'utilisateur joint PLUSIEURS fichiers (bons de livraison, factures, devis…) et
// décrit un contrôle (« vérifie les prix », « détecte les doublons »). Claude lit
// tout le lot en une passe et produit un RAPPORT structuré : un résumé par fichier
// + une liste d'anomalies (doublons, incohérences de prix, références inconnues,
// totaux erronés, écarts de dates).
//
// Périmètre : comparaison des documents ENTRE EUX (pas d'accès à une base externe
// de devis structurés — le schéma actuel ne stocke pas les lignes de devis).
//
// Coûte 1 crédit par fichier (remboursé si l'analyse échoue).
// Ossature calquée sur app/api/analyze/route.ts.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { trackAiUsage, reconcileCredits } from "@/lib/ai-usage";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { can } from "@/lib/permissions";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, FROZEN_MESSAGE } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { logActivity } from "@/lib/activity";
import { VISION_MODEL, buildFileBlocks, validateFiles, ValidationError } from "@/lib/vision";

const client = new Anthropic();
const MAX_TOKENS = 3000;

const REPORT_TOOL: Anthropic.Tool = {
  name: "build_report",
  description:
    "Produit le rapport de contrôle du lot de documents : un résumé par fichier et la liste des anomalies détectées.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Un élément par fichier fourni.",
        items: {
          type: "object",
          properties: {
            fichier: { type: "string", description: "Nom du fichier." },
            resume: { type: "string", description: "Résumé factuel court (nature, émetteur, montant/référence clés)." },
          },
          required: ["fichier", "resume"],
          additionalProperties: false,
        },
      },
      anomalies: {
        type: "array",
        description: "Anomalies détectées selon l'instruction de contrôle. Vide si aucune.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description:
                "Catégorie : doublon, prix_incoherent, reference_inconnue, montant_incoherent, ecart_date, autre.",
            },
            gravite: { type: "string", description: "haute, moyenne ou basse." },
            detail: { type: "string", description: "Description précise et actionnable de l'anomalie." },
            fichiers: {
              type: "array",
              items: { type: "string" },
              description: "Noms des fichiers concernés.",
            },
          },
          required: ["type", "gravite", "detail", "fichiers"],
          additionalProperties: false,
        },
      },
      synthese: {
        type: "string",
        description: "Synthèse en 1-2 phrases : ce qui a été contrôlé et le verdict global.",
      },
    },
    required: ["items", "anomalies", "synthese"],
    additionalProperties: false,
  },
};

function buildSystem(): string {
  return `Tu es le contrôleur qualité de Biltia, expert du BTP français. On te fournit un LOT de documents (bons de livraison, factures, devis, courriers…) et une instruction de contrôle. Tu les lis TOUS et tu produis un rapport.

CE QUE TU VÉRIFIES (selon l'instruction) :
- Doublons : même numéro/référence, ou même émetteur + même montant + même date.
- Incohérences de prix : un même article/prestation facturé à des prix unitaires différents d'un document à l'autre.
- Références inconnues ou manquantes : n° de commande/BL absent ou incohérent.
- Totaux erronés : la somme des lignes ne correspond pas au total affiché.
- Écarts de dates : échéances dépassées, dates incohérentes.

RÈGLES ABSOLUES :
- Tu compares les documents ENTRE EUX. Tu n'as PAS accès à une base externe : si l'instruction demande de comparer à des données que tu n'as pas (ex : « mes devis » non fournis), signale-le honnêtement dans la synthèse plutôt que d'inventer.
- N'invente jamais une anomalie. En cas de doute, ne la signale pas.
- Sois précis et actionnable : cite les fichiers et les valeurs concernés.
- Montants en euros.

Réponds UNIQUEMENT en appelant l'outil build_report.`;
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
    const limited = await enforceRateLimit("automate", user.id, LIMITS.automate);
    if (limited) return limited;

    const membership = await getActiveMembershipServer(supabase, user.id);
    if (!membership) {
      return Response.json({ error: "Aucun espace de travail trouvé." }, { status: 403 });
    }
    const tenantId = membership.tenant_id;

    // RBAC : une automatisation crée un livrable → réservé aux rôles qui peuvent
    // créer (un lecteur est en lecture seule).
    if (!can(membership.role, "ai.create")) {
      return Response.json(
        { error: "Vous êtes en lecture seule sur cet espace. Demandez à un administrateur les droits pour lancer une automatisation." },
        { status: 403 }
      );
    }

    // GEL LECTURE SEULE : un abonnement expiré ne peut plus lancer d'automatisation.
    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) {
      return Response.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
    }

    let body: { files?: unknown; instruction?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    let files;
    try {
      files = validateFiles(body.files);
    } catch (e) {
      if (e instanceof ValidationError) {
        return Response.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const instruction =
      typeof body.instruction === "string" && body.instruction.trim()
        ? body.instruction.trim().slice(0, 2000)
        : "Contrôle ce lot : détecte doublons, incohérences de prix et totaux erronés.";

    // Pré-autorisation (hold) par fichier, réconciliée au coût réel après le contrôle.
    // Compte fondateur : jamais de hold ni de débit (usage journalisé quand même).
    const founder = isFounderEmail(user.email);
    const HOLD = founder ? 0 : 25 * files.length;
    if (HOLD > 0) {
      const { data: credited } = await supabase.rpc("deduct_credits", { p_amount: HOLD });
      if (!credited) {
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
          console.error("Refund failed after automate error:", err);
        }
      }
    }

    const userBlocks = buildFileBlocks(files);
    userBlocks.push({
      type: "text",
      text: `Instruction de contrôle : « ${instruction} »\n\nContrôle les ${files.length} documents ci-dessus et produis le rapport.`,
    });

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystem(),
        tools: [REPORT_TOOL],
        tool_choice: { type: "tool", name: "build_report" },
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
        { error: "Le contrôle n'a rien renvoyé. Réessayez — vos crédits ont été remboursés." },
        { status: 502 }
      );
    }

    const input = toolBlock.input as {
      items?: unknown;
      anomalies?: unknown;
      synthese?: unknown;
    };

    const items = Array.isArray(input.items)
      ? input.items.map((it) => {
          const r = (it ?? {}) as Record<string, unknown>;
          return {
            fichier: typeof r.fichier === "string" ? r.fichier : "—",
            resume: typeof r.resume === "string" ? r.resume : "",
          };
        })
      : [];

    const anomalies = Array.isArray(input.anomalies)
      ? input.anomalies.map((a) => {
          const r = (a ?? {}) as Record<string, unknown>;
          return {
            type: typeof r.type === "string" ? r.type : "autre",
            gravite: typeof r.gravite === "string" ? r.gravite : "moyenne",
            detail: typeof r.detail === "string" ? r.detail : "",
            fichiers: Array.isArray(r.fichiers) ? r.fichiers.filter((f): f is string => typeof f === "string") : [],
          };
        })
      : [];

    const answer = typeof input.synthese === "string" ? input.synthese.trim() : "";

    let realCredits = HOLD;
    try {
      const tracked = await trackAiUsage({
        supabase,
        userId: user.id,
        tenantId,
        action: "automate",
        model: VISION_MODEL,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      });
      if (founder) {
        realCredits = 0; // journalisé pour le suivi des coûts, jamais débité
      } else {
        realCredits = tracked;
        await reconcileCredits(supabase, createAdminClient(), user.id, HOLD, realCredits);
      }
    } catch {
      // ignore
    }

    await logActivity(supabase, {
      tenantId,
      userId: user.id,
      action: "document",
      entityType: "contrôle",
      description: `Contrôle par lot : ${files.length} fichier(s), ${anomalies.length} anomalie(s) détectée(s)`,
    });

    return Response.json({
      kind: "report",
      items,
      anomalies,
      answer,
      fileCount: files.length,
      creditsUsed: realCredits,
    });
  } catch (err) {
    console.error("Automate error:", err);
    let msg = "Erreur de contrôle. Réessayez.";
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
