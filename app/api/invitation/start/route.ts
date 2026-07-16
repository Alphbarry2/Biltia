// ─────────────────────────────────────────────────────────────────────────────
// /api/invitation/start — appelée par la page /invitation à chaque tentative
// (premier clic, second clic, autre appareil...). Vérifie le jeton d'équipe
// (24h glissantes depuis l'invitation, cf. lib/invite-link.ts) puis génère un
// lien de récupération Supabase FRAIS à usage unique. Un jeton jamais consommé
// tant que l'invité n'a pas réellement défini son mot de passe.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyInviteToken } from "@/lib/invite-link";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  let body: { t?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const parsed = verifyInviteToken(body.t ?? "");
  if (!parsed) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "invalid" }, { status: 503 });
  }

  const { data: member } = await admin
    .from("tenant_members")
    .select("invited_at")
    .eq("tenant_id", parsed.tenantId)
    .eq("user_id", parsed.userId)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  const invitedAt = member.invited_at ? new Date(member.invited_at).getTime() : 0;
  if (!invitedAt || Date.now() - invitedAt > MAX_AGE_MS) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const { data: u, error: userErr } = await admin.auth.admin.getUserById(parsed.userId);
  if (userErr || !u?.user?.email) {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }
  // PAS last_sign_in_at : GoTrue le met à jour dès le simple /verify du lien de
  // récupération, AVANT même que l'invité ait choisi un mot de passe — un second
  // clic (retry, autre appareil) le marquerait alors à tort comme "déjà rejoint"
  // alors qu'il n'a jamais rien défini. invite_completed n'est posé QUE par
  // /invitation à la soumission réelle du formulaire (mot de passe + nom).
  if (u.user.user_metadata?.invite_completed === true) {
    return NextResponse.json({ error: "already_joined" }, { status: 200 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: u.user.email,
    options: { redirectTo: `${appUrl}/invitation` },
  });
  const actionUrl = (link as { properties?: { action_link?: string } } | null)?.properties?.action_link;
  if (linkError || !actionUrl) {
    return NextResponse.json({ error: "invalid" }, { status: 500 });
  }

  return NextResponse.json({ actionUrl });
}
