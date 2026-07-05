// ─────────────────────────────────────────────────────────────────────────────
// SUJETS DES QUESTIONS — classifieur heuristique PUR (aucun appel LLM, gratuit).
// Range une question du copilote dans un thème BTP exploitable côté admin, pour
// savoir SUR QUOI les pros posent des questions (mine d'or produit / RAG / contenu).
// Premier thème dont un mot-clé matche l'emporte ; sinon « Autre / général ».
// ─────────────────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase();
}

// L'ordre compte : du plus spécifique au plus générique.
const TOPIC_RULES: { topic: string; kws: string[] }[] = [
  { topic: "Fiscalité / TVA", kws: ["tva", "taxe", "fiscal", "impot", "auto-entrepreneur", "auto entrepreneur", "urssaf", "cotisation", "franchise de tva"] },
  { topic: "Garanties / assurance", kws: ["garantie", "decennale", "parfait achevement", "biennale", "assurance", "sinistre", "responsabilite", "dommage ouvrage", "dommages-ouvrage"] },
  { topic: "Normes / DTU / RE2020", kws: ["norme", "dtu", "nf c", "nf p", "reglementaire", "conformite", "conforme", "re2020", "rt2012", "certification", "ce ", "acermi"] },
  { topic: "Droit / contrats / litiges", kws: ["contrat", "litige", "mise en demeure", "clause", "juridique", "obligation", "resiliation", "penalite de retard", "avenant", "recours"] },
  { topic: "Marchés publics", kws: ["marche public", "appel d'offre", "appel d offre", "cctp", "ccap", "dce", "dpgf", "cahier des charges", "soumission"] },
  { topic: "Délais / réception", kws: ["delai", "planning", "retard", "reception des travaux", "pv de reception", "levee de reserves", "duree du chantier"] },
  { topic: "Devis / prix / métré", kws: ["devis", "prix", "tarif", "cout", "facturation", "acompte", "chiffrage", "metre", "coefficient", "deboursé", "debourse"] },
  { topic: "RH / social / paie", kws: ["salarie", "employe", "embauche", "paie", "conge", "interim", "convention collective", "smic", "heures supplementaires", "apprenti"] },
  { topic: "Sécurité chantier", kws: ["securite", "epi", "ppsps", "amiante", "plomb", "chute", "accident du travail", "penibilite", "risque chantier"] },
  { topic: "Technique / matériaux", kws: ["isolation", "beton", "enduit", "placo", "carrelage", "toiture", "charpente", "electricite", "plomberie", "etancheite", "menuiserie", "materiau"] },
  { topic: "Mes données (workspace)", kws: ["mon chantier", "mes chantiers", "mes clients", "combien de", "j'ai combien", "mes devis", "mon planning", "ou en est", "mes factures"] },
];

/** Range une question dans un thème BTP (ou « Autre / général »). Jamais d'erreur. */
export function classifyQuestionTopic(prompt: string): string {
  const text = normalize(prompt || "");
  if (!text.trim()) return "Autre / général";
  for (const { topic, kws } of TOPIC_RULES) {
    for (const kw of kws) {
      if (text.includes(normalize(kw))) return topic;
    }
  }
  return "Autre / général";
}
