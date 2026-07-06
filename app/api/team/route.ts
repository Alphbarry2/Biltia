// ─────────────────────────────────────────────────────────────────────────────
// /api/team — GESTION D'ÉQUIPE du workspace actif.
//
//   GET    → liste des membres (email + rôle) du workspace de l'utilisateur.
//   POST   → { email, role? } ajoute un collaborateur. S'il n'a pas encore de
//            compte, il est INVITÉ par lien magique (sans étape « confirmez votre
//            email ») : il clique, choisit son mot de passe, il est connecté et
//            déjà membre. Réservé aux rôles owner/admin.
//   DELETE → { memberId } retire un membre. Réservé owner/admin ; on ne retire
//            jamais un owner.
//
// Sécurité :
//   • Auth de session obligatoire.
//   • Le rôle du demandeur est vérifié via SON membership (RLS).
//   • Le client service_role ne sert QU'À résoudre les emails (auth.users est
//     inaccessible au rôle authenticated) et à lister/retirer les lignes du
//     tenant — après vérification du rôle, et toujours scellé au tenant actif.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { logActivity } from "@/lib/activity";

const ASSIGNABLE_ROLES = ["admin", "manager", "member", "viewer"] as const;
const MANAGER_ROLES = ["owner", "admin"];

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

async function requireContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Authentification requise." }, { status: 401 }) };

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership) {
    return { error: NextResponse.json({ error: "Aucun espace de travail." }, { status: 403 }) };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: NextResponse.json(
        { error: "Gestion d'équipe indisponible (configuration serveur incomplète)." },
        { status: 503 }
      ),
    };
  }

  return { supabase, user, membership, admin };
}

export async function GET() {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { user, membership, admin } = ctx;

  const { data, error } = await admin
    .from("tenant_members")
    .select("id, user_id, role, invited_at, accepted_at, created_at")
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Lecture de l'équipe impossible." }, { status: 500 });
  }

  const rows = (data ?? []) as MemberRow[];
  const members = await Promise.all(
    rows.map(async (m) => {
      let email = "";
      let fullName = "";
      try {
        const { data: u } = await admin.auth.admin.getUserById(m.user_id);
        email = u.user?.email ?? "";
        fullName = (u.user?.user_metadata?.full_name as string) ?? "";
      } catch {
        // membre orphelin : on l'affiche sans email
      }
      return {
        id: m.id,
        user_id: m.user_id,
        email,
        full_name: fullName,
        role: m.role,
        accepted: !!m.accepted_at,
        isYou: m.user_id === user.id,
      };
    })
  );

  return NextResponse.json({
    members,
    myRole: membership.role,
    canManage: MANAGER_ROLES.includes(membership.role),
  });
}

export async function POST(req: Request) {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, user, membership, admin } = ctx;

  if (!MANAGER_ROLES.includes(membership.role)) {
    return NextResponse.json(
      { error: "Seul le propriétaire ou un admin peut inviter des collaborateurs." },
      { status: 403 }
    );
  }

  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  }
  const role = (ASSIGNABLE_ROLES as readonly string[]).includes(body.role ?? "")
    ? (body.role as string)
    : "member";

  // Résolution email → user_id (fonction réservée à service_role).
  const { data: targetId, error: lookupError } = await admin.rpc("get_user_id_by_email", {
    p_email: email,
  });
  if (lookupError) {
    console.error("[team] lookup error:", lookupError);
    return NextResponse.json({ error: "Recherche du compte impossible." }, { status: 500 });
  }
  // Pas encore de compte ? On INVITE par lien magique — AUCUNE étape « confirmez
  // votre email » : le collaborateur clique le lien, choisit son mot de passe, et
  // il est connecté ET déjà membre. (L'inscription Biltia standard, depuis la
  // landing, garde SA confirmation email — c'est seulement l'ajout d'équipe qui l'évite.)
  let memberUserId = (targetId as string | null) ?? null;
  let invitedNew = false;
  if (!memberUserId) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/auth/callback?next=/dashboard`,
    });
    if (inviteError || !invited?.user) {
      console.error("[team] invite error:", inviteError);
      return NextResponse.json({ error: "Invitation impossible. Réessayez dans un instant." }, { status: 500 });
    }
    memberUserId = invited.user.id;
    invitedNew = true;
  }
  if (memberUserId === user.id) {
    return NextResponse.json({ error: "Vous faites déjà partie de cet espace." }, { status: 400 });
  }

  // Déjà membre ?
  const { data: existing } = await admin
    .from("tenant_members")
    .select("id")
    .eq("tenant_id", membership.tenant_id)
    .eq("user_id", memberUserId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Ce collaborateur fait déjà partie de l'équipe." }, { status: 409 });
  }

  const { data: created, error: insertError } = await admin
    .from("tenant_members")
    .insert({
      tenant_id: membership.tenant_id,
      user_id: memberUserId,
      role: role as "admin" | "manager" | "member" | "viewer",
      invited_by: user.id,
      invited_at: new Date().toISOString(),
      accepted_at: new Date().toISOString(),
    })
    .select("id, user_id, role")
    .single();

  if (insertError || !created) {
    console.error("[team] insert error:", insertError);
    return NextResponse.json({ error: "Ajout impossible. Réessayez." }, { status: 500 });
  }

  await logActivity(supabase, {
    tenantId: membership.tenant_id,
    userId: user.id,
    action: "create",
    entityType: "équipe",
    entityId: created.id,
    description: `Collaborateur ajouté à l'équipe : ${email} (${role})`,
  });

  return NextResponse.json({
    member: { id: created.id, user_id: created.user_id, email, role: created.role, accepted: true, isYou: false },
    invited: invitedNew,
  });
}

export async function DELETE(req: Request) {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, user, membership, admin } = ctx;

  if (!MANAGER_ROLES.includes(membership.role)) {
    return NextResponse.json(
      { error: "Seul le propriétaire ou un admin peut retirer des membres." },
      { status: 403 }
    );
  }

  let body: { memberId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (!body.memberId) {
    return NextResponse.json({ error: "memberId requis." }, { status: 400 });
  }

  // La ligne doit appartenir au tenant actif (jamais de suppression cross-tenant).
  const { data: target } = await admin
    .from("tenant_members")
    .select("id, user_id, role")
    .eq("id", body.memberId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "Le propriétaire de l'espace ne peut pas être retiré." }, { status: 400 });
  }

  const { error: deleteError } = await admin
    .from("tenant_members")
    .delete()
    .eq("id", target.id)
    .eq("tenant_id", membership.tenant_id);

  if (deleteError) {
    return NextResponse.json({ error: "Retrait impossible. Réessayez." }, { status: 500 });
  }

  await logActivity(supabase, {
    tenantId: membership.tenant_id,
    userId: user.id,
    action: "delete",
    entityType: "équipe",
    entityId: target.id,
    description: "Collaborateur retiré de l'équipe",
  });

  return NextResponse.json({ ok: true });
}
