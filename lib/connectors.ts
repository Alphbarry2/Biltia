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
// ⚠️ RÈGLE D'HONNÊTETÉ — `status` :
//   · "live" → du CODE consomme réellement les jetons (lib/gmail.ts, lib/gcal.ts…).
//   · "soon" → déclaré mais AUCUN code ne s'en sert. Le bouton « Connecter » est
//              désactivé (UI) ET l'API refuse de démarrer le flux (fail-closed) :
//              inutile de stocker un jeton que personne ne lit, et surtout on ne
//              ment pas à l'utilisateur avec un « Connecté ✅ » sans effet.
//   Passer un connecteur à "live" = brancher le client d'abord, changer ce champ
//   ensuite. Jamais l'inverse.
//
// `can` / `cannot` sont la source de la page publique /connecteurs. `cannot` se
// DÉRIVE des scopes NON demandés (ex. gmail.send ⇒ aucune lecture possible) :
// c'est ce qui rassure, et c'est vérifiable.
//
// Module partagé client/serveur : AUCUN secret ici (les client_id/secret
// vivent dans les variables d'environnement, lues par l'API uniquement).
// ─────────────────────────────────────────────────────────────────────────────

import type { Locale } from "@/lib/i18n/config";

export type OAuthProvider = "google" | "microsoft";

/** "live" = câblé bout en bout. "soon" = déclaré, pas encore branché. */
export type ConnectorState = "live" | "soon";

export type Connector = {
  id: string;
  name: string;
  /** Nom traduit si différent (marques inchangées ; « Téléphone » → « Phone »). */
  nameEn?: string;
  /** Ce que la connexion apporte (phrase courte, honnête). */
  desc: string;
  descEn?: string;
  /** Logo servi depuis /public (absent → icône générique côté UI). */
  logo?: string;
  kind: "oauth" | "builtin";
  /** Obligatoire : un connecteur ne peut pas exister sans dire s'il marche. */
  status: ConnectorState;
  provider?: OAuthProvider;
  /** Scopes OAuth requis pour CE connecteur. */
  scopes?: string[];
  /** Ce que le connecteur permet CONCRÈTEMENT (page /connecteurs). */
  can: string[];
  canEn: string[];
  /** Ce qu'il ne permet PAS. Dérivé des scopes non demandés. */
  cannot: string[];
  cannotEn: string[];
  /** Le droit exact demandé, expliqué en clair (encadré technique). */
  scopeNote?: string;
  scopeNoteEn?: string;
  /** Ce qui marche DÉJÀ sans connexion (affiché sous les connecteurs oauth). */
  works?: string;
  worksEn?: string;
  /** Lien d'action pour les connecteurs intégrés (Ouvrir / Exporter). */
  href?: string;
  hrefLabel?: string;
  hrefLabelEn?: string;
};

// Accès locale-aware au texte visible d'un connecteur (FR = source, EN = *En).
export const connectorName = (c: Connector, l: Locale) => (l === "en" ? c.nameEn ?? c.name : c.name);
export const connectorDesc = (c: Connector, l: Locale) => (l === "en" ? c.descEn ?? c.desc : c.desc);
export const connectorWorks = (c: Connector, l: Locale) => (l === "en" ? c.worksEn ?? c.works : c.works);
export const connectorHrefLabel = (c: Connector, l: Locale) => (l === "en" ? c.hrefLabelEn ?? c.hrefLabel : c.hrefLabel);
export const connectorCan = (c: Connector, l: Locale) => (l === "en" ? c.canEn : c.can);
export const connectorCannot = (c: Connector, l: Locale) => (l === "en" ? c.cannotEn : c.cannot);
export const connectorScopeNote = (c: Connector, l: Locale) => (l === "en" ? c.scopeNoteEn ?? c.scopeNote : c.scopeNote);

export const CONNECTORS: Connector[] = [
  // ── LIVE : du code lit réellement ces jetons ───────────────────────────────
  {
    id: "gmail",
    name: "Gmail",
    kind: "oauth",
    status: "live",
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    desc: "Biltia envoie vos devis, PV et relances directement depuis votre adresse Gmail.",
    descEn: "Biltia sends your quotes, sign-off sheets and follow-ups straight from your Gmail address.",
    can: [
      "Envoyer un email depuis VOTRE adresse : le client reçoit un mail de vous, pas d'un robot, et il vous répond directement.",
      "Joindre le PDF généré (devis, facture, PV de réception), jusqu'à 15 Mo.",
      "Laisser vos agents envoyer tout seuls : relance de devis, planning du lundi, rappel d'échéance.",
    ],
    canEn: [
      "Send an email from YOUR address: the client gets a mail from you, not from a robot, and replies straight to you.",
      "Attach the generated PDF (quote, invoice, sign-off sheet), up to 15 MB.",
      "Let your agents send on their own: quote follow-ups, Monday planning, due-date reminders.",
    ],
    cannot: [
      "Lire votre boîte de réception. Aucun de vos emails reçus n'est visible par Biltia, jamais.",
      "Chercher, ouvrir, modifier ou supprimer un email existant.",
      "Créer des brouillons, gérer vos libellés, accéder à vos contacts Google.",
    ],
    cannotEn: [
      "Read your inbox. None of your incoming email is ever visible to Biltia.",
      "Search, open, edit or delete an existing email.",
      "Create drafts, manage your labels, or access your Google contacts.",
    ],
    scopeNote: "Biltia demande un seul droit : gmail.send. Google n'accorde avec lui AUCUN accès en lecture. Techniquement, Biltia ne peut pas voir vos emails, même s'il le voulait.",
    scopeNoteEn: "Biltia requests a single permission: gmail.send. Google grants NO read access with it. Technically, Biltia cannot see your email, even if it wanted to.",
    works: "Sans connexion : Biltia envoie quand même, depuis sa propre adresse d'expédition. Connecter Gmail fait simplement partir le mail de chez vous.",
    worksEn: "Without connecting: Biltia still sends, from its own sending address. Connecting Gmail simply makes the mail leave from your own address.",
    logo: "/logos/gmail.webp",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    kind: "oauth",
    status: "live",
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    desc: "Biltia crée vos rendez-vous, visites et réceptions de chantier dans votre agenda.",
    descEn: "Biltia creates your appointments, site visits and handovers in your calendar.",
    can: [
      "Créer un événement dans votre agenda principal : titre, heure de début et de fin, adresse du chantier.",
      "Lire vos 7 prochains jours, pour répondre à « qu'est-ce que j'ai demain ? » et éviter de vous caler deux RDV en même temps.",
      "Nourrir le planning d'équipe : l'agent croise votre agenda et vos interventions avant d'envoyer la semaine.",
    ],
    canEn: [
      "Create an event in your main calendar: title, start and end time, job site address.",
      "Read your next 7 days, to answer “what do I have tomorrow?” and avoid double-booking you.",
      "Feed the team planning: the agent cross-checks your calendar and your jobs before sending out the week.",
    ],
    cannot: [
      "Modifier ou supprimer un événement déjà présent dans votre agenda.",
      "Toucher à un autre agenda que votre agenda principal : les agendas partagés, familiaux ou de vos collègues restent hors de portée.",
      "Voir vos invités, vos contacts, ou les détails au-delà de la fenêtre de 7 jours.",
    ],
    cannotEn: [
      "Edit or delete an event already in your calendar.",
      "Touch any calendar other than your main one: shared, family or colleagues' calendars stay out of reach.",
      "See your guests, your contacts, or anything beyond the 7-day window.",
    ],
    scopeNote: "Droit demandé : calendar.events, limité à votre agenda principal. Biltia ajoute des événements et lit la semaine à venir. Il ne peut pas réécrire votre passé.",
    scopeNoteEn: "Permission requested: calendar.events, limited to your main calendar. Biltia adds events and reads the week ahead. It cannot rewrite your past.",
    works: "Sans connexion : bouton « Ajouter au calendrier » sur vos interventions et tâches (fichier .ics universel).",
    worksEn: "Without connecting: an “Add to calendar” button on your jobs and tasks (universal .ics file).",
    logo: "/logos/google-calendar.webp",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    kind: "builtin",
    status: "live",
    desc: "« Envoyer au client » : PDF joint via le partage mobile, message pré-rempli partout. Aucune connexion requise.",
    descEn: "“Send to client”: PDF attached via mobile share, pre-filled message everywhere. No connection required.",
    can: [
      "Ouvrir WhatsApp avec le message déjà écrit et le bon numéro : vous relisez, vous envoyez.",
      "Joindre le PDF du devis ou de la facture via le partage natif du téléphone.",
      "Marcher sans rien connecter, sur mobile comme sur WhatsApp Web.",
    ],
    canEn: [
      "Open WhatsApp with the message already written and the right number: you read it over, you send.",
      "Attach the quote or invoice PDF via your phone's native share sheet.",
      "Work with nothing to connect, on mobile and on WhatsApp Web alike.",
    ],
    cannot: [
      "Envoyer tout seul. C'est vous qui appuyez sur « Envoyer » : un agent ne peut pas expédier un WhatsApp à 3 h du matin à votre place.",
      "Lire vos conversations, vos groupes ou vos contacts WhatsApp.",
      "Faire de l'envoi en masse ou automatisé (WhatsApp Business API non intégrée).",
    ],
    cannotEn: [
      "Send on its own. You are the one who taps “Send”: an agent cannot fire off a WhatsApp at 3 a.m. on your behalf.",
      "Read your conversations, groups or WhatsApp contacts.",
      "Do bulk or automated sending (WhatsApp Business API is not integrated).",
    ],
    scopeNote: "Aucune connexion, aucun jeton, aucun accès à votre compte : Biltia se contente de pré-remplir WhatsApp. Le dernier geste vous appartient.",
    scopeNoteEn: "No connection, no token, no access to your account: Biltia merely pre-fills WhatsApp. The final tap is yours.",
    logo: "/logos/whatsapp.png",
    href: "https://web.whatsapp.com",
    hrefLabel: "Ouvrir WhatsApp",
    hrefLabelEn: "Open WhatsApp",
  },
  {
    id: "export-csv",
    name: "Export CSV",
    kind: "builtin",
    status: "live",
    desc: "Tout votre workspace en CSV universel, compatible avec pratiquement tous les logiciels comptables.",
    descEn: "Your whole workspace as universal CSV, compatible with virtually every accounting software.",
    can: [
      "Sortir tout votre workspace (chantiers, clients, devis, factures, heures…) en un clic.",
      "S'ouvrir dans n'importe quel tableur et s'importer dans la quasi-totalité des logiciels de compta.",
      "Vos données restent les vôtres : vous partez avec, quand vous voulez.",
    ],
    canEn: [
      "Pull your entire workspace (job sites, clients, quotes, invoices, hours…) in one click.",
      "Open in any spreadsheet and import into nearly every accounting package.",
      "Your data stays yours: you can take it with you, whenever you want.",
    ],
    cannot: [
      "Se synchroniser dans les deux sens : ce que vous modifiez dans le fichier ne remonte pas dans Biltia.",
      "Se mettre à jour tout seul. Un export est une photo à l'instant où vous cliquez.",
      "Parler nativement Batigest, EBP ou Pennylane (le CSV se ré-importe, mais à la main).",
    ],
    cannotEn: [
      "Sync both ways: whatever you edit in the file does not flow back into Biltia.",
      "Update itself. An export is a snapshot of the moment you clicked.",
      "Speak Batigest, EBP or Pennylane natively (the CSV re-imports, but by hand).",
    ],
    href: "/api/export?entity=all&format=csv",
    hrefLabel: "Exporter maintenant",
    hrefLabelEn: "Export now",
  },
  {
    id: "export-excel",
    name: "Export Excel",
    kind: "builtin",
    status: "live",
    desc: "Un fichier .xlsx avec une feuille par entité (chantiers, clients…), prêt pour votre fiduciaire.",
    descEn: "One .xlsx file with a sheet per entity (job sites, clients…), ready for your accountant.",
    can: [
      "Un seul fichier .xlsx, une feuille par entité : chantiers, clients, devis, factures, pointages.",
      "Se transmettre tel quel à votre comptable ou à votre fiduciaire.",
      "Se filtrer, se trier, se retravailler dans Excel ou Google Sheets.",
    ],
    canEn: [
      "A single .xlsx file, one sheet per entity: job sites, clients, quotes, invoices, timesheets.",
      "Hand it straight to your accountant or bookkeeper.",
      "Filter, sort and rework it in Excel or Google Sheets.",
    ],
    cannot: [
      "Renvoyer dans Biltia les modifications faites dans le fichier.",
      "Se rafraîchir automatiquement : il faut re-exporter pour avoir les données du jour.",
      "Se déposer tout seul dans un Drive ou un OneDrive (voir « En cours d'intégration »).",
    ],
    cannotEn: [
      "Push edits made in the file back into Biltia.",
      "Refresh automatically: re-export to get today's data.",
      "Drop itself into a Drive or OneDrive on its own (see “Coming soon”).",
    ],
    href: "/api/export?entity=all&format=xlsx",
    hrefLabel: "Exporter maintenant",
    hrefLabelEn: "Export now",
  },
  {
    id: "phone",
    name: "Téléphone",
    nameEn: "Phone",
    kind: "builtin",
    status: "live",
    desc: "Appareil photo (bons de livraison, chantiers), position GPS des interventions, dictée vocale : natif, sans connexion.",
    descEn: "Camera (delivery notes, job sites), GPS location of jobs, voice dictation: native, no connection.",
    can: [
      "Prendre une photo depuis l'app : bon de livraison, avancement, réserve à lever.",
      "Dicter à la voix, les mains sales ou gantées, plutôt que de taper.",
      "Ouvrir l'itinéraire GPS vers un chantier, et installer Biltia comme une vraie app sur l'écran d'accueil.",
    ],
    canEn: [
      "Take a photo from the app: delivery note, progress, snag to fix.",
      "Dictate by voice, with dirty or gloved hands, instead of typing.",
      "Open GPS directions to a job site, and install Biltia as a real app on your home screen.",
    ],
    cannot: [
      "Fouiller votre pellicule photo ou votre répertoire : Biltia ne voit que ce que vous lui donnez.",
      "Suivre votre position en arrière-plan ou en continu.",
      "Écouter le micro en dehors du moment où vous appuyez sur le bouton de dictée.",
    ],
    cannotEn: [
      "Dig through your camera roll or your address book: Biltia only sees what you hand it.",
      "Track your location in the background or continuously.",
      "Listen to the mic outside the moment you press the dictate button.",
    ],
    scopeNote: "Tout passe par une autorisation ponctuelle du navigateur (photo, position, micro), que vous pouvez retirer à tout moment dans les réglages du téléphone.",
    scopeNoteEn: "Everything goes through a one-off browser permission (camera, location, mic), which you can revoke at any time in your phone settings.",
  },

  // ── SOON : déclarés, PAS branchés. Bouton désactivé + API fail-closed. ─────
  // Aucun client Microsoft Graph, aucun upload Drive n'existe dans le code.
  // Ne PAS repasser en "live" sans avoir écrit le client correspondant.
  {
    id: "outlook",
    name: "Outlook",
    kind: "oauth",
    status: "soon",
    provider: "microsoft",
    scopes: ["https://graph.microsoft.com/Mail.Send"],
    desc: "Envoyer vos documents depuis votre adresse Outlook / Microsoft 365.",
    descEn: "Send your documents from your Outlook / Microsoft 365 address.",
    can: [
      "Ce qu'il fera : envoyer devis, factures et relances depuis votre adresse Outlook, exactement comme Gmail le fait aujourd'hui.",
    ],
    canEn: [
      "What it will do: send quotes, invoices and follow-ups from your Outlook address, exactly as Gmail does today.",
    ],
    cannot: [
      "En attendant : Biltia envoie déjà vos emails, depuis sa propre adresse d'expédition. Rien ne vous bloque.",
    ],
    cannotEn: [
      "In the meantime: Biltia already sends your emails, from its own sending address. Nothing is blocking you.",
    ],
    logo: "/logos/outlook.webp",
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    kind: "oauth",
    status: "soon",
    provider: "microsoft",
    scopes: ["https://graph.microsoft.com/Calendars.ReadWrite"],
    desc: "Les mêmes rendez-vous, créés dans votre agenda Outlook.",
    descEn: "The same appointments, created in your Outlook calendar.",
    can: [
      "Ce qu'il fera : créer vos RDV, visites et réceptions dans Outlook, comme Google Calendar le fait aujourd'hui.",
    ],
    canEn: [
      "What it will do: create your appointments, site visits and handovers in Outlook, as Google Calendar does today.",
    ],
    cannot: [
      "En attendant : le bouton « Ajouter au calendrier » produit un fichier .ics qu'Outlook ouvre sans problème.",
    ],
    cannotEn: [
      "In the meantime: the “Add to calendar” button produces an .ics file that Outlook opens without any trouble.",
    ],
    logo: "/logos/outlook.webp",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    kind: "oauth",
    status: "live",
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    desc: "Classer vos PDF (devis, factures, PV…) dans Drive, rangés par chantier.",
    descEn: "File your PDFs (quotes, invoices, sign-off sheets…) into Drive, sorted by job site.",
    can: [
      "Déposer un document généré dans votre Drive, rangé dans « Biltia / <chantier> ».",
      "Classer automatiquement chaque devis et chaque facture que vous envoyez.",
      "Renvoyer un devis corrigé remplace le PDF existant : un seul fichier par document, jamais dix versions.",
    ],
    canEn: [
      "Drop a generated document into your Drive, filed under “Biltia / <job site>”.",
      "Automatically file every quote and invoice you send.",
      "Re-sending a corrected quote replaces the existing PDF: one file per document, never ten versions.",
    ],
    cannot: [
      "Il ne voit QUE les fichiers qu'il a lui-même créés. Le reste de votre Drive lui est invisible, techniquement, pas seulement par politesse.",
      "Il ne supprime rien et ne touche à aucun de vos dossiers existants.",
    ],
    cannotEn: [
      "It only ever sees the files it created itself. The rest of your Drive is invisible to it, technically, not just as a courtesy.",
      "It deletes nothing and never touches any of your existing folders.",
    ],
    logo: "/logos/google-drive.webp",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    kind: "oauth",
    status: "soon",
    provider: "microsoft",
    scopes: ["https://graph.microsoft.com/Files.ReadWrite"],
    desc: "Classer automatiquement vos PDF générés dans OneDrive.",
    descEn: "File your generated PDFs into OneDrive automatically.",
    can: [
      "Ce qu'il fera : déposer chaque PDF généré dans OneDrive, rangé par chantier.",
    ],
    canEn: [
      "What it will do: drop every generated PDF into OneDrive, filed by job site.",
    ],
    cannot: [
      "En attendant : chaque document se télécharge en PDF, et l'export sort tout le workspace d'un coup.",
    ],
    cannotEn: [
      "In the meantime: every document downloads as a PDF, and the export pulls the whole workspace at once.",
    ],
    logo: "/logos/onedrive.webp",
  },
  {
    id: "sms",
    name: "SMS",
    // Ni OAuth ni vraiment natif : l'envoi passe par Twilio au niveau plateforme
    // (clés d'environnement), pas par une connexion utilisateur. "builtin" évite
    // d'inventer un 3e `kind` ; `status: "soon"` empêche le badge « Intégré ».
    kind: "builtin",
    status: "soon",
    desc: "Relances et rappels de RDV par SMS, envoyés par vos agents.",
    descEn: "Follow-ups and appointment reminders by text, sent by your agents.",
    can: [
      "Ce qu'il fera : rappeler un RDV la veille, relancer un devis, prévenir l'équipe, par SMS et sans que vous y pensiez.",
    ],
    canEn: [
      "What it will do: remind a client the day before, chase a quote, alert the crew, by text and without you thinking about it.",
    ],
    cannot: [
      "En attendant : l'email et WhatsApp couvrent les mêmes relances, et vos agents savent déjà les envoyer.",
    ],
    cannotEn: [
      "In the meantime: email and WhatsApp cover the same follow-ups, and your agents already know how to send them.",
    ],
  },
];

export function getConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

/** Connecteurs réellement câblés (page publique : section principale). */
export const LIVE_CONNECTORS = CONNECTORS.filter((c) => c.status === "live");
/** Déclarés mais pas branchés (page publique : section « En cours »). */
export const SOON_CONNECTORS = CONNECTORS.filter((c) => c.status === "soon");

/**
 * Peut-on lancer un flux OAuth pour ce connecteur ? Non si personne ne lira le
 * jeton : stocker un jeton mort afficherait un « Connecté ✅ » sans effet.
 * Utilisé par l'UI (bouton) ET par l'API (garde serveur).
 */
export function isConnectable(c: Connector): boolean {
  return c.kind === "oauth" && c.status === "live";
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

export type ConnectorStatus = "soon" | "builtin" | "connected" | "disconnected";

export function connectorStatus(c: Connector, connections: ConnectionInfo[]): ConnectorStatus {
  // « soon » l'emporte sur tout : tant que rien ne lit le jeton, on n'affiche ni
  // « Connecter », ni « Connecté », ni « Intégré ». On dit la vérité : « Bientôt ».
  if (c.status === "soon") return "soon";
  if (c.kind === "builtin") return "builtin";
  const conn = connections.find((x) => x.provider === c.provider);
  if (!conn) return "disconnected";
  const granted = new Set(conn.scopes);
  return (c.scopes ?? []).every((s) => granted.has(s)) ? "connected" : "disconnected";
}
