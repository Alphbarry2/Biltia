// ─────────────────────────────────────────────────────────────────────────────
// /api/modules/versions?moduleId=… — HISTORIQUE des versions d'une application.
//
// Lecture seule, via le client ADMIN (la table `module_versions` n'a pas encore
// de policy en prod), tenant TOUJOURS vérifié en amont. On ne renvoie PAS le HTML
// complet de chaque version (lourd) : seulement les métadonnées (version, type de
// changement, description, date, auteur). Le HTML est récupéré au moment du
// rollback (/api/modules/restore).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";
import { listModuleVersions } from "@/lib/module-versions";

export async function GET(req: Request) {
  const locale = await getLocale();
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

  const url = new URL(req.url);
  const moduleId = url.searchParams.get("moduleId") ?? "";
  if (!moduleId)
    return NextResponse.json({ error: pick(locale, "moduleId requis.", "moduleId is required.") }, { status: 400 });

  // Le module appartient-il bien au tenant ? (RLS + filtre explicite.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (t: string) => (supabase.from as any)(t);
  const { data: mod } = await from("modules")
    .select("id")
    .eq("id", moduleId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!mod)
    return NextResponse.json(
      { error: pick(locale, "Application introuvable.", "Application not found.") },
      { status: 404 }
    );

  const admin = createAdminClient();
  const rows = await listModuleVersions(admin, tenantId, moduleId, 50);

  const versions = rows.map((r) => {
    const descr = r.description ?? "";
    const m = descr.match(/^\[([a-z_]+)\]\s*(.*)$/);
    return {
      id: r.id,
      version: r.version,
      changeType: m ? m[1] : "manual_edit",
      description: m ? m[2] : descr,
      createdAt: r.created_at,
      createdBy: r.created_by,
    };
  });

  return NextResponse.json({ versions });
}
