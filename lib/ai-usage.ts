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

/**
 * Coût d'un appel, en USD.
 *
 * ⚠️ `realCostUsd` (le RELEVÉ d'OpenRouter) prime TOUJOURS sur le catalogue.
 *
 * Pourquoi : un même modèle est servi par des DIZAINES d'opérateurs, à des prix
 * qui vont du simple au quadruple (DeepSeek V4 Pro : 0,87 $/M chez DeepSeek…
 * 3,48 $/M chez Fireworks). Le catalogue OpenRouter n'affiche que le MOINS CHER.
 * Or on route par `sort:"throughput"` — donc vers le PLUS RAPIDE, qui est souvent
 * l'un des plus chers.
 *
 * Mesuré le 2026-07-13 sur 30 applications : le catalogue disait 0,0106 $/app,
 * la facture réelle était de 0,0428 $. Comme le crédit est débité au coût, cet
 * écart ×4 faisait débiter 4 crédits au lieu de 14 → la marge tombait de 88 % à
 * 60 %, SOUS le plancher de 70 % fixé dans lib/plans.ts. Sans que rien ne l'alerte.
 *
 * Le catalogue reste le repli : Anthropic en direct, ou un relevé absent.
 */
function calcCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number,
  realCostUsd?: number
): number {
  if (typeof realCostUsd === "number" && Number.isFinite(realCostUsd) && realCostUsd > 0) {
    return realCostUsd;
  }

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
  /** Coût RÉELLEMENT facturé par le fournisseur (OpenRouter le renvoie dans
   *  `usage.cost`). Prime sur le catalogue — voir calcCost. Toujours le passer
   *  quand on l'a : c'est lui qui garantit la justesse de la marge. */
  realCostUsd?: number;
  /** Crédits RÉELLEMENT débités au client, décidés par la GRILLE TARIFAIRE
   *  (lib/plans.ts → ACTION_CREDITS), PAS par le coût du modèle.
   *
   *  C'est la correction du 2026-07-13 : le débit suivait le coût réel, si bien
   *  qu'un moteur 8× moins cher bradait l'offre au lieu d'améliorer la marge
   *  (une app tombée de 250 crédits facturés à 15 → 133 apps pour 49 €).
   *  Le coût, lui, reste journalisé dans `cost_usd` : c'est ce qui permet de
   *  SURVEILLER la marge sans qu'il la pilote. */
  billedCredits?: number;
  /** WS-E : relie ce coût à un passage d'agent (agent_runs.id). Null pour le chat. */
  runId?: string | null;
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
  realCostUsd,
  billedCredits,
  runId,
  agent,
  sector,
  promptType,
  internal = false,
}: TrackUsageParams): Promise<number> {
  const costUsd = calcCost(model, inputTokens, outputTokens, cachedInputTokens, realCostUsd);

  // La GRILLE décide du débit. Le coût ne sert plus qu'au suivi de marge.
  // Repli sur le coût pour la plomberie interne (routage, classification…),
  // jamais facturée au client de toute façon.
  const credits = typeof billedCredits === "number" ? billedCredits : creditsForCost(costUsd, { internal });

  // ALARME DE MARGE : si une action coûte plus cher que ce qu'on la facture, la
  // grille est à revoir. Silencieux jusqu'ici = fuite invisible.
  if (typeof billedCredits === "number" && billedCredits > 0) {
    const facture = billedCredits * CREDIT_COST_EUR;   // budget de coût alloué
    const reel = costUsd * USD_TO_EUR;
    if (reel > facture) {
      console.warn(
        `[marge] « ${action} » coûte ${reel.toFixed(4)} € mais n'est facturée que ${billedCredits} crédits ` +
        `(budget ${facture.toFixed(4)} €). Modèle : ${model}. Revoir ACTION_CREDITS.`
      );
    }
  }

  // La policy RLS d'ai_usage refuse l'INSERT au rôle authenticated (with_check
  // false) : l'écriture DOIT passer par service_role, sinon elle échoue en
  // silence et le reporting reste vide. `supabase` (session user) reste le repli.
  const admin = createAdminClient();
  const writer = admin ?? supabase;

  const baseRow = {
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
  };
  // WS-E : on relie le coût au passage. TOLÉRANT — si la colonne run_id n'est pas
  // encore déployée (migration 066), l'insert avec run_id échoue et on réessaie
  // SANS le lien, pour ne jamais perdre la ligne d'usage (aucune régression).
  // Cast : run_id peut ne pas être dans les types générés (database.types.ts).
  const insertUsage = (row: Record<string, unknown>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (writer.from as any)("ai_usage").insert(row) as Promise<{ error: { message: string } | null }>;
  let { error: usageError } = await insertUsage(runId ? { ...baseRow, run_id: runId } : baseRow);
  if (usageError && runId) {
    ({ error: usageError } = await insertUsage(baseRow));
  }
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
