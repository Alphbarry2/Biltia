// ─────────────────────────────────────────────────────────────────────────────
// RÉSOLUTION D'UN DOCUMENT PUBLIC — le client de l'artisan, sans compte Biltia,
// ouvre un lien reçu par mail.
//
// Zéro confiance : le JETON est la seule autorité. Il ne donne accès qu'à UN
// document, en lecture. Tout passe par le service_role côté serveur (le visiteur
// n'a pas de session, donc pas de RLS pour le protéger) — d'où la vérification
// explicite du tenant à chaque requête, jamais déduite du navigateur.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClientUntyped } from "@/lib/supabase-admin";
import { getBrandKit, type BrandKit } from "@/lib/brand";
import { isShareToken } from "@/lib/share";
import { loadBusinessDocument, type DocumentKind } from "@/lib/documents/send-document";
import type { BusinessDoc, DocLine, DocParty } from "@/lib/documents/business-doc";

export type PublicDocumentLink = {
  id: string;
  tenantId: string;
  kind: DocumentKind;
  recordId: string;
  acceptedAt: string | null;
  acceptedByName: string | null;
  signatureData: string | null;
};

export type PublicDocument = {
  link: PublicDocumentLink;
  doc: BusinessDoc;
  lines: DocLine[];
  client: DocParty | null;
  brand: BrandKit;
};

/** Null = lien inexistant, révoqué ou expiré. La distinction n'est JAMAIS remontée
 *  au visiteur : un jeton qui répondrait « révoqué » plutôt que « inconnu »
 *  confirmerait son existence à qui le devine. */
export async function resolvePublicDocument(token: string): Promise<PublicDocument | null> {
  if (!isShareToken(token)) return null;

  const admin = createAdminClientUntyped();
  if (!admin) return null;

  const { data } = await admin
    .from("document_links")
    .select("id, tenant_id, kind, record_id, revoked, expires_at, accepted_at, accepted_by_name, signature_data")
    .eq("token", token)
    .maybeSingle();

  const row = data as {
    id: string;
    tenant_id: string;
    kind: string;
    record_id: string;
    revoked: boolean;
    expires_at: string | null;
    accepted_at: string | null;
    accepted_by_name: string | null;
    signature_data: string | null;
  } | null;

  if (!row || row.revoked) return null;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return null;

  const kind: DocumentKind = row.kind === "facture" ? "facture" : "devis";

  const loaded = await loadBusinessDocument(admin, row.tenant_id, kind, row.record_id);
  if (!loaded) return null;

  const brand = await getBrandKit(admin, row.tenant_id);

  return {
    link: {
      id: row.id,
      tenantId: row.tenant_id,
      kind,
      recordId: row.record_id,
      acceptedAt: row.accepted_at,
      acceptedByName: row.accepted_by_name,
      signatureData: row.signature_data,
    },
    doc: loaded.doc,
    lines: loaded.lines,
    client: loaded.client,
    brand,
  };
}

/** Accusé de lecture : l'artisan sait que son devis a été OUVERT (et quand).
 *  Best-effort — un compteur qui échoue ne doit pas empêcher l'affichage. */
export async function markDocumentViewed(linkId: string): Promise<void> {
  const admin = createAdminClientUntyped();
  if (!admin) return;
  try {
    const { data } = await admin
      .from("document_links")
      .select("view_count, viewed_at")
      .eq("id", linkId)
      .maybeSingle();
    const cur = data as { view_count: number; viewed_at: string | null } | null;
    await admin
      .from("document_links")
      .update({
        view_count: (cur?.view_count ?? 0) + 1,
        viewed_at: cur?.viewed_at ?? new Date().toISOString(),
      })
      .eq("id", linkId);
  } catch {
    /* le compteur n'est pas le produit */
  }
}
