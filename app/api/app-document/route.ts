// ─────────────────────────────────────────────────────────────────────────────
// /api/app-document — ENVOI D'UN DOCUMENT COMMERCIAL depuis une app générée
// (window.biltia.sendDocument). L'app ne fabrique plus le corps du mail : elle
// désigne une FICHE (« envoie le devis <id> »), le serveur fait le reste — PDF
// de marque, enveloppe email, lien « Voir et accepter ».
//
// Mêmes gardes que /api/app-email (même nature d'acte : émettre au nom de
// l'entreprise) : same-origin, auth, rate-limit, gel lecture seule, plan Pro.
// PAS de crédit débité : ce n'est pas de la génération IA.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, canSendMessages, frozenMessage } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { sendBusinessDocument, type DocumentKind } from "@/lib/documents/send-document";
import { publicBaseUrl } from "@/lib/share";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// Le rendu PDF (@react-pdf/renderer) est du Node pur : pas d'edge runtime.
export const runtime = "nodejs";

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

  // Un envoi de document = un envoi d'email : même compteur anti-spam.
  const limited = await enforceRateLimit("app_email", user.id, LIMITS.app_email);
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
  if (!canSendMessages(ent) && !isFounderEmail(user.email)) {
    return Response.json(
      {
        error: pick(
          locale,
          "L'envoi de devis et factures fait partie du plan Pro. Passez à un plan payant pour l'activer.",
          "Sending quotes and invoices is part of the Pro plan. Upgrade to a paid plan to enable it."
        ),
        upgrade: true,
      },
      { status: 403 }
    );
  }

  let body: {
    kind?: unknown;
    id?: unknown;
    to?: unknown;
    message?: unknown;
    intro?: unknown;
    subjectLabel?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: pick(locale, "Requête invalide.", "Invalid request.") }, { status: 400 });
  }

  const kind = body.kind === "facture" ? "facture" : body.kind === "devis" ? "devis" : null;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!kind || !id) {
    return Response.json(
      {
        error: pick(
          locale,
          "Document incomplet : type (devis|facture) et identifiant requis.",
          "Incomplete document: kind (devis|facture) and id are required."
        ),
      },
      { status: 400 }
    );
  }

  const to = Array.isArray(body.to)
    ? body.to.map(String)
    : typeof body.to === "string"
      ? [body.to]
      : [];

  const sent = await sendBusinessDocument({
    db: supabase, // client RLS : le tenant est isolé par la base, pas par ce code
    tenantId,
    userId: user.id,
    fromEmail: user.email ?? null,
    kind: kind as DocumentKind,
    id,
    to,
    message: typeof body.message === "string" ? body.message : undefined,
    intro: typeof body.intro === "string" ? body.intro : undefined,
    subjectLabel: typeof body.subjectLabel === "string" ? body.subjectLabel : undefined,
    baseUrl: publicBaseUrl(req),
  });

  if (!sent.ok) {
    return Response.json({ error: sent.reason, needsClientEmail: sent.needsClientEmail }, { status: 400 });
  }
  return Response.json({
    ok: true,
    via: sent.via,
    note: sent.note,
    url: sent.url,
    attachment: sent.attachment,
    to: sent.to,
  });
}
