// ─────────────────────────────────────────────────────────────────────────────
// ENVOI D'UN DOCUMENT COMMERCIAL — le point de passage UNIQUE.
//
// Avant : chaque app générée fabriquait son propre corps de mail en concaténant
// du texte (data/app-devis.ts), et un agent qui relançait un devis produisait un
// texte encore différent. Trois surfaces, trois devis, aucune identité.
//
// Ici : on part de la FICHE (devis/facture du workspace), on lit le Brand Kit du
// tenant, on rend un PDF vectoriel, on crée le lien « Voir et accepter », et on
// envoie une enveloppe email de marque avec le PDF en pièce jointe.
//
// Appelable avec un client RLS (l'utilisateur agit depuis son app) OU avec le
// client service_role (un agent agit à 3 h du matin) — dans ce cas le tenant est
// vérifié explicitement, jamais déduit.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrandKit } from "@/lib/brand";
import { sendOutboundEmail, type OutboundEmailResult } from "@/lib/outbound-email";
import { renderBusinessDocPdf, pdfFileName, computeTotals, type BusinessDoc, type DocLine, type DocParty } from "@/lib/documents/business-doc";
import { renderBrandedEmail, type EmailFact } from "@/lib/documents/email-shell";
import { money, fmtDate } from "@/lib/documents/format";

export type DocumentKind = "devis" | "facture";

export type SendDocumentResult =
  | {
      ok: true;
      via: string;
      note: string;
      url: string;
      attachment: string;
      to: string[];
    }
  | { ok: false; reason: string; needsClientEmail?: boolean };

/** URL publique du document. `origin` vient de la requête quand il y en a une ;
 *  un agent (cron, pas de Request) retombe sur le domaine canonique. */
export function documentLinkUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/document/${token}`;
}

export function canonicalBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  return (env || "https://www.biltia.com").replace(/\/+$/, "");
}

type DevisRow = {
  id: string;
  tenant_id: string;
  numero: string | null;
  client_id: string | null;
  chantier_id: string | null;
  statut: string;
  date_devis: string | null;
  date_validite: string | null;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  conditions: string | null;
};

type FactureRow = DevisRow & {
  type: string | null;
  date_facture: string | null;
  date_echeance: string | null;
  montant_paye: number;
};

/** Récupère (ou crée) le lien public du document. UN SEUL lien par fiche : renvoyer
 *  deux fois le même devis ne doit pas produire deux URL, sinon la signature du
 *  client se retrouve attachée à un lien mort. */
export async function ensureDocumentLink(
  db: SupabaseClient,
  tenantId: string,
  kind: DocumentKind,
  recordId: string,
  userId: string | null
): Promise<string | null> {
  const { data: existing } = await db
    .from("document_links")
    .select("token, revoked")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("record_id", recordId)
    .maybeSingle();

  const row = existing as { token: string; revoked: boolean } | null;
  if (row && !row.revoked) return row.token;

  // Lien révoqué → on le réarme (le client doit pouvoir rouvrir un devis renvoyé).
  if (row?.revoked) {
    const token = randomUUID();
    const { error } = await db
      .from("document_links")
      .update({ token, revoked: false })
      .eq("tenant_id", tenantId)
      .eq("kind", kind)
      .eq("record_id", recordId);
    return error ? null : token;
  }

  const token = randomUUID();
  const { error } = await db.from("document_links").insert({
    tenant_id: tenantId,
    kind,
    record_id: recordId,
    token,
    created_by: userId,
  });
  if (!error) return token;

  // Course entre deux envois simultanés : la contrainte d'unicité a tranché,
  // on relit le gagnant plutôt que d'échouer.
  const { data: raced } = await db
    .from("document_links")
    .select("token")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("record_id", recordId)
    .maybeSingle();
  return (raced as { token: string } | null)?.token ?? null;
}

/** Charge la fiche + ses lignes + le client + le chantier.
 *  Exporté : la page publique « Voir et accepter » et le téléchargement du PDF
 *  lisent le document par CE chemin. Un second chargeur finirait par diverger —
 *  et le client verrait un montant à l'écran, un autre dans la pièce jointe. */
export async function loadBusinessDocument(
  db: SupabaseClient,
  tenantId: string,
  kind: DocumentKind,
  id: string
): Promise<{ doc: BusinessDoc; lines: DocLine[]; client: DocParty | null } | null> {
  const table = kind === "devis" ? "devis" : "factures";
  const { data: rec } = await db
    .from(table)
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!rec) return null;

  const row = rec as DevisRow & Partial<FactureRow>;

  const { data: lineRows } = await db
    .from("lignes")
    .select("designation, quantite, unite, prix_unitaire_ht, taux_tva, total_ht, position")
    .eq(kind === "devis" ? "devis_id" : "facture_id", id)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: true });

  const lines: DocLine[] = ((lineRows ?? []) as Record<string, unknown>[]).map((l) => ({
    designation: String(l.designation ?? ""),
    quantite: Number(l.quantite ?? 1),
    unite: (l.unite as string | null) ?? null,
    prix_unitaire_ht: Number(l.prix_unitaire_ht ?? 0),
    taux_tva: Number(l.taux_tva ?? 20),
    total_ht: Number(l.total_ht ?? 0),
  }));

  let client: DocParty | null = null;
  if (row.client_id) {
    const { data: c } = await db
      .from("clients")
      .select("nom, adresse, code_postal, ville, email, tel, siret")
      .eq("id", row.client_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (c) client = c as DocParty;
  }

  let objet: string | null = null;
  if (row.chantier_id) {
    const { data: ch } = await db
      .from("chantiers")
      .select("nom")
      .eq("id", row.chantier_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    objet = (ch as { nom?: string } | null)?.nom ?? null;
  }

  const doc: BusinessDoc = {
    kind,
    type: kind === "facture" ? (row.type ?? "facture") : null,
    numero: row.numero ?? "",
    date: kind === "devis" ? row.date_devis : (row.date_facture ?? null),
    dateLimite: kind === "devis" ? row.date_validite : (row.date_echeance ?? null),
    objet,
    conditions: row.conditions ?? null,
    montantHt: Number(row.montant_ht ?? 0),
    montantTva: Number(row.montant_tva ?? 0),
    montantTtc: Number(row.montant_ttc ?? 0),
    montantPaye: kind === "facture" ? Number(row.montant_paye ?? 0) : undefined,
  };

  return { doc, lines, client };
}

/**
 * Envoie un devis ou une facture : PDF de marque en pièce jointe + enveloppe
 * email de marque + lien « Voir et accepter ». Ne throw jamais.
 */
export async function sendBusinessDocument(args: {
  db: SupabaseClient;
  tenantId: string;
  userId: string | null;
  fromEmail?: string | null;
  kind: DocumentKind;
  id: string;
  /** Destinataires explicites. Par défaut : l'email du client de la fiche. */
  to?: string[];
  /** Mot d'accompagnement libre, ajouté au corps (l'artisan garde sa voix). */
  message?: string;
  /** Remplace la phrase d'ouverture. Une RELANCE ne s'ouvre pas comme un premier
   *  envoi : « Sauf erreur de notre part, cette facture reste à régler… » plutôt
   *  que « Veuillez trouver notre facture… ». */
  intro?: string;
  /** Remplace « Votre devis » / « Votre facture » dans l'objet (ex. « Relance facture »). */
  subjectLabel?: string;
  /** Origine de la requête (pour l'URL du lien public). */
  baseUrl?: string;
}): Promise<SendDocumentResult> {
  const { db, tenantId, userId, kind, id } = args;

  const loaded = await loadBusinessDocument(db, tenantId, kind, id);
  if (!loaded) return { ok: false, reason: `${kind === "devis" ? "Devis" : "Facture"} introuvable.` };
  const { doc, lines, client } = loaded;

  // Destinataire : celui qu'on nous donne, sinon l'email du client de la fiche.
  const explicit = (args.to ?? []).filter((e) => typeof e === "string" && e.includes("@"));
  const to = explicit.length ? explicit : client?.email ? [client.email] : [];
  if (!to.length) {
    return {
      ok: false,
      reason: client
        ? `${client.nom} n'a pas d'adresse email. Ajoutez-la sur sa fiche pour envoyer le document.`
        : "Aucun client rattaché : impossible de savoir à qui envoyer.",
      needsClientEmail: true,
    };
  }

  const brand = await getBrandKit(db, tenantId);
  const totals = computeTotals(lines, doc);

  // Le PDF et le lien en parallèle : deux allers-retours indépendants.
  const [pdf, token] = await Promise.all([
    renderBusinessDocPdf({ doc, lines, client, brand }),
    ensureDocumentLink(db, tenantId, kind, id, userId),
  ]);

  const base = args.baseUrl || canonicalBaseUrl();
  const url = token ? documentLinkUrl(base, token) : "";
  const isDevis = kind === "devis";
  const label = isDevis ? "devis" : "facture";
  const numero = doc.numero || "";

  const facts: EmailFact[] = [];
  if (numero) facts.push({ label: isDevis ? "Devis n°" : "Facture n°", value: numero });
  if (doc.objet) facts.push({ label: "Objet", value: doc.objet });
  facts.push({ label: "Total TTC", value: money(totals.ttc), strong: true });
  if (doc.dateLimite) {
    facts.push({ label: isDevis ? "Valable jusqu'au" : "À régler avant le", value: fmtDate(doc.dateLimite) });
  }
  if (!isDevis && (doc.montantPaye ?? 0) > 0) {
    facts.push({ label: "Reste à payer", value: money(totals.ttc - (doc.montantPaye ?? 0)) });
  }

  const paragraphs: string[] = [
    args.intro?.trim()
      ? args.intro.trim().slice(0, 600)
      : isDevis
        ? `Veuillez trouver notre devis${numero ? ` ${numero}` : ""}${doc.objet ? ` pour ${doc.objet}` : ""}.`
        : `Veuillez trouver notre facture${numero ? ` ${numero}` : ""}${doc.objet ? ` pour ${doc.objet}` : ""}.`,
  ];
  if (args.message?.trim()) paragraphs.push(args.message.trim().slice(0, 1200));
  if (isDevis && doc.dateLimite) {
    paragraphs.push(`Ce devis est valable jusqu'au ${fmtDate(doc.dateLimite)}. Nous restons à votre disposition pour en discuter.`);
  }

  const attachment = pdfFileName(doc);
  // L'objet se termine par le nom de l'entreprise : dans une boîte mail encombrée,
  // le client reconnaît l'artisan avant même d'ouvrir.
  const subjectLabel = args.subjectLabel?.trim() || (isDevis ? "Votre devis" : "Votre facture");
  const mail = renderBrandedEmail({
    brand,
    subject: `${subjectLabel}${numero ? ` ${numero}` : ""}${brand.entreprise ? ` — ${brand.entreprise}` : ""}`,
    greeting: client?.nom ? `Bonjour ${client.nom},` : "Madame, Monsieur,",
    paragraphs,
    facts,
    cta: url ? { label: isDevis ? "Voir et accepter le devis" : "Voir la facture", url } : undefined,
    ctaFallbackNote: url ? `Si le bouton ne fonctionne pas : ${url}` : undefined,
    attachmentNote: `Le ${label} complet est joint à ce message au format PDF (${attachment}).`,
  });

  const sent: OutboundEmailResult = await sendOutboundEmail({
    tenantId,
    userId,
    fromEmail: args.fromEmail ?? null,
    to,
    subject: mail.subject,
    body: mail.text,
    html: mail.html,
    attachments: [{ filename: attachment, content: pdf, contentType: "application/pdf" }],
  });

  if (!sent.ok) return { ok: false, reason: sent.reason };

  // Le document est parti → la fiche avance. Un devis « brouillon » qui a été
  // envoyé n'est plus un brouillon (sinon le veilleur « devis non signé » ne se
  // déclenche jamais : il ne relance que ce qui a été envoyé).
  const table = isDevis ? "devis" : "factures";
  const { data: cur } = await db.from(table).select("statut").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if ((cur as { statut?: string } | null)?.statut === "brouillon") {
    await db
      .from(table)
      .update({ statut: isDevis ? "envoye" : "envoyee" })
      .eq("id", id)
      .eq("tenant_id", tenantId);
  }

  return { ok: true, via: sent.via, note: sent.note, url, attachment, to };
}
