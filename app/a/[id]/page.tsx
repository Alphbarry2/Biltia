// ─────────────────────────────────────────────────────────────────────────────
// /a/<id> — UNE app, plein écran, sans Biltia autour.
//
// C'est la porte de l'employé. Installée depuis cette page (manifeste dédié,
// juste en dessous), l'app devient une ICÔNE sur l'écran d'accueil : un tap et
// il est dans « Pointage », sans traverser un tableau de bord ni une
// Bibliothèque.
//
// Elle reste servie PAR Biltia, et c'est ce qui la rend vivante : la session
// authentifie, la RLS isole, le pont lui donne les données. « Détacher » l'app
// (l'héberger ailleurs, sans session) ne donnerait pas une app libre — ça
// donnerait une maquette qui ne se souvient de rien. Cf. lib/app-connectivity.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata, Viewport } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { injectInterfaceWordmark } from "@/lib/app-brand";
import { injectComponentEngine } from "@/lib/app-components";
import { StandaloneApp } from "@/components/standalone-app";

export const dynamic = "force-dynamic";

async function loadApp(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, app: null, supabase };

  // RLS : un membre ne lit que les apps de son tenant.
  const { data: app } = await supabase
    .from("modules")
    .select("id, name, html_content, tenant_id")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();

  return { user, app, supabase };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { app } = await loadApp(id);
  const name = app?.name ?? "Biltia";
  return {
    title: name,
    // L'icône installée porte le nom de l'APP, pas celui de Biltia : sur l'écran
    // d'accueil de l'employé, il cherche « Pointage », pas un logiciel.
    appleWebApp: { capable: true, statusBarStyle: "default", title: name },
    robots: { index: false, follow: false },
    // `null` SUPPRIME le manifeste global hérité de la racine (scope "/",
    // start_url "/dashboard"). Sans ça, deux <link rel="manifest"> cohabitent
    // dans le <head> et le téléphone installerait « Biltia » au lieu de l'app.
    // Le nôtre est posé dans le composant ci-dessous, car il a besoin de
    // `crossOrigin` — que l'API Metadata ne sait pas écrire.
    manifest: null,
  };
}

export const viewport: Viewport = {
  themeColor: "#FAFAF9",
  // Indispensable en PWA installée : sans cover, l'app s'arrête au-dessus de
  // l'encoche et sous la barre d'accueil.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default async function StandaloneAppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, app } = await loadApp(id);

  // Non connecté : on revient ICI après le login, pas sur le tableau de bord.
  // Sans ce retour, taper sur l'icône de son app renverrait l'employé dans le
  // logiciel — exactement ce que cette page existe pour supprimer.
  if (!user) redirect(`/login?next=${encodeURIComponent(`/a/${id}`)}`);
  if (!app) notFound();

  // L'en-tête porte le logo BILTIA complet, posé AU MOMENT DE SERVIR : les apps
  // déjà créées en profitent sans être régénérées, et le nom de l'app disparaît de
  // l'en-tête (il reste dans le manifeste ci-dessous). Le logo de l'ARTISAN, lui,
  // coiffe ses documents et ses portails clients, pas son propre outil.
  // Même principe pour le runtime `biltiaUI` : un correctif du moteur (résolution
  // des relations dans les tableaux, par ex.) doit profiter aux apps déjà créées,
  // pas seulement aux prochaines générations.
  const html = injectComponentEngine(injectInterfaceWordmark(app.html_content));

  return (
    <>
      {/* Manifeste PROPRE à cette app → une icône par app, et non une icône
          « Biltia » unique. `use-credentials` est obligatoire : le navigateur
          récupère un manifeste SANS cookies par défaut, et cette route est
          protégée par la session. */}
      <link rel="manifest" href={`/a/${id}/manifest.webmanifest`} crossOrigin="use-credentials" />
      <StandaloneApp moduleId={app.id} html={html} />
    </>
  );
}
