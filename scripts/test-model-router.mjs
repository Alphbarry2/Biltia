// Test gratuit de la sélection de capacité + modèle (aucun appel API).
// Usage : node scripts/test-model-router.mjs
import { selectCapabilityHeuristic } from "../lib/model-router.ts";
import { recommendedModelFor, executableModelFor } from "../lib/models.ts";

const cases = [
  { prompt: "refais-moi une belle landing page avec une charte graphique moderne", expect: "design" },
  { prompt: "corrige ce bug dans mon script SQL et refactore la fonction", expect: "code" },
  { prompt: "réfléchis en profondeur à ma stratégie de prix et arbitre les options", expect: "reasoning" },
  { prompt: "cherche sur le web les dernières normes et les prix du marché des fournisseurs", expect: "research" },
  { prompt: "génère une image de bannière marketing pour mon produit", expect: "image" },
  { prompt: "analyse ce CSV, agrège les chiffres et sors-moi les KPI", expect: "data" },
  { prompt: "rédige un e-mail de relance à mon client", expect: "writing" },
  { prompt: "je sais pas trop, un truc pour m'aider", expect: "writing" },
];

let ok = 0;
for (const c of cases) {
  const h = selectCapabilityHeuristic(c.prompt);
  const reco = recommendedModelFor(h.capability);
  const exec = executableModelFor(h.capability);
  const pass = h.capability === c.expect;
  if (pass) ok++;
  const degraded = reco.id !== exec.id ? `  (idéal: ${reco.label} → exécuté: ${exec.label})` : `  (${exec.label})`;
  console.log(
    `${pass ? "✅" : "❌"} [${h.capability}/${h.method} ${h.confidence.toFixed(2)}] « ${c.prompt} »  (attendu: ${c.expect})${degraded}`
  );
}
console.log(`\n${ok}/${cases.length} capacités correctes (heuristique seule)`);
