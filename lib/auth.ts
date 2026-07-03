/**
 * Server-side auth & authorization helpers.
 * Never trust IDs from the client — always verify ownership server-side.
 */

import { createClient } from "./supabase-server";
import { NextResponse } from "next/server";

export type MemberRole = "owner" | "admin" | "manager" | "member" | "viewer";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};

export function hasRole(actual: MemberRole, required: MemberRole): boolean {
  return ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[required];
}

// ----------------------------------------------------------------
// Core: get the authenticated user or throw
// ----------------------------------------------------------------

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError("Unauthenticated", 401);
  }

  return { user, supabase };
}

// ----------------------------------------------------------------
// Tenant access
// ----------------------------------------------------------------

export async function requireTenantMember(
  tenantId: string,
  minimumRole: MemberRole = "viewer"
) {
  const { user, supabase } = await requireUser();

  const { data, error } = await supabase
    .from("tenant_members")
    .select("role, accepted_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .single();

  if (error || !data || !data.accepted_at) {
    throw new AuthError("Forbidden: not a member of this tenant", 403);
  }

  const role = data.role as MemberRole;

  if (!hasRole(role, minimumRole)) {
    throw new AuthError(
      `Forbidden: requires role '${minimumRole}', you have '${role}'`,
      403
    );
  }

  return { user, supabase, role };
}

// ----------------------------------------------------------------
// App access (verifies tenant ownership of the app too)
// ----------------------------------------------------------------

// Temporarily disabled - modules table not in Supabase types yet
// TODO: Regenerate Supabase types after adding modules migration
/*
export async function requireAppMember(
  appId: string,
  minimumRole: MemberRole = "viewer"
) {
  const { user, supabase } = await requireUser();

  // Fetch the app and verify it exists
  const { data: app, error: appError } = await supabase
    .from("modules")
    .select("id, tenant_id, status")
    .eq("id", appId)
    .single();

  if (appError || !app) {
    throw new AuthError("App not found", 404);
  }

  if (app.status === "suspended") {
    throw new AuthError("App is suspended", 403);
  }

  if (!app.tenant_id) {
    throw new AuthError("App has no tenant", 403);
  }

  // Check tenant membership
  const { data: member, error: memberError } = await supabase
    .from("tenant_members")
    .select("role, accepted_at")
    .eq("tenant_id", app.tenant_id)
    .eq("user_id", user.id)
    .single();

  if (memberError || !member || !member.accepted_at) {
    throw new AuthError("Forbidden: not a member of this app's tenant", 403);
  }

  const role = member.role as MemberRole;

  if (!hasRole(role, minimumRole)) {
    throw new AuthError(
      `Forbidden: requires role '${minimumRole}', you have '${role}'`,
      403
    );
  }

  return { user, supabase, role, app };
}
*/

// ----------------------------------------------------------------
// Audit logging (fire-and-forget from API routes)
// ----------------------------------------------------------------

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "permission_change"
  | "login"
  | "logout"
  | "export"
  | "invite"
  | "revoke";

export async function auditLog(params: {
  tenantId?: string;
  appId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  oldData?: unknown;
  newData?: unknown;
  request?: Request;
}) {
  try {
    const supabase = await createClient();
    const ip = params.request?.headers.get("x-forwarded-for") ?? null;
    const ua = params.request?.headers.get("user-agent") ?? null;

    // Les types générés typent les args RPC comme uuid non-null, alors que
    // log_audit accepte des null en base (tenant/app absents sur login/logout).
    // Cast ciblé — comportement d'exécution inchangé.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)("log_audit", {
      p_tenant_id: params.tenantId ?? null,
      p_app_id: params.appId ?? null,
      p_action: params.action,
      p_resource: params.resource,
      p_resource_id: params.resourceId ?? null,
      p_old_data: params.oldData ? JSON.stringify(params.oldData) : null,
      p_new_data: params.newData ? JSON.stringify(params.newData) : null,
      p_ip_address: ip,
      p_user_agent: ua,
    });
  } catch {
    // Never block the main flow on audit failure
  }
}

// ----------------------------------------------------------------
// Error class + handler for API routes
// ----------------------------------------------------------------

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export function handleAuthError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[auth] unexpected error", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
