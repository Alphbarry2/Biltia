// ─────────────────────────────────────────────────────────────────────────────
// /api/app-email — ENVOI D'EMAIL exposé AUX APPLICATIONS générées (window.biltia
// .sendEmail). L'app n'a AUCUN secret : elle passe par le pont postMessage, le
// parent proxifie en same-origin (cookies = auth, RLS = tenant). Le canal est
// choisi automatiquement (Gmail connecté de l'utilisateur, sinon envoi Biltia).
//
// PAS de crédit débité : envoyer un email n'est PAS de la génération IA (règle
// tarifaire — les crédits = IA neuve uniquement). Rate-limité contre le spam.
// Gel lecture seule respecté (un abonnement expiré ne peut plus rien émettre).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, canSendMessages, FROZEN_MESSAGE } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { sendOutboundEmail } from "@/lib/outbound-email";

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

  const limited = await enforceRateLimit("app_email", user.id, LIMITS.app_email);
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

  // Plan : l'envoi automatique d'emails est réservé à Pro (« le Free goûte, le Pro
  // exécute »). Le Free crée et utilise son app, mais n'émet pas d'emails. Fondateur exempté.
  if (!canSendMessages(ent) && !isFounderEmail(user.email)) {
    return Response.json(
      {
        error:
          "L'envoi d'emails depuis vos apps fait partie du plan Pro. Passez à un plan payant pour l'activer.",
        upgrade: true,
      },
      { status: 403 }
    );
  }

  let body: { to?: unknown; subject?: string; body?: string };
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
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 200) : "";
  const text = typeof body.body === "string" ? body.body.slice(0, 6000) : "";
  if (!to.length || !subject || !text) {
    return Response.json(
      { error: "Email incomplet : destinataire, objet et message requis." },
      { status: 400 }
    );
  }

  const sent = await sendOutboundEmail({
    tenantId,
    userId: user.id,
    fromEmail: user.email ?? null,
    to,
    subject,
    body: text,
  });
  if (!sent.ok) {
    return Response.json({ error: sent.reason }, { status: 400 });
  }
  return Response.json({ ok: true, via: sent.via, note: sent.note });
}
