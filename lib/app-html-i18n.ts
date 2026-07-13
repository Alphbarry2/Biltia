// ─────────────────────────────────────────────────────────────────────────────
// APPS PHARES EN ANGLAIS — traduction du HTML à la volée.
//
// Le français reste la SOURCE UNIQUE (data/app-*.ts). On ne duplique pas les 10
// fichiers : une copie EN dériverait au premier changement FR. On traduit donc
// le HTML au moment où il est servi (instanciation + aperçu), via un dictionnaire
// des chaînes AFFICHÉES (lib/app-strings-en.ts, régénérable par
// `npx tsx scripts/i18n-extract-apps.mts`).
//
// CE QU'ON NE TOUCHE JAMAIS — ce sont des DONNÉES, pas du texte :
//   · les noms d'entités et de colonnes (biltia.list("chantiers"), nom, statut…),
//   · les valeurs d'enum stockées (en_cours, depannage…),
//   · les ids, classes CSS et le contenu des <style>.
// Le dictionnaire ne contient que du texte humain (majuscule/accent/espace), et
// la frontière de mot inclut « - » : un id en kebab-case ne peut pas matcher.
//
// PIÈGE (le vrai) : dans le HTML final, le JS des apps est ÉCHAPPÉ — « l\'équipe »,
// « \n ». Nos clés, elles, sont « cuites ». Le motif tolère donc l'antislash
// optionnel, et la traduction est ré-échappée si elle atterrit dans un <script>.
// Sans ça : SyntaxError et app blanche.
// ─────────────────────────────────────────────────────────────────────────────

import type { Locale } from "./i18n/config";
import { APP_STRINGS_EN } from "./app-strings-en";

// Frontière de mot. Le « - » en fait partie pour qu'un id/classe (« ven-card »)
// ne puisse jamais matcher un libellé court (« ven »).
const B = "[A-Za-zÀ-ÿ0-9_-]";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Le HTML porte les chaînes JS échappées ; la clé est « cuite » → on tolère. */
function keyPattern(key: string): string {
  return escapeRe(key)
    .replace(/'/g, "\\\\?'")
    .replace(/"/g, '\\\\?"')
    .replace(/\n/g, "(?:\\\\n|\\n)");
}

/** Inverse : ce qu'on a matché dans le HTML → la clé du dictionnaire. */
const uncook = (m: string) => m.replace(/\\(['"])/g, "$1").replace(/\\n/g, "\n");

/** Un « ' » nu (ou un vrai saut de ligne) dans un littéral JS = SyntaxError.
 *  Échapper les DEUX quotes est valide quel que soit le délimiteur du littéral. */
const jsSafe = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/(['"])/g, "\\$1").replace(/\n/g, "\\n");

// Frontière GAUCHE. Subtilité qui coûte cher : dans le HTML, un saut de ligne JS
// s'écrit « \n » — deux caractères, dont la LETTRE n. Une phrase qui suit un
// « \n » est donc précédée d'un caractère de mot, et la frontière la refuserait.
// D'où la première branche : être précédé d'un échappement EST une frontière.
const LEFT = `(?:(?<=\\\\[nt])|(?<!${B}))`;

let matcher: RegExp | null = null;
function stringMatcher(): RegExp {
  if (matcher) return matcher;
  // Longues d'abord : « Nom du chantier » doit gagner contre « Nom ».
  const keys = Object.keys(APP_STRINGS_EN).sort((a, b) => b.length - a.length);
  matcher = new RegExp(`${LEFT}(?:${keys.map(keyPattern).join("|")})(?!${B})`, "g");
  return matcher;
}

function translate(segment: string, inScript: boolean): string {
  return segment.replace(stringMatcher(), (m) => {
    const en = APP_STRINGS_EN[uncook(m)];
    if (!en) return m;
    return inScript ? jsSafe(en) : en;
  });
}

// <style> · <script> · reste. Le CSS est intégralement épargné.
const SEGMENTS = /(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>)/gi;

/**
 * Traduit le HTML d'une app phare. `fr` → renvoyé tel quel (coût nul).
 */
export function localizeAppHtml(html: string, locale: Locale): string {
  if (locale !== "en") return html;

  const out = html
    .split(SEGMENTS)
    .map((seg) => {
      if (/^<style/i.test(seg)) return seg;
      if (/^<script/i.test(seg)) {
        // Les montants/dates sont formatés par l'app elle-même.
        return translate(seg, true).replace(/(["'])fr-FR\1/g, '$1en-US$1');
      }
      return translate(seg, false);
    })
    .join("");

  return out.replace(/(<html[^>]*\blang=")fr(")/i, "$1en$2");
}
