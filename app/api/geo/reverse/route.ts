// ─────────────────────────────────────────────────────────────────────────────
// /api/geo/reverse — géocodage inverse (coordonnées → adresse).
//
// Alimente le bouton « Utiliser ma position » : le navigateur donne le GPS, on
// retrouve l'adresse la plus proche. Même posture que /api/geo/search : read-only,
// same-origin, donnée publique.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { geoReverse } from "@/lib/geo-providers";

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
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
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "invalid_coords" }, { status: 400 });
  }

  const result = await geoReverse(lat, lng);
  return NextResponse.json({ result });
}
