// ─────────────────────────────────────────────────────────────────────────────
// Extrait les chaînes FR AFFICHÉES des 10 apps phares.
//
// Ne garde QUE du texte destiné à l'humain. Jamais un id, une classe CSS, une
// clé d'entité, un nom de colonne ou une valeur d'enum : ce sont des DONNÉES,
// les traduire casserait les filtres, les agents et l'import/export.
//
// Le JS des apps construit son HTML par concaténation de chaînes → on tokenise
// proprement les littéraux (guillemets simples ET doubles, échappements), puis
// on ré-extrait le texte des fragments de markup qu'ils contiennent.
// ─────────────────────────────────────────────────────────────────────────────
import { FLAGSHIP_APPS } from "../lib/flagship-apps";
import { writeFileSync } from "node:fs";

const STYLE_RE = /<style[\s\S]*?<\/style>/gi;
const SCRIPT_RE = /<script[\s\S]*?<\/script>/gi;

// Littéraux JS, scan gauche→droite : une apostrophe dans "l'app" ne doit pas
// ouvrir une chaîne.
function jsStrings(src: string): string[] {
  const found: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let buf = "";
      while (j < src.length) {
        const d = src[j];
        if (d === "\\") {
          const n = src[j + 1];
          buf += n === "n" ? "\n" : n === "t" ? "\t" : n;
          j += 2;
          continue;
        }
        if (d === quote || d === "\n") break;
        buf += d;
        j++;
      }
      found.push(buf);
      i = j + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    i++;
  }
  return found;
}

const looksTechnical = (s: string): boolean =>
  /[<>]/.test(s) ||                    // bout de markup, pas du texte
  /="/.test(s) ||                      // bout d'attribut (concaténation SVG)
  /^[a-z0-9_]+$/.test(s) ||
  /^[a-z0-9-]+$/.test(s) ||
  /^[.#][\w-]+([\s>+~]+[\w.#-]+)*$/.test(s) || // sélecteur CSS (« #m-seg button ») — PAS « . Restant à… »
  /^https?:|^(data|mailto):/.test(s) ||
  /^\/\S*$/.test(s) ||                 // chemin — PAS le fragment « / facturé »
  /^[\d\s.,%€$+\-:/()×–—]*$/.test(s) ||
  /^[a-zA-Z]+([A-Z][a-z0-9]*)+$/.test(s) ||
  /^(px|em|rem|vh|vw|fr|auto|none|flex|grid|block|inline|absolute|relative|fixed|sticky|center|left|right|top|bottom|hidden|button|submit|text|number|date|email|tel|url|checkbox|radio|select|option|div|span|svg|path|true|false|null|undefined|GET|POST|PUT|PATCH|DELETE|Content-Type|application\/json)$/i.test(s);

const hasLetter = (s: string) => /[A-Za-zÀ-ÿ]/.test(s);
const looksHuman = (s: string): boolean =>
  hasLetter(s) &&
  s.trim().length >= 2 &&
  (/[À-ÿ]/.test(s) || /\s/.test(s) || /^[A-ZÀ-Ý]/.test(s) || /[?!:…'’]/.test(s));

type Hit = { text: string; apps: string[]; where: string[] };
const out = new Map<string, Hit>();
// Rejetés par looksHuman mais pas techniques : « dim », « lun », « janv. »… Des
// libellés courts en minuscules qui SONT affichés. On les sort pour revue.
const borderline = new Set<string>();
const add = (raw: string, app: string, where: string) => {
  const s = raw.trim();
  if (!s || !hasLetter(s) || s.length > 300) return;
  if (looksTechnical(s)) return;
  if (!looksHuman(s)) {
    borderline.add(s);
    return;
  }
  const hit = out.get(s) ?? { text: s, apps: [], where: [] };
  if (!hit.apps.includes(app)) hit.apps.push(app);
  if (!hit.where.includes(where)) hit.where.push(where);
  out.set(s, hit);
};

// Texte visible d'un fragment de markup : nœuds de texte + attributs lisibles.
function fromMarkup(markup: string, app: string, where: string) {
  for (const m of markup.matchAll(/>([^<>]+)</g)) add(m[1], app, where);
  for (const m of markup.matchAll(/(placeholder|title|aria-label|alt)="([^"]*)"/g)) add(m[2], app, where);
  const tail = markup.match(/>([^<>]+)$/); // fragment non refermé : ...>Texte
  if (tail) add(tail[1], app, where);
  const head = markup.match(/^([^<>]+)</); // fragment ouvert : Texte<...
  if (head) add(head[1], app, where);
}

for (const [id, app] of Object.entries(FLAGSHIP_APPS)) {
  const noStyle = app.html.replace(STYLE_RE, ""); // le CSS n'a pas de texte humain

  for (const sc of noStyle.match(SCRIPT_RE) ?? []) {
    for (const lit of jsStrings(sc)) {
      if (/<[a-zA-Z/]/.test(lit)) fromMarkup(lit, id, "js-html");
      else add(lit, id, "js");
    }
  }
  fromMarkup(noStyle.replace(SCRIPT_RE, ""), id, "html");
}

const hits = [...out.values()].sort((a, b) => b.text.length - a.text.length);
writeFileSync(new URL("./app-strings.json", import.meta.url), JSON.stringify(hits, null, 2));
writeFileSync(new URL("./app-strings-borderline.json", import.meta.url), JSON.stringify([...borderline].sort(), null, 2));
console.log("uniques:", hits.length, "| chars:", hits.reduce((n, h) => n + h.text.length, 0));
console.log("borderline (à revoir à la main):", borderline.size);
