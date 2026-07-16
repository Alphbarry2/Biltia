// ─────────────────────────────────────────────────────────────────────────────
// /api/app-calendar — AJOUT D'UN RENDEZ-VOUS exposé AUX APPLICATIONS générées
// (window.biltia.addToCalendar). L'app n'a AUCUN secret : elle passe par le pont
// postMessage, le parent proxifie en same-origin (cookies = auth, RLS = tenant).
// Le fournisseur (Google ou Outlook) est choisi par lib/calendar.ts, qui SAIT
// déjà lequel l'utilisateur a connecté — l'app, elle, ne connaît que « l'agenda ».
//
// PAS de crédit débité (pas de l'IA). Gel lecture seule respecté (un abonnement
// expiré ne peut plus rien écrire). Pas connecté → `connectors` dans la réponse :
// c'est CE champ que lib/app-bridge.ts détecte pour afficher la carte de
// connexion par-dessus l'app, au lieu d'un échec muet.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, frozenMessage } from "@/lib/entitlements";
import { createEvent } from "@/lib/calendar";
import { connectorsForCapability } from "@/lib/capabilities";
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

  const limited = await enforceRateLimit("app_calendar", user.id, LIMITS.app_calendar);
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

  let body: { title?: unknown; start?: unknown; end?: unknown; location?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: pick(locale, "Requête invalide.", "Invalid request.") }, { status: 400 });
  }

  const summary = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const startISO = typeof body.start === "string" ? body.start.trim() : "";
  const endISO = typeof body.end === "string" ? body.end.trim() : undefined;
  const location = typeof body.location === "string" ? body.location.trim().slice(0, 200) : undefined;
  if (!summary || !startISO || Number.isNaN(Date.parse(startISO))) {
    return Response.json(
      {
        error: pick(
          locale,
          "Rendez-vous incomplet : titre et date/heure de début requis (ISO 8601).",
          "Incomplete appointment: title and start date/time are required (ISO 8601)."
        ),
      },
      { status: 400 }
    );
  }

  const created = await createEvent({ tenantId, userId: user.id, summary, startISO, endISO, location });
  if (created.ok) {
    return Response.json({ ok: true, summary: created.summary, whenLabel: created.whenLabel });
  }

  const needsConnect = created.reason === "not_connected" || created.reason === "missing_scope";
  const error =
    created.reason === "not_connected"
      ? pick(
          locale,
          "Connectez d'abord votre agenda (Google ou Outlook) — proposé ci-dessus — puis réessayez.",
          "First connect your calendar (Google or Outlook) — offered above — then try again."
        )
      : created.reason === "missing_scope"
        ? pick(
            locale,
            "L'autorisation d'écriture de l'agenda manque : reconnectez votre agenda ci-dessus puis réessayez.",
            "The calendar write permission is missing: reconnect your calendar above then try again."
          )
        : pick(locale, "Impossible d'ajouter le rendez-vous pour le moment.", "Couldn't add the appointment right now.");

  return Response.json(
    { error, ...(needsConnect ? { connectors: connectorsForCapability("calendar_read") } : {}) },
    { status: 400 }
  );
}
