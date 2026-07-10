// Métadonnées CLIENT-SAFE des modèles mis en avant (galerie).
// Le HTML complet vit dans data/templates-html.ts et est servi par /t/[id]
// (jamais importé côté client → bundle léger).

export type TemplatePreview = {
  id: string;
  name: string;
  category: string;
  accent: string;
  tagline: string;
};

export const TEMPLATE_PREVIEWS: TemplatePreview[] = [
  { id: "suivi_chantiers", name: "Suivi de chantiers", category: "Gestion", accent: "#4F46E5", tagline: "Tableau de bord, chantiers, équipe et matériel — en direct." },
  { id: "finance_budgets", name: "Finance & recouvrement", category: "Finance", accent: "#6D5EF6", tagline: "Cash bloqué, DSO, relances : pilotez votre trésorerie." },
  { id: "devis_factures", name: "Devis à la voix", category: "Commercial", accent: "#0D9488", tagline: "Dictez vos devis, ils se rédigent et s'envoient seuls." },
  { id: "equipes_taches", name: "Équipes & tâches", category: "Équipe", accent: "#EA580C", tagline: "Kanban plein écran : glissez les tâches, suivez la charge." },
  { id: "planning_chantier", name: "Planning chantier", category: "Planning", accent: "#0284C7", tagline: "Affectez vos équipes aux chantiers, semaine par semaine." },
  { id: "pointage_equipes", name: "Pointage des heures", category: "RH", accent: "#DB2777", tagline: "Pointez le temps, validez d'une coche, zéro feuille perdue." },
  { id: "sous_traitants", name: "Sous-traitance & conformité", category: "Conformité", accent: "#334155", tagline: "Assurance décennale, échéances, relances. Alertes 30 jours avant." },
  { id: "crm_clients", name: "CRM — Pipeline commercial", category: "Commercial", accent: "#059669", tagline: "De la piste au chantier signé : suivez tout votre pipeline." },
  { id: "sav_maintenance", name: "SAV & maintenance", category: "Maintenance", accent: "#0891B2", tagline: "Dépannages, contrats d'entretien, parc client : tout le récurrent." },
  { id: "stock_achats", name: "Stock & achats", category: "Stock", accent: "#B45309", tagline: "Inventaire, seuils d'alerte et réappro par fournisseur en un clic." },
];
