// ─────────────────────────────────────────────────────────────────────────────
// REGISTRE DES CONNECTEURS — source unique de vérité pour la page Connecteurs,
// le widget d'accueil et l'API /api/connections.
//
// Deux familles :
//   · "oauth"   → nécessitent une CONNEXION (compte Google / Microsoft) pour
//                 que Biltia agisse à la place de l'utilisateur (envoyer un
//                 email, pousser un RDV, déposer un PDF) dans les automatisations.
//   · "builtin" → fonctionnent sans connexion (WhatsApp via partage, exports
//                 CSV/Excel, fonctions natives du téléphone). Badge « Intégré ».
//
// Chaque connecteur OAuth déclare SES scopes : la connexion est incrémentale
// (connecter Gmail ne donne pas accès à Drive). Le statut « Connecté » d'un
// connecteur = provider connecté ET tous ses scopes accordés.
//
// Module partagé client/serveur : AUCUN secret ici (les client_id/secret
// vivent dans les variables d'environnement, lues par l'API uniquement).
// ─────────────────────────────────────────────────────────────────────────────

export type OAuthProvider = "google" | "microsoft";

export type Connector = {
  id: string;
  name: string;
  /** Ce que la connexion apporte (phrase courte, honnête). */
  desc: string;
  /** Logo servi depuis /public (absent → icône générique côté UI). */
  logo?: string;
  kind: "oauth" | "builtin";
  provider?: OAuthProvider;
  /** Scopes OAuth requis pour CE connecteur. */
  scopes?: string[];
  /** Ce qui marche DÉJÀ sans connexion (affiché sous les connecteurs oauth). */
  works?: string;
  /** Lien d'action pour les connecteurs intégrés (Ouvrir / Exporter). */
  href?: string;
  hrefLabel?: string;
};

export const CONNECTORS: Connector[] = [
  {
    id: "gmail",
    name: "Gmail",
    kind: "oauth",
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    desc: "Biltia envoie vos devis, PV et relances directement depuis votre adresse Gmail.",
    works: "Sans connexion : email pré-rempli qui s'ouvre dans votre messagerie.",
    logo: "/logos/gmail.webp",
  },
  {
    id: "outlook",
    name: "Outlook",
    kind: "oauth",
    provider: "microsoft",
    scopes: ["https://graph.microsoft.com/Mail.Send"],
    desc: "Biltia envoie vos documents depuis votre adresse Outlook / Microsoft 365.",
    works: "Sans connexion : email pré-rempli qui s'ouvre dans votre messagerie.",
    logo: "/logos/outlook.webp",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    kind: "oauth",
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    desc: "Biltia crée vos rendez-vous, visites et réceptions de chantier dans votre agenda.",
    works: "Sans connexion : bouton « Ajouter au calendrier » sur vos interventions et tâches.",
    logo: "/logos/google-calendar.webp",
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    kind: "oauth",
    provider: "microsoft",
    scopes: ["https://graph.microsoft.com/Calendars.ReadWrite"],
    desc: "Les mêmes rendez-vous, créés automatiquement dans votre agenda Outlook.",
    works: "Sans connexion : lien « Ajouter à Outlook » et fichier .ics universel.",
    logo: "/logos/outlook.webp",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    kind: "oauth",
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    desc: "Vos PDF générés (devis, PV…) se sauvegardent automatiquement dans Drive.",
    works: "Sans connexion : téléchargez le PDF puis déposez-le vous-même.",
    logo: "/logos/google-drive.webp",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    kind: "oauth",
    provider: "microsoft",
    scopes: ["https://graph.microsoft.com/Files.ReadWrite"],
    desc: "Vos PDF générés se sauvegardent automatiquement dans OneDrive.",
    works: "Sans connexion : téléchargez le PDF puis déposez-le vous-même.",
    logo: "/logos/onedrive.webp",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    kind: "builtin",
    desc: "« Envoyer au client » : PDF joint via le partage mobile, message pré-rempli partout. Aucune connexion requise.",
    logo: "/logos/whatsapp.png",
    href: "https://web.whatsapp.com",
    hrefLabel: "Ouvrir WhatsApp",
  },
  {
    id: "export-csv",
    name: "Export CSV",
    kind: "builtin",
    desc: "Tout votre workspace en CSV universel — compatible avec pratiquement tous les logiciels comptables.",
    href: "/api/export?entity=all&format=csv",
    hrefLabel: "Exporter maintenant",
  },
  {
    id: "export-excel",
    name: "Export Excel",
    kind: "builtin",
    desc: "Un fichier .xlsx avec une feuille par entité (chantiers, clients…), prêt pour votre fiduciaire.",
    href: "/api/export?entity=all&format=xlsx",
    hrefLabel: "Exporter maintenant",
  },
  {
    id: "phone",
    name: "Téléphone",
    kind: "builtin",
    desc: "Appareil photo (bons de livraison, chantiers), position GPS des interventions, dictée vocale : natif, sans connexion.",
  },
];

export function getConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

// ── Capacité d'agent (lib/agent-capabilities) → connecteur à proposer ────────
// Quand un manque de capacité se règle par une CONNEXION, on sait quelle carte
// afficher inline. Les manques non-OAuth (notifications, équipe vide, seuil de
// stock) n'ont pas d'entrée ici → pas de bouton « Connecter » (ils gardent leur
// lien « aller régler »). Clé = CapabilityId, valeur = id de connecteur.
const CONNECTOR_FOR_CAPABILITY: Record<string, string> = {
  email_send: "gmail",
  calendar_read: "google-calendar",
};

/** Le connecteur à proposer pour un code de manque, ou undefined si non-OAuth. */
export function connectorForCapability(code: string): string | undefined {
  return CONNECTOR_FOR_CAPABILITY[code];
}

// ── Statut d'un connecteur à partir des connexions de l'utilisateur ─────────

/** Vue publique d'une connexion (ce que l'API expose — jamais les jetons). */
export type ConnectionInfo = {
  provider: OAuthProvider;
  scopes: string[];
  connected_at: string;
};

export type ConnectorStatus = "builtin" | "connected" | "disconnected";

export function connectorStatus(c: Connector, connections: ConnectionInfo[]): ConnectorStatus {
  if (c.kind === "builtin") return "builtin";
  const conn = connections.find((x) => x.provider === c.provider);
  if (!conn) return "disconnected";
  const granted = new Set(conn.scopes);
  return (c.scopes ?? []).every((s) => granted.has(s)) ? "connected" : "disconnected";
}
