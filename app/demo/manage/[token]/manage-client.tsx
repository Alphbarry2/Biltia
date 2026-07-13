"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Loader2, Pencil, X, Building2, ArrowRight } from "lucide-react";
import { SlotPicker } from "@/components/demo-booking-modal";
import {
  formatSlot, canReschedule, todayBelgiumIso, labelOf,
  headcountOptions, lookingForOptions,
} from "@/lib/demo-booking";
import { useT, useLocale } from "@/lib/i18n/context";

export type Role = "client" | "owner";
export type ManageBooking = {
  slot_date: string;
  slot_time: string;
  status: string;
  company_name: string;
  contact_name: string;
  website?: string | null;
  headcount?: string | null;
  looking_for?: string | null;
  message?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
};

const STATUS_CLS: Record<string, string> = {
  pending: "bg-[#FEF3E2] text-[#B26A00]",
  confirmed: "bg-[#E7F7EC] text-[#1B8A4B]",
  cancelled: "bg-[#F1F1F4] text-[#8B8B96]",
};

function statusLabel(t: (fr: string, en: string) => string, status: string): string {
  if (status === "confirmed") return t("Confirmée", "Confirmed");
  if (status === "cancelled") return t("Annulée", "Cancelled");
  return t("En attente de confirmation", "Awaiting confirmation");
}

export default function ManageClient({
  booking: initial, role, token,
}: {
  booking: ManageBooking;
  role: Role;
  token: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [booking, setBooking] = useState(initial);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [pickDate, setPickDate] = useState<string | null>(null);
  const [pickTime, setPickTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");

  const stCls = STATUS_CLS[booking.status] ?? STATUS_CLS.pending;
  const cancelled = booking.status === "cancelled";
  const clientCanEdit = role === "client" && !cancelled && canReschedule(booking.slot_date, booking.slot_time);

  const act = async (action: string, extra?: Record<string, unknown>, success?: string) => {
    setBusy(true); setErr(""); setFlash("");
    try {
      const res = await fetch("/api/demo/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action, ...extra }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error || t("Une erreur est survenue.", "Something went wrong.")); return; }
      if (json.booking) setBooking((b) => ({ ...b, ...json.booking }));
      setMode("view"); setPickDate(null); setPickTime(null);
      if (success) setFlash(success);
    } catch {
      setErr(t("Réseau indisponible. Réessayez.", "Network unavailable. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const saveNewSlot = () => {
    if (!pickDate || !pickTime) return;
    if (role === "client") act("reschedule", { date: pickDate, time: pickTime }, t("Votre nouveau créneau a été enregistré.", "Your new time slot has been saved."));
    else act("propose", { date: pickDate, time: pickTime }, t("Le nouveau créneau a été envoyé au client.", "The new time slot has been sent to the client."));
  };

  return (
    <div className="rounded-[22px] border border-[#ECECF2] bg-white p-6 shadow-[0_10px_40px_rgba(60,40,120,0.08)] sm:p-8">
      <div className="mb-1 flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${stCls}`}>{statusLabel(t, booking.status)}</span>
        {role === "owner" && <span className="text-[11px] font-semibold uppercase tracking-wide text-[#B4ADC4]">{t("Vue organisateur", "Organizer view")}</span>}
      </div>

      <h1 className="text-[22px] font-black tracking-[-0.02em] text-[#0A0A0A]">
        {role === "owner" ? t("Demande de démo", "Demo request") : t("Votre démo Biltia", "Your Biltia demo")}
      </h1>

      {/* Créneau */}
      <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-[#F5F2FD] px-4 py-3.5">
        <CalendarDays className="h-5 w-5 flex-shrink-0 text-[#7C3AED]" />
        <span className="text-[15px] font-bold text-[#0A0A0A]">{formatSlot(booking.slot_date, booking.slot_time, locale)}</span>
      </div>

      {flash && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#E7F7EC] px-3.5 py-2.5 text-[13px] font-medium text-[#1B8A4B]">
          <Check className="h-4 w-4" /> {flash}
        </p>
      )}
      {err && <p className="mt-4 rounded-xl bg-[#FDECEF] px-3.5 py-2.5 text-[13px] font-medium text-[#D1435B]">{err}</p>}

      {/* Détails (vue organisateur) */}
      {role === "owner" && (
        <dl className="mt-5 divide-y divide-[#F0EEF6] rounded-2xl border border-[#F0EEF6] px-4">
          {[
            [t("Entreprise", "Company"), booking.company_name],
            [t("Site web", "Website"), booking.website || "—"],
            [t("Effectif", "Headcount"), labelOf(headcountOptions(locale), booking.headcount)],
            [t("Recherche", "Looking for"), labelOf(lookingForOptions(locale), booking.looking_for)],
            [t("Contact", "Contact"), booking.contact_name],
            [t("Email", "Email"), booking.contact_email || "—"],
            [t("Téléphone", "Phone"), booking.contact_phone || "—"],
            [t("Message", "Message"), booking.message || "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3 py-2.5">
              <dt className="w-[38%] flex-shrink-0 text-[12.5px] text-[#8B8B96]">{k}</dt>
              <dd className="text-[13.5px] font-medium text-[#1A1A22]">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Sélecteur (modif / proposition) */}
      {mode === "edit" && !cancelled && (
        <div className="mt-6 rounded-2xl border border-[#ECE7F6] bg-[#FCFBFE] p-4">
          <SlotPicker
            date={pickDate}
            time={pickTime}
            onPick={(d, t) => { setPickDate(d); setPickTime(t); }}
            minIso={role === "owner" ? todayBelgiumIso() : undefined}
          />
          <div className="mt-4 flex gap-2">
            <button onClick={() => { setMode("view"); setPickDate(null); setPickTime(null); }} className="rounded-full px-4 py-2.5 text-[13.5px] font-semibold text-[#5B5B66] hover:bg-black/[0.04]">
              {t("Annuler", "Cancel")}
            </button>
            <button
              onClick={saveNewSlot}
              disabled={!pickDate || !pickTime || busy}
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 px-6 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_22px_rgba(124,58,190,0.35)] disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t("Enregistrer", "Save")}
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {mode === "view" && !cancelled && (
        <div className="mt-6 flex flex-wrap gap-2.5">
          {role === "owner" && (
            <>
              {booking.status !== "confirmed" && (
                <button
                  onClick={() => act("confirm", undefined, t("Créneau confirmé. Le client a été prévenu par email.", "Time slot confirmed. The client has been notified by email."))}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0A0A0A] px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#222] disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t("Confirmer ce créneau", "Confirm this slot")}
                </button>
              )}
              <button
                onClick={() => setMode("edit")}
                className="inline-flex items-center gap-2 rounded-full border border-[#E6E1F0] bg-white px-5 py-3 text-[14px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F6F4FB]"
              >
                <Pencil className="h-4 w-4" /> {t("Proposer un autre créneau", "Propose another slot")}
              </button>
            </>
          )}

          {role === "client" && (
            <>
              <button
                onClick={() => setMode("edit")}
                disabled={!clientCanEdit}
                className="inline-flex items-center gap-2 rounded-full bg-[#0A0A0A] px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#222] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Pencil className="h-4 w-4" /> {t("Modifier le créneau", "Change the slot")}
              </button>
              <button
                onClick={() => act("cancel", undefined, t("Votre réservation a été annulée.", "Your booking has been cancelled."))}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-[#E6E1F0] bg-white px-5 py-3 text-[14px] font-semibold text-[#5B5B66] transition-colors hover:bg-[#F6F4FB] disabled:opacity-40"
              >
                <X className="h-4 w-4" /> {t("Annuler", "Cancel")}
              </button>
            </>
          )}
        </div>
      )}

      {role === "client" && !clientCanEdit && !cancelled && mode === "view" && (
        <p className="mt-3 text-[12.5px] text-[#9A9AA6]">
          {t(
            "La modification n’est plus possible à moins de 24 h du rendez-vous. Pour tout changement, écrivez-nous à",
            "Changes are no longer possible within 24 hours of the appointment. For any change, email us at",
          )}{" "}
          <a href="mailto:contact@biltia.com" className="font-semibold text-[#7C3AED] hover:underline">contact@biltia.com</a>.
        </p>
      )}

      {cancelled && (
        <Link href="/" className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#7C3AED] hover:underline">
          {t("Découvrir Biltia", "Discover Biltia")} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}

      {role === "owner" && (
        <p className="mt-6 flex items-center gap-1.5 text-[11.5px] text-[#B4ADC4]">
          <Building2 className="h-3.5 w-3.5" /> {t("Lien privé — ne pas partager.", "Private link — do not share.")}
        </p>
      )}
    </div>
  );
}
