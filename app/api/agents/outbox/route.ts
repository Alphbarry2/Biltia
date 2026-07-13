// ─────────────────────────────────────────────────────────────────────────────
// /api/agents/outbox — VALIDATION des relances préparées (Étape 3, #67/#70).
//
// GET  : liste les relances EN ATTENTE du tenant (aussi renvoyées par /api/agents).
// POST : décide d'une relance en attente — { id, decision: "send" | "discard" }.
//        "send"    → l'email part réellement (canal habituel Gmail/Biltia), puis
//                    la ligne passe 'sent'.
//        "discard" → la relance est ignorée (statut 'discarded'), rien n'est envoyé.
//
// Sécurité : session + membership actif, RBAC agents.manage (comme piloter un
// agent), tenant forcé, gel lecture seule respecté (un envoi est une écriture
// sortante). RLS de agent_outbox (035) réserve déjà lecture/màj aux membres.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { getEntitlementsForTenant, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { sendOutboundEmail } from "@/lib/outbound-email";
import { logActivity } from "@/lib/activity";
import { can } from "@/lib/permissions";
import { runWorkspaceTransform, isTransformAction, invoiceFromDevis } from "@/lib/workspace-transforms";
import { brandAgentEmail } from "@/lib/documents/agent-attachment";
import { publicBaseUrl } from "@/lib/share";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// agent_outbox : table récente (035) → cast souple le temps des types générés.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (t: string) => any };

type OutboxRow = {
  id: string;
  tenant_id: string;
  status: string;
  kind: string | null;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  /** La fiche déclenchante. C'est elle qui permet de rattacher le PDF (devis /
   *  facture) à la relance au moment de l'envoi. */
  fiche_id: string | null;
  fiche_label: string | null;
  level: number | null;
};

async function resolveSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null };
  const membership = await getActiveMembershipServer(supabase, user.id);
  return { supabase, user, membership };
}

export async function GET() {
  const locale = await getLocale();
  const { supabase, user, membership } = await resolveSession();
  if (!user)
    return NextResponse.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  if (!membership)
    return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });

  const { data } = await (supabase as unknown as LooseClient)
    .from("agent_outbox")
    .select("id, rule_id, fiche_label, kind, level, to_email, subject, body, status, created_at")
    .eq("tenant_id", membership.tenant_id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ pending: data ?? [] });
}

export async function POST(req: Request) {
  const locale = await getLocale();
  const { supabase, user, membership } = await resolveSession();
  if (!user)
    return NextResponse.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  if (!membership)
    return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });
  const tenantId = membership.tenant_id;

  // RBAC : valider/ignorer une relance = piloter un agent (owner / admin / manager).
  if (!can(membership.role, "agents.manage")) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Seuls le propriétaire, un administrateur ou un chef d'équipe peuvent valider une relance.",
          "Only the owner, an admin or a team lead can approve a follow-up."
        ),
      },
      { status: 403 }
    );
  }

  // Gel lecture seule : envoyer un email est une écriture sortante.
  const ent = await getEntitlementsForTenant(supabase, tenantId);
  if (!ent.writable) {
    return NextResponse.json({ error: frozenMessage(locale), frozen: true }, { status: 403 });
  }

  let body: { id?: string; decision?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }
  const id = typeof body.id === "string" ? body.id : "";
  const decision = body.decision === "send" || body.decision === "discard" ? body.decision : "";
  if (!id || !decision) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "« id » et « decision » (send|discard) requis.",
          "“id” and “decision” (send|discard) are required."
        ),
      },
      { status: 400 }
    );
  }

  const db = supabase as unknown as LooseClient;

  // La relance DOIT appartenir au tenant actif (RLS + filtre explicite) et être
  // encore en attente (évite un double envoi si deux onglets décident en parallèle).
  // Select limité aux colonnes présentes DEPUIS 035 (kind inclus) : ne casse pas
  // si 041 (operation/record_ref) n'est pas encore appliquée. Les items d'action
  // (workflow_step) n'existent que POST-041 → on lit operation/record_ref à la
  // demande, seulement dans leur branche.
  const { data: row } = await db
    .from("agent_outbox")
    .select("id, tenant_id, status, kind, to_email, subject, body, fiche_id, fiche_label, level")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  const outbox = row as OutboxRow | null;
  if (!outbox)
    return NextResponse.json({ error: pick(locale, "Relance introuvable.", "Follow-up not found.") }, { status: 404 });
  if (outbox.status !== "pending") {
    return NextResponse.json(
      { error: pick(locale, "Cette relance a déjà été traitée.", "This follow-up has already been handled.") },
      { status: 409 }
    );
  }

  // ── IGNORER ────────────────────────────────────────────────────────────────
  if (decision === "discard") {
    await db
      .from("agent_outbox")
      .update({ status: "discarded", decided_at: new Date().toISOString(), decided_by: user.id })
      .eq("tenant_id", tenantId)
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "discarded" });
  }

  // ── APPLIQUER une ACTION de workflow (Phase 6b.2) : transformation atomique
  //    (ex : ouvrir le chantier d'un devis accepté), via la couche réutilisable
  //    runWorkspaceTransform — même logique que /api/data, tenant forcé. ─────────
  if (outbox.kind === "workflow_step") {
    // operation/record_ref lus ICI (colonnes 041) : sûr, un item workflow_step
    // n'existe que si 041 est appliquée.
    const { data: wfRow } = await db
      .from("agent_outbox")
      .select("operation, params, record_ref")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    const wf = wfRow as { operation: string | null; params: Record<string, unknown> | null; record_ref: { entity?: string | null; id?: string | null } | null } | null;
    const operation = wf?.operation ?? "";
    const sourceId = wf?.record_ref && typeof wf.record_ref === "object" ? String(wf.record_ref.id ?? "") : "";
    if (!sourceId) {
      return NextResponse.json(
        { error: pick(locale, "Action de workflow non applicable.", "Workflow action not applicable.") },
        { status: 400 }
      );
    }
    const wlog = (_a: string, description: string) =>
      logActivity(supabase, { tenantId, userId: user.id, action: "document", entityType: "agent", description });
    let result;
    if (operation === "invoice_from_devis") {
      const p = (wf?.params ?? {}) as { mode?: "acompte" | "situation" | "solde"; pct?: number | null };
      result = await invoiceFromDevis({
        from: (t) => db.from(t),
        tenantId,
        devisId: sourceId,
        mode: p.mode,
        pct: typeof p.pct === "number" ? p.pct : null,
        log: wlog,
      });
    } else if (isTransformAction(operation)) {
      result = await runWorkspaceTransform({ from: (t) => db.from(t), tenantId, action: operation, sourceId, log: wlog });
    } else {
      return NextResponse.json(
        { error: pick(locale, "Action de workflow non applicable.", "Workflow action not applicable.") },
        { status: 400 }
      );
    }
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    await db
      .from("agent_outbox")
      .update({ status: "sent", decided_at: new Date().toISOString(), decided_by: user.id })
      .eq("tenant_id", tenantId)
      .eq("id", id);
    await logActivity(supabase, {
      tenantId,
      userId: user.id,
      action: "document",
      entityType: "agent",
      description: `Action d'agent validée : ${outbox.fiche_label ?? operation}`,
    });
    return NextResponse.json({ ok: true, status: "applied", data: result.data });
  }

  // ── ENVOYER un email ─────────────────────────────────────────────────────────
  if (!outbox.to_email || !outbox.to_email.includes("@")) {
    return NextResponse.json(
      { error: pick(locale, "Destinataire invalide.", "Invalid recipient.") },
      { status: 400 }
    );
  }
  // La relance porte sur un devis ou une facture ? Elle repart AVEC : le PDF de
  // marque en pièce jointe et le lien de consultation. Le message reste celui que
  // l'agent a rédigé. Si la fiche n'est pas commerciale (ou si le PDF échoue), on
  // envoie le texte tel quel — une relance nue vaut mieux qu'une relance bloquée.
  const dressed = await brandAgentEmail({
    db: supabase,
    tenantId,
    userId: user.id,
    ficheId: outbox.fiche_id,
    body: outbox.body ?? "",
    baseUrl: publicBaseUrl(req),
  });

  const sent = await sendOutboundEmail({
    tenantId,
    userId: user.id,
    fromEmail: user.email ?? null,
    to: [outbox.to_email],
    subject: outbox.subject ?? "",
    body: dressed.body,
    html: dressed.html,
    attachments: dressed.attachments,
  });
  if (!sent.ok) {
    // On garde la relance en attente : l'artisan pourra réessayer.
    return NextResponse.json(
      { error: pick(locale, `Envoi refusé : ${sent.reason}`, `Send refused: ${sent.reason}`) },
      { status: 400 }
    );
  }

  await db
    .from("agent_outbox")
    .update({ status: "sent", decided_at: new Date().toISOString(), decided_by: user.id })
    .eq("tenant_id", tenantId)
    .eq("id", id);

  await logActivity(supabase, {
    tenantId,
    userId: user.id,
    action: "send",
    entityType: "agent",
    description: `Relance validée et envoyée à ${outbox.to_email}${outbox.fiche_label ? ` (${outbox.fiche_label})` : ""}`,
  });

  return NextResponse.json({ ok: true, status: "sent", via: sent.via });
}
