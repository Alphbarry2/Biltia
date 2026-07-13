// ─────────────────────────────────────────────────────────────────────────────
// /api/drive — classer un document Biltia dans le Google Drive de l'utilisateur.
//
//   GET  → { connected, canFile } (l'UI n'affiche l'action que si c'est vrai)
//   POST → FormData { file, folder? } → dépose le PDF dans « Biltia / <chantier> »
//
// Le PDF des documents générés est fabriqué DANS LE NAVIGATEUR (html2pdf, cf
// lib/pdf-share.ts). Les octets remontent donc ici, et c'est le serveur — lui
// seul — qui détient le jeton Google. Le jeton ne descend jamais au client :
// c'est la raison d'être de cette route, qui pourrait sinon être un simple
// fetch depuis le front.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { archiveToDrive, driveStatus } from "@/lib/gdrive";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

export const runtime = "nodejs";

/** Un PDF de devis pèse quelques centaines de Ko. Au-delà, c'est une anomalie :
 *  on refuse plutôt que de faire tourner un upload de plusieurs minutes. */
const MAX_BYTES = 20 * 1024 * 1024;

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

async function requireContext() {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { error: pick(locale, "Authentification requise.", "Authentication required.") },
        { status: 401 }
      ),
    };
  }

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership) {
    return {
      error: NextResponse.json(
        { error: pick(locale, "Aucun espace de travail actif.", "No active workspace.") },
        { status: 403 }
      ),
    };
  }

  return { user, tenantId: membership.tenant_id, locale };
}

export async function GET() {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;

  const status = await driveStatus(ctx.tenantId, ctx.user.id);
  return NextResponse.json(status);
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  }

  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { locale } = ctx;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Requête invalide.", "Invalid request.") },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: pick(locale, "Aucun fichier reçu.", "No file received.") },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: pick(locale, "Fichier trop volumineux.", "File too large.") },
      { status: 413 }
    );
  }

  const rawFolder = form.get("folder");
  const folder = typeof rawFolder === "string" && rawFolder.trim() ? rawFolder.trim() : null;

  const result = await archiveToDrive({
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    filename: file.name || "document.pdf",
    content: new Uint8Array(await file.arrayBuffer()),
    folder,
    contentType: file.type || "application/pdf",
  });

  if (!result.ok) {
    // Chaque échec dit quoi FAIRE. « Échec du classement » n'aide personne :
    // l'utilisateur doit savoir s'il lui manque une connexion ou une autorisation.
    const messages: Record<typeof result.reason, string> = {
      not_connected: pick(
        locale,
        "Google Drive n'est pas connecté. Allez dans Connecteurs pour l'activer.",
        "Google Drive isn't connected. Go to Connectors to enable it."
      ),
      missing_scope: pick(
        locale,
        "Biltia n'a pas encore l'autorisation d'écrire dans votre Drive. Reconnectez Google Drive depuis Connecteurs.",
        "Biltia doesn't have permission to write to your Drive yet. Reconnect Google Drive from Connectors."
      ),
      no_service: pick(
        locale,
        "Service momentanément indisponible.",
        "Service temporarily unavailable."
      ),
      drive_failed: pick(
        locale,
        "Google Drive a refusé le dépôt. Réessayez dans un instant.",
        "Google Drive rejected the upload. Try again in a moment."
      ),
    };
    const status = result.reason === "no_service" ? 503 : result.reason === "drive_failed" ? 502 : 409;
    return NextResponse.json({ error: messages[result.reason] }, { status });
  }

  return NextResponse.json({
    ok: true,
    url: result.url,
    folder: result.folder,
    updated: result.updated,
  });
}
