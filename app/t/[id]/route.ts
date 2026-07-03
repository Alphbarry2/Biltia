import { TEMPLATE_APPS } from "@/data/templates-html";

// Sert le HTML complet d'un modèle pour l'aperçu live en iframe (same-origin).
// L'import de la grosse data reste côté serveur → hors bundle client.
export function generateStaticParams() {
  return TEMPLATE_APPS.map((t) => ({ id: t.id }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = TEMPLATE_APPS.find((a) => a.id === id);
  if (!t) return new Response("Modèle introuvable.", { status: 404 });
  return new Response(t.html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "noindex",
    },
  });
}
