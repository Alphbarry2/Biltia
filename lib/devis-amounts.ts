// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Calcul PUR des montants d'un devis / avenant (HT, TVA par ligne, TTC).
//
// C'est le cœur du principe « l'objet d'abord » : le SERVEUR calcule les montants,
// jamais le LLM. Ce module n'importe rien et est testable par node:test.
// ─────────────────────────────────────────────────────────────────────────────

export interface DevisLineInput {
  designation: string;
  quantite?: number | null;
  unite?: string | null;
  prix_unitaire_ht: number;
  taux_tva?: number | null;
}

export interface ComputedLine {
  designation: string;
  quantite: number;
  unite: string | null;
  prix_unitaire_ht: number;
  taux_tva: number;
  total_ht: number;
  position: number;
}

export interface DevisTotals {
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Normalise et calcule le total HT de chaque ligne (quantité × PU HT). */
export function computeDevisLines(lines: DevisLineInput[]): ComputedLine[] {
  return lines.map((l, i) => {
    const quantite = Number(l.quantite) > 0 ? Number(l.quantite) : 1;
    const prix = Number(l.prix_unitaire_ht) || 0;
    // TVA par défaut 20 % (France neuf) ; le LLM passe 10 ou 5,5 en rénovation.
    const taux = l.taux_tva == null ? 20 : Number(l.taux_tva);
    const tauxOk = Number.isFinite(taux) && taux >= 0 ? taux : 20;
    return {
      designation: String(l.designation ?? "").trim(),
      quantite,
      unite: l.unite ?? null,
      prix_unitaire_ht: round2(prix),
      taux_tva: tauxOk,
      total_ht: round2(quantite * prix),
      position: i,
    };
  });
}

/** Totaux du document à partir des lignes calculées (TVA par ligne, puis somme). */
export function computeDevisTotals(lines: ComputedLine[]): DevisTotals {
  let ht = 0;
  let tva = 0;
  for (const l of lines) {
    ht += l.total_ht;
    tva += l.total_ht * (l.taux_tva / 100);
  }
  ht = round2(ht);
  tva = round2(tva);
  return { montant_ht: ht, montant_tva: tva, montant_ttc: round2(ht + tva) };
}
