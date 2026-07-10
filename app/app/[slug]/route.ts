import { createClient } from "@/lib/supabase-server";
import { injectPoweredBy, publicNotFoundPage } from "@/lib/powered-by";

// Route publique : sert une app générée via son slug.
// Seules les apps marquées is_public = true et status = active sont accessibles.
// La policy RLS "apps_public_select" autorise la lecture anon pour ces apps.
// (Le partage tokenisé révocable/expirant vit sur /partage/[token].)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://")) {
    return new Response("Service non configuré.", { status: 503 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modules")
    .select("html_content, is_public, name, status")
    .eq("slug", slug)
    .maybeSingle();

  // La RLS filtre déjà is_public + status, mais on vérifie explicitement
  // pour ne jamais exposer du contenu non public même en cas de bug de policy.
  if (error || !data || !data.is_public || data.status !== "active") {
    return new Response(
      publicNotFoundPage(
        "Application introuvable",
        `L'application « ${slug} » n'existe pas ou n'est plus disponible.`
      ),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  return new Response(injectPoweredBy(data.html_content), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "private, no-store",
    },
  });
}
