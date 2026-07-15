// SÉCURITÉ : ce HTML de tenant est servi en ORIGINE OPAQUE (directive CSP
// `sandbox`, sans allow-same-origin) — sinon le JS écrit par le modèle
// s'exécuterait avec les cookies du visiteur. L'en-tête est posé par
// next.config.ts (règle /app/:slug*), PAS ici : un en-tête de route est écrasé
// par celui du config. Voir lib/security-headers.ts.
import { createClient } from "@/lib/supabase-server";
import { createAdminClientUntyped } from "@/lib/supabase-admin";
import { injectPoweredBy, publicNotFoundPage } from "@/lib/powered-by";
import { injectAppBrand } from "@/lib/app-brand";
import { getBrandKit } from "@/lib/brand";
import { requiresBiltiaHost } from "@/lib/app-connectivity";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// Route publique : sert une app générée via son slug.
// Seules les apps marquées is_public = true et status = active sont accessibles.
// La policy RLS "apps_public_select" autorise la lecture anon pour ces apps.
// (Le partage tokenisé révocable/expirant vit sur /partage/[token].)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const locale = await getLocale();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://")) {
    return new Response(pick(locale, "Service non configuré.", "Service not configured."), { status: 503 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modules")
    .select("html_content, is_public, name, status, tenant_id")
    .eq("slug", slug)
    .maybeSingle();

  // La RLS filtre déjà is_public + status, mais on vérifie explicitement
  // pour ne jamais exposer du contenu non public même en cas de bug de policy.
  if (error || !data || !data.is_public || data.status !== "active") {
    return new Response(
      publicNotFoundPage(
        pick(locale, "Application introuvable", "App not found"),
        pick(
          locale,
          `L'application « ${slug} » n'existe pas ou n'est plus disponible.`,
          `The app “${slug}” does not exist or is no longer available.`
        ),
        locale
      ),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  // Une app reliée au workspace ne PEUT PAS vivre ici : cette route sert le HTML
  // en page de PREMIER NIVEAU, donc window.parent === window et personne ne
  // répond aux appels du SDK (cf. lib/app-connectivity.ts). On servait jusqu'ici
  // une app qui gelait 30 s par écran avant d'afficher « Connexion trop lente ».
  // On le dit, et on renvoie vers les deux chemins qui, eux, fonctionnent.
  if (requiresBiltiaHost(data.html_content)) {
    return new Response(
      publicNotFoundPage(
        pick(locale, "Ouvrez cette application depuis Biltia", "Open this app from Biltia"),
        pick(
          locale,
          `« ${data.name} » est reliée aux données de votre entreprise : elle a besoin de votre session pour les afficher. Votre équipe l'ouvre depuis la Bibliothèque. Pour la montrer à un client, créez un lien client depuis l'application (il ne montre qu'un chantier, en lecture seule).`,
          `“${data.name}” is connected to your company data: it needs your session to display it. Your team opens it from the Library. To show it to a client, create a client link from the app (it shows one job site only, read-only).`
        ),
        locale
      ),
      { status: 403, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } }
    );
  }

  // Le logo de l'artisan est posé AU MOMENT DE SERVIR (comme le badge Biltia) :
  // les apps déjà créées en profitent sans être régénérées. Le visiteur est anonyme
  // ici → lecture de la marque en service_role, bornée au tenant de l'app.
  let html = data.html_content;
  const admin = createAdminClientUntyped();
  if (admin && data.tenant_id) {
    try {
      html = injectAppBrand(html, await getBrandKit(admin, data.tenant_id));
    } catch {
      /* pas d'identité visuelle → l'en-tête garde le nom de l'entreprise */
    }
  }

  return new Response(injectPoweredBy(html), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "private, no-store",
    },
  });
}
