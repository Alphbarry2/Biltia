// ─────────────────────────────────────────────────────────────────────────────
// /api/analyze — ANALYSE DE DOCUMENTS (produit « Analyse de documents »).
//
// L'utilisateur joint un ou plusieurs fichiers (PDF, image) à la barre /generate.
// Claude Sonnet les lit nativement, en extrait l'essentiel (montants, échéances,
// références, lignes) et répond à la question éventuelle. RIEN n'est écrit en
// base : le résultat est un APERÇU. L'UI propose ensuite « Enregistrer dans le
// workspace » (→ /api/data), conformément à la décision produit.
//
// Coûte ACTION_CREDITS.lecture_fichier PAR FICHIER (remboursé si l'analyse échoue).
// Ossature calquée sur app/api/ask/route.ts.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { client, hasAnyLlmKey, realCostOf } from "@/lib/llm";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { trackAiUsage, reconcileCredits } from "@/lib/ai-usage";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { logActivity } from "@/lib/activity";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";
import { withLocale } from "@/lib/i18n/llm";
import { getSectorContext } from "@/lib/sector-context";
import {
  VISION_MODEL,
  EXTRACT_TOOL,
  buildFileBlocks,
  validateFiles,
  coerceExtraction,
  ValidationError,
} from "@/lib/vision";
import { ACTION_CREDITS } from "@/lib/plans";

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
      comptages: {
        type: "array",
        description:
          "Si l'utilisateur demande un COMPTAGE ou un INVENTAIRE (combien de prises / portes / pièces / points lumineux…), une entrée par catégorie comptée, avec un niveau de confiance. Tableau vide sinon.",
        items: {
          type: "object",
          properties: {
            libelle: { type: "string", description: "Ce qui est compté (ex : prises, portes, pièces)." },
            quantite: { type: "number", description: "Nombre détecté." },
            confiance: {
              type: "string",
              enum: ["elevee", "moyenne", "faible"],
              description: "Confiance de CE comptage.",
            },
          },
          required: ["libelle", "quantite", "confiance"],
          additionalProperties: false,
        },
      },
      elements_incertains: {
        type: "array",
        description:
          "Éléments que tu n'es PAS sûr d'avoir bien identifiés ou comptés — l'utilisateur doit les VÉRIFIER. Tableau vide si tout est certain.",
        items: {
          type: "object",
          properties: {
            libelle: { type: "string", description: "L'élément incertain (ex : « symbole ambigu près de la cuisine »)." },
            raison: { type: "string", description: "Pourquoi c'est incertain (symbole illisible, chevauchement, ambiguïté…)." },
          },
          required: ["libelle", "raison"],
          additionalProperties: false,
        },
      },
      confiance: {
        type: "string",
        enum: ["elevee", "moyenne", "faible"],
        description: "Niveau de confiance GLOBAL de ta réponse/analyse.",
      },
      propositions: {
        type: "array",
        description:
          "1 à 3 actions CONCRÈTES que Biltia peut faire avec CE document précis, maintenant que tu l'as LU. Tableau vide si le document ne s'y prête vraiment pas. L'utilisateur les verra comme des cartes cliquables.",
        items: {
          type: "object",
          properties: {
            titre: {
              type: "string",
              description: "≤ 48 caractères, orienté RÉSULTAT (ex : « App de métré + matériaux »).",
            },
            description: {
              type: "string",
              description: "≤ 90 caractères : ce que ça produit concrètement pour lui.",
            },
            action: {
              type: "string",
              enum: ["module", "document", "extract"],
              description:
                "module = créer une APPLICATION ; document = produire un DOCUMENT fini (devis, courrier…) ; extract = enregistrer les données lues dans le workspace.",
            },
            prompt: {
              type: "string",
              description:
                "La consigne COMPLÈTE à exécuter, rédigée comme si l'utilisateur la dictait (« Crée une application de métré à partir de ce plan : … »). Autonome et précise : elle sera envoyée telle quelle au générateur.",
            },
          },
          required: ["titre", "description", "action", "prompt"],
          additionalProperties: false,
        },
      },
    },
    required: [
      ...((EXTRACT_TOOL.input_schema.required as string[]) ?? []),
      "reponse",
      "comptages",
      "elements_incertains",
      "confiance",
      "propositions",
    ],
    additionalProperties: false,
  },
};

function buildSystem(sectorBlock: string): string {
  const sector = sectorBlock ? `\n\n${sectorBlock}\n` : "";
  return `Tu es l'analyste documentaire de Biltia, expert du BTP français. On te fournit un ou plusieurs documents (devis, facture, bon de livraison, courrier, plan, attestation…). Tu les LIS et tu en extrais fidèlement l'essentiel.${sector}

RÈGLES ABSOLUES :
- N'invente JAMAIS une valeur. Si une information n'est pas visible dans le document, mets null (ou chaîne vide pour la réponse).
- Montants en euros, nombres bruts (ex : 1234.56, sans symbole ni espace).
- Dates au format AAAA-MM-JJ quand c'est possible.
- Le résumé fait 1-2 phrases, factuelles.
- Si l'utilisateur pose une question, réponds-y de façon concise dans "reponse", en te basant strictement sur les documents.

FIABILITÉ (crucial — un artisan agit sur ta réponse) :
- COMPTAGE / INVENTAIRE (« combien de prises / portes / pièces / points lumineux… ») : remplis "comptages" avec, PAR catégorie, la quantité ET un niveau de confiance (elevee|moyenne|faible). Ne donne JAMAIS un nombre sec comme s'il était certain.
- Liste dans "elements_incertains" TOUT ce dont tu n'es pas sûr (symbole ambigu, zone illisible, éléments qui se chevauchent) — ce sont les points précis que l'artisan doit vérifier.
- Renseigne "confiance" (globale). Sur un plan dense, photographié ou scanné, sois HONNÊTE : mieux vaut "moyenne" + des éléments à vérifier qu'une fausse certitude.
- Quand c'est un comptage, formule "reponse" ainsi : « J'ai détecté X … (confiance élevée/moyenne/faible). N élément(s) à vérifier. »

PROPOSER LA SUITE (champ "propositions") — TU AS LU LE DOCUMENT, SOIS AUTONOME :
Un artisan qui dépose un document ne veut pas juste un résumé : il veut ne PLUS JAMAIS repartir d'une feuille blanche le soir en rentrant du chantier. Tu viens de LIRE ce document. Maintenant, RÉFLÉCHIS PAR TOI-MÊME : compte tenu de ce qu'il y a RÉELLEMENT dedans ET DU MÉTIER DE CET ARTISAN, qu'est-ce qui lui serait VRAIMENT utile ?

Tu n'es enfermé dans AUCUNE liste. Tu connais le BTP, tu connais son métier, tu as lu son document : décide toi-même. Propose 1 à 3 actions concrètes, taillées pour CE document et CE métier.

Les 3 leviers dont tu disposes :
- "module" — une APPLICATION quand le document contient de la MATIÈRE à exploiter dans la durée (des lignes, des postes, des pièces, des quantités, des échéances, un suivi à tenir). C'est le levier le plus puissant : le document devient un outil vivant, avec des formules qui recalculent.
- "document" — un LIVRABLE fini quand le document APPELLE une réponse ou une suite (un courrier reçu → la réponse ; un devis accepté → la facture ; un désordre constaté → le PV).
- "extract" — enregistrer les données lues dans le workspace quand le document est une PIÈCE à archiver et relier (devis, facture, bon de livraison, attestation).

EXEMPLE (un seul, pour te montrer le NIVEAU d'exigence attendu — surtout ne t'y limite pas) : un PLAN déposé par un artisan devient une app de MÉTRÉ, avec une ligne par pièce lue sur le plan et des formules vivantes. Mais les POSTES MÉTRÉS sont CEUX DE SON MÉTIER : un électricien veut ses points lumineux / prises / interrupteurs / circuits / tableau / longueurs de gaine, PAS des m² de peinture. Un plombier veut ses points d'eau / évacuations / radiateurs. Applique cette même exigence à TOUT type de document.

RÈGLES :
- Le champ "prompt" est la consigne COMPLÈTE, autonome, prête à être exécutée telle quelle par le générateur : dis précisément ce que l'app (ou le document) doit contenir, dans le vocabulaire DE SON MÉTIER.
- Une proposition doit être SPÉCIFIQUE à ce document. Jamais du passe-partout (« créer une app de gestion »).
- Si le document ne se prête honnêtement à rien de plus qu'une lecture, renvoie un tableau VIDE. Ne force JAMAIS une proposition creuse : une mauvaise proposition lui coûte des crédits et sa confiance.

Réponds UNIQUEMENT en appelant l'outil analyze_document.`;
}

// DURÉE MAXIMALE — explicite. Sans borne déclarée, la limite venait du réglage
// projet Vercel (invisible depuis le dépôt). Une fonction tuée par le timeout
// n'exécute PAS son `catch` de remboursement : le hold de crédits est perdu sans
// que l'utilisateur en soit informé. On fige donc la valeur.
export const maxDuration = 120;

export async function POST(req: Request) {
  const locale = await getLocale();
  try {
    if (!hasAnyLlmKey()) {
      return Response.json(
        { error: pick(locale, "Clé API Anthropic non configurée.", "Anthropic API key not configured.") },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json(
        { error: pick(locale, "Authentification requise.", "Authentication required.") },
        { status: 401 }
      );
    }

    // Rate limiting : rejette un flood au plus tôt (avant toute lecture DB).
    const limited = await enforceRateLimit("analyze", user.id, LIMITS.analyze);
    if (limited) return limited;

    const membership = await getActiveMembershipServer(supabase, user.id);
    if (!membership) {
      return Response.json(
        { error: pick(locale, "Aucun espace de travail trouvé.", "No workspace found.") },
        { status: 403 }
      );
    }
    const tenantId = membership.tenant_id;

    // GEL LECTURE SEULE : un abonnement expiré ne peut plus lancer d'analyse IA.
    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) {
      return Response.json({ error: frozenMessage(locale), frozen: true }, { status: 403 });
    }

    let body: { files?: unknown; question?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
        { status: 400 }
      );
    }

    // Validation des fichiers (types, nombre, taille) → 400 explicite.
    let files;
    try {
      files = validateFiles(body.files, locale);
    } catch (e) {
      if (e instanceof ValidationError) {
        return Response.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const question = typeof body.question === "string" ? body.question.trim().slice(0, 2000) : "";

    // Pré-autorisation (hold) par fichier, réconciliée au coût réel après l'analyse.
    // Compte fondateur : jamais de hold ni de débit (usage journalisé quand même).
    const founder = isFounderEmail(user.email);
    const HOLD = founder ? 0 : ACTION_CREDITS.lecture_fichier * files.length;
    if (HOLD > 0) {
      const { data: credited } = await supabase.rpc("deduct_credits", { p_amount: HOLD });
      if (!credited) {
        return Response.json(
          {
            error: pick(
              locale,
              "Crédits insuffisants. Rechargez votre compte pour continuer.",
              "Not enough credits. Top up your account to continue."
            ),
          },
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
          console.error("Refund failed after analyze error:", err);
        }
      }
    }

    // LE MÉTIER DE L'ARTISAN pilote les propositions : un électricien qui dépose
    // un plan doit se voir proposer un métré ÉLECTRIQUE (points lumineux, prises,
    // circuits), pas un métré peinture. Jamais bloquant (repli = bloc vide).
    const sectorCtx = await getSectorContext(supabase, user.id, locale);

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
        system: withLocale(buildSystem(sectorCtx.block), locale),
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
        {
          error: pick(
            locale,
            "L'analyse n'a rien renvoyé. Réessayez — vos crédits ont été remboursés.",
            "The analysis returned nothing. Please try again — your credits have been refunded."
          ),
        },
        { status: 502 }
      );
    }

    const input = toolBlock.input as Record<string, unknown>;
    const extraction = coerceExtraction(input);
    const answer = typeof input.reponse === "string" ? input.reponse.trim() : "";

    // Fiabilité : comptages (quantité + confiance) + éléments à vérifier + confiance globale.
    type Conf = "elevee" | "moyenne" | "faible";
    const asConf = (v: unknown): Conf | null =>
      v === "elevee" || v === "moyenne" || v === "faible" ? v : null;
    const comptages = (Array.isArray(input.comptages) ? input.comptages : [])
      .map((c) => {
        const r = (c ?? {}) as Record<string, unknown>;
        const libelle = typeof r.libelle === "string" ? r.libelle.trim() : "";
        const quantite = typeof r.quantite === "number" && Number.isFinite(r.quantite) ? r.quantite : null;
        if (!libelle || quantite === null) return null;
        return { libelle, quantite, confiance: asConf(r.confiance) ?? "moyenne" };
      })
      .filter((x): x is { libelle: string; quantite: number; confiance: Conf } => x !== null);
    const incertitudes = (Array.isArray(input.elements_incertains) ? input.elements_incertains : [])
      .map((e) => {
        const r = (e ?? {}) as Record<string, unknown>;
        const libelle = typeof r.libelle === "string" ? r.libelle.trim() : "";
        if (!libelle) return null;
        return { libelle, raison: typeof r.raison === "string" ? r.raison.trim() : "" };
      })
      .filter((x): x is { libelle: string; raison: string } => x !== null);
    const confiance = asConf(input.confiance);

    // Propositions cliquables : ce que Biltia sait tirer de CE document, une fois
    // lu (une app de métré depuis un plan, une app de gestion depuis un tableau,
    // un document depuis un courrier…). L'app ne part QU'AU CLIC : jamais de
    // le prix d'une app dépensé par surprise sur un simple dépôt de fichier.
    const propositions = (Array.isArray(input.propositions) ? input.propositions : [])
      .map((p) => {
        const r = (p ?? {}) as Record<string, unknown>;
        const titre = typeof r.titre === "string" ? r.titre.trim().slice(0, 60) : "";
        const prompt = typeof r.prompt === "string" ? r.prompt.trim().slice(0, 1200) : "";
        const action = r.action === "module" || r.action === "document" || r.action === "extract" ? r.action : null;
        if (!titre || !prompt || !action) return null;
        return {
          titre,
          description: typeof r.description === "string" ? r.description.trim().slice(0, 120) : "",
          action,
          prompt,
        };
      })
      .filter(
        (x): x is { titre: string; description: string; action: "module" | "document" | "extract"; prompt: string } =>
          x !== null
      )
      .slice(0, 3);

    // Tracking (best-effort). `billedCredits` DOIT valoir le HOLD réellement
    // prélevé : sans lui, trackAiUsage retombait sur le coût du modèle et rendait
    // ~2 crédits là où 10 avaient été débités. On journalisait donc un chiffre, on
    // en prélevait un autre, et `creditsUsed` (renvoyé au client, plus bas)
    // AFFICHAIT le mauvais : le solde baissait de 10, le reçu disait 2.
    let realCredits = HOLD;
    try {
      const tracked = await trackAiUsage({
        supabase,
        userId: user.id,
        tenantId,
        action: "analyze",
        model: VISION_MODEL,
        inputTokens: message.usage.input_tokens,
        // Le RELEVÉ prime sur le catalogue (cf. lib/ai-usage.ts) : c'est lui qui
        // permet de SURVEILLER la marge — il ne la pilote plus.
        realCostUsd: realCostOf(message.usage),
        outputTokens: message.usage.output_tokens,
        billedCredits: HOLD,
      });
      if (founder) {
        realCredits = 0; // journalisé pour le suivi des coûts, jamais débité
      } else {
        realCredits = tracked;
        // Plus de réconciliation à la BAISSE : le client paie la grille.
      }
    } catch {
      // ignore
    }

    await logActivity(supabase, {
      tenantId,
      userId: user.id,
      action: "document",
      entityType: "analyse",
      description: `Analyse IA : ${files.length} document(s) (${files.map((f) => f.name).join(", ").slice(0, 120)})`,
    });

    return Response.json({
      kind: "analysis",
      extraction,
      answer,
      comptages,
      incertitudes,
      confiance,
      propositions,
      fileCount: files.length,
      creditsUsed: realCredits,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    let msg = pick(locale, "Erreur d'analyse. Réessayez.", "Analysis failed. Please try again.");
    let status = 500;
    if (err instanceof Anthropic.APIError) {
      status = err.status ?? 500;
      if (err.status === 429)
        msg = pick(locale, "Trop de requêtes. Patientez quelques secondes.", "Too many requests. Wait a few seconds.");
      else if (err.status === 401)
        msg = pick(locale, "Clé API Anthropic invalide.", "Invalid Anthropic API key.");
      else msg = pick(locale, `Erreur Anthropic (${err.status}).`, `Anthropic error (${err.status}).`);
    }
    return Response.json({ error: msg }, { status });
  }
}
