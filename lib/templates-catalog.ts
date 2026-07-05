export type Template = {
  slug: string;
  name: string;
  category: "Application" | "Site Web";
  subcategory: string;
  tagline: string;
  desc: string;
  accent: string;
  bg: string;
  previewPath: string;
  features: string[];
  tags: string[];
};

export const TEMPLATES: Template[] = [
  {
    slug: "suivi-chantiers",
    name: "Suivi de Chantiers",
    category: "Application",
    subcategory: "Gestion de projet",
    tagline: "Tous vos chantiers, d'un coup d'œil.",
    desc: "Tableau de bord complet pour suivre l'avancement, la facturation et les équipes de chaque chantier en temps réel.",
    accent: "#EC4899",
    bg: "#F0FDFA",
    previewPath: "/t/suivi-chantiers",
    features: ["Avancement en %", "Suivi facturation", "Statuts chantier", "Filtres & recherche", "Export données"],
    tags: ["Maçonnerie", "Gros œuvre", "TCE", "Toiture"],
  },
  {
    slug: "gestion-devis",
    name: "Gestion des Devis",
    category: "Application",
    subcategory: "Commercial",
    tagline: "Vos devis BTP en 3 minutes.",
    desc: "Créez des devis professionnels avec calcul automatique TVA 10%, sous-totaux par lot et génération PDF.",
    accent: "#3B82F6",
    bg: "#EFF6FF",
    previewPath: "/t/gestion-devis",
    features: ["TVA 10% automatique", "Sous-totaux par lot", "Statuts devis", "Historique client", "Export PDF"],
    tags: ["Maçonnerie", "Plomberie", "Électricité", "Menuiserie"],
  },
  {
    slug: "planning-equipes",
    name: "Planning Équipes",
    category: "Application",
    subcategory: "RH & Planification",
    tagline: "Qui est où, quand.",
    desc: "Planifiez vos équipes par chantier et par semaine. Vue hebdomadaire avec glisser-déposer et alertes de conflit.",
    accent: "#8B5CF6",
    bg: "#F5F3FF",
    previewPath: "/t/planning-equipes",
    features: ["Vue hebdomadaire", "Par chantier", "Alertes conflits", "Résumé horaires", "Mobile-first"],
    tags: ["Gros œuvre", "Second œuvre", "TCE"],
  },
  {
    slug: "pointage-heures",
    name: "Pointage des Heures",
    category: "Application",
    subcategory: "RH & Paie",
    tagline: "Zéro feuille de pointage perdue.",
    desc: "Saisie rapide des heures par ouvrier et par chantier. Calcul automatique des heures supp et récapitulatif hebdomadaire.",
    accent: "#F59E0B",
    bg: "#FFFBEB",
    previewPath: "/t/pointage-heures",
    features: ["Saisie par ouvrier", "Heures supp auto", "Récap hebdo", "Export Excel", "Validation manager"],
    tags: ["Tous corps d'état"],
  },
  {
    slug: "site-vitrine-btp",
    name: "Site Vitrine BTP",
    category: "Site Web",
    subcategory: "Marketing",
    tagline: "Votre entreprise BTP en ligne.",
    desc: "Site web professionnel pour votre entreprise de BTP. Présentation de vos services, réalisations et formulaire de contact.",
    accent: "#10B981",
    bg: "#F0FDF4",
    previewPath: "/t/site-vitrine-btp",
    features: ["Page accueil", "Nos réalisations", "Services & tarifs", "Formulaire devis", "Avis clients"],
    tags: ["Maçonnerie", "Plomberie", "Toiture", "Électricité"],
  },
  {
    slug: "suivi-sous-traitants",
    name: "Suivi Sous-traitants",
    category: "Application",
    subcategory: "Conformité",
    tagline: "Plus jamais de QUALIBAT expiré.",
    desc: "Gérez la conformité de vos sous-traitants : SIRET, QUALIBAT, URSSAF, décennale — avec alertes 30 jours avant expiration.",
    accent: "#EF4444",
    bg: "#FFF1F2",
    previewPath: "/t/suivi-sous-traitants",
    features: ["QUALIBAT & URSSAF", "Alertes 30j avant", "Statuts visuels", "Documents joints", "Liste conformité"],
    tags: ["Tous corps d'état"],
  },
];
