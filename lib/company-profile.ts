// ─────────────────────────────────────────────────────────────────────────────
// PROFIL D'ENTREPRISE — source CANONIQUE des infos de l'entreprise active.
//
// « Ce que Biltia connaît déjà, il ne le redemande pas et ne l'invente jamais. »
// Une seule fonction lit l'identité, les coordonnées et les préférences de
// l'entreprise ACTIVE, normalise l'ancien sac JSONB (tenants.company_info) en un
// objet typé stable, indique explicitement les champs ABSENTS et conserve la
// PROVENANCE de chaque valeur.
//
// Sécurité : le tenant vient TOUJOURS du contexte serveur (jamais du LLM) ; la
// lecture est scopée au tenant actif (`.eq("id", tenantId)`).
//
// Ce module est PUR (aucun import de valeur locale / SDK) → chargeable tel quel
// par `node --test`. Les taux de TVA (lib/tva.ts) sont INJECTÉS par l'appelant
// pour ne pas dupliquer le référentiel fiscal.
//
// STOCKAGE RÉEL (audité) :
//   tenants.name                       → raison sociale
//   tenants.logo_url                   → logo (URL bucket `brand`)
//   tenants.company_info.company_name  → nom commercial (optionnel)
//   tenants.company_info.country       → "FR" | "BE"
//   tenants.company_info.siret         → SIRET (FR) OU n° BCE (BE) — MÊME clé
//   tenants.company_info.vat           → n° de TVA
//   tenants.company_info.address       → adresse (chaîne unique, non découpée)
//   tenants.company_info.brand.{phone,email} → coordonnées
//   (taux de TVA)                      → lib/tva.ts, par pays (injecté)
//
// ABSENTS du schéma (documentés, PAS de migration ici) : SIREN séparé, code
// postal / ville (adresse non structurée), site web, IBAN, BIC, conditions de
// paiement, mentions légales, devise. → jamais inventés, signalés « manquants ».
// ─────────────────────────────────────────────────────────────────────────────

export interface CompanyProfile {
  tenantId: string;
  legalName?: string;
  tradeName?: string;
  registration?: {
    country?: "FR" | "BE";
    siren?: string;
    siret?: string;
    bce?: string;
    vatNumber?: string;
  };
  address?: {
    line1?: string;
    postalCode?: string;
    city?: string;
    country?: "FR" | "BE";
  };
  contact?: {
    email?: string;
    phone?: string;
    website?: string;
  };
  branding?: {
    logoUrl?: string;
  };
  /** Présent UNIQUEMENT si demandé explicitement (facture / paiement). */
  banking?: {
    iban?: string;
    bic?: string;
  };
  documents?: {
    paymentTerms?: string;
    legalMentions?: string;
    defaultCurrency?: string;
    defaultVatRates?: number[];
  };
  /** Libellés lisibles des champs importants ABSENTS (jamais inventés). */
  missingFields: string[];
  /** Provenance de chaque champ PRÉSENT (chemin de stockage). */
  sources: Record<string, string>;
}

/** Ligne `tenants` (forme minimale lue). */
export type CompanyRow = {
  name?: string | null;
  logo_url?: string | null;
  company_info?: unknown;
};

export interface CompanyProfileOptions {
  /** Inclure les coordonnées bancaires (sensibles) — UNIQUEMENT facture/paiement. */
  includeBanking?: boolean;
  /** Taux de TVA du pays, INJECTÉ (lib/tva.ts) pour ne pas dupliquer le référentiel. */
  vatRatesForCountry?: (country: "FR" | "BE") => number[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MinimalDb = { from: (table: string) => any };

function s(v: unknown, max = 200): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/**
 * Construit le profil à partir d'une ligne `tenants`. PUR (testable). `row` null
 * (tenant introuvable / autre tenant) → profil tout-manquant, jamais d'invention.
 */
export function buildCompanyProfile(
  tenantId: string,
  row: CompanyRow | null,
  opts: CompanyProfileOptions = {}
): CompanyProfile {
  const info = (row?.company_info ?? {}) as Record<string, unknown>;
  const brand = (info.brand ?? {}) as Record<string, unknown>;
  const country: "FR" | "BE" = String(info.country ?? "").toUpperCase() === "BE" ? "BE" : "FR";

  const legalName = s(row?.name, 120);
  const companyName = s(info.company_name, 120);
  const tradeName = companyName && companyName !== legalName ? companyName : undefined;
  // MÊME clé `siret` pour les DEUX pays — le CODE (pas le LLM) décide du libellé.
  const registrationId = s(info.siret, 40);
  const vatNumber = s(info.vat, 40);
  const address = s(info.address, 240);
  const phone = s(brand.phone, 40);
  const email = s(brand.email, 120);
  const logoUrl =
    typeof row?.logo_url === "string" && row.logo_url.startsWith("http") ? row.logo_url.slice(0, 500) : undefined;

  const sources: Record<string, string> = {};
  const src = (key: string, present: unknown, path: string) => {
    if (present !== undefined) sources[key] = path;
  };

  src("legalName", legalName, "tenants.name");
  src("tradeName", tradeName, "tenants.company_info.company_name");
  src("registration.country", country, "tenants.company_info.country");
  // SIRET (FR) et BCE (BE) sont produits EXPLICITEMENT selon le pays, jamais
  // dérivés l'un de l'autre (un BCE n'est pas un SIRET).
  src("registration.siret", country === "FR" ? registrationId : undefined, "tenants.company_info.siret");
  src("registration.bce", country === "BE" ? registrationId : undefined, "tenants.company_info.siret");
  src("registration.vatNumber", vatNumber, "tenants.company_info.vat");
  src("address.line1", address, "tenants.company_info.address");
  src("contact.phone", phone, "tenants.company_info.brand.phone");
  src("contact.email", email, "tenants.company_info.brand.email");
  src("branding.logoUrl", logoUrl, "tenants.logo_url");

  const vatRates = opts.vatRatesForCountry ? opts.vatRatesForCountry(country) : undefined;
  if (vatRates) sources["documents.defaultVatRates"] = "lib/tva.ts (taux par pays)";
  // FR et BE sont dans la zone euro : la devise est un FAIT déterministe, pas une
  // invention. (Le montant, lui, n'est jamais inventé.)
  sources["documents.defaultCurrency"] = "déduit du pays (FR/BE = EUR)";

  const idLabel = country === "BE" ? "numéro BCE" : "SIRET";
  const missingFields: string[] = [];
  if (!legalName) missingFields.push("raison sociale");
  if (!registrationId) missingFields.push(idLabel);
  if (!vatNumber) missingFields.push("numéro de TVA");
  if (!address) missingFields.push("adresse");
  if (!phone) missingFields.push("téléphone");
  if (!email) missingFields.push("email");
  if (!logoUrl) missingFields.push("logo");
  // IBAN / BIC ne sont PAS stockés dans Biltia aujourd'hui : quand la mission les
  // demande (includeBanking), on les signale comme non renseignés — jamais inventés.
  if (opts.includeBanking) {
    missingFields.push("IBAN");
    missingFields.push("BIC");
  }

  return {
    tenantId,
    legalName,
    tradeName,
    registration: {
      country,
      // siren non stocké séparément → non exposé (jamais dérivé du SIRET/BCE).
      siret: country === "FR" ? registrationId : undefined,
      bce: country === "BE" ? registrationId : undefined,
      vatNumber,
    },
    address: { line1: address, country },
    contact: { email, phone },
    branding: { logoUrl },
    banking: opts.includeBanking ? { iban: undefined, bic: undefined } : undefined,
    documents: {
      defaultCurrency: "EUR",
      defaultVatRates: vatRates,
    },
    missingFields,
    sources,
  };
}

/**
 * Lit le profil de l'entreprise ACTIVE. Le tenant vient du contexte serveur
 * (`tenantId`), JAMAIS du LLM ; la lecture est scopée `.eq("id", tenantId)`. Ne
 * throw jamais : un tenant introuvable renvoie un profil tout-manquant valide.
 */
export async function getCompanyProfile(
  db: MinimalDb,
  tenantId: string,
  opts: CompanyProfileOptions = {}
): Promise<CompanyProfile> {
  let row: CompanyRow | null = null;
  try {
    const { data } = await db.from("tenants").select("name, logo_url, company_info").eq("id", tenantId).maybeSingle();
    row = (data as CompanyRow | null) ?? null;
  } catch {
    row = null;
  }
  return buildCompanyProfile(tenantId, row, opts);
}

/**
 * Projection COMPACTE pour le modèle (retour du tool `company_profile_get`).
 * Les champs `undefined` disparaissent au JSON.stringify. Les coordonnées
 * bancaires ne figurent QUE si `profile.banking` est présent (demande explicite).
 */
export function formatCompanyProfileForModel(p: CompanyProfile): Record<string, unknown> {
  const idLabel = p.registration?.country === "BE" ? "N° BCE" : "SIRET";
  const companyId = p.registration?.siret ?? p.registration?.bce;
  return {
    legal_name: p.legalName,
    trade_name: p.tradeName,
    country: p.registration?.country,
    id_label: idLabel,
    company_id: companyId,
    vat_number: p.registration?.vatNumber,
    address: p.address?.line1,
    phone: p.contact?.phone,
    email: p.contact?.email,
    logo_url: p.branding?.logoUrl,
    ...(p.banking ? { iban: p.banking.iban ?? null, bic: p.banking.bic ?? null } : {}),
    default_currency: p.documents?.defaultCurrency,
    default_vat_rates: p.documents?.defaultVatRates,
    missing_fields: p.missingFields,
    sources: p.sources,
    note:
      "Utilise ces infos telles quelles pour l'entreprise active. N'invente AUCUN champ de missing_fields : signale-le comme non renseigné dans Biltia. Ne redemande pas une info déjà présente ici.",
  };
}

/**
 * Schéma du tool `company_profile_get` (objet nu, sans dépendance au SDK → reste
 * testable). agent-tools.ts le caste en Anthropic.Tool et l'expose dans la boucle.
 * AUCUN paramètre de tenant : l'entreprise est TOUJOURS l'active (côté serveur).
 */
export const COMPANY_PROFILE_TOOL = {
  name: "company_profile_get",
  description:
    "Lit l'identité et les coordonnées de l'ENTREPRISE ACTIVE : raison sociale, SIRET (FR) / n° BCE (BE), n° de TVA, adresse, téléphone, email, logo, devise et taux de TVA usuels. Utilise-le dès qu'une mission a besoin des infos de l'entreprise (compléter un bon d'intervention/devis/facture, répondre « quel est mon numéro de TVA ? »). Ne redemande JAMAIS une info renvoyée ici ; les champs listés dans missing_fields ne sont pas renseignés dans Biltia — signale-les, ne les invente pas. include_banking=true UNIQUEMENT pour une facture ou un document de paiement (coordonnées bancaires).",
  input_schema: {
    type: "object" as const,
    properties: {
      include_banking: {
        type: "boolean" as const,
        description:
          "true UNIQUEMENT pour une facture ou un document de paiement (coordonnées bancaires IBAN/BIC). Défaut false.",
      },
    },
    additionalProperties: false as const,
  },
};

/**
 * Bloc d'en-tête pour la GÉNÉRATION DE DOCUMENTS (même source canonique que le
 * chat : pas de logique parallèle). Un champ absent → placeholder [entre
 * crochets] côté modèle, jamais une valeur inventée. Vide si aucune info.
 */
export function companyProfileToDocumentBlock(p: CompanyProfile): string {
  const idLabel = p.registration?.country === "BE" ? "N° BCE" : "SIRET";
  const companyId = p.registration?.siret ?? p.registration?.bce;
  // Lignes de CONTENU réel (le pays seul ne compte pas : il vaut « FR » par défaut).
  const content: string[] = [];
  if (p.legalName) content.push(`- Nom : ${p.legalName}`);
  if (p.tradeName) content.push(`- Nom commercial : ${p.tradeName}`);
  if (companyId) content.push(`- ${idLabel} : ${companyId}`);
  if (p.registration?.vatNumber) content.push(`- N° TVA : ${p.registration.vatNumber}`);
  if (p.address?.line1) content.push(`- Adresse : ${p.address.line1}`);
  if (p.contact?.phone) content.push(`- Téléphone : ${p.contact.phone}`);
  if (p.contact?.email) content.push(`- Email : ${p.contact.email}`);
  if (p.branding?.logoUrl) content.push(`- Logo : ${p.branding.logoUrl}`);
  if (!content.length) return ""; // aucune info renseignée → bloc vide (documents inchangés)

  const lines = [
    "# FICHE ENTREPRISE ÉMETTRICE (TES propres infos — remplis l'en-tête du document avec, ne les redemande jamais)",
    ...content,
  ];
  if (p.registration?.country) lines.push(`- Pays : ${p.registration.country}`);
  lines.push("", "Un champ manquant ci-dessus → placeholder clair [entre crochets], jamais inventé.");
  return lines.join("\n");
}
