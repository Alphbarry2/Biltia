// ─────────────────────────────────────────────────────────────────────────────
// /document/[token]/pdf — TÉLÉCHARGEMENT du document par le client de l'artisan.
//
// Le PDF est REGÉNÉRÉ à la demande depuis la fiche : il reflète donc toujours
// l'état réel du devis (et le logo/les couleurs à jour). On ne stocke aucun PDF —
// un fichier figé finirait par mentir sur ce que dit la base.
// ─────────────────────────────────────────────────────────────────────────────

import { resolvePublicDocument } from "@/lib/documents/public-doc";
import { renderBusinessDocPdf, pdfFileName } from "@/lib/documents/business-doc";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  // Le rendu PDF coûte du CPU : on borne par jeton (le visiteur n'a pas de compte).
  const limited = await enforceRateLimit("share_read", `pdf:${token}`, LIMITS.share_read);
  if (limited) return limited;

  const resolved = await resolvePublicDocument(token);
  if (!resolved) {
    return new Response("Ce lien n'est plus valable.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { doc, lines, client, brand } = resolved;
  const pdf = await renderBusinessDocPdf({ doc, lines, client, brand });
  const filename = pdfFileName(doc);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      // Jamais de cache partagé : le document est nominatif.
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
