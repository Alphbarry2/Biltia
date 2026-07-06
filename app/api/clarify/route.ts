import Anthropic from "@anthropic-ai/sdk";
import { TIER_SIMPLE } from "@/lib/models";
import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { trackAiUsage } from "@/lib/ai-usage";
import { classifyKind } from "@/lib/kind-router";
import {
  type ClarifyQuestion,
  DEVICE_QUESTION,
  THEME_QUESTION,
  LAYOUT_QUESTION,
  FALLBACK_SPECIFIC,
} from "@/lib/clarify-questions";

// ─────────────────────────────────────────────────────────────────────────────
// /api/clarify — questions préalables à la création d'une app (façon Lovable).
// Ordre fixe : 1) Device  2) 1-2 questions LLM  3) Palette couleurs  4) Layout
// Total ≤ 5 questions. Le widget les affiche avec palettes visuelles et
// aperçus wireframe. La question layout est filtrée par device côté client.
//
// LATENCE BORNÉE : l'appel Haiku est plafonné à 4 s — au-delà, on renvoie les
// questions statiques (lib/clarify-questions.ts). La réponse arrive TOUJOURS
// vite : le questionnaire ne doit jamais être sacrifié pour cause de lenteur.
// ─────────────────────────────────────────────────────────────────────────────

const CLARIFY_MODEL = TIER_SIMPLE;
const LLM_TIMEOUT_MS = 4000;

const PROPOSE_TOOL = {
  name: "propose_questions",
  description: "Propose EXACTEMENT 2 questions spécifiques à la demande pour cadrer l'application.",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: {
          type: "object",
          properties: {
            id:       { type: "string",  description: "slug court (ex: priorite, champs, usage)" },
            question: { type: "string",  description: "La question, en français, vouvoiement, ≤ 120 caractères." },
            multi:    { type: "boolean", description: "true si plusieurs réponses possibles." },
            options: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  value: { type: "string" },
                  label: { type: "string", description: "≤ 40 caractères" },
                  hint:  { type: "string", description: "une ligne d'explication, ≤ 70 caractères" },
                },
                required: ["value", "label"],
              },
            },
          },
          required: ["id", "question", "multi", "options"],
        },
      },
    },
    required: ["questions"],
  },
} as Anthropic.Tool;

const CLARIFY_SYSTEM = `Tu prépares la création d'une application SUR MESURE pour un pro du BTP. À partir de SA demande PRÉCISE, propose EXACTEMENT 2 questions courtes, VRAIMENT SPÉCIFIQUES à ce qu'il veut faire. Interdit : les questions génériques passe-partout. Chaque question doit montrer que tu as COMPRIS sa demande.

Les 2 questions couvrent 2 angles DIFFÉRENTS, adaptés à SON cas :
1. LE BESOIN / L'USAGE RÉEL : ce qu'il veut pouvoir FAIRE ou RETROUVER grâce à l'app (le vrai but derrière la demande).
2. LE CONTENU CONCRET : les informations à saisir/associer à chaque élément, ou qui s'en sert et comment.

Exemple — demande « photographier les bons de livraison pour ne plus les perdre » :
- Q1 : « Que voulez-vous pouvoir faire ensuite avec ces bons ? » → les retrouver par fournisseur / par chantier / les exporter / les relier à une commande.
- Q2 : « Quelles infos noter avec chaque bon ? » → fournisseur, date, n° de commande, chantier concerné, montant.

Ancre-toi dans SON vocabulaire et SON exemple. Les options sont des choix CONCRETS de son métier (jamais « option 1/2 »), chacune avec un hint clair d'une ligne.

RÈGLES : vouvoiement ; EXACTEMENT 2 questions ; pas de jargon ; NE PAS poser de question sur les couleurs, la mise en page ni le support (mobile/desktop) — gérés ailleurs. Réponds UNIQUEMENT via l'outil propose_questions.`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Authentification requise." }, { status: 401 });

  // Rate limiting : rejette un flood au plus tôt.
  const limited = await enforceRateLimit("clarify", user.id, LIMITS.clarify);
  if (limited) return limited;

  let prompt = "";
  try {
    const body = await req.json();
    prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 2000) : "";
  } catch { /* corps vide toléré */ }

  const hasKey = !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");

  // ── AIGUILLAGE D'ABORD ──────────────────────────────────────────────────────
  // Le questionnaire « quel support / quelles colonnes » ne vaut QUE pour une
  // vraie création d'application (module). Le client l'ouvre dès que son
  // heuristique locale hésite (défaut = module) : on confirme donc ici, côté
  // serveur, avec le vrai aiguilleur (Haiku). Si le besoin réel est un AGENT
  // (« envoie un email tous les jours… »), un DOCUMENT/PDF, une RÉPONSE ou un
  // CONTRÔLE de fichiers, on renvoie skipClarify et le client laisse
  // /api/generate router correctement — plus jamais « quel support ? » posé à
  // une mission d'agent. Échec de classif → on continue vers le questionnaire
  // (comportement historique, jamais bloquant).
  if (prompt && hasKey) {
    try {
      const k = await classifyKind({ prompt });
      if (k.usage) {
        try {
          const membership = await getActiveMembershipServer(supabase, user.id);
          if (membership) {
            void trackAiUsage({
              supabase,
              userId: user.id,
              tenantId: membership.tenant_id,
              action: "classify_kind",
              model: k.usage.model,
              inputTokens: k.usage.inputTokens,
              outputTokens: k.usage.outputTokens,
            }).catch(() => {});
          }
        } catch { /* tracking best-effort */ }
      }
      if (k.kind !== "module") {
        return Response.json({ skipClarify: true, kind: k.kind, docType: k.docType });
      }
    } catch { /* classif indisponible → questionnaire d'app (historique) */ }
  }

  let specific: ClarifyQuestion[] = FALLBACK_SPECIFIC;
  let usage: { inputTokens: number; outputTokens: number } | null = null;

  if (prompt && hasKey) {
    try {
      const client = new Anthropic();
      // Course LLM vs délai : jamais plus de 4 s d'attente pour l'utilisateur.
      const message = await Promise.race([
        client.messages.create({
          model: CLARIFY_MODEL,
          max_tokens: 900,
          system: CLARIFY_SYSTEM,
          tools: [PROPOSE_TOOL],
          tool_choice: { type: "tool", name: "propose_questions" },
          messages: [{ role: "user", content: `Demande de l'utilisateur : « ${prompt} »` }],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("clarify-llm-timeout")), LLM_TIMEOUT_MS)
        ),
      ]);
      usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
      const block = message.content.find((b) => b.type === "tool_use");
      if (block && block.type === "tool_use") {
        const input = block.input as { questions?: ClarifyQuestion[] };
        const qs = (input.questions ?? [])
          .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
          .slice(0, 2)
          .map((q) => ({
            id: String(q.id || "q").slice(0, 40),
            question: String(q.question).slice(0, 160),
            multi: !!q.multi,
            options: q.options.slice(0, 4).map((o) => ({
              value: String(o.value).slice(0, 60),
              label: String(o.label).slice(0, 60),
              hint:  o.hint ? String(o.hint).slice(0, 90) : undefined,
            })),
          }));
        if (qs.length) specific = qs;
      }
    } catch { /* timeout ou API indisponible → repli statique silencieux */ }
  }

  // Tracking best-effort du coût du questionnaire (Haiku) : appel API réel qui
  // était jusqu'ici invisible dans ai_usage. Jamais bloquant pour la réponse.
  if (usage) {
    try {
      const membership = await getActiveMembershipServer(supabase, user.id);
      if (membership) {
        void trackAiUsage({
          supabase,
          userId: user.id,
          tenantId: membership.tenant_id,
          action: "clarify",
          model: CLARIFY_MODEL,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        }).catch(() => {});
      }
    } catch { /* tracking best-effort : jamais bloquant */ }
  }

  // Ordre : Device → 2 questions LLM SPÉCIFIQUES à la demande → Palette → Layout.
  // Priorité à la PERTINENCE : les 2 questions ciblées (vrai besoin + contenu
  // concret) remplacent l'ancienne question « données » générique — le besoin en
  // données est de toute façon auto-détecté à la génération (entités connectées).
  const questions = [DEVICE_QUESTION, ...specific.slice(0, 2), THEME_QUESTION, LAYOUT_QUESTION];
  return Response.json({ questions });
}
