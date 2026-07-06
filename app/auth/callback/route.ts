import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Callback OAuth (Google, Apple…) : échange le code PKCE contre une session,
// puis aiguille vers l'onboarding tant que le profil n'est pas qualifié.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("sector, preferences")
          .eq("user_id", user.id)
          .maybeSingle();
        const prefs = (prof?.preferences ?? {}) as Record<string, unknown>;
        // Le trigger DB crée le profil avec sector='autre' : seul le flag
        // preferences.onboarded (ou un secteur réellement choisi) fait foi.
        const onboarded = prefs.onboarded === true || (!!prof?.sector && prof.sector !== "autre");
        // Non qualifié → onboarding. MAIS si `next` pointe déjà vers l'onboarding
        // (ex : /onboarding?plan=pro&credits=… venant du signup « Choisir Pro »),
        // on le PRÉSERVE tel quel pour ne pas perdre le plan choisi.
        if (!onboarded && !next.startsWith("/onboarding")) next = "/onboarding";
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
