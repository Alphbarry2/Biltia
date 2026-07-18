// ─────────────────────────────────────────────────────────────────────────────
// GÉOCODAGE — fournisseurs d'adresses (SERVEUR uniquement).
//
// Autocomplétion + géocodage d'une adresse en coordonnées (lat/lng), pour poser
// un point sur la carte. Deux sources, gratuites et SANS clé d'API :
//
//   1. BAN — Base Adresse Nationale (api-adresse.data.gouv.fr). Donnée officielle
//      de l'État français : la RÉFÉRENCE pour les adresses FR. Interrogée en
//      premier. RGPD-safe (donnée publique, hébergée en France).
//   2. Photon (photon.komoot.io, OpenStreetMap). Couvre toute l'Europe (dont la
//      Belgique) : repli quand la BAN ne renvoie rien (adresse hors France).
//
// Ce module ne doit JAMAIS être importé par un composant client : il parle à des
// services externes et n'a rien à faire dans le bundle du navigateur. Les routes
// /api/geo/* l'appellent et renvoient au front une forme normalisée (GeoResult).
// ─────────────────────────────────────────────────────────────────────────────

export type GeoResult = {
  /** Libellé complet lisible (« 12 Rue de Rivoli 75001 Paris »). */
  label: string;
  /** Ligne « numéro + voie » seule (ce qui va dans la colonne `adresse`). */
  street: string;
  postcode: string;
  city: string;
  /** « France », « Belgique »… ('' si inconnu). */
  country: string;
  lat: number | null;
  lng: number | null;
  source: "ban" | "photon";
};

// Étiquette d'appel (politesse Photon/OSM : identifier l'appelant).
const UA = "Biltia/1.0 (+https://biltia.com)";
const TIMEOUT_MS = 4500;

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

type Feature = { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } };

function features(j: unknown): Feature[] {
  const arr = (j as { features?: unknown })?.features;
  return Array.isArray(arr) ? (arr as Feature[]) : [];
}

function coords(f: Feature): { lng: number | null; lat: number | null } {
  const c = f.geometry?.coordinates;
  if (Array.isArray(c)) return { lng: num(c[0]), lat: num(c[1]) };
  return { lng: null, lat: null };
}

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ── BAN (France) ─────────────────────────────────────────────────────────────

function mapBAN(f: Feature): GeoResult {
  const p = f.properties ?? {};
  const { lat, lng } = coords(f);
  return {
    label: s(p.label),
    street: s(p.name) || s(p.label),
    postcode: s(p.postcode),
    city: s(p.city),
    country: "France",
    lat,
    lng,
    source: "ban",
  };
}

export async function searchBAN(q: string): Promise<GeoResult[]> {
  const j = await fetchJson(
    `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=6&autocomplete=1`
  );
  return features(j).map(mapBAN);
}

// ── Photon (Europe / Belgique) ───────────────────────────────────────────────

function mapPhoton(f: Feature): GeoResult {
  const p = f.properties ?? {};
  const hn = s(p.housenumber);
  const road = s(p.street) || s(p.name); // `street` = la voie ; `name` = POI ou voie
  // Convention FR : le numéro DEVANT la voie (« 42 Rue du Papillon »).
  const street = [hn, road].filter(Boolean).join(" ").trim() || s(p.name);
  const city = s(p.city) || s(p.town) || s(p.village) || s(p.county);
  const { lat, lng } = coords(f);
  return {
    label: [street, s(p.postcode), city, s(p.country)].filter(Boolean).join(", "),
    street,
    postcode: s(p.postcode),
    city,
    country: s(p.country),
    lat,
    lng,
    source: "photon",
  };
}

export async function searchPhoton(q: string): Promise<GeoResult[]> {
  const j = await fetchJson(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=fr&limit=6`
  );
  return features(j).map(mapPhoton);
}

function dedupKey(r: GeoResult): string {
  if (r.lat != null && r.lng != null) return `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
  return `${r.street}|${r.postcode}|${r.city}`.toLowerCase();
}

/** Minuscule + sans accents, pour comparer ce qui est tapé et ce qui est renvoyé. */
function norm(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Pertinence d'un résultat vis-à-vis de ce qui a été TAPÉ : combien de mots de la
 * requête (voie, code postal, surtout la VILLE) se retrouvent dans le résultat.
 * Les mots longs (noms de ville) pèsent double. C'est ce qui fait qu'« … seraing »
 * remonte l'adresse belge devant les « Rue Papillon » françaises approximatives.
 */
function relevance(r: GeoResult, tokens: string[]): number {
  const hay = norm([r.street, r.postcode, r.city, r.country, r.label].filter(Boolean).join(" "));
  let score = 0;
  for (const tok of tokens) if (hay.includes(tok)) score += tok.length >= 4 ? 2 : 1;
  return score;
}

/**
 * Autocomplétion EUROPÉENNE. BAN (France) et Photon (Belgique/Luxembourg/Europe)
 * interrogés EN PARALLÈLE (latence = le plus lent, pas la somme), fusionnés,
 * dédupliqués, puis CLASSÉS PAR PERTINENCE au texte tapé — le fournisseur n'a
 * plus d'importance, c'est le meilleur match qui gagne. Tri stable : à score égal
 * la BAN garde l'avantage (meilleure qualité FR par défaut). Ne lève jamais.
 */
export async function geoSearch(q: string): Promise<GeoResult[]> {
  const query = q.trim();
  if (query.length < 3) return [];
  const [ban, photon] = await Promise.all([
    searchBAN(query).catch(() => [] as GeoResult[]),
    searchPhoton(query).catch(() => [] as GeoResult[]),
  ]);
  const tokens = [...new Set(norm(query).split(/[\s,]+/).filter((t) => t.length >= 3))];
  const merged: GeoResult[] = [];
  const seen = new Set<string>();
  for (const r of [...ban, ...photon]) {
    const k = dedupKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(r);
  }
  merged.sort((a, b) => relevance(b, tokens) - relevance(a, tokens));
  return merged.slice(0, 8);
}

/**
 * Géocodage inverse (coordonnées → adresse), pour le bouton « Utiliser ma
 * position ». BAN d'abord, Photon en repli. Renvoie null si rien trouvé.
 */
export async function geoReverse(lat: number, lng: number): Promise<GeoResult | null> {
  const ban = await fetchJson(
    `https://api-adresse.data.gouv.fr/reverse/?lon=${lng}&lat=${lat}`
  );
  const banFeat = features(ban)[0];
  if (banFeat) return mapBAN(banFeat);

  const photon = await fetchJson(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&lang=fr`);
  const phFeat = features(photon)[0];
  return phFeat ? mapPhoton(phFeat) : null;
}
