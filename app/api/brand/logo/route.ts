// ─────────────────────────────────────────────────────────────────────────────
// /api/brand/logo — LOGO DE L'ENTREPRISE. Le premier vrai binaire stocké du
// produit (bucket `brand`, migration 047).
//
// Pourquoi une route serveur plutôt qu'un upload direct depuis le navigateur :
//   • Le bucket n'accepte AUCUNE écriture cliente (aucune policy insert). Seul le
//     service_role écrit, et seulement après avoir vérifié ici que l'appelant est
//     owner/admin du tenant. Un jeton utilisateur volé ne peut pas remplacer le
//     logo d'une entreprise sur ses devis.
//   • Le fichier est validé (type réel, taille) AVANT d'atterrir sur un devis.
//
// Le format suit le pattern maison : base64 en JSON (cf. /api/knowledge).
// POST   { name, mediaType, data }  → { ok, logoUrl }
// DELETE                            → { ok }  (retire le logo)
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { getEntitlementsForTenant, frozenMessage } from "@/lib/entitlements";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

export const runtime = "nodejs";

const BUCKET = "brand";
const MAX_BYTES = 2 * 1024 * 1024; // 2 Mo — aligné sur file_size_limit du bucket

/** PNG et JPEG uniquement : le moteur PDF ne décode rien d'autre, et un SVG peut
 *  porter du script. Un logo accepté ici DOIT pouvoir s'imprimer sur un devis. */
const ALLOWED: Record<string, "png" | "jpg"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

/** Le type déclaré par le navigateur ne fait pas foi : on lit la SIGNATURE réelle
 *  des octets. Un .svg renommé en .png serait sinon accepté puis stocké. */
function sniff(buf: Buffer): "png" | "jpg" | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  return null;
}

function stripDataUrl(s: string): string {
  const i = s.indexOf(";base64,");
  return i >= 0 ? s.slice(i + 8) : s;
}

/** Seul un patron (owner/admin) change l'identité visuelle de l'entreprise :
 *  elle part sur TOUS les devis, ce n'est pas une préférence personnelle. */
function canEditBrand(role: string): boolean {
  return role === "owner" || role === "admin";
}

async function authorize(locale: "fr" | "en") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: Response.json({ error: pick(locale, "Authentification requise.", "Authentication required.") }, { status: 401 }) };
  }

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership) {
    return { error: Response.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 }) };
  }
  if (!canEditBrand(membership.role)) {
    return {
      error: Response.json(
        {
          error: pick(
            locale,
            "Seul un administrateur peut modifier l'identité visuelle de l'entreprise.",
            "Only an administrator can change the company's visual identity."
          ),
        },
        { status: 403 }
      ),
    };
  }

  const ent = await getEntitlementsForTenant(supabase, membership.tenant_id);
  if (!ent.writable) {
    return { error: Response.json({ error: frozenMessage(locale, ent), frozen: true }, { status: 403 }) };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: Response.json({ error: pick(locale, "Stockage indisponible.", "Storage unavailable.") }, { status: 503 }) };
  }

  return { supabase, admin, tenantId: membership.tenant_id };
}

/** Supprime l'ancien fichier après un remplacement : sans ça, chaque changement de
 *  logo laisse un orphelin payant dans le bucket, pour toujours. */
async function removeOldObject(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  logoUrl: string | null | undefined
) {
  if (!logoUrl) return;
  const marker = `/${BUCKET}/`;
  const i = logoUrl.indexOf(marker);
  if (i < 0) return;
  const path = logoUrl.slice(i + marker.length).split("?")[0];
  if (!path) return;
  await admin.storage.from(BUCKET).remove([path]);
}

export async function POST(req: Request) {
  const locale = await getLocale();
  const auth = await authorize(locale);
  if ("error" in auth) return auth.error;
  const { admin, tenantId } = auth;

  let body: { mediaType?: unknown; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: pick(locale, "Requête invalide.", "Invalid request.") }, { status: 400 });
  }

  const declared = typeof body.mediaType === "string" ? body.mediaType.toLowerCase() : "";
  const raw = typeof body.data === "string" ? stripDataUrl(body.data) : "";
  if (!ALLOWED[declared] || !raw) {
    return Response.json(
      { error: pick(locale, "Formats acceptés : PNG ou JPEG.", "Accepted formats: PNG or JPEG.") },
      { status: 400 }
    );
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    return Response.json({ error: pick(locale, "Image illisible.", "Unreadable image.") }, { status: 400 });
  }

  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    return Response.json(
      { error: pick(locale, "Le logo doit peser moins de 2 Mo.", "The logo must be under 2 MB.") },
      { status: 400 }
    );
  }

  const real = sniff(buf);
  if (!real) {
    return Response.json(
      {
        error: pick(
          locale,
          "Ce fichier n'est pas une image PNG ou JPEG valide.",
          "This file is not a valid PNG or JPEG image."
        ),
      },
      { status: 400 }
    );
  }

  // Nom aléatoire : le remplacement du logo change l'URL, ce qui casse net les
  // caches (celui de Gmail compris). Sinon un client verrait l'ANCIEN logo pendant
  // des jours sur les nouveaux devis.
  const path = `${tenantId}/logo-${randomUUID()}.${real}`;
  const contentType = real === "png" ? "image/png" : "image/jpeg";

  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
    contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (upErr) {
    return Response.json(
      { error: pick(locale, "Envoi du logo impossible.", "Could not upload the logo.") },
      { status: 500 }
    );
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  const logoUrl = pub.publicUrl;

  const { data: prev } = await admin.from("tenants").select("logo_url").eq("id", tenantId).maybeSingle();

  const { error: dbErr } = await admin.from("tenants").update({ logo_url: logoUrl }).eq("id", tenantId);
  if (dbErr) {
    // La base a refusé → on ne laisse pas un fichier orphelin derrière nous.
    await admin.storage.from(BUCKET).remove([path]);
    return Response.json(
      { error: pick(locale, "Enregistrement du logo impossible.", "Could not save the logo.") },
      { status: 500 }
    );
  }

  await removeOldObject(admin, (prev as { logo_url?: string | null } | null)?.logo_url);

  return Response.json({ ok: true, logoUrl });
}

export async function DELETE() {
  const locale = await getLocale();
  const auth = await authorize(locale);
  if ("error" in auth) return auth.error;
  const { admin, tenantId } = auth;

  const { data: prev } = await admin.from("tenants").select("logo_url").eq("id", tenantId).maybeSingle();
  const { error } = await admin.from("tenants").update({ logo_url: null }).eq("id", tenantId);
  if (error) {
    return Response.json({ error: pick(locale, "Suppression impossible.", "Could not remove.") }, { status: 500 });
  }
  await removeOldObject(admin, (prev as { logo_url?: string | null } | null)?.logo_url);
  return Response.json({ ok: true });
}
