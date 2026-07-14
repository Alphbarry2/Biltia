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
import { getEntitlementsForTenant, canSendMessages, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { sendSms } from "@/lib/outbound-sms";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

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
  const locale = await getLocale();
  if (!sameOrigin(req)) {
    return Response.json({ error: pick(locale, "Origine non autorisée.", "Origin not allowed.") }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  }

  const limited = await enforceRateLimit("app_sms", user.id, LIMITS.app_sms);
  if (limited) return limited;

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership) {
    return Response.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });
  }
  const tenantId = membership.tenant_id;

  const ent = await getEntitlementsForTenant(supabase, tenantId);
  if (!ent.writable) {
    return Response.json({ error: frozenMessage(locale, ent), frozen: true }, { status: 403 });
  }

  // Plan : l'envoi automatique de SMS est réservé à Pro (et a un coût réel chez le
  // fournisseur). Le Free crée et utilise son app, mais n'émet pas de SMS. Fondateur exempté.
  if (!canSendMessages(ent) && !isFounderEmail(user.email)) {
    return Response.json(
      {
        error: pick(
          locale,
          "L'envoi de SMS depuis vos apps fait partie du plan Pro. Passez à un plan payant pour l'activer.",
          "Sending SMS from your apps is part of the Pro plan. Upgrade to a paid plan to enable it."
        ),
        upgrade: true,
      },
      { status: 403 }
    );
  }

  let body: { to?: unknown; body?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: pick(locale, "Requête invalide.", "Invalid request.") }, { status: 400 });
  }

  const to = Array.isArray(body.to)
    ? body.to.map(String)
    : typeof body.to === "string"
      ? [body.to]
      : [];
  const text = typeof body.body === "string" ? body.body.slice(0, 1600) : "";
  if (!to.length || !text.trim()) {
    return Response.json(
      {
        error: pick(
          locale,
          "SMS incomplet : au moins un numéro et un message requis.",
          "Incomplete SMS: at least one number and a message are required."
        ),
      },
      { status: 400 }
    );
  }

  const sent = await sendSms({ to, body: text });
  if (!sent.ok) {
    return Response.json({ error: sent.reason }, { status: 400 });
  }
  return Response.json({ ok: true, sent: sent.sent, failed: sent.failed });
}
