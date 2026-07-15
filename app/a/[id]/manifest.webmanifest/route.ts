// ─────────────────────────────────────────────────────────────────────────────
// Manifeste PWA d'UNE app — c'est lui qui donne une icône par application.
//
// Le manifeste global (app/manifest.ts) a `scope: "/"` et `start_url:
// "/dashboard"` : installer Biltia donnait UNE icône, qui ouvre un tableau de
// bord. L'employé devait ensuite trouver la Bibliothèque et cliquer. Trois
// gestes de trop pour quelqu'un qui est sur un toit.
//
// Ici, chaque app a son `id`, son nom et son `start_url` : le téléphone les
// installe comme des applications DISTINCTES. « Pointage » et « Chantiers »
// deviennent deux icônes, et taper dessus ouvre l'app, pas le logiciel.
//
// Protégé par la session (le nom d'une app est une donnée du tenant) — d'où le
// `crossOrigin="use-credentials"` sur le <link> de la page, sans lequel le
// navigateur demanderait ce manifeste SANS cookies et n'obtiendrait qu'un 401.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  const { data: app } = await supabase
    .from("modules")
    .select("name")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  if (!app) return new Response(null, { status: 404 });

  const name = app.name?.trim() || "Application";

  return Response.json(
    {
      // `id` distinct = installation distincte. Sans lui, le navigateur
      // considérerait toutes les apps comme la MÊME PWA et n'en installerait qu'une.
      id: `/a/${id}`,
      name,
      // 12 caractères : au-delà, l'écran d'accueil tronque de toute façon.
      short_name: name.length > 12 ? `${name.slice(0, 11)}…` : name,
      start_url: `/a/${id}`,
      // Scope borné à l'app : une fois installée, elle ne « déborde » jamais sur
      // le reste de Biltia.
      scope: `/a/${id}`,
      display: "standalone",
      background_color: "#FAFAF9",
      theme_color: "#FAFAF9",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        // Le manifeste dépend de la session : jamais de cache partagé.
        "cache-control": "private, no-store",
      },
    }
  );
}
