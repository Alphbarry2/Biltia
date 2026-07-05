// ─────────────────────────────────────────────────────────────────────────────
// INTÉGRATIONS LÉGÈRES (pack MVP, zéro OAuth) — helpers purs, côté client.
//
// Couvre les canaux du quotidien de l'artisan sans créer d'app OAuth :
//   · WhatsApp  → lien wa.me (message pré-rempli). wa.me ne peut PAS joindre de
//                 fichier : le PDF passe par l'API Web Share (cf. pdf-share.ts).
//   · Email     → mailto: pré-rempli (le client mail de l'utilisateur fait foi).
//   · Agendas   → liens « Ajouter à Google Agenda / Outlook » + fichier .ics
//                 universel (Apple Calendar, Thunderbird, M365…).
//   · GPS       → position du téléphone, formatée en lien Google Maps.
//
// Aucune donnée ne transite par un serveur Biltia : tout se joue dans le
// navigateur de l'utilisateur. L'OAuth Google/Microsoft (envoi Gmail direct,
// sauvegarde Drive) est une v2 volontairement hors de ce module.
// ─────────────────────────────────────────────────────────────────────────────

// ── WhatsApp ─────────────────────────────────────────────────────────────────

/**
 * Lien click-to-chat WhatsApp. Sans numéro, WhatsApp ouvre son propre sélecteur
 * de contact (le cas courant : l'artisan choisit le client dans SES contacts).
 */
export function buildWhatsAppUrl(text: string, phone?: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** Message d'envoi d'un document au client (ton pro, prêt à ajuster). */
export function buildDocMessage(opts: {
  docTitle: string;
  clientName?: string | null;
  chantier?: string | null;
}): string {
  const hello = opts.clientName ? `Bonjour ${opts.clientName},` : "Bonjour,";
  const object = opts.chantier
    ? `${opts.docTitle} pour le chantier ${opts.chantier}`
    : opts.docTitle;
  return `${hello}\n\nVoici votre document : ${object}.\n\nN'hésitez pas à me contacter si vous avez des questions.`;
}

// ── Email (mailto:) ──────────────────────────────────────────────────────────

export function buildMailtoUrl(opts: {
  to?: string | null;
  subject: string;
  body: string;
}): string {
  const params = new URLSearchParams({ subject: opts.subject, body: opts.body });
  // URLSearchParams encode l'espace en « + » : les clients mail veulent %20.
  return `mailto:${opts.to ?? ""}?${params.toString().replace(/\+/g, "%20")}`;
}

// ── Agendas (Google / Outlook / .ics) ────────────────────────────────────────

export type CalendarEvent = {
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  /** Absente → 1 h par défaut (ou journée entière si allDay). */
  end?: Date | null;
  allDay?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Horodatage UTC compact : 20260704T093000Z (format Google + iCalendar). */
function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Date locale sans heure : 20260704 (événements journée entière). */
function dayStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function eventEnd(ev: CalendarEvent): Date {
  if (ev.end) return ev.end;
  const end = new Date(ev.start);
  if (ev.allDay) end.setDate(end.getDate() + 1);
  else end.setHours(end.getHours() + 1);
  return end;
}

export function buildGoogleCalendarUrl(ev: CalendarEvent): string {
  const end = eventEnd(ev);
  const dates = ev.allDay
    ? `${dayStamp(ev.start)}/${dayStamp(end)}`
    : `${utcStamp(ev.start)}/${utcStamp(end)}`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates });
  if (ev.description) params.set("details", ev.description);
  if (ev.location) params.set("location", ev.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarUrl(ev: CalendarEvent): string {
  const end = eventEnd(ev);
  const params = new URLSearchParams({
    rru: "addevent",
    subject: ev.title,
    startdt: ev.start.toISOString(),
    enddt: end.toISOString(),
  });
  if (ev.allDay) params.set("allday", "true");
  if (ev.description) params.set("body", ev.description);
  if (ev.location) params.set("location", ev.location);
  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
}

/** Échappement iCalendar (RFC 5545) : virgules, points-virgules, sauts de ligne. */
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
}

export function buildIcs(ev: CalendarEvent): string {
  const end = eventEnd(ev);
  const uid = `${ev.start.getTime()}-${Math.abs(ev.title.length * 2654435761 % 1e9)}@biltia.com`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Biltia//FR",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    ev.allDay
      ? `DTSTART;VALUE=DATE:${dayStamp(ev.start)}`
      : `DTSTART:${utcStamp(ev.start)}`,
    ev.allDay
      ? `DTEND;VALUE=DATE:${dayStamp(end)}`
      : `DTEND:${utcStamp(end)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

// ── Téléchargement générique (PDF, .ics, exports) ────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadIcs(ev: CalendarEvent, filename = "evenement.ics"): void {
  downloadBlob(new Blob([buildIcs(ev)], { type: "text/calendar;charset=utf-8" }), filename);
}

/** Nom de fichier sûr à partir d'un titre libre : « PV réception » → pv-reception. */
export function safeFilename(title: string, ext: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "document"}.${ext}`;
}

// ── Partage natif (API Web Share) ────────────────────────────────────────────

/** Le navigateur sait-il partager des fichiers (feuille de partage mobile) ? */
export function canShareFiles(files: File[]): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files })
  );
}

// ── GPS (position du téléphone) ──────────────────────────────────────────────

export type GeoPoint = { lat: number; lng: number; accuracy: number };

export function getCurrentPosition(timeoutMs = 12000): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("La géolocalisation n'est pas disponible sur cet appareil."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Accès à la position refusé. Autorisez la localisation dans votre navigateur."
              : "Position introuvable. Réessayez à l'extérieur ou vérifiez le GPS."
          )
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );
  });
}

export function mapsUrl(p: { lat: number; lng: number }): string {
  return `https://maps.google.com/?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

/** Ligne texte prête à coller dans un rapport/notes : lien Maps + précision. */
export function gpsLine(p: GeoPoint, when: Date): string {
  const d = when.toLocaleDateString("fr-FR");
  const t = when.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `📍 Position relevée le ${d} à ${t} (±${p.accuracy} m) : ${mapsUrl(p)}`;
}
