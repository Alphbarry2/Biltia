// ─────────────────────────────────────────────────────────────────────────────
// EMAILS de réservation de démo (transactionnels, envoyés via lib/mailer.ts).
// Chaque fonction renvoie { subject, text, html } prêt pour sendEmail().
// text OBLIGATOIRE (lisible partout), html soigné par-dessus.
// ─────────────────────────────────────────────────────────────────────────────

import {
  formatSlotFr,
  labelOf,
  HEADCOUNT_OPTIONS,
  LOOKING_FOR_OPTIONS,
} from "./demo-booking";

export type DemoBooking = {
  id: string;
  slot_date: string;
  slot_time: string;
  status: string;
  company_name: string;
  website?: string | null;
  headcount?: string | null;
  looking_for?: string | null;
  message?: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone?: string | null;
  client_token: string;
  admin_token: string;
};

export type BuiltEmail = { subject: string; text: string; html: string };

const BRAND = "#0A0A0A";
const ACCENT = "#7C3AED";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Coquille HTML commune, email-safe (styles inline, largeur bornée). */
function shell(opts: { heading: string; intro: string; bodyHtml: string; cta?: { label: string; url: string } }): string {
  const cta = opts.cta
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${esc(opts.cta.url)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">${esc(opts.cta.label)}</a>
       </td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F4F2F8;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A22;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 40px rgba(60,40,120,0.12);">
    <tr><td style="height:5px;background:linear-gradient(90deg,#6366F1,#A855F7,#EC4899);"></td></tr>
    <tr><td style="padding:26px 30px 6px;">
      <div style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:${BRAND};">Biltia</div>
    </td></tr>
    <tr><td style="padding:8px 30px 4px;">
      <h1 style="margin:0 0 8px;font-size:21px;font-weight:800;letter-spacing:-0.02em;color:${BRAND};">${esc(opts.heading)}</h1>
      <p style="margin:0 0 16px;font-size:14.5px;line-height:1.6;color:#4A4A56;">${opts.intro}</p>
    </td></tr>
    <tr><td style="padding:0 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.bodyHtml}${cta}</table>
    </td></tr>
    <tr><td style="padding:24px 30px 28px;">
      <p style="margin:0;font-size:12px;line-height:1.5;color:#9A9AA6;">Biltia — l'OS conversationnel du BTP. Cet email vous a été envoyé suite à une demande de démonstration.</p>
    </td></tr>
  </table></body></html>`;
}

/** Ligne "libellé : valeur" pour le récap. */
function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 0;border-bottom:1px solid #F0EEF6;font-size:13px;color:#8B8B96;width:42%;vertical-align:top;">${esc(label)}</td>
    <td style="padding:7px 0;border-bottom:1px solid #F0EEF6;font-size:13.5px;color:#1A1A22;font-weight:600;">${esc(value)}</td>
  </tr>`;
}

function slotBanner(b: DemoBooking): string {
  return `<tr><td style="padding:2px 0 14px;">
    <div style="background:#F5F2FD;border:1px solid #E7E0F8;border-radius:14px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${ACCENT};margin-bottom:4px;">Créneau</div>
      <div style="font-size:15px;font-weight:700;color:${BRAND};">${esc(formatSlotFr(b.slot_date, b.slot_time))}</div>
    </div>
  </td></tr>`;
}

// ── 1. Visiteur : demande bien reçue ──────────────────────────────────────────
export function visitorReceived(b: DemoBooking, manageUrl: string): BuiltEmail {
  const subject = "Votre demande de démo Biltia est bien reçue";
  const text = [
    `Bonjour ${b.contact_name},`,
    ``,
    `Nous avons bien reçu votre demande de démonstration.`,
    `Créneau souhaité : ${formatSlotFr(b.slot_date, b.slot_time)}.`,
    ``,
    `Nous vous confirmons ce créneau très vite par email. Vous pouvez le modifier`,
    `ou l'annuler ici (jusqu'à 24 h avant) : ${manageUrl}`,
    ``,
    `À très vite,`,
    `L'équipe Biltia`,
  ].join("\n");
  const html = shell({
    heading: "Demande bien reçue 🗓️",
    intro: `Bonjour ${esc(b.contact_name)}, merci&nbsp;! Nous avons bien reçu votre demande de démonstration et nous vous confirmons le créneau très vite.`,
    bodyHtml: slotBanner(b) + `<tr><td style="padding:0 0 6px;font-size:13px;color:#8B8B96;line-height:1.55;">Besoin de changer&nbsp;? Vous pouvez modifier ou annuler ce créneau jusqu'à 24&nbsp;h avant le rendez-vous.</td></tr>`,
    cta: { label: "Gérer ma réservation", url: manageUrl },
  });
  return { subject, text, html };
}

// ── 2. Propriétaire : nouvelle demande ────────────────────────────────────────
export function ownerNewRequest(b: DemoBooking, adminUrl: string): BuiltEmail {
  const subject = `Nouvelle demande de démo — ${b.company_name}`;
  const infoText = [
    `Créneau : ${formatSlotFr(b.slot_date, b.slot_time)}`,
    `Entreprise : ${b.company_name}`,
    b.website ? `Site : ${b.website}` : null,
    `Effectif : ${labelOf(HEADCOUNT_OPTIONS, b.headcount)}`,
    `Recherche : ${labelOf(LOOKING_FOR_OPTIONS, b.looking_for)}`,
    `Contact : ${b.contact_name} — ${b.contact_email}${b.contact_phone ? ` — ${b.contact_phone}` : ""}`,
    b.message ? `Message : ${b.message}` : null,
  ].filter(Boolean).join("\n");
  const text = [
    `Nouvelle demande de démonstration.`,
    ``,
    infoText,
    ``,
    `Confirmer ou proposer un autre créneau : ${adminUrl}`,
  ].join("\n");
  const bodyHtml =
    slotBanner(b) +
    row("Entreprise", b.company_name) +
    (b.website ? row("Site web", b.website) : "") +
    row("Effectif", labelOf(HEADCOUNT_OPTIONS, b.headcount)) +
    row("Recherche", labelOf(LOOKING_FOR_OPTIONS, b.looking_for)) +
    row("Contact", b.contact_name) +
    row("Email", b.contact_email) +
    (b.contact_phone ? row("Téléphone", b.contact_phone) : "") +
    (b.message ? row("Message", b.message) : "");
  const html = shell({
    heading: "Nouvelle demande de démo",
    intro: `Une demande vient d'arriver. Vous pouvez la <b>confirmer</b> ou <b>proposer un autre créneau</b> depuis le lien ci-dessous.`,
    bodyHtml,
    cta: { label: "Confirmer ou modifier", url: adminUrl },
  });
  return { subject, text, html };
}

// ── 3. Visiteur : créneau confirmé ────────────────────────────────────────────
export function visitorConfirmed(b: DemoBooking, manageUrl: string): BuiltEmail {
  const subject = "Votre démo Biltia est confirmée ✅";
  const text = [
    `Bonjour ${b.contact_name},`,
    ``,
    `Bonne nouvelle : votre démonstration est confirmée.`,
    `Créneau : ${formatSlotFr(b.slot_date, b.slot_time)}.`,
    ``,
    `Vous pouvez encore la modifier jusqu'à 24 h avant : ${manageUrl}`,
    ``,
    `À très vite,`,
    `L'équipe Biltia`,
  ].join("\n");
  const html = shell({
    heading: "Votre démo est confirmée ✅",
    intro: `Bonjour ${esc(b.contact_name)}, votre démonstration est confirmée. Nous avons hâte de vous montrer Biltia&nbsp;!`,
    bodyHtml: slotBanner(b) + `<tr><td style="padding:0 0 6px;font-size:13px;color:#8B8B96;line-height:1.55;">Un imprévu&nbsp;? Vous pouvez modifier ce créneau jusqu'à 24&nbsp;h avant.</td></tr>`,
    cta: { label: "Gérer ma réservation", url: manageUrl },
  });
  return { subject, text, html };
}

// ── 4. Visiteur : nouveau créneau proposé par le propriétaire ─────────────────
export function visitorRescheduledByOwner(b: DemoBooking, manageUrl: string): BuiltEmail {
  const subject = "Nouveau créneau pour votre démo Biltia";
  const text = [
    `Bonjour ${b.contact_name},`,
    ``,
    `Nous avons dû ajuster l'horaire de votre démonstration.`,
    `Nouveau créneau : ${formatSlotFr(b.slot_date, b.slot_time)}.`,
    ``,
    `S'il ne vous convient pas, vous pouvez en choisir un autre ici : ${manageUrl}`,
    ``,
    `À très vite,`,
    `L'équipe Biltia`,
  ].join("\n");
  const html = shell({
    heading: "Nouveau créneau proposé",
    intro: `Bonjour ${esc(b.contact_name)}, nous avons ajusté l'horaire de votre démonstration. Voici le nouveau créneau&nbsp;:`,
    bodyHtml: slotBanner(b) + `<tr><td style="padding:0 0 6px;font-size:13px;color:#8B8B96;line-height:1.55;">Il ne vous convient pas&nbsp;? Choisissez-en un autre en un clic.</td></tr>`,
    cta: { label: "Voir ou changer le créneau", url: manageUrl },
  });
  return { subject, text, html };
}

// ── 5. Propriétaire : le visiteur a modifié son créneau ───────────────────────
export function ownerNotifyClientReschedule(b: DemoBooking, adminUrl: string): BuiltEmail {
  const subject = `Créneau modifié par le client — ${b.company_name}`;
  const text = [
    `${b.contact_name} (${b.company_name}) a modifié son créneau de démo.`,
    ``,
    `Nouveau créneau : ${formatSlotFr(b.slot_date, b.slot_time)}.`,
    `Contact : ${b.contact_email}${b.contact_phone ? ` — ${b.contact_phone}` : ""}`,
    ``,
    `Confirmer ou proposer un autre créneau : ${adminUrl}`,
  ].join("\n");
  const html = shell({
    heading: "Créneau modifié par le client",
    intro: `<b>${esc(b.contact_name)}</b> (${esc(b.company_name)}) a choisi un nouveau créneau pour sa démonstration.`,
    bodyHtml: slotBanner(b) + row("Contact", b.contact_email),
    cta: { label: "Confirmer ou modifier", url: adminUrl },
  });
  return { subject, text, html };
}
