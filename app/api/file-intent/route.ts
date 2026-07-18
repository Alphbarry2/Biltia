import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { trackAiUsage } from "@/lib/ai-usage";
import { classifyFileIntent } from "@/lib/kind-router";
import { getSectorContext } from "@/lib/sector-context";
import { getLocale } from "@/lib/i18n/server";

// ─────────────────────────────────────────────────────────────────────────────
// /api/file-intent — AIGUILLAGE D'UNE DEMANDE AVEC FICHIER(S) JOINT(S).
//
// Un fichier joint ouvre plusieurs portes : l'ANALYSER (lecture seule),
// l'ANNOTER, en tirer un DOCUMENT fini, en tirer une APPLICATION, ou — si un
// livrable est déjà ouvert dans l'atelier — MODIFIER CET OUVERT en utilisant le
// fichier comme simple référence (`openKind`, optionnel). Le choix se faisait
// par regex côté client — « crée-moi une app à partir de CE fichier » partait en
// régénération de PDF (verbe « crée » + anaphore « ce »), et aucun chemin ne
// menait au générateur d'app. On confie donc la décision au même modèle que le
// reste de l'aiguillage (COMPRÉHENSION AVANT VITESSE).
//
// Ne renvoie JAMAIS d'erreur bloquante : si le modèle est lent/indisponible, on
// renvoie intent=null et le client retombe sur ses heuristiques regex.
// ─────────────────────────────────────────────────────────────────────────────

const LLM_TIMEOUT_MS = 12000;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Authentification requise." }, { status: 401 });

  const limited = await enforceRateLimit("clarify", user.id, LIMITS.clarify);
  if (limited) return limited;

  let prompt = "";
  let openKind: "module" | "document" | null = null;
  try {
    const body = await req.json();
    prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 2000) : "";
    openKind = body.openKind === "module" || body.openKind === "document" ? body.openKind : null;
  } catch { /* corps vide toléré */ }

  // Consigne vide → rien à comprendre : analyse (lecture seule), sans appel LLM.
  if (!prompt.trim()) return Response.json({ intent: "analyze" });

  // Le métier oriente l'aiguillage : « regarde ce plan » n'appelle pas la même
  // suite chez un électricien que chez un peintre.
  const locale = await getLocale();
  const sectorCtx = await getSectorContext(supabase, user.id, locale);

  let result = null;
  try {
    result = await Promise.race([
      classifyFileIntent(prompt, sectorCtx.block, openKind),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LLM_TIMEOUT_MS)),
    ]);
  } catch { /* jamais bloquant */ }

  // Coût réel journalisé (classification : pas de plancher crédits).
  if (result?.usage) {
    try {
      const membership = await getActiveMembershipServer(supabase, user.id);
      if (membership) {
        void trackAiUsage({
          supabase,
          userId: user.id,
          tenantId: membership.tenant_id,
          action: "file_intent",
          model: result.usage.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          internal: true,
        }).catch(() => {});
      }
    } catch { /* tracking best-effort */ }
  }

  // intent null → le client applique ses regex de repli.
  return Response.json({ intent: result?.intent ?? null });
}
