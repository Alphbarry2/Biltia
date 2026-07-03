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
    writable: ["nom", "reference", "categorie", "quantite", "unite", "statut", "chantier_id", "date_retour", "notes"],
    fields:
      "nom (requis), reference, categorie, quantite (nombre), unite (u|m²|m³|ml|kg|h), " +
      "statut (disponible|affecte|maintenance|hors_service), chantier_id (uuid), date_retour, notes",
  },
  suppliers: {
    table: "suppliers",
    label: "Fournisseurs / Sous-traitants",
    writable: ["nom", "siret", "type", "email", "tel", "adresse", "ville", "code_postal", "notes"],
    fields: "nom (requis), siret, type, email, tel, adresse, ville, code_postal, notes",
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
};

export const ALLOWED_ENTITIES = Object.keys(ENTITIES);

// ─── Détection : la demande porte-t-elle sur une entité connectée ? ──────────

const ENTITY_KEYWORDS: Record<string, string[]> = {
  chantiers: ["chantier", "chantiers"],
  clients: ["client", "clients", "crm"],
  employees: ["employé", "employe", "ouvrier", "salarié", "salarie", "équipe", "equipe", "main d'oeuvre", "personnel"],
  documents: ["document", "attestation", "qualibat", "urssaf", "kbis", "décennale", "decennale", "conformité", "conformite"],
  materials: ["matériau", "materiau", "matériel", "materiel", "stock", "fourniture"],
  suppliers: ["fournisseur", "sous-traitant", "sous traitant"],
  equipment: ["équipement", "equipement", "engin", "outillage", "machine"],
  interventions: ["intervention", "sav", "dépannage", "depannage", "maintenance"],
  tasks: ["tâche", "tache", "todo", "planning des tâches"],
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
  // Relations naturelles : un suivi de chantier référence clients + employés.
  if (hits.has("chantiers")) {
    hits.add("clients");
    hits.add("employees");
  }
  return [...hits];
}

/**
 * Bloc injecté dans le system prompt quand la demande mappe des entités connectées.
 * Indique à l'IA d'utiliser window.batify (async) au lieu de localStorage POUR CES
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
utiliser l'API globale \`window.batify\` (asynchrone) — **PAS localStorage**.

## Entités connectées disponibles
${list}

## API \`window.batify\` (déjà injectée, ne la redéfinis pas)
- \`await batify.list('${primary}', { match, order, ascending, limit })\` → tableau de lignes
- \`await batify.get('${primary}', id)\` → une ligne
- \`await batify.create('${primary}', { ...champs })\` → ligne créée (avec son \`id\`)
- \`await batify.update('${primary}', id, { ...champs })\` → ligne mise à jour
- \`await batify.remove('${primary}', id)\` → suppression
Chaque ligne possède un \`id\` (uuid) généré par le serveur. N'envoie jamais \`id\`,
\`tenant_id\` ni les dates \`*_at\` dans create/update : le serveur les gère.

## Règles d'implémentation (obligatoires)
1. Au démarrage : fonction \`async function load(){ const rows = await batify.list('${primary}', { order:'created_at', ascending:false }); render(rows); }\` appelée dans un \`try/catch\`.
2. Après create/update/remove : ré-appelle \`load()\` pour rafraîchir (pas de cache localStorage pour ces entités).
3. Affiche un état de chargement et un état d'erreur clair si l'API échoue
   (ex : « Connexion au workspace impossible »). NE BASCULE PAS sur localStorage pour ces entités.
4. NE PRÉ-REMPLIS PAS de fausses données pour ces entités : les vraies données viennent du workspace.
5. Les champs relationnels (\`client_id\`, \`chef_chantier_id\`, …) : propose un \`<select>\`
   peuplé via \`batify.list('clients')\` / \`batify.list('employees')\` (affiche \`nom\`, stocke \`id\`).
6. Respecte STRICTEMENT les noms de champs et les valeurs d'enum listés ci-dessus.

Pour toute donnée qui ne correspond PAS à une entité ci-dessus, continue d'utiliser
localStorage comme d'habitude.
`;
}
