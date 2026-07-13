// ─────────────────────────────────────────────────────────────────────────────
// /api/workspace/custom-entities — REGISTRE des entités personnalisées (Phase 3).
//
// GET : liste les définitions d'entités custom du tenant (schéma, champs typés,
// statuts, relations). Permet au Workspace / au copilote / à une nouvelle app de
// RÉUTILISER une entité déjà définie au lieu d'en recréer une (anti-silo).
// Lecture via le client ADMIN (tenant vérifié en amont ; la table n'a pas encore
// de policy en prod tant que 044 n'est pas appliquée).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { listCustomEntities } from "@/lib/custom-entities";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

export async function GET() {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  }

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership) {
    return NextResponse.json(
      { error: pick(locale, "Aucun espace de travail.", "No workspace found.") },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const entities = await listCustomEntities(admin, membership.tenant_id);

  return NextResponse.json({
    entities: entities.map((e) => ({
      key: e.key,
      name: e.name,
      description: e.description ?? "",
      aliases: e.aliases ?? [],
      statuses: e.statuses ?? [],
      fields: e.fields ?? [],
      relations: e.relations ?? [],
      recordCollection: e.key, // les enregistrements vivent dans app_records (collection == key)
    })),
  });
}
