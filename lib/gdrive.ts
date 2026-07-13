// ─────────────────────────────────────────────────────────────────────────────
// CLASSEMENT GOOGLE DRIVE — « le classeur » de l'artisan.
//
// Dépose un PDF produit par Biltia (devis, facture, PV…) dans le Drive de
// l'utilisateur, rangé dans « Biltia / <chantier> ». C'est le seul usage de
// Drive, et il colle exactement au scope demandé : `drive.file` ne donne accès
// QU'AUX fichiers que l'application a elle-même créés. Le reste du Drive de
// l'utilisateur nous est structurellement invisible — même en cas de bug ici,
// on ne PEUT pas lire ses autres fichiers.
//
// Corollaire à connaître : `files.list` ne renvoie, lui aussi, que nos propres
// fichiers. C'est ce qui rend la recherche de dossier fiable ET sûre — on ne
// risque pas de « trouver » un dossier Biltia appartenant à quelqu'un d'autre.
//
// STRICTEMENT côté serveur : le jeton est lu via le client service_role et ne
// quitte jamais le serveur. Ne throw JAMAIS : renvoie un résultat typé, parce
// qu'un classement Drive raté ne doit jamais faire échouer l'envoi d'un devis.
// ─────────────────────────────────────────────────────────────────────────────

import { getValidGoogleToken } from "./gmail";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** Dossier racine créé dans le Drive de l'utilisateur. Tout vit dessous. */
const ROOT_FOLDER = "Biltia";
/** Document sans chantier rattaché : il est rangé, pas laissé à la racine. */
const UNFILED_FOLDER = "Documents";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveArchiveResult =
  | { ok: true; id: string; url: string; folder: string; updated: boolean }
  | {
      ok: false;
      reason: "not_connected" | "missing_scope" | "no_service" | "drive_failed";
      detail?: string;
    };

/** Statut Drive pour l'UI : connecté, et autorisé à classer ? */
export async function driveStatus(
  tenantId: string,
  userId: string
): Promise<{ connected: boolean; canFile: boolean }> {
  const tok = await getValidGoogleToken(tenantId, userId);
  if (!tok.ok) return { connected: false, canFile: false };
  return { connected: true, canFile: tok.scopes.includes(DRIVE_FILE_SCOPE) };
}

/** Échappe une valeur pour la syntaxe `q` de l'API Drive (guillemets simples). */
function q(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Un nom de dossier Drive ne doit pas contenir de saut de ligne, et un nom de
 *  chantier saisi à la main peut en contenir. On borne aussi la longueur. */
function safeFolderName(name: string): string {
  const clean = name.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, 120) || UNFILED_FOLDER;
}

async function driveFetch(
  accessToken: string,
  url: string,
  init: RequestInit = {}
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; detail: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, detail: `${res.status} ${text.slice(0, 300)}` };
    return { ok: true, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "network" };
  }
}

/** Trouve le dossier, ou le crée. Idempotent : deux envois simultanés du même
 *  devis ne doivent pas fabriquer deux dossiers « Biltia ». */
async function ensureFolder(
  accessToken: string,
  name: string,
  parentId: string | null
): Promise<{ ok: true; id: string } | { ok: false; detail: string }> {
  const parentClause = parentId ? ` and '${q(parentId)}' in parents` : "";
  const search = await driveFetch(
    accessToken,
    "https://www.googleapis.com/drive/v3/files?" +
      new URLSearchParams({
        q: `name='${q(name)}' and mimeType='${FOLDER_MIME}' and trashed=false${parentClause}`,
        fields: "files(id)",
        spaces: "drive",
        pageSize: "1",
      })
  );
  if (!search.ok) return { ok: false, detail: search.detail };

  const found = (search.json.files as { id: string }[] | undefined)?.[0];
  if (found?.id) return { ok: true, id: found.id };

  const created = await driveFetch(accessToken, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!created.ok) return { ok: false, detail: created.detail };

  const id = created.json.id as string | undefined;
  return id ? { ok: true, id } : { ok: false, detail: "no folder id" };
}

/** Fichier déjà présent dans ce dossier, portant ce nom ? */
async function findFile(
  accessToken: string,
  name: string,
  parentId: string
): Promise<string | null> {
  const res = await driveFetch(
    accessToken,
    "https://www.googleapis.com/drive/v3/files?" +
      new URLSearchParams({
        q: `name='${q(name)}' and '${q(parentId)}' in parents and trashed=false`,
        fields: "files(id)",
        spaces: "drive",
        pageSize: "1",
      })
  );
  if (!res.ok) return null;
  return (res.json.files as { id: string }[] | undefined)?.[0]?.id ?? null;
}

/** Corps multipart/related attendu par l'upload Drive : métadonnées JSON puis
 *  octets bruts. Construit à la main car il faut mêler texte et binaire. */
function multipartBody(
  boundary: string,
  metadata: Record<string, unknown>,
  content: Uint8Array,
  contentType: string
): Uint8Array {
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + content.length + tail.length);
  body.set(head, 0);
  body.set(content, head.length);
  body.set(tail, head.length + content.length);
  return body;
}

/**
 * Classe un PDF dans « Biltia / <chantier> » du Drive de l'utilisateur.
 *
 * Renvoyer deux fois le même devis ne doit pas empiler « Devis-2026-001.pdf »,
 * « Devis-2026-001 (1).pdf »… : si le fichier existe déjà au même endroit, on
 * REMPLACE son contenu (le montant a pu changer entre deux envois) et on garde
 * le même lien Drive.
 */
export async function archiveToDrive(args: {
  tenantId: string;
  userId: string;
  /** Nom du fichier, extension comprise (ex. « Devis-2026-001.pdf »). */
  filename: string;
  content: Uint8Array;
  /** Nom du chantier. Absent → « Sans chantier ». */
  folder?: string | null;
  contentType?: string;
}): Promise<DriveArchiveResult> {
  const tok = await getValidGoogleToken(args.tenantId, args.userId);
  if (!tok.ok) {
    return { ok: false, reason: tok.reason === "no_service" ? "no_service" : "not_connected" };
  }
  if (!tok.scopes.includes(DRIVE_FILE_SCOPE)) return { ok: false, reason: "missing_scope" };

  const token = tok.accessToken;
  const contentType = args.contentType ?? "application/pdf";
  const folderName = safeFolderName(args.folder ?? UNFILED_FOLDER);

  const root = await ensureFolder(token, ROOT_FOLDER, null);
  if (!root.ok) return { ok: false, reason: "drive_failed", detail: root.detail };

  const target = await ensureFolder(token, folderName, root.id);
  if (!target.ok) return { ok: false, reason: "drive_failed", detail: target.detail };

  const existingId = await findFile(token, args.filename, target.id);

  // Fichier déjà classé → on écrase son contenu, le lien Drive reste valable.
  if (existingId) {
    const updated = await driveFetch(
      token,
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=media&fields=id,webViewLink`,
      { method: "PATCH", headers: { "Content-Type": contentType }, body: args.content as BodyInit }
    );
    if (!updated.ok) return { ok: false, reason: "drive_failed", detail: updated.detail };
    return {
      ok: true,
      id: existingId,
      url: (updated.json.webViewLink as string) ?? "",
      folder: folderName,
      updated: true,
    };
  }

  const boundary = `biltia-${Math.random().toString(36).slice(2)}`;
  const created = await driveFetch(
    token,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: multipartBody(
        boundary,
        { name: args.filename, parents: [target.id], mimeType: contentType },
        args.content,
        contentType
      ) as BodyInit,
    }
  );
  if (!created.ok) return { ok: false, reason: "drive_failed", detail: created.detail };

  const id = created.json.id as string | undefined;
  if (!id) return { ok: false, reason: "drive_failed", detail: "no file id" };

  return {
    ok: true,
    id,
    url: (created.json.webViewLink as string) ?? "",
    folder: folderName,
    updated: false,
  };
}
