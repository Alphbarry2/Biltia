// ─────────────────────────────────────────────────────────────────────────────
// GARDE ANTI-PRODUCTION partagée par tous les scripts d'intégration.
// Refuse de s'exécuter sauf si TOUTES les conditions sont vraies :
//   - BILTIA_INTEGRATION_TEST=1
//   - ALLOW_REMOTE_TEST_DB=1
//   - l'URL Supabase est LOCALE (127.0.0.1 / localhost)
//   - le project_ref n'est PAS un projet de production connu
//   - la clé service_role ne porte pas un ref de production (JWT décodé)
// Sort immédiatement (code 2) sinon. Ne jamais logguer une clé complète.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

// Liste d'INTERDICTION explicite (biltia PROD + Qyrvo).
export const PROD_REFS = ["docqrznkbtyctjqpvifu", "mrxbikcovwckwwaavpwe"];

const LOCAL_RE = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|host\.docker\.internal|\[::1\])(:\d+)?(\/|$)/i;

function fail(msg) {
  console.error(`✗ GARDE INTÉGRATION — refus : ${msg}`);
  process.exit(2);
}

/** Décode le payload d'un JWT sans vérifier la signature (pour lire `ref`). */
function jwtRef(key) {
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

export function assertLocalIntegrationEnv() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (process.env.BILTIA_INTEGRATION_TEST !== "1") fail("BILTIA_INTEGRATION_TEST=1 absent.");
  if (process.env.ALLOW_REMOTE_TEST_DB !== "1") fail("ALLOW_REMOTE_TEST_DB=1 absent.");
  if (!url) fail("SUPABASE_URL absente.");
  if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY absente.");
  if (!LOCAL_RE.test(url)) fail(`URL non locale (${url.replace(/\/\/.*@/, "//***@").slice(0, 40)}…).`);
  for (const ref of PROD_REFS) {
    if (url.includes(ref)) fail(`URL correspond à un projet de PRODUCTION (${ref}).`);
  }
  const ref = jwtRef(serviceKey);
  if (ref && PROD_REFS.includes(ref)) fail(`la clé service_role porte un ref de PRODUCTION (${ref}).`);
  return { url, serviceKey };
}

/** Client service_role, uniquement après la garde. */
export function adminClient() {
  const { url, serviceKey } = assertLocalIntegrationEnv();
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** Forge un JWT utilisateur HS256 signé avec le secret LOCAL (aucune dépendance). */
export function mintUserJwt(userId, secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ sub: userId, role: "authenticated", aud: "authenticated", iss: "supabase-demo", iat: now, exp: now + 3600 });
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/** Client de SESSION (RLS active, auth.uid() = userId). Local uniquement. */
export function sessionClient(userId) {
  const { url } = assertLocalIntegrationEnv();
  const anon = process.env.SUPABASE_ANON_KEY || "";
  const secret = process.env.SUPABASE_JWT_SECRET || "";
  if (!anon || !secret) fail("SUPABASE_ANON_KEY et SUPABASE_JWT_SECRET requis pour le mode session.");
  const jwt = mintUserJwt(userId, secret);
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

/** Ids des utilisateurs de test (fixés par le seed). */
export const TEST_USERS = {
  ownerA: "11111111-1111-1111-1111-111111111111",
  memberA: "22222222-2222-2222-2222-222222222222",
  ownerB: "33333333-3333-3333-3333-333333333333",
  ownerEmpty: "44444444-4444-4444-4444-444444444444",
};

/** Résout les ids des tenants de test (créés par le seed) par leur nom-préfixe. */
export async function testTenantIds(db) {
  const { data } = await db
    .from("tenants")
    .select("id, name")
    .ilike("name", "BILTIA_TEST_%");
  const byName = (frag) => (data ?? []).find((t) => String(t.name).includes(frag))?.id ?? null;
  return {
    A: byName("TENANT_A"),
    B: byName("TENANT_B"),
    EMPTY: byName("TENANT_EMPTY"),
  };
}

let passed = 0;
let failed = 0;
export function check(name, cond) {
  if (cond) { passed += 1; console.log(`  ok  ${name}`); }
  else { failed += 1; console.error(`  KO  ${name}`); }
}
export function summary(label) {
  console.log(`\n[${label}] ${passed} ok, ${failed} KO`);
  if (failed > 0) process.exitCode = 1;
  return failed === 0;
}
