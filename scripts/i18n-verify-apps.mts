// ─────────────────────────────────────────────────────────────────────────────
// VÉRIFICATION DURE de la traduction des apps phares.
//
// Une traduction par dictionnaire est puissante mais dangereuse : un remplacement
// mal placé casse l'app en silence. Ce script refuse le doute — il compare le HTML
// FR et le HTML EN et exige que TOUT ce qui n'est pas du texte soit IDENTIQUE :
//   · noms d'entités passés au SDK (biltia.list("chantiers")…),
//   · ids, classes, valeurs d'<option> (= valeurs stockées),
//   · blocs <style>, nombre de balises,
//   · et le JS doit toujours COMPILER (une apostrophe mal échappée = app blanche).
// Enfin il traque le français résiduel dans le texte AFFICHÉ de la sortie EN.
// ─────────────────────────────────────────────────────────────────────────────
import { FLAGSHIP_APPS } from "../lib/flagship-apps";
import { localizeAppHtml } from "../lib/app-html-i18n";
import { ENTITIES } from "../lib/data-entities";
import { Script } from "node:vm";
import { writeFileSync } from "node:fs";

const all = (s: string, re: RegExp): string[] => [...s.matchAll(re)].map((m) => m[1]);

const entities = (s: string) => all(s, /biltia\.(?:list|create|update|remove|get|count)\(\s*["']([^"']+)["']/g);
const ids = (s: string) => all(s, /\bid="([^"]*)"/g);
const classes = (s: string) => all(s, /\bclass="([^"]*)"/g);
const optionValues = (s: string) => all(s, /<option[^>]*\bvalue="([^"]*)"/g);
const styles = (s: string) => s.match(/<style[\s\S]*?<\/style>/gi) ?? [];
const tagCount = (s: string) => (s.match(/<[a-zA-Z][^>]*>/g) ?? []).length;
const scripts = (s: string) => [...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// ── Détection du français résiduel ───────────────────────────────────────────
// Signal fort : un diacritique français. Signal complémentaire : des mots-outils
// qui n'existent pas en anglais (« client » ou « pour » n'en sont PAS : « Pour the
// slab » est de l'anglais parfait — c'est le verbe « couler »).
const DIACRITICS = /[éèêëàâäùûüôöîïçœÉÈÊÀÂÙÔÎÇŒ]/;
const FR_ONLY =
  /(?<![A-Za-zÀ-ÿ0-9_-])(aucun|aucune|avec|vos|votre|sur|dans|des|une|les|leur|cette|chaque|tous|toutes|nouveau|nouvelle|jour|jours|semaine|mois|heures|prix|prochain|depuis|selon|sans|entre|puis|encore|déjà|ajouter|supprimer|modifier|enregistrer|annuler|fermer|voir|tout|rien)(?![A-Za-zÀ-ÿ0-9_-])/i;

// Ce qui EST censé rester en français-ish : les noms d'entités et de colonnes.
const DATA_KEYS = new Set<string>();
for (const [key, def] of Object.entries(ENTITIES)) {
  DATA_KEYS.add(key);
  for (const c of def.writable) DATA_KEYS.add(c);
}

// Français ASSUMÉ : ce sont des DONNÉES ou du code, jamais du texte à l'écran.
// Les traduire casserait quelque chose — c'est écrit ici pour qu'on s'en souvienne.
const EXPECTED_FR = new Set([
  "jour",             // planning : id de vue (S.view === "jour")
  "nouveau",          // CRM : valeur d'étape ÉCRITE en base (etape:"nouveau")
  "tous",             // état interne du filtre (S.filter === "tous")
  "œuvre) ── */",     // fragment de commentaire JS
]);

function jsStrings(src: string): string[] {
  const found: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      let buf = "";
      while (j < src.length) {
        const d = src[j];
        if (d === "\\") { buf += src[j + 1] === "n" ? "\n" : src[j + 1]; j += 2; continue; }
        if (d === q || d === "\n") break;
        buf += d;
        j++;
      }
      found.push(buf);
      i = j + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    i++;
  }
  return found;
}

function displayText(html: string): string[] {
  const noStyle = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  const out: string[] = [];
  const push = (s: string) => { const t = s.trim(); if (t) out.push(t); };
  const fromMarkup = (m: string) => {
    for (const x of m.matchAll(/>([^<>]+)</g)) push(x[1]);
    for (const x of m.matchAll(/(placeholder|title|aria-label|alt)="([^"]*)"/g)) push(x[2]);
    const tail = m.match(/>([^<>]+)$/); if (tail) push(tail[1]);
    const head = m.match(/^([^<>]+)</); if (head) push(head[1]);
  };
  for (const sc of noStyle.match(/<script[\s\S]*?<\/script>/gi) ?? []) {
    for (const lit of jsStrings(sc)) {
      if (/<[a-zA-Z/]/.test(lit)) fromMarkup(lit);
      else push(lit);
    }
  }
  fromMarkup(noStyle.replace(/<script[\s\S]*?<\/script>/gi, ""));
  return out;
}

let failures = 0;
const fail = (app: string, msg: string) => { failures++; console.log(`  ✗ [${app}] ${msg}`); };
const leftovers = new Set<string>();

for (const [id, app] of Object.entries(FLAGSHIP_APPS)) {
  const fr = app.html;
  const en = localizeAppHtml(fr, "en");
  const before = failures;

  if (fr === en) fail(id, "aucune traduction appliquée");
  if (!same(entities(fr), entities(en))) fail(id, "noms d'entités SDK modifiés");
  if (!same(ids(fr), ids(en))) fail(id, "ids modifiés");
  if (!same(classes(fr), classes(en))) fail(id, "classes CSS modifiées");
  if (!same(optionValues(fr), optionValues(en))) fail(id, "valeurs d'<option> (stockées) modifiées");
  if (!same(styles(fr), styles(en))) fail(id, "bloc <style> modifié");
  if (tagCount(fr) !== tagCount(en)) fail(id, `nombre de balises ${tagCount(fr)} → ${tagCount(en)}`);
  if (!/<html[^>]*lang="en"/i.test(en)) fail(id, 'lang="en" absent');

  const se = scripts(en);
  if (scripts(fr).length !== se.length) fail(id, "nombre de <script> différent");
  se.forEach((code, i) => {
    try { new Script(code); } catch (e) { fail(id, `<script>#${i} ne compile plus : ${(e as Error).message}`); }
  });

  const fr_left = [...new Set(displayText(en))].filter(
    (t) => !DATA_KEYS.has(t) && !EXPECTED_FR.has(t) && (DIACRITICS.test(t) || FR_ONLY.test(t))
  );
  fr_left.forEach((t) => leftovers.add(t));
  console.log(`${failures === before ? "✓" : "✗"} ${id.padEnd(20)} ${fr_left.length ? `⚠ ${fr_left.length} résidu(s) FR` : "propre"}`);
}

const list = [...leftovers].sort();
if (list.length) {
  console.log(`\n⚠ ${list.length} résidu(s) FR à traiter :`);
  list.forEach((l) => console.log("  " + JSON.stringify(l.slice(0, 100))));
} else {
  console.log("\n✓ Aucun français résiduel à l'écran.");
}
const ok = failures === 0 && list.length === 0;
console.log(`\n${ok ? "✅ 10/10 apps : structure, données et JS intacts, interface 100 % EN" : "❌ À CORRIGER"}`);
process.exit(ok ? 0 : 1);
