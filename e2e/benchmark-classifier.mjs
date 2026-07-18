// BENCHMARK d'aiguillage — compare des modèles sur le jeu (e2e/benchmark-dataset.mjs).
// Mesure : kind BRUT, kind RÉSOLU (après barrière hybride), rappel/précision des
// intentions, validité schéma, taux de fallback, variance, latence, tokens.
// LLM réel (credential déjà présent). Aucune écriture, aucune communication.
//
// Lancer : node --env-file=<.env.local> --experimental-strip-types --import ./e2e/register.mjs e2e/benchmark-classifier.mjs
import { buildKindSystem, CLASSIFY_TOOL } from "@/lib/kind-router";
import { normalizePreflight } from "@/lib/mission-preflight";
import { resolveOperationalKind, deriveIntentsFromSignals } from "@/lib/hybrid-routing";
import { hasAnyLlmKey } from "@/lib/llm";
import { client } from "@/lib/llm";
import { DATASET } from "./benchmark-dataset.mjs";

if (!hasAnyLlmKey()) { console.log("SKIP no credential"); process.exit(0); }

// Modèles câblés (via OpenRouter). Ne change AUCUN défaut de production.
const MODELS = (process.env.BENCH_MODELS || "qwen/qwen3.5-flash-02-23,mistralai/mistral-medium-3.1,deepseek/deepseek-v4-pro,anthropic/claude-sonnet-5").split(",");
const RUNS = Number(process.env.BENCH_RUNS || 2); // pour la variance
const SYSTEM = buildKindSystem(false);

async function classifyRaw(prompt, model) {
  const t0 = Date.now();
  try {
    const msg = await client.messages.create({ model, max_tokens: 500, system: SYSTEM, tools: [CLASSIFY_TOOL], tool_choice: { type: "tool", name: "classify_request" }, messages: [{ role: "user", content: `Demande : « ${prompt} »` }] });
    const block = msg.content.find((b) => b.type === "tool_use");
    const dt = Date.now() - t0;
    if (!block) return { valid: false, dt, tokens: (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0) };
    const inp = block.input;
    const pf = normalizePreflight({ goal: inp.goal, intents: inp.intents, expected_outputs: inp.expected_outputs, tool_groups: inp.tool_groups, complexity: inp.complexity, confidence: inp.confidence }, inp.kind, prompt);
    return { valid: true, kind: inp.kind, preflight: pf, fellBack: pf.intents.length === 1 && pf.intents[0] === "other", dt, tokens: (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0) };
  } catch (e) {
    return { valid: false, dt: Date.now() - t0, err: e?.message };
  }
}

function finalIntents(raw, prompt) {
  // UNION (comme applyHybridRouting) : intentions du modèle + signaux déterministes.
  const usable = (raw.preflight?.intents || []).filter((i) => i !== "other");
  return Array.from(new Set([...usable, ...deriveIntentsFromSignals(prompt)]));
}
const inter = (a, b) => a.filter((x) => b.includes(x));

console.log(`== BENCHMARK AIGUILLAGE — ${DATASET.length} demandes × ${MODELS.length} modèles × ${RUNS} runs ==`);

for (const model of MODELS) {
  const agg = { rawOk: 0, resolvedOk: 0, schemaOk: 0, fellBack: 0, n: 0, recallNum: 0, recallDen: 0, precNum: 0, precDen: 0, dt: [], tokens: [], kindByPrompt: {} };
  for (let run = 1; run <= RUNS; run++) {
    for (const c of DATASET) {
      const raw = await classifyRaw(c.prompt, model);
      agg.n++;
      agg.dt.push(raw.dt || 0); agg.tokens.push(raw.tokens || 0);
      if (raw.valid) agg.schemaOk++; else continue;
      if (raw.fellBack) agg.fellBack++;
      const { resolvedKind } = resolveOperationalKind({ prompt: c.prompt, classifiedKind: raw.kind });
      if (raw.kind === c.expectedKind) agg.rawOk++;
      if (resolvedKind === c.expectedKind) agg.resolvedOk++;
      (agg.kindByPrompt[c.prompt] ||= []).push(resolvedKind);
      if (c.requiredIntents?.length) {
        const fin = finalIntents(raw, c.prompt);
        const hit = inter(c.requiredIntents, fin);
        agg.recallNum += hit.length; agg.recallDen += c.requiredIntents.length;
        agg.precNum += hit.length; agg.precDen += fin.length;
      }
    }
  }
  // Variance : proportion de prompts dont le resolvedKind est STABLE sur les runs.
  const prompts = Object.values(agg.kindByPrompt);
  const stable = prompts.filter((ks) => new Set(ks).size === 1).length;
  const pct = (x, y) => (y ? ((100 * x) / y).toFixed(0) + "%" : "n/a");
  const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
  console.log(`\n### ${model}`);
  console.log(`  kind BRUT    : ${pct(agg.rawOk, agg.schemaOk)} (${agg.rawOk}/${agg.schemaOk})`);
  console.log(`  kind RÉSOLU  : ${pct(agg.resolvedOk, agg.schemaOk)} (${agg.resolvedOk}/${agg.schemaOk})  ← après barrière hybride`);
  console.log(`  intentions   : rappel ${pct(agg.recallNum, agg.recallDen)} | précision ${pct(agg.precNum, agg.precDen)}`);
  console.log(`  schéma valide: ${pct(agg.schemaOk, agg.n)} | fallback pré-vol: ${pct(agg.fellBack, agg.schemaOk)}`);
  console.log(`  stabilité (kind résolu stable / prompt) : ${pct(stable, prompts.length)}`);
  console.log(`  latence moy: ${avg(agg.dt)} ms | tokens moy: ${avg(agg.tokens)}`);
}
console.log("\nBENCH_DONE");
