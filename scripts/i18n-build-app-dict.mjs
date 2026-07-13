// Fusionne les lots traduits en lib/app-strings-en.ts.
//
// Deux garde-fous ici, et ils comptent :
//  1) ASSAINISSEMENT — une valeur EN ne doit contenir ni guillemet double ni
//     antislash : elle est réinjectée dans des littéraux JS ET des attributs
//     HTML. Un `"` de trop = attribut coupé ou SyntaxError.
//  2) VALEURS STOCKÉES — quelques chaînes affichées sont aussi ÉCRITES en base
//     (suggestions de type d'intervention, catégories matériau, rôle). Elles
//     doivent tomber pile sur le libellé EN du référentiel (lib/vocabulaires.ts)
//     pour que la normalisation serveur les reconnaisse. Sinon : écriture refusée.
import { readFileSync, writeFileSync } from "node:fs";

const DIR = "/private/tmp/claude-501/-Users-alphabarry-biltia/927f4455-8597-49d3-b5c6-95bc4194535d/scratchpad";
const src = JSON.parse(readFileSync("scripts/app-strings.json", "utf8")).map((h) => h.text);
const extra = ["dim","lun","mar","mer","jeu","ven","sam","janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc.","auj.","pers.","abs.","(prestation)","client@exemple.fr","sur","dans","aucune"];
const expected = [...new Set([...src, ...extra])];

const merged = {};
for (let i = 1; i <= 6; i++) Object.assign(merged, JSON.parse(readFileSync(`${DIR}/out${i}.json`, "utf8")));

// Complément manuel : fragments repérés par la vérification (scripts/i18n-verify-apps.mts).
// Les mots nus en minuscules ne sont ajoutés QU'APRÈS avoir vérifié en contexte
// qu'ils ne servent pas de clé interne. Contre-exemple gardé en tête : « jour »
// est l'id d'une vue du planning (S.view==="jour") — le traduire casserait la
// navigation. D'où la reformulation du pluriel côté source FR.
Object.assign(merged, {
  "sur": "of",                                    // kpi(…, "sur "+budgetTotal)
  "dans": "in",                                   // "Échéance dans …"
  "aucune": "none",                               // (late ? "à relancer" : "aucune")
  "/ facturé": "/ invoiced",
  "jour planifié": "day scheduled",
  "jours planifiés": "days scheduled",
  ".\n\nMerci d'avance,": ".\n\nThanks in advance,",
  ". Restant à votre disposition pour en discuter et avancer ensemble.\n\nBien cordialement,":
    ". Happy to discuss and move forward together.\n\nBest regards,",
  // Exemples de saisie : un nom français n'aide pas un utilisateur anglophone.
  "M. Dupont / SCI Les Lilas": "Mr. Smith / Oakwood Properties",
  "SCI Méditerranée, M. Vasseur…": "Oakwood Properties, Mr. Smith…",
});

// (2) Ces libellés partent en base → ils doivent parler la langue du référentiel.
const STORED = {
  "Chef de chantier": "Site manager",                       // employees.role
  "Dépannage": "Emergency repair",                          // interventions.type ↓
  "Entretien annuel": "Annual servicing",
  "Mise en service": "Commissioning",
  "Visite de contrôle": "Technical visit",
  "SAV sous garantie": "After-sales (warranty)",
  "Devis / diagnostic": "Quote / diagnosis",
  "Gros œuvre": "Structural",                               // materials.categorie ↓
  "Électricité": "Electrical",
  "Plomberie": "Plumbing",
  "Peinture": "Paint",
  "Isolation": "Insulation",
  "Quincaillerie": "Hardware",
  "Outillage": "Tooling",
  "Menuiserie": "Joinery",
  "Carrelage": "Tiling",
  "Placo": "Plasterboard",
};

const clean = (v) =>
  v.replace(/\\/g, "")
   .replace(/[«»“”"]/g, "'")
   .replace(/\s+'/g, " '")
   .trim();

const dict = {};
const missing = [];
for (const k of expected) {
  const v = STORED[k] ?? merged[k];
  if (v === undefined) { missing.push(k); continue; }
  dict[k] = clean(v);
}

if (missing.length) {
  console.error("MANQUANTES:", missing.length);
  missing.slice(0, 20).forEach((m) => console.error("  -", JSON.stringify(m)));
  process.exit(1);
}

const keys = Object.keys(dict).sort((a, b) => b.length - a.length || a.localeCompare(b));
const body = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(dict[k])},`).join("\n");

writeFileSync(
  "lib/app-strings-en.ts",
  `// ─────────────────────────────────────────────────────────────────────────────
// GÉNÉRÉ — ne pas éditer à la main.
//   1. \`npx tsx scripts/i18n-extract-apps.mts\`   (extrait les chaînes FR affichées)
//   2. traduire les lots
//   3. \`node scripts/i18n-build-app-dict.mjs\`     (reconstruit ce fichier)
//
// Texte AFFICHÉ des 10 apps phares, FR → EN. Consommé par lib/app-html-i18n.ts.
// Ne contient QUE du texte humain : aucune clé d'entité, aucun nom de colonne,
// aucune valeur d'enum stockée (les traduire casserait données, filtres, agents).
// ─────────────────────────────────────────────────────────────────────────────

export const APP_STRINGS_EN: Record<string, string> = {
${body}
};
`
);

const bad = keys.filter((k) => /["\\]/.test(dict[k]));
console.log("entrées:", keys.length, "| valeurs à risque (\" ou \\):", bad.length);
if (bad.length) bad.slice(0, 10).forEach((k) => console.log("  !", JSON.stringify(dict[k])));
console.log("identiques FR=EN:", keys.filter((k) => k === dict[k]).length);
