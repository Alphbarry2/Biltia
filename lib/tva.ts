// ─────────────────────────────────────────────────────────────────────────────
// TVA — les taux RÉELLEMENT applicables, par pays.
//
// POURQUOI CE FICHIER EXISTE
// Le produit se vend en France ET en Belgique (lib/countries.ts, lib/brand.ts :
// `country: "FR" | "BE"`), mais la TVA était câblée FRANCE partout : défaut 20 en
// base, options 20/10/5,5 dans les formulaires, « TVA 20 par défaut » dans le prompt
// du parseur vocal. Un artisan de Liège produisait donc des devis à 20 % — un taux
// qui n'existe pas chez lui. Et depuis le référentiel de valeurs, 21 % était même
// REFUSÉ en 400 par le serveur.
//
// LA RÈGLE
// La TVA ne se DEVINE pas. Ni par le LLM, ni par un moteur de règles maison. Ce
// fichier ne fait qu'une chose : dire quels taux EXISTENT dans le pays de
// l'entreprise, avec le cas d'usage de chacun. Quand le bon taux est incertain,
// on DEMANDE — on ne tranche pas à la place de l'artisan (sa responsabilité fiscale
// est engagée, pas la nôtre).
//
// Pur (client-safe). Le pays vient de `tenants.company_info.country` (cf. lib/brand.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type Pays = "FR" | "BE";

export type TauxTva = {
  /** Le taux stocké en base (colonne numeric). */
  taux: number;
  /** Libellé court affiché dans un <select>. */
  label: string;
  /** Quand l'appliquer, en une ligne d'artisan. */
  usage: string;
};

/**
 * Les taux par pays. Volontairement DESCRIPTIF, jamais prescriptif : `usage` aide
 * l'artisan à choisir, il ne décide pas à sa place. Aucune condition d'éligibilité
 * n'est codée ici (ancienneté du logement, nature des travaux, attestation) — c'est
 * du droit fiscal, et le produit ne le simule pas.
 */
export const TVA_PAR_PAYS: Record<Pays, TauxTva[]> = {
  FR: [
    { taux: 20, label: "20 %", usage: "Taux normal — construction neuve, la plupart des travaux" },
    { taux: 10, label: "10 %", usage: "Rénovation d'un logement de plus de 2 ans" },
    { taux: 5.5, label: "5,5 %", usage: "Rénovation énergétique" },
    { taux: 0, label: "0 %", usage: "Autoliquidation (sous-traitance) ou opération exonérée" },
  ],
  BE: [
    { taux: 21, label: "21 %", usage: "Taux normal — construction neuve, la plupart des travaux" },
    { taux: 6, label: "6 %", usage: "Rénovation d'un logement de plus de 10 ans" },
    { taux: 12, label: "12 %", usage: "Logement social, cas particuliers" },
    { taux: 0, label: "0 %", usage: "Cocontractant (autoliquidation) ou opération exonérée" },
  ],
};

/** Le pays de l'entreprise, ramené aux deux pays réellement pris en charge. */
export function coercePays(raw: unknown): Pays {
  return String(raw ?? "").toUpperCase() === "BE" ? "BE" : "FR";
}

export function tauxTvaPour(pays: Pays): TauxTva[] {
  return TVA_PAR_PAYS[pays] ?? TVA_PAR_PAYS.FR;
}

/**
 * Le taux « normal » du pays. À n'utiliser QUE comme valeur pré-remplie d'un
 * formulaire, JAMAIS pour trancher en silence à la place de l'artisan sur un devis :
 * un devis de rénovation à 20 % au lieu de 10 % est une erreur qu'il paiera, pas nous.
 */
export function tauxTvaParDefaut(pays: Pays): number {
  return tauxTvaPour(pays)[0].taux;
}

export function estTauxTvaConnu(pays: Pays, taux: number): boolean {
  return tauxTvaPour(pays).some((t) => t.taux === taux);
}

/** Union FR + BE — utilisée quand le pays n'est pas encore connu (formulaire générique). */
export function tousLesTauxTva(): number[] {
  const set = new Set<number>();
  for (const pays of Object.keys(TVA_PAR_PAYS) as Pays[]) {
    for (const t of TVA_PAR_PAYS[pays]) set.add(t.taux);
  }
  return [...set].sort((a, b) => b - a);
}

/** Libellé d'un taux ; précise le pays quand il n'existe QUE là (« 21 % (BE) »). */
export function libelleTauxTva(taux: number, pays?: Pays): string {
  if (pays) {
    const t = tauxTvaPour(pays).find((x) => x.taux === taux);
    if (t) return t.label;
  }
  const paysQuiOntCeTaux = (Object.keys(TVA_PAR_PAYS) as Pays[]).filter((p) => estTauxTvaConnu(p, taux));
  const t = paysQuiOntCeTaux.length ? TVA_PAR_PAYS[paysQuiOntCeTaux[0]].find((x) => x.taux === taux) : null;
  const label = t?.label ?? `${String(taux).replace(".", ",")} %`;
  // Un taux commun aux deux pays (0 %) ne porte pas de drapeau ; un taux propre à
  // un pays le porte, sinon un artisan français voit « 21 % » sans comprendre.
  if (paysQuiOntCeTaux.length === 1) return `${label} (${paysQuiOntCeTaux[0]})`;
  return label;
}

/**
 * Bloc injecté au LLM (parseur vocal, générateur de documents). Il DÉCRIT les taux
 * possibles et INTERDIT de deviner — c'est l'inverse de ce que faisait
 * lib/document-context.ts, qui ordonnait au modèle de « déduire seul le taux de TVA ».
 */
export function reglesTvaPourPrompt(pays: Pays): string {
  const lignes = tauxTvaPour(pays)
    .map((t) => `- ${t.label} : ${t.usage}`)
    .join("\n");
  return `# TVA (${pays === "BE" ? "Belgique" : "France"})
Taux applicables dans ce pays :
${lignes}

RÈGLE ABSOLUE : ne DEVINE JAMAIS le taux. Si l'artisan l'a dicté, reprends-le. S'il est
inscrit sur l'article du catalogue, reprends-le. Sinon, laisse le taux VIDE et signale-le
comme une information manquante à confirmer. Un taux de TVA inventé est une erreur que
l'artisan paiera, pas nous. N'utilise JAMAIS un taux d'un autre pays.`;
}
