// Métadonnées CLIENT-SAFE des modèles mis en avant (galerie).
// Le HTML complet vit dans data/templates-html.ts et est servi par /t/[id]
// (jamais importé côté client → bundle léger).

import type { Locale } from "@/lib/i18n/config";

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

// ── i18n : nom / catégorie / accroche EN (galerie de modèles). id + accent inchangés.
const TEMPLATE_PREVIEW_EN: Record<string, { name: string; category: string; tagline: string }> = {
  suivi_chantiers:   { name: "Job-site tracking",          category: "Management",  tagline: "Dashboard, job sites, team and equipment — live." },
  finance_budgets:   { name: "Finance & collections",      category: "Finance",     tagline: "Cash locked up, DSO, follow-ups: steer your cash flow." },
  devis_factures:    { name: "Voice quotes",               category: "Sales",       tagline: "Dictate your quotes; they write and send themselves." },
  equipes_taches:    { name: "Teams & tasks",              category: "Team",        tagline: "Full-screen kanban: drag tasks, track the workload." },
  planning_chantier: { name: "Job-site schedule",          category: "Scheduling",  tagline: "Assign your teams to job sites, week by week." },
  pointage_equipes:  { name: "Time tracking",              category: "HR",          tagline: "Log time, approve with a tick, zero lost sheets." },
  sous_traitants:    { name: "Subcontracting & compliance", category: "Compliance", tagline: "Liability insurance, deadlines, follow-ups. Alerts 30 days ahead." },
  crm_clients:       { name: "CRM — Sales pipeline",       category: "Sales",       tagline: "From lead to signed job: track your whole pipeline." },
  sav_maintenance:   { name: "After-sales & maintenance",  category: "Maintenance", tagline: "Repairs, maintenance contracts, client base: all the recurring." },
  stock_achats:      { name: "Stock & purchasing",         category: "Stock",       tagline: "Inventory, low-stock alerts and supplier reordering in one click." },
};

/** Modèle de galerie avec nom/catégorie/accroche traduits si l'interface est en anglais. */
export function localizeTemplatePreview(tp: TemplatePreview, locale: Locale): TemplatePreview {
  if (locale !== "en") return tp;
  const en = TEMPLATE_PREVIEW_EN[tp.id];
  return en ? { ...tp, ...en } : tp;
}
