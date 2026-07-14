// ─────────────────────────────────────────────────────────────────────────────
// /api/task/execute — EXÉCUTION d'un envoi groupé « fais-le maintenant ».
//
// Deuxième temps du moteur task-now : l'utilisateur a VU l'aperçu (résolu par
// /api/generate) et a validé (« oui, envoie »). Ici on RÉ-RÉSOUT le groupe à
// FRAIS depuis le workspace (jamais une liste envoyée par le client → aucune
// falsification possible du périmètre) et on envoie un email INDIVIDUEL par
// destinataire, borné, avec un rapport honnête de ce qui a été fait/sauté.
//
// Ne facture pas de crédit (envoi, pas d'IA — la rédaction a déjà été comptée à
// l'aperçu). RBAC : réservé aux rôles qui peuvent créer/agir. Gel lecture seule
// respecté. Anti-spam via rate-limit app_email.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { can } from "@/lib/permissions";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity";
import { resolveAudience, sendTaskEmails, isTaskAudience, AUDIENCE_LABELS } from "@/lib/task-now";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

export async function POST(req: Request) {
  const locale = await getLocale();
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json(
        { error: pick(locale, "Authentification requise.", "Authentication required.") },
        { status: 401 }
      );
    }

    // Anti-spam : borne les envois groupés avant toute lecture DB.
    const limited = await enforceRateLimit("task_execute", user.id, LIMITS.app_email);
    if (limited) return limited;

    const membership = await getActiveMembershipServer(supabase, user.id);
    if (!membership) {
      return Response.json(
        { error: pick(locale, "Aucun espace de travail trouvé.", "No workspace found.") },
        { status: 403 }
      );
    }
    const tenantId = membership.tenant_id;

    // RBAC : envoyer au nom de l'entreprise = agir → réservé aux rôles créateurs.
    if (!can(membership.role, "ai.create")) {
      return Response.json(
        {
          error: pick(
            locale,
            "Vous êtes en lecture seule sur cet espace. Demandez les droits nécessaires pour envoyer.",
            "You have read-only access to this workspace. Ask for the rights needed to send."
          ),
        },
        { status: 403 }
      );
    }

    // Gel lecture seule : un abonnement expiré ne peut plus envoyer.
    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) {
      return Response.json({ error: frozenMessage(locale, ent), frozen: true }, { status: 403 });
    }

    let body: { audience?: string; subject?: string; body?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
        { status: 400 }
      );
    }

    const audience = (body.audience ?? "").trim();
    const subject = (body.subject ?? "").trim() || "Message de votre part";
    const text = (body.body ?? "").trim();
    if (!isTaskAudience(audience)) {
      return Response.json(
        { error: pick(locale, "Groupe destinataire invalide.", "Invalid recipient group.") },
        { status: 400 }
      );
    }
    if (!text) {
      return Response.json({ error: pick(locale, "Message vide.", "Empty message.") }, { status: 400 });
    }
    const label = AUDIENCE_LABELS[audience];

    // Ré-résolution FRAÎCHE du groupe (source de vérité = workspace, pas le client).
    const resolved = await resolveAudience(supabase, tenantId, audience);
    if (resolved.recipients.length === 0) {
      return Response.json({
        status: "no_recipient",
        message: pick(
          locale,
          `Aucun ${label.singular} avec un email dans ton workspace — rien n'a été envoyé.`,
          "No recipient with an email address in your workspace — nothing was sent."
        ),
      });
    }

    const result = await sendTaskEmails({
      tenantId,
      userId: user.id,
      fromEmail: user.email ?? null,
      subject,
      body: text,
      resolved,
    });

    if (result.sent > 0) {
      await logActivity(supabase, {
        tenantId,
        userId: user.id,
        action: "send",
        entityType: "task",
        description: `Envoi groupé (${label.plural}) : ${result.sent} message(s) envoyé(s)`,
      });
    }

    // Rapport honnête : envoyés, sautés (pas d'email), échecs, report (au-delà du cap).
    const parts: string[] = [];
    if (result.sent > 0) {
      const via =
        result.via === "gmail"
          ? pick(locale, " depuis ton Gmail", " from your Gmail")
          : result.via === "resend"
            ? pick(locale, " via Biltia", " via Biltia")
            : "";
      parts.push(
        pick(locale, `✅ ${result.sent} message(s) envoyé(s)${via}`, `✅ ${result.sent} message(s) sent${via}`)
      );
    }
    if (result.failed > 0)
      parts.push(pick(locale, `${result.failed} échec(s)`, `${result.failed} failure(s)`));
    if (result.skippedNoEmail > 0)
      parts.push(
        pick(locale, `${result.skippedNoEmail} sans email (sautés)`, `${result.skippedNoEmail} skipped (no email)`)
      );
    if (result.deferred > 0)
      parts.push(
        pick(
          locale,
          `${result.deferred} en attente (renvoie « continue » pour la suite)`,
          `${result.deferred} pending (send “continue” for the rest)`
        )
      );
    const message = parts.length
      ? parts.join(" · ") + "."
      : pick(
          locale,
          "Rien n'a pu être envoyé — réessaie dans un instant.",
          "Nothing could be sent — try again in a moment."
        );

    return Response.json({
      status: result.sent > 0 ? "sent" : "failed",
      sent: result.sent,
      failed: result.failed,
      skippedNoEmail: result.skippedNoEmail,
      deferred: result.deferred,
      message,
    });
  } catch (err) {
    console.error("Task execute error:", err);
    return Response.json(
      { error: pick(locale, "Erreur d'envoi. Réessaie.", "Sending failed. Please try again.") },
      { status: 500 }
    );
  }
}
