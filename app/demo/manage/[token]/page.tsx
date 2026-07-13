// ─────────────────────────────────────────────────────────────────────────────
// /demo/manage/[token] — gestion d'une réservation par JETON non devinable.
//   • client_token → vue visiteur (modifier / annuler, > 24 h avant)
//   • admin_token  → vue propriétaire (confirmer / proposer un autre créneau)
// Le jeton n'est jamais indexé (noindex) et n'est pas exposé dans le HTML rendu.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { BiltiaLogo } from "@/components/brand";
import { demoDb } from "@/lib/demo-server";
import { getLocale } from "@/lib/i18n/server";
import { pick, type Locale } from "@/lib/i18n/config";
import ManageClient, { type ManageBooking, type Role } from "./manage-client";

export const metadata: Metadata = {
  title: "Ma réservation",
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#F4F2F8] px-4 py-10">
      <div className="mx-auto mb-6 flex max-w-[540px] items-center gap-2.5">
        <BiltiaLogo className="h-6 w-auto text-[#0A0A0A]" />
      </div>
      <div className="mx-auto max-w-[540px]">{children}</div>
    </main>
  );
}

function StateCard({ title, message, locale }: { title: string; message: string; locale: Locale }) {
  return (
    <Shell>
      <div className="rounded-[22px] border border-[#ECECF2] bg-white p-8 text-center shadow-[0_10px_40px_rgba(60,40,120,0.08)]">
        <h1 className="text-[20px] font-black tracking-[-0.02em] text-[#0A0A0A]">{title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#5B5B66]">{message}</p>
        <Link href="/" className="mt-6 inline-block text-[13px] font-semibold text-[#7C3AED] hover:underline">
          {pick(locale, "Retour au site", "Back to the site")}
        </Link>
      </div>
    </Shell>
  );
}

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await getLocale();

  if (!UUID_RE.test(token)) {
    return (
      <StateCard
        locale={locale}
        title={pick(locale, "Lien invalide", "Invalid link")}
        message={pick(locale, "Ce lien de réservation n’est pas valide.", "This booking link is not valid.")}
      />
    );
  }

  const db = demoDb();
  if (!db) {
    return (
      <StateCard
        locale={locale}
        title={pick(locale, "Service indisponible", "Service unavailable")}
        message={pick(locale, "La gestion des réservations est momentanément indisponible.", "Booking management is temporarily unavailable.")}
      />
    );
  }

  const { data } = await db
    .from("demo_bookings")
    .select("*")
    .or(`client_token.eq.${token},admin_token.eq.${token}`)
    .maybeSingle();

  if (!data) {
    return (
      <StateCard
        locale={locale}
        title={pick(locale, "Réservation introuvable", "Booking not found")}
        message={pick(locale, "Cette réservation n’existe pas ou a été supprimée.", "This booking does not exist or has been deleted.")}
      />
    );
  }

  const role: Role = data.admin_token === token ? "owner" : "client";
  const booking: ManageBooking = {
    slot_date: data.slot_date,
    slot_time: data.slot_time,
    status: data.status,
    company_name: data.company_name,
    contact_name: data.contact_name,
    ...(role === "owner"
      ? {
          website: data.website,
          headcount: data.headcount,
          looking_for: data.looking_for,
          message: data.message,
          contact_email: data.contact_email,
          contact_phone: data.contact_phone,
        }
      : {}),
  };

  return (
    <Shell>
      <ManageClient booking={booking} role={role} token={token} />
    </Shell>
  );
}
