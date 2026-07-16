import Anthropic from "@anthropic-ai/sdk";
import { client, hasKeyFor } from "@/lib/llm";
import { TIER_SIMPLE } from "@/lib/models";
import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { trackAiUsage } from "@/lib/ai-usage";
import { classifyKind } from "@/lib/kind-router";
import {
  type ClarifyQuestion,
  dataQuestion,
  workspaceScopeQuestion,
  themeQuestion,
  fallbackSpecific,
} from "@/lib/clarify-questions";
import { getLocale } from "@/lib/i18n/server";
import { withLocale } from "@/lib/i18n/llm";
import { getSectorContext } from "@/lib/sector-context";

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

// COMPRÉHENSION AVANT VITESSE (2026-07-07) : les questions préalables sont
// rédigées par Sonnet 5 (pas Haiku) et on lui laisse le temps de réfléchir
// (12 s). Des questions pertinentes valent mieux que des questions rapides mais
// génériques — le repli statique reste là si le modèle dépasse le délai.
// La clarification est une tâche COURTE et structurée (un appel d'outil, 900 tokens).
// Elle n'a rien à faire sur le palier lourd : mesuré, DeepSeek Pro met 12,0 s et perd
// la course contre le chronomètre → repli statique → questions génériques. Le palier
// SIMPLE répond en ~5 s avec des questions tout aussi pertinentes.
const CLARIFY_MODEL = TIER_SIMPLE;
// Marge de sécurité : un dépassement ne casse rien, il DÉGRADE en silence (questions
// figées). Mieux vaut 1 s d'attente de plus qu'un questionnaire hors sujet.
const LLM_TIMEOUT_MS = 20000;

const PLAN_TOOL = {
  name: "plan_clarification",
  description:
    "Choisit ENTRE 1 ET 3 questions à poser AVANT de créer l'app, sur son contenu/besoin réel (jamais 0, jamais plus de 3). Le nombre dépend de ce que la demande précise déjà.",
  input_schema: {
    type: "object",
    properties: {
      ask_data_source: {
        type: "boolean",
        description:
          "true SEULEMENT si la demande n'indique pas D'OÙ viennent les données (workspace existant / import de fichier / partir de zéro). false si l'utilisateur l'a déjà précisé.",
      },
      ask_style: {
        type: "boolean",
        description:
          "true SEULEMENT si AUCUNE couleur ni ambiance visuelle n'est indiquée dans la demande. false si une couleur/un style est déjà donné.",
      },
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        description:
          "1 à 3 questions VRAIMENT utiles sur le besoin ou le contenu — JAMAIS vide, JAMAIS plus de 3. 1 seule si la demande est déjà très détaillée (pages/contenu déjà décrits, il ne reste qu'un point à affiner) ; 3 si la demande est vague (juste le sujet, sans détail sur les pages/le contenu). Jamais de question sur les couleurs, la mise en page, le support ni la source des données.",
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
    required: ["ask_data_source", "ask_style", "questions"],
  },
} as Anthropic.Tool;

const CLARIFY_SYSTEM = `Tu prépares la création d'une application SUR MESURE pour un pro du BTP. Ton rôle : CLARIFIER la demande avant de construire, avec entre 1 et 3 questions sur son contenu/besoin réel.

RÈGLE D'OR : pose TOUJOURS au moins 1 question sur le contenu/besoin réel de l'app — JAMAIS 0, JAMAIS plus de 3. On ne construit JAMAIS à l'aveugle, mais on n'embête pas non plus un utilisateur déjà précis avec des questions inutiles : le NOMBRE de questions (1, 2 ou 3) doit refléter FIDÈLEMENT ce qu'il manque, pas un chiffre fixe.

Choisis le nombre de questions selon ce que la demande précise DÉJÀ :
- DÉJÀ TRÈS DÉTAILLÉE (les pages/écrans souhaités et le contenu principal sont déjà décrits) → 1 SEULE question, pour affiner le point le plus important qui reste flou (ex: une priorité, un détail de contenu manquant).
- BUT CLAIR mais le CONTENU reste vague (on sait ce que l'app doit faire, mais pas ce qu'elle doit précisément afficher/suivre) → 2 questions.
- VAGUE (juste le sujet, ex: « une app de suivi de chantier » sans rien de plus) → 3 questions qui couvrent les pages/écrans voulus, le contenu/les infos à suivre en priorité, et un point métier clé (ex: équipes, statuts, notifications).

Exemple DÉJÀ TRÈS DÉTAILLÉE (1 question) :
- « Je veux un suivi de chantier avec un tableau de bord (vue sur tous mes chantiers), une page avec tous mes chantiers, une page avec mes équipes et sur quel chantier elles sont. » → le contenu principal et les pages sont donnés ; pose 1 question sur ce qui reste vraiment ouvert (ex: veut-il aussi une page dédiée aux documents/photos par chantier, ou un budget par chantier ?).

Exemple VAGUE (3 questions) :
- « Une app de suivi de chantier. » → demande : (1) quelles pages/écrans il veut voir (tableau de bord, liste des chantiers, équipes…), (2) quelles infos suivre en priorité par chantier (budget, avancement, statut…), (3) un point métier clé pertinent (ex: faut-il suivre les équipes assignées à chaque chantier ?).

Autres exemples DÉJÀ TRÈS DÉTAILLÉE (1 question) :
- « Une app pour suivre mes chantiers : client, adresse, budget, date de début, avancement, statut. »
- « Un carnet de devis avec le client, le montant, la date et l'état (envoyé / accepté / refusé), et une page pour relancer les devis en attente. »

Autres exemples VAGUES (3 questions) :
- « Je veux une app pour mieux gérer mon activité. »
- « Une app pour mon entreprise. »
- « Un suivi de mes factures clients. »

Tes questions sont VRAIMENT SPÉCIFIQUES à SA demande, dans SON vocabulaire, avec des options CONCRÈTES de son métier (jamais « option 1/2 »), chacune avec un hint clair d'une ligne. Couvre les pages/écrans voulus ET/OU le contenu concret à suivre — jamais de question de remplissage sans valeur ajoutée réelle.

INTERDIT dans questions : couleurs, mise en page, support (mobile/desktop), source des données — ils sont pilotés par ask_style et ask_data_source, pas par toi.

Vouvoiement. Réponds UNIQUEMENT via l'outil plan_clarification.`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Authentification requise." }, { status: 401 });

  // Rate limiting : rejette un flood au plus tôt.
  const limited = await enforceRateLimit("clarify", user.id, LIMITS.clarify);
  if (limited) return limited;

  // Langue de l'interface (cookie) : questions LLM + repli statique en EN si besoin.
  const locale = await getLocale();

  // Le MÉTIER de l'artisan : il pilote l'aiguillage ET les questions. On ne lui
  // demande jamais son métier — on le connaît (onboarding + réglages).
  const sectorCtx = await getSectorContext(supabase, user.id, locale);

  let prompt = "";
  try {
    const body = await req.json();
    prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 2000) : "";
  } catch { /* corps vide toléré */ }

  // La clé du fournisseur RÉELLEMENT appelé (cf. lib/llm.ts). Contrôler « la clé
  // Anthropic » ici ramenait les questions génériques dès qu'on la retirait.
  const hasKey = hasKeyFor(CLARIFY_MODEL);

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
      const k = await classifyKind({ prompt, sector: sectorCtx.primary });
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
              internal: true, // classification : coût réel journalisé, pas de plancher 5cr
            }).catch(() => {});
          }
        } catch { /* tracking best-effort */ }
      }
      if (k.kind !== "module") {
        return Response.json({ skipClarify: true, kind: k.kind, docType: k.docType });
      }
    } catch { /* classif indisponible → questionnaire d'app (historique) */ }
  }

  // Repli PRUDENT (LLM lent/indisponible) : on garde le comportement historique
  // — questions génériques + Données + Palette. Le chemin « exécute directement »
  // n'est emprunté QUE quand le modèle a bien jugé la demande suffisante.
  let specific: ClarifyQuestion[] = fallbackSpecific(locale);
  let askData = true;
  let askStyle = true;
  let usage: { inputTokens: number; outputTokens: number } | null = null;

  if (prompt && hasKey) {
    try {
      // Course LLM vs délai : au-delà du timeout, on tombe sur le repli statique.
      const message = await Promise.race([
        client.messages.create({
          model: CLARIFY_MODEL,
          max_tokens: 900,
          system: withLocale(
            sectorCtx.block ? `${CLARIFY_SYSTEM}\n\n${sectorCtx.block}` : CLARIFY_SYSTEM,
            locale
          ),
          tools: [PLAN_TOOL],
          tool_choice: { type: "tool", name: "plan_clarification" },
          messages: [{ role: "user", content: `Demande de l'utilisateur : « ${prompt} »` }],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("clarify-llm-timeout")), LLM_TIMEOUT_MS)
        ),
      ]);
      usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
      const block = message.content.find((b) => b.type === "tool_use");
      if (block && block.type === "tool_use") {
        const input = block.input as {
          ask_data_source?: boolean;
          ask_style?: boolean;
          questions?: ClarifyQuestion[];
        };
        // Défaut prudent : on demande la source/le style SAUF si le modèle dit
        // explicitement que c'est déjà précisé (false). Absent = on demande.
        askData = input.ask_data_source !== false;
        askStyle = input.ask_style !== false;
        const qs = (input.questions ?? [])
          .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
          .slice(0, 3)
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
        // Le modèle a répondu : ses questions font foi (1 à 3, jamais 0 — voir
        // CLARIFY_SYSTEM). Filet ci-dessous si jamais il en renvoie 0 malgré tout.
        if (qs.length) specific = qs;
      }
    } catch (e) {
      // NE JAMAIS ÉCHOUER EN SILENCE. Ce repli sert des questions ÉCRITES EN DUR
      // (« M'organiser au quotidien », « Perdre du temps en paperasse »…) qui n'ont
      // aucun rapport avec la demande. Quand il se déclenche, l'utilisateur croit
      // juger l'IA alors qu'il regarde un formulaire figé — et personne ne le sait.
      // Cause n°1 observée : le modèle dépasse LLM_TIMEOUT_MS (12 s), ou l'API est
      // sans crédit. Ça doit hurler dans les logs.
      const why = e instanceof Error ? e.message : String(e);
      console.error(
        `[clarify] ⚠️ REPLI STATIQUE — l'IA n'a pas répondu, l'utilisateur va voir les questions génériques.\n` +
          `          modèle=${CLARIFY_MODEL} · délai=${LLM_TIMEOUT_MS}ms · cause=${why}`
      );
    }
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

  // ── NON NÉGOCIABLE (décision user 2026-07-16) ──────────────────────────────
  // La SOURCE DES DONNÉES (vide / importer / workspace) et les COULEURS sont
  // TOUJOURS demandées avant de créer une app — jamais de données fictives, jamais
  // une palette devinée. `askData`/`askStyle` du modèle ne servent plus à masquer
  // ces questions : elles sont toujours là (le widget saute la portée workspace
  // si « workspace » n'est pas choisi). Voir [[feedback_no_demo_data_in_product]].
  //
  // Question(s) de CONTENU (décision user 2026-07-16, distincte de ce qui précède) :
  // toujours 1 à 3 questions sur le besoin/contenu réel de l'app — JAMAIS 0 (on ne
  // construit jamais à l'aveugle), JAMAIS plus de 3 (on n'embête pas non plus un
  // utilisateur déjà précis). `specific` porte déjà cette règle (voir CLARIFY_SYSTEM
  // + le filet ci-dessus qui retombe sur fallbackSpecific si le modèle renvoie 0).
  void askData; void askStyle; // conservés (compat tool) mais n'éteignent plus rien
  const questions = [
    ...specific.slice(0, 3),
    dataQuestion(locale),
    workspaceScopeQuestion(locale),
    themeQuestion(locale),
  ];

  return Response.json({ questions });
}
