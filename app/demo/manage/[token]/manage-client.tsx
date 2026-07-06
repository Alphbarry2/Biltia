"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Loader2, Pencil, X, Building2, ArrowRight } from "lucide-react";
import { SlotPicker } from "@/components/demo-booking-modal";
import {
  formatSlotFr, canReschedule, todayBelgiumIso, labelOf,
  HEADCOUNT_OPTIONS, LOOKING_FOR_OPTIONS,
} from "@/lib/demo-booking";

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

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente de confirmation", cls: "bg-[#FEF3E2] text-[#B26A00]" },
  confirmed: { label: "Confirmée", cls: "bg-[#E7F7EC] text-[#1B8A4B]" },
  cancelled: { label: "Annulée", cls: "bg-[#F1F1F4] text-[#8B8B96]" },
};

export default function ManageClient({
  booking: initial, role, token,
}: {
  booking: ManageBooking;
  role: Role;
  token: string;
}) {
  const [booking, setBooking] = useState(initial);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [pickDate, setPickDate] = useState<string | null>(null);
  const [pickTime, setPickTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");

  const st = STATUS[booking.status] ?? STATUS.pending;
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
      if (!res.ok) { setErr(json.error || "Une erreur est survenue."); return; }
      if (json.booking) setBooking((b) => ({ ...b, ...json.booking }));
      setMode("view"); setPickDate(null); setPickTime(null);
      if (success) setFlash(success);
    } catch {
      setErr("Réseau indisponible. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const saveNewSlot = () => {
    if (!pickDate || !pickTime) return;
    if (role === "client") act("reschedule", { date: pickDate, time: pickTime }, "Votre nouveau créneau a été enregistré.");
    else act("propose", { date: pickDate, time: pickTime }, "Le nouveau créneau a été envoyé au client.");
  };

  return (
    <div className="rounded-[22px] border border-[#ECECF2] bg-white p-6 shadow-[0_10px_40px_rgba(60,40,120,0.08)] sm:p-8">
      <div className="mb-1 flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
        {role === "owner" && <span className="text-[11px] font-semibold uppercase tracking-wide text-[#B4ADC4]">Vue organisateur</span>}
      </div>

      <h1 className="text-[22px] font-black tracking-[-0.02em] text-[#0A0A0A]">
        {role === "owner" ? "Demande de démo" : "Votre démo Biltia"}
      </h1>

      {/* Créneau */}
      <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-[#F5F2FD] px-4 py-3.5">
        <CalendarDays className="h-5 w-5 flex-shrink-0 text-[#7C3AED]" />
        <span className="text-[15px] font-bold text-[#0A0A0A]">{formatSlotFr(booking.slot_date, booking.slot_time)}</span>
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
            ["Entreprise", booking.company_name],
            ["Site web", booking.website || "—"],
            ["Effectif", labelOf(HEADCOUNT_OPTIONS, booking.headcount)],
            ["Recherche", labelOf(LOOKING_FOR_OPTIONS, booking.looking_for)],
            ["Contact", booking.contact_name],
            ["Email", booking.contact_email || "—"],
            ["Téléphone", booking.contact_phone || "—"],
            ["Message", booking.message || "—"],
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
              Annuler
            </button>
            <button
              onClick={saveNewSlot}
              disabled={!pickDate || !pickTime || busy}
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 px-6 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_22px_rgba(124,58,190,0.35)] disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enregistrer
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
                  onClick={() => act("confirm", undefined, "Créneau confirmé. Le client a été prévenu par email.")}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0A0A0A] px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#222] disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmer ce créneau
                </button>
              )}
              <button
                onClick={() => setMode("edit")}
                className="inline-flex items-center gap-2 rounded-full border border-[#E6E1F0] bg-white px-5 py-3 text-[14px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F6F4FB]"
              >
                <Pencil className="h-4 w-4" /> Proposer un autre créneau
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
                <Pencil className="h-4 w-4" /> Modifier le créneau
              </button>
              <button
                onClick={() => act("cancel", undefined, "Votre réservation a été annulée.")}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-[#E6E1F0] bg-white px-5 py-3 text-[14px] font-semibold text-[#5B5B66] transition-colors hover:bg-[#F6F4FB] disabled:opacity-40"
              >
                <X className="h-4 w-4" /> Annuler
              </button>
            </>
          )}
        </div>
      )}

      {role === "client" && !clientCanEdit && !cancelled && mode === "view" && (
        <p className="mt-3 text-[12.5px] text-[#9A9AA6]">
          La modification n&apos;est plus possible à moins de 24 h du rendez-vous. Pour tout changement, écrivez-nous à{" "}
          <a href="mailto:contact@biltia.com" className="font-semibold text-[#7C3AED] hover:underline">contact@biltia.com</a>.
        </p>
      )}

      {cancelled && (
        <Link href="/" className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#7C3AED] hover:underline">
          Découvrir Biltia <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}

      {role === "owner" && (
        <p className="mt-6 flex items-center gap-1.5 text-[11.5px] text-[#B4ADC4]">
          <Building2 className="h-3.5 w-3.5" /> Lien privé — ne pas partager.
        </p>
      )}
    </div>
  );
}
