// ─────────────────────────────────────────────────────────────────────────────
// /api/geo/search — autocomplétion d'adresse (proxy vers la BAN + repli Photon).
//
// Read-only, sans effet de bord : appelée à chaque frappe (débounce côté client).
// Proxifiée côté serveur pour (1) pouvoir changer de fournisseur sans toucher au
// front, (2) normaliser la réponse, (3) garder l'appel same-origin. Pas de coût
// crédit, pas d'écriture : on ne charge donc pas la session (le garde same-origin
// suffit ; l'endpoint ne fait que relayer une donnée publique et gratuite).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { geoSearch } from "@/lib/geo-providers";

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // requêtes sans Origin (navigation directe) → tolérées
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 3) return NextResponse.json({ results: [] });

  const results = await geoSearch(q);
  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
