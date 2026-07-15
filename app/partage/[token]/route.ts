// ─────────────────────────────────────────────────────────────────────────────
// /partage/[token] — sert une app en LECTURE SEULE via un lien de partage.
//
// Le token (uuid) EST la capacité d'accès : la résolution passe par le
// service_role (app_share_links a une RLS deny-all pour anon, cf. migration
// 029), on vérifie que le lien est VIVANT (ni révoqué, ni expiré), puis on sert
// le HTML du module avec le badge « Powered by Biltia » injecté serveur.
//
// Visiteur anonyme : aucune session → les appels window.biltia vers /api/*
// restent non authentifiés (401) ; la vue montre l'app, pas les données privées.
// Même modèle de sécurité que /demo/manage/[token] et /app/[slug].
// ─────────────────────────────────────────────────────────────────────────────

// SÉCURITÉ : ce HTML de tenant est servi en ORIGINE OPAQUE (directive CSP
// `sandbox`, sans allow-same-origin) — sinon le JS écrit par le modèle
// s'exécuterait avec les cookies du visiteur. L'en-tête est posé par
// next.config.ts (règle /partage/:token*), PAS ici : un en-tête de route est
// écrasé par celui du config. Voir lib/security-headers.ts.
import { createAdminClient } from "@/lib/supabase-admin";
import { injectPoweredBy, publicNotFoundPage } from "@/lib/powered-by";
import { injectAppBrand, injectInterfaceWordmark } from "@/lib/app-brand";
import { getBrandKit } from "@/lib/brand";
import { injectShareBridge } from "@/lib/share-bridge";
import { isShareToken, isLinkLive } from "@/lib/share";
import { renderPublicForm } from "@/lib/public-form";
import { getLocale } from "@/lib/i18n/server";
import { pick, type Locale } from "@/lib/i18n/config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

function notFound(locale: Locale) {
  return new Response(
    publicNotFoundPage(
      pick(locale, "Lien indisponible", "Link unavailable"),
      pick(
        locale,
        "Ce lien de partage n'existe pas, a expiré ou a été révoqué.",
        "This share link does not exist, has expired or has been revoked."
      ),
      locale
    ),
    { status: 404, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } }
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await getLocale();
  if (!isShareToken(token)) return notFound(locale);

  const admin = createAdminClient();
  if (!admin) return new Response(pick(locale, "Service non configuré.", "Service not configured."), { status: 503 });

  // 1) Résout le lien par son token, vérifie qu'il est vivant.
  const { data: link } = await (admin as unknown as LooseClient)
    .from("app_share_links")
    .select("module_id, kind, scope, expires_at, revoked_at, tenant_id")
    .eq("token", token)
    .maybeSingle();

  if (!link || !isLinkLive(link, Date.now())) return notFound(locale);

  // Lien 'form' : sert un FORMULAIRE public autonome (aucun module à charger).
  // La soumission poste vers /api/share/submit avec le token (zero-trust serveur).
  if (link.kind === "form") {
    return new Response(renderPublicForm(token, link.scope, locale), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex",
        "cache-control": "private, no-store",
      },
    });
  }

  // 2) Charge le HTML du module partagé (service_role → pas de RLS ; l'accès est
  //    déjà autorisé par la possession du token). On refuse une app archivée.
  const { data: mod } = await admin
    .from("modules")
    .select("html_content, status, tenant_id, kind")
    .eq("id", link.module_id)
    .maybeSingle();

  if (!mod || !mod.html_content || mod.status === "archived") return notFound(locale);

  // SÉCURITÉ (zero-trust) : le module DOIT appartenir au même tenant que le lien.
  // Défense au niveau lecture contre une ligne app_share_links forgée (insert
  // PostgREST direct) pointant vers le module PRIVÉ d'un autre tenant. Sans ce
  // contrôle, service_role servirait le HTML d'autrui. Ne jamais retirer.
  if (mod.tenant_id !== link.tenant_id) return notFound(locale);

  // Lien 'client' : on branche le bridge de données scopées (window.biltia →
  // /api/share/data avec le token). 'preview' reste sans données (aperçu seul).
  let out = mod.html_content as string;
  if (link.kind === "client") out = injectShareBridge(out, token);

  // Le portail que voit le CLIENT est une INTERFACE (une app) → il porte le logo
  // BILTIA complet, comme /a et la visionneuse. Seul un DOCUMENT commercial partagé
  // (devis, facture : la vitrine de l'artisan, sensible à SON image) garde le logo de
  // l'artisan, jamais Biltia.
  if (mod.kind === "document") {
    try {
      out = injectAppBrand(out, await getBrandKit(admin, link.tenant_id));
    } catch {
      /* pas d'identité visuelle → l'en-tête garde le nom de l'entreprise */
    }
  } else {
    out = injectInterfaceWordmark(out);
  }

  return new Response(injectPoweredBy(out), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "private, no-store",
    },
  });
}
