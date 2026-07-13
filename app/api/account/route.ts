import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/account — suppression définitive du compte (RGPD).
// L'utilisateur confirme côté client en tapant « SUPPRIMER » (« DELETE » en
// anglais) ; le client envoie TOUJOURS "SUPPRIMER" au serveur (contrat API).
// La suppression auth.users cascade sur profiles, memberships, conversations…
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
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
      {
        error: pick(
          locale,
          "Confirmation invalide : tapez SUPPRIMER pour valider.",
          "Invalid confirmation: type DELETE to confirm."
        ),
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Suppression indisponible (configuration serveur incomplète).",
          "Account deletion is unavailable (incomplete server configuration)."
        ),
      },
      { status: 503 }
    );
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
