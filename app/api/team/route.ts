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
import { getEntitlementsForTenant, canInviteTeam } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { logActivity } from "@/lib/activity";
import { sendEmail } from "@/lib/mailer";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

const ASSIGNABLE_ROLES = ["admin", "manager", "member", "viewer"] as const;
const MANAGER_ROLES = ["owner", "admin"];

// Email de marque Biltia (barre d'accent + bouton dégradé), même identité que les
// templates Supabase. Sert à PRÉVENIR un collaborateur qui a DÉJÀ un compte (donc
// non couvert par l'email d'invitation Supabase) qu'il a été ajouté à une équipe.
function brandedEmailHtml(opts: { heading: string; body: string; btnText: string; btnUrl: string }): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#FCFCFD;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td align="center"><table width="480" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;width:100%;background:#fff;border:1px solid #ECECF2;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(60,40,120,0.06);">
<tr><td style="height:4px;background:#7C3AED;background-image:linear-gradient(90deg,#6366F1,#8B5CF6,#EC4899);font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 36px 8px;"><table cellpadding="0" cellspacing="0" role="presentation"><tr>
<td><img src="https://www.biltia.com/icon.png" width="38" height="38" alt="Biltia" style="display:block;border-radius:10px;"></td>
<td style="padding-left:10px;font-size:17px;font-weight:800;letter-spacing:-0.02em;color:#0A0A0A;">Biltia</td>
</tr></table></td></tr>
<tr><td style="padding:20px 36px 0;"><h1 style="margin:0 0 10px;font-size:24px;font-weight:800;letter-spacing:-0.03em;color:#0A0A0A;">${opts.heading}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5B5B66;">${opts.body}</p></td></tr>
<tr><td style="padding:0 36px 32px;"><a href="${opts.btnUrl}" style="display:inline-block;background:#7C3AED;background-image:linear-gradient(135deg,#6366F1 0%,#8B5CF6 55%,#EC4899 100%);color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:12px;box-shadow:0 8px 22px rgba(124,58,237,0.38);">${opts.btnText}</a></td></tr>
</table></td></tr></table>`;
}

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

async function requireContext() {
  // La langue d'interface est lue une fois ici : tous les handlers la réutilisent
  // (ctx.locale) pour leurs messages d'erreur.
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { error: pick(locale, "Authentification requise.", "Authentication required.") },
        { status: 401 }
      ),
    };
  }

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership) {
    return {
      error: NextResponse.json(
        { error: pick(locale, "Aucun espace de travail.", "No workspace found.") },
        { status: 403 }
      ),
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: NextResponse.json(
        {
          error: pick(
            locale,
            "Gestion d'équipe indisponible (configuration serveur incomplète).",
            "Team management is unavailable (incomplete server configuration)."
          ),
        },
        { status: 503 }
      ),
    };
  }

  return { supabase, user, membership, admin, locale };
}

export async function GET() {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { user, membership, admin, locale } = ctx;

  const { data, error } = await admin
    .from("tenant_members")
    .select("id, user_id, role, invited_at, accepted_at, created_at")
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: pick(locale, "Lecture de l'équipe impossible.", "Unable to load the team.") },
      { status: 500 }
    );
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

  // Fiches employé du tenant + lien compte↔fiche (employees.user_id, migration 031)
  // → permet de relier une personne invitée à sa fiche pour activer son périmètre.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empClient = admin as unknown as { from: (t: string) => any };
  const { data: empRows } = await empClient
    .from("employees")
    .select("id, nom, prenom, user_id")
    .eq("tenant_id", membership.tenant_id)
    .order("nom", { ascending: true });
  const empList = (empRows ?? []) as { id: string; nom: string; prenom: string | null; user_id: string | null }[];
  const employees = empList.map((e) => ({ id: e.id, nom: e.nom, prenom: e.prenom }));
  const empByUser = new Map<string, string>();
  empList.forEach((e) => { if (e.user_id) empByUser.set(e.user_id, e.id); });
  const membersWithEmployee = members.map((m) => ({ ...m, employeeId: empByUser.get(m.user_id) ?? null }));

  return NextResponse.json({
    members: membersWithEmployee,
    employees,
    myRole: membership.role,
    canManage: MANAGER_ROLES.includes(membership.role),
  });
}

// ── PATCH : relier (ou délier) un compte à une fiche employé ──────────────────
// { memberUserId, employeeId | null }. Réservé owner/admin. Un compte est relié à
// AU PLUS une fiche : on détache d'abord toute fiche déjà liée à ce compte, puis
// on rattache la fiche choisie. Active le périmètre « ses chantiers » pour ce compte.
export async function PATCH(req: Request) {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { membership, admin, locale } = ctx;

  if (!MANAGER_ROLES.includes(membership.role)) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Seuls le propriétaire ou un administrateur peuvent gérer l'équipe.",
          "Only the owner or an admin can manage the team."
        ),
      },
      { status: 403 }
    );
  }

  let body: { memberUserId?: string; employeeId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }
  const memberUserId = body.memberUserId;
  if (!memberUserId) {
    return NextResponse.json(
      { error: pick(locale, "memberUserId manquant.", "Missing memberUserId.") },
      { status: 400 }
    );
  }

  const tenantId = membership.tenant_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empClient = admin as unknown as { from: (t: string) => any };

  // 1) Détache toute fiche actuellement liée à ce compte (unicité compte↔fiche).
  await empClient.from("employees").update({ user_id: null }).eq("tenant_id", tenantId).eq("user_id", memberUserId);

  // 2) Rattache la fiche choisie (si fournie), scellée au tenant actif.
  if (body.employeeId) {
    const { error } = await empClient
      .from("employees")
      .update({ user_id: memberUserId })
      .eq("tenant_id", tenantId)
      .eq("id", body.employeeId);
    if (error) {
      return NextResponse.json(
        { error: pick(locale, "Liaison impossible.", "Unable to link the account.") },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, employeeId: body.employeeId ?? null });
}

export async function POST(req: Request) {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, user, membership, admin, locale } = ctx;

  if (!MANAGER_ROLES.includes(membership.role)) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Seul le propriétaire ou un admin peut inviter des collaborateurs.",
          "Only the owner or an admin can invite collaborators."
        ),
      },
      { status: 403 }
    );
  }

  // Plan : inviter une équipe (comptes collaborateurs, périmètre employé) est une
  // fonction de COLLABORATION → réservée au plan Équipe (Pro + 50 €). Un Pro solo
  // ne l'a pas ; le Free non plus. Fondateur exempté.
  if (!isFounderEmail(user.email)) {
    const ent = await getEntitlementsForTenant(supabase, membership.tenant_id);
    if (!canInviteTeam(ent)) {
      return NextResponse.json(
        {
          error: pick(
            locale,
            "L'invitation de collaborateurs fait partie du plan Pro. Passez en Pro dans Paramètres → Facturation pour constituer votre équipe.",
            "Inviting collaborators is part of the Pro plan. Switch to Pro in Settings → Billing to build your team."
          ),
          upgrade: true,
        },
        { status: 403 }
      );
    }
  }

  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json(
      { error: pick(locale, "Adresse email invalide.", "Invalid email address.") },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: pick(locale, "Recherche du compte impossible.", "Unable to look up the account.") },
      { status: 500 }
    );
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
      // La page /invitation accueille l'invité (« Vous avez été invité… ») pour
      // choisir son mot de passe. Les métadonnées disent au trigger handle_new_user
      // que c'est un INVITÉ : pas de crédits d'inscription, pas d'espace perso, onboarding sauté.
      redirectTo: `${appUrl}/auth/callback?next=/invitation`,
      data: {
        invited_tenant_id: membership.tenant_id,
        invited_role: role,
        invited_by: user.id,
      },
    });
    if (inviteError || !invited?.user) {
      console.error("[team] invite error:", inviteError);
      return NextResponse.json(
        {
          error: pick(
            locale,
            "Invitation impossible. Réessayez dans un instant.",
            "Invitation failed. Please try again in a moment."
          ),
        },
        { status: 500 }
      );
    }
    memberUserId = invited.user.id;
    invitedNew = true;
  }
  if (memberUserId === user.id) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Vous faites déjà partie de cet espace.",
          "You are already a member of this workspace."
        ),
      },
      { status: 400 }
    );
  }

  // Déjà membre ?
  const { data: existing } = await admin
    .from("tenant_members")
    .select("id")
    .eq("tenant_id", membership.tenant_id)
    .eq("user_id", memberUserId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Ce collaborateur fait déjà partie de l'équipe.",
          "This collaborator is already on the team."
        ),
      },
      { status: 409 }
    );
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
    return NextResponse.json(
      { error: pick(locale, "Ajout impossible. Réessayez.", "Could not add the member. Please try again.") },
      { status: 500 }
    );
  }

  // ── EMAIL ── Un NOUVEL invité reçoit déjà l'email d'invitation Supabase
  // (inviteUserByEmail, expédié via Resend). Mais si le compte EXISTAIT déjà,
  // rien n'a été envoyé → le collaborateur ne sait pas qu'il a été ajouté. On le
  // prévient par un email de marque (Resend). S'il n'a JAMAIS accepté (jamais
  // connecté), on lui donne un lien pour définir son mot de passe ; sinon un
  // simple lien de connexion. Best-effort : n'échoue jamais l'ajout.
  let emailSent = invitedNew;
  if (!invitedNew) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("name")
      .eq("id", membership.tenant_id)
      .maybeSingle();
    const workspaceName = (tenantRow as { name?: string } | null)?.name || "votre équipe";
    let actionUrl = `${appUrl}/login`;
    let pending = false;
    try {
      const { data: u } = await admin.auth.admin.getUserById(memberUserId);
      pending = !!u.user && !u.user.last_sign_in_at;
      if (pending) {
        const { data: link } = await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: `${appUrl}/auth/callback?next=/invitation` },
        });
        const generated = (link as { properties?: { action_link?: string } } | null)?.properties?.action_link;
        if (generated) actionUrl = generated;
      }
    } catch {
      /* on garde le lien de connexion par défaut */
    }
    const heading = pending ? "Rejoignez votre équipe." : "Vous avez été ajouté à une équipe.";
    const bodyText = pending
      ? `${user.email} vous a ajouté à l'équipe « ${workspaceName} » sur Biltia. Cliquez pour définir votre mot de passe et rejoindre l'équipe.`
      : `${user.email} vous a ajouté à l'équipe « ${workspaceName} » sur Biltia. Connectez-vous pour la retrouver dans votre sélecteur d'espace.`;
    const res = await sendEmail({
      to: [email],
      subject: pending ? "Rejoignez votre équipe sur Biltia" : "Vous avez été ajouté à une équipe sur Biltia",
      text: `${bodyText}\n\n${actionUrl}`,
      html: brandedEmailHtml({
        heading,
        body: bodyText,
        btnText: pending ? "Définir mon mot de passe" : "Ouvrir Biltia",
        btnUrl: actionUrl,
      }),
    });
    emailSent = res.ok;
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
    emailSent,
  });
}

export async function DELETE(req: Request) {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, user, membership, admin, locale } = ctx;

  if (!MANAGER_ROLES.includes(membership.role)) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Seul le propriétaire ou un admin peut retirer des membres.",
          "Only the owner or an admin can remove members."
        ),
      },
      { status: 403 }
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

  // La ligne doit appartenir au tenant actif (jamais de suppression cross-tenant).
  const { data: target } = await admin
    .from("tenant_members")
    .select("id, user_id, role")
    .eq("id", body.memberId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json(
      { error: pick(locale, "Membre introuvable.", "Member not found.") },
      { status: 404 }
    );
  }
  if (target.role === "owner") {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Le propriétaire de l'espace ne peut pas être retiré.",
          "The workspace owner cannot be removed."
        ),
      },
      { status: 400 }
    );
  }

  const { error: deleteError } = await admin
    .from("tenant_members")
    .delete()
    .eq("id", target.id)
    .eq("tenant_id", membership.tenant_id);

  if (deleteError) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Retrait impossible. Réessayez.",
          "Could not remove the member. Please try again."
        ),
      },
      { status: 500 }
    );
  }

  // ── NETTOYAGE ── Si le retiré était un invité qui n'a JAMAIS accepté (jamais
  // connecté) et n'appartient plus à AUCUNE équipe, on supprime son compte
  // fantôme. Sans ça, il restait dans auth.users (« ça ne se supprime pas ») et
  // une ré-invitation le retrouvait → aucun email renvoyé. Après nettoyage, une
  // ré-invitation repart de zéro et renvoie bien l'email. Jamais un compte actif.
  let accountPurged = false;
  try {
    const { data: others } = await admin
      .from("tenant_members")
      .select("id")
      .eq("user_id", target.user_id)
      .limit(1);
    if (!others || others.length === 0) {
      const { data: u } = await admin.auth.admin.getUserById(target.user_id);
      if (u.user && !u.user.last_sign_in_at) {
        const { error: delUserErr } = await admin.auth.admin.deleteUser(target.user_id);
        accountPurged = !delUserErr;
      }
    }
  } catch {
    /* best-effort : la membership est déjà retirée, l'essentiel est fait */
  }

  await logActivity(supabase, {
    tenantId: membership.tenant_id,
    userId: user.id,
    action: "delete",
    entityType: "équipe",
    entityId: target.id,
    description: accountPurged
      ? "Collaborateur retiré de l'équipe (compte invité non accepté supprimé)"
      : "Collaborateur retiré de l'équipe",
  });

  return NextResponse.json({ ok: true, accountPurged });
}
