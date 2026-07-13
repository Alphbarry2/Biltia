import { normalizeFieldValue } from "../lib/vocabulaires";
const cases: [string, string, string, string][] = [
  ["employees", "role", "Site manager", "chef_chantier"],
  ["interventions", "type", "Emergency repair", "depannage"],
  ["interventions", "type", "Annual servicing", "entretien"],
  ["interventions", "type", "Commissioning", "mise_en_service"],
  ["interventions", "type", "Technical visit", "visite_technique"],
  ["interventions", "type", "After-sales (warranty)", "sav"],
  ["interventions", "type", "Quote / diagnosis", "diagnostic"],
  ["materials", "categorie", "Structural", "gros_oeuvre"],
  ["materials", "categorie", "Electrical", "electricite"],
  ["materials", "categorie", "Plumbing", "plomberie"],
  ["materials", "categorie", "Paint", "peinture"],
  ["materials", "categorie", "Insulation", "isolation"],
  ["materials", "categorie", "Hardware", "quincaillerie"],
  ["materials", "categorie", "Tooling", "outillage"],
  ["materials", "categorie", "Joinery", "menuiserie"],
  ["materials", "categorie", "Tiling", "carrelage"],
  ["materials", "categorie", "Plasterboard", "platrerie"],
];
let bad = 0;
for (const [e, f, input, want] of cases) {
  const r = normalizeFieldValue(e, f, input);
  const got = r.ok ? String(r.value) : "REFUSÉ";
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${e}.${f} "${input}" → ${got}${ok ? "" : `  (attendu ${want})`}`);
}
console.log(bad ? `\n❌ ${bad} écriture(s) EN seraient mal normalisées` : "\n✅ Toutes les valeurs EN écrites en base se canonisent correctement");
process.exit(bad ? 1 : 0);
