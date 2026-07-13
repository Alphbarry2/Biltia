// ─────────────────────────────────────────────────────────────────────────────
// BACKFILL DES VOCABULAIRES — met les fiches EXISTANTES au canonique.
//
// Le référentiel (lib/vocabulaires) ne protège que les écritures À VENIR. Les
// fiches déjà en base gardent leurs valeurs libres (« Chef d'équipe », « Gros
// œuvre », « Dépannage électrique »), donc restent INVISIBLES aux agents qui
// filtrent sur `chef_equipe`. Ce script les remet au canonique.
//
// Il n'invente RIEN : il applique EXACTEMENT la même table d'alias que le serveur
// (import direct du référentiel — impossible que les deux divergent). Ce qu'il ne
// sait pas résoudre, il le LISTE pour arbitrage humain plutôt que de le deviner.
//
//   node --env-file=.env.local --import tsx scripts/backfill-vocabulaires.ts        (rapport seul)
//   node --env-file=.env.local --import tsx scripts/backfill-vocabulaires.ts --apply (écrit)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { FIELD_VOCAB, normalizeFieldValue, vocabLabel, VOCABS } from "../lib/vocabulaires";

const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/** Les colonnes réellement présentes en base (le dépôt et la prod ont dérivé). */
async function existingColumns(table: string): Promise<Set<string>> {
  const { data, error } = await db.from(table).select("*").limit(1);
  if (error) return new Set();
  return new Set(Object.keys((data?.[0] ?? {}) as Record<string, unknown>));
}

type Fix = { table: string; id: string; field: string; from: string; to: string };
type Refus = { table: string; field: string; value: string; count: number; suggestions: string[] };

const fixes: Fix[] = [];
const refus = new Map<string, Refus>();

// Les champs à vocabulaire, groupés par table.
const parTable = new Map<string, string[]>();
for (const cle of Object.keys(FIELD_VOCAB)) {
  const [table, field] = cle.split(".");
  parTable.set(table, [...(parTable.get(table) ?? []), field]);
}

async function main() {
for (const [table, fields] of parTable) {
  const cols = await existingColumns(table);
  const present = fields.filter((f) => cols.has(f));
  if (!present.length) {
    const absents = fields.filter((f) => !cols.has(f));
    if (absents.length && cols.size === 0) console.log(`· ${table} : table vide ou absente — ignorée.`);
    else if (absents.length) console.log(`· ${table} : colonnes absentes en base (${absents.join(", ")}) — ignorées.`);
    continue;
  }

  const { data, error } = await db.from(table).select(["id", ...present].join(","));
  if (error) {
    console.log(`· ${table} : lecture impossible (${error.message})`);
    continue;
  }

  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const id = String(row.id);
    const patch: Record<string, unknown> = {};

    for (const field of present) {
      const raw = row[field];
      if (raw == null || String(raw).trim() === "") continue;
      const res = normalizeFieldValue(table, field, raw);

      if (res.ok) {
        if (res.changed) {
          patch[field] = res.value;
          fixes.push({ table, id, field, from: String(raw), to: String(res.value) });
        }
        continue;
      }

      // CAS PARTICULIER, révélé par la prod : un CORPS DE MÉTIER saisi dans le
      // champ RÔLE (« Menuisier », « Carreleur » — 9 valeurs distinctes). Le rôle
      // dit la place dans l'organisation, pas la compétence. On rétablit les deux :
      // rôle = compagnon, et le métier va dans `corps_metier` s'il est vide.
      if (table === "employees" && field === "role") {
        const metier = normalizeFieldValue("employees", "corps_metier", raw);
        if (metier.ok && metier.value && metier.value !== "autre") {
          patch.role = "compagnon";
          fixes.push({ table, id, field: "role", from: String(raw), to: "compagnon" });
          if (!row.corps_metier || String(row.corps_metier).trim() === "") {
            patch.corps_metier = metier.value;
            fixes.push({ table, id, field: "corps_metier", from: "(vide)", to: String(metier.value) });
          }
          continue;
        }
      }

      const cle = `${table}.${field}.${String(raw)}`;
      const prev = refus.get(cle);
      if (prev) prev.count++;
      else refus.set(cle, { table, field, value: String(raw), count: 1, suggestions: res.suggestions });
    }

    if (APPLY && Object.keys(patch).length) {
      const { error: upErr } = await db.from(table).update(patch).eq("id", id);
      if (upErr) console.log(`  ! ${table}/${id} : ${upErr.message}`);
    }
  }
}

// ── Rapport ──────────────────────────────────────────────────────────────────

const parChamp = new Map<string, number>();
for (const f of fixes) parChamp.set(`${f.table}.${f.field}`, (parChamp.get(`${f.table}.${f.field}`) ?? 0) + 1);

console.log(`\n${APPLY ? "✅ APPLIQUÉ" : "🔍 SIMULATION (ajoutez --apply pour écrire)"}\n`);
console.log(`── NORMALISÉ : ${fixes.length} valeur(s) ──`);
for (const [champ, n] of [...parChamp].sort((a, b) => b[1] - a[1])) {
  const exemples = fixes
    .filter((f) => `${f.table}.${f.field}` === champ)
    .slice(0, 3)
    .map((f) => `« ${f.from} » → ${f.to}`)
    .join(", ");
  console.log(`  ${champ.padEnd(28)} ${String(n).padStart(4)}   ${exemples}`);
}

const aArbitrer = [...refus.values()].sort((a, b) => b.count - a.count);
console.log(`\n── À ARBITRER : ${aArbitrer.length} valeur(s) distinctes, ${aArbitrer.reduce((s, r) => s + r.count, 0)} fiche(s) ──`);
if (!aArbitrer.length) console.log("  (aucune)");
for (const r of aArbitrer) {
  const vocabId = FIELD_VOCAB[`${r.table}.${r.field}`];
  const propositions = r.suggestions
    .slice(0, 3)
    .map((v) => (VOCABS[vocabId] ? vocabLabel(vocabId, v) : v))
    .join(" | ");
  console.log(`  ${r.table}.${r.field} = « ${r.value} » (${r.count} fiche(s))`);
  console.log(`      proches : ${propositions}`);
}
console.log(
  aArbitrer.length
    ? "\nCes valeurs ne sont PAS modifiées : elles restent telles quelles jusqu'à votre arbitrage.\n"
    : ""
);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
