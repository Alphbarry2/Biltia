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

import type { Locale } from "@/lib/i18n/config";
import { FIELD_VOCAB, VOCABS, vocabLabel, vocabValues } from "@/lib/vocabulaires";
import { tousLesTauxTva } from "@/lib/tva";

// Les taux de TVA proposés dans les formulaires : l'UNION France + Belgique. Le pays
// de l'entreprise n'est pas connu côté client ; les libellés portent donc le drapeau
// quand un taux est propre à un pays (« 21 % (BE) »). Le serveur, lui, connaît le pays
// et proposera le bon taux sur un devis (lib/tva.ts).
const TVA_OPTIONS = tousLesTauxTva().map((t) => String(t));

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
      "site_id", "demande_id",
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
    writable: ["nom", "siret", "type", "statut", "source", "email", "tel", "adresse", "ville", "code_postal", "notes"],
    fields:
      "nom (texte, requis), siret, type (particulier|entreprise|collectivite), " +
      "statut (prospect|actif|inactif|archive, défaut actif), " +
      "source (provenance : formulaire|bouche-à-oreille|recommandation|salon|…), " +
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
    writable: ["nom", "type", "chantier_id", "employee_id", "client_id", "supplier_id", "url", "expires_at", "statut", "notes"],
    fields:
      "nom (requis), type (requis: kbis|urssaf|rc_pro|qualibat|photo|devis|facture|...), " +
      "chantier_id/employee_id/client_id/supplier_id (uuid, rattachement optionnel ; supplier_id = attestation/pièce d'un sous-traitant), url, " +
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
    writable: ["type", "description", "statut", "chantier_id", "client_id", "employee_id", "supplier_id", "equipment_id", "site_id", "demande_id", "lot_id", "date_prevue", "date_reelle", "duree_heures", "rapport"],
    fields:
      "type (requis), description, statut (planifie|en_cours|termine|annule), " +
      "chantier_id/client_id/employee_id/equipment_id (uuid), supplier_id (uuid → suppliers, si réalisée par un sous-traitant), lot_id (uuid → lots, étape), " +
      "date_prevue/date_reelle (horodatage), duree_heures (nombre), rapport",
  },
  tasks: {
    table: "tasks",
    label: "Tâches",
    writable: ["title", "description", "status", "priority", "chantier_id", "assignee_id", "supplier_id", "lot_id", "due_date", "done_at"],
    fields:
      "title (requis), description, status (todo|doing|done), priority (low|normal|high), " +
      "chantier_id (uuid), assignee_id (uuid → employees), supplier_id (uuid → suppliers, si confiée à un sous-traitant), lot_id (uuid → lots, étape), due_date (AAAA-MM-JJ), done_at",
  },

  // ── COUCHE ARGENT (le cœur commercial) ─────────────────────────────────────
  catalogue: {
    table: "catalogue",
    label: "Catalogue de prix",
    writable: [
      "designation", "type", "reference", "unite", "prix_achat_ht", "prix_vente_ht", "taux_tva",
      "corps_metier", "notes", "aliases", "mots_cles", "marque", "modele", "actif",
      "prix_maj_le", "prix_source", "marge_cible_pct", "fournisseur_id", "minutes_pose",
      "cout_materiel_estime", "mode_tarif",
    ],
    fields:
      "LE TARIF DE L'ENTREPRISE — la source de vérité des prix (un prix ne s'invente jamais, il se lit ici). " +
      "designation (requis), type (fourniture|main_oeuvre|prestation|ouvrage|forfait), reference, " +
      "unite (u|m²|m³|ml|kg|t|l|h|j|forfait), prix_achat_ht (nombre), prix_vente_ht (nombre), " +
      "taux_tva (nombre : selon le pays — FR 20|10|5.5, BE 21|12|6), corps_metier, " +
      "aliases (tableau de textes : les autres façons de NOMMER l'article — « double prise », " +
      "« bloc 2 prises » — c'est ce qui permet de retrouver l'article dans une dictée), " +
      "mots_cles (tableau de textes), marque, modele, actif (booléen, un article retiré reste lié aux anciens devis), " +
      "prix_maj_le (date du dernier changement de PRIX — sert à avertir d'un tarif ancien), " +
      "prix_source (manuel|fournisseur|calcule|importe|historique), marge_cible_pct (nombre, % — permet de " +
      "calculer le prix de vente depuis le prix d'achat), fournisseur_id (uuid → suppliers), " +
      "minutes_pose (nombre, temps de pose estimé), cout_materiel_estime (nombre), " +
      "mode_tarif (ouvrages : prix_fixe|somme_composants|fixe_plus_variable), notes. " +
      "Un OUVRAGE se décompose dans l'entité `catalogue_composants`.",
  },
  catalogue_composants: {
    table: "catalogue_composants",
    label: "Composition des ouvrages",
    writable: ["ouvrage_id", "composant_id", "quantite", "formule_quantite", "perte_pct", "optionnel", "position"],
    fields:
      "DÉCOMPOSITION d'un ouvrage du catalogue (« pose d'un point lumineux » = douille + câble + 45 min de pose). " +
      "ouvrage_id (uuid → catalogue, l'ouvrage), composant_id (uuid → catalogue, la ressource consommée), " +
      "quantite (nombre), formule_quantite (texte, quantité variable selon le devis), " +
      "perte_pct (nombre, % de chute/perte), optionnel (booléen), position (entier, ordre).",
  },
  devis: {
    table: "devis",
    label: "Devis",
    writable: ["numero", "client_id", "chantier_id", "site_id", "demande_id", "statut", "date_devis", "date_validite", "montant_ht", "montant_tva", "montant_ttc", "acompte_pct", "conditions", "notes"],
    fields:
      "numero (texte, unique par entreprise), client_id (uuid → clients), chantier_id (uuid → chantiers), " +
      "statut (brouillon|envoye|accepte|refuse|expire), date_devis, date_validite (AAAA-MM-JJ), " +
      "montant_ht/montant_tva/montant_ttc (nombres), acompte_pct (nombre, % d'acompte demandé), " +
      "conditions (conditions de paiement), notes. " +
      "Le détail chiffré va dans l'entité `lignes` (une ligne par prestation).",
  },
  factures: {
    table: "factures",
    label: "Factures",
    writable: ["numero", "client_id", "chantier_id", "devis_id", "site_id", "type", "statut", "date_facture", "date_echeance", "montant_ht", "montant_tva", "montant_ttc", "montant_paye", "notes"],
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
    writable: [
      "devis_id", "facture_id", "catalogue_id", "designation", "quantite", "unite",
      "prix_unitaire_ht", "taux_tva", "total_ht", "position",
      "origine_prix", "confiance_match", "remise_pct", "ouvrage_id",
    ],
    fields:
      "UNE ligne appartient soit à un devis (devis_id) soit à une facture (facture_id) — l'un des deux OBLIGATOIRE. " +
      "catalogue_id (uuid → catalogue, l'article d'où vient le prix — À RENSEIGNER dès qu'il existe), " +
      "designation (requis), quantite (nombre), unite, prix_unitaire_ht (nombre), " +
      "taux_tva (nombre, par ligne : FR 20|10|5.5, BE 21|12|6), remise_pct (nombre, %), " +
      "total_ht (nombre = quantite × prix_unitaire_ht − remise), position (entier, ordre d'affichage), " +
      "origine_prix (D'OÙ VIENT LE PRIX : prix_dicte|catalogue|calcule_marge|suggestion_historique|a_saisir — " +
      "`a_saisir` signifie qu'AUCUN tarif fiable n'a été trouvé : le devis ne doit pas partir en l'état), " +
      "confiance_match (nombre 0→1, fiabilité de la correspondance avec l'article du catalogue), " +
      "ouvrage_id (uuid → catalogue, si la ligne est le détail d'un ouvrage éclaté)",
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
    writable: ["client_id", "parc_id", "site_id", "reference", "type", "montant", "periodicite", "date_debut", "date_fin", "prochaine_echeance", "statut", "notes"],
    fields:
      "client_id (uuid → clients), parc_id (uuid → parc_installe, l'équipement couvert), reference, " +
      "type (entretien|maintenance|garantie), montant (nombre), " +
      "periodicite (mensuel|trimestriel|semestriel|annuel), date_debut, date_fin, " +
      "prochaine_echeance (AAAA-MM-JJ, prochaine visite/facturation), statut (actif|suspendu|expire|resilie), notes",
  },
  parc_installe: {
    table: "parc_installe",
    label: "Parc installé (chez le client)",
    writable: ["client_id", "chantier_id", "site_id", "type", "marque", "modele", "numero_serie", "localisation", "date_pose", "date_garantie", "dernier_entretien", "prochain_entretien", "notes"],
    fields:
      "Équipement POSÉ chez le client (≠ equipment qui est l'outillage de l'entreprise). " +
      "client_id (uuid → clients), chantier_id (uuid → chantiers), site_id (uuid → sites), " +
      "type (chaudiere|climatisation|pompe_chaleur|chauffe_eau|tableau_electrique|vmc|autre), " +
      "marque, modele, numero_serie, localisation (chez le client), date_pose, date_garantie, " +
      "dernier_entretien, prochain_entretien (AAAA-MM-JJ, alerte échéance), notes",
  },

  // ── PHASE 1 — intake → argent → SAV (migration 037) ────────────────────────
  sites: {
    table: "sites",
    label: "Sites / Adresses",
    writable: ["client_id", "nom", "type", "adresse", "ville", "code_postal", "contact_nom", "contact_tel", "notes"],
    fields:
      "Adresse/site d'un client (un client peut en avoir plusieurs). " +
      "client_id (uuid → clients), nom (requis, ex: « Villa Morel », « Siège »), " +
      "type (facturation|chantier|intervention|siege|residence|immeuble|appartement|local), " +
      "adresse, ville, code_postal, contact_nom, contact_tel, notes",
  },
  demandes: {
    table: "demandes",
    label: "Demandes / Opportunités",
    writable: ["client_id", "site_id", "titre", "type", "canal", "statut", "priorite", "source", "description", "date_demande", "notes"],
    fields:
      "Demande entrante AVANT le devis (tous les prospects ne deviennent pas un devis). " +
      "client_id (uuid → clients), site_id (uuid → sites), titre (requis), " +
      "type (demande_prix|sav|appel|formulaire|whatsapp|email|prospect), " +
      "canal (telephone|email|whatsapp|formulaire|site|salon), " +
      "statut (nouveau|en_cours|converti|perdu), priorite (basse|normale|haute), " +
      "source, description, date_demande (AAAA-MM-JJ), notes. " +
      "Se convertit en devis/intervention/chantier (qui portent demande_id).",
  },
  commandes: {
    table: "commandes",
    label: "Commandes fournisseur",
    writable: ["fournisseur_id", "chantier_id", "numero", "statut", "montant_ht", "montant_ttc", "date_commande", "date_livraison_prevue", "date_livraison_reelle", "notes"],
    fields:
      "Commande / achat passé à un fournisseur. " +
      "fournisseur_id (uuid → suppliers), chantier_id (uuid → chantiers), numero, " +
      "statut (brouillon|envoyee|confirmee|livree|annulee), montant_ht/montant_ttc (nombres), " +
      "date_commande, date_livraison_prevue, date_livraison_reelle (AAAA-MM-JJ), notes",
  },
  depenses: {
    table: "depenses",
    label: "Dépenses / Factures fournisseur",
    writable: ["fournisseur_id", "chantier_id", "commande_id", "numero", "categorie", "montant_ht", "montant_tva", "montant_ttc", "date_depense", "date_echeance", "statut", "notes"],
    fields:
      "Dépense / facture FOURNISSEUR (≠ facture client) — impacte la marge chantier. " +
      "fournisseur_id (uuid → suppliers), chantier_id (uuid → chantiers), commande_id (uuid → commandes), " +
      "numero (n° facture fournisseur), categorie (materiaux|sous_traitance|location|carburant|frais|autre), " +
      "montant_ht/montant_tva/montant_ttc (nombres), date_depense, date_echeance (AAAA-MM-JJ), " +
      "statut (a_payer|payee|en_retard), notes",
  },
  paiements: {
    table: "paiements",
    label: "Paiements / Encaissements",
    writable: ["facture_id", "client_id", "chantier_id", "montant", "date_paiement", "methode", "reference", "statut", "notes"],
    fields:
      "Encaissement sur une facture client (gère les paiements partiels + la tréso). " +
      "facture_id (uuid → factures), client_id (uuid → clients), chantier_id (uuid → chantiers), " +
      "montant (nombre), date_paiement (AAAA-MM-JJ), methode (virement|cheque|especes|cb|prelevement), " +
      "reference (n° chèque / réf virement), statut (recu|en_attente|rejete), notes",
  },
  reserves: {
    table: "reserves",
    label: "Réserves / Incidents",
    writable: ["chantier_id", "client_id", "intervention_id", "assignee_id", "supplier_id", "lot_id", "titre", "type", "gravite", "statut", "description", "date_constat", "date_resolution", "notes"],
    fields:
      "Réserve / incident / malfaçon / litige sur un chantier. " +
      "chantier_id (uuid → chantiers), client_id (uuid → clients), intervention_id (uuid → interventions), lot_id (uuid → lots, étape), " +
      "assignee_id (uuid → employees), supplier_id (uuid → suppliers, sous-traitant responsable), titre (requis), " +
      "type (reserve|malfacon|incident|litige|point_bloquant), gravite (mineure|normale|majeure|bloquante), " +
      "statut (ouverte|en_cours|levee|annulee), description, date_constat, date_resolution (AAAA-MM-JJ), notes",
  },
  lots: {
    table: "lots",
    label: "Lots / Étapes",
    writable: ["chantier_id", "nom", "type", "ordre", "statut", "assignee_id", "supplier_id", "date_debut_prevue", "date_fin_prevue", "date_debut_reelle", "date_fin_reelle", "avancement", "notes"],
    fields:
      "Étape / lot d'un chantier (préparation, plomberie, peinture, réception…). " +
      "chantier_id (uuid → chantiers), nom (requis), type (preparation|demolition|gros_oeuvre|plomberie|electricite|platrerie|peinture|carrelage|menuiserie|finition|reception|sav|lot), " +
      "ordre (nombre), statut (a_faire|en_cours|termine|bloque|receptionne), assignee_id (uuid → employees), supplier_id (uuid → suppliers, sous-traitant du lot), " +
      "date_debut_prevue/date_fin_prevue/date_debut_reelle/date_fin_reelle (AAAA-MM-JJ), avancement (0..100), notes",
  },
  rappels: {
    table: "rappels",
    label: "Rappels / Échéances",
    writable: ["client_id", "chantier_id", "devis_id", "facture_id", "intervention_id", "contrat_id", "document_id", "assignee_id", "titre", "type", "statut", "due_date", "notes"],
    fields:
      "Rappel / échéance rattachable à n'importe quel objet. " +
      "client_id/chantier_id/devis_id/facture_id/intervention_id/contrat_id/document_id (uuid, rattachement), " +
      "assignee_id (uuid → employees), titre (requis), " +
      "type (rappel|relance|echeance|maintenance|rdv|expiration), statut (a_faire|fait|reporte|annule), " +
      "due_date (AAAA-MM-JJ), notes",
  },

  // ── PHASE 2 — traces humaines : communication / notes / validations (039) ──
  messages: {
    table: "messages",
    label: "Messages / Communication",
    writable: ["client_id", "chantier_id", "intervention_id", "devis_id", "facture_id", "demande_id", "reserve_id", "task_id", "supplier_id", "employee_id", "canal", "direction", "statut", "objet", "corps", "destinataire", "expediteur", "date_message"],
    fields:
      "Trace d'un échange (email/SMS/WhatsApp/appel) ou d'un message interne — l'historique de communication. " +
      "client_id/chantier_id/intervention_id/devis_id/facture_id/demande_id/reserve_id/task_id/supplier_id/employee_id (uuid, rattachement au hub concerné), " +
      "canal (email|sms|whatsapp|interne|note_appel|autre), direction (entrant|sortant|interne), " +
      "statut (brouillon|a_valider|envoye|recu|echec|archive — un message préparé par l'IA reste 'a_valider' jusqu'à accord humain), " +
      "objet, corps (le texte), destinataire (email/n°), expediteur, date_message (horodatage)",
  },
  notes: {
    table: "notes",
    label: "Notes",
    writable: ["client_id", "chantier_id", "intervention_id", "devis_id", "facture_id", "demande_id", "reserve_id", "task_id", "supplier_id", "lot_id", "auteur_id", "titre", "contenu", "source"],
    fields:
      "Note libre (terrain, vocale, client, interne) rattachable à n'importe quel objet — la mémoire du chantier. " +
      "client_id/chantier_id/intervention_id/devis_id/facture_id/demande_id/reserve_id/task_id/supplier_id/lot_id (uuid, rattachement), " +
      "auteur_id (uuid → employees), titre, contenu (requis, le texte de la note), source (manuel|vocal|ia|import|autre). " +
      "Une note se transforme ensuite en tâche/réserve/devis/rappel.",
  },
  validations: {
    table: "validations",
    label: "Validations / Signatures",
    writable: ["client_id", "chantier_id", "intervention_id", "devis_id", "facture_id", "document_id", "reserve_id", "demandeur_id", "type", "statut", "signataire_nom", "signataire_email", "signataire_tel", "date_signature", "motif_refus", "notes"],
    fields:
      "Demande de validation / signature (acceptation devis, signature PV/intervention, approbation document…). " +
      "devis_id/facture_id/document_id/intervention_id/reserve_id/chantier_id/client_id (uuid, l'objet à valider), demandeur_id (uuid → employees), " +
      "type (acceptation_devis|validation_facture|signature_pv|signature_intervention|approbation_document|validation_reserve|autre), " +
      "statut (en_attente|approuve|refuse|signe|expire|annule), " +
      "signataire_nom/signataire_email/signataire_tel, date_signature (horodatage), motif_refus, notes",
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
  /** `tags` = liste de mots (colonne text[]) : les alias d'un article, par exemple. */
  type: "text" | "email" | "tel" | "date" | "number" | "select" | "textarea" | "relation" | "checkbox" | "tags";
  required?: boolean;
  /** Valeurs pour type=select. Dérivées du RÉFÉRENTIEL quand `vocab` est présent. */
  options?: string[];
  /** Entité liée pour type=relation (le champ stocke son uuid). */
  relation?: string;
  placeholder?: string;
  /** Vocabulaire fermé qui gouverne ce champ (lib/vocabulaires). Posé automatiquement. */
  vocab?: string;
  /** Liste longue → le formulaire affiche une recherche, pas un <select> déroulant. */
  searchable?: boolean;
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
  catalogue_composants: ["composant_id"],
  sites: ["nom"],
  demandes: ["titre"],
  commandes: ["numero"],
  depenses: ["numero"],
  paiements: ["reference"],
  reserves: ["titre"],
  rappels: ["titre"],
  lots: ["nom"],
  messages: ["objet"],
  notes: ["titre"],
  validations: ["type"],
};

// Colonnes-libellé de repli quand l'entité n'est pas dans RELATION_DISPLAY.
const LABEL_FALLBACK_COLS = ["nom", "designation", "numero", "title", "type", "marque", "reference"];

/**
 * Libellé humain d'un enregistrement, quelle que soit son entité — source unique
 * partagée par l'API catalogue (/api/workspace/records) et la génération scopée.
 * Pur (client-safe) : ne dépend que de la ligne fournie.
 */
export function recordLabel(entity: string, row: Record<string, unknown>): string {
  const cols = RELATION_DISPLAY[entity];
  if (cols) {
    const composed = cols
      .map((c) => row[c])
      .filter((x) => x != null && String(x).trim() !== "")
      .join(" ")
      .trim();
    if (composed) return composed.slice(0, 80);
  }
  for (const c of LABEL_FALLBACK_COLS) {
    const v = row[c];
    if (v != null && String(v).trim() !== "") return String(v).trim().slice(0, 80);
  }
  return "(sans nom)";
}

const FORM_FIELDS_BASE: Record<string, FormField[]> = {
  clients: [
    { key: "nom", label: "Nom", type: "text", required: true, placeholder: "Jean Dupont / SCI Les Lilas" },
    { key: "type", label: "Type", type: "select", options: ["particulier", "entreprise", "collectivite"] },
    { key: "statut", label: "Statut", type: "select", options: ["prospect", "actif", "inactif", "archive"] },
    { key: "source", label: "Source", type: "text", placeholder: "Formulaire, bouche-à-oreille, recommandation…" },
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
    { key: "site_id", label: "Site / Adresse", type: "relation", relation: "sites" },
    { key: "demande_id", label: "Demande d'origine", type: "relation", relation: "demandes" },
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
    { key: "equipment_id", label: "Équipement", type: "relation", relation: "equipment" },
    { key: "site_id", label: "Site / Adresse", type: "relation", relation: "sites" },
    { key: "demande_id", label: "Demande d'origine", type: "relation", relation: "demandes" },
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
    { key: "type", label: "Type", type: "select" },
    // LE champ qui fait marcher le devis vocal : les autres façons de nommer l'article.
    // Sans lui, « mets-moi 6 doubles prises » ne retrouve jamais « Prise double encastrée ».
    { key: "aliases", label: "Autres appellations", type: "tags", placeholder: "double prise, bloc 2 prises…" },
    { key: "reference", label: "Référence", type: "text" },
    { key: "marque", label: "Marque", type: "text" },
    { key: "unite", label: "Unité", type: "select" },
    { key: "prix_achat_ht", label: "Prix d'achat (€ HT)", type: "number" },
    { key: "prix_vente_ht", label: "Prix de vente (€ HT)", type: "number" },
    { key: "marge_cible_pct", label: "Marge cible (%)", type: "number" },
    { key: "taux_tva", label: "TVA (%)", type: "select", options: TVA_OPTIONS, vocab: "taux_tva" },
    { key: "corps_metier", label: "Corps de métier", type: "text" },
    { key: "fournisseur_id", label: "Fournisseur", type: "relation", relation: "suppliers" },
    { key: "minutes_pose", label: "Temps de pose (min)", type: "number" },
    { key: "mode_tarif", label: "Tarif de l'ouvrage", type: "select" },
    { key: "actif", label: "Actif", type: "checkbox" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  catalogue_composants: [
    { key: "ouvrage_id", label: "Ouvrage", type: "relation", relation: "catalogue", required: true },
    { key: "composant_id", label: "Ressource consommée", type: "relation", relation: "catalogue", required: true },
    { key: "quantite", label: "Quantité", type: "number" },
    { key: "perte_pct", label: "Perte / chute (%)", type: "number" },
    { key: "optionnel", label: "Optionnel", type: "checkbox" },
    { key: "position", label: "Ordre", type: "number" },
  ],
  devis: [
    { key: "numero", label: "Numéro", type: "text", required: true, placeholder: "D-2026-001" },
    { key: "client_id", label: "Client", type: "relation", relation: "clients", required: true },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "site_id", label: "Site / Adresse", type: "relation", relation: "sites" },
    { key: "demande_id", label: "Demande d'origine", type: "relation", relation: "demandes" },
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
    { key: "site_id", label: "Site / Adresse", type: "relation", relation: "sites" },
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
    { key: "catalogue_id", label: "Article du catalogue", type: "relation", relation: "catalogue" },
    { key: "designation", label: "Désignation", type: "text", required: true },
    { key: "quantite", label: "Quantité", type: "number" },
    { key: "unite", label: "Unité", type: "select" },
    { key: "prix_unitaire_ht", label: "PU HT (€)", type: "number" },
    { key: "remise_pct", label: "Remise (%)", type: "number" },
    { key: "taux_tva", label: "TVA (%)", type: "select", options: TVA_OPTIONS, vocab: "taux_tva" },
    { key: "total_ht", label: "Total HT (€)", type: "number" },
    { key: "origine_prix", label: "Origine du prix", type: "select" },
  ],
  pointages: [
    { key: "employee_id", label: "Employé", type: "relation", relation: "employees", required: true },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "intervention_id", label: "Intervention", type: "relation", relation: "interventions" },
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
    { key: "site_id", label: "Site / Adresse", type: "relation", relation: "sites" },
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
    { key: "site_id", label: "Site / Adresse", type: "relation", relation: "sites" },
    { key: "date_pose", label: "Date de pose", type: "date" },
    { key: "date_garantie", label: "Fin de garantie", type: "date" },
    { key: "prochain_entretien", label: "Prochain entretien", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  sites: [
    { key: "nom", label: "Nom du site", type: "text", required: true, placeholder: "Villa Morel / Siège / Lot 3" },
    { key: "client_id", label: "Client", type: "relation", relation: "clients" },
    { key: "type", label: "Type", type: "select", options: ["facturation", "chantier", "intervention", "siege", "residence", "immeuble", "appartement", "local"] },
    { key: "adresse", label: "Adresse", type: "text" },
    { key: "ville", label: "Ville", type: "text" },
    { key: "code_postal", label: "Code postal", type: "text" },
    { key: "contact_nom", label: "Contact sur place", type: "text" },
    { key: "contact_tel", label: "Téléphone contact", type: "tel" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  demandes: [
    { key: "titre", label: "Objet de la demande", type: "text", required: true, placeholder: "Devis rénovation SdB / SAV chaudière" },
    { key: "client_id", label: "Client / Prospect", type: "relation", relation: "clients" },
    { key: "site_id", label: "Site / Adresse", type: "relation", relation: "sites" },
    { key: "type", label: "Type", type: "select", options: ["demande_prix", "sav", "appel", "formulaire", "whatsapp", "email", "prospect"] },
    { key: "canal", label: "Canal", type: "select", options: ["telephone", "email", "whatsapp", "formulaire", "site", "salon"] },
    { key: "statut", label: "Statut", type: "select", options: ["nouveau", "en_cours", "converti", "perdu"] },
    { key: "priorite", label: "Priorité", type: "select", options: ["basse", "normale", "haute"] },
    { key: "source", label: "Source", type: "text", placeholder: "Bouche-à-oreille, recommandation…" },
    { key: "date_demande", label: "Reçue le", type: "date" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  commandes: [
    { key: "numero", label: "Numéro", type: "text", placeholder: "CMD-2026-001" },
    { key: "fournisseur_id", label: "Fournisseur", type: "relation", relation: "suppliers" },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "statut", label: "Statut", type: "select", options: ["brouillon", "envoyee", "confirmee", "livree", "annulee"] },
    { key: "montant_ht", label: "Montant HT (€)", type: "number" },
    { key: "montant_ttc", label: "Montant TTC (€)", type: "number" },
    { key: "date_commande", label: "Date de commande", type: "date" },
    { key: "date_livraison_prevue", label: "Livraison prévue", type: "date" },
    { key: "date_livraison_reelle", label: "Livraison réelle", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  depenses: [
    { key: "numero", label: "N° facture fournisseur", type: "text" },
    { key: "fournisseur_id", label: "Fournisseur", type: "relation", relation: "suppliers" },
    { key: "chantier_id", label: "Chantier imputé", type: "relation", relation: "chantiers" },
    { key: "commande_id", label: "Commande liée", type: "relation", relation: "commandes" },
    { key: "categorie", label: "Catégorie", type: "select", options: ["materiaux", "sous_traitance", "location", "carburant", "frais", "autre"] },
    { key: "montant_ht", label: "Montant HT (€)", type: "number" },
    { key: "montant_tva", label: "TVA (€)", type: "number" },
    { key: "montant_ttc", label: "Montant TTC (€)", type: "number" },
    { key: "date_depense", label: "Date", type: "date" },
    { key: "date_echeance", label: "Échéance", type: "date" },
    { key: "statut", label: "Statut", type: "select", options: ["a_payer", "payee", "en_retard"] },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  paiements: [
    { key: "facture_id", label: "Facture réglée", type: "relation", relation: "factures", required: true },
    { key: "client_id", label: "Client", type: "relation", relation: "clients" },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "montant", label: "Montant (€)", type: "number", required: true },
    { key: "date_paiement", label: "Date d'encaissement", type: "date" },
    { key: "methode", label: "Méthode", type: "select", options: ["virement", "cheque", "especes", "cb", "prelevement"] },
    { key: "reference", label: "Référence (n° chèque, virement…)", type: "text" },
    { key: "statut", label: "Statut", type: "select", options: ["recu", "en_attente", "rejete"] },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  reserves: [
    { key: "titre", label: "Objet de la réserve", type: "text", required: true, placeholder: "Fissure plafond salon" },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "client_id", label: "Client", type: "relation", relation: "clients" },
    { key: "intervention_id", label: "Intervention", type: "relation", relation: "interventions" },
    { key: "assignee_id", label: "Assignée à", type: "relation", relation: "employees" },
    { key: "supplier_id", label: "Sous-traitant concerné", type: "relation", relation: "suppliers" },
    { key: "type", label: "Type", type: "select", options: ["reserve", "malfacon", "incident", "litige", "point_bloquant"] },
    { key: "gravite", label: "Gravité", type: "select", options: ["mineure", "normale", "majeure", "bloquante"] },
    { key: "statut", label: "Statut", type: "select", options: ["ouverte", "en_cours", "levee", "annulee"] },
    { key: "date_constat", label: "Constatée le", type: "date" },
    { key: "date_resolution", label: "Résolue le", type: "date" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  rappels: [
    { key: "titre", label: "Intitulé", type: "text", required: true, placeholder: "Relancer devis / Rappeler client" },
    { key: "type", label: "Type", type: "select", options: ["rappel", "relance", "echeance", "maintenance", "rdv", "expiration"] },
    { key: "due_date", label: "Échéance", type: "date" },
    { key: "statut", label: "Statut", type: "select", options: ["a_faire", "fait", "reporte", "annule"] },
    { key: "assignee_id", label: "Assigné à", type: "relation", relation: "employees" },
    { key: "client_id", label: "Client", type: "relation", relation: "clients" },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "devis_id", label: "Devis", type: "relation", relation: "devis" },
    { key: "facture_id", label: "Facture", type: "relation", relation: "factures" },
    { key: "intervention_id", label: "Intervention", type: "relation", relation: "interventions" },
    { key: "contrat_id", label: "Contrat", type: "relation", relation: "contrats" },
    { key: "document_id", label: "Document", type: "relation", relation: "documents" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  lots: [
    { key: "nom", label: "Nom de l'étape", type: "text", required: true, placeholder: "Plomberie / Peinture / Réception" },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "type", label: "Type", type: "select", options: ["preparation", "demolition", "gros_oeuvre", "plomberie", "electricite", "platrerie", "peinture", "carrelage", "menuiserie", "finition", "reception", "sav", "lot"] },
    { key: "statut", label: "Statut", type: "select", options: ["a_faire", "en_cours", "termine", "bloque", "receptionne"] },
    { key: "ordre", label: "Ordre", type: "number" },
    { key: "avancement", label: "Avancement (%)", type: "number" },
    { key: "assignee_id", label: "Responsable", type: "relation", relation: "employees" },
    { key: "supplier_id", label: "Sous-traitant", type: "relation", relation: "suppliers" },
    { key: "date_debut_prevue", label: "Début prévu", type: "date" },
    { key: "date_fin_prevue", label: "Fin prévue", type: "date" },
    { key: "date_debut_reelle", label: "Début réel", type: "date" },
    { key: "date_fin_reelle", label: "Fin réelle", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  messages: [
    { key: "objet", label: "Objet", type: "text", placeholder: "Relance devis / Confirmation RDV" },
    { key: "canal", label: "Canal", type: "select", options: ["email", "sms", "whatsapp", "interne", "note_appel", "autre"] },
    { key: "direction", label: "Sens", type: "select", options: ["sortant", "entrant", "interne"] },
    { key: "statut", label: "Statut", type: "select", options: ["brouillon", "a_valider", "envoye", "recu", "echec", "archive"] },
    { key: "destinataire", label: "Destinataire (email / n°)", type: "text" },
    { key: "corps", label: "Message", type: "textarea" },
    { key: "client_id", label: "Client", type: "relation", relation: "clients" },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "intervention_id", label: "Intervention", type: "relation", relation: "interventions" },
    { key: "devis_id", label: "Devis", type: "relation", relation: "devis" },
    { key: "facture_id", label: "Facture", type: "relation", relation: "factures" },
    { key: "demande_id", label: "Demande", type: "relation", relation: "demandes" },
    { key: "supplier_id", label: "Fournisseur / Sous-traitant", type: "relation", relation: "suppliers" },
    { key: "date_message", label: "Date", type: "date" },
  ],
  notes: [
    { key: "titre", label: "Titre", type: "text", placeholder: "Observation chantier" },
    { key: "contenu", label: "Note", type: "textarea", required: true },
    { key: "source", label: "Source", type: "select", options: ["manuel", "vocal", "ia", "import", "autre"] },
    { key: "auteur_id", label: "Auteur", type: "relation", relation: "employees" },
    { key: "client_id", label: "Client", type: "relation", relation: "clients" },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "intervention_id", label: "Intervention", type: "relation", relation: "interventions" },
    { key: "demande_id", label: "Demande", type: "relation", relation: "demandes" },
    { key: "reserve_id", label: "Réserve", type: "relation", relation: "reserves" },
    { key: "task_id", label: "Tâche", type: "relation", relation: "tasks" },
    { key: "devis_id", label: "Devis", type: "relation", relation: "devis" },
    { key: "supplier_id", label: "Fournisseur / Sous-traitant", type: "relation", relation: "suppliers" },
  ],
  validations: [
    { key: "type", label: "Type", type: "select", required: true, options: ["acceptation_devis", "validation_facture", "signature_pv", "signature_intervention", "approbation_document", "validation_reserve", "autre"] },
    { key: "statut", label: "Statut", type: "select", options: ["en_attente", "approuve", "refuse", "signe", "expire", "annule"] },
    { key: "signataire_nom", label: "Signataire", type: "text" },
    { key: "signataire_email", label: "Email signataire", type: "email" },
    { key: "signataire_tel", label: "Téléphone signataire", type: "tel" },
    { key: "devis_id", label: "Devis", type: "relation", relation: "devis" },
    { key: "facture_id", label: "Facture", type: "relation", relation: "factures" },
    { key: "document_id", label: "Document", type: "relation", relation: "documents" },
    { key: "intervention_id", label: "Intervention", type: "relation", relation: "interventions" },
    { key: "reserve_id", label: "Réserve", type: "relation", relation: "reserves" },
    { key: "chantier_id", label: "Chantier", type: "relation", relation: "chantiers" },
    { key: "client_id", label: "Client", type: "relation", relation: "clients" },
    { key: "demandeur_id", label: "Demandé par", type: "relation", relation: "employees" },
    { key: "date_signature", label: "Signé le", type: "date" },
    { key: "motif_refus", label: "Motif du refus", type: "textarea" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

/**
 * LES LISTES DU FORMULAIRE SONT DÉRIVÉES DU RÉFÉRENTIEL — jamais recopiées.
 *
 * Tout champ déclaré dans FIELD_VOCAB devient une liste fermée, avec EXACTEMENT
 * les valeurs que le serveur accepte. C'est structurel : le formulaire ne PEUT
 * plus proposer une valeur que /api/data refuserait, ni laisser en texte libre un
 * champ sur lequel un agent filtre (« mes chefs d'équipe » → `role = chef_equipe`).
 * Ajouter une valeur au métier = l'ajouter dans lib/vocabulaires, un seul endroit.
 */
export const FORM_FIELDS: Record<string, FormField[]> = Object.fromEntries(
  Object.entries(FORM_FIELDS_BASE).map(([entity, fields]) => [
    entity,
    fields.map((f): FormField => {
      const vocabId = FIELD_VOCAB[`${entity}.${f.key}`];
      if (!vocabId || f.type === "relation") return f;
      const vocab = VOCABS[vocabId];
      if (!vocab) return f;
      return {
        ...f,
        type: "select",
        options: vocabValues(vocabId),
        vocab: vocabId,
        searchable: vocab.searchable,
        // Le placeholder d'un champ libre (« Chef d'équipe, compagnon… ») n'a plus
        // de sens sur une liste : il invitait précisément à la saisie libre.
        placeholder: undefined,
      };
    }),
  ])
);

// ─── i18n des FORMULAIRES (labels / placeholders / options) ──────────────────
// FORM_FIELDS reste la SOURCE FR (partagée SDK/agents/apps, inchangée). Pour
// l'affichage en anglais, on traduit UNIQUEMENT le texte VISIBLE, jamais les
// `key`, `relation`, ni les VALEURS d'options (ce sont des enums stockés en base
// : les traduire casserait les données, les filtres et les agents). Les maps
// sont indexées par la CHAÎNE FR (label / placeholder / valeur) → EN, avec repli
// sur la VF quand l'entrée manque. Helpers `fieldLabel/fieldPlaceholder/optionLabel`.

const FIELD_LABEL_EN: Record<string, string> = {
  "Nom": "Name", "Type": "Type", "Statut": "Status", "Source": "Source",
  "Téléphone": "Phone", "Email": "Email", "Adresse": "Address", "Ville": "City",
  "Code postal": "Postal code", "SIRET (si pro)": "Company ID (if applicable)", "Notes": "Notes",
  "Prénom": "First name", "Rôle": "Role", "Corps de métier": "Trade",
  "Date d'embauche": "Hire date", "Taux horaire (€)": "Hourly rate (€)",
  "Nom du chantier": "Project name", "Client": "Client", "Site / Adresse": "Site / Address",
  "Demande d'origine": "Source request", "Budget (€ HT)": "Budget (excl. tax €)",
  "Avancement (%)": "Progress (%)", "Début": "Start", "Fin prévue": "Planned end",
  "Chef de chantier": "Site manager", "Description": "Description", "Chantier": "Project",
  "Employé": "Employee", "Expire le": "Expires on", "Lien (URL)": "Link (URL)",
  "Référence": "Reference", "Catégorie": "Category", "Quantité": "Quantity", "Unité": "Unit",
  "Seuil d'alerte stock": "Low-stock threshold", "Prix d'achat (€ HT)": "Purchase price (excl. tax €)",
  "Prix de vente (€ HT)": "Sale price (excl. tax €)", "Chantier affecté": "Assigned project",
  "Fournisseur": "Supplier", "Spécialité": "Specialty", "SIRET": "Company ID",
  "Assurance décennale (n°/assureur)": "Liability insurance (no./insurer)",
  "Assurance expire le": "Insurance expires on", "Marque": "Brand", "N° de série": "Serial number",
  "Date d'achat": "Purchase date", "Prochain contrôle": "Next inspection", "Intervenant": "Assignee",
  "Équipement": "Equipment", "Date prévue": "Planned date", "Durée (h)": "Duration (h)",
  "Titre": "Title", "Assignée à": "Assigned to", "Priorité": "Priority", "Échéance": "Due date",
  "Désignation": "Description", "TVA (%)": "VAT (%)", "Numéro": "Number", "Date du devis": "Quote date",
  "Valide jusqu'au": "Valid until", "Montant HT (€)": "Amount excl. tax (€)", "TVA (€)": "VAT (€)",
  "Montant TTC (€)": "Amount incl. tax (€)", "Conditions de paiement": "Payment terms",
  "Devis d'origine": "Source quote", "Date de facture": "Invoice date", "Déjà payé (€)": "Already paid (€)",
  "Devis": "Quote", "Facture": "Invoice", "Article du catalogue": "Catalog item",
  "PU HT (€)": "Unit price excl. tax (€)", "Total HT (€)": "Total excl. tax (€)", "Intervention": "Job",
  "Date": "Date", "Heures": "Hours", "Validé": "Approved", "Équipement couvert": "Covered equipment",
  "Montant (€)": "Amount (€)", "Périodicité": "Frequency", "Fin": "End",
  "Prochaine échéance": "Next due date", "Type d'équipement": "Equipment type", "Modèle": "Model",
  "Localisation chez le client": "Location at client site", "Chantier d'origine": "Source project",
  "Date de pose": "Installation date", "Fin de garantie": "Warranty end", "Prochain entretien": "Next service",
  "Nom du site": "Site name", "Contact sur place": "On-site contact", "Téléphone contact": "Contact phone",
  "Objet de la demande": "Request subject", "Client / Prospect": "Client / Prospect", "Canal": "Channel",
  "Reçue le": "Received on", "Date de commande": "Order date", "Livraison prévue": "Expected delivery",
  "Livraison réelle": "Actual delivery", "N° facture fournisseur": "Supplier invoice no.",
  "Chantier imputé": "Charged to project", "Commande liée": "Linked order", "Facture réglée": "Invoice paid",
  "Date d'encaissement": "Payment date", "Méthode": "Method",
  "Référence (n° chèque, virement…)": "Reference (cheque no., transfer…)",
  "Objet de la réserve": "Snag subject", "Sous-traitant concerné": "Subcontractor involved",
  "Gravité": "Severity", "Constatée le": "Noted on", "Résolue le": "Resolved on", "Intitulé": "Title",
  "Assigné à": "Assigned to", "Contrat": "Contract", "Document": "Document",
  "Nom de l'étape": "Phase name", "Ordre": "Order", "Responsable": "Owner", "Sous-traitant": "Subcontractor",
  "Début prévu": "Planned start", "Début réel": "Actual start", "Fin réelle": "Actual end",
  "Objet": "Subject", "Sens": "Direction", "Destinataire (email / n°)": "Recipient (email / no.)",
  "Message": "Message", "Demande": "Request", "Fournisseur / Sous-traitant": "Supplier / Subcontractor",
  "Note": "Note", "Auteur": "Author", "Réserve": "Snag", "Tâche": "Task", "Signataire": "Signatory",
  "Email signataire": "Signatory email", "Téléphone signataire": "Signatory phone",
  "Demandé par": "Requested by", "Signé le": "Signed on", "Motif du refus": "Rejection reason",
};

const FIELD_PLACEHOLDER_EN: Record<string, string> = {
  "Jean Dupont / SCI Les Lilas": "John Smith / Acme Ltd",
  "Formulaire, bouche-à-oreille, recommandation…": "Web form, word of mouth, referral…",
  "06 12 34 56 78": "07700 900000",
  "jean@exemple.fr": "john@example.com",
  "Chef d'équipe, compagnon…": "Team lead, tradesperson…",
  "Électricien, plombier…": "Electrician, plumber…",
  "Rénovation SdB Morel": "Morel bathroom refurb",
  "Négoce, plâtrerie…": "Merchant, plastering…",
  "Mini-pelle, échafaudage…": "Mini-digger, scaffolding…",
  "Dépannage, entretien, SAV…": "Repair, maintenance, after-sales…",
  "Pose prise 16A…": "Install 16A socket…",
  "Villa Morel / Siège / Lot 3": "Morel villa / HQ / Unit 3",
  "Devis rénovation SdB / SAV chaudière": "Bathroom refurb quote / boiler after-sales",
  "Bouche-à-oreille, recommandation…": "Word of mouth, referral…",
  "Fissure plafond salon": "Living-room ceiling crack",
  "Relancer devis / Rappeler client": "Chase quote / Call client back",
  "Plomberie / Peinture / Réception": "Plumbing / Painting / Handover",
  "Relance devis / Confirmation RDV": "Quote follow-up / Appointment confirmation",
  "Observation chantier": "Site observation",
};

// Affichage EN des VALEURS d'options (la valeur stockée ne change JAMAIS).
const OPTION_LABEL_EN: Record<string, string> = {
  a_faire: "to do", a_payer: "to pay", a_valider: "to approve", absence: "absence",
  acceptation_devis: "quote acceptance", accepte: "accepted", acompte: "deposit", actif: "active",
  affecte: "assigned", annuel: "yearly", annule: "cancelled", annulee: "cancelled",
  appartement: "apartment", appel: "call", approbation_document: "document approval",
  approuve: "approved", archive: "archived", arret: "stopped", autre: "other", avoir: "credit note",
  basse: "low", bloquante: "blocking", bloque: "blocked", brouillon: "draft", carburant: "fuel",
  carrelage: "tiling", cb: "card", chantier: "project", chaudiere: "boiler", chauffe_eau: "water heater",
  cheque: "cheque", climatisation: "air conditioning", collectivite: "public body", confirmee: "confirmed",
  converti: "converted", demande_prix: "price request", demolition: "demolition", devis: "quote",
  disponible: "available", doing: "doing", done: "done", echeance: "due date", echec: "failed",
  electricite: "electrical", email: "email", en_attente: "pending", en_cours: "in progress",
  en_retard: "overdue", entrant: "incoming", entreprise: "company", entretien: "maintenance",
  envoye: "sent", envoyee: "sent", especes: "cash", expiration: "expiry", expire: "expired",
  facturation: "billing", facture: "invoice", fait: "done", finition: "finishing", forfait: "flat rate",
  formulaire: "form", fournisseur: "supplier", fourniture: "supply", frais: "expense", garantie: "warranty",
  gros_oeuvre: "structural work", haute: "high", heure_sup: "overtime", high: "high",
  hors_service: "out of service", ia: "AI", immeuble: "building", import: "import", inactif: "inactive",
  incident: "incident", interne: "internal", intervention: "job", kbis: "registration extract",
  levee: "lifted", litige: "dispute", livree: "delivered", local: "premises", location: "rental",
  lot: "phase", low: "low", main_oeuvre: "labor", maintenance: "maintenance", majeure: "major",
  malfacon: "defect", manquant: "missing", manuel: "manual", materiaux: "materials", mensuel: "monthly",
  menuiserie: "joinery", mineure: "minor", normal: "normal", normale: "normal", note_appel: "call note",
  nouveau: "new", ouverte: "open", ouvrage: "structure", particulier: "individual",
  partiellement_payee: "partially paid", payee: "paid", peinture: "painting", perdu: "lost",
  planifie: "scheduled", platrerie: "plastering", plomberie: "plumbing", point_bloquant: "blocker",
  pompe_chaleur: "heat pump", prelevement: "direct debit", preparation: "preparation", prospect: "prospect",
  qualibat: "Qualibat", rappel: "reminder", rc_pro: "professional liability", rdv: "appointment",
  reception: "handover", receptionne: "received", recu: "received", refuse: "declined", rejete: "rejected",
  relance: "follow-up", reserve: "snag", residence: "residence", resilie: "terminated", salon: "living room",
  sav: "after-sales", semestriel: "half-yearly", siege: "HQ", signature_intervention: "job sign-off",
  signature_pv: "handover sign-off", signe: "signed", site: "site", situation: "progress claim",
  sms: "SMS", sortant: "outgoing", sous_traitance: "subcontracting", sous_traitant: "subcontractor",
  suspendu: "on hold", tableau_electrique: "electrical panel", telephone: "phone", termine: "completed",
  todo: "to do", trajet: "travel", trimestriel: "quarterly", u: "unit", urssaf: "URSSAF",
  validation_facture: "invoice approval", validation_reserve: "snag approval", valide: "valid",
  virement: "bank transfer", vmc: "ventilation (VMC)", vocal: "voice", whatsapp: "WhatsApp",
};

/** Label d'un champ de formulaire, traduit si l'interface est en anglais. */
export function fieldLabel(label: string, locale: Locale): string {
  return locale === "en" ? (FIELD_LABEL_EN[label] ?? label) : label;
}

/** Placeholder d'un champ, traduit si EN (repli sur la VF si non listé). */
export function fieldPlaceholder(placeholder: string | undefined, locale: Locale): string | undefined {
  if (!placeholder) return placeholder;
  return locale === "en" ? (FIELD_PLACEHOLDER_EN[placeholder] ?? placeholder) : placeholder;
}

/** Affichage d'une VALEUR d'option (la valeur stockée est inchangée). Le RÉFÉRENTIEL
 *  fait foi quand le champ en a un (« chef_equipe » → « Chef d'équipe ») ; sinon on
 *  retombe sur le texte lisible + la traduction EN historique. */
export function optionLabel(value: string, locale: Locale, vocabId?: string): string {
  if (vocabId && VOCABS[vocabId]) return vocabLabel(vocabId, value, locale);
  if (locale === "en" && OPTION_LABEL_EN[value]) return OPTION_LABEL_EN[value];
  return value.replace(/_/g, " ");
}

// Nom EN d'une ENTITÉ (le picker workspace, le sélecteur de portée…). Doit
// rester ALIGNÉ avec ENTITY_LABEL_EN de app/(app)/workspace/page.tsx.
const ENTITY_LABEL_EN: Record<string, string> = {
  chantiers: "Job sites", clients: "Clients", employees: "Employees", documents: "Documents",
  interventions: "Jobs", materials: "Materials", equipment: "Equipment", suppliers: "Suppliers",
  tasks: "Tasks", catalogue: "Catalog", catalogue_composants: "Work package items",
  devis: "Quotes", factures: "Invoices", pointages: "Time tracking",
  contrats: "Contracts", parc_installe: "Installed base", sites: "Sites / Addresses", demandes: "Requests",
  commandes: "Orders", depenses: "Expenses", paiements: "Payments", reserves: "Snags", rappels: "Reminders",
  messages: "Messages", notes: "Notes", validations: "Validations",
};

/** Nom d'une entité (registre ENTITIES), traduit si l'interface est en anglais. */
export function entityLabel(key: string, locale: Locale): string {
  if (locale === "en") return ENTITY_LABEL_EN[key] ?? ENTITIES[key]?.label ?? key;
  return ENTITIES[key]?.label ?? key;
}

// ─── Détection : la demande porte-t-elle sur une entité connectée ? ──────────

const ENTITY_KEYWORDS: Record<string, string[]> = {
  chantiers: ["chantier", "chantiers", "projet", "projets", "suivi de chantier", "affaire", "affaires", "carnet de commandes", "réalisation", "realisation", "opération de travaux", "operation de travaux"],
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
  sites: ["site", "sites", "adresse", "adresses", "lieu", "chantier adresse", "site d'intervention", "résidence", "residence", "immeuble", "appartement", "local commercial", "point de livraison"],
  demandes: ["demande", "demandes", "opportunité", "opportunite", "opportunités", "lead", "leads", "prospect", "demande de prix", "demande de devis", "appel entrant", "formulaire", "pipe", "pipeline"],
  commandes: ["commande", "commandes", "bon de commande", "achat", "achats", "commande fournisseur", "approvisionnement", "appro"],
  depenses: ["dépense", "depense", "dépenses", "depenses", "facture fournisseur", "factures fournisseur", "charge", "charges", "coût", "cout", "sortie d'argent", "note de frais"],
  paiements: ["paiement", "paiements", "encaissement", "encaissements", "règlement", "reglement", "acompte reçu", "versement", "reçu", "recu", "solde", "virement reçu"],
  reserves: ["réserve", "reserve", "réserves", "reserves", "incident", "incidents", "malfaçon", "malfacon", "litige", "litiges", "problème chantier", "probleme chantier", "point bloquant", "pv de réception", "levée de réserves"],
  rappels: ["rappel", "rappels", "échéance", "echeance", "échéances", "echeances", "relance", "relances", "à relancer", "a relancer", "reminder", "alerte", "ne pas oublier", "suivi à faire"],
  lots: ["lot", "lots", "étape", "etape", "étapes", "etapes", "phase", "phases", "tranche", "corps d'état", "corps d'etat", "poste", "sous-lot", "sous lot"],
  messages: ["message", "messages", "communication", "communications", "échange", "echange", "historique client", "email envoyé", "sms envoyé", "whatsapp", "relance envoyée", "note d'appel", "conversation", "correspondance"],
  notes: ["note", "notes", "observation", "observations", "remarque", "remarques", "compte rendu", "compte-rendu", "mémo", "memo", "note de terrain", "note vocale", "annotation", "commentaire"],
  validations: ["validation", "validations", "signature", "signatures", "signer", "à signer", "a signer", "signé", "signe", "acceptation", "approbation", "approuver", "bon pour accord", "pv de réception signé", "devis signé", "faire valider"],
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
  // Un message / une note / une validation vivent sur le hub Client/Chantier.
  if (hits.has("messages") || hits.has("notes")) {
    hits.add("clients");
    hits.add("chantiers");
  }
  // Une validation porte le plus souvent sur un devis/une facture, chez un client.
  if (hits.has("validations")) {
    hits.add("clients");
    hits.add("devis");
    hits.add("factures");
  }
  return [...hits];
}

// Aides de liaison pour les concepts dont la formulation varie (paraphrases qui
// échappent aux mots-clés) → le générateur rattache quand même à l'entité canonique.
const ENTITY_ALIASES: Record<string, string> = {
  clients: "clients, prospects, CRM, « mes clients »",
  chantiers: "chantiers, projets, affaires, « carnet de commandes », réalisations, opérations",
  employees: "équipe, salariés, ouvriers, compagnons, personnel, « mon équipe »",
  devis: "devis, estimations, chiffrages, propositions commerciales",
  factures: "factures, facturation, impayés, encaissements, relances, « qui me doit de l'argent »",
  interventions: "interventions, SAV, dépannages, entretien, maintenance",
  materials: "matériaux, matériel, stock, fournitures",
  suppliers: "fournisseurs, sous-traitants, négoces",
  equipment: "équipements, engins, outillage, machines",
  tasks: "tâches, todo, planning, « qui fait quoi »",
  catalogue: "catalogue de prix, bordereau, tarifs, prestations, ouvrages",
  documents: "documents, attestations, Qualibat, URSSAF, décennale",
  pointages: "pointages, feuille d'heures, temps passé, main d'œuvre",
  contrats: "contrats d'entretien, abonnements, échéances récurrentes",
  parc_installe: "parc installé, équipement client posé (chaudière, PAC, VMC…)",
  lignes: "lignes de devis/facture (désignation, quantité, prix)",
  messages: "messages, communications, échanges, historique client, emails/SMS/WhatsApp envoyés",
  notes: "notes, observations, comptes rendus, mémos, notes de terrain/vocales",
  validations: "validations, signatures, acceptations, approbations, « bon pour accord »",
};

/**
 * CATALOGUE DE LIAISON — injecté à CHAQUE génération d'app de données, que la
 * détection par mots-clés ait matché ou non. Garantit la SOURCE UNIQUE : toute
 * app qui gère un concept canonique l'écrit sous le NOM EXACT de l'entité (table
 * workspace partagée), jamais dans une collection à elle → synchro structurelle,
 * pas un job de synchro. Sans ce bloc, une formulation inattendue (« mes affaires »)
 * ratait la liaison et l'app se retrouvait isolée du reste.
 */
export function buildEntityBindingCatalog(): string {
  const catalog = ALLOWED_ENTITIES.map(
    (k) => `- \`${k}\` — ${ENTITIES[k].label}${ENTITY_ALIASES[k] ? ` (${ENTITY_ALIASES[k]})` : ""}`
  ).join("\n");

  return `# SOURCE UNIQUE DE VÉRITÉ — LE WORKSPACE (règle de synchronisation, ABSOLUE)
Ton application n'est PAS une base isolée : c'est une FENÊTRE sur le workspace
partagé de l'entreprise. Le workspace est l'application de fond ; ton app lit et
écrit DEDANS. Conséquence : ajouter, modifier ou supprimer dans ton app = faire la
même chose dans le workspace, INSTANTANÉMENT — et les autres apps (et le copilote,
et les agents) voient aussitôt le même état. Ce n'est pas une copie qu'on synchronise,
c'est LA donnée.

## Concepts canoniques (utilise le NOM EXACT à gauche, via window.biltia)
Si une notion gérée par ton app correspond — même de loin — à l'un de ces concepts,
tu DOIS la stocker via \`window.biltia\` sous ce nom d'entité. JAMAIS dans une collection
à toi pour ces notions-là (sinon la donnée serait invisible au reste de l'entreprise).
${catalog}

## Règles de liaison (obligatoires)
1. Rattache TOUJOURS à l'entité canonique la plus proche : « suivi de mes affaires » → \`chantiers\` ; « mon équipe » → \`employees\` ; « ce qu'on me doit » → \`factures\` ; « mes clients » → \`clients\`.
2. Relations = vrais liens : un chantier référence son client (\`client_id\`), et ce chantier apparaît alors chez CE client partout, à l'instant. Les champs \`*_id\` NE se construisent PAS à la main : déclare-les \`{ key:'client_id', label:'Client', type:'relation', relation:'clients' }\` dans les \`fields\` de \`biltiaUI.form\` — le select est peuplé depuis le workspace, rechargé et validé automatiquement.
3. Pas besoin d'avoir importé quoi que ce soit au départ : ce que l'utilisateur saisit dans l'app CRÉE la donnée dans le workspace (première fiche incluse).
4. SEULS les concepts SANS aucune entité ci-dessus vont dans une collection \`window.biltia\` libre (nom court en snake_case). En cas de doute : rattache, n'invente pas.`;
}

/**
 * Bloc injecté dans le system prompt quand la demande mappe des entités connectées.
 * Indique à l'IA d'utiliser window.biltia (async) POUR CES entités-là (leurs noms
 * exacts → tables workspace partagées) avec leurs SCHÉMAS DE CHAMPS détaillés. Le
 * reste passe AUSSI par window.biltia (collections libres, cloud) — JAMAIS localStorage.
 */
/**
 * VALEURS AUTORISÉES — bloc généré depuis le référentiel (lib/vocabulaires).
 *
 * Une app générée écrit dans les MÊMES colonnes que le formulaire du workspace et
 * que les agents. Si elle invente « En cours » là où le référentiel dit `en_cours`,
 * le veilleur qui filtre sur `en_cours` rate la fiche en silence. Le serveur rattrape
 * les écarts connus et refuse les inconnus — mais autant que le modèle écrive juste
 * du premier coup : on lui donne la liste exacte, jamais une paraphrase.
 */
function buildVocabBlock(entityKeys: string[]): string {
  const lines: string[] = [];
  for (const entity of entityKeys) {
    const champs = Object.entries(FIELD_VOCAB)
      .filter(([key]) => key.startsWith(`${entity}.`))
      .map(([key, vocabId]) => {
        const field = key.slice(entity.length + 1);
        const vocab = VOCABS[vocabId];
        if (!vocab) return null;
        const vals = vocab.options.map((o) => o.value).join(" | ");
        return `  - \`${field}\` : ${vals}`;
      })
      .filter(Boolean);
    if (champs.length) lines.push(`- \`${entity}\`\n${champs.join("\n")}`);
  }
  if (!lines.length) return "";

  return `
## VALEURS AUTORISÉES (listes fermées — le serveur REFUSE tout le reste)
Ces champs ne sont PAS du texte libre. Écris la valeur EXACTE de la liste (minuscules,
underscores), jamais un libellé d'affichage : \`en_cours\` et non « En cours », \`chef_equipe\`
et non « Chef d'équipe ». Dans l'interface, affiche un \`<select>\` avec ces valeurs — jamais
un \`<input type="text">\`. Une saisie libre ici casserait les filtres et les agents de
l'entreprise (« envoie le planning à mes chefs d'équipe » ne trouverait plus personne).
${lines.join("\n")}
  - Option \`autre\` : quand elle existe et que rien ne convient, stocke \`autre:precision\`
    (ex \`autre:carreleur_mosaiste\`). Jamais une valeur inventée.
`;
}

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
${buildVocabBlock(entityKeys)}
## API \`window.biltia\` (déjà injectée, ne la redéfinis pas)
- \`await biltia.list('${primary}', { match, order, ascending, limit })\` → tableau de lignes
- \`await biltia.get('${primary}', id)\` → une ligne
- \`await biltia.create('${primary}', { ...champs })\` → ligne créée (avec son \`id\`)
- \`await biltia.update('${primary}', id, { ...champs })\` → ligne mise à jour
- \`await biltia.remove('${primary}', id)\` → suppression
- \`await biltia.extract(photoDataUrl, { fields:['numero','fournisseur','date'] })\` → **IA VISION** : lit une PHOTO (bon de livraison, facture, plan…) et renvoie un objet \`{numero, fournisseur, date, …}\` (chaîne vide si illisible). À enchaîner avec \`biltia.create(...)\` pour stocker. ~25 crédits/photo.
- \`await biltia.transcribe(audioDataUrl, { fields:['employe','heures','date'] })\` → **IA VOIX** : transcrit une DICTÉE et renvoie \`{ text, data:{employe, heures, date} }\` (sans \`fields\` → \`{ text }\` seul). Idéal pour pointer/noter à la voix, mains libres. ~10-25 crédits.
- \`await biltia.sendEmail({ to:'client@ex.fr', subject:'…', body:'…' })\` → **ENVOI EMAIL** au nom de l'entreprise (Gmail connecté de l'utilisateur si dispo, sinon envoi Biltia). Dès qu'un devis/une facture/un message client est en jeu, propose un bouton « Envoyer par email » qui appelle ceci (vérifie qu'une adresse existe, ne l'invente jamais).
- \`await biltia.sendSms({ to:'+33612345678', body:'…' })\` → **ENVOI SMS** au nom de l'entreprise (relance facture, confirmation RDV). Bouton « Relancer par SMS » là où c'est utile ; vérifie qu'un numéro existe, ne l'invente jamais.
- \`await biltia.link({entity:'employees',id:e}, {entity:'chantiers',id:c}, 'affecte')\` / \`biltia.unlink(…)\` / \`await biltia.links('chantiers', c, {with:'employees'})\` → **RELATIONS PLUSIEURS-À-PLUSIEURS** : quand une fiche peut être reliée à PLUSIEURS autres (un employé sur plusieurs chantiers, un chantier avec plusieurs employés, un document rattaché à plusieurs objets), utilise ces liens plutôt qu'un seul champ \`*_id\`. Le lien est unique et symétrique. \`biltia.links(...)\` liste les fiches reliées (dans les deux sens), \`{with:'…'}\` filtre par type. Pour une relation SIMPLE (un chantier a UN client), garde le champ \`client_id\`.
- \`await biltia.listAttachedAgents()\` / \`biltia.createAgent(instruction)\` / \`biltia.pauseAgent(id)\` / \`biltia.resumeAgent(id)\` / \`biltia.triggerAgent(id)\` / \`biltia.listPendingApprovals()\` → **AGENTS DE L'APP** : si l'app gagne à avoir une automatisation de fond (« chaque vendredi, envoyer le récap au client », « prévenir dès qu'un chantier prend du retard »), tu peux afficher une petite section « Automatisations » qui liste les agents rattachés (\`listAttachedAgents\`), permet d'en créer un en langage clair (\`createAgent('…')\`), de les mettre en pause/relancer, et de voir les messages **en attente de validation** (\`listPendingApprovals\`). N'ajoute cette section QUE si elle est utile au métier de l'app ; ne crée jamais d'agent tout seul sans action de l'utilisateur.
- \`biltia.track('action_clicked', { action:'export_pdf' })\` → **TÉLÉMÉTRIE D'USAGE** (facultatif, jamais bloquant) : signale une action importante que l'utilisateur déclenche. L'ouverture de l'app, l'ouverture d'une vue \`biltiaUI\` et la création de fiche sont déjà tracées automatiquement — n'ajoute \`track\` que pour une action métier notable (export, envoi, validation).
Chaque ligne possède un \`id\` (uuid) généré par le serveur. N'envoie jamais \`id\`,
\`tenant_id\` ni les dates \`*_at\` dans create/update : le serveur les gère.
Pour un champ optionnel laissé vide (uuid de liaison, date, nombre), envoie \`null\`
(ou omets la clé) — JAMAIS une chaîne vide \`""\`.

## Règles d'implémentation (obligatoires)
0. ⛔ RÈGLE ZÉRO — LISTE, FICHE, FORMULAIRE, KANBAN, KPI D'ENTITÉ = \`biltiaUI\`, JAMAIS DU FAIT-MAIN.
   Un \`<form>\`, un \`<table>\` ou un kanban écrit à la main pour une entité du workspace est
   INTERDIT. C'est LA cause n°1 d'apps qui s'affichent parfaitement et n'enregistrent rien.
   \`biltiaUI\` fait déjà, et sans bug : le chargement, le rafraîchissement après écriture,
   les selects relationnels peuplés, la validation des requis, la recherche/le tri, le
   glisser-déposer qui PERSISTE. Il réutilise TES classes CSS → rendu identique.
   Le squelette d'une vue de données, c'est exactement ça :
   \`\`\`html
   <div class="card"><div id="liste"></div></div>
   <script>
     biltiaUI.table('liste', {
       entity: '${primary}',
       columns: [{ key:'nom', label:'Nom' }, { key:'statut', label:'Statut', type:'status' }],
       search: true,
       onRowClick: function(row){ ouvrirFiche(row); },
       rowActions: [{ label:'Modifier', onClick: function(row){ editer(row); } }]
     });
     function editer(row){
       biltiaUI.form('modal-host', {
         entity: '${primary}',
         fields: [ /* key/label/type — type:'relation' pour un champ *_id */ ],
         record: row,                                   // absent = création
         onSaved: function(){ biltiaUI.table('liste', { entity:'${primary}' }); } // recharge
       });
     }
   <\/script>
   \`\`\`
   Tu n'appelles \`biltia.list/create/update/remove\` À LA MAIN que pour ce que \`biltiaUI\`
   ne couvre pas (un calcul d'agrégat maison, un import en lot, une action métier ponctuelle).
1. FILTRES / PAGINATION / FORMULES (côté serveur) : pour une liste longue ou filtrée, \`biltiaUI.table\`
   fait déjà la recherche et le tri. Si tu as besoin d'un filtrage serveur précis, utilise
   \`await biltia.listPage('${primary}', { filters:{ type:'all', conditions:[{field:'statut',op:'eq',value:'en_cours'}] }, search:'mot', searchFields:['nom'], order:'created_at', ascending:false, offset:0, limit:20 })\` → \`{ data, total, hasMore }\`. Opérateurs : eq/neq/gt/gte/lt/lte/contains/before/after/is_empty/is_not_empty/in/mine. Dates relatives : \`@today\`, \`@today-7d\`. Le filtrage se fait EN BASE (jamais charger 500 lignes pour filtrer en JS).
   Pour un CALCUL d'affichage (marge, avancement, reste à payer) : \`biltiaUI.compute({operation:'subtract',args:[{field:'montant_ttc'},{field:'montant_paye'}]}, fiche)\` (add/subtract/multiply/divide/sum/average/min/max/percentage/if/coalesce/date_diff) — jamais un calcul « en dur » faux. Les montants LÉGAUX (facturation) restent gérés par le serveur.
2. Un KPI branché sur une entité = \`biltiaUI.kpi(...)\`, pas un compteur calculé à la main.
3. Affiche un état de chargement et un état d'erreur clair si l'API échoue
   (ex : « Connexion au workspace impossible »). NE BASCULE PAS sur localStorage pour ces entités.
4. NE PRÉ-REMPLIS PAS de fausses données pour ces entités : les vraies données viennent du workspace.
5. CHAMPS RELATIONNELS : déclare-les \`type:'relation', relation:'clients'\` dans les \`fields\`
   de \`biltiaUI.form\` — le select est peuplé, rechargé et validé TOUT SEUL. Ne construis
   jamais un \`<select>\` relationnel à la main : c'est là que les implémentations maison
   cassent (select vide, id non stocké, pas de rechargement).
6. Jamais de saisie libre d'un nom qui existe déjà dans le workspace : on choisit une fiche
   existante (select relationnel), on ne retape pas « Dupont » à la main.
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

Pour toute donnée qui ne correspond PAS à une entité ci-dessus, utilise une
COLLECTION \`window.biltia\` libre (cloud, partagée) : \`biltia.list/create/update/remove('ma_collection', …)\`,
avec un nom court en snake_case. JAMAIS \`localStorage\` — même ces données libres
doivent vivre dans le cloud partagé, pour survivre au rechargement, se synchroniser
entre appareils/membres, et rester visibles par le copilote et les agents.
`;
}
