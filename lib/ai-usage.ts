import type { SupabaseClient } from "@supabase/supabase-js";
import { getModel } from "./models";

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
}: TrackUsageParams): Promise<void> {
  const costUsd = calcCost(model, inputTokens, outputTokens, cachedInputTokens);

  await supabase.from("ai_usage").insert({
    user_id: userId,
    tenant_id: tenantId,
    app_id: appId ?? null,
    action,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cached_input_tokens: cachedInputTokens,
    cost_usd: costUsd,
    agent: agent ?? null,
    sector: sector ?? null,
    prompt_type: promptType ?? null,
  });
}
