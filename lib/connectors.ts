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
      "Se déposer tout seul dans un Drive : c'est le classement automatique (Google Drive / OneDrive) qui fait ça, et seulement pour les documents générés.",
    ],
    cannotEn: [
      "Push edits made in the file back into Biltia.",
      "Refresh automatically: re-export to get today's data.",
      "Drop itself into a Drive on its own: automatic filing (Google Drive / OneDrive) does that, and only for generated documents.",
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

  {
    id: "outlook",
    name: "Outlook",
    kind: "oauth",
    status: "live",
    provider: "microsoft",
    scopes: ["https://graph.microsoft.com/Mail.Send"],
    desc: "Biltia envoie vos devis, PV et relances directement depuis votre adresse Outlook / Microsoft 365.",
    descEn: "Biltia sends your quotes, sign-off sheets and follow-ups straight from your Outlook / Microsoft 365 address.",
    can: [
      "Envoyer un email depuis VOTRE adresse Outlook : le client reçoit un mail de vous, et il vous répond directement.",
      "Joindre le PDF généré (devis, facture, PV de réception).",
      "Laisser vos agents envoyer tout seuls : relance de devis, planning du lundi, rappel d'échéance.",
    ],
    canEn: [
      "Send an email from YOUR Outlook address: the client gets a mail from you, and replies straight to you.",
      "Attach the generated PDF (quote, invoice, sign-off sheet).",
      "Let your agents send on their own: quote follow-ups, Monday planning, due-date reminders.",
    ],
    cannot: [
      "Lire votre boîte de réception. Aucun de vos emails reçus n'est visible par Biltia, jamais.",
      "Chercher, ouvrir, modifier ou supprimer un email existant.",
      "Créer des brouillons, gérer vos dossiers, accéder à vos contacts Microsoft.",
    ],
    cannotEn: [
      "Read your inbox. None of your incoming email is ever visible to Biltia.",
      "Search, open, edit or delete an existing email.",
      "Create drafts, manage your folders, or access your Microsoft contacts.",
    ],
    scopeNote: "Biltia demande un seul droit : Mail.Send. Microsoft n'accorde avec lui AUCUN accès en lecture. Techniquement, Biltia ne peut pas voir vos emails, même s'il le voulait. Une pièce jointe de plus de 3 Mo repasse par l'envoi Biltia (limite de Microsoft, pas la nôtre).",
    scopeNoteEn: "Biltia requests a single permission: Mail.Send. Microsoft grants NO read access with it. Technically, Biltia cannot see your email, even if it wanted to. An attachment over 3 MB falls back to Biltia's own sending (Microsoft's limit, not ours).",
    works: "Sans connexion : Biltia envoie quand même, depuis sa propre adresse d'expédition. Connecter Outlook fait simplement partir le mail de chez vous.",
    worksEn: "Without connecting: Biltia still sends, from its own sending address. Connecting Outlook simply makes the mail leave from your own address.",
    logo: "/logos/outlook.webp",
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    kind: "oauth",
    status: "live",
    provider: "microsoft",
    scopes: ["https://graph.microsoft.com/Calendars.ReadWrite"],
    desc: "Biltia crée vos rendez-vous, visites et réceptions de chantier dans votre agenda Outlook.",
    descEn: "Biltia creates your appointments, site visits and handovers in your Outlook calendar.",
    can: [
      "Créer un événement dans votre agenda : titre, heure de début et de fin, adresse du chantier.",
      "Lire vos 7 prochains jours, pour répondre à « qu'est-ce que j'ai demain ? » et éviter de vous caler deux RDV en même temps.",
      "Nourrir le planning d'équipe : l'agent croise votre agenda et vos interventions avant d'envoyer la semaine.",
    ],
    canEn: [
      "Create an event in your calendar: title, start and end time, job site address.",
      "Read your next 7 days, to answer “what do I have tomorrow?” and avoid double-booking you.",
      "Feed the team planning: the agent cross-checks your calendar and your jobs before sending out the week.",
    ],
    cannot: [
      "Toucher aux événements que vous avez créés vous-même : Biltia ajoute, il ne réécrit pas votre passé.",
      "Voir vos contacts, ou les détails au-delà de la fenêtre de 7 jours.",
    ],
    cannotEn: [
      "Touch the events you created yourself: Biltia adds, it does not rewrite your past.",
      "See your contacts, or anything beyond the 7-day window.",
    ],
    scopeNote: "Droit demandé : Calendars.ReadWrite, sur votre agenda. Biltia y ajoute des événements et lit la semaine à venir.",
    scopeNoteEn: "Permission requested: Calendars.ReadWrite, on your calendar. Biltia adds events to it and reads the week ahead.",
    works: "Sans connexion : bouton « Ajouter au calendrier » sur vos interventions et tâches (fichier .ics universel, qu'Outlook ouvre sans problème).",
    worksEn: "Without connecting: an “Add to calendar” button on your jobs and tasks (universal .ics file, which Outlook opens without any trouble).",
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
    status: "live",
    provider: "microsoft",
    // AppFolder, PAS Files.ReadWrite : le droit large donnerait accès à TOUT le
    // OneDrive de l'utilisateur, et le « il ne voit que ses propres fichiers »
    // ci-dessous deviendrait un mensonge. C'est l'équivalent exact du drive.file
    // de Google : Biltia n'a de vue que sur son propre dossier d'application.
    scopes: ["https://graph.microsoft.com/Files.ReadWrite.AppFolder"],
    desc: "Classer vos PDF (devis, factures, PV…) dans OneDrive, rangés par chantier.",
    descEn: "File your PDFs (quotes, invoices, sign-off sheets…) into OneDrive, sorted by job site.",
    can: [
      "Déposer un document généré dans votre OneDrive, rangé dans « Biltia / <chantier> ».",
      "Classer automatiquement chaque devis et chaque facture que vous envoyez.",
      "Renvoyer un devis corrigé remplace le PDF existant : un seul fichier par document, jamais dix versions.",
    ],
    canEn: [
      "Drop a generated document into your OneDrive, filed under “Biltia / <job site>”.",
      "Automatically file every quote and invoice you send.",
      "Re-sending a corrected quote replaces the existing PDF: one file per document, never ten versions.",
    ],
    cannot: [
      "Il ne voit QUE les fichiers qu'il a lui-même créés, dans son propre dossier d'application. Le reste de votre OneDrive lui est invisible, techniquement, pas seulement par politesse.",
      "Il ne supprime rien et ne touche à aucun de vos dossiers existants.",
    ],
    cannotEn: [
      "It only ever sees the files it created itself, inside its own app folder. The rest of your OneDrive is invisible to it, technically, not just as a courtesy.",
      "It deletes nothing and never touches any of your existing folders.",
    ],
    scopeNote: "Droit demandé : Files.ReadWrite.AppFolder — le dossier d'application, et rien d'autre. Biltia ne peut pas ouvrir vos autres fichiers OneDrive, même par erreur.",
    scopeNoteEn: "Permission requested: Files.ReadWrite.AppFolder — the app folder, and nothing else. Biltia cannot open your other OneDrive files, not even by mistake.",
    logo: "/logos/onedrive.webp",
  },
  {
    id: "sms",
    name: "SMS",
    // Ni OAuth ni natif : l'envoi passe par Twilio au niveau PLATEFORME (clés
    // d'environnement), pas par une connexion utilisateur. D'où "builtin" : il n'y
    // a rien à connecter, l'envoi est déjà armé. Le seul prérequis est le plan Pro.
    kind: "builtin",
    status: "live",
    desc: "Relances et rappels de RDV par SMS, envoyés par vos agents. Rien à connecter.",
    descEn: "Follow-ups and appointment reminders by text, sent by your agents. Nothing to connect.",
    can: [
      "Rappeler un RDV la veille, relancer un devis, prévenir l'équipe, par SMS et sans que vous y pensiez.",
      "Partir tout seul depuis un agent : c'est le canal qui atteint un client qui ne lit pas ses mails.",
      "Être déclenché depuis une app générée (rappel de livraison, alerte de stock).",
    ],
    canEn: [
      "Remind a client the day before, chase a quote, alert the crew, by text and without you thinking about it.",
      "Go out on its own from an agent: it's the channel that reaches a client who never reads their email.",
      "Be triggered from a generated app (delivery reminder, stock alert).",
    ],
    cannot: [
      "Recevoir des réponses : le SMS part de Biltia, il ne revient pas. Pour une conversation, l'email et WhatsApp restent les bons canaux.",
      "Être envoyé en masse : chaque envoi est plafonné (message long découpé, nombre de destinataires borné) pour qu'une consigne mal formulée ne vide pas votre budget.",
      "Fonctionner sur le plan Gratuit : l'envoi de SMS demande un abonnement Pro.",
    ],
    cannotEn: [
      "Receive replies: the text goes out from Biltia, it does not come back. For a conversation, email and WhatsApp remain the right channels.",
      "Be sent in bulk: every send is capped (long messages are split, recipient count is bounded) so a badly worded instruction cannot drain your budget.",
      "Work on the Free plan: sending texts requires a Pro subscription.",
    ],
    scopeNote: "Aucune connexion, aucun compte à créer : l'envoi passe par l'opérateur de Biltia. Vous n'avez ni clé ni contrat à fournir.",
    scopeNoteEn: "No connection, no account to create: sending goes through Biltia's carrier. You have no key and no contract to provide.",
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

// ── Capacité d'agent (lib/agent-capabilities) → connecteurs à proposer ───────
// Quand un manque de capacité se règle par une CONNEXION, on sait quelles cartes
// afficher inline. Les manques non-OAuth (notifications, équipe vide, seuil de
// stock) n'ont pas d'entrée ici → pas de bouton « Connecter » (ils gardent leur
// lien « aller régler »). Clé = CapabilityId, valeur = ids de connecteurs.
//
// PLUSIEURS connecteurs par capacité : un artisan sous Microsoft 365 n'a pas de
// Gmail. Lui proposer « Connecter Gmail » comme unique issue, c'est lui demander
// d'ouvrir un compte chez un concurrent de sa messagerie. On propose les deux, il
// choisit la sienne. L'ordre compte : la première carte est la plus mise en avant.
const CONNECTORS_FOR_CAPABILITY: Record<string, string[]> = {
  email_send: ["gmail", "outlook"],
  calendar_read: ["google-calendar", "outlook-calendar"],
};

/** Les connecteurs à proposer pour un code de manque. Vide si non-OAuth. */
export function connectorsForCapability(code: string): string[] {
  return CONNECTORS_FOR_CAPABILITY[code] ?? [];
}

// ── Statut d'un connecteur à partir des connexions de l'utilisateur ─────────

/** Vue publique d'une connexion (ce que l'API expose — jamais les jetons). */
export type ConnectionInfo = {
  provider: OAuthProvider;
  scopes: string[];
  connected_at: string;
};

export type ConnectorStatus = "soon" | "builtin" | "connected" | "disconnected";

/**
 * Forme canonique d'un scope, pour COMPARER demandé vs accordé.
 *
 * Azure AD accepte la forme longue (« https://graph.microsoft.com/Mail.Send »)
 * mais renvoie la forme COURTE (« Mail.Send ») dans le jeton. Comparer les deux
 * telles quelles échoue toujours : la carte Outlook resterait « à connecter »
 * pour l'éternité, alors même que l'utilisateur vient de donner son consentement.
 * Le préfixe Graph est donc retiré des deux côtés. Les scopes Google sont des URI
 * complètes sans préfixe commun : ils traversent cette fonction inchangés.
 *
 * Exporté : les clients Graph (lib/msgraph.ts) doivent comparer de la même façon,
 * sinon on ré-introduit le bug un étage plus bas.
 */
const GRAPH_SCOPE_PREFIX = "https://graph.microsoft.com/";
export function normalizeScope(scope: string): string {
  const s = scope.startsWith(GRAPH_SCOPE_PREFIX) ? scope.slice(GRAPH_SCOPE_PREFIX.length) : scope;
  return s.toLowerCase();
}

/** Le jeu de scopes accordés contient-il TOUS ceux demandés ? (comparaison canonique) */
export function scopesCover(granted: string[], required: string[]): boolean {
  const have = new Set(granted.map(normalizeScope));
  return required.every((s) => have.has(normalizeScope(s)));
}

export function connectorStatus(c: Connector, connections: ConnectionInfo[]): ConnectorStatus {
  // « soon » l'emporte sur tout : tant que rien ne lit le jeton, on n'affiche ni
  // « Connecter », ni « Connecté », ni « Intégré ». On dit la vérité : « Bientôt ».
  if (c.status === "soon") return "soon";
  if (c.kind === "builtin") return "builtin";
  const conn = connections.find((x) => x.provider === c.provider);
  if (!conn) return "disconnected";
  return scopesCover(conn.scopes, c.scopes ?? []) ? "connected" : "disconnected";
}
