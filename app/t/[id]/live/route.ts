import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { getFlagshipApp, renderFlagshipHtml } from "@/lib/flagship-apps";
import { injectBiltiaSDK } from "@/lib/biltia-sdk";
import { injectInterfaceWordmark } from "@/lib/app-brand";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// Aperçu LIVE (authentifié, DANS l'atelier) d'une app phare.
//
// Différence CAPITALE avec /t/[id] (aperçu marketing) : ici on injecte le SDK
// RÉEL (pont window.biltia → /api/data), PAS le stub de démo. L'app lit donc le
// workspace RÉEL de l'utilisateur — un workspace vide s'affiche VIDE. On ne
// fabrique JAMAIS de donnée : le jeu de démo (SCI Méditerranée…) ne doit jamais
// apparaître dans le produit connecté, uniquement sur la landing publique.
//
// Sert le repli « adapter la maquette au chat » du chooser (data-start-modal).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();

  const app = getFlagshipApp(id);
  if (!app || !app.ready) {
    return new Response(pick(locale, "Modèle introuvable.", "Template not found."), { status: 404 });
  }

  // Nom d'entreprise réel pour l'en-tête (best-effort ; défaut neutre sinon).
  let entreprise = pick(locale, "Mon entreprise", "My company");
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const membership = await getActiveMembershipServer(supabase, user.id);
      if (membership) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("name")
          .eq("id", membership.tenant_id)
          .maybeSingle();
        if (tenant?.name) entreprise = tenant.name;
      }
    }
  } catch {
    // pas de session lisible → on garde le nom par défaut, l'app reste vide.
  }

  // Wordmark Biltia (une fois, jamais le « B ») — même marque que la visionneuse.
  const html = injectInterfaceWordmark(injectBiltiaSDK(renderFlagshipHtml(app, entreprise, locale)));
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
