// ─────────────────────────────────────────────────────────────────────────────
// /api/invitation/complete — appelée par /invitation juste après que l'invité a
// RÉELLEMENT choisi son mot de passe (supabase.auth.updateUser). Marque sa
// membership comme acceptée (accepted_at), pour que la fiche « Équipe » de
// l'admin distingue enfin En attente / Actif au lieu de toujours afficher accepté.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  await admin
    .from("tenant_members")
    .update({ accepted_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("accepted_at", null);

  return NextResponse.json({ ok: true });
}
