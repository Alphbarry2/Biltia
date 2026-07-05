import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const IS_CONFIGURED = !!SUPABASE_URL && SUPABASE_URL !== "your_supabase_project_url";

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE + BUNDLE EDGE : ce middleware s'exécute à CHAQUE navigation et
// tourne dans le runtime Edge. Il ne fait QUE du gating de navigation à partir
// du cookie de session — AUCUN import de `@supabase/ssr`/`supabase-js`. Tirer
// supabase-js ici gonflait le bundle Edge et émettait à chaque compilation deux
// avertissements Turbopack inévitables (realtime-js `new Worker(...)` non
// analysable statiquement, et `process.version` non supporté en Edge).
//
// La VALIDITÉ réelle du jeton (expiration, refresh) est vérifiée en aval, là où
// supabase-js tourne légitimement en runtime Node/navigateur :
//   • AuthGuard client — app/(app)/layout.tsx (redirige vers /login si invalide)
//   • createBrowserClient — lib/supabase.ts (auto-refresh côté navigateur)
//   • createServerClient  — lib/supabase-server.ts (route handlers Node)
//   • RLS Supabase (dernière barrière : un cookie forgé ne lit aucune donnée)
// Ici on se contente donc de vérifier la PRÉSENCE d'une session en cookie.
// ─────────────────────────────────────────────────────────────────────────────

/** Décode du base64 (ou base64url) en texte UTF-8 — Edge runtime : pas de Buffer. */
function b64ToUtf8(b64: string): string {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Époque (secondes) d'expiration du jeton d'accès trouvé en cookie, ou null. */
function tokenExpiry(request: NextRequest): number | null {
  try {
    // @supabase/ssr stocke la session dans sb-<ref>-auth-token (parfois en
    // morceaux .0/.1…), en JSON éventuellement préfixé "base64-".
    const chunks = request.cookies
      .getAll()
      .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!chunks.length) return null;
    let raw = chunks.map((c) => c.value).join("");
    if (raw.startsWith("base64-")) {
      raw = b64ToUtf8(raw.slice(7));
    }
    const session = JSON.parse(raw) as { expires_at?: number; access_token?: string };
    if (typeof session.expires_at === "number") return session.expires_at;
    // Repli : lire le champ exp du JWT lui-même.
    const jwt = session.access_token;
    if (!jwt) return null;
    const payload = JSON.parse(b64ToUtf8(jwt.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

const PROTECTED_PREFIXES = [
  "/dashboard", "/generate", "/apps", "/workspace", "/library", "/expert",
  "/activity", "/admin", "/settings", "/reports", "/onboarding", "/connectors",
];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  const isAuthPage = path === "/login" || path === "/signup";

  // If Supabase isn't configured, allow all routes (demo mode)
  if (!IS_CONFIGURED) {
    return NextResponse.next({ request });
  }

  const exp = tokenExpiry(request);
  const now = Math.floor(Date.now() / 1000);
  const hasSession = exp !== null; // un cookie de session est présent
  const fresh = exp !== null && exp - now > 60; // encore valablement frais

  // Page d'auth : ne rediriger vers le dashboard QUE si la session est
  // manifestement valide (fresh). Rediriger sur une session périmée créerait
  // une boucle /login ↔ /dashboard (l'AuthGuard rebondit vers /login).
  if (isAuthPage) {
    if (fresh) return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next({ request });
  }

  // Page protégée : exiger la PRÉSENCE d'un cookie de session. Une session
  // périmée mais présente est laissée passer — le refresh/redirect a lieu en
  // aval (AuthGuard client + client Node des route handlers), et RLS protège
  // les données. Sans cookie du tout → login direct, aucun appel réseau.
  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/generate/:path*",
    "/apps/:path*",
    "/workspace/:path*",
    "/library/:path*",
    "/expert/:path*",
    "/activity/:path*",
    "/admin/:path*",
    "/settings/:path*",
    "/reports/:path*",
    "/connectors/:path*",
    "/onboarding",
    "/login",
    "/signup",
  ],
};
