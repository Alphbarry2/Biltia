// ─────────────────────────────────────────────────────────────────────────────
// POST /api/demo/booking — actions sur une réservation, par JETON non devinable.
//
//   • client (client_token) : "reschedule" (>24 h avant), "cancel"
//   • owner  (admin_token)  : "confirm", "propose" (nouveau créneau)
//
// Le rôle découle du jeton. Rate-limit par IP. Créneaux revalidés serveur.
// ─────────────────────────────────────────────────────────────────────────────

import { enforceRateLimit } from "@/lib/rate-limit";
import {
  isValidIsoDate,
  isSlotBookable,
  slotsForDate,
  canReschedule,
  todayBelgiumIso,
} from "@/lib/demo-booking";
import {
  demoDb,
  clientIp,
  siteBaseUrl,
  notifyConfirmed,
  notifyOwnerProposedSlot,
  notifyClientRescheduled,
} from "@/lib/demo-server";
import type { DemoBooking } from "@/lib/demo-emails";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Role = "client" | "owner";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limited = await enforceRateLimit("demo_action", ip, { limit: 30, windowSec: 600 });
  if (limited) return limited;

  let body: { token?: string; action?: string; date?: string; time?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const token = String(body.token || "");
  const action = String(body.action || "");
  if (!UUID_RE.test(token)) {
    return Response.json({ error: "Lien invalide." }, { status: 404 });
  }

  const db = demoDb();
  if (!db) return Response.json({ error: "Service indisponible." }, { status: 503 });

  const { data: booking } = await db
    .from("demo_bookings")
    .select("*")
    .or(`client_token.eq.${token},admin_token.eq.${token}`)
    .maybeSingle();

  if (!booking) return Response.json({ error: "Réservation introuvable." }, { status: 404 });

  const role: Role = booking.admin_token === token ? "owner" : "client";
  const b = booking as DemoBooking;
  const base = siteBaseUrl(req);

  // Une réservation annulée n'accepte plus d'action.
  if (b.status === "cancelled") {
    return Response.json({ error: "Cette réservation a été annulée." }, { status: 409 });
  }

  // Helpers de mise à jour
  const patchAndReturn = async (patch: Record<string, unknown>) => {
    const { data: updated, error } = await db
      .from("demo_bookings")
      .update(patch)
      .eq("id", b.id)
      .select("*")
      .single();
    if (error || !updated) {
      console.error("demo/booking update error:", error);
      return null;
    }
    return updated as DemoBooking;
  };

  // ── Actions client ──────────────────────────────────────────────────────────
  if (role === "client" && action === "cancel") {
    const updated = await patchAndReturn({ status: "cancelled" });
    if (!updated) return Response.json({ error: "Échec de l'annulation." }, { status: 500 });
    return Response.json({ ok: true, booking: publicShape(updated, role) });
  }

  if (action === "reschedule" || action === "propose") {
    const date = String(body.date || "");
    const time = String(body.time || "");

    if (role === "client") {
      // Modif interdite à moins de 24 h de l'ancien créneau.
      if (!canReschedule(b.slot_date, b.slot_time)) {
        return Response.json(
          { error: "La modification n'est plus possible à moins de 24 h du rendez-vous." },
          { status: 409 }
        );
      }
      // Nouveau créneau : règle complète 48 h + 18 h.
      if (!isValidIsoDate(date) || !isSlotBookable(date, time)) {
        return Response.json({ error: "Ce créneau n'est pas disponible." }, { status: 409 });
      }
      const updated = await patchAndReturn({
        slot_date: date,
        slot_time: time,
        status: "pending",
        rescheduled_by: "client",
        confirmed_at: null,
      });
      if (!updated) return Response.json({ error: "Échec de la modification." }, { status: 500 });
      await notifyClientRescheduled(updated, base).catch(() => {});
      return Response.json({ ok: true, booking: publicShape(updated, role) });
    }

    // role === "owner" : proposer un créneau (pas de contrainte 48 h, mais valide et non passé).
    if (!isValidIsoDate(date) || date < todayBelgiumIso() || !slotsForDate(date).includes(time)) {
      return Response.json({ error: "Créneau invalide." }, { status: 409 });
    }
    const updated = await patchAndReturn({
      slot_date: date,
      slot_time: time,
      status: "confirmed",
      rescheduled_by: "owner",
      confirmed_at: new Date().toISOString(),
    });
    if (!updated) return Response.json({ error: "Échec." }, { status: 500 });
    await notifyOwnerProposedSlot(updated, base).catch(() => {});
    return Response.json({ ok: true, booking: publicShape(updated, role) });
  }

  // ── Action owner : confirmer le créneau tel quel ──────────────────────────────
  if (role === "owner" && action === "confirm") {
    const updated = await patchAndReturn({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    });
    if (!updated) return Response.json({ error: "Échec de la confirmation." }, { status: 500 });
    await notifyConfirmed(updated, base).catch(() => {});
    return Response.json({ ok: true, booking: publicShape(updated, role) });
  }

  return Response.json({ error: "Action non autorisée." }, { status: 403 });
}

/** Vue publique d'une réservation (jamais de jetons ; formulaire masqué au client). */
function publicShape(b: DemoBooking, role: Role) {
  const base = {
    id: b.id,
    slot_date: b.slot_date,
    slot_time: b.slot_time,
    status: b.status,
    company_name: b.company_name,
    contact_name: b.contact_name,
  };
  if (role === "owner") {
    return {
      ...base,
      website: b.website,
      headcount: b.headcount,
      looking_for: b.looking_for,
      message: b.message,
      contact_email: b.contact_email,
      contact_phone: b.contact_phone,
    };
  }
  return base;
}
