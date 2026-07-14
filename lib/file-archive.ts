// ─────────────────────────────────────────────────────────────────────────────
// CLASSEMENT DES DOCUMENTS — la porte UNIQUE vers « le classeur » de l'artisan :
// Google Drive ou OneDrive, selon ce qu'il a connecté. Le reste du produit ne
// choisit pas, il demande « range ce PDF ».
//
// Même promesse des deux côtés, et c'est le cœur de l'affaire : « Biltia / <chantier> »,
// un seul fichier par document (renvoyer un devis corrigé REMPLACE le PDF), et une
// visibilité limitée aux fichiers que Biltia a lui-même créés (drive.file côté
// Google, dossier d'application côté Microsoft).
//
// Ne throw JAMAIS : un classement raté ne doit jamais faire échouer l'envoi d'un
// devis. Le devis part ; le rangement, lui, peut attendre.
// ─────────────────────────────────────────────────────────────────────────────

import { archiveToDrive, driveStatus } from "./gdrive";
import { archiveToOneDrive, microsoftStatus } from "./msgraph";

/** Les connecteurs à proposer quand aucun classeur n'est connecté. */
export const ARCHIVE_CONNECTORS = ["google-drive", "onedrive"];

export type ArchiveProvider = "google-drive" | "onedrive";

export type ArchiveResult =
  | { ok: true; provider: ArchiveProvider; id: string; url: string; folder: string; updated: boolean }
  | {
      ok: false;
      reason: "not_connected" | "missing_scope" | "no_service" | "drive_failed";
      detail?: string;
    };

/** Un classeur est-il connecté, et autorisé à ranger ? Sert à l'UI (bouton
 *  « Classer ») et au preflight — donc lecture des scopes, pas d'upload d'essai. */
export async function archiveStatus(
  tenantId: string,
  userId: string
): Promise<{ connected: boolean; canFile: boolean; provider: ArchiveProvider | null }> {
  const google = await driveStatus(tenantId, userId);
  if (google.canFile) return { connected: true, canFile: true, provider: "google-drive" };

  const ms = await microsoftStatus(tenantId, userId);
  if (ms.canFile) return { connected: true, canFile: true, provider: "onedrive" };

  // Connecté sans le droit de classer (Gmail seul, Outlook seul) : on distingue,
  // parce que le message à afficher n'est pas le même — « connecte ton Drive »
  // plutôt que « connecte ton compte ».
  return { connected: google.connected || ms.connected, canFile: false, provider: null };
}

/**
 * Range un PDF chez le fournisseur connecté. Google d'abord (fournisseur
 * historique : inverser l'ordre déplacerait le classement des comptes existants
 * d'un Drive à l'autre, sans que personne ne l'ait demandé).
 */
export async function archiveDocument(args: {
  tenantId: string;
  userId: string;
  /** Nom du fichier, extension comprise (ex. « Devis-2026-001.pdf »). */
  filename: string;
  content: Uint8Array;
  /** Nom du chantier. Absent → « Documents ». */
  folder?: string | null;
  contentType?: string;
}): Promise<ArchiveResult> {
  const google = await archiveToDrive(args);
  if (google.ok) return { ...google, provider: "google-drive" };

  const onedrive = await archiveToOneDrive(args);
  if (onedrive.ok) return { ...onedrive, provider: "onedrive" };

  // Aucun des deux n'a rangé. On remonte le motif le plus PARLANT : si Google dit
  // seulement « pas connecté » alors que Microsoft, lui, a vraiment échoué, c'est
  // l'échec Microsoft qui décrit la situation réelle de l'utilisateur.
  const meaningful =
    google.reason === "not_connected" && onedrive.reason !== "not_connected" ? onedrive : google;
  return { ok: false, reason: meaningful.reason, detail: meaningful.detail };
}
