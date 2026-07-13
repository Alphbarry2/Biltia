// ─────────────────────────────────────────────────────────────────────────────
// BRAND KIT — l'identité visuelle de l'ARTISAN (pas celle de Biltia).
//
// Source unique de vérité pour tout ce qui SORT vers un client : devis, facture,
// email d'accompagnement, page publique « Voir et accepter ». Un devis est la
// vitrine de l'artisan : il porte SON logo, SES couleurs, SES mentions légales.
// Le badge « Powered by Biltia » reste sur l'INTERFACE (apps, portails) et ne
// touche JAMAIS un document commercial.
//
// Stockage :
//   • tenants.logo_url          → URL publique du logo (bucket `brand`, migr. 047)
//   • tenants.company_info.brand → couleurs + coordonnées + mentions (JSONB libre)
//   • tenants.company_info.*     → siret/vat/address déjà saisis dans Réglages
//   • tenants.name               → raison sociale
//
// Champ vide = champ ABSENT du document. On n'invente jamais un SIRET ni une
// assurance décennale : un document faux est pire qu'un document incomplet.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

/** Couleurs par défaut : NOIR ET BLANC. Un devis monochrome est toujours élégant ;
 *  un devis mal colorié ne l'est jamais. La couleur n'apparaît que si l'artisan
 *  l'a choisie — jamais un violet Biltia posé d'office sur SON document. */
export const DEFAULT_PRIMARY = "#111114";
export const DEFAULT_ACCENT = "#111114";

export type BrandKit = {
  /** Raison sociale (tenants.name, ou company_info.company_name s'il diffère). */
  entreprise: string;
  /** URL publique du logo (bucket `brand`). Null → on retombe sur le nom en toutes lettres. */
  logoUrl: string | null;
  /** Couleur principale : bandeau, titres, ligne de total. */
  primary: string;
  /** Couleur secondaire : liserés, badges, boutons. */
  accent: string;

  // ── Coordonnées ────────────────────────────────────────────────────────────
  address: string;
  phone: string;
  email: string;
  website: string;
  country: "FR" | "BE";

  // ── Mentions légales (FR/BE) ───────────────────────────────────────────────
  siret: string;
  vat: string;
  rcs: string;
  ape: string;
  capital: string;
  /** Assurance décennale — obligatoire sur un devis BTP en France. */
  assurance: string;

  // ── Paiement ───────────────────────────────────────────────────────────────
  iban: string;
  bic: string;
  /** Conditions de règlement (« Acompte 30 % à la commande, solde à réception »). */
  conditionsPaiement: string;

  /** Pied de page libre (une ligne, sous les mentions). */
  footer: string;
};

type BrandJson = Partial<
  Record<
    | "primary"
    | "accent"
    | "phone"
    | "email"
    | "website"
    | "rcs"
    | "ape"
    | "capital"
    | "assurance"
    | "iban"
    | "bic"
    | "conditions_paiement"
    | "footer",
    unknown
  >
>;

type CompanyInfo = {
  company_name?: unknown;
  country?: unknown;
  vat?: unknown;
  siret?: unknown;
  address?: unknown;
  brand?: unknown;
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Normalise une couleur saisie (#abc, ABCDEF, #ABCDEF) en #rrggbb minuscule.
 *  Toute saisie douteuse retombe sur le défaut : jamais de CSS cassé dans un PDF. */
export function normalizeHex(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  let v = input.trim();
  if (!v) return fallback;
  if (!v.startsWith("#")) v = `#${v}`;
  // Forme courte #abc → #aabbcc
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return HEX.test(v) ? v.toLowerCase() : fallback;
}

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Luminance relative (WCAG) → sert à choisir un texte lisible SUR la couleur. */
function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const channel = (h: string) => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.slice(0, 2)) + 0.7152 * channel(c.slice(2, 4)) + 0.0722 * channel(c.slice(4, 6));
}

/** Texte lisible sur un fond donné : un artisan qui choisit du jaune vif doit
 *  obtenir du texte NOIR, pas du blanc illisible sur son propre devis. */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.55 ? "#111114" : "#FFFFFF";
}

/** Version très pâle d'une couleur (fond de tableau, bandeau de totaux). */
export function tintOf(hex: string, alpha = 0.08): string {
  const c = hex.replace("#", "");
  const mix = (i: number) => {
    const v = parseInt(c.slice(i, i + 2), 16);
    return Math.round(v * alpha + 255 * (1 - alpha));
  };
  const hx = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hx(mix(0))}${hx(mix(2))}${hx(mix(4))}`;
}

/** Construit le Brand Kit à partir d'une ligne `tenants`. Pur (testable). */
export function brandFromTenant(row: {
  name?: string | null;
  logo_url?: string | null;
  company_info?: unknown;
}): BrandKit {
  const info = (row.company_info ?? {}) as CompanyInfo;
  const brand = ((info.brand ?? {}) as BrandJson) || {};
  const country = str(info.country) === "BE" ? "BE" : "FR";

  return {
    entreprise: str(info.company_name, 120) || str(row.name, 120),
    logoUrl: typeof row.logo_url === "string" && row.logo_url.startsWith("http") ? row.logo_url : null,
    primary: normalizeHex(brand.primary, DEFAULT_PRIMARY),
    accent: normalizeHex(brand.accent, DEFAULT_ACCENT),

    address: str(info.address, 240),
    phone: str(brand.phone, 40),
    email: str(brand.email, 120),
    website: str(brand.website, 120),
    country,

    siret: str(info.siret, 40),
    vat: str(info.vat, 40),
    rcs: str(brand.rcs, 80),
    ape: str(brand.ape, 20),
    capital: str(brand.capital, 40),
    assurance: str(brand.assurance, 240),

    iban: str(brand.iban, 40),
    bic: str(brand.bic, 20),
    conditionsPaiement: str(brand.conditions_paiement, 400),

    footer: str(brand.footer, 240),
  };
}

/** Lit le Brand Kit du tenant. `client` peut être un client RLS (utilisateur
 *  connecté) OU le client service_role (page publique où le visiteur n'a pas de
 *  session). Ne throw jamais : un tenant sans fiche renvoie un kit vide mais valide. */
export async function getBrandKit(
  client: SupabaseClient,
  tenantId: string
): Promise<BrandKit> {
  const { data } = await client
    .from("tenants")
    .select("name, logo_url, company_info")
    .eq("id", tenantId)
    .maybeSingle();

  return brandFromTenant((data as { name?: string; logo_url?: string; company_info?: unknown } | null) ?? {});
}

/** Ce qui MANQUE pour un document commercial irréprochable. Sert à afficher un
 *  rappel honnête dans les Réglages plutôt que de laisser partir un devis nu.
 *  L'assurance décennale n'est réclamée qu'en France (obligation légale FR). */
export function brandGaps(kit: BrandKit): string[] {
  const gaps: string[] = [];
  if (!kit.logoUrl) gaps.push("logo");
  if (!kit.entreprise) gaps.push("raison sociale");
  if (!kit.address) gaps.push("adresse");
  if (!kit.siret) gaps.push(kit.country === "BE" ? "numéro BCE" : "SIRET");
  if (!kit.vat) gaps.push("numéro de TVA");
  if (kit.country === "FR" && !kit.assurance) gaps.push("assurance décennale");
  return gaps;
}

/** Le logo, téléchargé en mémoire pour être EMBARQUÉ dans le PDF.
 *  On ne laisse pas le moteur PDF aller chercher l'URL lui-même : un réseau lent
 *  ou un 404 ne doit pas faire échouer l'envoi d'un devis — pas de logo, tant pis,
 *  le document part quand même avec le nom de l'entreprise. */
export async function fetchLogoBuffer(
  logoUrl: string | null
): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 3_000_000) return null;
    // @react-pdf/renderer ne décode que PNG et JPEG — d'où le bucket restreint à
    // ces deux formats (migration 047). On refuse plutôt que d'embarquer un
    // fichier que le moteur laissera tomber en silence.
    if (type.includes("png")) return { data: buf, format: "png" };
    if (type.includes("jpeg") || type.includes("jpg")) return { data: buf, format: "jpg" };
    return null;
  } catch {
    return null;
  }
}
