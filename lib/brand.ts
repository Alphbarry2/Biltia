// ─────────────────────────────────────────────────────────────────────────────
// BRAND KIT — l'identité visuelle de l'ARTISAN (pas celle de Biltia).
//
// VOLONTAIREMENT MINIMAL : logo, UNE couleur, téléphone, email. Rien d'autre.
// C'est une identité visuelle, pas une fiche d'entreprise — et surtout, aucun de
// ces quatre champs n'est propre à un pays.
//
// Tout ce qui est LÉGAL (raison sociale, adresse, SIRET / n° BCE, TVA) vit déjà
// dans Réglages → Entreprise, qui s'adapte au pays. Les documents vont l'y
// chercher : on ne redemande jamais à l'artisan ce qu'il a déjà saisi, et on
// n'invente surtout pas d'obligations françaises pour un artisan belge.
//
// Le badge « Powered by Biltia » reste sur l'INTERFACE (apps, portails) et ne
// touche JAMAIS un document commercial : le devis est la vitrine de l'artisan.
//
// Stockage :
//   • tenants.logo_url           → URL publique du logo (bucket `brand`, migr. 047)
//   • tenants.company_info.brand → { primary, phone, email }
//   • tenants.company_info.*     → pays / siret / vat / address (onglet Entreprise)
//   • tenants.name               → raison sociale
//
// Champ vide = champ ABSENT du document. On n'invente jamais un SIRET : un
// document faux est pire qu'un document incomplet.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

/** Couleur par défaut : NOIR. Un devis monochrome est toujours élégant ; un devis
 *  mal colorié ne l'est jamais. La couleur n'apparaît que si l'artisan l'a choisie
 *  — jamais un violet Biltia posé d'office sur SON document. */
export const DEFAULT_PRIMARY = "#111114";

export type BrandKit = {
  /** Raison sociale (tenants.name, ou company_info.company_name s'il diffère). */
  entreprise: string;
  /** URL publique du logo (bucket `brand`). Null → on retombe sur le nom en toutes lettres. */
  logoUrl: string | null;
  /** LA couleur de l'entreprise : bandeau, titres, total. Une seule — deux, c'est
   *  déjà une charte graphique, et personne ne sait quoi mettre dans la seconde. */
  primary: string;

  /** Coordonnées affichées en tête de document et en signature d'email. */
  phone: string;
  email: string;

  // ── Repris de l'onglet Entreprise (pas ressaisis ici) ──────────────────────
  address: string;
  /** SIRET (FR) ou numéro BCE (BE) — même champ, libellé différent selon le pays. */
  siret: string;
  vat: string;
  country: "FR" | "BE";
};

type BrandJson = Partial<Record<"primary" | "phone" | "email", unknown>>;

type CompanyInfo = {
  company_name?: unknown;
  country?: unknown;
  vat?: unknown;
  siret?: unknown;
  address?: unknown;
  brand?: unknown;
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Le libellé de l'identifiant d'entreprise dépend du PAYS. Un artisan belge n'a
 *  pas de SIRET, il a un numéro BCE. Une seule fonction, utilisée partout. */
export function companyIdLabel(country: "FR" | "BE"): string {
  return country === "BE" ? "N° BCE" : "SIRET";
}

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

/** Version très pâle d'une couleur (fond du bandeau de totaux). */
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

  return {
    entreprise: str(info.company_name, 120) || str(row.name, 120),
    logoUrl: typeof row.logo_url === "string" && row.logo_url.startsWith("http") ? row.logo_url : null,
    primary: normalizeHex(brand.primary, DEFAULT_PRIMARY),

    phone: str(brand.phone, 40),
    email: str(brand.email, 120),

    address: str(info.address, 240),
    siret: str(info.siret, 40),
    vat: str(info.vat, 40),
    country: str(info.country) === "BE" ? "BE" : "FR",
  };
}

/** Lit le Brand Kit du tenant. `client` peut être un client RLS (utilisateur
 *  connecté) OU le client service_role (page publique où le visiteur n'a pas de
 *  session). Ne throw jamais : un tenant sans fiche renvoie un kit vide mais valide. */
export async function getBrandKit(client: SupabaseClient, tenantId: string): Promise<BrandKit> {
  const { data } = await client
    .from("tenants")
    .select("name, logo_url, company_info")
    .eq("id", tenantId)
    .maybeSingle();

  return brandFromTenant((data as { name?: string; logo_url?: string; company_info?: unknown } | null) ?? {});
}

/** Ce qui manque pour que le document ne parte pas nu. On ne réclame que ce qui
 *  vaut pour LES DEUX pays : l'identifiant d'entreprise change de nom, pas de
 *  nature. Aucune obligation franco-française n'est imposée à un artisan belge. */
export function brandGaps(kit: BrandKit): string[] {
  const gaps: string[] = [];
  if (!kit.logoUrl) gaps.push("logo");
  if (!kit.entreprise) gaps.push("raison sociale");
  if (!kit.address) gaps.push("adresse");
  if (!kit.siret) gaps.push(companyIdLabel(kit.country));
  if (!kit.vat) gaps.push("numéro de TVA");
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
