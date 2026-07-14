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
import { getConnector, isConnectable, type OAuthProvider } from "@/lib/connectors";
import { buildAuthorizeUrl, oauthConfigured, OAUTH_STATE_COOKIE } from "@/lib/oauth";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

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
  // Langue d'interface lue une fois ici ; les handlers la réutilisent (ctx.locale).
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
        { error: pick(locale, "Aucun espace de travail actif.", "No active workspace.") },
        { status: 403 }
      ),
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: NextResponse.json(
        { error: pick(locale, "Service momentanément indisponible.", "Service temporarily unavailable.") },
        { status: 503 }
      ),
    };
  }

  return { user, tenantId: membership.tenant_id, admin, locale };
}

export async function GET(req: Request) {
  const locale = await getLocale();
  if (!sameOrigin(req)) {
    return NextResponse.json(
      { error: pick(locale, "Origine non autorisée.", "Origin not allowed.") },
      { status: 403 }
    );
  }
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.admin
    .from("user_connections")
    .select("provider, scopes, connectors, connected_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("user_id", ctx.user.id);

  if (error) {
    return NextResponse.json(
      { error: pick(locale, "Lecture impossible.", "Unable to load connections.") },
      { status: 500 }
    );
  }
  return NextResponse.json({ connections: data ?? [] });
}

export async function POST(req: Request) {
  const locale = await getLocale();
  if (!sameOrigin(req)) {
    return NextResponse.json(
      { error: pick(locale, "Origine non autorisée.", "Origin not allowed.") },
      { status: 403 }
    );
  }
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;

  let body: { action?: string; connectorId?: string; provider?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Requête invalide.", "Invalid request.") },
      { status: 400 }
    );
  }

  // ── Démarrage du flux OAuth pour un connecteur ─────────────────────────────
  if (body.action === "start") {
    const connector = getConnector(body.connectorId ?? "");
    if (!connector || connector.kind !== "oauth" || !connector.provider || !connector.scopes) {
      return NextResponse.json(
        {
          error: pick(
            locale,
            "Connecteur inconnu ou sans connexion requise.",
            "Unknown connector, or no connection required."
          ),
        },
        { status: 400 }
      );
    }
    // Fail-closed : un connecteur « soon » n'est lu par aucun code. Démarrer le
    // flux stockerait un jeton mort et afficherait un « Connecté ✅ » mensonger.
    // L'UI masque déjà le bouton ; cette garde couvre l'appel forgé.
    if (!isConnectable(connector)) {
      return NextResponse.json(
        {
          error: pick(
            locale,
            `${connector.name} n'est pas encore branché. Rien à connecter pour l'instant : la connexion arrivera avec la fonctionnalité.`,
            `${connector.name} is not wired up yet. There is nothing to connect for now: the connection will land with the feature.`
          ),
        },
        { status: 409 }
      );
    }
    if (!oauthConfigured(connector.provider)) {
      const providerName = connector.provider === "google" ? "Google" : "Microsoft";
      return NextResponse.json(
        {
          error: pick(
            locale,
            `La connexion ${providerName} n'est pas encore activée sur ce déploiement. En attendant, la version sans connexion reste disponible.`,
            `The ${providerName} connection is not enabled on this deployment yet. In the meantime, the no-connection version remains available.`
          ),
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

    // `mode:"popup"` : le flux est ouvert dans une fenêtre pop-up (chat / activation
    // d'agent) → le callback devra renvoyer une page qui postMessage au lieu de
    // rediriger. On mémorise ce choix dans l'état signé (cookie) pour que le
    // callback sache quoi faire au retour.
    const jar = await cookies();
    // `connectorId` voyage jusqu'au callback : c'est LUI qui sera enregistré comme
    // branché. Sans cette information, le callback ne connaissait que le fournisseur
    // et déduisait l'intention des scopes rendus — d'où l'Agenda qui s'activait tout
    // seul en connectant Gmail (Google renvoie les droits déjà accordés).
    jar.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, provider: connector.provider, connectorId: connector.id, popup: body.mode === "popup" }), {
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
      return NextResponse.json(
        { error: pick(locale, "Fournisseur inconnu.", "Unknown provider.") },
        { status: 400 }
      );
    }
    const { error } = await ctx.admin
      .from("user_connections")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("user_id", ctx.user.id)
      .eq("provider", provider);
    if (error) {
      return NextResponse.json(
        { error: pick(locale, "Déconnexion impossible.", "Disconnect failed.") },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    {
      error: pick(locale, `Action inconnue : ${body.action}`, `Unknown action: ${body.action}`),
    },
    { status: 400 }
  );
}
