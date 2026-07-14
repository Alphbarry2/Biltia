// ─────────────────────────────────────────────────────────────────────────────
// /document/[token] — LA PAGE QUE VOIT LE CLIENT DE L'ARTISAN.
//
// Il arrive du mail, sur son téléphone, sans compte. Il doit comprendre en trois
// secondes : qui, quoi, combien — puis pouvoir signer ou télécharger.
//
// Aucune marque Biltia ici (règle : le badge « Powered by Biltia » vit sur
// l'INTERFACE, jamais sur un document commercial). Cette page est la vitrine de
// l'artisan : son logo, ses couleurs, ses mentions légales.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolvePublicDocument, markDocumentViewed } from "@/lib/documents/public-doc";
import { computeTotals } from "@/lib/documents/business-doc";
import { money, qty, fmtDate } from "@/lib/documents/format";
import { readableOn, companyIdLabel } from "@/lib/brand";
import AcceptCard from "./accept-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Un devis est nominatif et chiffré : il n'a rien à faire dans un moteur de
// recherche, ni dans un aperçu de lien sur les réseaux.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

function titleFor(kind: "devis" | "facture", type?: string | null): string {
  if (kind === "devis") return "Devis";
  if (type === "acompte") return "Facture d'acompte";
  if (type === "situation") return "Situation";
  if (type === "avoir") return "Avoir";
  return "Facture";
}

export default async function DocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolvePublicDocument(token);
  if (!resolved) notFound();

  const { link, doc, lines, client, brand } = resolved;
  void markDocumentViewed(link.id); // accusé de lecture, best-effort

  const totals = computeTotals(lines, doc);
  const isDevis = doc.kind === "devis";
  const primary = brand.primary;
  const onPrimary = readableOn(primary);
  const title = titleFor(doc.kind, doc.type);

  const emitterMeta = [brand.address, [brand.phone, brand.email].filter(Boolean).join(" · ")].filter(Boolean);

  // Mentions issues de l'onglet Entreprise. Le libellé de l'identifiant suit le
  // PAYS : un artisan belge a un n° BCE, pas un SIRET.
  const legalBits: string[] = [];
  if (brand.entreprise) legalBits.push(brand.entreprise);
  if (brand.siret) legalBits.push(`${companyIdLabel(brand.country)} ${brand.siret}`);
  if (brand.vat) legalBits.push(`TVA ${brand.vat}`);

  return (
    <main className="min-h-dvh bg-[#F2F2F5] pb-16">
      <div style={{ background: primary }} className="h-1.5 w-full" />

      <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6 sm:pt-10">
        {/* En-tête émetteur */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt={brand.entreprise}
                className="h-12 w-auto max-w-[180px] object-contain"
              />
            ) : (
              <div className="text-xl font-extrabold text-[#111114]">{brand.entreprise || "—"}</div>
            )}
          </div>
          <div className="text-right text-xs leading-relaxed text-[#63636B]">
            {brand.logoUrl && brand.entreprise ? (
              <div className="text-sm font-bold text-[#111114]">{brand.entreprise}</div>
            ) : null}
            {emitterMeta.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        </header>

        {/* Le document */}
        <article className="mt-6 overflow-hidden rounded-2xl border border-[#ECECF0] bg-white">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#ECECF0] px-6 py-6 sm:px-8">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl" style={{ color: primary }}>
                {title}
              </h1>
              <div className="mt-1 text-base font-bold text-[#111114]">{doc.numero || "—"}</div>
            </div>
            <div className="text-right text-sm text-[#63636B]">
              <div>
                Date : <strong className="text-[#111114]">{fmtDate(doc.date)}</strong>
              </div>
              {doc.dateLimite ? (
                <div>
                  {isDevis ? "Valable jusqu'au " : "Échéance : "}
                  <strong className="text-[#111114]">{fmtDate(doc.dateLimite)}</strong>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 sm:px-8">
            <div className="rounded-xl border border-[#ECECF0] p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: brand.primary }}>
                {isDevis ? "Devis établi pour" : "Facturé à"}
              </div>
              <div className="mt-1.5 font-bold text-[#111114]">{client?.nom || "—"}</div>
              <div className="mt-0.5 text-sm leading-relaxed text-[#63636B]">
                {client?.adresse ? <div>{client.adresse}</div> : null}
                {client?.code_postal || client?.ville ? (
                  <div>{[client.code_postal, client.ville].filter(Boolean).join(" ")}</div>
                ) : null}
              </div>
            </div>
            <div className="rounded-xl border border-[#ECECF0] p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: brand.primary }}>
                Objet des travaux
              </div>
              <div className="mt-1.5 font-bold text-[#111114]">{doc.objet || "Prestation"}</div>
            </div>
          </div>

          {/* Les prestations. En mobile, un tableau à 5 colonnes est illisible :
              chaque ligne devient une carte empilée. */}
          <div className="px-6 sm:px-8">
            <div
              className="hidden rounded-lg px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest sm:flex"
              style={{ background: primary, color: onPrimary }}
            >
              <span className="flex-1">Désignation</span>
              <span className="w-20 text-right">Qté</span>
              <span className="w-24 text-right">P.U. HT</span>
              <span className="w-16 text-right">TVA</span>
              <span className="w-28 text-right">Total HT</span>
            </div>

            {lines.length === 0 ? (
              <div className="flex justify-between border-b border-[#ECECF0] py-3 text-sm">
                <span className="text-[#111114]">{doc.objet || "Prestation"}</span>
                <span className="font-bold text-[#111114]">{money(totals.ht)}</span>
              </div>
            ) : (
              lines.map((l, i) => (
                <div
                  key={i}
                  className="border-b border-[#ECECF0] py-3 text-sm sm:flex sm:items-baseline sm:px-4"
                >
                  <span className="block flex-1 font-medium text-[#111114] sm:font-normal">
                    {l.designation || "—"}
                  </span>
                  <span className="mt-1 block text-[#63636B] sm:mt-0 sm:w-20 sm:text-right">
                    <span className="sm:hidden">
                      {qty(l.quantite)} {l.unite ?? "u"} × {money(l.prix_unitaire_ht)} · TVA {qty(l.taux_tva)} %
                    </span>
                    <span className="hidden sm:inline">
                      {qty(l.quantite)} {l.unite ?? ""}
                    </span>
                  </span>
                  <span className="hidden text-[#63636B] sm:block sm:w-24 sm:text-right">
                    {money(l.prix_unitaire_ht)}
                  </span>
                  <span className="hidden text-[#63636B] sm:block sm:w-16 sm:text-right">{qty(l.taux_tva)} %</span>
                  <span className="mt-1 block font-bold text-[#111114] sm:mt-0 sm:w-28 sm:text-right">
                    {money(l.total_ht)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Totaux */}
          <div className="flex justify-end px-6 py-6 sm:px-8">
            <div className="w-full sm:w-80">
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-[#63636B]">Total HT</span>
                <span className="font-bold text-[#111114]">{money(totals.ht)}</span>
              </div>
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-[#63636B]">TVA</span>
                <span className="font-bold text-[#111114]">{money(totals.tva)}</span>
              </div>
              <div
                className="mt-2 flex items-center justify-between rounded-lg border-l-4 px-4 py-3"
                style={{ borderLeftColor: primary, background: `${primary}0D` }}
              >
                <span className="font-bold text-[#111114]">Total TTC</span>
                <span className="text-xl font-extrabold" style={{ color: primary }}>
                  {money(totals.ttc)}
                </span>
              </div>
              {!isDevis && (doc.montantPaye ?? 0) > 0 ? (
                <div className="flex justify-between py-2 text-sm">
                  <span className="font-bold text-[#111114]">Reste à payer</span>
                  <span className="font-bold" style={{ color: primary }}>
                    {money(totals.ttc - (doc.montantPaye ?? 0))}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Les conditions portées par la FICHE. Aucune mention légale n'est
              fabriquée ici : elle différerait entre la France et la Belgique. */}
          {doc.conditions ? (
            <div className="mx-6 mb-6 rounded-xl bg-[#F6F6F8] p-4 sm:mx-8">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#63636B]">Conditions</div>
              <p className="mt-1.5 whitespace-pre-line text-sm text-[#2A2A31]">{doc.conditions}</p>
            </div>
          ) : null}
        </article>

        {/* Télécharger */}
        <div className="mt-4 flex justify-center">
          <a
            href={`/document/${token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-[#ECECF0] bg-white px-5 py-3 text-sm font-bold text-[#111114] transition hover:border-[#D6D6DE]"
          >
            Télécharger le PDF
          </a>
        </div>

        {/* Signer */}
        {isDevis ? (
          <div className="mt-6">
            <AcceptCard
              token={token}
              primary={primary}
              onPrimary={onPrimary}
              clientName={client?.nom ?? ""}
              acceptedAt={link.acceptedAt}
              acceptedByName={link.acceptedByName}
              signatureData={link.signatureData}
            />
          </div>
        ) : null}

        {legalBits.length ? (
          <footer className="mt-6 text-center text-[11px] leading-relaxed text-[#9A9AA6]">
            {legalBits.join(" · ")}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
