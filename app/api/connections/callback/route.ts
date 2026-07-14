// ─────────────────────────────────────────────────────────────────────────────
// /api/connections/callback — retour du consentement Google / Microsoft.
//
// Vérifie l'état anti-CSRF (cookie posé au départ du flux), échange le code
// contre les jetons, puis upsert dans user_connections en FUSIONNANT les
// scopes (connexion incrémentale : Gmail puis Drive s'additionnent).
// Redirige toujours vers /connectors avec un statut lisible.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { exchangeCode, refreshAccessToken, OAUTH_STATE_COOKIE } from "@/lib/oauth";
import { filterScopes, type OAuthProvider } from "@/lib/connectors";
import { getLocale } from "@/lib/i18n/server";
import { pick, type Locale } from "@/lib/i18n/config";

function back(origin: string, params: Record<string, string>): NextResponse {
  const url = new URL("/connectors", origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

// Mode pop-up (connexion depuis le chat / l'activation d'un agent) : au lieu de
// rediriger vers /connectors, on renvoie une mini-page qui prévient la fenêtre
// parente (postMessage) puis se ferme. La fenêtre parente met alors la carte à
// jour (« Connecté ») sans jamais quitter la conversation.
function popupResult(
  origin: string,
  msg: { ok: boolean; provider?: string; error?: string },
  locale: Locale
): NextResponse {
  // JSON échappé pour injection sûre dans <script> (neutralise « < » → pas de
  // </script> ni de balise possible depuis un message d'erreur du fournisseur).
  const payload = JSON.stringify({ source: "biltia-oauth", ...msg }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${pick(locale, "Connexion…", "Connecting…")}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#6b7280;font-size:14px">
<p>${pick(locale, "Vous pouvez fermer cette fenêtre.", "You can close this window.")}</p>
<script>
(function(){
  try { if (window.opener) window.opener.postMessage(${payload}, ${JSON.stringify(origin)}); } catch (e) {}
  setTimeout(function(){ try { window.close(); } catch (e) {} }, 60);
})();
</script>
</body></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request) {
  const locale = await getLocale();
  const origin = new URL(req.url).origin;
  const search = new URL(req.url).searchParams;

  const jar = await cookies();
  const rawState = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);

  // `connectorId` : QUEL outil l'artisan vient de brancher. Sans lui, on ne savait
  // que le fournisseur (« google ») et on était obligé de deviner l'intention à
  // partir des scopes rendus — ce qui faisait passer l'Agenda en « Connecté » dès
  // qu'on branchait Gmail (Google renvoie tous les droits déjà accordés).
  let expected: { state: string; provider: OAuthProvider; connectorId?: string; popup?: boolean } | null = null;
  try {
    expected = rawState ? JSON.parse(rawState) : null;
  } catch {
    expected = null;
  }
  const popup = expected?.popup === true;
  // Selon le mode : page postMessage (pop-up) ou redirection vers /connectors.
  const fail = (message: string) =>
    popup
      ? popupResult(origin, { ok: false, error: message }, locale)
      : back(origin, { error: message });

  // Refus utilisateur chez le fournisseur (bouton Annuler) → retour neutre.
  if (search.get("error")) {
    return popup ? popupResult(origin, { ok: false }, locale) : back(origin, { canceled: "1" });
  }

  const code = search.get("code");
  const state = search.get("state");
  if (!code || !state || !expected || expected.state !== state) {
    return fail(
      pick(locale, "Session de connexion expirée. Réessayez.", "Connection session expired. Please try again.")
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(pick(locale, "Authentification requise.", "Authentication required."));
  const membership = await getActiveMembershipServer(supabase, user.id);
  const admin = createAdminClient();
  if (!membership || !admin) {
    return fail(pick(locale, "Espace de travail introuvable.", "Workspace not found."));
  }

  try {
    const tokens = await exchangeCode({ provider: expected.provider, code, origin });
    const grantedScopes = (tokens.scope ?? "").split(" ").filter(Boolean);

    // Fusion avec les scopes déjà accordés (connexion incrémentale).
    const { data: existing } = await admin
      .from("user_connections")
      .select("scopes, connectors, refresh_token")
      .eq("tenant_id", membership.tenant_id)
      .eq("user_id", user.id)
      .eq("provider", expected.provider)
      .maybeSingle();

    // ── CE QUE L'ARTISAN A BRANCHÉ, PAS CE QUE GOOGLE A BIEN VOULU RENDRE ───────
    // Google renvoie TOUS les droits jamais accordés à l'application
    // (include_granted_scopes, indispensable pour qu'un seul jeton couvre Gmail ET
    // l'Agenda quand les deux sont branchés). On garde donc le jeton tel quel, mais
    // on n'ENREGISTRE que les scopes des connecteurs réellement activés : le reste
    // n'apparaîtra ni dans l'UI, ni pour les agents.
    const existingConnectors = (existing as { connectors?: string[] } | null)?.connectors ?? [];
    const enabledConnectors = [
      ...new Set([...existingConnectors, ...(expected.connectorId ? [expected.connectorId] : [])]),
    ];
    const scopes = filterScopes(
      [...new Set([...(existing?.scopes ?? []), ...grantedScopes])],
      enabledConnectors
    );

    // Chez Microsoft, le jeton qu'on vient de recevoir ne porte QUE les scopes du
    // connecteur qu'on vient d'autoriser : il est aveugle aux droits accordés
    // AVANT (connecter OneDrive écraserait le jeton d'Outlook, et l'envoi de mail
    // tomberait en 403 avec une carte affichant « Connecté »). Dès qu'il y a des
    // droits antérieurs, on re-frappe donc le jeton sur l'UNION. Google est
    // cumulatif (include_granted_scopes) : rien à faire pour lui.
    let access = tokens.access_token;
    let refresh = tokens.refresh_token ?? existing?.refresh_token ?? null;
    let expiresIn = tokens.expires_in;
    if (expected.provider === "microsoft" && refresh && scopes.length > grantedScopes.length) {
      try {
        const merged = await refreshAccessToken({
          provider: "microsoft",
          refreshToken: refresh,
          scopes,
        });
        access = merged.access_token;
        refresh = merged.refresh_token ?? refresh;
        expiresIn = merged.expires_in;
      } catch {
        // Union refusée (droit révoqué côté Azure) → on garde le jeton fraîchement
        // obtenu. Le prochain refresh, lui, retentera l'union. Mieux vaut un
        // connecteur qui marche qu'aucun.
      }
    }

    const { error } = await admin.from("user_connections").upsert(
      {
        tenant_id: membership.tenant_id,
        user_id: user.id,
        provider: expected.provider,
        scopes,
        connectors: enabledConnectors,
        access_token: access,
        // Google n'émet pas toujours un nouveau refresh_token : garder l'ancien.
        refresh_token: refresh,
        token_expires_at: expiresIn
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,user_id,provider" }
    );
    if (error) {
      throw new Error(
        pick(locale, "Enregistrement de la connexion impossible.", "Could not save the connection.")
      );
    }

    return popup
      ? popupResult(origin, { ok: true, provider: expected.provider }, locale)
      : back(origin, { connected: expected.provider });
  } catch (e) {
    return fail(e instanceof Error ? e.message : pick(locale, "Connexion impossible.", "Connection failed."));
  }
}
