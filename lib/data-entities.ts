// ─────────────────────────────────────────────────────────────────────────────
// REGISTRE DES ENTITÉS PARTAGÉES (Étape 2 — socle de données)
//
// Source unique de vérité pour :
//   1. la whitelist de /api/data (quelles tables un module peut lire/écrire),
//   2. les colonnes inscriptibles (le serveur ignore tout le reste),
//   3. la description injectée dans le prompt de génération (DATA MODE).
//
// Toutes ces tables sont isolées par tenant_id et protégées par RLS.
// Le serveur force tenant_id ; le client ne peut jamais le falsifier.
// ─────────────────────────────────────────────────────────────────────────────

export type EntityDef = {
  /** Table Postgres (= clé du registre, mais explicite pour lisibilité). */
  table: string;
  /** Libellé humain (FR). */
  label: string;
  /** Colonnes que le module peut écrire. Le reste (id, tenant_id, *_at) est ignoré. */
  writable: string[];
  /** Description courte des champs pour le prompt IA. */
  fields: string;
};

export const ENTITIES: Record<string, EntityDef> = {
  chantiers: {
    table: "chantiers",
    label: "Chantiers",
    writable: [
      "nom", "client_id", "adresse", "ville", "code_postal", "description",
      "budget", "budget_engage", "avancement", "statut",
      "date_debut", "date_fin_prevue", "date_fin_reelle", "chef_chantier_id",
    ],
    fields:
      "nom (texte, requis), client_id (uuid → clients), adresse, ville, code_postal, " +
      "description, budget (nombre), budget_engage (nombre), avancement (entier 0-100), " +
      "statut (un de: en_attente|en_cours|en_retard|termine|annule), " +
      "date_debut/date_fin_prevue/date_fin_reelle (AAAA-MM-JJ), chef_chantier_id (uuid → employees)",
  },
  clients: {
    table: "clients",
    label: "Clients",
    writable: ["nom", "siret", "type", "email", "tel", "adresse", "ville", "code_postal", "notes"],
    fields:
      "nom (texte, requis), siret, type (particulier|entreprise|collectivite), " +
      "email, tel, adresse, ville, code_postal, notes",
  },
  employees: {
    table: "employees",
    label: "Employés",
    writable: ["nom", "prenom", "role", "corps_metier", "email", "tel", "date_embauche", "taux_horaire", "statut", "notes"],
    fields:
      "nom (texte, requis), prenom, role, corps_metier, email, tel, " +
      "date_embauche (AAAA-MM-JJ), taux_horaire (nombre), statut (actif|inactif|arret), notes",
  },
  documents: {
    table: "documents",
    label: "Documents",
    writable: ["nom", "type", "chantier_id", "employee_id", "client_id", "url", "expires_at", "statut", "notes"],
    fields:
      "nom (requis), type (requis: kbis|urssaf|rc_pro|qualibat|devis|facture|...), " +
      "chantier_id/employee_id/client_id (uuid, rattachement optionnel), url, " +
      "expires_at (AAAA-MM-JJ, alerte J-30), statut (valide|expire|manquant|en_attente), notes",
  },
  materials: {
    table: "materials",
    label: "Matériaux / Matériel",
    writable: [
      "nom", "reference", "categorie", "quantite", "unite", "statut", "chantier_id",
      "date_retour", "prix_achat_ht", "prix_vente_ht", "fournisseur_id", "seuil_alerte", "notes",
    ],
    fields:
      "nom (requis), reference, categorie, quantite (nombre), unite (u|m²|m³|ml|kg|h), " +
      "statut (disponible|affecte|maintenance|hors_service), chantier_id (uuid → chantiers), " +
      "prix_achat_ht (nombre), prix_vente_ht (nombre), fournisseur_id (uuid → suppliers), " +
      "seuil_alerte (nombre, alerte stock bas), date_retour, notes",
  },
  suppliers: {
    table: "suppliers",
    label: "Fournisseurs / Sous-traitants",
    writable: [
      "nom", "siret", "type", "categorie", "specialite", "email", "tel",
      "adresse", "ville", "code_postal", "assurance_decennale", "assurance_expire", "notes",
    ],
    fields:
      "nom (requis), categorie (fournisseur|sous_traitant), siret, type, " +
      "specialite (corps de métier, surtout pour un sous-traitant), email, tel, " +
      "adresse, ville, code_postal, assurance_decennale (n°/assureur), " +
      "assurance_expire (AAAA-MM-JJ, alerte J-30 pour un sous-traitant), notes",
  },
  equipment: {
    table: "equipment",
    label: "Équipement",
    writable: ["nom", "reference", "type", "marque", "numero_serie", "statut", "chantier_id", "date_achat", "prochain_controle", "notes"],
    fields:
      "nom (requis), reference, type, marque, numero_serie, " +
      "statut (disponible|...), chantier_id (uuid), date_achat, prochain_controle (AAAA-MM-JJ), notes",
  },
  interventions: {
    table: "interventions",
    label: "Interventions",
    writable: ["type", "description", "statut", "chantier_id", "client_id", "employee_id", "equipment_id", "date_prevue", "date_reelle", "duree_heures", "rapport"],
    fields:
      "type (requis), description, statut (planifie|en_cours|termine|annule), " +
      "chantier_id/client_id/employee_id/equipment_id (uuid), " +
      "date_prevue/date_reelle (horodatage), duree_heures (nombre), rapport",
  },
  tasks: {
    table: "tasks",
    label: "Tâches",
    writable: ["title", "description", "status", "priority", "chantier_id", "assignee_id", "due_date", "done_at"],
    fields:
      "title (requis), description, status (todo|doing|done), priority (low|normal|high), " +
      "chantier_id (uuid), assignee_id (uuid → employees), due_date (AAAA-MM-JJ), done_at",
  },

  // ── COUCHE ARGENT (le cœur commercial) ─────────────────────────────────────
  catalogue: {
    table: "catalogue",
    label: "Catalogue de prix",
    writable: ["designation", "type", "reference", "unite", "prix_achat_ht", "prix_vente_ht", "taux_tva", "corps_metier", "notes"],
    fields:
      "designation (requis), type (fourniture|main_oeuvre|ouvrage), reference, " +
      "unite (u|m²|m³|ml|kg|h|forfait), prix_achat_ht (nombre), prix_vente_ht (nombre), " +
      "taux_tva (nombre: 20|10|5.5), corps_metier (macon|electricien|plombier|chauffagiste|…), notes",
  },
  devis: {
    table: "devis",
    label: "Devis",
    writable: ["numero", "client_id", "chantier_id", "statut", "date_devis", "date_validite", "montant_ht", "montant_tva", "montant_ttc", "conditions", "notes"],
    fields:
      "numero (texte, unique par entreprise), client_id (uuid → clients), chantier_id (uuid → chantiers), " +
      "statut (brouillon|envoye|accepte|refuse|expire), date_devis, date_validite (AAAA-MM-JJ), " +
      "montant_ht/montant_tva/montant_ttc (nombres), conditions (conditions de paiement), notes. " +
      "Le détail chiffré va dans l'entité `lignes` (une ligne par prestation).",
  },
  factures: {
    table: "factures",
    label: "Factures",
    writable: ["numero", "client_id", "chantier_id", "devis_id", "type", "statut", "date_facture", "date_echeance", "montant_ht", "montant_tva", "montant_ttc", "montant_paye", "notes"],
    fields:
      "numero (texte, unique par entreprise, numérotation légale sans trou), client_id (uuid → clients), " +
      "chantier_id (uuid → chantiers), devis_id (uuid → devis, optionnel), " +
      "type (facture|acompte|situation|avoir), statut (brouillon|envoyee|payee|partiellement_payee|en_retard|annulee), " +
      "date_facture, date_echeance (AAAA-MM-JJ), montant_ht/montant_tva/montant_ttc/montant_paye (nombres), notes. " +
      "Le détail chiffré va dans l'entité `lignes`.",
  },
  lignes: {
    table: "lignes",
    label: "Lignes de devis / facture",
    writable: ["devis_id", "facture_id", "catalogue_id", "designation", "quantite", "unite", "prix_unitaire_ht", "taux_tva", "total_ht", "position"],
    fields:
      "UNE ligne appartient soit à un devis (devis_id) soit à une facture (facture_id) — l'un des deux OBLIGATOIRE. " +
      "catalogue_id (uuid → catalogue, optionnel), designation (requis), quantite (nombre), unite, " +
      "prix_unitaire_ht (nombre), taux_tva (nombre: 20|10|5.5, par ligne), total_ht (nombre = quantite × prix_unitaire_ht), position (entier, ordre d'affichage)",
  },

  // ── MAIN D'ŒUVRE & RÉCURRENT (coûts réels + mémoire SAV) ───────────────────
  pointages: {
    table: "pointages",
    label: "Pointage (heures)",
    writable: ["employee_id", "chantier_id", "intervention_id", "date_pointage", "heures", "type", "valide", "notes"],
    fields:
      "employee_id (uuid → employees, requis en pratique), chantier_id (uuid → chantiers), " +
      "intervention_id (uuid → interventions), date_pointage (AAAA-MM-JJ, requis), heures (nombre, requis), " +
      "type (normal|heure_sup|trajet|absence), valide (booléen), notes",
  },
  contrats: {
    table: "contrats",
    label: "Contrats d'entretien",
    writable: ["client_id", "parc_id", "reference", "type", "montant", "periodicite", "date_debut", "date_fin", "prochaine_echeance", "statut", "notes"],
    fields:
      "client_id (uuid → clients), parc_id (uuid → parc_installe, l'équipement couvert), reference, " +
      "type (entretien|maintenance|garantie), montant (nombre), " +
      "periodicite (mensuel|trimestriel|semestriel|annuel), date_debut, date_fin, " +
      "prochaine_echeance (AAAA-MM-JJ, prochaine visite/facturation), statut (actif|suspendu|expire|resilie), notes",
  },
  parc_installe: {
    table: "parc_installe",
    label: "Parc installé (chez le client)",
    writable: ["client_id", "chantier_id", "type", "marque", "modele", "numero_serie", "localisation", "date_pose", "date_garantie", "dernier_entretien", "prochain_entretien", "notes"],
    fields:
      "Équipement POSÉ chez le client (≠ equipment qui est l'outillage de l'entreprise). " +
      "client_id (uuid → clients), chantier_id (uuid → chantiers), " +
      "type (chaudiere|climatisation|pompe_chaleur|chauffe_eau|tableau_electrique|vmc|autre), " +
      "marque, modele, numero_serie, localisation (chez le client), date_pose, date_garantie, " +
      "dernier_entretien, prochain_entretien (AAAA-MM-JJ, alerte échéance), notes",
  },
};

export const ALLOWED_ENTITIES = Object.keys(ENTITIES);

// ─── FORMULAIRES D'AJOUT MANUEL (Workspace « + Ajouter ») ─────────────────────
// Les champs PERTINENTS par entité, curés à la main : ce qu'un artisan doit
// renseigner pour une fiche utile (pas un dump de toutes les colonnes).
// Client-safe (pure data) — consommé par la modal d'ajout du Workspace.

export type FormField = {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "date" | "number" | "select" | "textarea" | "relation" | "checkbox";
  required?: boolean;
  /** Valeurs pour type=select. */
  options?: string[];
  /** Entité liée pour type=relation (le champ stocke son uuid). */
  relation?: string;
  placeholder?: string;
};

/** Colonnes qui composent le libellé d'une fiche liée (selects de relation). */
export const RELATION_DISPLAY: Record<string, string[]> = {
  clients: ["nom"],
  employees: ["prenom", "nom"],
  chantiers: ["nom"],
  suppliers: ["nom"],
  devis: ["numero"],
  factures: ["numero"],
  parc_installe: ["type", "marque"],
  interventions: ["type"],
  equipment: ["nom"],
  catalogue: ["designation"],
};

export const FORM_FIELDS: Record<string, FormField[]> = {
  clients: [
    { key: "nom", label: "Nom", type: "text", required: true, placeholder: "Jean Dupont / SCI Les Lilas" },
    { key: "type", label: "Type", type: "select", options: ["particulier", "entreprise", "collectivite"] },
    { key: "tel", label: "Téléphone", type: "tel", placeholder: "06 12 34 56 78" },
    { key: "email", label: "Email", type: "email", placeholder: "jean@exemple.fr" },
    { key: "adresse", label: "Adresse", type: "text" },
    { key: "ville", label: "Ville", type: "text" },
    { key: "code_postal", label: "Code postal", type: "text" },
    { key: "siret", label: "SIRET (si pro)", type: "text" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  employees: [
    { key: "nom", label: "Nom", type: "text", required: true },
    { key: "prenom", label: "Prénom", type: "text" },
    { key: "tel", label: "Téléphone", type: "tel", placeholder: "06 12 34 56 78" },
    { key: "email", label: "Email", type: "email" },
    { key: "role", label: "Rôle", type: "text", placeholder: "Chef d'équipe, compagnon…" },
    { key: "corps_metier", label: "Corps de métier", type: "text", placeholder: "Électricien, plombier…" },
    { key: "date_embauche", label: "Date d'embauche", type: "date" },
    { key: "taux_horaire", label: "Taux horaire (€)", type: "number" },
    { key: "statut", label: "Statut", type: "select", options: ["actif", "inactif", "arret"] },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  chantiers: [
    { key: "nom", label: "Nom du chantier", type: "text", required: true, placeholder: "Rénovation SdB Morel" },
    { key: "client_id", label: "Client", type: "relation", relation: "clients" },
    { key: "adresse", label: "Adresse", type: "text" },
    { key: "ville", label: "Ville", type: "text" },
    { key: "code_postal", label: "Code postal", type: "text" },
    { key: "statut", label: "Statut", type: "select", options: ["en_attente", "en_cours", "en_retard", "termine", "annule"] },
    { key: "budget", label: "Budget (€ HT)", type: "number" },
    { key: "avancement", label: "Avancement (%)", type: "number" },
    { key: "date_debut", label: "Début", type: "date" },
    { key: "date_fin_prevue", label: "Fin prévue", type: "date" },
    { key: "chef_chantier_id", label: "Chef de chantier", type: "relation", relation: "employees" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  documents: [
    { key: "nom", label: "Nom", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: ["kbis", "urssaf", "rc_pro", "qualibat", "devis", "facture", "autre"] },
    { key: "client_id", label: "Client", type: "relation", relation: "clients" },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "employee_id", label: "Employé", type: "relation", relation: "employees" },
    { key: "expires_at", label: "Expire le", type: "date" },
    { key: "statut", label: "Statut", type: "select", options: ["valide", "expire", "manquant", "en_attente"] },
    { key: "url", label: "Lien (URL)", type: "text" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  materials: [
    { key: "nom", label: "Nom", type: "text", required: true },
    { key: "reference", label: "Référence", type: "text" },
    { key: "categorie", label: "Catégorie", type: "text" },
    { key: "quantite", label: "Quantité", type: "number" },
    { key: "unite", label: "Unité", type: "select", options: ["u", "m²", "m³", "ml", "kg", "h"] },
    { key: "seuil_alerte", label: "Seuil d'alerte stock", type: "number" },
    { key: "prix_achat_ht", label: "Prix d'achat (€ HT)", type: "number" },
    { key: "prix_vente_ht", label: "Prix de vente (€ HT)", type: "number" },
    { key: "statut", label: "Statut", type: "select", options: ["disponible", "affecte", "maintenance", "hors_service"] },
    { key: "chantier_id", label: "Chantier affecté", type: "relation", relation: "chantiers" },
    { key: "fournisseur_id", label: "Fournisseur", type: "relation", relation: "suppliers" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  suppliers: [
    { key: "nom", label: "Nom", type: "text", required: true },
    { key: "categorie", label: "Catégorie", type: "select", options: ["fournisseur", "sous_traitant"] },
    { key: "specialite", label: "Spécialité", type: "text", placeholder: "Négoce, plâtrerie…" },
    { key: "tel", label: "Téléphone", type: "tel" },
    { key: "email", label: "Email", type: "email" },
    { key: "siret", label: "SIRET", type: "text" },
    { key: "ville", label: "Ville", type: "text" },
    { key: "assurance_decennale", label: "Assurance décennale (n°/assureur)", type: "text" },
    { key: "assurance_expire", label: "Assurance expire le", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  equipment: [
    { key: "nom", label: "Nom", type: "text", required: true, placeholder: "Mini-pelle, échafaudage…" },
    { key: "reference", label: "Référence", type: "text" },
    { key: "type", label: "Type", type: "text" },
    { key: "marque", label: "Marque", type: "text" },
    { key: "numero_serie", label: "N° de série", type: "text" },
    { key: "statut", label: "Statut", type: "select", options: ["disponible", "affecte", "maintenance", "hors_service"] },
    { key: "chantier_id", label: "Chantier affecté", type: "relation", relation: "chantiers" },
    { key: "date_achat", label: "Date d'achat", type: "date" },
    { key: "prochain_controle", label: "Prochain contrôle", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  interventions: [
    { key: "type", label: "Type", type: "text", required: true, placeholder: "Dépannage, entretien, SAV…" },
    { key: "client_id", label: "Client", type: "relation", relation: "clients" },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "employee_id", label: "Intervenant", type: "relation", relation: "employees" },
    { key: "statut", label: "Statut", type: "select", options: ["planifie", "en_cours", "termine", "annule"] },
    { key: "date_prevue", label: "Date prévue", type: "date" },
    { key: "duree_heures", label: "Durée (h)", type: "number" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  tasks: [
    { key: "title", label: "Titre", type: "text", required: true },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "assignee_id", label: "Assignée à", type: "relation", relation: "employees" },
    { key: "priority", label: "Priorité", type: "select", options: ["low", "normal", "high"] },
    { key: "status", label: "Statut", type: "select", options: ["todo", "doing", "done"] },
    { key: "due_date", label: "Échéance", type: "date" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  catalogue: [
    { key: "designation", label: "Désignation", type: "text", required: true, placeholder: "Pose prise 16A…" },
    { key: "type", label: "Type", type: "select", options: ["fourniture", "main_oeuvre", "ouvrage"] },
    { key: "reference", label: "Référence", type: "text" },
    { key: "unite", label: "Unité", type: "select", options: ["u", "m²", "m³", "ml", "kg", "h", "forfait"] },
    { key: "prix_achat_ht", label: "Prix d'achat (€ HT)", type: "number" },
    { key: "prix_vente_ht", label: "Prix de vente (€ HT)", type: "number" },
    { key: "taux_tva", label: "TVA (%)", type: "select", options: ["20", "10", "5.5"] },
    { key: "corps_metier", label: "Corps de métier", type: "text" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  devis: [
    { key: "numero", label: "Numéro", type: "text", required: true, placeholder: "D-2026-001" },
    { key: "client_id", label: "Client", type: "relation", relation: "clients", required: true },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "statut", label: "Statut", type: "select", options: ["brouillon", "envoye", "accepte", "refuse", "expire"] },
    { key: "date_devis", label: "Date du devis", type: "date" },
    { key: "date_validite", label: "Valide jusqu'au", type: "date" },
    { key: "montant_ht", label: "Montant HT (€)", type: "number" },
    { key: "montant_tva", label: "TVA (€)", type: "number" },
    { key: "montant_ttc", label: "Montant TTC (€)", type: "number" },
    { key: "conditions", label: "Conditions de paiement", type: "textarea" },
  ],
  factures: [
    { key: "numero", label: "Numéro", type: "text", required: true, placeholder: "F-2026-001" },
    { key: "client_id", label: "Client", type: "relation", relation: "clients", required: true },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "devis_id", label: "Devis d'origine", type: "relation", relation: "devis" },
    { key: "type", label: "Type", type: "select", options: ["facture", "acompte", "situation", "avoir"] },
    { key: "statut", label: "Statut", type: "select", options: ["brouillon", "envoyee", "payee", "partiellement_payee", "en_retard", "annulee"] },
    { key: "date_facture", label: "Date de facture", type: "date" },
    { key: "date_echeance", label: "Échéance", type: "date" },
    { key: "montant_ht", label: "Montant HT (€)", type: "number" },
    { key: "montant_tva", label: "TVA (€)", type: "number" },
    { key: "montant_ttc", label: "Montant TTC (€)", type: "number" },
    { key: "montant_paye", label: "Déjà payé (€)", type: "number" },
  ],
  lignes: [
    { key: "devis_id", label: "Devis", type: "relation", relation: "devis" },
    { key: "facture_id", label: "Facture", type: "relation", relation: "factures" },
    { key: "designation", label: "Désignation", type: "text", required: true },
    { key: "quantite", label: "Quantité", type: "number" },
    { key: "unite", label: "Unité", type: "text" },
    { key: "prix_unitaire_ht", label: "PU HT (€)", type: "number" },
    { key: "taux_tva", label: "TVA (%)", type: "select", options: ["20", "10", "5.5"] },
    { key: "total_ht", label: "Total HT (€)", type: "number" },
  ],
  pointages: [
    { key: "employee_id", label: "Employé", type: "relation", relation: "employees", required: true },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "date_pointage", label: "Date", type: "date", required: true },
    { key: "heures", label: "Heures", type: "number", required: true },
    { key: "type", label: "Type", type: "select", options: ["normal", "heure_sup", "trajet", "absence"] },
    { key: "valide", label: "Validé", type: "checkbox" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  contrats: [
    { key: "client_id", label: "Client", type: "relation", relation: "clients", required: true },
    { key: "reference", label: "Référence", type: "text" },
    { key: "type", label: "Type", type: "select", options: ["entretien", "maintenance", "garantie"] },
    { key: "parc_id", label: "Équipement couvert", type: "relation", relation: "parc_installe" },
    { key: "montant", label: "Montant (€)", type: "number" },
    { key: "periodicite", label: "Périodicité", type: "select", options: ["mensuel", "trimestriel", "semestriel", "annuel"] },
    { key: "date_debut", label: "Début", type: "date" },
    { key: "date_fin", label: "Fin", type: "date" },
    { key: "prochaine_echeance", label: "Prochaine échéance", type: "date" },
    { key: "statut", label: "Statut", type: "select", options: ["actif", "suspendu", "expire", "resilie"] },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  parc_installe: [
    { key: "client_id", label: "Client", type: "relation", relation: "clients", required: true },
    { key: "type", label: "Type d'équipement", type: "select", options: ["chaudiere", "climatisation", "pompe_chaleur", "chauffe_eau", "tableau_electrique", "vmc", "autre"] },
    { key: "marque", label: "Marque", type: "text" },
    { key: "modele", label: "Modèle", type: "text" },
    { key: "numero_serie", label: "N° de série", type: "text" },
    { key: "localisation", label: "Localisation chez le client", type: "text" },
    { key: "chantier_id", label: "Chantier d'origine", type: "relation", relation: "chantiers" },
    { key: "date_pose", label: "Date de pose", type: "date" },
    { key: "date_garantie", label: "Fin de garantie", type: "date" },
    { key: "prochain_entretien", label: "Prochain entretien", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

// ─── Détection : la demande porte-t-elle sur une entité connectée ? ──────────

const ENTITY_KEYWORDS: Record<string, string[]> = {
  chantiers: ["chantier", "chantiers", "projet", "projets", "suivi de chantier"],
  clients: ["client", "clients", "crm", "devis", "facture", "factures", "relance", "prospect"],
  employees: ["employé", "employe", "ouvrier", "salarié", "salarie", "équipe", "equipe", "main d'oeuvre", "personnel", "pointage", "heures", "compagnon", "chef de chantier"],
  documents: ["document", "attestation", "qualibat", "urssaf", "kbis", "décennale", "decennale", "conformité", "conformite"],
  materials: ["matériau", "materiau", "matériel", "materiel", "stock", "fourniture", "commande de materiaux", "beton", "béton"],
  suppliers: ["fournisseur", "sous-traitant", "sous traitant", "negoce", "négoce"],
  equipment: ["équipement", "equipement", "engin", "outillage", "machine", "location d'engin"],
  interventions: ["intervention", "sav", "dépannage", "depannage", "maintenance", "entretien"],
  tasks: ["tâche", "tache", "taches", "tâches", "todo", "planning", "a faire", "à faire", "qui fait quoi"],
  catalogue: ["catalogue", "bibliothèque de prix", "bibliotheque de prix", "bordereau", "prix unitaire", "tarif", "tarifs", "prestation", "prestations", "ouvrage", "ouvrages"],
  devis: ["devis", "estimation", "chiffrage", "chiffrer", "proposition commerciale"],
  factures: ["facture", "factures", "facturation", "facturer", "acompte", "acomptes", "situation de travaux", "avoir", "encaissement", "impayé", "impaye", "impayés", "règlement", "reglement", "trésorerie", "tresorerie"],
  pointages: ["pointage", "pointer", "heures", "temps passé", "temps passe", "feuille d'heures", "feuille de temps", "main d'oeuvre", "main d'œuvre"],
  contrats: ["contrat", "contrats", "contrat d'entretien", "abonnement", "récurrent", "recurrent", "échéance", "echeance", "renouvellement"],
  parc_installe: ["parc installé", "parc installe", "parc client", "équipement client", "equipement client", "chaudière", "chaudiere", "climatisation", "clim", "pompe à chaleur", "pompe a chaleur", "pac", "vmc", "chauffe-eau", "chauffe eau", "matériel posé", "materiel pose"],
};

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Renvoie les entités connectées pertinentes pour une demande.
 * Le pilote : si « chantier » est détecté, on connecte chantiers + clients + employees
 * (les relations naturelles d'un suivi de chantier).
 */
export function detectConnectedEntities(prompt: string, appType?: string | null): string[] {
  const text = normalize(`${prompt} ${appType ?? ""}`);
  const hits = new Set<string>();
  for (const [entity, kws] of Object.entries(ENTITY_KEYWORDS)) {
    if (kws.some((kw) => text.includes(normalize(kw)))) hits.add(entity);
  }
  // Relations naturelles : un module qui touche une entité embarque celles
  // qu'elle référence — le workspace reste la source unique, CONSTAMMENT.
  if (hits.has("chantiers")) {
    hits.add("clients");
    hits.add("employees");
  }
  if (hits.has("tasks")) {
    hits.add("chantiers");
    hits.add("employees");
  }
  if (hits.has("interventions")) {
    hits.add("clients");
    hits.add("chantiers");
    hits.add("employees");
  }
  if (hits.has("materials") || hits.has("equipment")) {
    hits.add("chantiers");
    hits.add("suppliers");
  }
  // Un devis embarque le client, le chantier, ses lignes et le catalogue de prix.
  if (hits.has("devis")) {
    hits.add("clients");
    hits.add("chantiers");
    hits.add("lignes");
    hits.add("catalogue");
  }
  // Une facture embarque le client, le chantier, le devis d'origine et ses lignes.
  if (hits.has("factures")) {
    hits.add("clients");
    hits.add("chantiers");
    hits.add("devis");
    hits.add("lignes");
  }
  // Le pointage relie un employé à un chantier (coût main d'œuvre).
  if (hits.has("pointages")) {
    hits.add("employees");
    hits.add("chantiers");
  }
  // Un contrat d'entretien porte sur un client et son parc installé.
  if (hits.has("contrats")) {
    hits.add("clients");
    hits.add("parc_installe");
  }
  // Le parc installé appartient à un client.
  if (hits.has("parc_installe")) {
    hits.add("clients");
  }
  return [...hits];
}

/**
 * Bloc injecté dans le system prompt quand la demande mappe des entités connectées.
 * Indique à l'IA d'utiliser window.biltia (async) au lieu de localStorage POUR CES
 * entités-là. Le reste de l'app garde localStorage.
 */
export function buildDataModeBlock(entityKeys: string[]): string {
  if (!entityKeys.length) return "";

  const list = entityKeys
    .map((k) => `- \`${k}\` — ${ENTITIES[k].label} : ${ENTITIES[k].fields}`)
    .join("\n");

  const primary = entityKeys[0];

  return `
# DONNÉES PARTAGÉES DU WORKSPACE (mode connecté — PRIORITAIRE)

Cette application fait partie d'un OS métier : ses données vivent dans la base du
workspace, partagées avec les autres modules. Pour les entités ci-dessous, tu DOIS
utiliser l'API globale \`window.biltia\` (asynchrone) — **PAS localStorage**.

## Entités connectées disponibles
${list}

## API \`window.biltia\` (déjà injectée, ne la redéfinis pas)
- \`await biltia.list('${primary}', { match, order, ascending, limit })\` → tableau de lignes
- \`await biltia.get('${primary}', id)\` → une ligne
- \`await biltia.create('${primary}', { ...champs })\` → ligne créée (avec son \`id\`)
- \`await biltia.update('${primary}', id, { ...champs })\` → ligne mise à jour
- \`await biltia.remove('${primary}', id)\` → suppression
- \`await biltia.extract(photoDataUrl, { fields:['numero','fournisseur','date'] })\` → **IA VISION** : lit une PHOTO (bon de livraison, facture, plan…) et renvoie un objet \`{numero, fournisseur, date, …}\` (chaîne vide si illisible). À enchaîner avec \`biltia.create(...)\` pour stocker. ~25 crédits/photo.
- \`await biltia.transcribe(audioDataUrl, { fields:['employe','heures','date'] })\` → **IA VOIX** : transcrit une DICTÉE et renvoie \`{ text, data:{employe, heures, date} }\` (sans \`fields\` → \`{ text }\` seul). Idéal pour pointer/noter à la voix, mains libres. ~10-25 crédits.
Chaque ligne possède un \`id\` (uuid) généré par le serveur. N'envoie jamais \`id\`,
\`tenant_id\` ni les dates \`*_at\` dans create/update : le serveur les gère.
Pour un champ optionnel laissé vide (uuid de liaison, date, nombre), envoie \`null\`
(ou omets la clé) — JAMAIS une chaîne vide \`""\`.

## Règles d'implémentation (obligatoires)
1. Au démarrage : fonction \`async function load(){ const rows = await biltia.list('${primary}', { order:'created_at', ascending:false }); render(rows); }\` appelée dans un \`try/catch\`.
2. Après create/update/remove : ré-appelle \`load()\` pour rafraîchir (pas de cache localStorage pour ces entités).
3. Affiche un état de chargement et un état d'erreur clair si l'API échoue
   (ex : « Connexion au workspace impossible »). NE BASCULE PAS sur localStorage pour ces entités.
4. NE PRÉ-REMPLIS PAS de fausses données pour ces entités : les vraies données viennent du workspace.
5. SUGGESTIONS PARTOUT (synchronisation constante) : chaque champ relationnel
   (\`client_id\`, \`chantier_id\`, \`chef_chantier_id\`, \`assignee_id\`, \`equipment_id\`…)
   est un \`<select>\` peuplé via \`biltia.list(...)\` (affiche \`nom\` / \`prenom nom\`,
   stocke \`id\`), RECHARGÉ à chaque ouverture de la modal — jamais de saisie libre
   d'un nom qui existe déjà dans le workspace.
6. OPTION « + Nouveau… » dans chaque \`<select>\` relationnel : si l'élément n'existe
   pas encore (nouveau client, nouvel employé…), l'utilisateur le crée SANS quitter
   le formulaire — mini-invite (prompt ou champ inline) → \`biltia.create(...)\` dans
   le workspace → le \`<select>\` se recharge et sélectionne le nouvel \`id\`. Tout ce
   qui est créé dans l'app EST créé dans le workspace, immédiatement.
7. Respecte STRICTEMENT les noms de champs et les valeurs d'enum listés ci-dessus.
   Champ optionnel laissé vide → \`null\`, jamais \`""\`.
8. PHOTO D'UN DOCUMENT (bon de livraison, facture, plan…) → EXTRACTION AUTOMATIQUE :
   quand l'utilisateur prend/importe la photo d'un document, appelle
   \`biltia.extract(photoDataUrl, { fields: [les champs de l'entité] })\`, PRÉ-REMPLIS le
   formulaire avec le résultat (l'utilisateur vérifie/corrige), puis \`biltia.create(...)\`.
   Ne fais JAMAIS retaper à la main ce qui est déjà lisible sur la photo. Affiche un état
   « Lecture du document… » pendant l'extraction.
9. DICTÉE (mains libres, sur le chantier) → enregistre l'audio (MediaRecorder → Blob →
   dataURL via FileReader), appelle \`biltia.transcribe(audioDataUrl, { fields:[…] })\`,
   pré-remplis le formulaire avec \`data\` (ou insère \`text\`), l'utilisateur valide → \`biltia.create(...)\`.

Pour toute donnée qui ne correspond PAS à une entité ci-dessus, continue d'utiliser
localStorage comme d'habitude.
`;
}
