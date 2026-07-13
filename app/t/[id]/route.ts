import { TEMPLATE_APPS } from "@/data/templates-html";
import { getFlagshipApp, renderFlagshipPreview, FLAGSHIP_IDS } from "@/lib/flagship-apps";
import { getLocale } from "@/lib/i18n/server";
import { pick, type Locale } from "@/lib/i18n/config";

// Sert le HTML d'un modèle pour l'aperçu live en iframe (same-origin).
// - id PHARE (app fonctionnelle) → la VRAIE app + window.biltia de démo (interactif).
// - sinon → la maquette statique premium.
// L'import de la grosse data reste côté serveur → hors bundle client.
export function generateStaticParams() {
  const ids = new Set<string>([...TEMPLATE_APPS.map((t) => t.id), ...FLAGSHIP_IDS]);
  return [...ids].map((id) => ({ id }));
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // La langue vient de l'URL (?lang=en), PAS du cookie : cette réponse est mise
  // en cache PUBLIC. Une variation par cookie servirait l'anglais au visiteur
  // suivant, français. Une clé d'URL distincte = un cache distinct.
  const lang: Locale = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "fr";

  const flag = getFlagshipApp(id);
  if (flag && flag.ready) {
    return new Response(renderFlagshipPreview(flag, lang), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=30, must-revalidate",
        "x-robots-tag": "noindex",
      },
    });
  }

  const t = TEMPLATE_APPS.find((a) => a.id === id);
  if (!t) {
    const locale = await getLocale();
    return new Response(pick(locale, "Modèle introuvable.", "Template not found."), { status: 404 });
  }
  return new Response(t.html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=30, must-revalidate",
      "x-robots-tag": "noindex",
    },
  });
}
