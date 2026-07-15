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
// PAS DE STOCKAGE EXTERNE, et il faut que le copilote le SACHE. Les connecteurs
// Google Drive et OneDrive ont été retirés : Biltia ne dépose rien dehors et ne
// va rien y chercher. Le bloc ci-dessous le lui dit en toutes lettres — parce
// qu'un modèle à qui l'on ne dit rien invente, et qu'un copilote qui promet un
// dépôt qu'il ne fera jamais est exactement le bug qu'on a passé une journée à
// corriger, à l'envers.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "./supabase-admin";
import { getConnector } from "./connectors";
import { pick, type Locale } from "./i18n/config";

export type ConnectionSnapshot = {
  /** Envoi d'emails au nom de l'artisan (Gmail ou Outlook). */
  email: { connected: boolean; label: string | null };
  /** Lecture/écriture de l'agenda (Google Agenda ou Outlook Calendar). */
  calendar: { connected: boolean; label: string | null };
};

// Les connecteurs qui servent chaque capacité, du plus courant au moins courant.
// Un seul endroit : l'instantané et la phrase proposée à l'artisan ne peuvent
// plus diverger.
const EMAIL: [string, string][] = [["gmail", "Gmail"], ["outlook", "Outlook"]];
const AGENDA: [string, string][] = [["google-calendar", "Google Agenda"], ["outlook-calendar", "Outlook Calendar"]];

const AUCUNE: ConnectionSnapshot = {
  email: { connected: false, label: null },
  calendar: { connected: false, label: null },
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

STOCKAGE EXTERNE (Google Drive, OneDrive, Dropbox…) : TU N'EN AS PAS. Aucune connexion, aucun dépôt, aucune lecture.
- Ne promets JAMAIS de ranger un document « dans son Drive », même au futur, même « dès que c'est prêt ». Tu ne le feras pas.
- Dis-le simplement, et enchaîne sur ce qui est VRAI : ses devis et ses factures sont déjà conservés par Biltia (workspace + Bibliothèque), leur PDF se télécharge à tout moment, et il part en pièce jointe au client quand il l'envoie. Il n'a rien à ranger à la main.
- S'il veut te faire lire un fichier, qu'il te le JOIGNE ici (trombone). Ça, tu sais le faire.`,
    `# THIS TRADESPERSON'S CONNECTIONS (real state, read just now — never GUESS, never ask "is it connected?")
- Sending email: ${etat(snap.email, "connect Gmail or Outlook in Connectors")}
- Calendar: ${etat(snap.calendar, "connect Google Calendar or Outlook in Connectors")}

EXTERNAL STORAGE (Google Drive, OneDrive, Dropbox…): YOU HAVE NONE. No connection, no upload, no reading.
- NEVER promise to file a document "into their Drive", not even later, not even "as soon as it's ready". You will not do it.
- Say so plainly, then pivot to what is TRUE: their quotes and invoices are already kept by Biltia (workspace + Library), the PDF can be downloaded at any time, and it goes out as an attachment when they send it. Nothing to file by hand.
- If they want you to read a file, ask them to ATTACH it here (paperclip). That, you can do.`
  );
}
