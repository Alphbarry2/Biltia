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
import { exchangeCode, OAUTH_STATE_COOKIE } from "@/lib/oauth";
import type { OAuthProvider } from "@/lib/connectors";

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
  msg: { ok: boolean; provider?: string; error?: string }
): NextResponse {
  // JSON échappé pour injection sûre dans <script> (neutralise « < » → pas de
  // </script> ni de balise possible depuis un message d'erreur du fournisseur).
  const payload = JSON.stringify({ source: "biltia-oauth", ...msg }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Connexion…</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#6b7280;font-size:14px">
<p>Vous pouvez fermer cette fenêtre.</p>
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
  const origin = new URL(req.url).origin;
  const search = new URL(req.url).searchParams;

  const jar = await cookies();
  const rawState = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);

  let expected: { state: string; provider: OAuthProvider; popup?: boolean } | null = null;
  try {
    expected = rawState ? JSON.parse(rawState) : null;
  } catch {
    expected = null;
  }
  const popup = expected?.popup === true;
  // Selon le mode : page postMessage (pop-up) ou redirection vers /connectors.
  const fail = (message: string) =>
    popup ? popupResult(origin, { ok: false, error: message }) : back(origin, { error: message });

  // Refus utilisateur chez le fournisseur (bouton Annuler) → retour neutre.
  if (search.get("error")) {
    return popup ? popupResult(origin, { ok: false }) : back(origin, { canceled: "1" });
  }

  const code = search.get("code");
  const state = search.get("state");
  if (!code || !state || !expected || expected.state !== state) {
    return fail("Session de connexion expirée. Réessayez.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Authentification requise.");
  const membership = await getActiveMembershipServer(supabase, user.id);
  const admin = createAdminClient();
  if (!membership || !admin) return fail("Espace de travail introuvable.");

  try {
    const tokens = await exchangeCode({ provider: expected.provider, code, origin });
    const grantedScopes = (tokens.scope ?? "").split(" ").filter(Boolean);

    // Fusion avec les scopes déjà accordés (connexion incrémentale).
    const { data: existing } = await admin
      .from("user_connections")
      .select("scopes, refresh_token")
      .eq("tenant_id", membership.tenant_id)
      .eq("user_id", user.id)
      .eq("provider", expected.provider)
      .maybeSingle();

    const scopes = [...new Set([...(existing?.scopes ?? []), ...grantedScopes])];

    const { error } = await admin.from("user_connections").upsert(
      {
        tenant_id: membership.tenant_id,
        user_id: user.id,
        provider: expected.provider,
        scopes,
        access_token: tokens.access_token,
        // Google n'émet pas toujours un nouveau refresh_token : garder l'ancien.
        refresh_token: tokens.refresh_token ?? existing?.refresh_token ?? null,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,user_id,provider" }
    );
    if (error) throw new Error("Enregistrement de la connexion impossible.");

    return popup
      ? popupResult(origin, { ok: true, provider: expected.provider })
      : back(origin, { connected: expected.provider });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Connexion impossible.");
  }
}
