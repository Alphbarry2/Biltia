// ─────────────────────────────────────────────────────────────────────────────
// ENVELOPPE EMAIL DE MARQUE — le mail qui ACCOMPAGNE un document commercial.
//
// Le mail n'EST plus le devis : il l'annonce. Le devis, lui, est en pièce jointe
// (PDF) et derrière un bouton « Voir et accepter ». D'où un corps court : qui,
// quoi, combien, jusqu'à quand — et deux façons d'agir.
//
// Contraintes des clients mail (Gmail, Outlook, Apple Mail) :
//   • CSS INLINE uniquement — les <style> en <head> sont charcutés par Gmail.
//   • Mise en page en <table> — Outlook (moteur Word) ignore flexbox et grid.
//   • Images en URL PUBLIQUE — les `data:` sont bloquées. D'où le bucket `brand`.
//   • Un mail peut s'afficher SANS images (blocage par défaut) → le nom de
//     l'entreprise reste écrit en toutes lettres, jamais seulement dans le logo.
//
// Aucune marque Biltia ici : c'est le mail de l'artisan à SON client.
// ─────────────────────────────────────────────────────────────────────────────

import { type BrandKit, readableOn, tintOf, companyIdLabel } from "@/lib/brand";

export type EmailFact = { label: string; value: string; strong?: boolean };

export type BrandedEmail = {
  subject: string;
  html: string;
  /** Repli texte brut — indispensable : certains clients mail n'affichent que lui,
   *  et un mail sans partie texte part plus volontiers en spam. */
  text: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Ligne de mentions légales, uniquement avec les champs RENSEIGNÉS. */
function legalLine(brand: BrandKit): string {
  const bits: string[] = [];
  if (brand.address) bits.push(brand.address);
  // Le libellé suit le PAYS : un artisan belge a un n° BCE, pas un SIRET.
  if (brand.siret) bits.push(`${companyIdLabel(brand.country)} ${brand.siret}`);
  if (brand.vat) bits.push(`TVA ${brand.vat}`);
  return bits.join(" · ");
}

/** Bloc de signature : coordonnées réelles de l'entreprise, pas un « Cordialement » nu. */
function signature(brand: BrandKit): string[] {
  const out: string[] = [];
  if (brand.entreprise) out.push(brand.entreprise);
  const contact = [brand.phone, brand.email].filter(Boolean).join(" · ");
  if (contact) out.push(contact);
  return out;
}

export function renderBrandedEmail(args: {
  brand: BrandKit;
  subject: string;
  /** « Bonjour Alpha Barry, ». Absent quand le corps porte DÉJÀ sa salutation —
   *  cas des agents, dont l'IA rédige un message complet (salutation + signature).
   *  L'enveloppe ne doit pas en ajouter une seconde. */
  greeting?: string;
  /** Faux quand le corps se termine DÉJÀ par « Bien cordialement, <entreprise> ». */
  signOff?: boolean;
  /** Corps : 1 à 3 phrases. Pas le devis — son annonce. */
  paragraphs: string[];
  /** Le tableau de faits (n°, objet, total, validité). */
  facts?: EmailFact[];
  cta?: { label: string; url: string };
  /** « Le devis complet est en pièce jointe. » */
  attachmentNote?: string;
  /** Ajouté en toutes lettres sous le bouton (le client peut copier l'URL). */
  ctaFallbackNote?: string;
}): BrandedEmail {
  const { brand } = args;
  const primary = brand.primary;
  const onPrimary = readableOn(primary);
  const tint = tintOf(primary, 0.06);
  const legal = legalLine(brand);
  const sign = signature(brand);
  const signOff = args.signOff !== false;

  const logoBlock = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.entreprise)}" width="132" style="display:block;max-width:132px;max-height:46px;width:auto;height:auto;border:0;outline:none;text-decoration:none;">`
    : `<div style="font:700 17px/1.3 Helvetica,Arial,sans-serif;color:#111114;">${esc(brand.entreprise || "")}</div>`;

  const factsRows = (args.facts ?? [])
    .map(
      (f) => `
              <tr>
                <td style="padding:7px 0;font:400 13px/1.5 Helvetica,Arial,sans-serif;color:#63636B;">${esc(f.label)}</td>
                <td align="right" style="padding:7px 0;font:${f.strong ? "700 16px" : "600 13px"}/1.5 Helvetica,Arial,sans-serif;color:${f.strong ? esc(primary) : "#111114"};white-space:nowrap;">${esc(f.value)}</td>
              </tr>`
    )
    .join("");

  const ctaBlock = args.cta
    ? `
          <tr>
            <td style="padding:22px 32px 4px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" bgcolor="${esc(primary)}" style="border-radius:8px;">
                    <a href="${esc(args.cta.url)}" style="display:block;padding:14px 26px;font:700 15px/1.2 Helvetica,Arial,sans-serif;color:${onPrimary};text-decoration:none;border-radius:8px;">${esc(args.cta.label)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${
            args.ctaFallbackNote
              ? `<tr><td style="padding:10px 32px 0 32px;font:400 11px/1.5 Helvetica,Arial,sans-serif;color:#9A9AA6;text-align:center;">${esc(args.ctaFallbackNote)}</td></tr>`
              : ""
          }`
    : "";

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(args.subject)}</title></head>
<body style="margin:0;padding:0;background:#F2F2F5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(args.paragraphs[0] ?? args.subject)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F2F2F5;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">

          <tr><td style="height:5px;background:${esc(primary)};font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr>
            <td style="padding:24px 32px 0 32px;">${logoBlock}</td>
          </tr>

          <tr>
            <td style="padding:20px 32px 0 32px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#2A2A31;">
              ${args.greeting ? `<p style="margin:0 0 14px 0;">${esc(args.greeting)}</p>` : ""}
              ${args.paragraphs.map((p) => `<p style="margin:0 0 12px 0;">${esc(p)}</p>`).join("\n              ")}
            </td>
          </tr>

          ${
            factsRows
              ? `<tr>
            <td style="padding:14px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${esc(tint)};border-radius:8px;">
                <tr><td style="padding:6px 16px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${factsRows}
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>`
              : ""
          }

          ${ctaBlock}

          ${
            args.attachmentNote
              ? `<tr>
            <td style="padding:20px 32px 0 32px;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:#63636B;">${esc(args.attachmentNote)}</td>
          </tr>`
              : ""
          }

          ${
            signOff
              ? `<tr>
            <td style="padding:22px 32px 26px 32px;font:400 14px/1.6 Helvetica,Arial,sans-serif;color:#2A2A31;">
              <p style="margin:0 0 10px 0;">Bien cordialement,</p>
              ${sign
                .map(
                  (l, i) =>
                    `<div style="font:${i === 0 ? "700" : "400"} ${i === 0 ? "14px" : "13px"}/1.5 Helvetica,Arial,sans-serif;color:${i === 0 ? "#111114" : "#63636B"};">${esc(l)}</div>`
                )
                .join("\n              ")}
            </td>
          </tr>`
              : `<tr><td style="padding:0 32px 26px 32px;"></td></tr>`
          }

          ${
            legal
              ? `<tr>
            <td style="padding:14px 32px 20px 32px;border-top:1px solid #ECECF0;font:400 11px/1.6 Helvetica,Arial,sans-serif;color:#9A9AA6;">${esc(legal)}</td>
          </tr>`
              : ""
          }

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // ── Repli texte brut ────────────────────────────────────────────────────────
  const textParts: string[] = [];
  if (args.greeting) textParts.push(args.greeting, "");
  textParts.push(...args.paragraphs);
  if (args.facts?.length) {
    textParts.push("");
    for (const f of args.facts) textParts.push(`${f.label} : ${f.value}`);
  }
  if (args.cta) {
    textParts.push("", `${args.cta.label} : ${args.cta.url}`);
  }
  if (args.attachmentNote) textParts.push("", args.attachmentNote);
  if (signOff) textParts.push("", "Bien cordialement,", ...sign);
  if (legal) textParts.push("", legal);

  return { subject: args.subject, html, text: textParts.join("\n") };
}
