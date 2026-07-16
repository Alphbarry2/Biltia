// ─────────────────────────────────────────────────────────────────────────────
// /api/team/resend — { memberId } relance l'invitation d'un membre EN ATTENTE
// (jamais rejoint). Repousse invited_at de 24h (le jeton signé déjà envoyé,
// cf. lib/invite-link.ts, redevient valide puisque son expiration se vérifie
// contre invited_at, pas contre le jeton lui-même) et renvoie l'email. Réservé
// owner/admin.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";
import { sendEmail } from "@/lib/mailer";
import { signInviteToken } from "@/lib/invite-link";
import { brandedEmailHtml } from "@/lib/branded-email";
import { logActivity } from "@/lib/activity";

const MANAGER_ROLES = ["owner", "admin"];

export async function POST(req: Request) {
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
  if (!MANAGER_ROLES.includes(membership.role)) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Seul le propriétaire ou un admin peut relancer une invitation.",
          "Only the owner or an admin can resend an invitation."
        ),
      },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: pick(locale, "Gestion d'équipe indisponible.", "Team management is unavailable.") },
      { status: 503 }
    );
  }

  let body: { memberId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }
  if (!body.memberId) {
    return NextResponse.json(
      { error: pick(locale, "memberId requis.", "memberId is required.") },
      { status: 400 }
    );
  }

  const { data: target } = await admin
    .from("tenant_members")
    .select("id, user_id, accepted_at")
    .eq("id", body.memberId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json(
      { error: pick(locale, "Membre introuvable.", "Member not found.") },
      { status: 404 }
    );
  }
  if (target.accepted_at) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Ce collaborateur a déjà rejoint l'équipe.",
          "This collaborator has already joined the team."
        ),
      },
      { status: 400 }
    );
  }

  const { data: u, error: userErr } = await admin.auth.admin.getUserById(target.user_id);
  if (userErr || !u?.user?.email) {
    return NextResponse.json(
      { error: pick(locale, "Compte introuvable.", "Account not found.") },
      { status: 404 }
    );
  }

  // Relance la fenêtre de 24h — le jeton déjà envoyé par email redevient valide.
  await admin.from("tenant_members").update({ invited_at: new Date().toISOString() }).eq("id", target.id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("name")
    .eq("id", membership.tenant_id)
    .maybeSingle();
  const workspaceName = (tenantRow as { name?: string } | null)?.name || "votre équipe";
  const actionUrl = `${appUrl}/invitation?t=${signInviteToken(membership.tenant_id, target.user_id)}`;

  const bodyText = pick(
    locale,
    `${user.email} vous invite à nouveau à rejoindre « ${workspaceName} » sur Biltia. Cliquez pour définir votre mot de passe et rejoindre l'équipe.`,
    `${user.email} is inviting you again to join "${workspaceName}" on Biltia. Click to set your password and join the team.`
  );
  const res = await sendEmail({
    to: [u.user.email],
    subject: pick(locale, "Rejoignez votre équipe sur Biltia", "Join your team on Biltia"),
    text: `${bodyText}\n\n${actionUrl}`,
    html: brandedEmailHtml({
      heading: pick(locale, "Rejoignez votre équipe.", "Join your team."),
      body: bodyText,
      btnText: pick(locale, "Définir mon mot de passe", "Set my password"),
      btnUrl: actionUrl,
    }),
  });

  await logActivity(supabase, {
    tenantId: membership.tenant_id,
    userId: user.id,
    action: "update",
    entityType: "équipe",
    entityId: target.id,
    description: `Invitation renvoyée à ${u.user.email}`,
  });

  return NextResponse.json({ ok: true, emailSent: res.ok });
}
