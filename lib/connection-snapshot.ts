// ─────────────────────────────────────────────────────────────────────────────
// CE QUI EST VRAIMENT BRANCHÉ — le copilote cesse de DEVINER.
//
// LE BUG (constaté en prod le 2026-07-14) : /api/generate ne lisait JAMAIS
// `user_connections`. Le prompt du copilote lui disait littéralement « considère
// qu'il peut être connecté » — alors il inventait. Il a sorti « ton Drive n'est
// pas connecté » à un artisan dont le Drive ÉTAIT connecté, puis l'a cru sur
// parole quand il a protesté, puis a promis un rangement qui n'a jamais eu lieu.
// Trois mensonges d'affilée, tous nés de la même absence de lecture.
//
// Un copilote qui ignore ses propres branchements ne peut être ni honnête ni
// utile. Ici : UNE lecture, sans réseau (aucun rafraîchissement de jeton — on
// lit l'INTENTION de l'artisan, cf. migration 055 `connectors`), et il sait.
//
// LA LIMITE DU CLASSEUR, à dire telle quelle : le scope Google est `drive.file`
// (lib/gdrive.ts) — Biltia peut DÉPOSER un fichier dans le Drive, et ne voit que
// ce qu'il y a lui-même déposé. Il ne peut ni lire, ni lister, ni déplacer ce qui
// s'y trouvait déjà. Ce n'est pas une lacune à combler : c'est le scope minimal
// qui nous évite l'audit CASA, et il est assumé. Le copilote doit le dire
// clairement, pas s'en excuser ni le contourner par une promesse creuse.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "./supabase-admin";
import { getConnector } from "./connectors";
import { pick, type Locale } from "./i18n/config";

export type ConnectionSnapshot = {
  /** Envoi d'emails au nom de l'artisan (Gmail ou Outlook). */
  email: { connected: boolean; label: string | null };
  /** Lecture/écriture de l'agenda (Google Agenda ou Outlook Calendar). */
  calendar: { connected: boolean; label: string | null };
  /** Le « classeur » : Google Drive ou OneDrive. */
  classeur: { connected: boolean; label: string | null };
};

// Les connecteurs qui servent chaque capacité, du plus courant au moins courant.
// Un seul endroit : l'instantané et la phrase proposée à l'artisan ne peuvent
// plus diverger.
const EMAIL: [string, string][] = [["gmail", "Gmail"], ["outlook", "Outlook"]];
const AGENDA: [string, string][] = [["google-calendar", "Google Agenda"], ["outlook-calendar", "Outlook Calendar"]];
const CLASSEUR: [string, string][] = [["google-drive", "Google Drive"], ["onedrive", "OneDrive"]];

const AUCUNE: ConnectionSnapshot = {
  email: { connected: false, label: null },
  calendar: { connected: false, label: null },
  classeur: { connected: false, label: null },
};

/**
 * Quel connecteur branché couvre cette capacité, s'il y en a un ?
 *
 * DOUBLE CONDITION, et les deux comptent :
 *   1. l'artisan l'a branché (`connectors`) ;
 *   2. le connecteur est "live" au CATALOGUE — c'est-à-dire réellement utilisable
 *      aujourd'hui (lib/connectors.ts).
 *
 * Sans le point 2, on retomberait exactement dans le bug qu'on corrige : un
 * artisan ayant branché OneDrive du temps où il était annoncé s'entendrait dire
 * « ton classeur est branché, je range » par un copilote dont le chemin d'action
 * refuse le fournisseur passé en "soon". Promettre, puis échouer. C'est le
 * catalogue qui tranche, jamais la seule trace en base.
 */
function premier(actifs: Set<string>, candidats: [string, string][]): { connected: boolean; label: string | null } {
  for (const [id, label] of candidats) {
    if (actifs.has(id) && getConnector(id)?.status === "live") return { connected: true, label };
  }
  return { connected: false, label: null };
}

/**
 * Ce que l'artisan a EXPLICITEMENT branché. Ne throw jamais : un copilote ne
 * doit pas tomber parce qu'une lecture de connecteurs a échoué — il retombe
 * simplement sur « rien de branché », ce qui reste vrai par défaut.
 */
export async function connectionSnapshot(
  tenantId: string,
  userId: string
): Promise<ConnectionSnapshot> {
  const admin = createAdminClient();
  if (!admin) return AUCUNE;

  try {
    const { data } = await admin
      .from("user_connections")
      .select("connectors")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId);

    // `connectors` est la source de vérité de l'activation (migration 055) : on
    // ne la REDÉDUIT jamais des scopes, que Google renvoie en trop
    // (include_granted_scopes) — c'est ce qui faisait passer l'Agenda en
    // « connecté » tout seul dès qu'on branchait Gmail.
    const actifs = new Set<string>(
      ((data ?? []) as { connectors?: string[] | null }[]).flatMap((r) => r.connectors ?? [])
    );

    return {
      email: premier(actifs, EMAIL),
      calendar: premier(actifs, AGENDA),
      classeur: premier(actifs, CLASSEUR),
    };
  } catch {
    return AUCUNE;
  }
}

/**
 * Ce qu'on peut HONNÊTEMENT proposer de brancher pour une capacité : uniquement
 * les connecteurs "live" du catalogue. Envoyer un artisan brancher OneDrive
 * quand OneDrive est en "soon" (bouton désactivé, API fail-closed), c'est le
 * promener — la variante polie du mensonge qu'on est en train d'éliminer.
 */
function aProposer(candidats: [string, string][], locale: Locale): string {
  const vivants = candidats
    .filter(([id]) => getConnector(id)?.status === "live")
    .map(([, label]) => label);
  if (!vivants.length) {
    return pick(locale, "aucun connecteur disponible aujourd'hui", "no connector available today");
  }
  return pick(
    locale,
    `${vivants.join(" ou ")} à brancher dans Connecteurs`,
    `connect ${vivants.join(" or ")} in Connectors`
  );
}

/**
 * Le bloc que voit le modèle. Il énonce l'état RÉEL, et la frontière du classeur
 * dans les mots exacts qu'il doit reprendre. Un « je ne peux pas » de trop coûte
 * un client ; un « je m'en occupe » de trop coûte la confiance. Les deux se
 * corrigent en donnant les faits.
 */
export function buildConnectionsBlock(snap: ConnectionSnapshot, locale: Locale): string {
  const etat = (c: { connected: boolean; label: string | null }, off: string) =>
    c.connected
      ? pick(locale, `BRANCHÉ (${c.label})`, `CONNECTED (${c.label})`)
      : pick(locale, `PAS branché (${off})`, `NOT connected (${off})`);

  return pick(
    locale,
    `# CONNEXIONS DE CET ARTISAN (état réel, lu à l'instant — ne DEVINE jamais, ne demande pas « est-ce connecté ? »)
- Envoi d'emails : ${etat(snap.email, aProposer(EMAIL, locale))}
- Agenda : ${etat(snap.calendar, aProposer(AGENDA, locale))}
- Classeur (où tu ranges les documents) : ${etat(snap.classeur, aProposer(CLASSEUR, locale))}

CE QUE TU FAIS AVEC LE CLASSEUR (dis-le tel quel, sans jamais promettre plus) :
- Tu SAIS y DÉPOSER un fichier : un document que tu viens de produire (devis, facture, PV, courrier), ou un fichier que l'artisan JOINT ici même au chat. Il est rangé dans « Biltia / <nom du chantier> ».
- Tu ne SAIS PAS aller chercher un fichier déjà présent dans son Drive, ni le lire, ni le lister, ni le déplacer : Biltia ne voit QUE les fichiers qu'il y a lui-même déposés. Tu ne sais pas non plus atteindre un fichier resté sur son ordinateur.
- Donc : « transfère mon PDF sur le Drive » → tu réponds qu'il te le JOIGNE ici (trombone), et tu le ranges. C'est une phrase utile, pas un refus.
- Si le classeur n'est PAS branché : « Ton classeur n'est pas encore branché — connecte Google Drive ou OneDrive dans Connecteurs et je range tes documents dedans. » Jamais « ce n'est pas dans mes capacités » : c'est à un branchement près.`,
    `# THIS TRADESPERSON'S CONNECTIONS (real state, read just now — never GUESS, never ask "is it connected?")
- Sending email: ${etat(snap.email, "connect Gmail or Outlook in Connectors")}
- Calendar: ${etat(snap.calendar, "connect Google Calendar or Outlook in Connectors")}
- Filing space (Drive/OneDrive): ${etat(snap.classeur, "connect Google Drive or OneDrive in Connectors")}

WHAT YOU CAN DO WITH THE FILING SPACE (say exactly this, never promise more):
- You CAN drop a file into it: a document you just produced (quote, invoice, report, letter), or a file the user ATTACHES here in the chat. It is filed under "Biltia / <site name>".
- You CANNOT fetch, read, list or move a file that is already in their Drive: Biltia only sees the files it put there itself. You also cannot reach a file left on their computer.
- So: "move my PDF to Drive" → ask them to ATTACH it here (paperclip) and you file it. That is a useful answer, not a refusal.
- If the filing space is NOT connected: "Your filing space isn't connected yet — add Google Drive or OneDrive in Connectors and I'll file your documents there." Never "that's outside my capabilities": it's one connection away.`
  );
}
