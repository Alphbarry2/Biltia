import { createClient } from "@/lib/supabase-server";

// Route publique : sert une app générée via son slug.
// Seules les apps marquées is_public = true et status = active sont accessibles.
// La policy RLS "apps_public_select" autorise la lecture anon pour ces apps.
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
    return new Response(notFoundPage(slug), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return new Response(data.html_content, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "private, no-store",
    },
  });
}

function notFoundPage(slug: string): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Application introuvable</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-[#F7F5EF] min-h-screen flex items-center justify-center font-sans">
  <div class="text-center px-6">
    <div class="w-14 h-14 rounded-2xl bg-[#0F172A] flex items-center justify-center mx-auto mb-5 shadow-lg">
      <span class="text-white font-black text-xl">B</span>
    </div>
    <h1 class="text-2xl font-black text-[#111827] mb-2">Application introuvable</h1>
    <p class="text-[#6B7280] text-sm">L'application « ${slug} » n'existe pas ou n'est plus disponible.</p>
    <a href="/" class="inline-block mt-6 px-5 py-2.5 bg-[#0F172A] text-white text-sm font-semibold rounded-xl">Retour à Batify</a>
  </div>
</body></html>`;
}
