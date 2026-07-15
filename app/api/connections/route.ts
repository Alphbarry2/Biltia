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
import { getConnector, isConnectable, filterScopes } from "@/lib/connectors";
import { buildAuthorizeUrl, oauthConfigured, revokeToken, OAUTH_STATE_COOKIE } from "@/lib/oauth";
import { normalizePreferences } from "@/lib/user-preferences";
import type { Json } from "@/lib/database.types";
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

  const [conns, profile] = await Promise.all([
    ctx.admin
      .from("user_connections")
      .select("provider, scopes, connectors, connected_at, account_email")
      .eq("tenant_id", ctx.tenantId)
      .eq("user_id", ctx.user.id),
    ctx.admin.from("profiles").select("preferences").eq("user_id", ctx.user.id).maybeSingle(),
  ]);

  if (conns.error) {
    return NextResponse.json(
      { error: pick(locale, "Lecture impossible.", "Unable to load connections.") },
      { status: 500 }
    );
  }
  // Le choix de compte par défaut voyage avec les connexions : l'UI en a besoin pour
  // savoir QUELLE carte porter le badge « Par défaut » (le calcul lui-même vit dans
  // lib/send-preference, partagé avec le serveur d'envoi).
  const prefs = normalizePreferences((profile.data as { preferences?: unknown } | null)?.preferences);
  return NextResponse.json({
    connections: conns.data ?? [],
    defaults: { email: prefs.email_provider, calendar: prefs.calendar_provider },
  });
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

  let body: { action?: string; connectorId?: string; provider?: string; mode?: string; capability?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Requête invalide.", "Invalid request.") },
      { status: 400 }
    );
  }

  // ── Choix du compte par défaut (email / agenda) ────────────────────────────
  // Écrit dans profiles.preferences. Lu par lib/send-preference-server pour ordonner
  // l'envoi et l'agenda — le chat comme les agents autonomes. null = automatique
  // (premier connecté) ; on ne stocke donc QUE "google" / "microsoft".
  if (body.action === "set-default") {
    const capability = body.capability;
    const provider = body.provider;
    if (
      (capability !== "email" && capability !== "calendar") ||
      (provider !== "google" && provider !== "microsoft")
    ) {
      return NextResponse.json(
        { error: pick(locale, "Choix invalide.", "Invalid choice.") },
        { status: 400 }
      );
    }
    const { data: profile } = await ctx.admin
      .from("profiles")
      .select("preferences")
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    const raw = (profile as { preferences?: unknown } | null)?.preferences;
    const base = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, Json>) : {};
    const key = capability === "email" ? "email_provider" : "calendar_provider";
    const { error } = await ctx.admin
      .from("profiles")
      .update({ preferences: { ...base, [key]: provider } })
      .eq("user_id", ctx.user.id);
    if (error) {
      return NextResponse.json(
        { error: pick(locale, "Enregistrement impossible.", "Could not save.") },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
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

  // ── Déconnexion d'UN CONNECTEUR (plus de tout le compte d'un coup) ──────────
  // Avant, « Déconnecter » sur Gmail supprimait la ligne `google` entière : l'Agenda
  // et Drive tombaient avec, sans prévenir. Et comme rien n'était révoqué chez
  // Google, le droit restait accordé et ressuscitait à la reconnexion suivante.
  //
  // Désormais on retire l'outil de la liste des connecteurs activés, et on rogne les
  // scopes en conséquence. Quand c'était le DERNIER outil du fournisseur, on
  // supprime la ligne ET on révoque le jeton chez le fournisseur : sans révocation,
  // le consentement survit à la déconnexion, ce qui est exactement le bug d'origine.
  if (body.action === "disconnect") {
    const connector = getConnector(body.connectorId ?? "");
    if (!connector || connector.kind !== "oauth" || !connector.provider) {
      return NextResponse.json(
        { error: pick(locale, "Connecteur inconnu.", "Unknown connector.") },
        { status: 400 }
      );
    }
    const provider = connector.provider;

    const { data: existing } = await ctx.admin
      .from("user_connections")
      .select("scopes, connectors, access_token, refresh_token")
      .eq("tenant_id", ctx.tenantId)
      .eq("user_id", ctx.user.id)
      .eq("provider", provider)
      .maybeSingle();
    if (!existing) return NextResponse.json({ ok: true });

    const row = existing as {
      scopes?: string[];
      connectors?: string[];
      access_token?: string | null;
      refresh_token?: string | null;
    };
    const remaining = (row.connectors ?? []).filter((id) => id !== connector.id);

    if (remaining.length === 0) {
      // Plus rien de branché chez ce fournisseur → on coupe pour de bon.
      await revokeToken(provider, row.refresh_token ?? row.access_token ?? null);
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

    // D'autres outils du même compte restent branchés : on garde le jeton (il leur
    // sert), on retire juste cet outil et ses droits de ce que Biltia utilisera.
    const { error } = await ctx.admin
      .from("user_connections")
      .update({
        connectors: remaining,
        scopes: filterScopes(row.scopes ?? [], remaining),
        updated_at: new Date().toISOString(),
      })
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
