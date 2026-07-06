// ─────────────────────────────────────────────────────────────────────────────
// RÉSERVATION DE DÉMO — helpers SERVEUR (URL, IP, DB, envois d'email).
// STRICTEMENT côté serveur (utilise le client service_role + le mailer).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase-admin";
import { sendEmail } from "./mailer";
import type { DemoBooking } from "./demo-emails";
import {
  visitorReceived,
  ownerNewRequest,
  visitorConfirmed,
  visitorRescheduledByOwner,
  ownerNotifyClientReschedule,
} from "./demo-emails";

/** Où j'atterris (propriétaire). Surchargeable par env, défaut contact@biltia.com. */
export const OWNER_EMAIL = process.env.DEMO_NOTIFY_EMAIL || "contact@biltia.com";

/**
 * Client DB pour la table demo_bookings. Les types générés ne connaissent pas
 * encore cette table → on renvoie un client NON typé (from() accepte le nom en
 * clair). null si la clé service_role est absente (dégradation honnête).
 */
export function demoDb(): SupabaseClient | null {
  const admin = createAdminClient();
  return admin ? (admin as unknown as SupabaseClient) : null;
}

export function siteBaseUrl(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  try {
    return new URL(req.url).origin;
  } catch {
    return "https://www.biltia.com";
  }
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

export const manageUrl = (base: string, b: { client_token: string }) => `${base}/demo/manage/${b.client_token}`;
export const ownerUrl = (base: string, b: { admin_token: string }) => `${base}/demo/manage/${b.admin_token}`;

// ── Envois (best-effort : ne jamais faire échouer la requête sur un email) ─────

export async function notifyNewBooking(b: DemoBooking, base: string): Promise<void> {
  await Promise.allSettled([
    sendEmail({ to: [b.contact_email], ...visitorReceived(b, manageUrl(base, b)) }),
    sendEmail({ to: [OWNER_EMAIL], replyTo: b.contact_email, ...ownerNewRequest(b, ownerUrl(base, b)) }),
  ]);
}

export async function notifyConfirmed(b: DemoBooking, base: string): Promise<void> {
  await sendEmail({ to: [b.contact_email], ...visitorConfirmed(b, manageUrl(base, b)) });
}

export async function notifyOwnerProposedSlot(b: DemoBooking, base: string): Promise<void> {
  await sendEmail({ to: [b.contact_email], ...visitorRescheduledByOwner(b, manageUrl(base, b)) });
}

export async function notifyClientRescheduled(b: DemoBooking, base: string): Promise<void> {
  await sendEmail({ to: [OWNER_EMAIL], replyTo: b.contact_email, ...ownerNotifyClientReschedule(b, ownerUrl(base, b)) });
}
