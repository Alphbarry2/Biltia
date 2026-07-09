import type { SupabaseClient } from "@supabase/supabase-js";
import { getModel } from "./models";
import { createAdminClient } from "./supabase-admin";
import { CREDIT_COST_EUR } from "./plans";

// Tarifs par 1M tokens (USD). Source unique de vérité : le catalogue `models.ts`
// (tous fournisseurs). On garde ici un petit fallback pour d'anciens IDs Anthropic
// qui ne figurent plus au catalogue, et un défaut prudent pour tout ID inconnu.
const LEGACY_PRICING: Record<string, { input: number; output: number; cachedInput: number }> = {
  "claude-opus-4-7": { input: 15.00, output: 75.00, cachedInput: 1.50 },
  "claude-opus-4-6": { input: 15.00, output: 75.00, cachedInput: 1.50 },
};

const DEFAULT_PRICING = { input: 3.0, output: 15.0, cachedInput: 0.3 };

function calcCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number
): number {
  const catalog = getModel(model)?.pricing;
  const p = catalog
    ? { input: catalog.input, output: catalog.output, cachedInput: catalog.cachedInput ?? 0 }
    : LEGACY_PRICING[model] ?? DEFAULT_PRICING;

  const billableInput = inputTokens - cachedInputTokens;
  return (
    (billableInput * p.input + cachedInputTokens * p.cachedInput + outputTokens * p.output) /
    1_000_000
  );
}

// ── Conversion coût → crédits ─────────────────────────────────────────────────
// Le crédit est une monnaie interne : on débite proportionnellement au coût RÉEL,
// donc la marge est STRUCTURELLE (marge = 1 − CREDIT_COST_EUR/prix_net, ≥ 90 %),
// indépendante du modèle utilisé. Voir CREDIT_COST_EUR dans lib/plans.ts.

/** Taux USD→EUR (coûts modèles facturés en USD, unité de marge en EUR). */
const USD_TO_EUR = 0.92;

/** Crédits ENTIERS, sans fraction. On arrondit au SUPÉRIEUR (l'arrondi ne fait
 *  qu'ajouter de la marge), plancher 1 crédit.
 *  Plancher/palier à 1 (et non 5) : les usages fréquents et quasi gratuits
 *  (une question simple ≈ 1 à 2 crédits) ne doivent JAMAIS être surfacturés à un
 *  minimum de 5. La marge reste structurelle (coût réel × 1/CREDIT_COST_EUR),
 *  une question à 2 crédits = ~0,10 € pour ~0,005 € de coût = marge ~95 %. Le
 *  business model porte sur les apps et les agents, pas sur les questions. */
const CREDIT_STEP = 1;
const MIN_CREDITS = 1;

/**
 * Convertit un coût réel (USD, tous postes confondus) en crédits ENTIERS à
 * débiter via public.deduct_credits(). Arrondi au crédit supérieur.
 *
 * `internal` : appel de PLOMBERIE (routage, classification, recrutement d'agent…)
 * jamais débité au client, seulement journalisé. On enregistre alors le coût
 * RÉEL en crédits (arrondi entier, sans plancher) : le reporting reste fidèle.
 * Les actions facturées gardent le plancher de 1 (marge).
 */
export function creditsForCost(costUsd: number, opts: { internal?: boolean } = {}): number {
  const costEur = costUsd * USD_TO_EUR;
  const raw = costEur / CREDIT_COST_EUR;
  if (opts.internal) return Math.max(0, Math.round(raw));
  const stepped = Math.ceil(raw / CREDIT_STEP) * CREDIT_STEP;
  return Math.max(MIN_CREDITS, stepped);
}

interface TrackUsageParams {
  supabase: SupabaseClient;
  userId: string;
  tenantId: string;
  appId?: string;
  action: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  agent?: string;
  sector?: string;
  promptType?: "create" | "modify" | "autofix";
  /** Appel interne de plomberie (routage, classification…) : coût réel journalisé,
   *  sans le plancher de 5 crédits qui gonflerait le reporting. Voir creditsForCost. */
  internal?: boolean;
}

export async function trackAiUsage({
  supabase,
  userId,
  tenantId,
  appId,
  action,
  model,
  inputTokens,
  outputTokens,
  cachedInputTokens = 0,
  agent,
  sector,
  promptType,
  internal = false,
}: TrackUsageParams): Promise<number> {
  const costUsd = calcCost(model, inputTokens, outputTokens, cachedInputTokens);
  const credits = creditsForCost(costUsd, { internal });

  // La policy RLS d'ai_usage refuse l'INSERT au rôle authenticated (with_check
  // false) : l'écriture DOIT passer par service_role, sinon elle échoue en
  // silence et le reporting reste vide. `supabase` (session user) reste le repli.
  const admin = createAdminClient();
  const writer = admin ?? supabase;

  const { error: usageError } = await writer.from("ai_usage").insert({
    user_id: userId,
    tenant_id: tenantId,
    app_id: appId ?? null,
    action,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cached_input_tokens: cachedInputTokens,
    cost_usd: costUsd,
    credits,
    agent: agent ?? null,
    sector: sector ?? null,
    prompt_type: promptType ?? null,
  });
  if (usageError) console.error("ai_usage insert failed:", usageError.message);

  // Renvoie les crédits réels pour réconciliation par l'appelant (reconcileCredits).
  return credits;
}

/**
 * Réconcilie un pré-débit (hold) avec le coût réel d'une action :
 *  • réel > hold → prélève le surplus (deduct_credits, contexte user) ;
 *  • réel < hold → rembourse le trop-perçu (refund_credits, service_role requis).
 * Best-effort : ne jette jamais (la facturation ne doit pas casser la réponse).
 */
export async function reconcileCredits(
  supabase: SupabaseClient,
  admin: SupabaseClient | null,
  userId: string,
  held: number,
  actual: number
): Promise<void> {
  try {
    if (actual > held) {
      await supabase.rpc("deduct_credits", { p_amount: actual - held });
    } else if (actual < held && admin) {
      await admin.rpc("refund_credits", { p_user_id: userId, p_amount: held - actual });
    }
  } catch (err) {
    console.error("Credit reconciliation failed:", err);
  }
}
