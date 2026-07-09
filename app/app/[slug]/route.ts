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

  return new Response(injectPoweredBy(data.html_content), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "private, no-store",
    },
  });
}

// « Powered by Biltia » — injecté CÔTÉ SERVEUR sur le lien public (mise en ligne),
// donc NON RETIRABLE par l'utilisateur (jamais dans le HTML qu'il édite). Badge fixe
// aux couleurs Biltia (chip sombre + « B » en dégradé indigo→violet→rose de la
// landing), cliquable vers la landing. Styles inline (CSP-safe, zéro dépendance).
const BILTIA_LANDING = "https://www.biltia.com/?ref=powered";
function injectPoweredBy(html: string): string {
  const badge =
    "\n<style>" +
    "#__biltia_pb{position:fixed!important;z-index:2147483647!important;right:14px;bottom:14px;display:inline-flex!important;" +
    "align-items:center;gap:7px;padding:7px 13px 7px 8px;background:#0B1020;color:#fff;border-radius:9999px;" +
    "box-shadow:0 6px 22px rgba(0,0,0,.28);font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:12px;" +
    "line-height:1;text-decoration:none;-webkit-font-smoothing:antialiased}" +
    "#__biltia_pb .pb-b{width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,#6366F1,#A855F7 55%,#EC4899);" +
    "display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:12px}" +
    "#__biltia_pb .pb-m{opacity:.7;font-weight:500}#__biltia_pb .pb-n{font-weight:700}" +
    // Mobile : au-dessus d'une éventuelle barre d'onglets, à gauche (libère le FAB à droite).
    "@media(max-width:600px){#__biltia_pb{right:auto;left:12px;bottom:70px}}" +
    "</style>" +
    '<a id="__biltia_pb" href="' + BILTIA_LANDING + '" target="_blank" rel="noopener noreferrer" aria-label="Propulsé par Biltia">' +
    '<span class="pb-b">B</span><span class="pb-m">Powered by</span><span class="pb-n">Biltia</span></a>\n';
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, badge + "</body>");
  return html + badge;
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
    <a href="/" class="inline-block mt-6 px-5 py-2.5 bg-[#0F172A] text-white text-sm font-semibold rounded-xl">Retour à Biltia</a>
  </div>
</body></html>`;
}
