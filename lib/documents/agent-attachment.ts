// ─────────────────────────────────────────────────────────────────────────────
// LES ENVOIS D'AGENTS PORTENT AUSSI L'IDENTITÉ DE L'ENTREPRISE.
//
// Un agent qui relance un devis impayé à 3 h du matin envoyait jusqu'ici du texte
// nu, et forçait le client à fouiller ses mails pour retrouver la pièce dont on
// lui parle. Ici, si la relance porte sur un DEVIS ou une FACTURE, elle repart
// avec : le PDF de marque en pièce jointe, le lien de consultation, et le bandeau
// aux couleurs de l'entreprise.
//
// Le MESSAGE, lui, reste celui rédigé par l'agent (la voix de l'artisan) : on
// l'habille, on ne le réécrit pas — et on n'ajoute donc NI salutation NI signature,
// puisqu'il en porte déjà.
//
// Dégradation honnête : la relance ne concerne pas une fiche commerciale, le PDF
// échoue, la fiche a disparu ? On renvoie l'email tel quel. Une relance qui part
// sans pièce jointe vaut mieux qu'une relance qui ne part pas.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrandKit } from "@/lib/brand";
import type { EmailAttachment } from "@/lib/mailer";
import { renderBusinessDocPdf, pdfFileName, computeTotals } from "@/lib/documents/business-doc";
import { renderBrandedEmail, type EmailFact } from "@/lib/documents/email-shell";
import { money, fmtDate } from "@/lib/documents/format";
import {
  ensureDocumentLink,
  loadBusinessDocument,
  documentLinkUrl,
  canonicalBaseUrl,
  type DocumentKind,
} from "@/lib/documents/send-document";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export type BrandedOutbound = {
  body: string;
  html?: string;
  attachments?: EmailAttachment[];
};

/** À quelle entité appartient cette fiche ? `agent_outbox.fiche_id` est du TEXTE et
 *  peut être préfixé (cf. migration 035) — on en extrait l'uuid, puis on demande à
 *  la base plutôt que de deviner d'après un préfixe qui pourrait changer. */
async function identify(
  db: SupabaseClient,
  tenantId: string,
  ficheId: string
): Promise<{ kind: DocumentKind; id: string } | null> {
  const m = ficheId.match(UUID_RE);
  if (!m) return null;
  const id = m[0];

  const { data: d } = await db.from("devis").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (d) return { kind: "devis", id };

  const { data: f } = await db.from("factures").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (f) return { kind: "facture", id };

  return null;
}

/**
 * Habille un email d'agent : PDF joint + enveloppe de marque, SI la relance porte
 * sur un devis ou une facture. Sinon renvoie le corps inchangé. Ne throw jamais.
 */
export async function brandAgentEmail(args: {
  db: SupabaseClient;
  tenantId: string;
  userId: string | null;
  /** `agent_outbox.fiche_id` — la fiche qui a déclenché la relance. */
  ficheId: string | null | undefined;
  /** Le message composé par l'agent : salutation et signature COMPRISES. */
  body: string;
  baseUrl?: string;
}): Promise<BrandedOutbound> {
  const plain: BrandedOutbound = { body: args.body };
  if (!args.ficheId) return plain;

  try {
    const target = await identify(args.db, args.tenantId, args.ficheId);
    if (!target) return plain;

    const loaded = await loadBusinessDocument(args.db, args.tenantId, target.kind, target.id);
    if (!loaded) return plain;

    const { doc, lines, client } = loaded;
    const brand = await getBrandKit(args.db, args.tenantId);
    const totals = computeTotals(lines, doc);
    const isDevis = target.kind === "devis";

    const [pdf, token] = await Promise.all([
      renderBusinessDocPdf({ doc, lines, client, brand }),
      ensureDocumentLink(args.db, args.tenantId, target.kind, target.id, args.userId),
    ]);

    const url = token ? documentLinkUrl(args.baseUrl || canonicalBaseUrl(), token) : "";
    const attachment = pdfFileName(doc);

    const facts: EmailFact[] = [];
    if (doc.numero) facts.push({ label: isDevis ? "Devis n°" : "Facture n°", value: doc.numero });
    if (doc.objet) facts.push({ label: "Objet", value: doc.objet });
    facts.push({ label: "Total TTC", value: money(totals.ttc), strong: true });
    if (!isDevis && (doc.montantPaye ?? 0) > 0) {
      facts.push({ label: "Reste à payer", value: money(totals.ttc - (doc.montantPaye ?? 0)) });
    }
    if (doc.dateLimite) {
      facts.push({ label: isDevis ? "Valable jusqu'au" : "À régler avant le", value: fmtDate(doc.dateLimite) });
    }

    const mail = renderBrandedEmail({
      brand,
      subject: "", // l'objet reste celui de l'agent : on n'habille que le CORPS
      // Le corps de l'agent porte déjà « Bonjour X » et « Bien cordialement » :
      // l'enveloppe n'en ajoute pas une seconde couche.
      paragraphs: args.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
      signOff: false,
      facts,
      cta: url ? { label: isDevis ? "Voir et accepter le devis" : "Voir la facture", url } : undefined,
      ctaFallbackNote: url ? `Si le bouton ne fonctionne pas : ${url}` : undefined,
      attachmentNote: `Le document est joint à ce message au format PDF (${attachment}).`,
    });

    return {
      body: mail.text,
      html: mail.html,
      attachments: [{ filename: attachment, content: pdf, contentType: "application/pdf" }],
    };
  } catch {
    // Le PDF, le lien ou la lecture ont échoué : la relance part quand même, nue.
    return plain;
  }
}
