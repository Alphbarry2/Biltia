// ─────────────────────────────────────────────────────────────────────────────
// APPS PHARES (« templates » réellement fonctionnels).
//
// Chaque entrée est une application métier COMPLÈTE, branchée au workspace via
// window.biltia — pas une maquette. Quand l'utilisateur choisit un de ces modèles,
// /api/templates/instantiate crée directement une vraie app dans son workspace
// (SDK injecté, nom d'entreprise substitué) et l'ouvre : « un clic = ça marche ».
//
// La maquette statique servie par /t/[id] reste, elle, réservée à l'aperçu
// marketing (landing, galerie) — non authentifié, donc non branché.
// ─────────────────────────────────────────────────────────────────────────────

import { APP_DEVIS_HTML } from "@/data/app-devis";
import { APP_CHANTIERS_HTML } from "@/data/app-chantiers";
import { APP_EQUIPES_HTML } from "@/data/app-equipes";
import { APP_FINANCE_HTML } from "@/data/app-finance";
import { APP_PLANNING_HTML } from "@/data/app-planning";
import { APP_POINTAGE_HTML } from "@/data/app-pointage";
import { APP_SOUSTRAITANCE_HTML } from "@/data/app-soustraitance";
import { APP_CRM_HTML } from "@/data/app-crm";
import { APP_SAV_HTML } from "@/data/app-sav";
import { APP_STOCK_HTML } from "@/data/app-stock";
import { DEMO_BILTIA_SCRIPT } from "@/lib/demo-biltia";

export type FlagshipApp = {
  id: string;
  name: string;
  description: string;
  format: "desktop" | "mobile";
  /** true = app finalisée au standard multi-pages → instanciable + aperçu démo live.
   *  false = ancienne version en cours de refonte → /t sert la maquette premium,
   *  l'instanciation renvoie 404 (repli sur l'aperçu adaptable). */
  ready: boolean;
  /** Jeton remplacé par le nom réel de l'entreprise à l'instanciation. */
  html: string;
};

export const FLAGSHIP_APPS: Record<string, FlagshipApp> = {
  suivi_chantiers: {
    id: "suivi_chantiers",
    name: "Suivi de chantiers",
    description:
      "Pilotez vos chantiers : tableau de bord (avancement, budget, à traiter en priorité), fiche par chantier, équipe et matériel affecté. Tout se met à jour en direct.",
    format: "desktop",
    ready: true,
    html: APP_CHANTIERS_HTML,
  },
  devis_factures: {
    id: "devis_factures",
    name: "Devis",
    description:
      "Créez vos devis à la voix : dictez-les, Biltia les rédige, calcule les totaux et prépare l'envoi par email. Catalogue de prix, clients et chantiers reliés.",
    format: "desktop",
    ready: true,
    html: APP_DEVIS_HTML,
  },
  finance_budgets: {
    id: "finance_budgets",
    name: "Finance & recouvrement",
    description:
      "Pilotez votre cash : cockpit DSO (cash bloqué, score, ancienneté), graphiques interactifs d'encaissement, relances et escalade, marge par chantier. Vos factures et budgets en direct.",
    format: "desktop",
    ready: true,
    html: APP_FINANCE_HTML,
  },
  equipes_taches: {
    id: "equipes_taches",
    name: "Équipes & tâches",
    description:
      "Un kanban plein écran (à faire / en cours / terminé) : glissez les tâches, assignez-les à vos équipiers, suivez la charge de chacun et l'avancement en direct.",
    format: "desktop",
    ready: true,
    html: APP_EQUIPES_HTML,
  },
  planning_chantier: {
    id: "planning_chantier",
    name: "Planning chantier",
    description:
      "Une grille agenda de la semaine : affectez chaque équipier à un chantier jour par jour, naviguez de semaine en semaine et voyez qui est où aujourd'hui.",
    format: "desktop",
    ready: true,
    html: APP_PLANNING_HTML,
  },
  pointage_equipes: {
    id: "pointage_equipes",
    name: "Pointage des heures",
    description:
      "Une feuille d'heures centrée sur le jour : pointez le temps de chaque équipier en un geste (stepper −/+), validez d'une coche, et retrouvez le récap de la semaine et les heures de main d'œuvre par chantier.",
    format: "desktop",
    ready: true,
    html: APP_POINTAGE_HTML,
  },
  sous_traitants: {
    id: "sous_traitants",
    name: "Sous-traitance & conformité",
    description:
      "Gardez vos sous-traitants conformes : cockpit de conformité (conformes / à renouveler / non conformes), alertes 30 jours avant l'expiration de l'assurance décennale, relance par email, registre des partenaires et échéancier.",
    format: "desktop",
    ready: true,
    html: APP_SOUSTRAITANCE_HTML,
  },
  crm_clients: {
    id: "crm_clients",
    name: "CRM — Pipeline commercial",
    description:
      "Pilotez vos ventes : cockpit du pipeline (valeur en cours, taux de conversion), entonnoir par étape, graphique interactif des affaires gagnées, fiches clients avec historique et relances à ne pas oublier.",
    format: "desktop",
    ready: true,
    html: APP_CRM_HTML,
  },
  sav_maintenance: {
    id: "sav_maintenance",
    name: "SAV & maintenance",
    description:
      "Pilotez vos dépannages et contrats d'entretien : file d'interventions (en retard / aujourd'hui / à venir), courbe interactive des interventions clôturées, revenu récurrent des contrats, prochaines visites et parc installé chez vos clients (chaudières, PAC, VMC…).",
    format: "desktop",
    ready: true,
    html: APP_SAV_HTML,
  },
  stock_achats: {
    id: "stock_achats",
    name: "Stock & achats",
    description:
      "Pilotez votre stock de matériaux : cockpit de la valeur du stock, graphique interactif par catégorie, cartes d'inventaire avec seuil d'alerte et ajustement en un geste (−/+), alertes de rupture, et réapprovisionnement regroupé par fournisseur (commande par email).",
    format: "desktop",
    ready: true,
    html: APP_STOCK_HTML,
  },
};

export const FLAGSHIP_IDS = Object.keys(FLAGSHIP_APPS);

/** Entité workspace que remplit un IMPORT de fichier pour chaque app phare
 *  (la liste principale de l'app). Sert au mode « Importer un fichier ». */
export const IMPORT_TARGETS: Record<string, string> = {
  suivi_chantiers: "chantiers",
  devis_factures: "clients",
  finance_budgets: "factures",
  equipes_taches: "employees",
  planning_chantier: "employees",
  pointage_equipes: "employees",
  sous_traitants: "suppliers",
  crm_clients: "clients",
  sav_maintenance: "parc_installe",
  stock_achats: "materials",
};

export function getImportTarget(id: string): string | undefined {
  return IMPORT_TARGETS[id];
}

export function getFlagshipApp(id: string): FlagshipApp | undefined {
  return FLAGSHIP_APPS[id];
}

/** Prépare le HTML final : substitue le nom d'entreprise (le SDK est injecté
 *  séparément par l'appelant, avec injectBiltiaSDK). */
export function renderFlagshipHtml(app: FlagshipApp, entreprise: string): string {
  const safe = (entreprise || "Mon entreprise").replace(/[<>]/g, "").slice(0, 80);
  return app.html.split("__ENTREPRISE__").join(safe);
}

/** APERÇU (marketing, non authentifié) : le VRAI HTML de l'app + un window.biltia
 *  de démo (données BTP locales, interactif). Injecté dans le <head> pour être
 *  défini AVANT le script de l'app. Sert /t/[id] pour la landing + la galerie. */
export function renderFlagshipPreview(app: FlagshipApp): string {
  const html = renderFlagshipHtml(app, "Bâtisseurs du Sud");
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + "\n" + DEMO_BILTIA_SCRIPT);
  }
  return DEMO_BILTIA_SCRIPT + html;
}
