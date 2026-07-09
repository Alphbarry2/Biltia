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
import { getEntitlementsForTenant, FROZEN_MESSAGE } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity";
import { resolveAudience, sendTaskEmails, isTaskAudience, AUDIENCE_LABELS } from "@/lib/task-now";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Authentification requise." }, { status: 401 });
    }

    // Anti-spam : borne les envois groupés avant toute lecture DB.
    const limited = await enforceRateLimit("task_execute", user.id, LIMITS.app_email);
    if (limited) return limited;

    const membership = await getActiveMembershipServer(supabase, user.id);
    if (!membership) {
      return Response.json({ error: "Aucun espace de travail trouvé." }, { status: 403 });
    }
    const tenantId = membership.tenant_id;

    // RBAC : envoyer au nom de l'entreprise = agir → réservé aux rôles créateurs.
    if (!can(membership.role, "ai.create")) {
      return Response.json(
        { error: "Vous êtes en lecture seule sur cet espace. Demandez les droits nécessaires pour envoyer." },
        { status: 403 }
      );
    }

    // Gel lecture seule : un abonnement expiré ne peut plus envoyer.
    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) {
      return Response.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
    }

    let body: { audience?: string; subject?: string; body?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    const audience = (body.audience ?? "").trim();
    const subject = (body.subject ?? "").trim() || "Message de votre part";
    const text = (body.body ?? "").trim();
    if (!isTaskAudience(audience)) {
      return Response.json({ error: "Groupe destinataire invalide." }, { status: 400 });
    }
    if (!text) {
      return Response.json({ error: "Message vide." }, { status: 400 });
    }
    const label = AUDIENCE_LABELS[audience];

    // Ré-résolution FRAÎCHE du groupe (source de vérité = workspace, pas le client).
    const resolved = await resolveAudience(supabase, tenantId, audience);
    if (resolved.recipients.length === 0) {
      return Response.json({
        status: "no_recipient",
        message: `Aucun ${label.singular} avec un email dans ton workspace — rien n'a été envoyé.`,
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
      const via = result.via === "gmail" ? " depuis ton Gmail" : result.via === "resend" ? " via Biltia" : "";
      parts.push(`✅ ${result.sent} message(s) envoyé(s)${via}`);
    }
    if (result.failed > 0) parts.push(`${result.failed} échec(s)`);
    if (result.skippedNoEmail > 0) parts.push(`${result.skippedNoEmail} sans email (sautés)`);
    if (result.deferred > 0) parts.push(`${result.deferred} en attente (renvoie « continue » pour la suite)`);
    const message = parts.length
      ? parts.join(" · ") + "."
      : "Rien n'a pu être envoyé — réessaie dans un instant.";

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
    return Response.json({ error: "Erreur d'envoi. Réessaie." }, { status: 500 });
  }
}
