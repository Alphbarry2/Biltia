// ─────────────────────────────────────────────────────────────────────────────
// IMPORT CSV/EXCEL → ENTITÉ WORKSPACE (auto-mapping des colonnes).
//
// Le client parse le fichier (xlsx) en lignes {en-tête: valeur} et les envoie ;
// ici on rapproche chaque en-tête d'un champ INSCRIPTIBLE de l'entité cible
// (data-entities.writable), par match exact « normalisé » puis via un petit
// dictionnaire de synonymes universels (nom, email, ville…). Les colonnes non
// reconnues sont ignorées (jamais devinées de travers). Les lignes vides sont
// écartées. Sûr : on ne produit que des champs whitelistés de l'entité.
// ─────────────────────────────────────────────────────────────────────────────

import { ENTITIES } from "@/lib/data-entities";

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[^a-z0-9]/g, "");
}

// Synonymes universels → champ canonique. N'est appliqué que si le champ
// canonique est inscriptible pour l'entité cible.
const SYNONYMS: Record<string, string[]> = {
  nom: ["nom", "name", "client", "clientname", "raisonsociale", "societe", "society", "company", "entreprise", "intitule", "libelle", "designation", "titre", "title", "fournisseur", "soustraitant"],
  prenom: ["prenom", "firstname", "givenname"],
  email: ["email", "mail", "courriel", "adressemail", "emailaddress", "mel"],
  tel: ["tel", "telephone", "phone", "mobile", "portable", "gsm", "telephonenumber", "numero", "numerotel"],
  ville: ["ville", "city", "commune", "localite"],
  code_postal: ["codepostal", "cp", "zip", "zipcode", "postalcode"],
  adresse: ["adresse", "address", "rue", "voie"],
  siret: ["siret", "siren"],
  statut: ["statut", "status", "etat", "state"],
  notes: ["notes", "note", "remarque", "remarques", "commentaire", "commentaires", "comment", "observations"],
  type: ["type", "nature"],
  categorie: ["categorie", "category", "categories"],
  specialite: ["specialite", "metier", "corpsdemetier", "activite", "domaine"],
  role: ["role", "poste", "fonction", "job"],
  corps_metier: ["corpsmetier", "corpsdemetier"],
  montant: ["montant", "amount", "prix", "price", "valeur", "value"],
  montant_ttc: ["montantttc", "ttc", "totalttc", "total"],
  montant_ht: ["montantht", "ht", "totalht"],
  ville_chantier: ["villechantier"],
  reference: ["reference", "ref", "refnum"],
  heures: ["heures", "heure", "hours", "duree", "duration"],
  avancement: ["avancement", "progress", "progression", "pourcentage"],
  budget: ["budget"],
};

const NUMERIC_HINT = /(montant|budget|prix|total|heures|avancement|quantite|qte|taux|tva|prixunitaire|prix_vente)/;

// Repli par INCLUSION (en-têtes composés : « Nom du chantier », « Adresse mail »…).
// Ordre important : `prenom` avant `nom` (car « prénom » contient « nom »).
const CONTAINS: [string, string][] = [
  ["prenom", "prenom"],
  ["mail", "email"],
  ["telephone", "tel"], ["phone", "tel"], ["portable", "tel"], ["mobile", "tel"],
  ["codepostal", "code_postal"], ["cp", "code_postal"],
  ["ville", "ville"], ["city", "ville"],
  ["adresse", "adresse"],
  ["siret", "siret"], ["siren", "siret"],
  ["montant", "montant"], ["budget", "budget"], ["prix", "montant"],
  ["statut", "statut"], ["status", "statut"], ["etat", "statut"],
  ["specialite", "specialite"], ["metier", "specialite"],
  ["nom", "nom"], ["client", "nom"], ["designation", "nom"], ["intitule", "nom"], ["libelle", "nom"],
];

/** Construit la table en-tête→champ pour une entité (writable + synonymes + inclusion). */
function buildResolver(entity: string): (header: string) => string | null {
  const def = ENTITIES[entity];
  const writable = new Set(def?.writable ?? []);
  // Index normalisé des champs inscriptibles (match exact prioritaire).
  const byNorm = new Map<string, string>();
  for (const f of writable) byNorm.set(norm(f), f);
  // Synonymes → champ, restreints aux champs réellement inscriptibles.
  const bySyn = new Map<string, string>();
  for (const [field, aliases] of Object.entries(SYNONYMS)) {
    if (!writable.has(field)) continue;
    for (const a of aliases) if (!bySyn.has(a)) bySyn.set(a, field);
  }
  return (header: string) => {
    const n = norm(header);
    if (!n) return null;
    const exact = byNorm.get(n) ?? bySyn.get(n);
    if (exact) return exact;
    for (const [needle, field] of CONTAINS) {
      if (!writable.has(field) || !n.includes(needle)) continue;
      if (field === "nom" && n.includes("prenom")) continue; // « prénom » ≠ nom
      return field;
    }
    return null;
  };
}

function coerce(field: string, raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "") return null;
    if (NUMERIC_HINT.test(field)) {
      const n = parseFloat(s.replace(/\s/g, "").replace(/[^0-9.,-]/g, "").replace(",", "."));
      return isFinite(n) ? n : null;
    }
    return s;
  }
  return raw;
}

export type MappedImport = { rows: Record<string, unknown>[]; fields: string[]; skipped: number };

/** Mappe des lignes brutes {en-tête: valeur} vers les champs de l'entité cible. */
export function mapImportedRows(entity: string, rawRows: unknown, maxRows = 2000): MappedImport {
  if (!ENTITIES[entity]) return { rows: [], fields: [], skipped: 0 };
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const resolve = buildResolver(entity);
  const usedFields = new Set<string>();
  const out: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const r of rows) {
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      skipped++;
      continue;
    }
    const mapped: Record<string, unknown> = {};
    for (const [header, val] of Object.entries(r as Record<string, unknown>)) {
      const field = resolve(header);
      if (!field || field in mapped) continue;
      const cv = coerce(field, val);
      if (cv == null) continue;
      mapped[field] = cv;
      usedFields.add(field);
    }
    // Une ligne n'est retenue que si elle a au moins un champ « identifiant »
    // (nom/designation/reference) ou 2 champs mappés — sinon c'est du bruit.
    const keys = Object.keys(mapped);
    const hasName = keys.some((k) => ["nom", "designation", "reference", "titre", "prenom"].includes(k));
    if (keys.length && (hasName || keys.length >= 2)) {
      out.push(mapped);
      if (out.length >= maxRows) break;
    } else {
      skipped++;
    }
  }
  return { rows: out, fields: [...usedFields], skipped };
}
