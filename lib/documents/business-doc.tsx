// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT COMMERCIAL PDF — devis & facture, aux couleurs de l'ARTISAN.
//
// Rendu SERVEUR (@react-pdf/renderer) et non plus dans le navigateur : c'est la
// condition pour qu'un AGENT puisse relancer un devis à 3 h du matin avec le PDF
// en pièce jointe. L'ancien chemin (html2pdf.js) exigeait un onglet ouvert.
//
// Texte vectoriel (pas une capture d'écran) : le client peut sélectionner, copier,
// chercher dans le devis, et l'impression reste nette.
//
// Règle tenue : ce document ne porte AUCUNE marque Biltia. Le logo de l'artisan,
// ses couleurs, ses mentions légales — rien d'autre. Un devis est sa vitrine.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { type BrandKit, readableOn, tintOf, fetchLogoBuffer } from "@/lib/brand";
import { money, qty, fmtDate } from "@/lib/documents/format";

export type DocLine = {
  designation: string;
  quantite: number;
  unite: string | null;
  prix_unitaire_ht: number;
  taux_tva: number;
  total_ht: number;
};

export type DocParty = {
  nom: string;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  email?: string | null;
  tel?: string | null;
  siret?: string | null;
};

export type BusinessDoc = {
  kind: "devis" | "facture";
  /** facture uniquement : facture | acompte | situation | avoir */
  type?: string | null;
  numero: string;
  date: string | null;
  /** devis → date de validité ; facture → date d'échéance */
  dateLimite: string | null;
  /** Le chantier / l'objet des travaux. */
  objet: string | null;
  conditions: string | null;
  montantHt: number;
  montantTva: number;
  montantTtc: number;
  /** facture uniquement */
  montantPaye?: number;
};

/** Totaux du document. Les LIGNES font foi dès qu'il y en a : un document qui
 *  affiche « TVA 10 % + TVA 20 % » d'un côté et un TTC incohérent de l'autre est
 *  un document qu'on ne peut pas défendre devant un client. Les montants stockés
 *  ne servent que de repli (devis sans détail chiffré).
 *  Exporté : le PDF ET l'email doivent annoncer le même chiffre. */
export function computeTotals(
  lines: DocLine[],
  doc: Pick<BusinessDoc, "montantHt" | "montantTva" | "montantTtc">
): { ht: number; tva: number; ttc: number } {
  if (!lines.length) {
    return { ht: doc.montantHt ?? 0, tva: doc.montantTva ?? 0, ttc: doc.montantTtc ?? 0 };
  }
  let ht = 0;
  let tva = 0;
  for (const l of lines) {
    const base = Number.isFinite(l.total_ht) ? l.total_ht : 0;
    const taux = Number.isFinite(l.taux_tva) ? l.taux_tva : 20;
    ht += base;
    tva += (base * taux) / 100;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { ht: r(ht), tva: r(tva), ttc: r(ht + tva) };
}

/** Ventilation de la TVA par taux — obligatoire dès qu'un document mélange 10 % et
 *  20 % (rénovation + neuf), ce qui est le cas courant en BTP. */
function vatBreakdown(lines: DocLine[]): { taux: number; base: number; tva: number }[] {
  const byRate = new Map<number, { base: number; tva: number }>();
  for (const l of lines) {
    const taux = Number.isFinite(l.taux_tva) ? l.taux_tva : 20;
    const base = Number.isFinite(l.total_ht) ? l.total_ht : 0;
    const cur = byRate.get(taux) ?? { base: 0, tva: 0 };
    cur.base += base;
    cur.tva += (base * taux) / 100;
    byRate.set(taux, cur);
  }
  return [...byRate.entries()]
    .map(([taux, v]) => ({ taux, base: v.base, tva: v.tva }))
    .sort((a, b) => a.taux - b.taux);
}

function partyLines(p: DocParty): string[] {
  const out: string[] = [];
  if (p.adresse) out.push(p.adresse);
  const cityLine = [p.code_postal, p.ville].filter(Boolean).join(" ");
  if (cityLine) out.push(cityLine);
  if (p.email) out.push(p.email);
  if (p.tel) out.push(p.tel);
  return out;
}

// ── Feuille de style ─────────────────────────────────────────────────────────
function sheet(brand: BrandKit) {
  const onPrimary = readableOn(brand.primary);
  const tint = tintOf(brand.primary, 0.07);

  return StyleSheet.create({
    page: {
      paddingTop: 34,
      paddingBottom: 62, // place pour le pied de page légal (fixe)
      paddingHorizontal: 40,
      fontSize: 9,
      fontFamily: "Helvetica",
      color: "#2A2A31",
      lineHeight: 1.45,
    },
    topBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 6,
      backgroundColor: brand.primary,
    },

    // En-tête : logo à gauche, coordonnées de l'émetteur à droite
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
    logo: { maxWidth: 150, maxHeight: 50, objectFit: "contain" },
    emitterName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#111114", maxWidth: 220 },
    emitterMeta: { textAlign: "right", fontSize: 8, color: "#63636B", maxWidth: 210 },

    // Titre du document. lineHeight explicite : sans lui, l'interligne 1.45 de la
    // page fait DESCENDRE le pavé du titre et le numéro vient chevaucher « DEVIS ».
    titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 },
    docKind: { fontSize: 20, fontFamily: "Helvetica-Bold", color: brand.primary, letterSpacing: 0.5, lineHeight: 1.15 },
    docNumero: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#111114", lineHeight: 1.2 },
    docDates: { textAlign: "right", fontSize: 8.5, color: "#63636B" },
    docDateStrong: { fontFamily: "Helvetica-Bold", color: "#111114" },

    // Client + objet
    blocks: { flexDirection: "row", gap: 14, marginBottom: 14 },
    block: { flex: 1, borderWidth: 1, borderColor: "#ECECF0", borderRadius: 4, padding: 9 },
    blockLabel: {
      fontSize: 7,
      fontFamily: "Helvetica-Bold",
      color: brand.accent,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 5,
    },
    blockName: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#111114", marginBottom: 2 },
    blockLine: { fontSize: 8.5, color: "#63636B" },

    // Tableau des prestations
    tHead: {
      flexDirection: "row",
      backgroundColor: brand.primary,
      color: onPrimary,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 3,
    },
    tHeadCell: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.4, textTransform: "uppercase" },
    tRow: {
      flexDirection: "row",
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: "#ECECF0",
    },
    cDes: { flex: 1, paddingRight: 8 },
    cQte: { width: 52, textAlign: "right" },
    cPu: { width: 66, textAlign: "right" },
    cTva: { width: 38, textAlign: "right" },
    cTot: { width: 72, textAlign: "right" },
    desText: { fontSize: 9, color: "#111114" },
    numText: { fontSize: 9, color: "#2A2A31" },
    totText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111114" },

    // Totaux
    totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
    totals: { width: 232 },
    totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    totLabel: { fontSize: 9, color: "#63636B" },
    totValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111114" },
    grand: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 6,
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: tint,
      borderLeftWidth: 3,
      borderLeftColor: brand.primary,
      borderRadius: 3,
    },
    grandLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111114" },
    grandValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: brand.primary },
    reste: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, marginTop: 2 },

    // Encarts bas de page
    note: { marginTop: 12, padding: 9, backgroundColor: "#F6F6F8", borderRadius: 4 },
    noteLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#63636B", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 },
    noteText: { fontSize: 8.5, color: "#2A2A31" },

    // « Bon pour accord » (devis)
    signRow: { flexDirection: "row", gap: 14, marginTop: 12 },
    signBox: { flex: 1, borderWidth: 1, borderColor: "#D6D6DE", borderStyle: "dashed", borderRadius: 4, padding: 9, minHeight: 72 },
    signTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111114", marginBottom: 3 },
    signHint: { fontSize: 7.5, color: "#9A9AA6" },

    // Pied de page légal (répété sur chaque page)
    footer: {
      position: "absolute",
      bottom: 22,
      left: 40,
      right: 40,
      borderTopWidth: 1,
      borderTopColor: "#ECECF0",
      paddingTop: 6,
    },
    footerText: { fontSize: 6.8, color: "#9A9AA6", textAlign: "center", lineHeight: 1.5 },
    pageNum: { position: "absolute", bottom: 8, left: 40, right: 40, fontSize: 6.8, color: "#C4C4CC", textAlign: "center" },
  });
}

// ── Le document ──────────────────────────────────────────────────────────────
type Props = {
  doc: BusinessDoc;
  lines: DocLine[];
  client: DocParty | null;
  brand: BrandKit;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
};

function titleFor(doc: BusinessDoc): string {
  if (doc.kind === "devis") return "DEVIS";
  switch (doc.type) {
    case "acompte":
      return "FACTURE D'ACOMPTE";
    case "situation":
      return "SITUATION";
    case "avoir":
      return "AVOIR";
    default:
      return "FACTURE";
  }
}

/** Le pied de page légal, assemblé à partir des SEULS champs renseignés.
 *  Un champ vide n'imprime pas « SIRET : — » : il disparaît. */
function legalFooter(brand: BrandKit): string {
  const idLabel = brand.country === "BE" ? "BCE" : "SIRET";
  const bits: string[] = [];
  if (brand.entreprise) bits.push(brand.entreprise);
  if (brand.address) bits.push(brand.address);
  if (brand.siret) bits.push(`${idLabel} ${brand.siret}`);
  if (brand.rcs) bits.push(`RCS ${brand.rcs}`);
  if (brand.ape) bits.push(`APE ${brand.ape}`);
  if (brand.capital) bits.push(`Capital ${brand.capital}`);
  if (brand.vat) bits.push(`TVA ${brand.vat}`);
  return bits.join(" · ");
}

function BusinessDocPdf({ doc, lines, client, brand, logo }: Props) {
  const s = sheet(brand);
  const vat = vatBreakdown(lines);
  const isDevis = doc.kind === "devis";
  const t = computeTotals(lines, doc);
  const reste = t.ttc - (doc.montantPaye ?? 0);
  const legal = legalFooter(brand);

  const emitterMeta = [
    brand.address,
    [brand.phone, brand.email].filter(Boolean).join(" · "),
    brand.website,
  ].filter(Boolean);

  return (
    <Document
      title={`${titleFor(doc)} ${doc.numero}`}
      author={brand.entreprise || undefined}
      subject={doc.objet || undefined}
      creator={brand.entreprise || undefined}
      producer={brand.entreprise || undefined}
    >
      <Page size="A4" style={s.page}>
        <View style={s.topBar} fixed />

        {/* En-tête émetteur */}
        <View style={s.header}>
          <View>
            {logo ? (
              <Image style={s.logo} src={{ data: logo.data, format: logo.format }} />
            ) : (
              <Text style={s.emitterName}>{brand.entreprise || "—"}</Text>
            )}
          </View>
          <View style={s.emitterMeta}>
            {logo && brand.entreprise ? (
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.5, color: "#111114", marginBottom: 2 }}>
                {brand.entreprise}
              </Text>
            ) : null}
            {emitterMeta.map((l, i) => (
              <Text key={i}>{l}</Text>
            ))}
          </View>
        </View>

        {/* Titre + dates */}
        <View style={s.titleRow}>
          <View>
            <Text style={s.docKind}>{titleFor(doc)}</Text>
            <Text style={s.docNumero}>{doc.numero || "—"}</Text>
          </View>
          <View style={s.docDates}>
            <Text>
              Date : <Text style={s.docDateStrong}>{fmtDate(doc.date)}</Text>
            </Text>
            <Text>
              {isDevis ? "Valable jusqu'au " : "Échéance : "}
              <Text style={s.docDateStrong}>{fmtDate(doc.dateLimite)}</Text>
            </Text>
          </View>
        </View>

        {/* Client + objet des travaux */}
        <View style={s.blocks}>
          <View style={s.block}>
            <Text style={s.blockLabel}>{isDevis ? "Devis établi pour" : "Facturé à"}</Text>
            <Text style={s.blockName}>{client?.nom || "—"}</Text>
            {client
              ? partyLines(client).map((l, i) => (
                  <Text key={i} style={s.blockLine}>
                    {l}
                  </Text>
                ))
              : null}
          </View>
          <View style={s.block}>
            <Text style={s.blockLabel}>Objet des travaux</Text>
            <Text style={s.blockName}>{doc.objet || "Prestation"}</Text>
          </View>
        </View>

        {/* Tableau des prestations */}
        <View style={s.tHead} fixed>
          <Text style={[s.tHeadCell, s.cDes]}>Désignation</Text>
          <Text style={[s.tHeadCell, s.cQte]}>Qté</Text>
          <Text style={[s.tHeadCell, s.cPu]}>P.U. HT</Text>
          <Text style={[s.tHeadCell, s.cTva]}>TVA</Text>
          <Text style={[s.tHeadCell, s.cTot]}>Total HT</Text>
        </View>

        {lines.length === 0 ? (
          <View style={s.tRow}>
            <Text style={[s.desText, s.cDes]}>{doc.objet || "Prestation"}</Text>
            <Text style={[s.numText, s.cQte]}>1</Text>
            <Text style={[s.numText, s.cPu]}>{money(t.ht)}</Text>
            <Text style={[s.numText, s.cTva]}>—</Text>
            <Text style={[s.totText, s.cTot]}>{money(t.ht)}</Text>
          </View>
        ) : (
          lines.map((l, i) => (
            <View key={i} style={s.tRow} wrap={false}>
              <View style={s.cDes}>
                <Text style={s.desText}>{l.designation || "—"}</Text>
              </View>
              <Text style={[s.numText, s.cQte]}>
                {qty(l.quantite)}
                {l.unite ? ` ${l.unite}` : ""}
              </Text>
              <Text style={[s.numText, s.cPu]}>{money(l.prix_unitaire_ht)}</Text>
              <Text style={[s.numText, s.cTva]}>{qty(l.taux_tva)} %</Text>
              <Text style={[s.totText, s.cTot]}>{money(l.total_ht)}</Text>
            </View>
          ))
        )}

        {/* Totaux */}
        <View style={s.totalsWrap} wrap={false}>
          <View style={s.totals}>
            <View style={s.totRow}>
              <Text style={s.totLabel}>Total HT</Text>
              <Text style={s.totValue}>{money(t.ht)}</Text>
            </View>
            {vat.length > 1 ? (
              vat.map((v) => (
                <View key={v.taux} style={s.totRow}>
                  <Text style={s.totLabel}>
                    TVA {qty(v.taux)} % (sur {money(v.base)})
                  </Text>
                  <Text style={s.totValue}>{money(v.tva)}</Text>
                </View>
              ))
            ) : (
              <View style={s.totRow}>
                <Text style={s.totLabel}>TVA{vat[0] ? ` ${qty(vat[0].taux)} %` : ""}</Text>
                <Text style={s.totValue}>{money(t.tva)}</Text>
              </View>
            )}
            <View style={s.grand}>
              <Text style={s.grandLabel}>Total TTC</Text>
              <Text style={s.grandValue}>{money(t.ttc)}</Text>
            </View>
            {!isDevis && (doc.montantPaye ?? 0) > 0 ? (
              <>
                <View style={s.reste}>
                  <Text style={s.totLabel}>Déjà réglé</Text>
                  <Text style={s.totValue}>{money(doc.montantPaye ?? 0)}</Text>
                </View>
                <View style={s.reste}>
                  <Text style={[s.totLabel, { fontFamily: "Helvetica-Bold", color: "#111114" }]}>Reste à payer</Text>
                  <Text style={[s.totValue, { color: brand.primary }]}>{money(reste)}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Conditions de règlement / coordonnées bancaires */}
        {doc.conditions || brand.conditionsPaiement ? (
          <View style={s.note} wrap={false}>
            <Text style={s.noteLabel}>Conditions</Text>
            <Text style={s.noteText}>{doc.conditions || brand.conditionsPaiement}</Text>
          </View>
        ) : null}

        {!isDevis && brand.iban ? (
          <View style={s.note} wrap={false}>
            <Text style={s.noteLabel}>Règlement par virement</Text>
            <Text style={s.noteText}>
              IBAN {brand.iban}
              {brand.bic ? ` · BIC ${brand.bic}` : ""}
            </Text>
            <Text style={[s.noteText, { color: "#9A9AA6", marginTop: 3, fontSize: 7.5 }]}>
              Pénalités de retard : 3 fois le taux d&apos;intérêt légal. Indemnité forfaitaire pour frais de
              recouvrement : 40 €.
            </Text>
          </View>
        ) : null}

        {/* « Bon pour accord » — devis seulement */}
        {isDevis ? (
          <View style={s.signRow} wrap={false}>
            <View style={s.signBox}>
              <Text style={s.signTitle}>Bon pour accord</Text>
              <Text style={s.signHint}>
                Date, mention « Bon pour accord » {"\n"}et signature du client
              </Text>
            </View>
            <View style={s.signBox}>
              <Text style={s.signTitle}>{brand.entreprise || "L'entreprise"}</Text>
              <Text style={s.signHint}>Signature et cachet</Text>
            </View>
          </View>
        ) : null}

        {/* Assurance décennale — obligation légale sur un devis BTP en France */}
        {brand.assurance ? (
          <View style={{ marginTop: 12 }} wrap={false}>
            <Text style={{ fontSize: 7.5, color: "#63636B" }}>Assurance décennale : {brand.assurance}</Text>
          </View>
        ) : null}

        {/* Pied de page légal, répété */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{legal}</Text>
          {brand.footer ? <Text style={s.footerText}>{brand.footer}</Text> : null}
        </View>
        <Text
          style={s.pageNum}
          fixed
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${pageNumber} / ${totalPages}` : "")}
        />
      </Page>
    </Document>
  );
}

/** Rend le PDF en mémoire. Le logo est téléchargé AVANT le rendu : un logo
 *  injoignable ne fait pas échouer l'envoi, il disparaît simplement du document. */
export async function renderBusinessDocPdf(args: {
  doc: BusinessDoc;
  lines: DocLine[];
  client: DocParty | null;
  brand: BrandKit;
}): Promise<Buffer> {
  const logo = await fetchLogoBuffer(args.brand.logoUrl);
  return renderToBuffer(
    <BusinessDocPdf doc={args.doc} lines={args.lines} client={args.client} brand={args.brand} logo={logo} />
  );
}

/** Nom de fichier propre pour la pièce jointe : « Devis_D-2026-001.pdf ». */
export function pdfFileName(doc: BusinessDoc): string {
  const base = doc.kind === "devis" ? "Devis" : "Facture";
  const num = (doc.numero || "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${base}${num ? `_${num}` : ""}.pdf`;
}
