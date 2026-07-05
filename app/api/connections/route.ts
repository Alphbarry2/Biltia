// ─────────────────────────────────────────────────────────────────────────────
// /api/connections — état des connexions OAuth de l'utilisateur.
//
//   GET             → liste { provider, scopes, connected_at } (JAMAIS les jetons)
//   POST start      → URL d'autorisation Google / Microsoft (état anti-CSRF en cookie)
//   POST disconnect → supprime la connexion (et ses jetons)
//
// Les jetons vivent dans user_connections (RLS sans policy → service_role
// uniquement). Le navigateur ne voit que le strict nécessaire à l'affichage.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { getConnector, type OAuthProvider } from "@/lib/connectors";
import { buildAuthorizeUrl, oauthConfigured, OAUTH_STATE_COOKIE } from "@/lib/oauth";

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

async function requireContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Authentification requise." }, { status: 401 }) };

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership) return { error: NextResponse.json({ error: "Aucun espace de travail actif." }, { status: 403 }) };

  const admin = createAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "Service momentanément indisponible." }, { status: 503 }) };

  return { user, tenantId: membership.tenant_id, admin };
}

export async function GET(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.admin
    .from("user_connections")
    .select("provider, scopes, connected_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("user_id", ctx.user.id);

  if (error) return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  return NextResponse.json({ connections: data ?? [] });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;

  let body: { action?: string; connectorId?: string; provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  // ── Démarrage du flux OAuth pour un connecteur ─────────────────────────────
  if (body.action === "start") {
    const connector = getConnector(body.connectorId ?? "");
    if (!connector || connector.kind !== "oauth" || !connector.provider || !connector.scopes) {
      return NextResponse.json({ error: "Connecteur inconnu ou sans connexion requise." }, { status: 400 });
    }
    if (!oauthConfigured(connector.provider)) {
      return NextResponse.json(
        {
          error:
            "La connexion " +
            (connector.provider === "google" ? "Google" : "Microsoft") +
            " n'est pas encore activée sur ce déploiement. En attendant, la version sans connexion reste disponible.",
        },
        { status: 501 }
      );
    }

    const state = crypto.randomUUID();
    const url = buildAuthorizeUrl({
      provider: connector.provider,
      scopes: connector.scopes,
      state,
      origin: new URL(req.url).origin,
    });

    const jar = await cookies();
    jar.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, provider: connector.provider }), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return NextResponse.json({ url });
  }

  // ── Déconnexion d'un provider (supprime les jetons) ────────────────────────
  if (body.action === "disconnect") {
    const provider = body.provider as OAuthProvider;
    if (provider !== "google" && provider !== "microsoft") {
      return NextResponse.json({ error: "Fournisseur inconnu." }, { status: 400 });
    }
    const { error } = await ctx.admin
      .from("user_connections")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("user_id", ctx.user.id)
      .eq("provider", provider);
    if (error) return NextResponse.json({ error: "Déconnexion impossible." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Action inconnue : ${body.action}` }, { status: 400 });
}
