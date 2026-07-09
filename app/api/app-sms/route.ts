// ─────────────────────────────────────────────────────────────────────────────
// /api/app-sms — ENVOI DE SMS exposé AUX APPLICATIONS générées (window.biltia
// .sendSms). Relances de facture, confirmations de RDV… L'app n'a AUCUN secret :
// elle passe par le pont postMessage, le parent proxifie en same-origin (cookies
// = auth, RLS = tenant). Fournisseur (Twilio) isolé dans lib/outbound-sms.ts.
//
// PAS de crédit débité (un SMS n'est pas de l'IA) MAIS le SMS a un COÛT réel chez
// le fournisseur → rate-limit plus strict que l'email. Gel lecture seule respecté.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, canSendMessages, FROZEN_MESSAGE } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { sendSms } from "@/lib/outbound-sms";

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // srcdoc / requêtes sans Origin → tolérées (same-origin)
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return Response.json({ error: "Origine non autorisée." }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Authentification requise." }, { status: 401 });
  }

  const limited = await enforceRateLimit("app_sms", user.id, LIMITS.app_sms);
  if (limited) return limited;

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership) {
    return Response.json({ error: "Aucun espace de travail." }, { status: 403 });
  }
  const tenantId = membership.tenant_id;

  const ent = await getEntitlementsForTenant(supabase, tenantId);
  if (!ent.writable) {
    return Response.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
  }

  // Plan : l'envoi automatique de SMS est réservé à Pro (et a un coût réel chez le
  // fournisseur). Le Free crée et utilise son app, mais n'émet pas de SMS. Fondateur exempté.
  if (!canSendMessages(ent) && !isFounderEmail(user.email)) {
    return Response.json(
      {
        error:
          "L'envoi de SMS depuis vos apps fait partie du plan Pro. Passez à un plan payant pour l'activer.",
        upgrade: true,
      },
      { status: 403 }
    );
  }

  let body: { to?: unknown; body?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const to = Array.isArray(body.to)
    ? body.to.map(String)
    : typeof body.to === "string"
      ? [body.to]
      : [];
  const text = typeof body.body === "string" ? body.body.slice(0, 1600) : "";
  if (!to.length || !text.trim()) {
    return Response.json({ error: "SMS incomplet : au moins un numéro et un message requis." }, { status: 400 });
  }

  const sent = await sendSms({ to, body: text });
  if (!sent.ok) {
    return Response.json({ error: sent.reason }, { status: 400 });
  }
  return Response.json({ ok: true, sent: sent.sent, failed: sent.failed });
}
