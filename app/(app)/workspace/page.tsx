"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Dropdown } from "@/components/dropdown";
import {
  Boxes,
  HardHat,
  Users,
  UserCog,
  FileText,
  Hammer,
  Package,
  Wrench,
  Truck,
  ListChecks,
  AppWindow,
  GitBranch,
  MessageSquare,
  Search,
  ArrowLeft,
  X,
  Loader2,
  ChevronRight,
  Sparkles,
  Upload,
  Check,
  AlertTriangle,
  ArrowRight,
  Trash2,
  Download,
  FileSpreadsheet,
  MapPin,
  Tags,
  FileSignature,
  Receipt,
  Clock,
  RefreshCw,
  Gauge,
  Plus,
  Pencil,
  Inbox,
  ShoppingCart,
  Wallet,
  Banknote,
  Bell,
  StickyNote,
  PenLine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ENTITIES, FORM_FIELDS, RELATION_DISPLAY, fieldLabel, fieldPlaceholder, optionLabel, type FormField } from "@/lib/data-entities";
import { VOCABS, FIELD_VOCAB, vocabLabel, splitAutre, slugify } from "@/lib/vocabulaires";
import { useSession } from "@/components/session-provider";
import { useT, useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";
import { AddToCalendar } from "@/components/add-to-calendar";
import { getCurrentPosition, gpsLine, type CalendarEvent } from "@/lib/integrations";

// ─────────────────────────────────────────────────────────────────────────────
// Workspace — la mémoire de l'entreprise.
// Toutes les entités partagées (isolées par tenant + RLS) lues via /api/data.
// Rien n'est un module ERP : ce sont des vues sur une mémoire reliée.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type DataMap = Record<string, Row[]>;

type EntityMeta = {
  label: string;
  icon: LucideIcon;
  accent: string; // classe de teinte pour l'icône
  title: (r: Row) => string;
  subtitle: (r: Row) => string;
  search: (r: Row) => string;
  detailFields: string[];
};

/**
 * Libellé d'une valeur à vocabulaire (`chef_equipe` → « Chef d'équipe »).
 * La base stocke le canonique, l'écran montre l'humain. Sans vocabulaire sur ce
 * champ, la valeur passe telle quelle.
 */
function lbl(entity: string, field: string, raw: unknown): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  const vocabId = FIELD_VOCAB[`${entity}.${field}`];
  return vocabId ? vocabLabel(vocabId, String(raw)) : String(raw);
}

const CHANTIER_STATUT: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "En attente", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  en_cours: { label: "En cours", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  en_retard: { label: "En retard", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  termine: { label: "Terminé", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  annule: { label: "Annulé", cls: "bg-slate-100 text-slate-400 border-slate-200" },
};

const joinTruthy = (...xs: (string | null | undefined)[]) => xs.filter(Boolean).join(" · ");

const ENTITY_META: Record<string, EntityMeta> = {
  chantiers: {
    label: "Chantiers",
    icon: HardHat,
    accent: "text-violet-600 bg-violet-50",
    title: (r) => r.nom ?? "Chantier",
    subtitle: (r) => joinTruthy(r.ville, CHANTIER_STATUT[r.statut]?.label ?? r.statut),
    search: (r) => joinTruthy(r.nom, r.ville, r.adresse, r.description),
    detailFields: ["adresse", "ville", "code_postal", "budget", "avancement", "date_debut", "date_fin_prevue", "description"],
  },
  clients: {
    label: "Clients",
    icon: Users,
    accent: "text-sky-600 bg-sky-50",
    title: (r) => r.nom ?? "Client",
    subtitle: (r) => joinTruthy(r.type, r.ville),
    search: (r) => joinTruthy(r.nom, r.email, r.ville, r.siret),
    detailFields: ["type", "email", "tel", "adresse", "ville", "code_postal", "siret", "notes"],
  },
  employees: {
    label: "Employés",
    icon: UserCog,
    accent: "text-emerald-600 bg-emerald-50",
    title: (r) => joinTruthy(r.prenom, r.nom) || "Employé",
    // La valeur STOCKÉE est canonique (chef_equipe) ; on affiche toujours le libellé.
    subtitle: (r) => joinTruthy(lbl("employees", "role", r.role), lbl("employees", "corps_metier", r.corps_metier)),
    search: (r) => joinTruthy(r.prenom, r.nom, r.role, r.corps_metier, r.email),
    detailFields: ["role", "corps_metier", "email", "tel", "date_embauche", "taux_horaire", "statut", "notes"],
  },
  documents: {
    label: "Documents",
    icon: FileText,
    accent: "text-indigo-600 bg-indigo-50",
    title: (r) => r.nom ?? "Document",
    subtitle: (r) => joinTruthy(r.type, r.statut),
    search: (r) => joinTruthy(r.nom, r.type, r.notes),
    detailFields: ["type", "statut", "expires_at", "url", "notes"],
  },
  interventions: {
    label: "Interventions",
    icon: Hammer,
    accent: "text-amber-600 bg-amber-50",
    title: (r) => r.type ?? "Intervention",
    subtitle: (r) => joinTruthy(r.statut, r.date_prevue),
    search: (r) => joinTruthy(r.type, r.description, r.rapport),
    detailFields: ["statut", "date_prevue", "date_reelle", "duree_heures", "description", "rapport"],
  },
  materials: {
    label: "Matériaux",
    icon: Package,
    accent: "text-orange-600 bg-orange-50",
    title: (r) => r.nom ?? "Matériau",
    subtitle: (r) => joinTruthy(r.categorie, r.statut),
    search: (r) => joinTruthy(r.nom, r.reference, r.categorie),
    detailFields: ["reference", "categorie", "quantite", "unite", "statut", "prix_achat_ht", "prix_vente_ht", "seuil_alerte", "date_retour", "notes"],
  },
  equipment: {
    label: "Équipement",
    icon: Wrench,
    accent: "text-cyan-600 bg-cyan-50",
    title: (r) => r.nom ?? "Équipement",
    subtitle: (r) => joinTruthy(r.marque, r.statut),
    search: (r) => joinTruthy(r.nom, r.reference, r.marque, r.numero_serie),
    detailFields: ["reference", "type", "marque", "numero_serie", "statut", "date_achat", "prochain_controle", "notes"],
  },
  suppliers: {
    label: "Fournisseurs",
    icon: Truck,
    accent: "text-rose-600 bg-rose-50",
    title: (r) => r.nom ?? "Fournisseur",
    subtitle: (r) => joinTruthy(lbl("suppliers", "categorie", r.categorie), lbl("suppliers", "specialite", r.specialite), r.ville),
    search: (r) => joinTruthy(r.nom, r.email, r.ville, r.siret, r.specialite),
    detailFields: ["categorie", "specialite", "type", "email", "tel", "adresse", "ville", "code_postal", "siret", "assurance_decennale", "assurance_expire", "notes"],
  },
  tasks: {
    label: "Tâches",
    icon: ListChecks,
    accent: "text-fuchsia-600 bg-fuchsia-50",
    title: (r) => r.title ?? "Tâche",
    subtitle: (r) => joinTruthy(r.status, r.priority),
    search: (r) => joinTruthy(r.title, r.description),
    detailFields: ["status", "priority", "due_date", "done_at", "description"],
  },
  catalogue: {
    label: "Catalogue",
    icon: Tags,
    accent: "text-teal-600 bg-teal-50",
    title: (r) => r.designation ?? "Prestation",
    subtitle: (r) => joinTruthy(r.type, r.prix_vente_ht != null ? `${r.prix_vente_ht} €` : null),
    search: (r) => joinTruthy(r.designation, r.reference, r.corps_metier, r.type),
    detailFields: ["type", "reference", "unite", "prix_achat_ht", "prix_vente_ht", "taux_tva", "corps_metier", "notes"],
  },
  devis: {
    label: "Devis",
    icon: FileSignature,
    accent: "text-purple-600 bg-purple-50",
    title: (r) => r.numero ?? "Devis",
    subtitle: (r) => joinTruthy(r.statut, r.montant_ttc != null ? `${r.montant_ttc} € TTC` : null),
    search: (r) => joinTruthy(r.numero, r.statut, r.conditions, r.notes),
    detailFields: ["numero", "statut", "date_devis", "date_validite", "montant_ht", "montant_tva", "montant_ttc", "conditions", "notes"],
  },
  factures: {
    label: "Factures",
    icon: Receipt,
    accent: "text-green-600 bg-green-50",
    title: (r) => r.numero ?? "Facture",
    subtitle: (r) => joinTruthy(r.type, r.statut, r.montant_ttc != null ? `${r.montant_ttc} € TTC` : null),
    search: (r) => joinTruthy(r.numero, r.type, r.statut, r.notes),
    detailFields: ["numero", "type", "statut", "date_facture", "date_echeance", "montant_ht", "montant_tva", "montant_ttc", "montant_paye", "notes"],
  },
  pointages: {
    label: "Pointage",
    icon: Clock,
    accent: "text-blue-600 bg-blue-50",
    title: (r) => (r.heures != null ? `${r.heures} h` : "Pointage"),
    subtitle: (r) => joinTruthy(r.type, r.date_pointage),
    search: (r) => joinTruthy(r.type, r.date_pointage, r.notes),
    detailFields: ["date_pointage", "heures", "type", "valide", "notes"],
  },
  contrats: {
    label: "Contrats",
    icon: RefreshCw,
    accent: "text-amber-600 bg-amber-50",
    title: (r) => r.reference ?? "Contrat d'entretien",
    subtitle: (r) => joinTruthy(r.type, r.periodicite, r.statut),
    search: (r) => joinTruthy(r.reference, r.type, r.notes),
    detailFields: ["reference", "type", "montant", "periodicite", "date_debut", "date_fin", "prochaine_echeance", "statut", "notes"],
  },
  parc_installe: {
    label: "Parc installé",
    icon: Gauge,
    accent: "text-red-600 bg-red-50",
    title: (r) => joinTruthy(r.marque, r.modele) || r.type || "Équipement",
    subtitle: (r) => joinTruthy(r.type, r.localisation),
    search: (r) => joinTruthy(r.marque, r.modele, r.numero_serie, r.type, r.localisation),
    detailFields: ["type", "marque", "modele", "numero_serie", "localisation", "date_pose", "date_garantie", "dernier_entretien", "prochain_entretien", "notes"],
  },
  sites: {
    label: "Sites / Adresses",
    icon: MapPin,
    accent: "text-teal-600 bg-teal-50",
    title: (r) => r.nom ?? "Site",
    subtitle: (r) => joinTruthy(r.type, r.ville),
    search: (r) => joinTruthy(r.nom, r.adresse, r.ville, r.code_postal, r.contact_nom),
    detailFields: ["type", "adresse", "ville", "code_postal", "contact_nom", "contact_tel", "notes"],
  },
  demandes: {
    label: "Demandes",
    icon: Inbox,
    accent: "text-violet-600 bg-violet-50",
    title: (r) => r.titre ?? "Demande",
    subtitle: (r) => joinTruthy(r.type, r.statut),
    search: (r) => joinTruthy(r.titre, r.type, r.canal, r.source, r.description),
    detailFields: ["type", "canal", "statut", "priorite", "source", "date_demande", "description"],
  },
  commandes: {
    label: "Commandes",
    icon: ShoppingCart,
    accent: "text-orange-600 bg-orange-50",
    title: (r) => r.numero ?? "Commande",
    subtitle: (r) => joinTruthy(r.statut, r.montant_ttc != null ? `${r.montant_ttc} € TTC` : null),
    search: (r) => joinTruthy(r.numero, r.statut, r.notes),
    detailFields: ["numero", "statut", "montant_ht", "montant_ttc", "date_commande", "date_livraison_prevue", "date_livraison_reelle", "notes"],
  },
  depenses: {
    label: "Dépenses",
    icon: Wallet,
    accent: "text-rose-600 bg-rose-50",
    title: (r) => (r.numero ? `Facture ${r.numero}` : "Dépense"),
    subtitle: (r) => joinTruthy(r.categorie, r.montant_ttc != null ? `${r.montant_ttc} € TTC` : null, r.statut),
    search: (r) => joinTruthy(r.numero, r.categorie, r.statut, r.notes),
    detailFields: ["numero", "categorie", "montant_ht", "montant_tva", "montant_ttc", "date_depense", "date_echeance", "statut", "notes"],
  },
  paiements: {
    label: "Paiements",
    icon: Banknote,
    accent: "text-green-600 bg-green-50",
    title: (r) => (r.montant != null ? `${r.montant} €` : "Paiement"),
    subtitle: (r) => joinTruthy(r.methode, r.date_paiement, r.statut),
    search: (r) => joinTruthy(r.reference, r.methode, r.statut, r.notes),
    detailFields: ["montant", "date_paiement", "methode", "reference", "statut", "notes"],
  },
  reserves: {
    label: "Réserves",
    icon: AlertTriangle,
    accent: "text-amber-600 bg-amber-50",
    title: (r) => r.titre ?? "Réserve",
    subtitle: (r) => joinTruthy(r.type, r.gravite, r.statut),
    search: (r) => joinTruthy(r.titre, r.type, r.description, r.notes),
    detailFields: ["type", "gravite", "statut", "date_constat", "date_resolution", "description", "notes"],
  },
  rappels: {
    label: "Rappels",
    icon: Bell,
    accent: "text-fuchsia-600 bg-fuchsia-50",
    title: (r) => r.titre ?? "Rappel",
    subtitle: (r) => joinTruthy(r.type, r.due_date, r.statut),
    search: (r) => joinTruthy(r.titre, r.type, r.notes),
    detailFields: ["type", "due_date", "statut", "notes"],
  },
  messages: {
    label: "Messages",
    icon: MessageSquare,
    accent: "text-sky-600 bg-sky-50",
    title: (r) => r.objet || joinTruthy(r.canal, r.direction) || "Message",
    subtitle: (r) => joinTruthy(r.canal, r.statut, r.date_message),
    search: (r) => joinTruthy(r.objet, r.corps, r.canal, r.destinataire),
    detailFields: ["canal", "direction", "statut", "destinataire", "expediteur", "objet", "corps", "date_message"],
  },
  notes: {
    label: "Notes",
    icon: StickyNote,
    accent: "text-yellow-700 bg-yellow-50",
    title: (r) => r.titre || (typeof r.contenu === "string" ? r.contenu.slice(0, 48) : "") || "Note",
    subtitle: (r) => joinTruthy(r.source, r.created_at),
    search: (r) => joinTruthy(r.titre, r.contenu, r.source),
    detailFields: ["source", "contenu"],
  },
  validations: {
    label: "Validations",
    icon: PenLine,
    accent: "text-indigo-600 bg-indigo-50",
    title: (r) => VALIDATION_TYPE_LABEL[String(r.type)] ?? r.type ?? "Validation",
    subtitle: (r) => joinTruthy(r.statut, r.signataire_nom, r.date_signature),
    search: (r) => joinTruthy(r.type, r.statut, r.signataire_nom, r.signataire_email, r.notes),
    detailFields: ["type", "statut", "signataire_nom", "signataire_email", "signataire_tel", "date_signature", "motif_refus", "notes"],
  },
};

// Libellés lisibles des types de validation (l'enum brut est peu parlant).
const VALIDATION_TYPE_LABEL: Record<string, string> = {
  acceptation_devis: "Acceptation de devis",
  validation_facture: "Validation de facture",
  signature_pv: "Signature de PV",
  signature_intervention: "Signature d'intervention",
  approbation_document: "Approbation de document",
  validation_reserve: "Levée de réserve",
  autre: "Validation",
};

// Les entités groupées par thème — pour une vue d'ensemble LISIBLE (sections)
// plutôt qu'un mur de tuiles à plat. ENTITY_ORDER en découle (chargement + recherche).
const ENTITY_GROUPS: { title: string; entities: string[] }[] = [
  { title: "Acteurs & sites", entities: ["clients", "sites", "chantiers", "employees"] },
  { title: "Commercial", entities: ["demandes", "devis", "factures", "paiements", "catalogue"] },
  { title: "Achats & dépenses", entities: ["commandes", "depenses", "materials", "suppliers", "equipment"] },
  { title: "Service & SAV", entities: ["interventions", "contrats", "parc_installe", "reserves", "pointages"] },
  { title: "Suivi & documents", entities: ["tasks", "rappels", "documents", "notes", "messages", "validations"] },
];
const ENTITY_ORDER = ENTITY_GROUPS.flatMap((g) => g.entities);

const FIELD_LABELS: Record<string, string> = {
  adresse: "Adresse", ville: "Ville", code_postal: "Code postal", budget: "Budget (€)",
  avancement: "Avancement", date_debut: "Début", date_fin_prevue: "Fin prévue", description: "Description",
  type: "Type", email: "Email", tel: "Téléphone", siret: "SIRET", notes: "Notes",
  role: "Rôle", corps_metier: "Corps de métier", date_embauche: "Embauche", taux_horaire: "Taux horaire (€)",
  statut: "Statut", status: "Statut", expires_at: "Expire le", url: "Lien", reference: "Référence",
  categorie: "Catégorie", quantite: "Quantité", unite: "Unité", date_retour: "Retour prévu",
  marque: "Marque", numero_serie: "N° série", date_achat: "Achat", prochain_controle: "Prochain contrôle",
  date_prevue: "Prévue le", date_reelle: "Réalisée le", duree_heures: "Durée (h)", rapport: "Rapport",
  priority: "Priorité", due_date: "Échéance", done_at: "Terminée le",
  // Couche argent + récurrent + parc installé
  designation: "Désignation", prix_achat_ht: "Prix d'achat HT (€)", prix_vente_ht: "Prix de vente HT (€)",
  taux_tva: "TVA (%)", numero: "Numéro", date_devis: "Date du devis", date_validite: "Validité",
  montant_ht: "Montant HT (€)", montant_tva: "TVA (€)", montant_ttc: "Montant TTC (€)",
  montant_paye: "Payé (€)", conditions: "Conditions", date_facture: "Date de facture", date_echeance: "Échéance",
  prix_unitaire_ht: "PU HT (€)", total_ht: "Total HT (€)", position: "Position",
  date_pointage: "Date", heures: "Heures", valide: "Validé",
  montant: "Montant (€)", periodicite: "Périodicité", date_fin: "Fin", prochaine_echeance: "Prochaine échéance",
  modele: "Modèle", localisation: "Emplacement", date_pose: "Posé le", date_garantie: "Garantie jusqu'au",
  dernier_entretien: "Dernier entretien", prochain_entretien: "Prochain entretien",
  seuil_alerte: "Seuil d'alerte", specialite: "Spécialité",
  assurance_decennale: "Assurance décennale", assurance_expire: "Assurance expire le",
  // Phase 2 — messages / notes / validations
  canal: "Canal", direction: "Sens", destinataire: "Destinataire", expediteur: "Expéditeur",
  objet: "Objet", corps: "Message", date_message: "Date", contenu: "Note", source: "Source",
  signataire_nom: "Signataire", signataire_email: "Email signataire", signataire_tel: "Tél. signataire",
  date_signature: "Signé le", motif_refus: "Motif du refus",
};

// ── Traductions EN des libellés de données (FR = dicts ci-dessus, source de vérité) ──
const CHANTIER_STATUT_EN: Record<string, string> = {
  en_attente: "Pending", en_cours: "In progress", en_retard: "Behind", termine: "Completed", annule: "Cancelled",
};
const VALIDATION_TYPE_LABEL_EN: Record<string, string> = {
  acceptation_devis: "Quote acceptance", validation_facture: "Invoice validation", signature_pv: "Report signature",
  signature_intervention: "Job signature", approbation_document: "Document approval", validation_reserve: "Snag clearance", autre: "Validation",
};
const ENTITY_GROUP_TITLE_EN: Record<string, string> = {
  "Acteurs & sites": "People & sites", "Commercial": "Sales", "Achats & dépenses": "Purchases & expenses",
  "Service & SAV": "Service & after-sales", "Suivi & documents": "Tracking & documents",
};
const ENTITY_LABEL_EN: Record<string, string> = {
  chantiers: "Job sites", clients: "Clients", employees: "Employees", documents: "Documents",
  interventions: "Jobs", materials: "Materials", equipment: "Equipment", suppliers: "Suppliers",
  tasks: "Tasks", catalogue: "Catalog", devis: "Quotes", factures: "Invoices", pointages: "Time tracking",
  contrats: "Contracts", parc_installe: "Installed base", sites: "Sites / Addresses", demandes: "Requests",
  commandes: "Orders", depenses: "Expenses", paiements: "Payments", reserves: "Snags", rappels: "Reminders",
  messages: "Messages", notes: "Notes", validations: "Validations",
};
const FIELD_LABELS_EN: Record<string, string> = {
  adresse: "Address", ville: "City", code_postal: "Postal code", budget: "Budget (€)",
  avancement: "Progress", date_debut: "Start", date_fin_prevue: "Planned end", description: "Description",
  type: "Type", email: "Email", tel: "Phone", siret: "SIRET", notes: "Notes",
  role: "Role", corps_metier: "Trade", date_embauche: "Hired", taux_horaire: "Hourly rate (€)",
  statut: "Status", status: "Status", expires_at: "Expires on", url: "Link", reference: "Reference",
  categorie: "Category", quantite: "Quantity", unite: "Unit", date_retour: "Return due",
  marque: "Brand", numero_serie: "Serial no.", date_achat: "Purchase", prochain_controle: "Next check",
  date_prevue: "Planned for", date_reelle: "Done on", duree_heures: "Duration (h)", rapport: "Report",
  priority: "Priority", due_date: "Due date", done_at: "Done on",
  designation: "Description", prix_achat_ht: "Purchase price excl. tax (€)", prix_vente_ht: "Sale price excl. tax (€)",
  taux_tva: "VAT (%)", numero: "Number", date_devis: "Quote date", date_validite: "Valid until",
  montant_ht: "Amount excl. tax (€)", montant_tva: "VAT (€)", montant_ttc: "Amount incl. tax (€)",
  montant_paye: "Paid (€)", conditions: "Terms", date_facture: "Invoice date", date_echeance: "Due date",
  prix_unitaire_ht: "Unit excl. tax (€)", total_ht: "Total excl. tax (€)", position: "Position",
  date_pointage: "Date", heures: "Hours", valide: "Validated",
  montant: "Amount (€)", periodicite: "Frequency", date_fin: "End", prochaine_echeance: "Next due date",
  modele: "Model", localisation: "Location", date_pose: "Installed on", date_garantie: "Warranty until",
  dernier_entretien: "Last service", prochain_entretien: "Next service",
  seuil_alerte: "Alert threshold", specialite: "Specialty",
  assurance_decennale: "Liability insurance", assurance_expire: "Insurance expires on",
  canal: "Channel", direction: "Direction", destinataire: "Recipient", expediteur: "Sender",
  objet: "Subject", corps: "Message", date_message: "Date", contenu: "Note", source: "Source",
  signataire_nom: "Signatory", signataire_email: "Signatory email", signataire_tel: "Signatory phone",
  date_signature: "Signed on", motif_refus: "Reason for refusal",
};

// Accès locale-aware (FR = source, EN = tables ci-dessus).
function tFieldLabel(locale: Locale, k: string): string {
  return locale === "en" ? (FIELD_LABELS_EN[k] ?? FIELD_LABELS[k] ?? k) : (FIELD_LABELS[k] ?? k);
}
function tEntityLabel(locale: Locale, key: string): string {
  return locale === "en" ? (ENTITY_LABEL_EN[key] ?? ENTITY_META[key]?.label ?? key) : (ENTITY_META[key]?.label ?? key);
}
function tGroupTitle(locale: Locale, title: string): string {
  return locale === "en" ? (ENTITY_GROUP_TITLE_EN[title] ?? title) : title;
}
function tChantierStatut(locale: Locale, statut: string): string {
  return locale === "en" ? (CHANTIER_STATUT_EN[statut] ?? CHANTIER_STATUT[statut]?.label ?? statut) : (CHANTIER_STATUT[statut]?.label ?? statut);
}
function tValidationType(locale: Locale, key: string): string {
  return locale === "en" ? (VALIDATION_TYPE_LABEL_EN[key] ?? VALIDATION_TYPE_LABEL[key] ?? key) : (VALIDATION_TYPE_LABEL[key] ?? key);
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmtDate = (v: string | null, locale: Locale = "fr") =>
  v ? new Date(v).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const fmtEUR = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(num(n));

async function listEntity(entity: string): Promise<Row[]> {
  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, action: "list", order: "created_at", ascending: false, limit: 200 }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

// ─── Petit renderer de valeur de champ ──────────────────────────────────────
function FieldRow({ k, v }: { k: string; v: unknown }) {
  const t = useT();
  const locale = useLocale();
  if (v === null || v === undefined || v === "") return null;
  const isDate = /_at$|date|expire|controle|entretien|echeance|garantie|validite|pose/.test(k) && typeof v === "string" && v.length >= 8;
  let display: React.ReactNode = String(v);
  if (k === "avancement") display = `${v}%`;
  else if (typeof v === "boolean") display = v ? t("Oui", "Yes") : t("Non", "No");
  else if (isDate) display = fmtDate(String(v), locale);
  else if (k === "url" && typeof v === "string") {
    display = (
      <a href={v} target="_blank" rel="noreferrer" className="text-violet-600 hover:underline break-all">
        {t("Ouvrir", "Open")}
      </a>
    );
  }
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[#F1F1EC] last:border-0">
      <span className="text-[12px] text-[#9A9A97] flex-shrink-0">{tFieldLabel(locale, k)}</span>
      <span className="text-[13px] text-[#0A0A0A] text-right break-words">{display}</span>
    </div>
  );
}

// ─── Synthèse financière du chantier : petites tuiles chiffrées + lignes ─────
const TIMELINE_DOT: Record<string, string> = {
  devis: "bg-violet-500",
  facture: "bg-emerald-500",
  intervention: "bg-sky-500",
  document: "bg-amber-500",
  pointage: "bg-slate-400",
};

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "rose" }) {
  const valCls = tone === "green" ? "text-emerald-600" : tone === "rose" ? "text-rose-600" : "text-[#0A0A0A]";
  return (
    <div className="rounded-xl border border-[#EDEDE9] bg-[#FCFCFB] px-3 py-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9A9A97]">{label}</p>
      <p className={`text-[16px] font-bold tabular-nums leading-tight ${valCls}`}>{value}</p>
      {sub && <p className="text-[10.5px] text-[#B4B4AF] tabular-nums">{sub}</p>}
    </div>
  );
}

function SynthLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[12px] text-[#9A9A97] flex-shrink-0">{label}</span>
      <span className="text-[12px] text-[#0A0A0A] text-right tabular-nums">{value}</span>
    </div>
  );
}

// ─── Ligne « objet relié » cliquable ────────────────────────────────────────
function RelatedItem({
  entity, row, onOpen,
}: { entity: string; row: Row; onOpen: (entity: string, id: string) => void }) {
  const meta = ENTITY_META[entity];
  const Icon = meta.icon;
  return (
    <button
      onClick={() => onOpen(entity, row.id)}
      className="group flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl hover:bg-black/[0.03] transition-colors"
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.accent}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-[#0A0A0A] truncate">{meta.title(row)}</span>
        {meta.subtitle(row) && (
          <span className="block text-[11px] text-[#9A9A97] truncate">{meta.subtitle(row)}</span>
        )}
      </span>
      <ChevronRight className="w-4 h-4 text-[#C9C9C4] group-hover:text-[#6E6E6C] flex-shrink-0" />
    </button>
  );
}

function RelatedGroup({
  label, entity, rows, onOpen,
}: { label: string; entity: string; rows: Row[]; onOpen: (entity: string, id: string) => void }) {
  const locale = useLocale();
  if (!rows.length) return null;
  // Le libellé passé (FR) sert de clé ; l'affichage dérive de l'entité (traduit).
  // Cas particulier : « Chantiers dirigés » (chef de chantier) garde sa nuance.
  const display = label === "Chantiers dirigés"
    ? (locale === "en" ? "Managed job sites" : label)
    : tEntityLabel(locale, entity);
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] px-3 mb-1">
        {display} <span className="tabular-nums">({rows.length})</span>
      </p>
      <div className="space-y-0.5">
        {rows.map((r) => <RelatedItem key={r.id} entity={entity} row={r} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

// ─── Panneau de détail (drawer) ─────────────────────────────────────────────
function DetailDrawer({
  entity, id, data, onClose, onOpen, onRefresh, onEdit,
}: {
  entity: string;
  id: string;
  data: DataMap;
  onClose: () => void;
  onOpen: (entity: string, id: string) => void;
  /** Recharge les données après une mutation faite depuis le drawer (GPS…). */
  onRefresh?: () => void;
  /** Ouvre le formulaire d'édition de cette fiche. */
  onEdit?: (entity: string, row: Row) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const meta = ENTITY_META[entity];
  const row = (data[entity] ?? []).find((r) => r.id === id);
  // Relevé GPS (interventions) : position du téléphone → rapport.
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  // Transformations 1-clic (devis→chantier, demande→devis, note→tâche/réserve).
  const [txBusy, setTxBusy] = useState(false);
  const [txMsg, setTxMsg] = useState<string | null>(null);

  const related = useMemo(() => {
    if (!row) return null;
    const linkedTo = (e: string, fk: string) => (data[e] ?? []).filter((r) => r[fk] === row.id);
    const find = (e: string, id: unknown) => (id ? (data[e] ?? []).find((r) => r.id === id) ?? null : null);
    if (entity === "chantiers") {
      const actors: { entity: string; row: Row }[] = [];
      const cl = find("clients", row.client_id);
      const chef = find("employees", row.chef_chantier_id);
      if (cl) actors.push({ entity: "clients", row: cl });
      if (chef) actors.push({ entity: "employees", row: chef });
      return {
        actors,
        groups: [
          { label: "Devis", entity: "devis", rows: linkedTo("devis", "chantier_id") },
          { label: "Factures", entity: "factures", rows: linkedTo("factures", "chantier_id") },
          { label: "Documents", entity: "documents", rows: linkedTo("documents", "chantier_id") },
          { label: "Interventions", entity: "interventions", rows: linkedTo("interventions", "chantier_id") },
          { label: "Matériaux", entity: "materials", rows: linkedTo("materials", "chantier_id") },
          { label: "Équipement", entity: "equipment", rows: linkedTo("equipment", "chantier_id") },
          { label: "Pointage", entity: "pointages", rows: linkedTo("pointages", "chantier_id") },
          { label: "Tâches", entity: "tasks", rows: linkedTo("tasks", "chantier_id") },
          { label: "Réserves", entity: "reserves", rows: linkedTo("reserves", "chantier_id") },
          { label: "Commandes", entity: "commandes", rows: linkedTo("commandes", "chantier_id") },
          { label: "Dépenses", entity: "depenses", rows: linkedTo("depenses", "chantier_id") },
          { label: "Paiements", entity: "paiements", rows: linkedTo("paiements", "chantier_id") },
          { label: "Rappels", entity: "rappels", rows: linkedTo("rappels", "chantier_id") },
          { label: "Notes", entity: "notes", rows: linkedTo("notes", "chantier_id") },
          { label: "Messages", entity: "messages", rows: linkedTo("messages", "chantier_id") },
          { label: "Validations", entity: "validations", rows: linkedTo("validations", "chantier_id") },
        ],
      };
    }
    if (entity === "clients") {
      return {
        actors: [] as { entity: string; row: Row }[],
        groups: [
          { label: "Sites / Adresses", entity: "sites", rows: linkedTo("sites", "client_id") },
          { label: "Demandes", entity: "demandes", rows: linkedTo("demandes", "client_id") },
          { label: "Chantiers", entity: "chantiers", rows: linkedTo("chantiers", "client_id") },
          { label: "Devis", entity: "devis", rows: linkedTo("devis", "client_id") },
          { label: "Factures", entity: "factures", rows: linkedTo("factures", "client_id") },
          { label: "Paiements", entity: "paiements", rows: linkedTo("paiements", "client_id") },
          { label: "Contrats", entity: "contrats", rows: linkedTo("contrats", "client_id") },
          { label: "Parc installé", entity: "parc_installe", rows: linkedTo("parc_installe", "client_id") },
          { label: "Interventions", entity: "interventions", rows: linkedTo("interventions", "client_id") },
          { label: "Réserves", entity: "reserves", rows: linkedTo("reserves", "client_id") },
          { label: "Documents", entity: "documents", rows: linkedTo("documents", "client_id") },
          { label: "Rappels", entity: "rappels", rows: linkedTo("rappels", "client_id") },
          { label: "Messages", entity: "messages", rows: linkedTo("messages", "client_id") },
          { label: "Notes", entity: "notes", rows: linkedTo("notes", "client_id") },
          { label: "Validations", entity: "validations", rows: linkedTo("validations", "client_id") },
        ],
      };
    }
    if (entity === "employees") {
      return {
        actors: [] as { entity: string; row: Row }[],
        groups: [
          { label: "Chantiers dirigés", entity: "chantiers", rows: linkedTo("chantiers", "chef_chantier_id") },
          { label: "Interventions", entity: "interventions", rows: linkedTo("interventions", "employee_id") },
          { label: "Tâches", entity: "tasks", rows: linkedTo("tasks", "assignee_id") },
        ],
      };
    }
    // Autres entités-pivot : liens DESCENDANTS (les fiches qui pointent vers celle-ci).
    // Les liens ASCENDANTS sont dérivés génériquement plus bas (ascendingLinks).
    const only = (groups: { label: string; entity: string; rows: Row[] }[]) => ({
      actors: [] as { entity: string; row: Row }[],
      groups,
    });
    if (entity === "sites") return only([
      { label: "Chantiers", entity: "chantiers", rows: linkedTo("chantiers", "site_id") },
      { label: "Interventions", entity: "interventions", rows: linkedTo("interventions", "site_id") },
      { label: "Devis", entity: "devis", rows: linkedTo("devis", "site_id") },
      { label: "Factures", entity: "factures", rows: linkedTo("factures", "site_id") },
      { label: "Parc installé", entity: "parc_installe", rows: linkedTo("parc_installe", "site_id") },
      { label: "Contrats", entity: "contrats", rows: linkedTo("contrats", "site_id") },
    ]);
    if (entity === "demandes") return only([
      { label: "Devis", entity: "devis", rows: linkedTo("devis", "demande_id") },
      { label: "Interventions", entity: "interventions", rows: linkedTo("interventions", "demande_id") },
      { label: "Chantiers", entity: "chantiers", rows: linkedTo("chantiers", "demande_id") },
      { label: "Messages", entity: "messages", rows: linkedTo("messages", "demande_id") },
      { label: "Notes", entity: "notes", rows: linkedTo("notes", "demande_id") },
    ]);
    if (entity === "devis") return only([
      { label: "Factures", entity: "factures", rows: linkedTo("factures", "devis_id") },
      { label: "Rappels", entity: "rappels", rows: linkedTo("rappels", "devis_id") },
      { label: "Validations", entity: "validations", rows: linkedTo("validations", "devis_id") },
      { label: "Messages", entity: "messages", rows: linkedTo("messages", "devis_id") },
    ]);
    if (entity === "factures") return only([
      { label: "Paiements", entity: "paiements", rows: linkedTo("paiements", "facture_id") },
      { label: "Rappels", entity: "rappels", rows: linkedTo("rappels", "facture_id") },
      { label: "Validations", entity: "validations", rows: linkedTo("validations", "facture_id") },
      { label: "Messages", entity: "messages", rows: linkedTo("messages", "facture_id") },
    ]);
    if (entity === "parc_installe") return only([
      { label: "Contrats", entity: "contrats", rows: linkedTo("contrats", "parc_id") },
    ]);
    if (entity === "interventions") return only([
      { label: "Pointages", entity: "pointages", rows: linkedTo("pointages", "intervention_id") },
      { label: "Réserves", entity: "reserves", rows: linkedTo("reserves", "intervention_id") },
      { label: "Rappels", entity: "rappels", rows: linkedTo("rappels", "intervention_id") },
      { label: "Notes", entity: "notes", rows: linkedTo("notes", "intervention_id") },
      { label: "Messages", entity: "messages", rows: linkedTo("messages", "intervention_id") },
      { label: "Validations", entity: "validations", rows: linkedTo("validations", "intervention_id") },
    ]);
    if (entity === "reserves") return only([
      { label: "Notes", entity: "notes", rows: linkedTo("notes", "reserve_id") },
      { label: "Messages", entity: "messages", rows: linkedTo("messages", "reserve_id") },
      { label: "Validations", entity: "validations", rows: linkedTo("validations", "reserve_id") },
    ]);
    if (entity === "commandes") return only([
      { label: "Dépenses", entity: "depenses", rows: linkedTo("depenses", "commande_id") },
    ]);
    if (entity === "equipment") return only([
      { label: "Interventions", entity: "interventions", rows: linkedTo("interventions", "equipment_id") },
    ]);
    if (entity === "suppliers") return only([
      { label: "Commandes", entity: "commandes", rows: linkedTo("commandes", "fournisseur_id") },
      { label: "Dépenses", entity: "depenses", rows: linkedTo("depenses", "fournisseur_id") },
      { label: "Matériaux", entity: "materials", rows: linkedTo("materials", "fournisseur_id") },
      { label: "Réserves", entity: "reserves", rows: linkedTo("reserves", "supplier_id") },
      { label: "Messages", entity: "messages", rows: linkedTo("messages", "supplier_id") },
    ]);
    if (entity === "contrats") return only([
      { label: "Rappels", entity: "rappels", rows: linkedTo("rappels", "contrat_id") },
    ]);
    if (entity === "documents") return only([
      { label: "Rappels", entity: "rappels", rows: linkedTo("rappels", "document_id") },
      { label: "Validations", entity: "validations", rows: linkedTo("validations", "document_id") },
    ]);
    return null;
  }, [entity, row, data]);

  // Liens ASCENDANTS génériques : chaque champ-relation renseigné de CETTE fiche
  // (client_id, chantier_id, devis_id, intervention_id, equipment_id…) → sa cible.
  // Source unique = FORM_FIELDS, donc « tout ce qui peut être rattaché » l'est.
  const ascendingLinks = useMemo(() => {
    if (!row) return [] as { entity: string; row: Row; label: string }[];
    const out: { entity: string; row: Row; label: string }[] = [];
    for (const f of FORM_FIELDS[entity] ?? []) {
      if (f.type !== "relation" || !f.relation) continue;
      const val = row[f.key];
      if (val === null || val === undefined || val === "") continue;
      const ref = (data[f.relation] ?? []).find((r) => r.id === val);
      if (ref) out.push({ entity: f.relation, row: ref, label: f.label });
    }
    return out;
  }, [entity, row, data]);

  // ── SYNTHÈSE FINANCIÈRE D'UN CHANTIER (la « vérité » du chantier) ───────────
  // Calculée depuis le graphe déjà chargé : devisé → facturé → encaissé → reste dû,
  // et le coût réel engagé (matériaux + main d'œuvre pointée) → marge indicative.
  const finance = useMemo(() => {
    if (entity !== "chantiers" || !row) return null;
    const devis = (data.devis ?? []).filter((d) => d.chantier_id === row.id);
    const factures = (data.factures ?? []).filter((f) => f.chantier_id === row.id);
    const pointages = (data.pointages ?? []).filter((p) => p.chantier_id === row.id);
    const materiaux = (data.materials ?? []).filter((m) => m.chantier_id === row.id);
    const empTaux = new Map((data.employees ?? []).map((e) => [e.id, num(e.taux_horaire)]));

    // Un avoir se soustrait ; une facture annulée est ignorée.
    const vivantes = factures.filter((f) => f.statut !== "annulee");
    const sign = (f: Row) => (f.type === "avoir" ? -1 : 1);

    const devisAccepteHT = devis.filter((d) => d.statut === "accepte").reduce((s, d) => s + num(d.montant_ht), 0);
    const factureHT = vivantes.reduce((s, f) => s + sign(f) * num(f.montant_ht), 0);
    const factureTTC = vivantes.reduce((s, f) => s + sign(f) * num(f.montant_ttc), 0);
    const encaisse = vivantes.reduce((s, f) => s + sign(f) * num(f.montant_paye), 0);
    const resteDu = Math.max(0, factureTTC - encaisse);

    const heures = pointages.reduce((s, p) => s + num(p.heures), 0);
    const coutMO = pointages.reduce((s, p) => s + num(p.heures) * num(empTaux.get(p.employee_id)), 0);
    const coutMateriaux = materiaux.reduce((s, m) => s + num(m.prix_achat_ht) * (num(m.quantite) || 1), 0);
    const coutReel = coutMO + coutMateriaux;

    // Base de marge : ce qui est facturé HT (sinon, à défaut, le devis accepté HT).
    const base = factureHT || devisAccepteHT;
    const marge = base > 0 ? base - coutReel : 0;
    const margePct = base > 0 ? (marge / base) * 100 : null;

    const budget = num(row.budget);
    const budgetEngage = num(row.budget_engage) || coutReel;

    const hasMoney =
      devis.length > 0 || factures.length > 0 || pointages.length > 0 || materiaux.length > 0 || budget > 0;

    return {
      hasMoney, devisAccepteHT, factureHT, factureTTC, encaisse, resteDu,
      heures, coutMO, coutMateriaux, coutReel, marge, margePct, budget, budgetEngage,
    };
  }, [entity, row, data]);

  // ── HISTORIQUE DU CHANTIER (timeline unifiée) ───────────────────────────────
  const timeline = useMemo(() => {
    if (entity !== "chantiers" || !row) return [] as { date: string; label: string; kind: string }[];
    const ev: { date: string; label: string; kind: string }[] = [];
    const push = (date: unknown, label: string, kind: string) => {
      const d = String(date ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) ev.push({ date: d, label, kind });
    };
    (data.devis ?? []).filter((d) => d.chantier_id === row.id).forEach((d) =>
      push(d.date_devis, t(`Devis ${d.numero ?? ""} ${d.statut === "accepte" ? "accepté" : d.statut === "refuse" ? "refusé" : "créé"}`, `Quote ${d.numero ?? ""} ${d.statut === "accepte" ? "accepted" : d.statut === "refuse" ? "refused" : "created"}`).replace(/\s+/g, " ").trim(), "devis")
    );
    (data.factures ?? []).filter((f) => f.chantier_id === row.id).forEach((f) =>
      push(f.date_facture, t(`Facture ${f.numero ?? ""} ${f.statut === "payee" ? "payée" : "émise"}`, `Invoice ${f.numero ?? ""} ${f.statut === "payee" ? "paid" : "issued"}`).replace(/\s+/g, " ").trim(), "facture")
    );
    (data.interventions ?? []).filter((i) => i.chantier_id === row.id).forEach((i) =>
      push(i.date_reelle || i.date_prevue, t(`Intervention — ${i.type ?? ""}`, `Job — ${i.type ?? ""}`).trim(), "intervention")
    );
    (data.documents ?? []).filter((doc) => doc.chantier_id === row.id).forEach((doc) =>
      push(doc.created_at || doc.expires_at, `Document — ${doc.nom ?? ""}`.trim(), "document")
    );
    // Pointages : regroupés par jour (sinon bruit).
    const parJour = new Map<string, number>();
    (data.pointages ?? []).filter((p) => p.chantier_id === row.id).forEach((p) => {
      const d = String(p.date_pointage ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) parJour.set(d, (parJour.get(d) ?? 0) + num(p.heures));
    });
    parJour.forEach((h, d) => push(d, t(`Pointage — ${h} h`, `Time log — ${h} h`), "pointage"));

    return ev.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, row, data, locale]);

  if (!row) return null;
  const Icon = meta.icon;

  // Rattachements ascendants (pour toute entité qui pointe vers un chantier/client/employé)
  const parentChantier = row.chantier_id ? (data.chantiers ?? []).find((c) => c.id === row.chantier_id) : null;
  const parentClient = row.client_id ? (data.clients ?? []).find((c) => c.id === row.client_id) : null;

  // « Ajouter au calendrier » : interventions datées et tâches à échéance.
  let calendarEvent: CalendarEvent | null = null;
  const context = parentChantier?.nom ?? parentClient?.nom ?? null;
  const location = parentChantier
    ? [parentChantier.adresse, parentChantier.code_postal, parentChantier.ville].filter(Boolean).join(", ")
    : null;
  if (entity === "interventions" && row.date_prevue) {
    const start = new Date(row.date_prevue);
    if (!isNaN(start.getTime())) {
      calendarEvent = {
        title: `${row.type ?? "Intervention"}${context ? ` — ${context}` : ""}`,
        start,
        end: row.duree_heures ? new Date(start.getTime() + Number(row.duree_heures) * 3600_000) : null,
        location,
        description: row.description ?? null,
      };
    }
  } else if (entity === "tasks" && row.due_date) {
    const start = new Date(row.due_date);
    if (!isNaN(start.getTime())) {
      calendarEvent = {
        title: row.title ?? "Tâche",
        start,
        allDay: true,
        location,
        description: row.description ?? null,
      };
    }
  }

  // ── TRANSFORMATIONS 1-CLIC ── proposées selon la fiche (mêmes actions serveur
  // que le SDK/les agents : /api/data, rattachements repris, idempotentes).
  const transforms: { label: string; action: string; target: string; icon: LucideIcon }[] = [];
  if (entity === "devis" && !row.chantier_id) {
    transforms.push({ label: t("Ouvrir le chantier", "Open the job site"), action: "chantier_from_devis", target: "chantiers", icon: HardHat });
  }
  if (entity === "demandes" && row.statut !== "converti" && row.statut !== "perdu") {
    transforms.push({ label: t("Créer le devis", "Create the quote"), action: "devis_from_demande", target: "devis", icon: FileSignature });
  }
  if (entity === "notes") {
    transforms.push({ label: t("→ Tâche", "→ Task"), action: "task_from_note", target: "tasks", icon: ListChecks });
    transforms.push({ label: t("→ Réserve", "→ Snag"), action: "reserve_from_note", target: "reserves", icon: AlertTriangle });
  }

  const runTransform = async (action: string, target: string) => {
    if (txBusy) return;
    setTxBusy(true);
    setTxMsg(null);
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: target, action, id: row.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || t("Action impossible.", "Action failed."));
      onRefresh?.();
      if (json?.data?.id) onOpen(target, json.data.id as string);
    } catch (e) {
      setTxMsg(e instanceof Error ? e.message : t("Action impossible.", "Action failed."));
    } finally {
      setTxBusy(false);
    }
  };

  // Relevé GPS : ajoute la position du téléphone au rapport d'intervention.
  const recordPosition = async () => {
    if (gpsBusy) return;
    setGpsBusy(true);
    setGpsMsg(null);
    try {
      const p = await getCurrentPosition();
      const line = gpsLine(p, new Date());
      const rapport = row.rapport ? `${row.rapport}\n${line}` : line;
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "interventions", action: "update", id: row.id, values: { rapport } }),
      });
      if (!res.ok) throw new Error(t("Enregistrement impossible. Réessayez.", "Save failed. Try again."));
      onRefresh?.();
      setGpsMsg(t("Position enregistrée dans le rapport.", "Position saved to the report."));
    } catch (e) {
      setGpsMsg(e instanceof Error ? e.message : t("Position impossible à relever.", "Couldn't get the position."));
    } finally {
      setGpsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="w-full max-w-[440px] h-full bg-white border-l border-[#EDEDE9] shadow-[-16px_0_50px_rgba(60,40,120,0.10)] flex flex-col animate-[slideIn_.3s_cubic-bezier(0.16,1,0.3,1)]">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 pt-[calc(1.25rem+var(--safe-top))] border-b border-[#EDEDE9] flex-shrink-0">
          <span
            className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[14px] text-white shadow-[0_8px_20px_rgba(80,50,160,0.24)]"
            style={gradStyle(entity)}
          >
            <Icon className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A97]">{tEntityLabel(locale, entity)}</p>
            <h2 className="text-lg font-bold text-[#0A0A0A] tracking-[-0.01em] leading-tight">{meta.title(row)}</h2>
            {entity === "chantiers" && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${CHANTIER_STATUT[row.statut]?.cls ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                  {tChantierStatut(locale, String(row.statut))}
                </span>
                <span className="text-[11px] text-[#9A9A97] tabular-nums">{row.avancement ?? 0}%</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onEdit && FORM_FIELDS[entity] && (
              <button
                onClick={() => onEdit(entity, row)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#0A0A0A] text-white text-[12.5px] font-semibold hover:opacity-90 transition-opacity"
                title={t("Modifier cette fiche", "Edit this record")}
              >
                <Pencil className="w-3.5 h-3.5" /> {t("Modifier", "Edit")}
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-black/[0.05] flex items-center justify-center text-[#9A9A97] hover:text-[#0A0A0A] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 pb-[calc(1.25rem+var(--safe-bottom))] space-y-6">
          {/* Actions rapides : transformations 1-clic + agenda + relevé GPS terrain */}
          {(calendarEvent || entity === "interventions" || transforms.length > 0) && (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {transforms.map((tx) => {
                  const TIcon = tx.icon;
                  return (
                    <button
                      key={tx.action}
                      type="button"
                      onClick={() => runTransform(tx.action, tx.target)}
                      disabled={txBusy}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0A0A0A] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all disabled:opacity-60"
                      title={t(`Créer ${tx.label.toLowerCase()} à partir de cette fiche`, `Create ${tx.label.toLowerCase()} from this record`)}
                    >
                      {txBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TIcon className="h-3.5 w-3.5" />}
                      {tx.label}
                    </button>
                  );
                })}
                {calendarEvent && <AddToCalendar event={calendarEvent} />}
                {entity === "interventions" && (
                  <button
                    type="button"
                    onClick={recordPosition}
                    disabled={gpsBusy}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#F3EFFC] text-[#7C3AED] border border-[#E2D9F8] text-xs font-semibold rounded-lg hover:bg-[#EAE2FA] hover:border-[#C9BEF0] transition-all disabled:opacity-60"
                    title={t("Ajoute la position GPS du téléphone au rapport d'intervention", "Adds the phone's GPS position to the job report")}
                  >
                    {gpsBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                    {t("Relever ma position", "Log my position")}
                  </button>
                )}
              </div>
              {txMsg && <p className="mt-2 text-[11px] leading-snug text-rose-600">{txMsg}</p>}
              {gpsMsg && <p className="mt-2 text-[11px] leading-snug text-[#7C3AED]">{gpsMsg}</p>}
            </div>
          )}

          {/* Avancement (chantier) */}
          {entity === "chantiers" && (
            <div className="h-1.5 w-full bg-[#F1F1EC] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, row.avancement ?? 0))}%` }}
              />
            </div>
          )}

          {/* SYNTHÈSE FINANCIÈRE — la « vérité » du chantier, calculée en direct */}
          {entity === "chantiers" && finance?.hasMoney && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] px-3 mb-2">{t("Synthèse financière", "Financial summary")}</p>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label={t("Facturé", "Invoiced")} value={fmtEUR(finance.factureTTC)} sub={t("TTC", "incl. tax")} />
                <MiniStat label={t("Encaissé", "Collected")} value={fmtEUR(finance.encaisse)} sub={t("TTC", "incl. tax")} tone={finance.encaisse > 0 ? "green" : undefined} />
                <MiniStat label={t("Reste dû", "Outstanding")} value={fmtEUR(finance.resteDu)} sub={t("TTC", "incl. tax")} tone={finance.resteDu > 0 ? "rose" : "green"} />
                <MiniStat
                  label={t("Marge estimée", "Estimated margin")}
                  value={fmtEUR(finance.marge)}
                  sub={finance.margePct != null ? `${finance.margePct.toFixed(0)} %` : t("indicatif", "indicative")}
                  tone={finance.marge >= 0 ? "green" : "rose"}
                />
              </div>
              <div className="mt-2.5 px-3 space-y-1.5">
                {finance.devisAccepteHT > 0 && <SynthLine label={t("Devis accepté", "Quote accepted")} value={t(`${fmtEUR(finance.devisAccepteHT)} HT`, `${fmtEUR(finance.devisAccepteHT)} excl. tax`)} />}
                {finance.coutReel > 0 && (
                  <SynthLine
                    label={t("Coût réel engagé", "Actual cost incurred")}
                    value={t(`${fmtEUR(finance.coutReel)} — MO ${fmtEUR(finance.coutMO)} + mat. ${fmtEUR(finance.coutMateriaux)}`, `${fmtEUR(finance.coutReel)} — labor ${fmtEUR(finance.coutMO)} + mat. ${fmtEUR(finance.coutMateriaux)}`)}
                  />
                )}
                {finance.heures > 0 && <SynthLine label={t("Heures pointées", "Logged hours")} value={`${finance.heures} h`} />}
              </div>
              {finance.budget > 0 && (
                <div className="mt-3 px-3">
                  <div className="flex items-center justify-between text-[11.5px] mb-1">
                    <span className="text-[#9A9A97]">{t("Budget engagé", "Budget committed")}</span>
                    <span className="tabular-nums text-[#0A0A0A]">{fmtEUR(finance.budgetEngage)} / {fmtEUR(finance.budget)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#F1F1EC] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${finance.budgetEngage > finance.budget ? "bg-rose-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(100, (finance.budgetEngage / finance.budget) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* HISTORIQUE — timeline unifiée du chantier */}
          {entity === "chantiers" && timeline.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] px-3 mb-2">{t("Historique", "History")}</p>
              <div className="px-3 space-y-3">
                {timeline.map((e, i) => (
                  <div key={`${e.kind}-${e.date}-${i}`} className="flex items-start gap-3">
                    <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${TIMELINE_DOT[e.kind] ?? "bg-slate-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#0A0A0A] leading-snug break-words">{e.label}</p>
                      <p className="text-[11px] text-[#9A9A97] tabular-nums">{fmtDate(e.date, locale)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rattachements ascendants — TOUT ce à quoi cette fiche est reliée.
              Masqué quand un bloc « Acteurs » dédié couvre déjà ces liens (chantiers). */}
          {(!related || related.actors.length === 0) && ascendingLinks.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] px-3 mb-1">{t("Rattaché à", "Linked to")}</p>
              {ascendingLinks.map((a) => (
                <RelatedItem key={`${a.entity}-${a.row.id}`} entity={a.entity} row={a.row} onOpen={onOpen} />
              ))}
            </div>
          )}

          {/* Relations (le cœur du « tout est relié ») */}
          {related && (
            <div className="space-y-5">
              {related.actors.length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] px-3 mb-1">{t("Acteurs", "Stakeholders")}</p>
                  {related.actors.map((a) => <RelatedItem key={a.row.id} entity={a.entity} row={a.row} onOpen={onOpen} />)}
                </div>
              )}
              {related.groups.map((g) => (
                <RelatedGroup key={g.label} label={g.label} entity={g.entity} rows={g.rows} onOpen={onOpen} />
              ))}
            </div>
          )}

          {/* Champs bruts */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] px-3 mb-1">{t("Détails", "Details")}</p>
            <div className="px-3">
              {meta.detailFields.map((k) => <FieldRow key={k} k={k} v={row[k]} />)}
            </div>
          </div>
        </div>
      </aside>
      <style jsx global>{`
        @keyframes slideIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      `}</style>
    </div>
  );
}

// ─── Carte-tuile d'entité (vue d'ensemble) ──────────────────────────────────
// Dégradés de puce d'icône par entité (135°, façon landing : chip coloré + icône
// blanche + ombre teintée). C'est ce qui donne le « wow » vs des pastilles plates.
const ENTITY_GRAD: Record<string, [string, string]> = {
  chantiers: ["#8B7CF6", "#6D4AFF"],
  clients: ["#4CC3F7", "#3B82F6"],
  employees: ["#34D399", "#10B981"],
  devis: ["#B57BF7", "#8B3FE8"],
  factures: ["#34D07A", "#16A34A"],
  catalogue: ["#2FD9C5", "#14B8A6"],
  interventions: ["#FBBF5A", "#F59E0B"],
  contrats: ["#FBA36B", "#F97316"],
  parc_installe: ["#F98080", "#EF4444"],
  pointages: ["#6FA8FB", "#3B82F6"],
  materials: ["#FBA55A", "#EA580C"],
  equipment: ["#3FD9EE", "#06B6D4"],
  suppliers: ["#FB8098", "#F43F5E"],
  documents: ["#8E9BF8", "#6366F1"],
  tasks: ["#ED8BF9", "#D946EF"],
  sites: ["#2FD9C5", "#14B8A6"],
  demandes: ["#8B7CF6", "#6D4AFF"],
  commandes: ["#FBA55A", "#EA580C"],
  depenses: ["#FB8098", "#F43F5E"],
  paiements: ["#34D07A", "#16A34A"],
  reserves: ["#FBBF5A", "#F59E0B"],
  rappels: ["#ED8BF9", "#D946EF"],
  messages: ["#5AB8FB", "#0EA5E9"],
  notes: ["#FBD34D", "#EAB308"],
  validations: ["#8B9BF8", "#6366F1"],
};
const entityGrad = (e: string): [string, string] => ENTITY_GRAD[e] ?? ["#8B7CF6", "#6D4AFF"];
const gradStyle = (e: string) => {
  const [c1, c2] = entityGrad(e);
  return { background: `linear-gradient(135deg, ${c1}, ${c2})` };
};

function EntityTile({
  entity, rows, onClick,
}: { entity: string; rows: Row[]; onClick: () => void }) {
  const t = useT();
  const locale = useLocale();
  const meta = ENTITY_META[entity];
  const Icon = meta.icon;
  const n = rows.length;
  return (
    <button
      onClick={onClick}
      className="group flex flex-col text-left rounded-[20px] border border-[#EBEBF1] bg-white p-[18px] shadow-[0_12px_40px_rgba(60,40,120,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#DBD3F1] hover:shadow-[0_26px_64px_rgba(60,40,120,0.15)]"
    >
      <div className="mb-3.5 flex items-center justify-between">
        <span
          className="grid h-11 w-11 place-items-center rounded-[14px] text-white shadow-[0_8px_20px_rgba(80,50,160,0.24)] transition-transform duration-300 group-hover:scale-[1.06]"
          style={gradStyle(entity)}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className={`text-[19px] font-black tabular-nums tracking-[-0.03em] transition-colors ${n ? "text-[#0A0A0A]" : "text-[#D3D3DC]"}`}>{n}</span>
      </div>
      <h3 className="text-[14px] font-semibold leading-tight tracking-[-0.01em] text-[#0A0A0A]">{tEntityLabel(locale, entity)}</h3>
      <p className="mt-0.5 truncate text-[11.5px] text-[#9A9AA6]">
        {n ? rows.slice(0, 2).map((r) => meta.title(r)).join(", ") : t("Vide", "Empty")}
      </p>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── Import CSV / Excel ──────────────────────────────────────────────────────
// Mapping automatique en-têtes de fichier → champs de l'entité (corrigeable).
const FIELD_SYNONYMS: Record<string, string[]> = {
  // Volontairement SANS "client"/"fournisseur" ici (trop gloutons) : gérés par NAME_ALIASES.
  nom: ["nom", "raison sociale", "societe", "denomination", "designation", "libelle", "name", "intitule"],
  prenom: ["prenom", "firstname"],
  email: ["email", "e-mail", "mail", "courriel"],
  tel: ["telephone", "tel", "phone", "portable", "mobile", "gsm", "numero de tel", "numero de telephone"],
  adresse: ["adresse", "rue", "address", "voie"],
  ville: ["ville", "commune", "city", "localite"],
  code_postal: ["code postal", "codepostal", "cp", "zip", "postal"],
  siret: ["siret", "siren", "tva"],
  type: ["type", "categorie", "nature", "segment"],
  notes: ["notes", "note", "remarque", "commentaire", "observation", "comment"],
  role: ["role", "poste", "fonction"],
  corps_metier: ["corps de metier", "specialite", "metier", "trade"],
  taux_horaire: ["taux horaire", "cout horaire", "taux", "tarif"],
  date_embauche: ["date embauche", "embauche", "entree"],
  budget: ["budget", "montant", "prix", "cout total", "cout ht"],
  budget_engage: ["cout actuel", "depense", "engage", "consomme", "cout reel", "deja facture"],
  statut: ["statut", "status", "etat"],
  reference: ["reference", "ref", "code"],
  marque: ["marque", "brand", "fabricant"],
  numero_serie: ["numero de serie", "n serie", "serial", "serie"],
  quantite: ["quantite", "qte", "quantity", "stock", "nombre"],
  unite: ["unite", "unit"],
  categorie: ["categorie", "famille"],
  description: ["description", "desc", "details"],
  title: ["titre", "title", "sujet"],
  priority: ["priorite", "priority", "importance"],
  due_date: ["echeance", "date limite", "deadline", "due"],
  date_debut: ["date debut", "debut", "start", "demarrage"],
  date_fin_prevue: ["date fin prevue", "fin prevue", "date fin", "fin", "livraison"],
  avancement: ["avancement", "progression", "pourcentage"],
};

// Le champ "nom principal" de chaque entité + ses alias contextuels (colonne du titre).
const NAME_FIELD: Record<string, string> = {
  chantiers: "nom", clients: "nom", employees: "nom", documents: "nom",
  suppliers: "nom", materials: "nom", equipment: "nom", interventions: "type", tasks: "title",
  catalogue: "designation", devis: "numero", factures: "numero",
  pointages: "date_pointage", contrats: "reference", parc_installe: "modele",
};
const NAME_ALIASES: Record<string, string[]> = {
  chantiers: ["chantier", "projet", "nom du chantier", "nom chantier"],
  clients: ["client", "nom du client", "nom client"],
  suppliers: ["fournisseur", "sous-traitant", "soustraitant"],
  employees: ["employe", "salarie", "ouvrier", "collaborateur"],
  materials: ["materiau", "materiel", "article"],
  equipment: ["equipement", "engin", "machine", "outil"],
  documents: ["document", "piece"],
  interventions: ["intervention", "prestation"],
  tasks: ["tache", "todo"],
};

// Score de correspondance : exact > contient un synonyme long > inversé. Plus c'est spécifique, plus le score est haut.
function scoreMatch(nh: string, candidates: string[]): number {
  let best = 0;
  for (const c of candidates) {
    if (!c) continue;
    if (nh === c) best = Math.max(best, 1000);
    else if (nh.includes(c)) best = Math.max(best, 200 + c.length); // synonyme long = plus précis
    else if (c.length >= 4 && nh.length >= 4 && c.includes(nh)) best = Math.max(best, 100 + nh.length);
  }
  return best;
}

function autoMapColumns(headers: string[], entity: string): Record<string, string> {
  const writable = ENTITIES[entity].writable;
  const nameField = NAME_FIELD[entity];
  const map: Record<string, string> = {};
  for (const h of headers) {
    const nh = norm(String(h).trim());
    if (!nh) { map[h] = ""; continue; }
    let bestField = "";
    let bestScore = 0;
    for (const f of writable) {
      const cands = [norm(f), norm(FIELD_LABELS[f] ?? ""), ...(FIELD_SYNONYMS[f] ?? [])];
      if (f === nameField) cands.push(...(NAME_ALIASES[entity] ?? []));
      const sc = scoreMatch(nh, cands);
      if (sc > bestScore) { bestScore = sc; bestField = f; }
    }
    map[h] = bestScore > 0 ? bestField : "";
  }
  return map;
}

// ─── Conversion des valeurs pour coller aux types Postgres (sinon insert refusé) ─
const NUM_FIELDS = new Set([
  "budget", "budget_engage", "taux_horaire", "quantite", "duree_heures",
  "montant_ht", "montant_tva", "montant_ttc", "montant_paye", "montant",
  "prix_achat_ht", "prix_vente_ht", "prix_unitaire_ht", "total_ht", "taux_tva",
  "heures", "seuil_alerte", "position",
]);
const DATE_FIELDS = new Set([
  "date_debut", "date_fin_prevue", "date_fin_reelle", "date_embauche", "date_achat",
  "date_retour", "expires_at", "prochain_controle", "due_date", "done_at", "date_prevue", "date_reelle",
  "date_devis", "date_validite", "date_facture", "date_echeance", "date_fin", "prochaine_echeance",
  "date_pointage", "date_pose", "date_garantie", "dernier_entretien", "prochain_entretien", "assurance_expire",
]);
const CHANTIER_STATUTS = ["en_attente", "en_cours", "en_retard", "termine", "annule"];

function toISODate(s: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); // JJ/MM/AAAA (FR)
  if (m) {
    const d = m[1], mo = m[2];
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return undefined;
}
function mapChantierStatut(s: string): string | undefined {
  const t = norm(s);
  if (CHANTIER_STATUTS.includes(t)) return t;
  if (/(attente|venir|planifi|prevu)/.test(t)) return "en_attente";
  if (/retard/.test(t)) return "en_retard";
  if (/(cours|demarr|encours|realis)/.test(t)) return "en_cours";
  if (/(termin|fini|livr|receptionn|factur|clotur|acheve)/.test(t)) return "termine";
  if (/(annul|abandon)/.test(t)) return "annule";
  return undefined;
}
// Renvoie la valeur convertie, ou undefined si inexploitable (le champ est alors ignoré).
function coerceValue(entity: string, field: string, raw: unknown): string | number | undefined {
  const s = String(raw ?? "").trim();
  if (s === "") return undefined;
  if (entity === "chantiers" && field === "statut") return mapChantierStatut(s);
  if (field === "avancement") {
    const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : undefined;
  }
  if (NUM_FIELDS.has(field)) {
    const n = parseFloat(s.replace(/[^0-9.,-]/g, "").replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  if (DATE_FIELDS.has(field)) return toISODate(s);
  return s;
}

// Construit les lignes prêtes pour /api/data à partir d'un mapping colonne→champ.
function rowsFromMapping(headers: string[], rows: XLSXRow[], mapping: Record<string, string>, entity: string) {
  return rows
    .map((r) => {
      const o: Record<string, string | number> = {};
      for (const h of headers) {
        const f = mapping[h];
        if (!f) continue;
        const v = coerceValue(entity, f, r[h]);
        if (v !== undefined) o[f] = v;
      }
      return o;
    })
    .filter((o) => Object.keys(o).length > 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XLSXRow = Record<string, any>;

function ImportModal({ entity, onClose, onImported }: { entity: string; onClose: () => void; onImported: () => void }) {
  const t = useT();
  const locale = useLocale();
  const def = ENTITIES[entity];
  const meta = ENTITY_META[entity];
  const writable = def.writable;
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<XLSXRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const reset = () => { setHeaders([]); setRows([]); setFileName(""); setMapping({}); setError(null); };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null); setParsing(true); setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<XLSXRow>(sheet, { defval: "", raw: false });
      if (!json.length) { setError(t("Le fichier semble vide.", "The file appears to be empty.")); setParsing(false); return; }
      const hs = Object.keys(json[0]).filter((h) => h && !h.startsWith("__EMPTY"));
      setHeaders(hs);
      setRows(json);
      setMapping(autoMapColumns(hs, entity));
    } catch {
      setError(t("Impossible de lire ce fichier. Formats acceptés : CSV, XLSX, XLS.", "Couldn't read this file. Accepted formats: CSV, XLSX, XLS."));
    } finally {
      setParsing(false);
    }
  };

  const mappedHeaders = headers.filter((h) => mapping[h]);
  const doImport = async () => {
    setImporting(true); setError(null);
    const payload = rowsFromMapping(headers, rows, mapping, entity);
    if (!payload.length) { setError(t("Aucune donnée à importer (vérifiez la correspondance des colonnes).", "No data to import (check the column mapping).")); setImporting(false); return; }
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, action: "bulk_create", rows: payload }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || t("Échec de l'import.", "Import failed."));
      setDone(j.inserted ?? payload.length);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Échec de l'import.", "Import failed."));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#0A0A0F]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem-var(--safe-top)-var(--safe-bottom))] bg-white rounded-[24px] shadow-[0_50px_130px_rgba(20,20,50,0.4)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 h-16 border-b border-[#ECECF2] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.accent}`}><Upload className="w-5 h-5" /></span>
            <div>
              <h3 className="font-bold text-[#0A0A0A]">{t(`Importer des ${meta.label.toLowerCase()}`, `Import ${tEntityLabel(locale, entity).toLowerCase()}`)}</h3>
              <p className="text-[12px] text-[#9A9A97]">{t("Fichier CSV ou Excel (.xlsx, .xls)", "CSV or Excel file (.xlsx, .xls)")}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t("Fermer", "Close")} className="w-9 h-9 rounded-full hover:bg-black/[0.05] flex items-center justify-center text-[#6E6E7A]"><X className="w-[18px] h-[18px]" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {done !== null ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <span className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4"><Check className="w-7 h-7" /></span>
              <h4 className="text-lg font-bold text-[#0A0A0A] mb-1">{t(`${done} ${meta.label.toLowerCase()} importés`, `${done} ${tEntityLabel(locale, entity).toLowerCase()} imported`)}</h4>
              <p className="text-sm text-[#6E6E6C] max-w-xs">{t("Ils sont dans votre workspace, et vos applications générées les verront automatiquement.", "They're in your workspace, and your generated apps will see them automatically.")}</p>
              <button onClick={onClose} className="mt-6 px-5 py-2.5 rounded-full bg-[#0A0A0A] text-white text-sm font-semibold hover:bg-[#222] transition-colors">{t("Terminé", "Done")}</button>
            </div>
          ) : headers.length === 0 ? (
            <div>
              <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-[#E2E2EA] rounded-2xl py-12 flex flex-col items-center justify-center gap-3 hover:border-violet-300 hover:bg-violet-50/40 transition-colors">
                {parsing ? <Loader2 className="w-8 h-8 text-violet-500 animate-spin" /> : <Upload className="w-8 h-8 text-[#9A9AA6]" />}
                <span className="text-sm font-semibold text-[#0A0A0A]">{parsing ? t("Lecture du fichier…", "Reading the file…") : t("Choisir un fichier", "Choose a file")}</span>
                <span className="text-[12px] text-[#9A9A97]">{t("CSV, XLSX ou XLS · la 1ʳᵉ ligne doit contenir les en-têtes de colonnes", "CSV, XLSX or XLS · the first row must contain the column headers")}</span>
              </button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFile} />
              <p className="mt-5 text-[12px] text-[#9A9A97] leading-relaxed">
                {t("Colonnes reconnues automatiquement : ", "Automatically recognized columns: ")}{writable.map((f) => tFieldLabel(locale, f)).join(", ")}.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] text-[#6E6E6C]"><b className="text-[#0A0A0A] tabular-nums">{rows.length}</b> {t("lignes", "rows")} · <span className="font-medium">{fileName}</span></p>
                <button onClick={reset} className="text-[12px] font-medium text-violet-600 hover:opacity-80">{t("Changer de fichier", "Change file")}</button>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] mb-2">{t("Correspondance des colonnes", "Column mapping")}</p>
              <div className="space-y-1.5 mb-5">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2.5">
                    <span className="flex-1 min-w-0 text-[13px] text-[#0A0A0A] truncate bg-[#F6F6F9] border border-[#ECECF2] rounded-lg px-3 py-2">{h}</span>
                    <ArrowRight className="w-4 h-4 text-[#C9C9C4] flex-shrink-0" />
                    <Dropdown
                      value={mapping[h] ?? ""}
                      onChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}
                      ariaLabel={t(`Correspondance de la colonne ${h}`, `Mapping for column ${h}`)}
                      size="sm"
                      className="flex-1 min-w-0"
                      options={[
                        { value: "", label: t("Ignorer cette colonne", "Ignore this column") },
                        ...writable.map((f) => ({ value: f, label: tFieldLabel(locale, f) })),
                      ]}
                    />
                  </div>
                ))}
              </div>
              {mappedHeaders.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] mb-2">{t("Aperçu", "Preview")}</p>
                  <div className="overflow-x-auto border border-[#ECECF2] rounded-xl">
                    <table className="w-full text-[12px]">
                      <thead><tr className="bg-[#FAFAFC]">
                        {mappedHeaders.map((h) => <th key={h} className="text-left font-semibold text-[#6E6E6C] px-3 py-2 whitespace-nowrap">{tFieldLabel(locale, mapping[h])}</th>)}
                      </tr></thead>
                      <tbody>
                        {rows.slice(0, 3).map((r, i) => (
                          <tr key={i} className="border-t border-[#F1F1F5]">
                            {mappedHeaders.map((h) => <td key={h} className="px-3 py-2 text-[#0A0A0A] whitespace-nowrap max-w-[160px] truncate">{String(r[h] ?? "")}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 text-[13px] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
        </div>

        {done === null && headers.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#ECECF2] flex-shrink-0">
            <span className="text-[12px] text-[#9A9A97]">{t(`${mappedHeaders.length} colonne${mappedHeaders.length > 1 ? "s" : ""} mappée${mappedHeaders.length > 1 ? "s" : ""}`, `${mappedHeaders.length} column${mappedHeaders.length > 1 ? "s" : ""} mapped`)}</span>
            <button onClick={doImport} disabled={importing || mappedHeaders.length === 0} className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white font-semibold px-6 py-2.5 rounded-full shadow-[0_10px_26px_rgba(124,58,190,0.32)] hover:brightness-105 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t(`Importer ${rows.length} ligne${rows.length > 1 ? "s" : ""}`, `Import ${rows.length} row${rows.length > 1 ? "s" : ""}`)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Import GLOBAL intelligent : un fichier dénormalisé → réparti et relié ───
// Noms de feuille / fichier → entité (pour ranger automatiquement).
const SHEET_SYNONYMS: Record<string, string[]> = {
  chantiers: ["chantier", "chantiers", "projet", "projets"],
  clients: ["client", "clients", "crm", "prospect", "prospects"],
  employees: ["employe", "employes", "salarie", "salaries", "equipe", "equipes", "personnel", "ouvrier", "ouvriers", "main d'oeuvre"],
  documents: ["document", "documents", "attestation", "attestations"],
  interventions: ["intervention", "interventions", "sav", "depannage"],
  materials: ["materiau", "materiaux", "materiel", "stock", "fourniture", "fournitures"],
  equipment: ["equipement", "equipements", "engin", "engins", "outillage", "machine", "machines"],
  suppliers: ["fournisseur", "fournisseurs", "sous-traitant", "sous-traitants", "soustraitant"],
  tasks: ["tache", "taches", "todo", "todos"],
  catalogue: ["catalogue", "tarif", "tarifs", "prix", "prestation", "prestations", "ouvrage", "ouvrages", "bordereau"],
  devis: ["devis", "estimation", "estimations", "chiffrage"],
  factures: ["facture", "factures", "facturation", "acompte", "acomptes", "situation", "situations"],
  pointages: ["pointage", "pointages", "heures", "temps", "feuille d'heures", "feuille de temps"],
  contrats: ["contrat", "contrats", "entretien", "maintenance", "abonnement", "abonnements"],
  parc_installe: ["parc", "parc installe", "parc client", "equipements clients", "materiel installe", "installations"],
};

function detectEntity(sheetName: string, headers: string[]): string | null {
  const n = norm(String(sheetName).trim());
  if (n) {
    for (const e of ENTITY_ORDER) {
      const cands = [e, norm(ENTITY_META[e].label), ...(SHEET_SYNONYMS[e] ?? [])];
      if (cands.some((c) => c && (n === c || n.includes(c) || c.includes(n)))) return e;
    }
  }
  if (headers.length) {
    let best: string | null = null;
    let bestScore = 0;
    for (const e of ENTITY_ORDER) {
      const score = Object.values(autoMapColumns(headers, e)).filter(Boolean).length;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    if (bestScore >= 2) return best;
  }
  return null;
}

// Mots-clés d'en-tête qui désignent une entité RÉFÉRENCÉE (à créer + relier).
const REF_KEYWORDS: Record<string, string[]> = {
  clients: ["client"],
  suppliers: ["fournisseur", "sous-traitant", "soustraitant"],
  employees: ["employe", "salarie", "ouvrier", "responsable", "chef"],
  materials: ["materiau", "materiel"],
  equipment: ["equipement", "engin", "machine"],
};
// Colonnes FK de l'entité primaire vers les entités référencées.
const FK_LINKS: Record<string, Record<string, string>> = {
  chantiers: { clients: "client_id", employees: "chef_chantier_id" },
  documents: { chantiers: "chantier_id", employees: "employee_id", clients: "client_id" },
  materials: { chantiers: "chantier_id", suppliers: "fournisseur_id" },
  equipment: { chantiers: "chantier_id" },
  interventions: { chantiers: "chantier_id", clients: "client_id", employees: "employee_id", equipment: "equipment_id" },
  tasks: { chantiers: "chantier_id", employees: "assignee_id" },
  devis: { clients: "client_id", chantiers: "chantier_id" },
  factures: { clients: "client_id", chantiers: "chantier_id" },
  pointages: { employees: "employee_id", chantiers: "chantier_id" },
  contrats: { clients: "client_id" },
  parc_installe: { clients: "client_id", chantiers: "chantier_id" },
};

type ColSel = { entity: string; field: string }; // entity "" = ignorer
type SheetPlan = { name: string; headers: string[]; rows: XLSXRow[]; primary: string; cols: Record<string, ColSel> };

function fieldFor(header: string, entity: string): string {
  if (!entity) return "";
  const nh = norm(header.trim());
  let stripped = nh;
  for (const kw of REF_KEYWORDS[entity] ?? []) stripped = stripped.replace(kw, " ").trim();
  const probe = stripped || nh;
  return autoMapColumns([probe], entity)[probe] || NAME_FIELD[entity] || "";
}

function classifyColumns(headers: string[], primary: string): Record<string, ColSel> {
  const cols: Record<string, ColSel> = {};
  for (const h of headers) {
    const nh = norm(h.trim());
    if (!nh) { cols[h] = { entity: "", field: "" }; continue; }
    let refE = "", kwLen = 0;
    for (const [e, kws] of Object.entries(REF_KEYWORDS)) {
      if (e === primary) continue;
      for (const kw of kws) if (nh.includes(kw) && kw.length > kwLen) { refE = e; kwLen = kw.length; }
    }
    if (refE) { cols[h] = { entity: refE, field: fieldFor(h, refE) }; continue; }
    const pf = autoMapColumns([h], primary)[h];
    cols[h] = pf ? { entity: primary, field: pf } : { entity: "", field: "" };
  }
  return cols;
}

function bestPrimary(name: string, headers: string[]): string {
  const byName = detectEntity(name, headers);
  if (byName) return byName;
  let best = "chantiers", bs = -1;
  for (const e of ENTITY_ORDER) {
    const s = Object.values(autoMapColumns(headers, e)).filter(Boolean).length;
    if (s > bs) { bs = s; best = e; }
  }
  return best;
}

function planSummary(plan: SheetPlan): { entity: string; count: number }[] {
  const { headers, rows, primary, cols } = plan;
  const out: { entity: string; count: number }[] = [{ entity: primary, count: rows.length }];
  const refByEntity: Record<string, string[]> = {};
  for (const h of headers) { const c = cols[h]; if (c?.entity && c.entity !== primary) (refByEntity[c.entity] ??= []).push(h); }
  for (const e of Object.keys(refByEntity)) {
    const nameHeader = refByEntity[e].find((h) => cols[h].field === NAME_FIELD[e]);
    if (!nameHeader) continue;
    const uniq = new Set<string>();
    for (const r of rows) { const nm = norm(String(r[nameHeader] ?? "").trim()); if (nm) uniq.add(nm); }
    if (uniq.size) out.push({ entity: e, count: uniq.size });
  }
  return out;
}

// Éclate une feuille : crée les entités référencées (dédoublonnées) puis l'entité
// primaire en la reliant (client_id, chef_chantier_id…).
async function runSplitImport(plan: SheetPlan): Promise<Record<string, number>> {
  const { headers, rows, primary, cols } = plan;
  const counts: Record<string, number> = {};
  const byEntity: Record<string, string[]> = {};
  for (const h of headers) { const c = cols[h]; if (c?.entity) (byEntity[c.entity] ??= []).push(h); }
  const fkTargets = FK_LINKS[primary] ?? {};
  const refEntities = Object.keys(byEntity).filter((e) => e !== primary);
  const nameToId: Record<string, Record<string, string>> = {};

  for (const e of refEntities) {
    const nameField = NAME_FIELD[e];
    const nameHeader = byEntity[e].find((h) => cols[h].field === nameField);
    if (!nameHeader) continue;
    const existing = await listEntity(e);
    const map: Record<string, string> = {};
    for (const row of existing) { const nm = norm(String(row[nameField] ?? "")); if (nm && !map[nm]) map[nm] = row.id; }
    const seen = new Set<string>();
    let created = 0;
    for (const r of rows) {
      const nm = norm(String(r[nameHeader] ?? "").trim());
      if (!nm || map[nm] || seen.has(nm)) continue;
      seen.add(nm);
      const rec: Record<string, string | number> = {};
      for (const h of byEntity[e]) { const v = coerceValue(e, cols[h].field, r[h]); if (v !== undefined && rec[cols[h].field] === undefined) rec[cols[h].field] = v; }
      if (!Object.keys(rec).length) continue;
      try {
        const res = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: e, action: "create", values: rec }) });
        const j = await res.json();
        if (res.ok && j.data?.id) { map[nm] = j.data.id; created++; }
      } catch { /* ligne suivante */ }
    }
    nameToId[e] = map;
    counts[e] = created;
  }

  const primaryHeaders = byEntity[primary] ?? [];
  const payload = rows.map((r) => {
    const rec: Record<string, string | number> = {};
    for (const h of primaryHeaders) { const v = coerceValue(primary, cols[h].field, r[h]); if (v !== undefined && rec[cols[h].field] === undefined) rec[cols[h].field] = v; }
    for (const e of refEntities) {
      const fk = fkTargets[e];
      const nameHeader = byEntity[e].find((h) => cols[h].field === NAME_FIELD[e]);
      if (fk && nameHeader) { const id = nameToId[e]?.[norm(String(r[nameHeader] ?? "").trim())]; if (id) rec[fk] = id; }
    }
    return rec;
  }).filter((rec) => Object.keys(rec).length > 0);
  if (payload.length) {
    try {
      const res = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: primary, action: "bulk_create", rows: payload }) });
      const j = await res.json();
      if (res.ok) counts[primary] = j.inserted ?? payload.length;
    } catch { /* ignore */ }
  }
  return counts;
}

function DispatchImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const t = useT();
  const locale = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<SheetPlan[]>([]);
  const [results, setResults] = useState<{ entity: string; count: number }[] | null>(null);

  const reset = () => { setPlans([]); setFileNames([]); setError(null); };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setError(null); setParsing(true);
    setFileNames(files.map((f) => f.name));
    try {
      const XLSX = await import("xlsx");
      const allPlans: SheetPlan[] = [];
      for (const file of files) {
        try {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const isSingleCsv = /\.csv$/i.test(file.name);
          const sheetNames = isSingleCsv ? [file.name.replace(/\.[^.]+$/, "")] : wb.SheetNames;
          for (let si = 0; si < sheetNames.length; si++) {
            const sheetKey = wb.SheetNames[si] ?? wb.SheetNames[0];
            const json = XLSX.utils.sheet_to_json<XLSXRow>(wb.Sheets[sheetKey], { defval: "", raw: false });
            const headers = json.length ? Object.keys(json[0]).filter((h) => h && !h.startsWith("__EMPTY")) : [];
            if (!json.length || !headers.length) continue;
            const name = sheetNames[si];
            const primary = bestPrimary(name, headers);
            allPlans.push({ name, headers, rows: json, primary, cols: classifyColumns(headers, primary) });
          }
        } catch { /* skip fichier illisible */ }
      }
      if (!allPlans.length) { setError(t("Aucune donnée trouvée dans les fichiers sélectionnés.", "No data found in the selected files.")); setParsing(false); return; }
      setPlans(allPlans);
    } catch {
      setError(t("Impossible de lire ces fichiers. Formats acceptés : CSV, XLSX, XLS.", "Couldn't read these files. Accepted formats: CSV, XLSX, XLS."));
    } finally {
      setParsing(false);
    }
  };

  const setPrimary = (i: number, entity: string) =>
    setPlans((ps) => ps.map((p, k) => (k === i ? { ...p, primary: entity, cols: classifyColumns(p.headers, entity) } : p)));
  const setCol = (i: number, header: string, entity: string) =>
    setPlans((ps) => ps.map((p, k) => (k === i ? { ...p, cols: { ...p.cols, [header]: { entity, field: entity ? fieldFor(header, entity) : "" } } } : p)));

  const doImport = async () => {
    setImporting(true); setError(null);
    const agg: Record<string, number> = {};
    for (const plan of plans) {
      const c = await runSplitImport(plan);
      for (const [e, n] of Object.entries(c)) agg[e] = (agg[e] ?? 0) + n;
    }
    const arr = Object.entries(agg).filter(([, n]) => n > 0).map(([entity, count]) => ({ entity, count }));
    if (!arr.length) { setError(t("Rien n'a pu être importé. Vérifiez la répartition des colonnes.", "Nothing could be imported. Check the column distribution.")); setImporting(false); return; }
    setResults(arr); onImported(); setImporting(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#0A0A0F]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem-var(--safe-top)-var(--safe-bottom))] bg-white rounded-[24px] shadow-[0_50px_130px_rgba(20,20,50,0.4)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 h-16 border-b border-[#ECECF2] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500/15 to-pink-500/10 text-violet-600"><Upload className="w-5 h-5" /></span>
            <div>
              <h3 className="font-bold text-[#0A0A0A]">{t("Importer vos données", "Import your data")}</h3>
              <p className="text-[12px] text-[#9A9A97]">{t("Plusieurs fichiers acceptés · répartis automatiquement", "Multiple files accepted · sorted automatically")}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t("Fermer", "Close")} className="w-9 h-9 rounded-full hover:bg-black/[0.05] flex items-center justify-center text-[#6E6E7A]"><X className="w-[18px] h-[18px]" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {results ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4"><Check className="w-7 h-7" /></span>
              <h4 className="text-lg font-bold text-[#0A0A0A] mb-3">{t("Import terminé", "Import complete")}</h4>
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-sm">
                {results.map((r) => (
                  <span key={r.entity} className={`text-[13px] font-semibold px-3 py-1.5 rounded-full ${ENTITY_META[r.entity]?.accent ?? "bg-violet-50 text-violet-600"}`}>
                    {r.count} {tEntityLabel(locale, r.entity)}
                  </span>
                ))}
              </div>
              <p className="text-sm text-[#6E6E6C] mt-4 max-w-xs">{t("Tout est rangé et relié dans votre workspace, et vos apps le verront.", "Everything is sorted and linked in your workspace, and your apps will see it.")}</p>
              <button onClick={onClose} className="mt-6 px-5 py-2.5 rounded-full bg-[#0A0A0A] text-white text-sm font-semibold hover:bg-[#222] transition-colors">{t("Terminé", "Done")}</button>
            </div>
          ) : plans.length === 0 ? (
            <div>
              <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-[#E2E2EA] rounded-2xl py-12 flex flex-col items-center justify-center gap-3 hover:border-violet-300 hover:bg-violet-50/40 transition-colors">
                {parsing ? <Loader2 className="w-8 h-8 text-violet-500 animate-spin" /> : <Upload className="w-8 h-8 text-[#9A9AA6]" />}
                <span className="text-sm font-semibold text-[#0A0A0A]">{parsing ? t("Analyse des fichiers…", "Analyzing the files…") : t("Choisir un ou plusieurs fichiers", "Choose one or more files")}</span>
                <span className="text-[12px] text-[#9A9A97] max-w-sm text-center">{t("CSV ou Excel · sélectionnez plusieurs fichiers en même temps. Biltia détecte chaque type de données et les répartit au bon endroit.", "CSV or Excel · select several files at once. Biltia detects each data type and sorts them to the right place.")}</span>
              </button>
              <input ref={fileRef} type="file" multiple accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFile} />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {fileNames.length === 1 ? (
                    <p className="text-[13px] text-[#6E6E6C] truncate"><span className="font-medium text-[#0A0A0A]">{fileNames[0]}</span></p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {fileNames.map((n) => (
                        <span key={n} className="text-[12px] font-medium bg-violet-50 text-violet-700 border border-violet-100 rounded-full px-2.5 py-0.5 truncate max-w-[200px]">{n}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={reset} className="flex-shrink-0 text-[12px] font-medium text-violet-600 hover:opacity-80">{t("Changer", "Change")}</button>
              </div>
              {plans.map((plan, i) => {
                const summary = planSummary(plan);
                return (
                  <div key={i} className="border border-[#ECECF2] rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#0A0A0A] truncate">{plan.name}</p>
                        <p className="text-[11px] text-[#9A9A97]">{t(`${plan.rows.length} lignes · ${plan.headers.length} colonnes`, `${plan.rows.length} rows · ${plan.headers.length} columns`)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-[#9A9A97]">{t("Type principal", "Main type")}</span>
                        <Dropdown
                          value={plan.primary}
                          onChange={(v) => setPrimary(i, v)}
                          ariaLabel={t("Type principal", "Main type")}
                          size="sm"
                          className="w-40"
                          options={ENTITY_ORDER.map((e) => ({ value: e, label: tEntityLabel(locale, e) }))}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {summary.map((s) => (
                        <span key={s.entity} className={`text-[12px] font-semibold px-2.5 py-1 rounded-full ${ENTITY_META[s.entity]?.accent ?? "bg-violet-50 text-violet-600"}`}>
                          {s.count} {tEntityLabel(locale, s.entity)}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97] mb-2">{t("Répartition des colonnes", "Column distribution")}</p>
                    <div className="space-y-1.5">
                      {plan.headers.map((h) => {
                        const sel = plan.cols[h] ?? { entity: "", field: "" };
                        return (
                          <div key={h} className="flex items-center gap-2.5">
                            <span className="flex-1 min-w-0 text-[13px] text-[#0A0A0A] truncate bg-[#F6F6F9] border border-[#ECECF2] rounded-lg px-3 py-2">{h}</span>
                            <ArrowRight className="w-4 h-4 text-[#C9C9C4] flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <Dropdown
                                value={sel.entity}
                                onChange={(v) => setCol(i, h, v)}
                                ariaLabel={t(`Entité de la colonne ${h}`, `Entity for column ${h}`)}
                                size="sm"
                                options={[
                                  { value: "", label: t("Ignorer", "Ignore") },
                                  ...ENTITY_ORDER.map((e) => ({ value: e, label: tEntityLabel(locale, e) })),
                                ]}
                              />
                              {sel.entity && sel.field && (
                                <span className="block text-[10.5px] text-[#9A9A97] mt-0.5 ml-1 truncate">
                                  {tFieldLabel(locale, sel.field)}{sel.entity !== plan.primary && sel.field === NAME_FIELD[sel.entity] ? t(" · relié", " · linked") : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {error && (
            <div className="mt-4 flex items-start gap-2 text-[13px] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
        </div>

        {!results && plans.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#ECECF2] flex-shrink-0">
            <span className="text-[12px] text-[#9A9A97]">{t(`${plans.length} feuille${plans.length > 1 ? "s" : ""} · ${plans.reduce((s, p) => s + p.rows.length, 0)} lignes au total`, `${plans.length} sheet${plans.length > 1 ? "s" : ""} · ${plans.reduce((s, p) => s + p.rows.length, 0)} rows total`)}</span>
            <button onClick={doImport} disabled={importing} className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white font-semibold px-6 py-2.5 rounded-full shadow-[0_10px_26px_rgba(124,58,190,0.32)] hover:brightness-105 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t("Importer et répartir", "Import and sort")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Export CSV / Excel ──────────────────────────────────────────────────────
// Miroir de l'import : le patron télécharge ses données (pour sa fiduciaire).
// Le fichier est généré côté serveur (/api/export) : auth + tenant + RLS.
function downloadFile(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ─── CHAMP À VOCABULAIRE : jamais de saisie libre là où un agent filtre ──────
//
// Court (< 12 valeurs) → liste déroulante classique.
// Long (corps de métier : ~50 métiers) → RECHERCHE. Personne ne fait défiler
// cinquante lignes : on tape « élec » (ou « carreleur », un nom de personne) et le
// bon métier remonte. Le reste est groupé par famille, familles et métiers triés
// de A à Z, pour retrouver à l'œil quand on ne sait pas quoi taper.
// « Autre » ouvre un champ « Précisez » : on stocke `autre:carreleur_mosaiste`,
// donc une valeur toujours canonique, jamais une chaîne libre dans la nature.

const INPUT_CLS =
  "w-full rounded-xl border border-[#E7E7EE] bg-white px-3.5 py-2.5 text-[13.5px] text-[#0A0A0A] placeholder-[#B4B8C2] focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 transition-all";

function VocabField({
  vocabId,
  value,
  onChange,
  locale,
}: {
  vocabId: string;
  value: string;
  onChange: (v: string) => void;
  locale: Locale;
}) {
  const vocab = VOCABS[vocabId];
  const [base, precision] = splitAutre(value || "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const tt = (fr: string, en: string) => (locale === "en" ? en : fr);

  const groups = useMemo(() => {
    if (!vocab?.searchable) return [];
    const q = slugify(query);
    const matched = vocab.options.filter((o) => {
      if (!q) return true;
      const keys = [o.value, o.label, ...(o.aliases ?? [])].map(slugify);
      return keys.some((k) => k.includes(q));
    });
    const byGroup = new Map<string, typeof matched>();
    for (const o of matched) {
      const g = o.group ?? "";
      byGroup.set(g, [...(byGroup.get(g) ?? []), o]);
    }
    return [...byGroup.entries()]
      .map(([g, opts]) => ({ group: g, options: [...opts].sort((a, b) => a.label.localeCompare(b.label, "fr")) }))
      .sort((a, b) => a.group.localeCompare(b.group, "fr"));
  }, [vocab, query]);

  if (!vocab) return null;

  const precisionInput =
    base === "autre" ? (
      <input
        type="text"
        value={(precision ?? "").replace(/_/g, " ")}
        onChange={(e) => onChange(e.target.value.trim() ? `autre:${e.target.value}` : "autre")}
        placeholder={tt("Précisez…", "Specify…")}
        className={`${INPUT_CLS} mt-2`}
      />
    ) : null;

  // Liste courte : un <select> suffit, et reste le plus rapide au doigt.
  if (!vocab.searchable) {
    return (
      <>
        <select value={base} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS}>
          <option value="">—</option>
          {vocab.options.map((o) => (
            <option key={o.value} value={o.value}>
              {vocabLabel(vocabId, o.value, locale)}
            </option>
          ))}
        </select>
        {precisionInput}
      </>
    );
  }

  // Liste longue : recherche + familles.
  return (
    <>
      <div className="relative">
        <input
          type="text"
          value={open ? query : base ? vocabLabel(vocabId, value, locale) : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={tt("Rechercher un métier…", "Search a trade…")}
          className={INPUT_CLS}
        />
        {base && !open && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#B4B8C2] hover:text-[#0A0A0A] p-1"
            aria-label={tt("Effacer", "Clear")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {open && (
          <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-[#E7E7EE] bg-white shadow-[0_20px_60px_rgba(20,20,50,0.18)]">
            {groups.length === 0 ? (
              <p className="px-3.5 py-3 text-[12.5px] text-[#9A9A97]">{tt("Aucun métier trouvé.", "No trade found.")}</p>
            ) : (
              groups.map((g) => (
                <div key={g.group}>
                  {g.group && (
                    <p className="sticky top-0 bg-[#FAFAFC] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97]">
                      {g.group}
                    </p>
                  )}
                  {g.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className={`block w-full text-left px-3.5 py-2 text-[13px] hover:bg-violet-50 ${
                        o.value === base ? "text-violet-700 font-semibold" : "text-[#0A0A0A]"
                      }`}
                    >
                      {vocabLabel(vocabId, o.value, locale)}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {precisionInput}
    </>
  );
}

// ─── AJOUT MANUEL : modal générique pilotée par FORM_FIELDS ──────────────────
// Chaque entité expose ses champs PERTINENTS (curés dans lib/data-entities.ts).
// Les champs de relation (client_id…) sont des <select> peuplés depuis le
// workspace — jamais de saisie libre d'un nom qui existe déjà.
// Valeurs de départ d'un formulaire d'édition : ligne existante → champs du form.
/** Une valeur de formulaire : texte, case à cocher, ou liste de mots (colonne text[]). */
type FormValue = string | boolean | string[];

function initialFormValues(fields: FormField[], row?: Row | null): Record<string, FormValue> {
  if (!row) return {};
  const init: Record<string, FormValue> = {};
  for (const f of fields) {
    const raw = row[f.key];
    if (raw === null || raw === undefined) continue;
    if (f.type === "checkbox") init[f.key] = raw === true;
    else if (f.type === "tags") init[f.key] = Array.isArray(raw) ? raw.map(String) : [];
    else if (f.type === "date") init[f.key] = String(raw).slice(0, 10); // timestamptz → AAAA-MM-JJ
    else init[f.key] = String(raw);
  }
  return init;
}

// Modal d'ajout OU de modification (même formulaire). `row` fourni → mode édition.
function RecordFormModal({
  entity, row, onClose, onSaved,
}: { entity: string; row?: Row | null; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const locale = useLocale();
  const isEdit = !!row;
  const fields = FORM_FIELDS[entity] ?? [];
  const [values, setValues] = useState<Record<string, FormValue>>(() => initialFormValues(fields, row));
  const [relOptions, setRelOptions] = useState<Record<string, { id: string; label: string }[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Options des relations : chargées une fois à l'ouverture.
  useEffect(() => {
    const relations = [...new Set(fields.filter((f) => f.type === "relation" && f.relation).map((f) => f.relation as string))];
    relations.forEach(async (rel) => {
      try {
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity: rel, action: "list", order: "created_at", ascending: false, limit: 200 }),
        });
        const j = await res.json();
        const cols = RELATION_DISPLAY[rel] ?? ["nom"];
        const opts = ((j.data ?? []) as Row[]).map((r) => ({
          id: String(r.id),
          label: cols.map((c) => r[c]).filter(Boolean).join(" ") || t("(sans nom)", "(no name)"),
        }));
        setRelOptions((prev) => ({ ...prev, [rel]: opts }));
      } catch {
        /* select vide = optionnel */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const set = (key: string, v: FormValue) => setValues((prev) => ({ ...prev, [key]: v }));

  // Cible de relation « créable à la volée » : sa SEULE contrainte requise est un
  // champ texte (nom / désignation…). On peut alors la créer sans quitter le form.
  const quickCreateField = (rel: string): { key: string; label: string } | null => {
    const req = (FORM_FIELDS[rel] ?? []).filter((ff) => ff.required);
    if (req.length === 1 && req[0].type === "text") return { key: req[0].key, label: req[0].label };
    return null;
  };
  // Crée la fiche liée (prompt du seul champ requis), l'ajoute aux options et la
  // sélectionne — on reste dans le formulaire courant.
  const createRelated = async (rel: string, fieldKey: string) => {
    const spec = quickCreateField(rel);
    if (!spec) { set(fieldKey, ""); return; }
    const name = window.prompt(`${fieldLabel(spec.label, locale)} :`, "");
    if (!name || !name.trim()) { set(fieldKey, ""); return; }
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: rel, action: "create", values: { [spec.key]: name.trim() } }),
      });
      const j = await res.json();
      if (!res.ok || !j?.data?.id) { set(fieldKey, ""); return; }
      const cols = RELATION_DISPLAY[rel] ?? ["nom"];
      const label = cols.map((c) => j.data[c]).filter(Boolean).join(" ") || name.trim();
      setRelOptions((prev) => ({ ...prev, [rel]: [{ id: String(j.data.id), label }, ...(prev[rel] ?? [])] }));
      set(fieldKey, String(j.data.id));
    } catch {
      set(fieldKey, "");
    }
  };

  const submit = async () => {
    // Champs requis d'abord — message clair plutôt qu'une erreur SQL.
    for (const f of fields) {
      if (f.required && !String(values[f.key] ?? "").trim()) {
        setError(t(`« ${f.label} » est requis.`, `“${fieldLabel(f.label, locale)}” is required.`));
        return;
      }
    }
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (f.type === "checkbox") { payload[f.key] = v === true; continue; }
      // `tags` (colonne text[]) : on envoie un VRAI tableau. Une liste vidée devient
      // un tableau vide, jamais null — la colonne est `not null default '{}'`.
      if (f.type === "tags") {
        const arr = Array.isArray(v) ? v : [];
        if (arr.length || isEdit) payload[f.key] = arr;
        continue;
      }
      const s = typeof v === "string" ? v.trim() : "";
      if (s !== "") {
        payload[f.key] = f.type === "number" ? Number(s) : s;
      } else if (isEdit) {
        // Champ vidé en édition : on l'efface (→ null) SEULEMENT s'il avait une
        // valeur avant. Sinon on l'omet (évite d'écraser un défaut serveur en null).
        const had = row && row[f.key] != null && String(row[f.key]).trim() !== "";
        if (had) payload[f.key] = null;
      }
    }
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? { entity, action: "update", id: row!.id, values: payload }
            : { entity, action: "create", values: payload }
        ),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? t("Enregistrement impossible.", "Save failed."));
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError(t("Enregistrement impossible.", "Save failed."));
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-[#E7E7EE] bg-white px-3.5 py-2.5 text-[13.5px] text-[#0A0A0A] placeholder-[#B4B8C2] focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 transition-all";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem-var(--safe-top)-var(--safe-bottom))] overflow-y-auto bg-white rounded-3xl shadow-[0_30px_90px_rgba(20,20,50,0.25)] p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[16px] font-bold text-[#0A0A0A] tracking-[-0.02em]">
            {isEdit ? t("Modifier", "Edit") : t("Ajouter", "Add")} — {tEntityLabel(locale, entity)}
          </h3>
          <button onClick={onClose} className="text-[#9A9A97] hover:text-[#0A0A0A] transition-colors" aria-label={t("Fermer", "Close")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {fields.map((f: FormField) => (
            <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
              <label className="block text-[12px] font-semibold text-[#6E6E6C] mb-1.5">
                {fieldLabel(f.label, locale)} {f.required && <span className="text-rose-500">*</span>}
              </label>
              {f.type === "select" && f.vocab ? (
                <VocabField vocabId={f.vocab} value={String(values[f.key] ?? "")} onChange={(v) => set(f.key, v)} locale={locale} />
              ) : f.type === "select" ? (
                <select value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>{optionLabel(o, locale)}</option>
                  ))}
                </select>
              ) : f.type === "relation" ? (
                <select
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => { const v = e.target.value; if (v === "__new") createRelated(f.relation ?? "", f.key); else set(f.key, v); }}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {(relOptions[f.relation ?? ""] ?? []).map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                  {quickCreateField(f.relation ?? "") && <option value="__new">{t("+ Créer…", "+ Create…")}</option>}
                </select>
              ) : f.type === "tags" ? (
                // Colonne text[] (les alias d'un article du catalogue). On saisit en
                // clair, séparé par des virgules, et on stocke un VRAI tableau : envoyer
                // la chaîne telle quelle ferait échouer l'insert Postgres.
                <input
                  type="text"
                  value={Array.isArray(values[f.key]) ? (values[f.key] as string[]).join(", ") : String(values[f.key] ?? "")}
                  onChange={(e) =>
                    set(
                      f.key,
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }
                  placeholder={fieldPlaceholder(f.placeholder, locale)}
                  className={inputCls}
                />
              ) : f.type === "textarea" ? (
                <textarea rows={2} value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} placeholder={fieldPlaceholder(f.placeholder, locale)} className={inputCls} />
              ) : f.type === "checkbox" ? (
                <label className="inline-flex items-center gap-2 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={values[f.key] === true}
                    onChange={(e) => set(f.key, e.target.checked)}
                    className="w-4 h-4 rounded border-[#D4D4DE] text-violet-600 focus:ring-violet-500/40"
                  />
                  <span className="text-[13px] text-[#0A0A0A]">{t("Oui", "Yes")}</span>
                </label>
              ) : (
                <input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={fieldPlaceholder(f.placeholder, locale)}
                  className={inputCls}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2.5 mt-6">
          <button onClick={onClose} className="rounded-full border border-[#E7E7E4] px-4 py-2 text-[13px] font-semibold text-[#0A0A0A] hover:border-[#C9C9C4] transition-colors">
            {t("Annuler", "Cancel")}
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isEdit ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {isEdit ? t("Enregistrer", "Save") : t("Ajouter", "Add")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportButton({ entity, label }: { entity: string; label?: string }) {
  const t = useT();
  const btnLabel = label ?? t("Exporter", "Export");
  const [open, setOpen] = useState(false);
  const isAll = entity === "all";
  const go = (format: "xlsx" | "csv") => {
    downloadFile(`/api/export?entity=${encodeURIComponent(entity)}&format=${format}`);
    setOpen(false);
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0A0A0A] bg-white border border-[#E7E7EE] rounded-full px-3.5 py-1.5 hover:border-[#C9C9C4] transition-colors"
      >
        <Download className="w-3.5 h-3.5" /> {btnLabel}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1.5 z-50 w-52 bg-white border border-[#ECECF2] rounded-xl shadow-[0_18px_50px_rgba(20,20,50,0.18)] overflow-hidden py-1">
            <button onClick={() => go("xlsx")} className="flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-[13px] text-[#0A0A0A] hover:bg-black/[0.04] transition-colors">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Excel <span className="text-[#9A9A97]">(.xlsx{isAll ? t(", tout", ", all") : ""})</span></span>
            </button>
            {!isAll && (
              <button onClick={() => go("csv")} className="flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-[13px] text-[#0A0A0A] hover:bg-black/[0.04] transition-colors">
                <FileText className="w-4 h-4 text-sky-600 flex-shrink-0" />
                <span>CSV <span className="text-[#9A9A97]">{t("(pour la compta)", "(for accounting)")}</span></span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function WorkspacePage() {
  const t = useT();
  const locale = useLocale();
  const [data, setData] = useState<DataMap>({});
  const [appsCount, setAppsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null); // entité sélectionnée (null = vue d'ensemble)
  const [drawer, setDrawer] = useState<{ entity: string; id: string } | null>(null);
  const [importEntity, setImportEntity] = useState<string | null>(null);
  const [importAll, setImportAll] = useState(false);
  const [addEntity, setAddEntity] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<{ entity: string; row: Row } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ⚠️ AVANT : 25 `POST /api/data`, un par entité — et CHACUN refaisait côté serveur
  // getUser() → membership → requête. Soit ~78 allers-retours pour UN affichage, que
  // le navigateur étalait en cinq vagues (il ne tient que ~6 connexions à la fois).
  // Le comptage des apps, lui, attendait EN SÉRIE derrière les 25, alors que rien ne
  // l'y obligeait.
  //
  // MAINTENANT : un seul appel groupé (/api/data/batch) — une authentification, un
  // périmètre employé, 25 lectures en parallèle CÔTÉ SERVEUR, où Supabase est à
  // quelques millisecondes. Et le comptage des apps part EN MÊME TEMPS.
  const { membership, loading: sessionLoading } = useSession();

  const load = useCallback(async () => {
    setLoading(true);

    const tenantId = membership?.tenant_id ?? null;
    const supabase = createClient();

    const [batch, appsRes] = await Promise.all([
      // Les 25 entités, en UN appel.
      fetch("/api/data/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entities: ENTITY_ORDER, limit: 200 }),
      })
        .then((r) => (r.ok ? r.json() : { data: {} }))
        .catch(() => ({ data: {} })),
      // Applications du workspace ACTIF uniquement — cloisonné comme les données.
      tenantId
        ? supabase
            .from("modules")
            .select("id", { count: "exact", head: true })
            .eq("status", "active")
            .eq("tenant_id", tenantId)
        : Promise.resolve({ count: 0 }),
    ]);

    const rows = (batch?.data ?? {}) as Record<string, Row[]>;
    // Toute entité absente de la réponse ressort en tableau vide : la page s'affiche
    // toujours, même si une section a échoué côté serveur.
    setData(Object.fromEntries(ENTITY_ORDER.map((k) => [k, rows[k] ?? []])));
    setAppsCount(appsRes?.count ?? 0);
    setLoading(false);
  }, [membership?.tenant_id]);

  useEffect(() => {
    if (sessionLoading) return; // on attend que la session partagée soit résolue
    load();
  }, [sessionLoading, load]);

  const openDrawer = useCallback((entity: string, id: string) => setDrawer({ entity, id }), []);

  // Sélection multiple pour suppression, réinitialisée quand on change d'entité.
  useEffect(() => { setSelectedIds(new Set()); }, [selected]);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  // Tout sélectionner / tout désélectionner pour l'entité affichée.
  const toggleSelectAll = (ids: string[]) =>
    setSelectedIds((prev) => (prev.size >= ids.length && ids.length > 0 ? new Set() : new Set(ids)));
  const deleteSelected = async () => {
    if (!selected || selectedIds.size === 0) return;
    if (!window.confirm(t(`Supprimer ${selectedIds.size} élément(s) ? Cette action est définitive.`, `Delete ${selectedIds.size} item(s)? This action is permanent.`))) return;
    await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: selected, action: "bulk_delete", ids: Array.from(selectedIds) }),
    });
    setSelectedIds(new Set());
    load();
  };

  const total = useMemo(
    () => ENTITY_ORDER.reduce((n, k) => n + (data[k]?.length ?? 0), 0),
    [data]
  );

  // Recherche globale sur toutes les entités chargées
  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return [];
    const out: { entity: string; row: Row }[] = [];
    for (const entity of ENTITY_ORDER) {
      for (const row of data[entity] ?? []) {
        if (norm(ENTITY_META[entity].search(row)).includes(q)) out.push({ entity, row });
      }
    }
    return out.slice(0, 40);
  }, [query, data]);

  const searching = query.trim().length > 0;

  return (
    <div className="min-h-full bg-[#FCFCFD]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center flex-shrink-0">
            <Boxes className="w-5 h-5 text-violet-600" />
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-[#0A0A0A] tracking-[-0.03em]">{t("Workspace", "Workspace")}</h1>
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
            {total > 0 && <ExportButton entity="all" label={t("Exporter", "Export")} />}
            <button
              onClick={() => setImportAll(true)}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white text-[13px] font-semibold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full shadow-[0_8px_22px_rgba(124,58,190,0.30)] hover:brightness-105 active:scale-[0.98] transition"
            >
              <Upload className="w-4 h-4" /> <span className="hidden xs:inline">{t("Importer des données", "Import data")}</span><span className="xs:hidden">{t("Importer", "Import")}</span>
            </button>
          </div>
        </div>
        <p className="text-[14px] text-[#6E6E6C] mb-6 ml-0 sm:ml-12">
          {t("La mémoire de votre entreprise.", "Your company's memory.")} {loading ? t("Chargement…", "Loading…") : t(`${total} éléments reliés.`, `${total} linked items.`)}
        </p>

        {/* Recherche globale */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#9A9AA6]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Rechercher partout : un client, un chantier, un document…", "Search everywhere: a client, a job site, a document…")}
            className="w-full pl-12 pr-11 py-3.5 rounded-2xl border border-[#E7E7EE] bg-white text-[14px] text-[#0A0A0A] placeholder-[#9A9AA6] focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 transition-all"
          />
          {searching && (
            <button onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9A9A97] hover:text-[#0A0A0A]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-[#9A9A97]">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : searching ? (
          // ─── Résultats de recherche ─────────────────────────────────────
          <div>
            <p className="text-[13px] text-[#6E6E6C] mb-3">
              {t(`${results.length} résultat${results.length > 1 ? "s" : ""} pour « ${query.trim()} »`, `${results.length} result${results.length > 1 ? "s" : ""} for “${query.trim()}”`)}
            </p>
            {results.length === 0 ? (
              <p className="text-sm text-[#9A9A97] py-12 text-center">{t("Rien trouvé dans votre mémoire.", "Nothing found in your memory.")}</p>
            ) : (
              <div className="bg-white border border-[#E7E7E4] rounded-2xl p-2 divide-y divide-[#F1F1EC]">
                {results.map(({ entity, row }) => (
                  <div key={`${entity}-${row.id}`} className="py-0.5">
                    <RelatedItem entity={entity} row={row} onOpen={openDrawer} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : selected ? (
          // ─── Vue d'une entité ───────────────────────────────────────────
          <div>
            <button
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6E6E6C] hover:text-[#0A0A0A] mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> {t("Vue d'ensemble", "Overview")}
            </button>
            <div className="flex items-center gap-2.5 mb-4 flex-wrap">
              {(() => { const I = ENTITY_META[selected].icon; return (
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${ENTITY_META[selected].accent}`}>
                  <I className="w-5 h-5" />
                </span>
              ); })()}
              <h2 className="text-lg font-bold text-[#0A0A0A]">{tEntityLabel(locale, selected)}</h2>
              <span className="text-[13px] text-[#9A9A97] tabular-nums">{data[selected]?.length ?? 0}</span>
              <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                <ExportButton entity={selected} />
                <button
                  onClick={() => setImportEntity(selected)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-3.5 py-1.5 hover:bg-violet-100 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" /> {t("Importer", "Import")}
                </button>
                {FORM_FIELDS[selected] && (
                  <button
                    onClick={() => setAddEntity(selected)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#0A0A0A] rounded-full px-3.5 py-1.5 hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-3.5 h-3.5" /> {t("Ajouter", "Add")}
                  </button>
                )}
              </div>
            </div>
            {(data[selected]?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-2xl border border-[#E7E7EE] bg-[#FAFAFC] flex items-center justify-center mb-3 text-[#B4B8C2]">
                  <Upload className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <p className="text-[14px] font-semibold text-[#0A0A0A] mb-1">{t("Aucun élément pour le moment", "Nothing here yet")}</p>
                <p className="text-[13px] text-[#9A9A97] max-w-xs leading-relaxed mb-4">
                  {t(`Ajoutez une fiche à la main, ou importez vos ${ENTITY_META[selected].label.toLowerCase()} en masse (Excel ou CSV).`, `Add a record by hand, or bulk-import your ${tEntityLabel(locale, selected).toLowerCase()} (Excel or CSV).`)}
                </p>
                {FORM_FIELDS[selected] && (
                  <button
                    onClick={() => setAddEntity(selected)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#0A0A0A] rounded-full px-4 py-2 hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-3.5 h-3.5" /> {t(`Ajouter ${ENTITY_META[selected].label.toLowerCase().replace(/s$/, "")}`, `Add ${tEntityLabel(locale, selected).toLowerCase().replace(/s$/, "")}`)}
                  </button>
                )}
              </div>
            ) : (
              <>
                {selectedIds.size > 0 && (
                  <div className="flex items-center justify-between gap-3 mb-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5">
                    <span className="text-[13px] font-semibold text-violet-800 tabular-nums">
                      {t(`${selectedIds.size} sélectionné${selectedIds.size > 1 ? "s" : ""}`, `${selectedIds.size} selected`)}
                    </span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSelectedIds(new Set())} className="text-[13px] font-medium text-[#6E6E6C] hover:text-[#0A0A0A]">{t("Annuler", "Cancel")}</button>
                      <button onClick={deleteSelected} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-full px-3.5 py-1.5 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> {t("Supprimer", "Delete")}
                      </button>
                    </div>
                  </div>
                )}
                <div className="bg-white border border-[#E7E7E4] rounded-2xl p-2 divide-y divide-[#F1F1EC]">
                  {/* En-tête : tout sélectionner d'un coup */}
                  {(() => {
                    const ids = (data[selected] ?? []).map((r) => String(r.id));
                    const allSelected = ids.length > 0 && selectedIds.size >= ids.length;
                    const someSelected = selectedIds.size > 0 && !allSelected;
                    return (
                      <label className="flex items-center gap-1 pl-2.5 py-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected; }}
                          onChange={() => toggleSelectAll(ids)}
                          aria-label={t("Tout sélectionner", "Select all")}
                          className="w-4 h-4 rounded border-[#D4D4DE] text-violet-600 focus:ring-violet-500/40 cursor-pointer flex-shrink-0"
                        />
                        <span className="ml-2 text-[12px] font-medium text-[#9A9A97]">
                          {allSelected ? t("Tout désélectionner", "Deselect all") : t("Tout sélectionner", "Select all")}
                          <span className="tabular-nums"> · {ids.length}</span>
                        </span>
                      </label>
                    );
                  })()}
                  {(data[selected] ?? []).map((row) => (
                    <div key={row.id} className={`group/row flex items-center gap-1 pl-2.5 pr-2 py-0.5 rounded-xl ${selectedIds.has(row.id) ? "bg-violet-50/70" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={t("Sélectionner", "Select")}
                        className="w-4 h-4 rounded border-[#D4D4DE] text-violet-600 focus:ring-violet-500/40 cursor-pointer flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <RelatedItem entity={selected} row={row} onOpen={openDrawer} />
                      </div>
                      {FORM_FIELDS[selected] && (
                        <button
                          onClick={() => setEditRecord({ entity: selected, row })}
                          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[#9A9A97] opacity-0 group-hover/row:opacity-100 show-touch hover:bg-black/[0.05] hover:text-[#0A0A0A] transition-all"
                          title={t("Modifier", "Edit")}
                          aria-label={t("Modifier", "Edit")}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          // ─── Vue d'ensemble ─────────────────────────────────────────────
          <div className="space-y-9">
            {ENTITY_GROUPS.map((group) => (
              <section key={group.title}>
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.09em] text-[#A6A6B2]">{tGroupTitle(locale, group.title)}</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {group.entities.map((entity) => (
                    <EntityTile key={entity} entity={entity} rows={data[entity] ?? []} onClick={() => setSelected(entity)} />
                  ))}
                </div>
              </section>
            ))}

            {/* Vos créations Biltia — objets plateforme (≠ données métier), vers la Bibliothèque */}
            <section>
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.09em] text-[#A6A6B2]">{t("Vos créations", "Your creations")}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <Link href="/library" className="group flex flex-col text-left rounded-[20px] border border-[#EBEBF1] bg-white p-[18px] shadow-[0_12px_40px_rgba(60,40,120,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#DBD3F1] hover:shadow-[0_26px_64px_rgba(60,40,120,0.15)]">
                  <div className="mb-3.5 flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-[14px] text-white shadow-[0_8px_20px_rgba(80,50,160,0.24)] transition-transform duration-300 group-hover:scale-[1.06]" style={{ background: "linear-gradient(135deg, #F472B6, #EC4899)" }}><AppWindow className="h-5 w-5" /></span>
                    <span className={`text-[19px] font-black tabular-nums tracking-[-0.03em] ${appsCount ? "text-[#0A0A0A]" : "text-[#D3D3DC]"}`}>{appsCount ?? "—"}</span>
                  </div>
                  <h3 className="flex items-center gap-1 text-[14px] font-semibold leading-tight tracking-[-0.01em] text-[#0A0A0A]">{t("Applications", "Apps")} <ChevronRight className="h-3.5 w-3.5 text-[#C9C9C4] group-hover:text-[#6E6E6C]" /></h3>
                  <p className="mt-0.5 text-[11.5px] text-[#9A9AA6]">{t("Dans la Bibliothèque", "In the Library")}</p>
                </Link>

                <Link href="/library" className="group flex flex-col text-left rounded-[20px] border border-[#EBEBF1] bg-white p-[18px] shadow-[0_12px_40px_rgba(60,40,120,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#DBD3F1] hover:shadow-[0_26px_64px_rgba(60,40,120,0.15)]">
                  <div className="mb-3.5 flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-[14px] text-white shadow-[0_8px_20px_rgba(80,50,160,0.24)] transition-transform duration-300 group-hover:scale-[1.06]" style={{ background: "linear-gradient(135deg, #818CF8, #6366F1)" }}><GitBranch className="h-5 w-5" /></span>
                  </div>
                  <h3 className="flex items-center gap-1 text-[14px] font-semibold leading-tight tracking-[-0.01em] text-[#0A0A0A]">{t("Automatisations", "Automations")} <ChevronRight className="h-3.5 w-3.5 text-[#C9C9C4] group-hover:text-[#6E6E6C]" /></h3>
                  <p className="mt-0.5 text-[11.5px] text-[#9A9AA6]">{t("Vos contrôles par lot", "Your batch checks")}</p>
                </Link>

                <Link href="/library" className="group flex flex-col text-left rounded-[20px] border border-[#EBEBF1] bg-white p-[18px] shadow-[0_12px_40px_rgba(60,40,120,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#DBD3F1] hover:shadow-[0_26px_64px_rgba(60,40,120,0.15)]">
                  <div className="mb-3.5 flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-[14px] text-white shadow-[0_8px_20px_rgba(80,50,160,0.24)] transition-transform duration-300 group-hover:scale-[1.06]" style={{ background: "linear-gradient(135deg, #A78BFA, #8B5CF6)" }}><MessageSquare className="h-5 w-5" /></span>
                  </div>
                  <h3 className="flex items-center gap-1 text-[14px] font-semibold leading-tight tracking-[-0.01em] text-[#0A0A0A]">{t("Conversations", "Conversations")} <ChevronRight className="h-3.5 w-3.5 text-[#C9C9C4] group-hover:text-[#6E6E6C]" /></h3>
                  <p className="mt-0.5 text-[11.5px] text-[#9A9AA6]">{t("L'historique du chat", "Your chat history")}</p>
                </Link>
              </div>
            </section>
          </div>
        )}

        {/* État vide global (vue d'ensemble uniquement) */}
        {!loading && !searching && !selected && total === 0 && appsCount === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center mt-4">
            <div className="w-14 h-14 rounded-2xl border border-[#E7E7EE] bg-[#FAFAFC] flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-violet-600" strokeWidth={1.5} />
            </div>
            <h3 className="text-base font-bold text-[#0A0A0A] mb-1.5">{t("Votre mémoire est encore vide", "Your memory is still empty")}</h3>
            <p className="text-sm text-[#6E6E6C] max-w-sm leading-relaxed">
              {t("Dès que Biltia traitera vos chantiers, clients et documents, tout apparaîtra ici, relié.", "As soon as Biltia handles your job sites, clients and documents, everything will appear here, linked.")}
            </p>
          </div>
        )}
      </div>

      {drawer && (
        <DetailDrawer
          entity={drawer.entity}
          id={drawer.id}
          data={data}
          onClose={() => setDrawer(null)}
          onOpen={openDrawer}
          onRefresh={load}
          onEdit={(entity, row) => setEditRecord({ entity, row })}
        />
      )}

      {importEntity && (
        <ImportModal
          entity={importEntity}
          onClose={() => setImportEntity(null)}
          onImported={load}
        />
      )}

      {importAll && (
        <DispatchImportModal
          onClose={() => setImportAll(false)}
          onImported={load}
        />
      )}

      {addEntity && (
        <RecordFormModal
          entity={addEntity}
          onClose={() => setAddEntity(null)}
          onSaved={load}
        />
      )}

      {editRecord && (
        <RecordFormModal
          entity={editRecord.entity}
          row={editRecord.row}
          onClose={() => setEditRecord(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
