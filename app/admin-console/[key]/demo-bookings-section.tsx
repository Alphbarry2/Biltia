"use client";

// Section « Demandes de démo » de la console admin. Liste les demandes et lie
// chaque ligne à sa page organisateur (/demo/manage/<admin_token>) où l'on peut
// confirmer ou proposer un autre créneau — même flux que les liens email.

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, RefreshCw, ExternalLink, Inbox } from "lucide-react";
import { formatSlotFr, labelOf, HEADCOUNT_OPTIONS, LOOKING_FOR_OPTIONS } from "@/lib/demo-booking";

type Booking = {
  id: string;
  created_at: string;
  slot_date: string;
  slot_time: string;
  status: string;
  company_name: string;
  website: string | null;
  headcount: string | null;
  looking_for: string | null;
  message: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  rescheduled_by: string | null;
  admin_token: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-[#FEF3E2] text-[#B26A00]" },
  confirmed: { label: "Confirmée", cls: "bg-[#E7F7EC] text-[#1B8A4B]" },
  cancelled: { label: "Annulée", cls: "bg-[#F1F1F4] text-[#8B8B96]" },
};

export default function DemoBookingsSection() {
  const [items, setItems] = useState<Booking[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/demo-bookings", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error || "Erreur de chargement."); return; }
      setItems(json.bookings ?? []);
    } catch {
      setErr("Réseau indisponible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = items?.filter((b) => b.status === "pending").length ?? 0;

  return (
    <div className="rounded-[22px] border border-[#ECECF2] bg-white p-5 sm:p-6 shadow-[0_4px_16px_rgba(60,40,120,0.06)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white">
            <CalendarDays className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h3 className="text-[15px] font-bold text-[#0A0A0A]">Demandes de démo</h3>
            <p className="text-[12px] text-[#8B8B96]">
              {items ? `${items.length} demande${items.length > 1 ? "s" : ""}` : "…"}
              {pending > 0 && <span className="ml-1.5 font-semibold text-[#B26A00]">· {pending} en attente</span>}
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="grid h-8 w-8 place-items-center rounded-lg text-[#5B5B66] transition-colors hover:bg-black/[0.05] disabled:opacity-40" aria-label="Rafraîchir">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {err && <p className="rounded-xl bg-[#FDECEF] px-3.5 py-2.5 text-[13px] font-medium text-[#D1435B]">{err}</p>}

      {items && items.length === 0 && !err && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-[#9A9AA6]">
          <Inbox className="h-7 w-7" />
          <p className="text-[13px]">Aucune demande pour le moment.</p>
        </div>
      )}

      <div className="space-y-2.5">
        {items?.map((b) => {
          const st = STATUS[b.status] ?? STATUS.pending;
          return (
            <div key={b.id} className="flex flex-col gap-2 rounded-2xl border border-[#F0EEF6] p-3.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-bold text-[#0A0A0A]">{b.company_name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${st.cls}`}>{st.label}</span>
                  {b.rescheduled_by && <span className="text-[10.5px] font-medium text-[#B4ADC4]">modifié ({b.rescheduled_by === "owner" ? "vous" : "client"})</span>}
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-[#5B5B66]">
                  <CalendarDays className="h-3.5 w-3.5 text-[#7C3AED]" /> {formatSlotFr(b.slot_date, b.slot_time)}
                </p>
                <p className="mt-0.5 text-[12px] text-[#8B8B96]">
                  {b.contact_name} · {b.contact_email}{b.contact_phone ? ` · ${b.contact_phone}` : ""} · {labelOf(HEADCOUNT_OPTIONS, b.headcount)} · {labelOf(LOOKING_FOR_OPTIONS, b.looking_for)}
                </p>
                {b.message && <p className="mt-1 line-clamp-2 text-[12px] italic text-[#9A9AA6]">« {b.message} »</p>}
              </div>
              <a
                href={`/demo/manage/${b.admin_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#222]"
              >
                Gérer <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
