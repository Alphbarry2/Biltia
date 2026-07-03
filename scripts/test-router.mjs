// Test gratuit du routage heuristique (aucun appel API).
// Usage : node scripts/test-router.mjs
import { routeHeuristic } from "../lib/router.ts";

const cases = [
  { prompt: "un truc pour faire mes devis", sector: "electricite", expect: "generalist|electricite" },
  { prompt: "calcul du tableau électrique et des disjoncteurs", sector: "electricite", expect: "electricite" },
  { prompt: "suivi de mes chantiers de couverture, tuiles et faîtage", sector: "charpente_couverture", expect: "couverture" },
  { prompt: "une app pour gérer mes clients et relances", sector: "autre", expect: "generalist" },
  { prompt: "métré de placo et cloisons BA13", sector: "platrerie_isolation", expect: "platrerie" },
  { prompt: "devis carrelage au m2 avec calepinage", sector: "carrelage_faience", expect: "carrelage" },
  { prompt: "pointage des heures de mes équipes", sector: "gros_oeuvre", expect: "generalist|gros_oeuvre" },
  { prompt: "entretien chaudières et pompes à chaleur", sector: "plomberie_cvc", expect: "plomberie" },
];

let ok = 0;
for (const c of cases) {
  const r = routeHeuristic(c.prompt, c.sector);
  const pass = c.expect.split("|").includes(r.agent);
  if (pass) ok++;
  console.log(
    `${pass ? "✅" : "❌"} [${r.agent}/${r.method} ${r.confidence.toFixed(2)}] « ${c.prompt} »  (attendu: ${c.expect})`
  );
}
console.log(`\n${ok}/${cases.length} routages corrects (heuristique seule)`);
