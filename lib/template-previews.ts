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
  { id: "suivi_chantiers", name: "Suivi de chantiers", category: "Gestion", accent: "#6366F1", tagline: "Avancement, budget et facturation, en direct." },
  { id: "devis_factures", name: "Devis & Factures", category: "Commercial", accent: "#0D9488", tagline: "Devis et factures BTP, TVA et totaux automatiques." },
  { id: "planning_chantier", name: "Planning chantier", category: "Planning", accent: "#A855F7", tagline: "Vos équipes affectées, semaine par semaine." },
  { id: "pointage_equipes", name: "Pointage des heures", category: "RH", accent: "#F59E0B", tagline: "Heures et heures supp, zéro feuille perdue." },
  { id: "sous_traitants", name: "Sous-traitants", category: "Conformité", accent: "#EF4444", tagline: "QUALIBAT, URSSAF, décennale. Alertes 30 jours avant." },
  { id: "tableau_bord", name: "Tableau de bord", category: "Pilotage", accent: "#3B82F6", tagline: "Toute votre activité BTP d'un coup d'œil." },
];
