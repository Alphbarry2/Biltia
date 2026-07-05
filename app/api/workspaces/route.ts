// ─────────────────────────────────────────────────────────────────────────────
// /api/workspaces — MULTI-ENTREPRISES : un workspace = une entreprise.
//
//   GET   → liste des workspaces de l'utilisateur (memberships acceptés) +
//           lequel est actif (cookie du sélecteur, sinon règle historique).
//   POST  → { name } crée un NOUVEAU workspace dont l'utilisateur est owner,
//           et le rend actif (cookie posé sur la réponse). Le nouvel espace
//           naît en plan Free — chaque workspace porte son propre abonnement.
//   PATCH → { tenantId, name } renomme un workspace. Réservé owner/admin
//           (vérifié ici ET par la policy RLS tenant_update_admin).
//
// Sécurité :
//   • Auth de session obligatoire.
//   • POST passe par la RPC SECURITY DEFINER create_workspace (migration 017) :
//     aucune policy INSERT sur tenants — la création est un acte contrôlé,
//     comme à l'inscription (handle_new_user). Limite : 10 espaces possédés.
//   • PATCH s'exécute avec le client de l'utilisateur → RLS fait foi.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { listWorkspaces, ACTIVE_TENANT_COOKIE } from "@/lib/tenant";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { logActivity } from "@/lib/activity";

const MANAGER_ROLES = ["owner", "admin"];

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) return null;
  return name;
}

async function requireUserContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Authentification requise." }, { status: 401 }) };
  }
  return { supabase, user };
}

export async function GET() {
  const ctx = await requireUserContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  const [workspaces, active] = await Promise.all([
    listWorkspaces(supabase, user.id),
    getActiveMembershipServer(supabase, user.id),
  ]);

  return NextResponse.json({
    workspaces: workspaces.map((w) => ({
      id: w.tenant_id,
      name: w.name,
      role: w.role,
      active: w.tenant_id === active?.tenant_id,
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await requireUserContext();
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;

  const body = await request.json().catch(() => ({}));
  const name = cleanName(body?.name);
  if (!name) {
    return NextResponse.json(
      { error: "Nom d'entreprise invalide (2 à 60 caractères)." },
      { status: 400 }
    );
  }

  // RPC SECURITY DEFINER (migration 017) : tenant + membership owner + activité.
  // Les types générés ne connaissent pas encore create_workspace → cast ciblé.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenantId, error } = await (supabase.rpc as any)("create_workspace", {
    p_name: name,
  });
  if (error || typeof tenantId !== "string") {
    const msg = error?.message ?? "";
    if (msg.includes("workspace limit")) {
      return NextResponse.json(
        { error: "Limite atteinte (10 espaces possédés)." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: "Création de l'espace impossible." }, { status: 500 });
  }

  const res = NextResponse.json({
    workspace: { id: tenantId, name, role: "owner", active: true },
  });
  // Le nouvel espace devient l'espace actif.
  res.cookies.set(ACTIVE_TENANT_COOKIE, tenantId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}

export async function PATCH(request: Request) {
  const ctx = await requireUserContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  const body = await request.json().catch(() => ({}));
  const name = cleanName(body?.name);
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId : null;
  if (!name || !tenantId) {
    return NextResponse.json(
      { error: "Nom d'entreprise invalide (2 à 60 caractères)." },
      { status: 400 }
    );
  }

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role, accepted_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member?.accepted_at || !MANAGER_ROLES.includes(member.role)) {
    return NextResponse.json(
      { error: "Seul un propriétaire ou admin peut renommer l'espace." },
      { status: 403 }
    );
  }

  // Client utilisateur → la policy RLS tenant_update_admin s'applique aussi.
  const { error } = await supabase.from("tenants").update({ name }).eq("id", tenantId);
  if (error) {
    return NextResponse.json({ error: "Renommage impossible." }, { status: 500 });
  }

  await logActivity(supabase, {
    tenantId,
    userId: user.id,
    action: "update",
    entityType: "workspace",
    entityId: tenantId,
    description: `Espace renommé en « ${name} »`,
  });

  return NextResponse.json({ workspace: { id: tenantId, name } });
}
