import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/account — suppression définitive du compte (RGPD).
// L'utilisateur confirme côté client en tapant « SUPPRIMER ». La suppression
// auth.users cascade sur profiles, memberships, conversations, reports…
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  let confirmation = "";
  try {
    const body = await req.json();
    confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
  } catch {
    /* corps manquant */
  }
  if (confirmation !== "SUPPRIMER") {
    return NextResponse.json(
      { error: "Confirmation invalide : tapez SUPPRIMER pour valider." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Suppression indisponible (configuration serveur incomplète)." },
      { status: 503 }
    );
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
