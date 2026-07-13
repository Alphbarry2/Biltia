// ─────────────────────────────────────────────────────────────────────────────
// /api/modules/restore — ROLLBACK sécurisé vers une version antérieure (4.3).
//
// Restaure le HTML d'une version passée. Garanties :
//   • tenant vérifié + RBAC + gel lecture seule ;
//   • l'ÉTAT ACTUEL est d'abord figé comme version (on peut annuler le rollback) ;
//   • `modules.version` incrémenté ;
//   • journalisé ;
//   • NE TOUCHE JAMAIS aux données du workspace (seule la table `modules` change) —
//     restaurer une ancienne UI ne réécrit pas les clients/chantiers/devis.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { can } from "@/lib/permissions";
import { getEntitlementsForTenant, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";
import { logActivity } from "@/lib/activity";
import { getModuleVersion, hasVersions, snapshotModuleVersion } from "@/lib/module-versions";

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const locale = await getLocale();

  if (!sameOrigin(req)) {
    return NextResponse.json({ error: pick(locale, "Origine non autorisée.", "Origin not allowed.") }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership)
    return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });
  const tenantId = membership.tenant_id;

  if (!can(membership.role, "ai.create")) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Votre rôle ne permet pas de restaurer une application.",
          "Your role does not allow restoring an application."
        ),
      },
      { status: 403 }
    );
  }

  const ent = await getEntitlementsForTenant(supabase, tenantId);
  if (!ent.writable) {
    return NextResponse.json({ error: frozenMessage(locale), frozen: true }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Historique indisponible (configuration serveur).",
          "History unavailable (server configuration)."
        ),
      },
      { status: 503 }
    );
  }

  let body: { moduleId?: string; versionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }
  const moduleId = typeof body.moduleId === "string" ? body.moduleId : "";
  const versionId = typeof body.versionId === "string" ? body.versionId : "";
  if (!moduleId || !versionId) {
    return NextResponse.json(
      { error: pick(locale, "moduleId et versionId requis.", "moduleId and versionId are required.") },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (t: string) => (supabase.from as any)(t);

  // Module courant (tenant vérifié par RLS + filtre explicite).
  const { data: mod, error: modErr } = await from("modules")
    .select("id, tenant_id, html_content, version, name, kind, created_by")
    .eq("id", moduleId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (modErr) return NextResponse.json({ error: modErr.message }, { status: 400 });
  if (!mod)
    return NextResponse.json(
      { error: pick(locale, "Application introuvable.", "Application not found.") },
      { status: 404 }
    );

  // Version cible (tenant + module vérifiés).
  const target = await getModuleVersion(admin, tenantId, moduleId, versionId);
  if (!target || typeof target.code !== "string" || !target.code) {
    return NextResponse.json({ error: pick(locale, "Version introuvable.", "Version not found.") }, { status: 404 });
  }

  const currentHtml = typeof mod.html_content === "string" ? mod.html_content : "";
  const currentVersion = Number(mod.version) || 1;

  // Figer l'état ACTUEL avant de restaurer (permet d'annuler le rollback), si
  // absent de l'historique (legacy).
  if (currentHtml && !(await hasVersions(admin, moduleId))) {
    await snapshotModuleVersion(admin, {
      moduleId,
      tenantId,
      userId: mod.created_by ?? user.id,
      version: currentVersion,
      html: currentHtml,
      changeType: "manual_edit",
      changeDescription: "État avant restauration",
    });
  }

  const newVersion = currentVersion + 1;
  const { error: upErr } = await from("modules")
    .update({
      html_content: target.code,
      version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", moduleId)
    .eq("tenant_id", tenantId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  await snapshotModuleVersion(admin, {
    moduleId,
    tenantId,
    userId: user.id,
    version: newVersion,
    html: target.code,
    changeDescription: `Restauration de la version ${target.version}`,
    changeType: "rollback",
  });

  await logActivity(supabase, {
    tenantId,
    userId: user.id,
    action: "update",
    entityType: mod.kind === "document" ? "document" : "application",
    entityId: moduleId,
    description: `« ${mod.name} » restauré à la version ${target.version} (v${newVersion})`,
  });

  // Télémétrie d'usage (Phase 10) : taux de rollback.
  try {
    await from("app_events").insert({
      user_id: user.id,
      tenant_id: tenantId,
      event_type: "rollback_used",
      metadata: { source: "app", module_id: moduleId, to_version: target.version },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true, moduleId, version: newVersion, html: target.code });
}
