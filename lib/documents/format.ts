// ─────────────────────────────────────────────────────────────────────────────
// FORMATAGE FR partagé par le PDF et l'email. Un même devis annoncé « 7 686,00 € »
// dans le mail et « 7686 € » dans la pièce jointe, c'est un client qui doute.
// Un seul formateur, deux surfaces.
// ─────────────────────────────────────────────────────────────────────────────

/** Espace insécable classique (U+00A0). `toLocaleString("fr-FR")` produit une
 *  espace fine insécable (U+202F) que Helvetica — la police du PDF — ne sait pas
 *  dessiner : elle sortirait en carré vide au milieu des montants. */
const NBSP = " ";

export function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const s = v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${s.replace(/ | | /g, NBSP)}${NBSP}€`;
}

export function qty(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/ | | /g, NBSP);
}

export function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
