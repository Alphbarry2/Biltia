import { TEMPLATE_APPS } from "@/data/templates-html";
import { getFlagshipApp, renderFlagshipPreview, FLAGSHIP_IDS } from "@/lib/flagship-apps";

// Sert le HTML d'un modèle pour l'aperçu live en iframe (same-origin).
// - id PHARE (app fonctionnelle) → la VRAIE app + window.biltia de démo (interactif).
// - sinon → la maquette statique premium.
// L'import de la grosse data reste côté serveur → hors bundle client.
export function generateStaticParams() {
  const ids = new Set<string>([...TEMPLATE_APPS.map((t) => t.id), ...FLAGSHIP_IDS]);
  return [...ids].map((id) => ({ id }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const flag = getFlagshipApp(id);
  if (flag && flag.ready) {
    return new Response(renderFlagshipPreview(flag), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=30, must-revalidate",
        "x-robots-tag": "noindex",
      },
    });
  }

  const t = TEMPLATE_APPS.find((a) => a.id === id);
  if (!t) return new Response("Modèle introuvable.", { status: 404 });
  return new Response(t.html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=30, must-revalidate",
      "x-robots-tag": "noindex",
    },
  });
}
