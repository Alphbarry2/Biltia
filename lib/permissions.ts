// ─────────────────────────────────────────────────────────────────────────────
// BILTIA — MATRICE DE PERMISSIONS (source de vérité UNIQUE, serveur + client)
//
// Cinq rôles, du plus fort au plus faible :
//   owner   (propriétaire) — tout, y compris facturation et suppression de l'espace.
//   admin                  — tout au quotidien : équipe, connecteurs, réglages.
//   manager (chef d'équipe)— pilote les données, agents et connaissances ; ne
//                            touche NI à l'équipe NI à la facturation.
//   member  (employé)      — utilise l'outil : crée/modifie données, génère
//                            apps & documents, utilise les apps. Pas de suppression,
//                            pas de gestion (équipe, connecteurs, facturation).
//   viewer  (lecteur)      — LECTURE SEULE : consulte et pose des questions, rien d'autre.
//
// Ce module est PUR (aucun import) → utilisable dans les routes API ET dans les
// composants client. UI et serveur lisent la MÊME table : ce qu'on cache dans
// l'UI est aussi bloqué côté serveur (défense en profondeur), le RLS restant le
// dernier rempart en base.
// ─────────────────────────────────────────────────────────────────────────────

export type Role = "owner" | "admin" | "manager" | "member" | "viewer";

export const ROLE_ORDER: Role[] = ["owner", "admin", "manager", "member", "viewer"];

/** Capacités atomiques vérifiables. */
export type Capability =
  | "data.read"          // consulter les données du workspace
  | "data.write"         // créer / modifier des données
  | "data.delete"        // supprimer des données
  | "ai.ask"             // poser une question / analyser (IA lecture)
  | "ai.create"          // générer une app / un document / une action (IA création)
  | "apps.use"           // utiliser les apps déployées
  | "agents.manage"      // créer / piloter des agents autonomes
  | "connectors.manage"  // connecter / déconnecter des outils (Gmail, Agenda…)
  | "knowledge.manage"   // gérer la base de connaissances
  | "team.manage"        // inviter / retirer des collaborateurs, changer les rôles
  | "billing.manage"     // abonnement & paiement
  | "workspace.settings" // renommer l'espace, réglages généraux
  | "export.data";       // exporter les données

// Pour chaque capacité, l'ensemble des rôles qui l'ont. Aligné sur les policies
// RLS existantes (écriture = owner/admin/manager/member ; suppression = owner/admin ;
// connaissances = owner/admin/manager ; équipe & facturation = owner/admin / owner).
const MATRIX: Record<Capability, Role[]> = {
  "data.read":          ["owner", "admin", "manager", "member", "viewer"],
  "data.write":         ["owner", "admin", "manager", "member"],
  "data.delete":        ["owner", "admin"],
  "ai.ask":             ["owner", "admin", "manager", "member", "viewer"],
  "ai.create":          ["owner", "admin", "manager", "member"],
  "apps.use":           ["owner", "admin", "manager", "member", "viewer"],
  "agents.manage":      ["owner", "admin", "manager"],
  "connectors.manage":  ["owner", "admin"],
  "knowledge.manage":   ["owner", "admin", "manager"],
  "team.manage":        ["owner", "admin"],
  "billing.manage":     ["owner"],
  "workspace.settings": ["owner", "admin"],
  "export.data":        ["owner", "admin", "manager"],
};

/** Cœur : ce rôle a-t-il cette capacité ? */
export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return MATRIX[capability]?.includes(role as Role) ?? false;
}

/** Libellés + descriptions FR (sélecteur de rôle, affichage membre). */
export const ROLE_META: Record<Role, { label: string; short: string; description: string }> = {
  owner: {
    label: "Propriétaire",
    short: "Tout, + facturation",
    description: "Contrôle total de l'espace, y compris la facturation et sa suppression.",
  },
  admin: {
    label: "Admin",
    short: "Gère équipe & réglages",
    description: "Gère l'équipe, les connecteurs et les réglages. Pas la facturation.",
  },
  manager: {
    label: "Manager",
    short: "Pilote données & agents",
    description: "Crée et pilote les données, agents et connaissances. Ne gère ni l'équipe ni la facturation.",
  },
  member: {
    label: "Employé",
    short: "Utilise l'outil au quotidien",
    description: "Crée et modifie les données, génère apps et documents, utilise les apps. Pas de suppression ni de gestion.",
  },
  viewer: {
    label: "Lecteur",
    short: "Lecture seule",
    description: "Consulte les données et pose des questions. Ne peut rien créer ni modifier.",
  },
};

/** Libellé court d'un rôle (repli sur la valeur brute si inconnue). */
export function roleLabel(role: string): string {
  return (ROLE_META as Record<string, { label: string }>)[role]?.label ?? role;
}
