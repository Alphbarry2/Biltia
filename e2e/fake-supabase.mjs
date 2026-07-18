// Couche Supabase EN MÉMOIRE — fidèle à la surface de requêtes RÉELLEMENT utilisée
// par le code (runWorkspaceTool / verifyAction / searchWorkspace / logActivity) :
//   .from(t).select(cols).eq().neq().ilike().in().order().limit().maybeSingle()/.single()
//   .from(t).insert(payload).select().single()
//   .from(t).update(vals).eq()…  .select().single()
//   .from(t).delete().eq()…     (awaitable)
//
// Le tenant est enforced par le CODE (chaque requête fait .eq("tenant_id", …)). Ce
// n'est PAS la RLS Postgres (voir le rapport : la RLS réelle exige un vrai Postgres,
// non disponible ici). Projection des colonnes du select → détecte un selectFields
// incomplet. IDs générés déterministes (compteur), created_at séquentiel.
//
// eslint-disable — fichier de test, hors périmètre applicatif.

let idSeq = 1000;
let clockSeq = 0;
const nextId = (table) => `gen_${table}_${++idSeq}`;
const nextClock = () => `2026-01-01T00:00:${String(clockSeq++).padStart(2, "0")}.000Z`;

function matchRow(row, filters) {
  for (const f of filters) {
    const v = row[f.col];
    if (f.op === "eq" && String(v ?? "") !== String(f.val)) return false;
    if (f.op === "neq" && String(v ?? "") === String(f.val)) return false;
    if (f.op === "in" && !f.vals.map(String).includes(String(v ?? ""))) return false;
    if (f.op === "ilike") {
      const needle = String(f.pattern).replace(/%/g, "").toLowerCase();
      if (typeof v !== "string" || !v.toLowerCase().includes(needle)) return false;
    }
  }
  return true;
}

function project(row, cols) {
  if (!cols || cols === "*") return { ...row };
  const keys = cols.split(",").map((c) => c.trim()).filter(Boolean);
  const out = {};
  for (const k of keys) out[k] = row[k];
  return out;
}

export function createFakeSupabase(seed = {}, opts = {}) {
  // store: { table: [rows] }
  const store = {};
  for (const [t, rows] of Object.entries(seed)) store[t] = rows.map((r) => ({ ...r }));
  const audit = { reads: 0, writes: 0 };
  // Simule une mise à jour qui N'ABOUTIT PAS en base (panne locale) : l'outil
  // renvoie ok, mais la relecture de vérification trouvera l'ancienne valeur → mismatch.
  const blockUpdates = opts.blockUpdates || new Set();

  function from(table) {
    if (!store[table]) store[table] = [];
    let cols = "*";
    const filters = [];
    let orderCol = null;
    let limitN = Infinity;
    let op = "select";
    let payload = null;

    const rowsMatching = () => store[table].filter((r) => matchRow(r, filters));

    const runSelect = () => {
      audit.reads++;
      let rows = rowsMatching();
      if (orderCol) rows = [...rows].sort((a, b) => String(b[orderCol] ?? "").localeCompare(String(a[orderCol] ?? "")));
      rows = rows.slice(0, limitN).map((r) => project(r, cols));
      return rows;
    };

    const runWrite = () => {
      if (op === "insert") {
        const rows = Array.isArray(payload) ? payload : [payload];
        const created = rows.map((r) => {
          const row = { id: r.id ?? nextId(table), created_at: nextClock(), ...r };
          store[table].push(row);
          return row;
        });
        audit.writes += created.length;
        return created;
      }
      if (op === "update") {
        const targets = rowsMatching();
        for (const t of targets) {
          if (blockUpdates.has(`${table}:${t.id}`)) continue; // panne simulée : non appliqué
          Object.assign(t, payload);
        }
        audit.writes += targets.length;
        return targets.map((r) => ({ ...r }));
      }
      if (op === "delete") {
        const keep = [];
        const removed = [];
        for (const r of store[table]) (matchRow(r, filters) ? removed : keep).push(r);
        store[table] = keep;
        audit.writes += removed.length;
        return removed;
      }
      return [];
    };

    const settle = () => {
      const rows = op === "select" ? runSelect() : runWrite().map((r) => project(r, cols));
      return { data: rows, error: null };
    };

    const builder = {
      select(c) {
        if (typeof c === "string") cols = c;
        return builder;
      },
      insert(p) {
        op = "insert";
        payload = p;
        return builder;
      },
      update(vals) {
        op = "update";
        payload = vals;
        return builder;
      },
      delete() {
        op = "delete";
        return builder;
      },
      eq(col, val) {
        filters.push({ op: "eq", col, val });
        return builder;
      },
      neq(col, val) {
        filters.push({ op: "neq", col, val });
        return builder;
      },
      ilike(col, pattern) {
        filters.push({ op: "ilike", col, pattern });
        return builder;
      },
      in(col, vals) {
        filters.push({ op: "in", col, vals });
        return builder;
      },
      order(col) {
        orderCol = col;
        return builder;
      },
      limit(n) {
        limitN = n;
        return builder;
      },
      maybeSingle() {
        const { data } = settle();
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      single() {
        const { data } = settle();
        if (!data.length) return Promise.resolve({ data: null, error: { message: "No rows", code: "PGRST116" } });
        return Promise.resolve({ data: data[0], error: null });
      },
      then(resolve, reject) {
        return Promise.resolve(settle()).then(resolve, reject);
      },
    };
    return builder;
  }

  return { from, __store: store, __audit: audit };
}
