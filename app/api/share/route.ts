// ─────────────────────────────────────────────────────────────────────────────
// /api/share — liens de partage d'une app (« Partager » → lien de consultation).
//
//   POST   { appId, expiresInDays?, label? } → crée un lien de lecture seule.
//   GET    ?appId=…                          → liste les liens VIVANTS de l'app.
//   DELETE { linkId }                        → révoque un lien (revoked_at).
//
// Authentifié. Gardé côté serveur (matrice permissions) + isolé par RLS
// (my_tenant_role). La résolution PUBLIQUE du token vit dans /partage/[token]
// (service_role) : ici on ne gère QUE le cycle de vie côté propriétaire.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { can } from "@/lib/permissions";
import { publicBaseUrl, shareLinkUrl, resolveClientScope, type ShareLink } from "@/lib/share";
import { requiresBiltiaHost } from "@/lib/app-connectivity";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, canCollaborate, equipeUpgradeMessage } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// app_share_links n'est pas (encore) dans database.types.ts → accès non typé,
// comme demo_bookings / ai_usage ailleurs dans le code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

const SHARE_COLS = "id, token, kind, label, expires_at, revoked_at, created_at";

function withUrl(req: Request, link: ShareLink) {
  return { ...link, url: shareLinkUrl(publicBaseUrl(req), link.token) };
}

async function resolveSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null };
  const membership = await getActiveMembershipServer(supabase, user.id);
  return { supabase, user, membership };
}

// ── POST : créer un lien ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const locale = await getLocale();
  const { supabase, user, membership } = await resolveSession();
  if (!user) {
    return Response.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  }
  if (!membership) {
    return Response.json(
      { error: pick(locale, "Aucun espace de travail actif.", "No active workspace.") },
      { status: 403 }
    );
  }
  // Partager une app = un acte de création : réservé à qui peut créer/modifier
  // (owner/admin/manager/member). Un lecteur ne partage pas vers l'extérieur.
  if (!can(membership.role, "ai.create")) {
    return Response.json(
      {
        error: pick(
          locale,
          "Votre rôle ne permet pas de partager une application.",
          "Your role does not allow sharing an app."
        ),
      },
      { status: 403 }
    );
  }

  const limited = await enforceRateLimit("share", user.id, LIMITS.share);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as {
    appId?: string;
    expiresInDays?: number;
    label?: string;
    kind?: string;
    scope?: unknown;
  };
  const appId = body.appId;
  if (!appId) {
    return Response.json({ error: pick(locale, "appId manquant.", "Missing appId.") }, { status: 400 });
  }

  // Vérifie que l'app appartient bien au tenant actif. On force `.eq("tenant_id")`
  // EN PLUS de la RLS : une policy `apps_public_select` rend lisibles les modules
  // PUBLICS de tous les tenants → sans ce filtre, on pourrait créer un lien vers
  // le module public d'un autre tenant (et continuer à le servir après dépublication).
  const { data: mod } = await supabase
    .from("modules")
    .select("id, html_content")
    .eq("id", appId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();
  if (!mod) {
    return Response.json(
      { error: pick(locale, "Application introuvable ou accès refusé.", "App not found or access denied.") },
      { status: 404 }
    );
  }

  // Type de lien : 'preview' (défaut, aperçu) ou 'client' (portail scopé à UN
  // chantier). Pour un lien client, le scope doit être valide ET le chantier doit
  // appartenir au tenant (la RLS sur chantiers le garantit à la lecture ci-dessous).
  const kind = body.kind === "client" ? "client" : "preview";
  let scope: Record<string, unknown> = {};

  // Un lien 'preview' est servi SANS bridge de données (cf. /partage/[token] :
  // seul le type 'client' reçoit injectShareBridge). Sur une app reliée au
  // workspace, il livrait donc au destinataire une app qui gèle 30 s par écran
  // avant d'afficher « Connexion trop lente » — le même défaut que le
  // déploiement externe refusait honnêtement. On refuse À LA CRÉATION : c'est
  // l'artisan qui l'apprend, pas son client.
  //
  // Pas de « bridge sans scope » possible ici : un lien preview n'est rattaché à
  // AUCUN chantier, donc l'ouvrir aux données exposerait le workspace entier —
  // budgets et marges compris — à quiconque récupère l'URL.
  if (kind === "preview" && requiresBiltiaHost(mod.html_content)) {
    return Response.json(
      {
        error: pick(
          locale,
          "Cette application lit les données de votre espace : un lien de consultation les afficherait vides. Votre équipe l'ouvre depuis la Bibliothèque. Pour un client, créez un lien client : il ne montre qu'un chantier, en lecture seule.",
          "This app reads your workspace data: a view link would show it empty. Your team opens it from the Library. For a client, create a client link: it shows one job site only, read-only."
        ),
      },
      { status: 400 }
    );
  }

  if (kind === "client") {
    // Portail CLIENT (lien scopé à UN chantier) = fonction de collaboration →
    // réservé au plan Équipe. Le lien "preview" (aperçu lecture seule) reste ouvert
    // au Pro (« partage limité »). Fondateur exempté.
    if (!isFounderEmail(user.email)) {
      const ent = await getEntitlementsForTenant(supabase, membership.tenant_id);
      if (!canCollaborate(ent)) {
        return Response.json({ error: equipeUpgradeMessage(locale), upgrade: true }, { status: 403 });
      }
    }
    const parsed = resolveClientScope(body.scope);
    if (!parsed) {
      return Response.json(
        { error: pick(locale, "Chantier à partager invalide.", "Invalid project to share.") },
        { status: 400 }
      );
    }
    const { data: chantier } = await (supabase as unknown as LooseClient)
      .from("chantiers")
      .select("id")
      .eq("id", parsed.record_id)
      .maybeSingle();
    if (!chantier) {
      return Response.json(
        { error: pick(locale, "Chantier introuvable ou accès refusé.", "Project not found or access denied.") },
        { status: 404 }
      );
    }
    scope = { entity: parsed.entity, record_id: parsed.record_id };
  }

  const days = Number(body.expiresInDays);
  const expires_at =
    Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * 86_400_000).toISOString()
      : null;

  const { data: link, error } = await (supabase as unknown as LooseClient)
    .from("app_share_links")
    .insert({
      tenant_id: membership.tenant_id,
      module_id: appId,
      created_by: user.id,
      kind,
      scope,
      expires_at,
      label: typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : null,
    })
    .select(SHARE_COLS)
    .single();

  if (error || !link) {
    return Response.json(
      { error: pick(locale, "Impossible de créer le lien de partage.", "Could not create the share link.") },
      { status: 500 }
    );
  }

  return Response.json({ link: withUrl(req, link as ShareLink) });
}

// ── GET : lister les liens vivants d'une app ─────────────────────────────────
export async function GET(req: Request) {
  const locale = await getLocale();
  const { supabase, user, membership } = await resolveSession();
  if (!user) {
    return Response.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  }
  if (!membership) {
    return Response.json(
      { error: pick(locale, "Aucun espace de travail actif.", "No active workspace.") },
      { status: 403 }
    );
  }

  const appId = new URL(req.url).searchParams.get("appId");
  if (!appId) {
    return Response.json({ error: pick(locale, "appId manquant.", "Missing appId.") }, { status: 400 });
  }

  // RLS limite déjà aux liens du tenant ; on filtre les révoqués.
  const { data } = await (supabase as unknown as LooseClient)
    .from("app_share_links")
    .select(SHARE_COLS)
    .eq("module_id", appId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const links = ((data ?? []) as ShareLink[]).map((l) => withUrl(req, l));
  return Response.json({ links });
}

// ── DELETE : révoquer un lien ────────────────────────────────────────────────
export async function DELETE(req: Request) {
  const locale = await getLocale();
  const { supabase, user, membership } = await resolveSession();
  if (!user) {
    return Response.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  }
  if (!membership) {
    return Response.json(
      { error: pick(locale, "Aucun espace de travail actif.", "No active workspace.") },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { linkId?: string };
  const linkId = body.linkId ?? new URL(req.url).searchParams.get("linkId") ?? undefined;
  if (!linkId) {
    return Response.json({ error: pick(locale, "linkId manquant.", "Missing linkId.") }, { status: 400 });
  }

  // Update gardé par RLS (my_tenant_role) → un lien d'un autre tenant n'est pas
  // révocable. On pose revoked_at (jamais de suppression : piste d'audit).
  const { error } = await (supabase as unknown as LooseClient)
    .from("app_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .is("revoked_at", null);

  if (error) {
    return Response.json(
      { error: pick(locale, "Impossible de révoquer le lien.", "Could not revoke the link.") },
      { status: 500 }
    );
  }
  return Response.json({ ok: true });
}
