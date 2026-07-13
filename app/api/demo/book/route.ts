// ─────────────────────────────────────────────────────────────────────────────
// POST /api/demo/book — création d'une demande de démo (PUBLIC, non connecté).
//
// Sécurité (les 4 réflexes) :
//   • Rate limiting par IP (5/h) — anti-spam d'un formulaire public.
//   • Validation stricte des inputs (parseBody + revalidation du créneau).
//   • Aucune clé exposée : insert via service_role côté serveur uniquement.
//   • Le créneau est REVALIDÉ serveur (48 h + 18 h) : jamais confiance au client.
// ─────────────────────────────────────────────────────────────────────────────

import { enforceRateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validate";
import {
  isValidIsoDate,
  isSlotBookable,
  HEADCOUNT_VALUES,
  LOOKING_FOR_VALUES,
} from "@/lib/demo-booking";
import { demoDb, clientIp, siteBaseUrl, notifyNewBooking } from "@/lib/demo-server";
import type { DemoBooking } from "@/lib/demo-emails";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

export async function POST(req: Request) {
  const locale = await getLocale();
  const ip = clientIp(req);
  const limited = await enforceRateLimit("demo_book", ip, { limit: 5, windowSec: 3600 });
  if (limited) return limited;

  const parsed = await parseBody(req, {
    date: { type: "string", required: true, max: 10 },
    time: { type: "string", required: true, max: 5 },
    company_name: { type: "string", required: true, min: 2, max: 120 },
    website: { type: "string", max: 200 },
    headcount: { type: "string", enum: HEADCOUNT_VALUES, max: 20 },
    looking_for: { type: "string", enum: LOOKING_FOR_VALUES, max: 40 },
    message: { type: "string", max: 1000 },
    contact_name: { type: "string", required: true, min: 2, max: 120 },
    contact_email: { type: "string", required: true, max: 160 },
    contact_phone: { type: "string", max: 40 },
  });
  if (parsed instanceof Response) return parsed;
  const f = parsed as {
    date: string; time: string; company_name: string; website?: string;
    headcount?: string; looking_for?: string; message?: string;
    contact_name: string; contact_email: string; contact_phone?: string;
  };

  // Email plausible + créneau réellement réservable (revalidation serveur).
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contact_email)) {
    return Response.json(
      { error: pick(locale, "Email invalide.", "Invalid email address.") },
      { status: 400 }
    );
  }
  if (!isValidIsoDate(f.date) || !/^\d{2}:00$/.test(f.time) || !isSlotBookable(f.date, f.time)) {
    return Response.json(
      {
        error: pick(
          locale,
          "Ce créneau n'est plus disponible. Choisissez-en un autre.",
          "This time slot is no longer available. Please pick another one."
        ),
      },
      { status: 409 }
    );
  }

  const db = demoDb();
  if (!db) {
    return Response.json(
      {
        error: pick(
          locale,
          "Réservation temporairement indisponible.",
          "Booking is temporarily unavailable."
        ),
      },
      { status: 503 }
    );
  }

  const { data, error } = await db
    .from("demo_bookings")
    .insert({
      slot_date: f.date,
      slot_time: f.time,
      company_name: f.company_name,
      website: f.website || null,
      headcount: f.headcount || null,
      looking_for: f.looking_for || null,
      message: f.message || null,
      contact_name: f.contact_name,
      contact_email: f.contact_email,
      contact_phone: f.contact_phone || null,
      source_ip: ip,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("demo/book insert error:", error);
    return Response.json(
      {
        error: pick(
          locale,
          "Impossible d'enregistrer la demande. Réessayez.",
          "Could not save your request. Please try again."
        ),
      },
      { status: 500 }
    );
  }

  // Emails best-effort — ne bloquent jamais la réponse.
  await notifyNewBooking(data as DemoBooking, siteBaseUrl(req)).catch(() => {});

  return Response.json({ ok: true, date: f.date, time: f.time });
}
