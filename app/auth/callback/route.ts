import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Callback OAuth (Google, Apple…) + liens de confirmation d'email : échange le
// code PKCE contre une session, puis aiguille vers l'onboarding tant que le
// profil n'est pas qualifié.
//
// ⚠️ FIABILITÉ COOKIES (Next 15) : les cookies posés via `cookies()` de
// next/headers ne se propagent PAS de façon fiable à une `NextResponse.redirect`.
// Symptôme observé (logs Supabase) : le login Google RÉUSSIT (/callback 302,
// /token 200) mais l'utilisateur atterrit sur /onboarding SANS cookie de session
// → le middleware rebondit vers /login. Correctif : on COLLECTE les cookies posés
// par l'échange, puis on les écrit DIRECTEMENT sur la réponse de redirection.

const raw_url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const raw_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SUPABASE_URL = raw_url.startsWith("https://") ? raw_url : "https://demo.supabase.co";
const SUPABASE_ANON_KEY = raw_key.length > 20 ? raw_key : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  // Les cookies de session écrits par l'échange sont collectés ici, puis réappliqués
  // sur la réponse finale (voir note ci-dessus).
  const pending: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) pending.push(c as (typeof pending)[number]);
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  // Destination : /login si l'échange a échoué, sinon `next` — forcé vers
  // /onboarding tant que le profil n'est pas qualifié.
  let dest = `${origin}/login?error=oauth`;
  if (!error) {
    let finalNext = next;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && !next.startsWith("/onboarding")) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("sector, preferences")
        .eq("user_id", user.id)
        .maybeSingle();
      const prefs = (prof?.preferences ?? {}) as Record<string, unknown>;
      // Le trigger DB crée le profil avec sector='autre' : seul le flag
      // preferences.onboarded (ou un secteur réellement choisi) fait foi.
      const onboarded = prefs.onboarded === true || (!!prof?.sector && prof.sector !== "autre");
      if (!onboarded) finalNext = "/onboarding";
    }
    dest = `${origin}${finalNext}`;
  }

  const response = NextResponse.redirect(dest);
  // CLÉ DU FIX : les cookies de session partent AVEC la redirection.
  for (const { name, value, options } of pending) {
    response.cookies.set(name, value, options);
  }
  return response;
}
