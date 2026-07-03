// Test gratuit de l'aiguillage heuristique (aucun appel API).
// Usage : node scripts/test-kind.mjs
import { classifyKindHeuristic } from "../lib/kind-router.ts";

const cases = [
  // — Documents (livrables uniques) —
  { prompt: "Chantier Liège, le client valide le changement de carrelage pour 45 m². Sors-moi l'avenant et fais-le lui signer direct.", expect: "document", docType: "avenant" },
  { prompt: "Rédige une mise en demeure pour la facture 2024-012 impayée depuis 45 jours", expect: "document", docType: "mise_en_demeure" },
  { prompt: "PV de réception des travaux du chantier rue Neuve, sans réserve", expect: "document", docType: "pv_reception" },
  { prompt: "Fais-moi un devis pour 45 m² de carrelage à 40€/m² en rénovation", expect: "document", docType: "devis" },
  { prompt: "Génère le rapport de fin de chantier pour la rénovation de la rue Neuve", expect: "document", docType: "pv_reception" },
  { prompt: "Une attestation TVA à 10% pour mon client sur ce chantier de rénovation", expect: "document", docType: "attestation" },

  // — Actions (traitement par lot) —
  { prompt: "glisse tes 30 bons de livraison ici, je vérifie les erreurs de prix par rapport à tes devis", expect: "action" },
  { prompt: "compare ces factures fournisseurs avec mes commandes et détecte les erreurs", expect: "action" },

  // — Modules (outils de gestion) —
  { prompt: "Je veux un outil de création de devis BTP avec calcul du total HT et TVA", expect: "module" },
  { prompt: "Je veux une fiche de suivi de mes chantiers avec avancement et budget", expect: "module" },
  { prompt: "pointage des heures de mes ouvriers par chantier", expect: "module" },
  { prompt: "un CRM pour gérer mes clients et mes relances", expect: "module" },
  { prompt: "carnet d'entretien de chaudières et pompes à chaleur", expect: "module" },
];

let ok = 0;
let docOk = 0;
let docTotal = 0;
for (const c of cases) {
  const r = classifyKindHeuristic(c.prompt);
  const kindPass = r.kind === c.expect;
  if (kindPass) ok++;
  let docNote = "";
  if (c.docType) {
    docTotal++;
    const dp = r.docType === c.docType;
    if (dp) docOk++;
    docNote = ` docType=${r.docType ?? "∅"} ${dp ? "✓" : `(attendu ${c.docType})`}`;
  }
  console.log(
    `${kindPass ? "✅" : "❌"} [${r.kind}/${r.method} ${r.confidence.toFixed(2)}]${docNote}  « ${c.prompt.slice(0, 60)}… »`
  );
}
console.log(`\n${ok}/${cases.length} aiguillages corrects (heuristique seule) · docType ${docOk}/${docTotal}`);
