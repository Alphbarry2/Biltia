// ─────────────────────────────────────────────────────────────────────────────
// /api/documents/accept — « BON POUR ACCORD » signé par le CLIENT de l'artisan.
//
// Le visiteur n'a PAS de compte Biltia : il arrive par un lien secret reçu par
// mail. Zéro confiance — le jeton est la seule autorité, et il ne donne accès
// qu'à UN document. Tout est résolu en service_role côté serveur ; rien de ce que
// le navigateur envoie (tenant, id de devis, montant) n'est pris pour argent
// comptant : on ne lit que le jeton, le nom et la signature.
//
// Effets : le devis passe « accepté » dans le workspace, une VALIDATION signée est
// tracée (entité `validations`), et le veilleur `devis_accepte` peut se déclencher.
// C'est aussi ce qui alimente la facture 1 clic déjà en place.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClientUntyped } from "@/lib/supabase-admin";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { isShareToken } from "@/lib/share";

export const runtime = "nodejs";

/** Une signature manuscrite est un PNG de canvas. On borne strictement : le champ
 *  est en texte libre côté base, il ne doit pas devenir un dépotoir. */
const MAX_SIGNATURE_CHARS = 200_000;

export async function POST(req: Request) {
  let body: { token?: unknown; name?: unknown; signature?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!isShareToken(token)) {
    return Response.json({ error: "Lien invalide." }, { status: 404 });
  }

  // Anti-force brute sur les jetons : la limite porte sur le JETON, pas sur un
  // utilisateur (il n'y en a pas).
  const limited = await enforceRateLimit("share_read", `accept:${token}`, LIMITS.share_read);
  if (limited) return limited;

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (name.length < 2) {
    return Response.json({ error: "Merci d'indiquer votre nom pour signer." }, { status: 400 });
  }

  const signature =
    typeof body.signature === "string" && body.signature.startsWith("data:image/png;base64,")
      ? body.signature.slice(0, MAX_SIGNATURE_CHARS)
      : null;
  if (!signature) {
    return Response.json({ error: "Merci de signer dans le cadre prévu." }, { status: 400 });
  }

  const admin = createAdminClientUntyped();
  if (!admin) return Response.json({ error: "Service indisponible." }, { status: 503 });

  const { data: linkRow } = await admin
    .from("document_links")
    .select("id, tenant_id, kind, record_id, revoked, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  const link = linkRow as {
    id: string;
    tenant_id: string;
    kind: string;
    record_id: string;
    revoked: boolean;
    expires_at: string | null;
    accepted_at: string | null;
  } | null;

  // Un lien mort ne dit pas POURQUOI il est mort : révoqué, expiré ou inexistant,
  // la réponse est la même. Sinon le jeton devient un oracle.
  if (!link || link.revoked || (link.expires_at && Date.parse(link.expires_at) < Date.now())) {
    return Response.json({ error: "Ce lien n'est plus valable." }, { status: 404 });
  }
  if (link.kind !== "devis") {
    return Response.json({ error: "Ce document ne se signe pas." }, { status: 400 });
  }
  if (link.accepted_at) {
    return Response.json({ ok: true, alreadyAccepted: true, acceptedAt: link.accepted_at });
  }

  const { data: devisRow } = await admin
    .from("devis")
    .select("id, statut, client_id, chantier_id")
    .eq("id", link.record_id)
    .eq("tenant_id", link.tenant_id)
    .maybeSingle();

  const devis = devisRow as { id: string; statut: string; client_id: string | null; chantier_id: string | null } | null;
  if (!devis) return Response.json({ error: "Ce lien n'est plus valable." }, { status: 404 });

  // Un devis refusé ou expiré ne se signe pas dans le dos de l'artisan.
  if (devis.statut === "refuse" || devis.statut === "expire") {
    return Response.json(
      { error: "Ce devis n'est plus disponible à la signature. Contactez-nous." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  const { error: linkErr } = await admin
    .from("document_links")
    .update({
      accepted_at: now,
      accepted_by_name: name,
      accepted_ip: ip,
      signature_data: signature,
    })
    .eq("id", link.id)
    .is("accepted_at", null); // double-clic / double-onglet → une seule acceptation

  if (linkErr) {
    return Response.json({ error: "Signature non enregistrée. Réessayez." }, { status: 500 });
  }

  await admin.from("devis").update({ statut: "accepte" }).eq("id", devis.id).eq("tenant_id", link.tenant_id);

  // Trace dans le workspace : l'artisan voit QUI a signé et QUAND, pas seulement
  // un statut qui a changé tout seul.
  await admin.from("validations").insert({
    tenant_id: link.tenant_id,
    devis_id: devis.id,
    client_id: devis.client_id,
    chantier_id: devis.chantier_id,
    type: "acceptation_devis",
    statut: "signe",
    signataire_nom: name,
    date_signature: now,
    notes: "Bon pour accord signé en ligne par le client.",
  });

  return Response.json({ ok: true, acceptedAt: now, name });
}
