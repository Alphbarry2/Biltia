// ─────────────────────────────────────────────────────────────────────────────
// /api/data — CRUD générique sur les entités partagées du workspace (Étape 2).
//
// Sécurité (défense en profondeur) :
//   1. Same-origin obligatoire (anti-CSRF) — seuls les modules servis par Batify.
//   2. Auth de session (cookies) → rôle `authenticated`.
//   3. Whitelist d'entités (ALLOWED_ENTITIES) — pas d'accès à user_credits, audit_logs…
//   4. tenant_id FORCÉ côté serveur (jamais fourni par le client).
//   5. RLS Postgres : isolation tenant + rôle, appliquée quoi qu'il arrive.
//   6. Colonnes inscriptibles whitelistées — le reste est ignoré.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { ENTITIES, ALLOWED_ENTITIES } from "@/lib/data-entities";

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // srcdoc / requêtes sans Origin → tolérées (same-origin)
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

function sanitize(values: unknown, writable: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!values || typeof values !== "object") return out;
  const v = values as Record<string, unknown>;
  for (const key of writable) {
    if (key in v) out[key] = v[key];
  }
  return out;
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Aucun espace de travail." }, { status: 403 });
  }
  const tenantId = membership.tenant_id;

  let body: {
    entity?: string;
    action?: string;
    id?: string;
    values?: unknown;
    match?: Record<string, unknown>;
    columns?: string;
    order?: string;
    ascending?: boolean;
    limit?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const entity = body.entity ?? "";
  const action = body.action ?? "";

  if (!ALLOWED_ENTITIES.includes(entity)) {
    return NextResponse.json({ error: `Entité non autorisée : ${entity}` }, { status: 400 });
  }
  const def = ENTITIES[entity];

  // Accès dynamique à la table : l'entité est validée par whitelist ci-dessus,
  // mais le client typé n'accepte pas un nom de table variable → cast contrôlé.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (t: string) => (supabase.from as any)(t);

  try {
    if (action === "list") {
      let q = from(def.table)
        .select(typeof body.columns === "string" ? body.columns : "*")
        .eq("tenant_id", tenantId);
      if (body.match && typeof body.match === "object") q = q.match(body.match);
      if (typeof body.order === "string") {
        q = q.order(body.order, { ascending: body.ascending !== false });
      }
      q = q.limit(Math.min(Number(body.limit) || 200, 500));
      const { data, error } = await q;
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (action === "get") {
      if (!body.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
      const { data, error } = await from(def.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", body.id)
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (action === "create") {
      const values = sanitize(body.values, def.writable);
      const { data, error } = await from(def.table)
        .insert({ ...values, tenant_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (action === "update") {
      if (!body.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
      const values = sanitize(body.values, def.writable);
      const { data, error } = await from(def.table)
        .update(values)
        .eq("tenant_id", tenantId)
        .eq("id", body.id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
      const { error } = await from(def.table)
        .delete()
        .eq("tenant_id", tenantId)
        .eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur base de données.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
