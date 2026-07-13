// ─────────────────────────────────────────────────────────────────────────────
// IDENTITÉ VISUELLE SUR LES DOCUMENTS GÉNÉRÉS PAR L'IA (PV de réception, avenant,
// mise en demeure, attestation…).
//
// Les devis et factures du workspace passent par le moteur PDF serveur
// (business-doc.tsx). Les documents rédigés à la demande, eux, sont du HTML A4
// produit par le modèle : on ne peut pas leur demander de connaître le logo (une
// URL n'a rien à faire dans un prompt, et le modèle l'inventerait à moitié).
//
// On l'injecte donc APRÈS coup, comme la barre d'impression et les pavés de
// signature : plomberie garantie côté serveur, jamais déléguée au LLM.
// ─────────────────────────────────────────────────────────────────────────────

import type { BrandKit } from "@/lib/brand";
import { DEFAULT_PRIMARY } from "@/lib/brand";

const MARKER = "__biltia_doc_brand_v1__";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Pose le logo et la couleur de l'entreprise sur un document HTML généré.
 * Idempotent. Renvoie le HTML inchangé s'il n'y a rien à poser (ni logo ni
 * couleur choisie) — on n'alourdit pas un document pour rien.
 */
export function injectDocumentBrand(html: string, brand: BrandKit): string {
  if (html.includes(MARKER)) return html;

  const hasColor = brand.primary !== DEFAULT_PRIMARY;
  if (!brand.logoUrl && !hasColor) return html;

  const css: string[] = [`/* ${MARKER} */`];

  if (brand.logoUrl) {
    css.push(
      // Le logo se pose AU-DESSUS du nom de l'entreprise, dans le bloc émetteur
      // que le prompt impose déjà (.doc-header > .emitter > .emitter-name).
      `.emitter-logo{display:block;max-width:170px;max-height:56px;width:auto;height:auto;object-fit:contain;margin-bottom:8px}`,
      // Le nom reste écrit : un logo ne remplace pas une raison sociale sur un
      // document qui peut finir devant un juge.
      `@media print{.emitter-logo{max-height:48px}}`
    );
  }

  if (hasColor) {
    const p = brand.primary;
    css.push(
      `.doc-header{border-bottom-color:${p} !important}`,
      `.doc-title{color:${p} !important}`,
      `table.totals tr.grand{color:${p} !important}`,
      `.sheet{border-top:4px solid ${p}}`
    );
  }

  const styleTag = `<style>\n${css.join("\n")}\n</style>`;

  let out = html;

  // Le logo : dans CHAQUE feuille (un document long a plusieurs .sheet, chacune
  // avec son en-tête). On l'insère juste avant le nom de l'entreprise.
  if (brand.logoUrl) {
    const img = `<img class="emitter-logo" src="${esc(brand.logoUrl)}" alt="${esc(brand.entreprise)}">`;
    // Cible la première balise ouvrante qui porte la classe emitter-name, quel que
    // soit l'élément (div, h1, p…) et l'ordre des attributs.
    const re = /<([a-z][a-z0-9]*)([^>]*\bclass="[^"]*\bemitter-name\b[^"]*"[^>]*)>/gi;
    if (re.test(out)) {
      re.lastIndex = 0;
      out = out.replace(re, (m) => img + m);
    } else {
      // Le modèle n'a pas suivi la structure imposée : on retombe sur l'ouverture
      // du bloc émetteur. Mieux vaut un logo un peu haut que pas de logo.
      out = out.replace(/<div([^>]*\bclass="[^"]*\bemitter\b[^"]*"[^>]*)>/i, (m) => m + img);
    }
  }

  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `${styleTag}\n</head>`);
  if (/<body[^>]*>/i.test(out)) return out.replace(/<body[^>]*>/i, (m) => m + "\n" + styleTag);
  return styleTag + out;
}
