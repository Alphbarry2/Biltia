// ─────────────────────────────────────────────────────────────────────────────
// IMPORT CRM — CSV/Excel → prospects.
//
// Le fichier est parsé CÔTÉ CLIENT (comme components/data-start-modal.tsx :
// import dynamique de `xlsx`, XLSX.read({type:"array"})) puis les lignes
// brutes sont envoyées en JSON à /api/admin/crm/import. Ce module ne fait que
// le MAPPING — PUR (aucune I/O, déterministe) — deviner quelle colonne est
// l'entreprise, l'email, etc. via une liste d'alias FR/EN sur l'en-tête
// normalisé. Plafond de lignes appliqué côté route (comme lib/import-map.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type CrmFieldKey =
  | "company_name"
  | "contact_name"
  | "contact_email"
  | "contact_phone"
  | "website"
  | "sector"
  | "city";

export type CrmProspectInput = {
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  sector: string | null;
  city: string | null;
  raw_import: Record<string, string>;
};

export type CrmImportResult = {
  prospects: CrmProspectInput[];
  mapping: Partial<Record<CrmFieldKey, string>>;
  warnings: string[];
  skipped: number;
};

/** Normalise un en-tête pour la comparaison : minuscules, sans accents, sans ponctuation. */
function normHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// Ordre = priorité d'attribution quand deux colonnes pourraient matcher.
const ALIASES: [CrmFieldKey, string[]][] = [
  ["company_name", ["entreprise", "societe", "société", "company", "companyname", "nomentreprise", "nomdelentreprise", "raisonsociale", "nomsociete", "organisation", "organisme", "nom"]],
  ["contact_email", ["email", "mail", "courriel", "adressemail", "emailaddress", "e-mail"]],
  ["contact_phone", ["telephone", "tel", "phone", "numero", "numerodetelephone", "mobile", "gsm", "phonenumber"]],
  ["website", ["site", "siteweb", "website", "url", "web"]],
  ["sector", ["secteur", "activite", "secteurdactivite", "industry", "domaine", "secteurdactivité"]],
  ["city", ["ville", "city", "localite", "commune", "location"]],
  ["contact_name", ["contact", "dirigeant", "responsable", "interlocuteur", "nomcontact", "nomdudirigeant", "gerant", "gérant", "nomresponsable", "contactname"]],
];

/** Lignes brutes (déjà parsées côté client) → prospects mappés. Devine la colonne "entreprise" si aucun alias ne matche. */
export function mapImportRows(rawRows: Record<string, unknown>[]): CrmImportResult {
  const warnings: string[] = [];
  if (rawRows.length === 0) {
    return { prospects: [], mapping: {}, warnings: ["Fichier vide ou illisible."], skipped: 0 };
  }

  const rows: Record<string, string>[] = rawRows.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) out[k] = v == null ? "" : String(v).trim();
    return out;
  });

  const headers = Object.keys(rows[0]);
  const mapping: Partial<Record<CrmFieldKey, string>> = {};
  const usedHeaders = new Set<string>();

  for (const [field, aliases] of ALIASES) {
    const hit = headers.find((h) => !usedHeaders.has(h) && aliases.includes(normHeader(h)));
    if (hit) {
      mapping[field] = hit;
      usedHeaders.add(hit);
    }
  }

  if (!mapping.company_name) {
    const fallback = headers.find((h) => !usedHeaders.has(h)) ?? headers[0];
    if (fallback) {
      mapping.company_name = fallback;
      usedHeaders.add(fallback);
      warnings.push(`Colonne « entreprise » non reconnue automatiquement — colonne « ${fallback} » utilisée.`);
    }
  }

  const companyHeader = mapping.company_name;
  if (!companyHeader) {
    return { prospects: [], mapping, warnings: ["Impossible de déterminer une colonne entreprise."], skipped: rows.length };
  }

  let skipped = 0;
  const prospects: CrmProspectInput[] = [];
  for (const row of rows) {
    const company = row[companyHeader]?.trim();
    if (!company) {
      skipped++;
      continue;
    }
    prospects.push({
      company_name: company,
      contact_name: mapping.contact_name ? row[mapping.contact_name]?.trim() || null : null,
      contact_email: mapping.contact_email ? row[mapping.contact_email]?.trim() || null : null,
      contact_phone: mapping.contact_phone ? row[mapping.contact_phone]?.trim() || null : null,
      website: mapping.website ? row[mapping.website]?.trim() || null : null,
      sector: mapping.sector ? row[mapping.sector]?.trim() || null : null,
      city: mapping.city ? row[mapping.city]?.trim() || null : null,
      raw_import: row,
    });
  }

  return { prospects, mapping, warnings, skipped };
}
