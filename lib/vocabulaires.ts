// ─────────────────────────────────────────────────────────────────────────────
// RÉFÉRENTIEL DES VALEURS (vocabulaires fermés) — SOURCE UNIQUE DE VÉRITÉ.
//
// POURQUOI CE FICHIER EXISTE
// Un agent filtre sur des VALEURS : « envoie le planning à mes chefs d'équipe »
// → `role = chef_equipe`. Si la valeur est saisie en texte libre, la même notion
// s'écrit de dix façons (« Chef d'équipe », « chef equipe », « Chef de chantier »)
// et le filtre rate la moitié des fiches — SANS ERREUR, SANS TRACE. L'artisan voit
// une automatisation qui « ne marche pas » sans jamais savoir pourquoi.
//
// La liste déroulante dans le formulaire ne suffit PAS : les apps générées, le SDK,
// l'agent (action `act`) et l'import CSV écrivent aussi dans ces colonnes, et rien
// ne les contraint (aucun CHECK en base). Le référentiel doit donc vivre ICI, au
// point d'écriture, pas dans l'UI.
//
// CE QU'IL GARANTIT
//   1. Une notion = UNE valeur canonique (snake_case, sans accent).
//   2. Toute écriture est NORMALISÉE avant d'atteindre la base (alias → canonique).
//      « Chef d'équipe », « chef equipe », « CHEF D'EQUIPE » → `chef_equipe`.
//   3. Une valeur hors liste sur un vocabulaire FERMÉ est REFUSÉE avec un message
//      clair + suggestions (jamais avalée en silence).
//   4. Le langage naturel de l'agent se résout contre les MÊMES alias → le filtre
//      qu'il écrit vise exactement les fiches que l'artisan a saisies.
//
// Pur (client-safe) : aucune dépendance serveur. Consommé par le formulaire du
// Workspace, /api/data (normalisation serveur), les agents et le prompt de génération.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "@/lib/btp-catalog";
import { tousLesTauxTva, libelleTauxTva } from "@/lib/tva";
import type { Locale } from "@/lib/i18n/config";

export type VocabOption = {
  /** Valeur STOCKÉE en base. Ne change jamais (la traduire casserait les données). */
  value: string;
  /** Libellé FR affiché. */
  label: string;
  /** Libellé EN affiché (repli : label FR). */
  en?: string;
  /** Famille d'appartenance (pour les longues listes groupées A→Z). */
  group?: string;
  /** Écritures alternatives acceptées (saisie humaine, LLM, import, seeds). */
  aliases?: string[];
};

export type Vocab = {
  id: string;
  /** Fermé = une valeur hors liste est refusée. Ouvert = slugifiée et acceptée. */
  closed: boolean;
  /** Liste longue → le formulaire affiche un champ de recherche, pas un <select>. */
  searchable?: boolean;
  options: VocabOption[];
};

// ── Normalisation d'une chaîne en clé comparable ─────────────────────────────
// « Chef d'équipe » → chef_equipe ; « Gros œuvre » → gros_oeuvre ; « m² » → m2.
// Les particules (d', de, du, des, le, la…) sont retirées : c'est ce qui fait que
// « Chef d'équipe » et « chef equipe » tombent sur la MÊME clé sans alias dédié.

const PARTICULES = new Set(["d", "de", "du", "des", "l", "la", "le", "les", "en", "au", "aux", "et", "a"]);

export function slugify(raw: string): string {
  return raw
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !PARTICULES.has(t))
    .join("_");
}

/**
 * Retire le pluriel de chaque mot. « chefs d'équipe » slugifié donne `chefs_equipe`,
 * qui ne rencontrerait jamais la valeur canonique `chef_equipe`. On applique la même
 * réduction DES DEUX CÔTÉS (saisie et référentiel) : peu importe qu'elle abîme un
 * mot (« gros » → « gro »), elle l'abîme identiquement de chaque côté.
 */
function singular(slug: string): string {
  return slug
    .split("_")
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t))
    .join("_");
}

// ── Fabrique compacte : o(valeur, libellé FR, libellé EN, ...alias) ──────────

function o(value: string, label: string, en?: string, aliases?: string[], group?: string): VocabOption {
  return { value, label, en, aliases, group };
}

/** Vocabulaire fermé bâti à partir d'une liste d'options. */
function closed(id: string, options: VocabOption[], searchable = false): Vocab {
  return { id, closed: true, searchable, options };
}

// ── CORPS DE MÉTIER — bâti sur le catalogue BTP (12 familles, ~50 métiers) ───
// Le catalogue porte déjà les mots-clés métier ; on y ajoute les noms de PERSONNE
// (« électricien », « plombier ») que l'artisan emploie naturellement, et que le
// seed historique avait écrits tels quels.

const NOMS_DE_METIER: Record<string, string[]> = {
  maconnerie: ["macon", "maconnerie", "gros oeuvre", "gros_oeuvre"],
  beton_arme: ["betonneur", "beton"],
  ferraillage: ["ferrailleur"],
  demolition: ["demolisseur", "desamianteur"],
  terrassement: ["terrassier", "terrassement vrd"],
  vrd: ["vrd", "voirie"],
  charpente: ["charpentier"],
  couverture: ["couvreur", "toiture", "couverture zinguerie"],
  zinguerie: ["zingueur"],
  electricite_generale: ["electricien", "electricite", "elec"],
  courants_faibles: ["courant faible", "reseaux"],
  domotique: ["domoticien"],
  photovoltaique: ["photovoltaique", "solaire", "panneaux solaires"],
  irve: ["borne de recharge", "irve"],
  plomberie: ["plombier", "plomberie", "sanitaire", "plomberie cvc", "plomberie chauffage"],
  chauffage: ["chauffagiste", "chauffage", "plombier chauffagiste"],
  climatisation: ["frigoriste", "clim", "climatisation"],
  ventilation: ["vmc", "ventilation"],
  pac: ["pompe a chaleur", "pac"],
  menuiserie_exterieure: ["menuisier exterieur", "menuiserie alu", "menuiserie bois alu"],
  menuiserie_interieure: ["menuisier", "menuiserie", "agenceur"],
  serrurerie: ["serrurier"],
  metallerie: ["metallier", "ferronnier"],
  platrerie: ["platrier", "plaquiste", "platrerie", "platrerie isolation"],
  isolation_interieure: ["isolation", "iti"],
  cloisons: ["cloisonneur", "doublage"],
  carrelage_faience: ["carreleur", "carrelage", "faience", "carrelage faience", "mosaiste"],
  sols_souples: ["solier", "moquettiste"],
  parquet: ["parqueteur"],
  peinture: ["peintre", "peinture", "peinture finitions", "finitions"],
  papier_peint_decoration: ["decorateur", "poseur papier peint"],
  ravalement: ["facadier", "ravaleur", "facade"],
  ite: ["ite", "isolation exterieure"],
  etancheite: ["etancheur"],
  bardage: ["bardeur"],
  paysagisme: ["paysagiste", "jardinier", "espaces verts"],
  clotures: ["poseur de cloture", "portail"],
  pavage_terrasses: ["paveur", "terrasse"],
  piscines: ["pisciniste"],
  depannage_sav: ["depanneur", "sav", "technicien sav"],
  maintenance_contrats: ["technicien de maintenance", "maintenance"],
  nettoyage_chantier: ["agent de nettoyage", "nettoyage"],
  tce: ["tce", "tous corps d'etat", "tous corps d etat", "polyvalent"],
  contractant_general: ["contractant general"],
  renovation_globale: ["renovation globale", "renovation"],
};

const CORPS_METIER_OPTIONS: VocabOption[] = [
  ...CATEGORIES.flatMap((cat) =>
    cat.subTrades.map((st) =>
      o(st.id, st.label, undefined, [...(NOMS_DE_METIER[st.id] ?? []), ...st.keywords], cat.label)
    )
  ),
  o("autre", "Autre (préciser)", "Other (specify)", [], "Autre"),
];

// Spécialité d'un fournisseur / sous-traitant : les corps de métier (pour un
// sous-traitant) PLUS les métiers de la fourniture (pour un négoce).
const SPECIALITE_OPTIONS: VocabOption[] = [
  o("negoce_materiaux", "Négoce de matériaux", "Materials merchant", ["negoce", "materiaux", "fournitures", "granulats"], "Fourniture"),
  o("location_materiel", "Location de matériel", "Equipment rental", ["location", "location d'engins", "location echafaudage"], "Fourniture"),
  o("beton_pret_emploi", "Béton prêt à l'emploi", "Ready-mix concrete", ["centrale a beton", "toupie", "bpe"], "Fourniture"),
  o("transport", "Transport / Livraison", "Transport / Delivery", ["transporteur", "livraison"], "Fourniture"),
  ...CORPS_METIER_OPTIONS.filter((x) => x.value !== "autre"),
  o("autre", "Autre (préciser)", "Other (specify)", [], "Autre"),
];

// ── LES VOCABULAIRES ─────────────────────────────────────────────────────────
// Bloc 1 : les listes qui MANQUAIENT (champs en texte libre aujourd'hui).
// Bloc 2 : les listes qui existaient déjà en <select> mais que RIEN ne validait
//          côté serveur — elles entrent ici pour être normalisées à l'écriture.

export const VOCABS: Record<string, Vocab> = {
  // ── Bloc 1 : les manquantes ────────────────────────────────────────────────

  // Le RÔLE (la place dans l'organisation) — à ne pas confondre avec le corps de
  // métier (la compétence). Le seed historique mélangeait les deux dans `role`.
  role_employe: closed("role_employe", [
    o("dirigeant", "Dirigeant", "Owner / Director", ["patron", "gerant", "chef d'entreprise", "artisan", "directeur", "president", "pdg"]),
    o("conducteur_travaux", "Conducteur de travaux", "Works manager", ["conductrice de travaux", "cdt", "charge d'affaires", "chargee d'affaires", "responsable travaux"]),
    o("chef_chantier", "Chef de chantier", "Site manager", ["cheffe de chantier", "responsable de chantier"]),
    o("chef_equipe", "Chef d'équipe", "Team lead", ["cheffe d'equipe", "team lead", "chef equipe"]),
    o("compagnon", "Compagnon / Ouvrier qualifié", "Skilled worker", ["ouvrier", "ouvrier qualifie", "ouvriere qualifiee", "ouvrier specialise", "salarie", "compagnon"]),
    o("apprenti", "Apprenti / Alternant", "Apprentice", ["apprentie", "alternant", "alternante", "stagiaire", "apprenti macon"]),
    o("interimaire", "Intérimaire", "Temp worker", ["interim", "interimaire"]),
    o("technicien", "Technicien", "Technician", ["technicienne", "technicien sav", "technicien de maintenance"]),
    o("conducteur_engins", "Conducteur d'engins", "Machine operator", ["conductrice d'engins", "grutier", "pelleteur"]),
    o("manoeuvre", "Manœuvre", "Laborer", ["manutentionnaire", "aide", "aide macon"]),
    o("commercial", "Commercial", "Sales", ["commerciale", "vendeur", "vendeuse", "charge de clientele"]),
    o("administratif", "Administratif", "Admin / Back office", ["secretaire", "assistante", "assistant", "comptable", "adv", "bureau", "admin", "rh"]),
    o("autre", "Autre (préciser)", "Other (specify)"),
  ]),

  corps_metier: { id: "corps_metier", closed: true, searchable: true, options: CORPS_METIER_OPTIONS },

  specialite: { id: "specialite", closed: true, searchable: true, options: SPECIALITE_OPTIONS },

  // Nature d'un fournisseur (≠ categorie qui dit fournisseur OU sous-traitant).
  type_fournisseur: closed("type_fournisseur", [
    // `fournisseur` (60 fiches en base) est la valeur historique du seed : un
    // fournisseur sans autre précision EST un négoce.
    o("negoce", "Négoce / Distributeur", "Merchant / Distributor", ["negoce materiaux", "fournitures", "distributeur", "grossiste", "fournisseur", "granulats"]),
    o("fabricant", "Fabricant", "Manufacturer", ["industriel", "centrale a beton", "usine"]),
    o("location", "Loueur de matériel", "Rental company", ["location materiel", "location engins", "loueur"]),
    o("sous_traitant", "Sous-traitant", "Subcontractor", ["st", "sous traitant"]),
    o("transporteur", "Transporteur", "Carrier", ["transport", "livreur"]),
    o("autre", "Autre", "Other"),
  ]),

  categorie_fournisseur: closed("categorie_fournisseur", [
    o("fournisseur", "Fournisseur", "Supplier", ["negoce", "fournisseurs"]),
    o("sous_traitant", "Sous-traitant", "Subcontractor", ["sous traitant", "st", "sous-traitance"]),
  ]),

  // D'où vient l'affaire (clients.source, demandes.source).
  source_prospect: closed("source_prospect", [
    o("bouche_a_oreille", "Bouche-à-oreille", "Word of mouth", ["bao", "bouche a oreille"]),
    o("recommandation", "Recommandation", "Referral", ["parrainage", "recommande par"]),
    o("ancien_client", "Ancien client", "Existing client", ["client existant", "fidele"]),
    o("formulaire", "Formulaire web", "Web form", ["formulaire web", "site formulaire", "lead"]),
    o("site_web", "Site internet", "Website", ["site", "internet", "web"]),
    o("reseaux_sociaux", "Réseaux sociaux", "Social media", ["facebook", "instagram", "linkedin", "tiktok"]),
    o("publicite", "Publicité", "Advertising", ["pub", "google ads", "adwords", "flyer", "annonce"]),
    o("annuaire", "Annuaire / Plateforme", "Directory / Marketplace", ["pages jaunes", "houzz", "travaux.com", "plateforme"]),
    o("salon", "Salon / Foire", "Trade show", ["foire", "salon pro"]),
    o("partenaire", "Partenaire / Apporteur", "Partner", ["apporteur d'affaires", "architecte", "confrere"]),
    o("appel_entrant", "Appel entrant", "Inbound call", ["telephone", "appel"]),
    o("prospection", "Prospection", "Outbound", ["demarchage", "porte a porte"]),
    o("autre", "Autre", "Other"),
  ]),

  // Le TYPE d'intervention (le détail va dans `description`, pas ici).
  type_intervention: closed("type_intervention", [
    o("depannage", "Dépannage / Urgence", "Emergency repair", ["depannage electrique", "depannage plomberie", "urgence", "panne", "fuite", "reparation"]),
    o("entretien", "Entretien", "Servicing", ["entretien chaudiere", "ramonage", "revision"]),
    o("maintenance", "Maintenance (contrat)", "Maintenance (contract)", ["maintenance chaudiere", "maintenance preventive", "contrat"]),
    o("sav", "SAV / Garantie", "After-sales", ["sav toiture", "sav carrelage", "garantie", "reprise"]),
    o("pose", "Pose / Installation", "Installation", ["installation", "pose compteur", "montage", "remplacement", "changement"]),
    o("mise_en_service", "Mise en service", "Commissioning", ["mise en service extraction", "demarrage", "remise en eau"]),
    o("visite_technique", "Visite technique / Contrôle", "Technical visit", ["controle", "controle vmc", "controle etaiement", "visite", "inspection"]),
    o("metrage", "Métré / Prise de cotes", "Survey", ["metre avant devis", "metre", "prise de cotes", "releve"]),
    o("diagnostic", "Diagnostic / Expertise", "Diagnosis", ["diagnostic fissures", "expertise", "etude"]),
    o("livraison", "Livraison / Approvisionnement", "Delivery", ["appro", "livraison materiaux"]),
    o("levee_reserves", "Levée de réserves", "Snag clearing", ["levee de reserves", "reception"]),
    o("nettoyage", "Nettoyage", "Cleaning", ["curage", "pompage", "evacuation"]),
    o("autre", "Autre (préciser)", "Other (specify)"),
  ]),

  categorie_materiau: closed("categorie_materiau", [
    o("gros_oeuvre", "Gros œuvre", "Structural", ["maconnerie", "beton", "ciment"]),
    o("granulats", "Granulats", "Aggregates", ["sable", "gravier", "cailloux"]),
    o("ferraillage", "Ferraillage", "Rebar", ["acier", "treillis", "armature"]),
    o("etaiement", "Étaiement / Coffrage", "Shoring / Formwork", ["etai", "coffrage", "banche"]),
    o("bois", "Bois / Charpente", "Timber", ["charpente", "poutre", "madrier"]),
    o("couverture", "Couverture / Toiture", "Roofing", ["toiture", "tuile", "ardoise", "zinc"]),
    o("etancheite", "Étanchéité", "Waterproofing", ["membrane", "bitume"]),
    o("isolation", "Isolation", "Insulation", ["laine", "polystyrene", "isolant"]),
    o("platrerie", "Plâtrerie / Cloisons", "Plasterboard", ["placo", "plaque de platre", "cloison", "doublage"]),
    o("carrelage", "Carrelage / Faïence", "Tiling", ["faience", "carreau", "colle carrelage"]),
    o("revetement", "Revêtements de sol", "Flooring", ["revetements", "parquet", "moquette", "sol souple"]),
    o("peinture", "Peinture / Finitions", "Paint", ["enduit", "peinture", "finitions"]),
    o("menuiserie", "Menuiserie / Fermetures", "Joinery", ["porte", "fenetre", "volet"]),
    o("plomberie", "Plomberie / Sanitaire", "Plumbing", ["tube", "sanitaire", "raccord"]),
    o("chauffage", "Chauffage / CVC", "Heating / HVAC", ["radiateur", "chaudiere", "clim", "vmc"]),
    o("electricite", "Électricité", "Electrical", ["cable", "gaine", "tableau", "prise"]),
    o("quincaillerie", "Quincaillerie / Visserie", "Hardware", ["vis", "cheville", "fixation"]),
    o("consommable", "Consommables", "Consumables", ["disque", "lame", "gant", "sac"]),
    o("outillage", "Outillage", "Tooling", ["outil"]),
    o("epi", "EPI / Sécurité", "PPE / Safety", ["casque", "harnais", "securite", "protection"]),
    o("autre", "Autre (préciser)", "Other (specify)"),
  ]),

  type_equipement: closed("type_equipement", [
    o("engin", "Engin de chantier", "Heavy machine", ["pelle", "pelle compacte", "mini pelle", "chargeuse", "tractopelle"]),
    o("levage", "Levage", "Lifting", ["grue", "nacelle", "treuil", "monte charge"]),
    o("manutention", "Manutention", "Handling", ["chariot", "transpalette", "brouette", "diable"]),
    o("compactage", "Compactage", "Compaction", ["plaque vibrante", "rouleau", "pilonneuse"]),
    o("electroportatif", "Électroportatif", "Power tools", ["perceuse", "meuleuse", "visseuse", "percage", "decoupe bois", "decoupe beton", "demolition", "marteau piqueur"]),
    o("outillage", "Outillage à main", "Hand tools", ["outil", "finitions"]),
    o("betonniere", "Bétonnière / Malaxeur", "Concrete mixer", ["betonniere", "malaxeur", "toupie"]),
    o("echafaudage", "Échafaudage", "Scaffolding", ["echafaudage", "echelle", "escabeau"]),
    o("etaiement", "Étaiement", "Shoring", ["etai", "etaiement"]),
    o("mesure", "Mesure / Contrôle", "Measuring", ["laser", "niveau", "telemetre", "mesure"]),
    o("energie", "Énergie / Groupe", "Power supply", ["groupe electrogene", "compresseur", "energie"]),
    o("vehicule", "Véhicule", "Vehicle", ["camion", "fourgon", "utilitaire", "transport", "vehicule"]),
    o("epi", "EPI / Sécurité", "PPE / Safety", ["casque", "harnais", "protection"]),
    o("autre", "Autre (préciser)", "Other (specify)"),
  ]),

  unite: closed("unite", [
    o("u", "Unité (u)", "Unit", ["unite", "piece", "pce", "pc", "ens", "ensemble", "1"]),
    o("m²", "Mètre carré (m²)", "Square meter", ["m2", "metre carre", "metres carres"]),
    o("m³", "Mètre cube (m³)", "Cubic meter", ["m3", "metre cube", "metres cubes"]),
    o("ml", "Mètre linéaire (ml)", "Linear meter", ["metre lineaire", "ml", "m", "metre"]),
    o("kg", "Kilogramme (kg)", "Kilogram", ["kilo", "kilogramme"]),
    o("t", "Tonne (t)", "Ton", ["tonne", "tonnes"]),
    o("l", "Litre (L)", "Liter", ["litre", "litres"]),
    o("h", "Heure (h)", "Hour", ["heure", "heures", "hr"]),
    o("j", "Jour (j)", "Day", ["jour", "jours", "journee"]),
    o("forfait", "Forfait", "Flat rate", ["ft", "fft", "global"]),
  ]),

  // ── Bloc 2 : les <select> qui existaient déjà, désormais validés au serveur ──
  // Les VALEURS sont strictement celles déjà en base (aucune migration de sens) ;
  // seuls les alias sont nouveaux (ils rattrapent « En cours », « terminé », etc.).

  statut_chantier: closed("statut_chantier", [
    o("en_attente", "En attente", "Pending", ["a venir", "prevu", "non demarre"]),
    o("en_cours", "En cours", "In progress", ["demarre", "actif", "ouvert"]),
    o("en_retard", "En retard", "Overdue", ["retard", "late"]),
    o("termine", "Terminé", "Completed", ["fini", "acheve", "livre", "cloture"]),
    o("annule", "Annulé", "Cancelled", ["abandonne"]),
  ]),
  statut_client: closed("statut_client", [
    o("prospect", "Prospect", "Prospect", ["lead", "piste"]),
    o("actif", "Actif", "Active", ["client actif"]),
    o("inactif", "Inactif", "Inactive", ["dormant"]),
    o("archive", "Archivé", "Archived", ["archive"]),
  ]),
  type_client: closed("type_client", [
    o("particulier", "Particulier", "Individual", ["prive", "b2c", "personne physique"]),
    o("entreprise", "Entreprise", "Company", ["pro", "b2b", "societe", "sci"]),
    o("collectivite", "Collectivité", "Public body", ["mairie", "public", "administration", "bailleur social"]),
  ]),
  statut_employe: closed("statut_employe", [
    o("actif", "Actif", "Active", ["en poste", "present"]),
    o("inactif", "Inactif", "Inactive", ["parti", "sorti"]),
    o("arret", "Arrêt / Absent", "On leave", ["arret maladie", "arret de travail", "conge", "absent", "maladie"]),
  ]),
  type_document: closed("type_document", [
    o("kbis", "Kbis", "Registration extract"),
    o("urssaf", "Attestation URSSAF", "URSSAF certificate", ["urssaf", "vigilance"]),
    o("rc_pro", "RC Pro", "Liability insurance", ["responsabilite civile", "rc"]),
    o("decennale", "Assurance décennale", "10-year warranty insurance", ["decennale", "garantie decennale"]),
    o("qualibat", "Qualibat / Qualification", "Qualibat", ["rge", "qualification"]),
    // Relevés dans les VRAIES fiches (rapport de backfill) : ce sont des pièces
    // BTP de plein droit, pas des exceptions à ranger dans « autre ».
    o("caces", "CACES", "Machine operator licence", ["autorisation de conduite"]),
    o("habilitation", "Habilitation électrique", "Electrical authorisation", ["habilitation elec"]),
    o("visite_medicale", "Visite médicale", "Medical check", ["medecine du travail", "aptitude"]),
    o("ppsps", "PPSPS", "Site safety plan", ["plan de securite"]),
    o("dict", "DICT / DT", "Works notice", ["declaration de travaux"]),
    o("attestation_tva", "Attestation TVA réduite", "Reduced-VAT certificate", ["attestation tva", "tva reduite"]),
    o("devis", "Devis", "Quote"),
    o("facture", "Facture", "Invoice"),
    o("contrat", "Contrat", "Contract"),
    o("plan", "Plan", "Drawing", ["plans", "dwg"]),
    o("photo", "Photo", "Photo", ["photos", "image"]),
    o("pv", "PV / Rapport", "Report", ["proces verbal", "pv de reception", "rapport"]),
    o("autre", "Autre", "Other"),
  ]),
  statut_document: closed("statut_document", [
    o("valide", "Valide", "Valid", ["ok", "a jour"]),
    o("expire", "Expiré", "Expired", ["perime"]),
    o("manquant", "Manquant", "Missing", ["absent"]),
    o("en_attente", "En attente", "Pending", ["a recevoir"]),
  ]),
  statut_materiau: closed("statut_materiau", [
    o("disponible", "Disponible", "Available", ["en stock", "stock"]),
    o("affecte", "Affecté", "Assigned", ["reserve", "sorti"]),
    o("maintenance", "En maintenance", "Maintenance", ["revision"]),
    o("hors_service", "Hors service", "Out of service", ["hs", "casse"]),
  ]),
  statut_equipement: closed("statut_equipement", [
    o("disponible", "Disponible", "Available", ["en stock", "au depot"]),
    o("affecte", "Affecté", "Assigned", ["sur chantier", "sorti"]),
    o("maintenance", "En maintenance", "Maintenance", ["revision", "reparation"]),
    o("hors_service", "Hors service", "Out of service", ["hs", "casse"]),
  ]),
  statut_intervention: closed("statut_intervention", [
    o("planifie", "Planifiée", "Scheduled", ["planifiee", "prevue", "a venir"]),
    o("en_cours", "En cours", "In progress", ["demarree"]),
    o("termine", "Terminée", "Completed", ["terminee", "faite", "realisee"]),
    o("annule", "Annulée", "Cancelled", ["annulee"]),
  ]),
  statut_tache: closed("statut_tache", [
    o("todo", "À faire", "To do", ["a faire", "nouveau", "backlog"]),
    o("doing", "En cours", "Doing", ["en cours", "wip"]),
    o("done", "Terminée", "Done", ["terminee", "faite", "fini"]),
  ]),
  priorite_tache: closed("priorite_tache", [
    o("low", "Basse", "Low", ["basse", "faible"]),
    o("normal", "Normale", "Normal", ["normale", "moyenne", "medium"]),
    o("high", "Haute", "High", ["haute", "urgente", "urgent", "critique"]),
  ]),
  // Les 5 natures d'un article. `prestation` et `forfait` étaient absents : un
  // « déplacement » ou une « mise en service » n'est ni une fourniture, ni de la
  // main d'œuvre au sens horaire, ni un ouvrage composé.
  type_catalogue: closed("type_catalogue", [
    o("fourniture", "Fourniture", "Supply", ["materiel", "produit", "materiau", "article"]),
    o("main_oeuvre", "Main d'œuvre", "Labor", ["main d'oeuvre", "mo", "heure", "journee", "pose"]),
    o("prestation", "Prestation", "Service", ["service", "deplacement", "diagnostic", "mise en service", "evacuation"]),
    o("ouvrage", "Ouvrage (fourniture + pose)", "Work package", ["poste", "compose"]),
    o("forfait", "Forfait", "Fixed fee", ["frais fixe", "forfaitaire"]),
  ]),

  // AFFICHAGE SEUL. Ce vocabulaire donne les libellés des taux (« 21 % (BE) ») et
  // alimente le <select> du formulaire. Il n'est PAS branché dans FIELD_VOCAB : il
  // ne valide rien, sinon un taux légitime hors liste (Luxembourg, taux futur) serait
  // refusé au serveur. La validation de `taux_tva` est NUMÉRIQUE (NUMERIC_FIELDS).
  taux_tva: {
    id: "taux_tva",
    closed: false,
    options: tousLesTauxTva().map((t) =>
      o(String(t), libelleTauxTva(t), `${String(t)}%`, [`${String(t)}%`, String(t).replace(".", ",")])
    ),
  },

  // D'où vient le prix de VENTE de l'article du catalogue.
  prix_source: closed("prix_source", [
    o("manuel", "Saisi à la main", "Manual", ["manuelle", "saisi"]),
    o("fournisseur", "Tarif fournisseur", "Supplier", ["catalogue fournisseur"]),
    o("calcule", "Calculé (achat + marge)", "Calculated", ["calcule", "marge"]),
    o("importe", "Importé", "Imported", ["import", "csv", "excel"]),
    o("historique", "Repris d'un ancien devis", "Historical", ["ancien devis"]),
  ]),

  // Politique de prix d'un OUVRAGE composé.
  mode_tarif: closed("mode_tarif", [
    o("prix_fixe", "Prix de vente forfaitaire", "Fixed sale price", ["fixe", "forfait"]),
    o("somme_composants", "Somme des composants + marge", "Sum of components", ["somme", "composants"]),
    o("fixe_plus_variable", "Fixe + part variable", "Fixed plus variable", ["mixte"]),
  ]),

  // LA provenance du prix d'une LIGNE de devis — le champ qui rend vérifiable, après
  // coup, la règle « l'IA n'invente jamais un prix ». `a_saisir` = aucun prix fiable
  // trouvé : le devis ne doit pas partir tant que l'artisan n'a pas tranché.
  origine_prix: closed("origine_prix", [
    o("prix_dicte", "Dicté par vous", "Dictated", ["explicite", "impose"]),
    o("catalogue", "Prix du catalogue", "Catalog price", ["tarif catalogue"]),
    o("calcule_marge", "Calculé (achat + marge)", "Calculated from margin", ["marge"]),
    o("suggestion_historique", "Suggéré d'un ancien devis", "Historical suggestion", ["historique"]),
    o("a_saisir", "À définir (aucun tarif trouvé)", "Price missing", ["manquant", "inconnu"]),
  ]),
  statut_devis: closed("statut_devis", [
    o("brouillon", "Brouillon", "Draft", ["en cours de redaction"]),
    o("envoye", "Envoyé", "Sent", ["envoye au client", "transmis"]),
    o("accepte", "Accepté", "Accepted", ["signe", "valide", "bon pour accord", "gagne"]),
    o("refuse", "Refusé", "Declined", ["perdu", "rejete"]),
    o("expire", "Expiré", "Expired", ["perime", "caduc"]),
  ]),
  statut_facture: closed("statut_facture", [
    o("brouillon", "Brouillon", "Draft"),
    o("envoyee", "Envoyée", "Sent", ["envoye", "transmise", "emise"]),
    o("payee", "Payée", "Paid", ["paye", "reglee", "regle", "encaissee", "soldee"]),
    o("partiellement_payee", "Partiellement payée", "Partially paid", ["acompte recu", "partiel"]),
    o("en_retard", "En retard", "Overdue", ["impayee", "impaye", "retard"]),
    o("annulee", "Annulée", "Cancelled", ["annule", "avoir"]),
  ]),
  type_facture: closed("type_facture", [
    o("facture", "Facture", "Invoice", ["solde", "finale"]),
    o("acompte", "Acompte", "Deposit", ["arrhes", "avance"]),
    o("situation", "Situation de travaux", "Progress claim", ["situation"]),
    o("avoir", "Avoir", "Credit note", ["note de credit"]),
  ]),
  type_pointage: closed("type_pointage", [
    o("normal", "Heures normales", "Regular hours", ["normal", "standard"]),
    o("heure_sup", "Heures supplémentaires", "Overtime", ["heures sup", "hs", "supplementaires"]),
    o("trajet", "Trajet / Déplacement", "Travel", ["deplacement", "route"]),
    o("absence", "Absence", "Absence", ["conge", "maladie", "absent"]),
  ]),
  type_contrat: closed("type_contrat", [
    o("entretien", "Entretien", "Servicing", ["contrat d'entretien"]),
    o("maintenance", "Maintenance", "Maintenance", ["contrat de maintenance"]),
    o("garantie", "Garantie", "Warranty", ["extension de garantie"]),
  ]),
  periodicite: closed("periodicite", [
    o("mensuel", "Mensuel", "Monthly", ["mois", "par mois"]),
    o("trimestriel", "Trimestriel", "Quarterly", ["trimestre"]),
    o("semestriel", "Semestriel", "Half-yearly", ["semestre"]),
    o("annuel", "Annuel", "Yearly", ["an", "par an", "annuelle"]),
  ]),
  statut_contrat: closed("statut_contrat", [
    o("actif", "Actif", "Active", ["en cours"]),
    o("suspendu", "Suspendu", "On hold", ["pause"]),
    o("expire", "Expiré", "Expired", ["echu", "perime"]),
    o("resilie", "Résilié", "Terminated", ["rompu", "annule"]),
  ]),
  type_parc: closed("type_parc", [
    o("chaudiere", "Chaudière", "Boiler", ["chaudiere gaz", "chaudiere fioul"]),
    o("climatisation", "Climatisation", "Air conditioning", ["clim", "split"]),
    o("pompe_chaleur", "Pompe à chaleur", "Heat pump", ["pac", "pompe a chaleur"]),
    o("chauffe_eau", "Chauffe-eau / Ballon", "Water heater", ["ballon", "cumulus", "chauffe eau"]),
    o("tableau_electrique", "Tableau électrique", "Electrical panel", ["tableau", "coffret"]),
    o("vmc", "VMC / Ventilation", "Ventilation", ["ventilation", "extraction"]),
    o("adoucisseur", "Adoucisseur", "Water softener", ["traitement d'eau"]),
    o("panneaux_solaires", "Panneaux solaires", "Solar panels", ["photovoltaique", "solaire"]),
    o("autre", "Autre", "Other"),
  ]),
  type_site: closed("type_site", [
    o("facturation", "Adresse de facturation", "Billing address", ["facturation"]),
    o("chantier", "Chantier", "Job site", ["site de chantier"]),
    o("intervention", "Site d'intervention", "Service site", ["intervention"]),
    o("siege", "Siège", "HQ", ["siege social", "bureau"]),
    o("residence", "Résidence / Maison", "Residence", ["maison", "villa", "pavillon"]),
    o("immeuble", "Immeuble", "Building", ["copropriete", "batiment"]),
    o("appartement", "Appartement", "Apartment", ["appart", "logement"]),
    o("local", "Local / Commerce", "Premises", ["local commercial", "boutique", "bureau"]),
  ]),
  type_demande: closed("type_demande", [
    o("demande_prix", "Demande de prix", "Price request", ["demande de devis", "chiffrage"]),
    o("sav", "SAV", "After-sales", ["reclamation", "garantie"]),
    o("appel", "Appel", "Call", ["appel entrant"]),
    o("formulaire", "Formulaire", "Form", ["formulaire web"]),
    o("whatsapp", "WhatsApp", "WhatsApp"),
    o("email", "Email", "Email", ["mail", "courriel"]),
    o("prospect", "Prospect", "Prospect", ["lead"]),
  ]),
  canal_demande: closed("canal_demande", [
    o("telephone", "Téléphone", "Phone", ["tel", "appel"]),
    o("email", "Email", "Email", ["mail", "courriel"]),
    o("whatsapp", "WhatsApp", "WhatsApp", ["sms"]),
    o("formulaire", "Formulaire", "Form", ["formulaire web"]),
    o("site", "Site internet", "Website", ["site web", "internet"]),
    o("salon", "Salon / Foire", "Trade show", ["foire"]),
  ]),
  statut_demande: closed("statut_demande", [
    o("nouveau", "Nouvelle", "New", ["nouvelle", "a traiter"]),
    o("en_cours", "En cours", "In progress", ["en traitement", "qualifiee"]),
    o("converti", "Convertie", "Converted", ["convertie", "gagnee", "transformee"]),
    o("perdu", "Perdue", "Lost", ["perdue", "abandonnee", "sans suite"]),
  ]),
  priorite_demande: closed("priorite_demande", [
    o("basse", "Basse", "Low", ["faible", "low"]),
    o("normale", "Normale", "Normal", ["normal", "moyenne", "medium"]),
    o("haute", "Haute", "High", ["urgente", "urgent", "high", "critique"]),
  ]),
  statut_commande: closed("statut_commande", [
    o("brouillon", "Brouillon", "Draft"),
    o("envoyee", "Envoyée", "Sent", ["envoye", "transmise", "passee"]),
    o("confirmee", "Confirmée", "Confirmed", ["confirme", "acceptee"]),
    o("livree", "Livrée", "Delivered", ["livre", "receptionnee", "recue"]),
    o("annulee", "Annulée", "Cancelled", ["annule"]),
  ]),
  categorie_depense: closed("categorie_depense", [
    o("materiaux", "Matériaux", "Materials", ["fournitures", "achat materiaux"]),
    o("sous_traitance", "Sous-traitance", "Subcontracting", ["sous traitance", "st"]),
    o("location", "Location", "Rental", ["location materiel", "location engin"]),
    o("carburant", "Carburant", "Fuel", ["essence", "gasoil", "peage"]),
    o("frais", "Frais généraux", "Overheads", ["frais generaux", "repas", "hotel", "assurance"]),
    o("autre", "Autre", "Other"),
  ]),
  statut_depense: closed("statut_depense", [
    o("a_payer", "À payer", "To pay", ["a payer", "due", "en attente"]),
    o("payee", "Payée", "Paid", ["paye", "reglee", "regle"]),
    o("en_retard", "En retard", "Overdue", ["impayee", "retard"]),
  ]),
  methode_paiement: closed("methode_paiement", [
    o("virement", "Virement", "Bank transfer", ["vir", "sepa"]),
    o("cheque", "Chèque", "Cheque", ["chq"]),
    o("especes", "Espèces", "Cash", ["cash", "liquide"]),
    o("cb", "Carte bancaire", "Card", ["carte", "carte bleue"]),
    o("prelevement", "Prélèvement", "Direct debit", ["prelevement automatique"]),
  ]),
  statut_paiement: closed("statut_paiement", [
    o("recu", "Reçu", "Received", ["encaisse", "credite"]),
    o("en_attente", "En attente", "Pending", ["annonce", "a encaisser"]),
    o("rejete", "Rejeté", "Rejected", ["impaye", "rejet", "sans provision"]),
  ]),
  type_reserve: closed("type_reserve", [
    o("reserve", "Réserve", "Snag", ["reserve de reception"]),
    o("malfacon", "Malfaçon", "Defect", ["defaut", "mal fait"]),
    o("incident", "Incident", "Incident", ["accident", "sinistre"]),
    o("litige", "Litige", "Dispute", ["conflit", "contentieux"]),
    o("point_bloquant", "Point bloquant", "Blocker", ["blocage", "bloquant"]),
  ]),
  gravite_reserve: closed("gravite_reserve", [
    o("mineure", "Mineure", "Minor", ["faible", "cosmetique"]),
    o("normale", "Normale", "Normal", ["moyenne"]),
    o("majeure", "Majeure", "Major", ["grave", "importante"]),
    o("bloquante", "Bloquante", "Blocking", ["critique", "urgente"]),
  ]),
  statut_reserve: closed("statut_reserve", [
    o("ouverte", "Ouverte", "Open", ["ouvert", "constatee", "a traiter"]),
    o("en_cours", "En cours", "In progress", ["en traitement"]),
    o("levee", "Levée", "Lifted", ["levee", "resolue", "corrigee", "close"]),
    o("annulee", "Annulée", "Cancelled", ["annule", "sans suite"]),
  ]),
  type_lot: closed("type_lot", [
    o("preparation", "Préparation", "Preparation", ["installation de chantier"]),
    o("demolition", "Démolition", "Demolition", ["depose", "curage"]),
    o("gros_oeuvre", "Gros œuvre", "Structural work", ["maconnerie", "beton"]),
    o("plomberie", "Plomberie", "Plumbing", ["sanitaire", "cvc"]),
    o("electricite", "Électricité", "Electrical", ["elec", "electrique"]),
    o("platrerie", "Plâtrerie / Cloisons", "Plasterboard", ["placo", "cloisons", "isolation"]),
    o("peinture", "Peinture", "Painting", ["finitions peinture"]),
    o("carrelage", "Carrelage", "Tiling", ["faience", "sols"]),
    o("menuiserie", "Menuiserie", "Joinery", ["fenetres", "portes"]),
    o("finition", "Finitions", "Finishing", ["finitions"]),
    o("reception", "Réception", "Handover", ["livraison", "pv"]),
    o("sav", "SAV", "After-sales", ["garantie"]),
    o("lot", "Autre lot", "Other phase", ["divers"]),
  ]),
  statut_lot: closed("statut_lot", [
    o("a_faire", "À faire", "To do", ["a faire", "non demarre", "prevu"]),
    o("en_cours", "En cours", "In progress", ["demarre"]),
    o("termine", "Terminé", "Completed", ["fini", "acheve"]),
    o("bloque", "Bloqué", "Blocked", ["en attente", "arrete"]),
    o("receptionne", "Réceptionné", "Handed over", ["receptionne", "livre", "valide"]),
  ]),
  type_rappel: closed("type_rappel", [
    o("rappel", "Rappel", "Reminder", ["memo", "note"]),
    o("relance", "Relance", "Follow-up", ["relancer"]),
    o("echeance", "Échéance", "Due date", ["date limite"]),
    o("maintenance", "Maintenance", "Maintenance", ["entretien"]),
    o("rdv", "Rendez-vous", "Appointment", ["rendez vous", "visite"]),
    o("expiration", "Expiration", "Expiry", ["fin de validite", "perime"]),
  ]),
  statut_rappel: closed("statut_rappel", [
    o("a_faire", "À faire", "To do", ["a faire", "en attente"]),
    o("fait", "Fait", "Done", ["termine", "traite"]),
    o("reporte", "Reporté", "Postponed", ["decale", "repousse"]),
    o("annule", "Annulé", "Cancelled", ["abandonne"]),
  ]),
  canal_message: closed("canal_message", [
    o("email", "Email", "Email", ["mail", "courriel", "gmail"]),
    o("sms", "SMS", "SMS", ["texto"]),
    o("whatsapp", "WhatsApp", "WhatsApp", ["wa"]),
    o("interne", "Note interne", "Internal note", ["interne"]),
    o("note_appel", "Note d'appel", "Call note", ["appel", "telephone"]),
    o("autre", "Autre", "Other"),
  ]),
  direction_message: closed("direction_message", [
    o("sortant", "Sortant", "Outgoing", ["envoye", "emis"]),
    o("entrant", "Entrant", "Incoming", ["recu"]),
    o("interne", "Interne", "Internal", ["note"]),
  ]),
  statut_message: closed("statut_message", [
    o("brouillon", "Brouillon", "Draft"),
    o("a_valider", "À valider", "To approve", ["a valider", "en attente de validation"]),
    o("envoye", "Envoyé", "Sent", ["envoyee", "transmis"]),
    o("recu", "Reçu", "Received", ["recue"]),
    o("echec", "Échec", "Failed", ["erreur", "non delivre"]),
    o("archive", "Archivé", "Archived", ["archivee"]),
  ]),
  source_note: closed("source_note", [
    o("manuel", "Saisie manuelle", "Manual", ["manuelle", "clavier"]),
    o("vocal", "Dictée vocale", "Voice", ["vocale", "dictee", "audio"]),
    o("ia", "Générée par l'IA", "AI", ["copilote", "assistant"]),
    o("import", "Import", "Import", ["csv", "importe"]),
    o("autre", "Autre", "Other"),
  ]),
  type_validation: closed("type_validation", [
    o("acceptation_devis", "Acceptation de devis", "Quote acceptance", ["signature devis", "bon pour accord"]),
    o("validation_facture", "Validation de facture", "Invoice approval", ["bon a payer"]),
    o("signature_pv", "Signature de PV", "Handover sign-off", ["pv de reception", "proces verbal"]),
    o("signature_intervention", "Signature d'intervention", "Job sign-off", ["bon d'intervention"]),
    o("approbation_document", "Approbation de document", "Document approval", ["validation document"]),
    o("validation_reserve", "Levée de réserve", "Snag approval", ["validation reserve"]),
    o("autre", "Autre", "Other"),
  ]),
  statut_validation: closed("statut_validation", [
    o("en_attente", "En attente", "Pending", ["a valider", "envoye"]),
    o("approuve", "Approuvé", "Approved", ["valide", "accepte", "ok"]),
    o("refuse", "Refusé", "Rejected", ["rejete", "non valide"]),
    o("signe", "Signé", "Signed", ["signature recue"]),
    o("expire", "Expiré", "Expired", ["perime", "caduc"]),
    o("annule", "Annulé", "Cancelled", ["abandonne"]),
  ]),
};

// ── QUEL CHAMP PARLE QUEL VOCABULAIRE ────────────────────────────────────────
// Clé : `entite.champ`. Tout champ absent d'ici reste du TEXTE LIBRE (nom, adresse,
// notes, référence, n° de série… — là où la liberté est légitime).

export const FIELD_VOCAB: Record<string, string> = {
  // Employés — le cœur du problème : un agent vise « mes chefs d'équipe ».
  "employees.role": "role_employe",
  "employees.corps_metier": "corps_metier",
  "employees.statut": "statut_employe",

  "clients.type": "type_client",
  "clients.statut": "statut_client",
  "clients.source": "source_prospect",

  "chantiers.statut": "statut_chantier",

  "suppliers.categorie": "categorie_fournisseur",
  "suppliers.type": "type_fournisseur",
  "suppliers.specialite": "specialite",

  "documents.type": "type_document",
  "documents.statut": "statut_document",

  "materials.categorie": "categorie_materiau",
  "materials.unite": "unite",
  "materials.statut": "statut_materiau",

  "equipment.type": "type_equipement",
  "equipment.statut": "statut_equipement",

  "interventions.type": "type_intervention",
  "interventions.statut": "statut_intervention",

  "tasks.status": "statut_tache",
  "tasks.priority": "priorite_tache",

  // NB : `taux_tva` n'est PAS ici. C'est un NOMBRE, pas une catégorie — l'enfermer
  // dans une liste fermée 20|10|5,5 revenait à refuser 21 % en Belgique (400 au
  // serveur). Il est validé comme un nombre, plus bas (NUMERIC_FIELDS), et ses
  // valeurs proposées viennent du pays de l'entreprise (lib/tva.ts).
  "catalogue.type": "type_catalogue",
  "catalogue.unite": "unite",
  "catalogue.corps_metier": "corps_metier",
  "catalogue.prix_source": "prix_source",
  "catalogue.mode_tarif": "mode_tarif",

  "devis.statut": "statut_devis",

  "factures.type": "type_facture",
  "factures.statut": "statut_facture",

  "lignes.unite": "unite",
  "lignes.origine_prix": "origine_prix",

  "pointages.type": "type_pointage",

  "contrats.type": "type_contrat",
  "contrats.periodicite": "periodicite",
  "contrats.statut": "statut_contrat",

  "parc_installe.type": "type_parc",

  "sites.type": "type_site",

  "demandes.type": "type_demande",
  "demandes.canal": "canal_demande",
  "demandes.statut": "statut_demande",
  "demandes.priorite": "priorite_demande",
  "demandes.source": "source_prospect",

  "commandes.statut": "statut_commande",

  "depenses.categorie": "categorie_depense",
  "depenses.statut": "statut_depense",

  "paiements.methode": "methode_paiement",
  "paiements.statut": "statut_paiement",

  "reserves.type": "type_reserve",
  "reserves.gravite": "gravite_reserve",
  "reserves.statut": "statut_reserve",

  "lots.type": "type_lot",
  "lots.statut": "statut_lot",

  "rappels.type": "type_rappel",
  "rappels.statut": "statut_rappel",

  "messages.canal": "canal_message",
  "messages.direction": "direction_message",
  "messages.statut": "statut_message",

  "notes.source": "source_note",

  "validations.type": "type_validation",
  "validations.statut": "statut_validation",
};

// ── Index de résolution (construit une fois) ─────────────────────────────────
// Pour chaque vocabulaire : clé normalisée → valeur canonique. On indexe la valeur
// elle-même, son libellé FR, son libellé EN et tous ses alias.

const INDEX: Record<string, Map<string, string>> = {};

function indexOf(vocabId: string): Map<string, string> {
  const cached = INDEX[vocabId];
  if (cached) return cached;
  const map = new Map<string, string>();
  const vocab = VOCABS[vocabId];
  if (!vocab) return map;
  for (const opt of vocab.options) {
    const keys = [opt.value, opt.label, opt.en ?? "", ...(opt.aliases ?? [])];
    for (const k of keys) {
      const s = slugify(k);
      if (!s) continue;
      // Première occurrence gagne : une option ne peut pas voler l'alias d'une autre.
      if (!map.has(s)) map.set(s, opt.value);
      const sing = singular(s);
      if (!map.has(sing)) map.set(sing, opt.value);
    }
  }
  INDEX[vocabId] = map;
  return map;
}

export function vocabFor(entity: string, field: string): Vocab | null {
  const id = FIELD_VOCAB[`${entity}.${field}`];
  return id ? (VOCABS[id] ?? null) : null;
}

/** Les valeurs canoniques d'un vocabulaire (alimente `options` des formulaires). */
export function vocabValues(vocabId: string): string[] {
  return (VOCABS[vocabId]?.options ?? []).map((o2) => o2.value);
}

/** Libellé affichable d'une valeur (gère la précision « autre:carreleur »). */
export function vocabLabel(vocabId: string, value: string, locale: Locale = "fr"): string {
  const vocab = VOCABS[vocabId];
  if (!vocab) return value;
  const [base, precision] = splitAutre(value);
  const opt = vocab.options.find((x) => x.value === base);
  const label = opt ? (locale === "en" ? (opt.en ?? opt.label) : opt.label) : base.replace(/_/g, " ");
  if (!precision) return label;
  return `${locale === "en" ? "Other" : "Autre"} (${precision.replace(/_/g, " ")})`;
}

/** « autre:carreleur_mosaiste » → ["autre", "carreleur_mosaiste"]. */
export function splitAutre(value: string): [string, string | null] {
  const i = value.indexOf(":");
  if (i === -1) return [value, null];
  return [value.slice(0, i), value.slice(i + 1) || null];
}

// ── CHAMPS NUMÉRIQUES BORNÉS (taux, pourcentages) ────────────────────────────
//
// Un taux de TVA n'est PAS une catégorie : c'est un nombre. L'avoir enfermé dans une
// liste fermée (20 | 10 | 5,5) revenait à REFUSER 21 % en Belgique — alors que le
// produit s'y vend. On valide donc ce qu'il faut valider : que c'est bien un nombre,
// dans une plage plausible. Les taux PROPOSÉS, eux, dépendent du pays (lib/tva.ts).
//
// Au passage, ça absorbe les écritures sales du LLM et des imports : « 20 % », « 5,5 »,
// « 20% » deviennent 20, 5.5, 20.

export const NUMERIC_FIELDS: Record<string, { min: number; max: number; libelle: string }> = {
  "catalogue.taux_tva": { min: 0, max: 30, libelle: "taux de TVA" },
  "lignes.taux_tva": { min: 0, max: 30, libelle: "taux de TVA" },
  "catalogue.marge_cible_pct": { min: 0, max: 500, libelle: "marge cible" },
  "lignes.remise_pct": { min: 0, max: 100, libelle: "remise" },
  "lignes.confiance_match": { min: 0, max: 1, libelle: "confiance de correspondance" },
  "devis.acompte_pct": { min: 0, max: 100, libelle: "acompte" },
  "chantiers.avancement": { min: 0, max: 100, libelle: "avancement" },
  "lots.avancement": { min: 0, max: 100, libelle: "avancement" },
};

/** « 20 % » → 20 · « 5,5 » → 5.5 · « 1 234,50 » → 1234.5 · « abc » → null. */
function parseNombre(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const t = String(raw)
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .replace(/ /g, "")
    .replace(",", ".");
  if (!t || !/^-?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ── LA fonction : normaliser une valeur avant écriture ───────────────────────

export type NormalizeResult =
  | { ok: true; value: unknown; changed: boolean }
  | { ok: false; raw: string; vocabId: string; suggestions: string[]; reason?: string };

/**
 * Normalise UNE valeur de champ.
 *   - champ numérique borné → coercé en nombre, refusé s'il sort de la plage,
 *   - pas de vocabulaire pour ce champ → passe telle quelle (texte libre légitime),
 *   - vide/null → passe (l'obligation de saisie est gérée ailleurs),
 *   - reconnue (valeur, libellé ou alias, à la casse/accent/particule près) → CANONISÉE,
 *   - « autre: précision libre » → conservée (canonique `autre` + la précision),
 *   - inconnue sur un vocabulaire fermé → REFUSÉE, avec les 5 valeurs les plus proches.
 */
export function normalizeFieldValue(entity: string, field: string, raw: unknown): NormalizeResult {
  if (raw == null || raw === "") return { ok: true, value: raw, changed: false };

  const numDef = NUMERIC_FIELDS[`${entity}.${field}`];
  if (numDef) {
    const n = parseNombre(raw);
    if (n === null) {
      return {
        ok: false,
        raw: String(raw),
        vocabId: "",
        suggestions: [],
        reason: `« ${String(raw)} » n'est pas un nombre valide pour « ${numDef.libelle} ».`,
      };
    }
    if (n < numDef.min || n > numDef.max) {
      return {
        ok: false,
        raw: String(raw),
        vocabId: "",
        suggestions: [],
        reason: `${numDef.libelle} hors plage : ${n} (attendu entre ${numDef.min} et ${numDef.max}).`,
      };
    }
    return { ok: true, value: n, changed: n !== raw };
  }

  const vocab = vocabFor(entity, field);
  if (!vocab) return { ok: true, value: raw, changed: false };

  const text = String(raw).trim();
  if (!text) return { ok: true, value: raw, changed: false };

  // Cas « autre: précision » (l'option « Autre (préciser) » du formulaire).
  const [head, tail] = splitAutre(text);
  if (tail && indexOf(vocab.id).get(slugify(head)) === "autre") {
    const canon = `autre:${slugify(tail)}`;
    return { ok: true, value: canon, changed: canon !== text };
  }

  const idx = indexOf(vocab.id);
  const hit = idx.get(slugify(text)) ?? idx.get(singular(slugify(text)));
  if (hit) return { ok: true, value: hit, changed: hit !== text };

  // Rattrapage : la saisie CONTIENT un libellé connu (« Dépannage électrique »
  // → depannage). On ne le fait que si UNE SEULE option matche : sinon c'est
  // ambigu, et deviner serait pire que refuser.
  const slug = slugify(text);
  const contained = vocab.options.filter((opt) => {
    const keys = [opt.value, opt.label, opt.en ?? "", ...(opt.aliases ?? [])].map(slugify).filter((k) => k.length >= 3);
    return keys.some((k) => slug === k || slug.startsWith(`${k}_`) || slug.endsWith(`_${k}`) || slug.includes(`_${k}_`));
  });
  if (contained.length === 1) return { ok: true, value: contained[0].value, changed: true };

  if (!vocab.closed) return { ok: true, value: slug, changed: slug !== text };

  return { ok: false, raw: text, vocabId: vocab.id, suggestions: nearest(vocab, slug) };
}

/** Les valeurs les plus proches d'une saisie inconnue (aide au diagnostic). */
function nearest(vocab: Vocab, slug: string): string[] {
  const scored = vocab.options
    .map((opt) => {
      const keys = [opt.value, opt.label, opt.en ?? "", ...(opt.aliases ?? [])].map(slugify);
      const best = Math.max(...keys.map((k) => commonPrefix(k, slug)));
      return { value: opt.value, score: best };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.value);
  return scored.length ? scored : vocab.options.slice(0, 5).map((x) => x.value);
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export type FieldError = { field: string; raw: string; suggestions: string[]; reason?: string };

/**
 * Normalise TOUS les champs à vocabulaire d'une fiche, avant insert/update.
 * Renvoie la fiche corrigée + la liste des valeurs refusées (vocabulaire fermé).
 * Ne touche à aucun autre champ.
 */
export function normalizeRecordValues(
  entity: string,
  values: Record<string, unknown>
): { values: Record<string, unknown>; errors: FieldError[]; fixed: string[] } {
  const out: Record<string, unknown> = { ...values };
  const errors: FieldError[] = [];
  const fixed: string[] = [];
  for (const [field, raw] of Object.entries(values)) {
    const res = normalizeFieldValue(entity, field, raw);
    if (res.ok) {
      out[field] = res.value;
      if (res.changed) fixed.push(field);
    } else {
      errors.push({ field, raw: res.raw, suggestions: res.suggestions, reason: res.reason });
    }
  }
  return { values: out, errors, fixed };
}

/** Message d'erreur lisible (renvoyé à l'app / au SDK / à l'agent qui a écrit). */
export function fieldErrorMessage(entity: string, e: FieldError, locale: Locale = "fr"): string {
  // Un refus NUMÉRIQUE porte déjà son motif (« hors plage », « pas un nombre ») :
  // proposer des « valeurs proches » n'aurait aucun sens.
  if (e.reason) return e.reason;
  const vocab = vocabFor(entity, e.field);
  const sugg = e.suggestions.map((v) => (vocab ? vocabLabel(vocab.id, v, locale) : v)).join(", ");
  if (locale === "en") {
    return `«${e.raw}» is not a valid value for “${e.field}”. Closest options: ${sugg}.`;
  }
  return `« ${e.raw} » n'est pas une valeur valide pour « ${e.field} ». Valeurs proches : ${sugg}.`;
}

// ── LANGAGE NATUREL → VALEURS CANONIQUES (le pont pour les agents) ───────────

/**
 * NOM DE PERSONNE → CORPS DE MÉTIER. Table VOLONTAIREMENT séparée des alias du
 * vocabulaire : pour cibler des GENS, seul un nom de personne compte.
 *
 * Sans cette séparation, « envoie le planning de maintenance à l'équipe » matcherait
 * l'alias d'activité « maintenance » (→ maintenance_contrats) et l'agent filtrerait
 * sur un corps de métier que personne n'a : envoi à ZÉRO destinataire. Un mot qui
 * décrit un TRAVAIL ne doit jamais désigner un DESTINATAIRE.
 */
export const METIER_PAR_PERSONNE: Record<string, string> = {
  macon: "maconnerie",
  betonneur: "beton_arme",
  coffreur: "coffrage",
  ferrailleur: "ferraillage",
  demolisseur: "demolition",
  terrassier: "terrassement",
  charpentier: "charpente",
  couvreur: "couverture",
  zingueur: "zinguerie",
  electricien: "electricite_generale",
  domoticien: "domotique",
  plombier: "plomberie",
  chauffagiste: "chauffage",
  frigoriste: "climatisation",
  menuisier: "menuiserie_interieure",
  agenceur: "menuiserie_interieure",
  serrurier: "serrurerie",
  metallier: "metallerie",
  ferronnier: "metallerie",
  platrier: "platrerie",
  plaquiste: "platrerie",
  cloisonneur: "cloisons",
  carreleur: "carrelage_faience",
  mosaiste: "carrelage_faience",
  solier: "sols_souples",
  moquettiste: "sols_souples",
  parqueteur: "parquet",
  peintre: "peinture",
  decorateur: "papier_peint_decoration",
  facadier: "ravalement",
  ravaleur: "ravalement",
  etancheur: "etancheite",
  bardeur: "bardage",
  paysagiste: "paysagisme",
  jardinier: "paysagisme",
  paveur: "pavage_terrasses",
  pisciniste: "piscines",
  depanneur: "depannage_sav",
};

/**
 * « envoie un email à mes électriciens » → [electricite_generale].
 * Ne reconnaît QUE des noms de personne (voir METIER_PAR_PERSONNE).
 */
export function matchTradeInText(text: string): string[] {
  const hay = `_${singular(slugify(text))}_`;
  const hits = new Set<string>();
  for (const [personne, metier] of Object.entries(METIER_PAR_PERSONNE)) {
    if (hay.includes(`_${singular(personne)}_`)) hits.add(metier);
  }
  return [...hits];
}

/**
 * « envoie le planning à mes chefs d'équipe » → [chef_equipe] sur role_employe.
 * On cherche les alias du vocabulaire DANS la phrase (le pluriel et les accents
 * sont neutralisés par slugify). C'est la MÊME table d'alias que celle qui a servi
 * à normaliser la fiche : ce qui a été saisi et ce qui est demandé se rencontrent.
 */
export function matchVocabInText(vocabId: string, text: string): string[] {
  const vocab = VOCABS[vocabId];
  if (!vocab) return [];
  const hay = `_${singular(slugify(text))}_`;
  const hits: string[] = [];
  for (const opt of vocab.options) {
    if (opt.value === "autre") continue;
    const keys = [opt.value, opt.label, ...(opt.aliases ?? [])]
      .map((k) => singular(slugify(k)))
      .filter((k) => k.length >= 4);
    if (keys.some((k) => hay.includes(`_${k}_`))) hits.push(opt.value);
  }
  return [...new Set(hits)];
}
