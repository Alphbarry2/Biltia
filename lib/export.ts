// ─────────────────────────────────────────────────────────────────────────────
// EXPORT CSV / EXCEL — mise en forme des entités partagées vers un tableur.
//
// Miroir de l'import (cf. data-entities.ts + workspace/ImportModal). Le patron
// exporte ses données en un clic pour les envoyer à sa fiduciaire, sans double
// saisie. Fichier .xlsx (une feuille par entité) ou .csv universel (séparateur
// « ; » + BOM UTF-8, pour qu'Excel FR/BE l'ouvre proprement).
//
// Ce module ne fait QUE de la mise en forme : la lecture (auth, tenant, RLS)
// reste côté route serveur. Aucune donnée n'est lue ici.
// ─────────────────────────────────────────────────────────────────────────────

import { ENTITIES, entityLabel, fieldLabel } from "./data-entities";
import { pick, type Locale } from "./i18n/config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type XLSX = typeof import("xlsx");

// Résolution des clés étrangères : id → nom lisible.
// Le comptable voit « Chantier Liège », pas un UUID.
export type Lookups = Record<string, Map<string, string>>;

// Champ (clé étrangère) → entité référencée dont on affichera le nom.
export const FK_TO_ENTITY: Record<string, string> = {
  client_id: "clients",
  chef_chantier_id: "employees",
  employee_id: "employees",
  assignee_id: "employees",
  chantier_id: "chantiers",
  equipment_id: "equipment",
};

// Colonnes servant à composer le nom lisible d'une entité référencée.
export const NAME_COLS: Record<string, string[]> = {
  clients: ["nom"],
  chantiers: ["nom"],
  equipment: ["nom"],
  employees: ["prenom", "nom"],
};

// Libellés FR des colonnes (superset de tous les champs writable + created_at).
const LABELS: Record<string, string> = {
  nom: "Nom",
  prenom: "Prénom",
  // Clés étrangères : résolues en nom lisible (cf. FK_TO_ENTITY), donc pas de « ID ».
  client_id: "Client",
  chef_chantier_id: "Chef de chantier",
  employee_id: "Employé",
  chantier_id: "Chantier",
  equipment_id: "Équipement",
  assignee_id: "Assigné",
  adresse: "Adresse",
  ville: "Ville",
  code_postal: "Code postal",
  description: "Description",
  budget: "Budget (€)",
  budget_engage: "Budget engagé (€)",
  avancement: "Avancement (%)",
  statut: "Statut",
  status: "Statut",
  date_debut: "Date de début",
  date_fin_prevue: "Fin prévue",
  date_fin_reelle: "Fin réelle",
  siret: "SIRET",
  type: "Type",
  email: "Email",
  tel: "Téléphone",
  notes: "Notes",
  role: "Rôle",
  corps_metier: "Corps de métier",
  date_embauche: "Date d'embauche",
  taux_horaire: "Taux horaire (€)",
  url: "Lien",
  expires_at: "Expire le",
  reference: "Référence",
  categorie: "Catégorie",
  quantite: "Quantité",
  unite: "Unité",
  date_retour: "Retour prévu",
  marque: "Marque",
  numero_serie: "N° de série",
  date_achat: "Date d'achat",
  prochain_controle: "Prochain contrôle",
  duree_heures: "Durée (h)",
  rapport: "Rapport",
  date_prevue: "Prévue le",
  date_reelle: "Réalisée le",
  title: "Titre",
  priority: "Priorité",
  due_date: "Échéance",
  done_at: "Terminée le",
  created_at: "Créé le",
};

// En-tête de colonne du fichier exporté. La source FR (LABELS) est traduite via
// fieldLabel() (data-entities), qui indexe par la CHAÎNE FR → EN.
const labelFor = (key: string, locale: Locale = "fr"): string => {
  const fr = LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
  return fieldLabel(fr, locale);
};

// Colonnes exportées, dans l'ordre : champs métier (writable) + date de création.
function exportColumns(entity: string): string[] {
  return [...ENTITIES[entity].writable, "created_at"];
}

const isDateKey = (key: string): boolean =>
  /(^date_)|(_at$)|expires|controle|echeance/.test(key) || key === "due_date";

// Formatage d'une cellule : dates en JJ/MM/AAAA, nombres bruts (Excel calcule),
// booléens en Oui/Non, null → vide.
function formatCell(key: string, value: unknown, locale: Locale = "fr"): string | number {
  if (value === null || value === undefined) return "";
  if (isDateKey(key)) {
    const d = new Date(value as string);
    if (!isNaN(d.getTime())) {
      const p = (n: number) => String(n).padStart(2, "0");
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
    return String(value);
  }
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? pick(locale, "Oui", "Yes") : pick(locale, "Non", "No");
  return String(value);
}

// Cellule finale : résout les clés étrangères en nom lisible si possible,
// sinon délègue au formatage standard. Un id orphelin retombe sur sa valeur brute.
function resolveCell(key: string, value: unknown, lookups: Lookups, locale: Locale = "fr"): string | number {
  const refEntity = FK_TO_ENTITY[key];
  if (refEntity && value !== null && value !== undefined && value !== "") {
    const name = lookups[refEntity]?.get(String(value));
    return name ?? String(value);
  }
  return formatCell(key, value, locale);
}

// Nom de feuille Excel valide : pas de [ ] : * ? / \, max 31 caractères.
export function sheetName(entity: string, locale: Locale = "fr"): string {
  const raw = entityLabel(entity, locale);
  return raw.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
}

// Construit une feuille de calcul pour une entité (avec en-tête même si vide,
// ce qui produit un modèle réimportable).
export function buildSheet(xlsx: XLSX, entity: string, rows: Row[], lookups: Lookups = {}, locale: Locale = "fr") {
  const cols = exportColumns(entity);
  const headers = cols.map((k) => labelFor(k, locale));

  if (!rows.length) {
    const ws = xlsx.utils.aoa_to_sheet([headers]);
    ws["!cols"] = headers.map((h) => ({ wch: Math.min(40, Math.max(12, h.length + 2)) }));
    return ws;
  }

  const data = rows.map((row) => {
    const o: Record<string, string | number> = {};
    cols.forEach((key, i) => {
      o[headers[i]] = resolveCell(key, row[key], lookups, locale);
    });
    return o;
  });

  const ws = xlsx.utils.json_to_sheet(data, { header: headers });
  ws["!cols"] = headers.map((h) => ({ wch: Math.min(40, Math.max(12, h.length + 2)) }));
  return ws;
}

// Nom de fichier : biltia-<entité>-AAAA-MM-JJ.<ext>
export function exportFilename(entity: string, ext: string, date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  const base = entity === "all" ? "workspace" : entity;
  return `biltia-${base}-${stamp}.${ext}`;
}
