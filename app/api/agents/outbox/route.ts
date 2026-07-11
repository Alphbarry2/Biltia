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
import { getEntitlementsForTenant, FROZEN_MESSAGE } from "@/lib/entitlements";
import { sendOutboundEmail } from "@/lib/outbound-email";
import { logActivity } from "@/lib/activity";
import { can } from "@/lib/permissions";

// agent_outbox : table récente (035) → cast souple le temps des types générés.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (t: string) => any };

type OutboxRow = {
  id: string;
  tenant_id: string;
  status: string;
  to_email: string;
  subject: string;
  body: string;
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
  const { supabase, user, membership } = await resolveSession();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Aucun espace de travail." }, { status: 403 });

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
  const { supabase, user, membership } = await resolveSession();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Aucun espace de travail." }, { status: 403 });
  const tenantId = membership.tenant_id;

  // RBAC : valider/ignorer une relance = piloter un agent (owner / admin / manager).
  if (!can(membership.role, "agents.manage")) {
    return NextResponse.json(
      { error: "Seuls le propriétaire, un administrateur ou un chef d'équipe peuvent valider une relance." },
      { status: 403 }
    );
  }

  // Gel lecture seule : envoyer un email est une écriture sortante.
  const ent = await getEntitlementsForTenant(supabase, tenantId);
  if (!ent.writable) {
    return NextResponse.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
  }

  let body: { id?: string; decision?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const decision = body.decision === "send" || body.decision === "discard" ? body.decision : "";
  if (!id || !decision) {
    return NextResponse.json({ error: "« id » et « decision » (send|discard) requis." }, { status: 400 });
  }

  const db = supabase as unknown as LooseClient;

  // La relance DOIT appartenir au tenant actif (RLS + filtre explicite) et être
  // encore en attente (évite un double envoi si deux onglets décident en parallèle).
  const { data: row } = await db
    .from("agent_outbox")
    .select("id, tenant_id, status, to_email, subject, body, fiche_label, level")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  const outbox = row as OutboxRow | null;
  if (!outbox) return NextResponse.json({ error: "Relance introuvable." }, { status: 404 });
  if (outbox.status !== "pending") {
    return NextResponse.json({ error: "Cette relance a déjà été traitée." }, { status: 409 });
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

  // ── ENVOYER ──────────────────────────────────────────────────────────────────
  if (!outbox.to_email || !outbox.to_email.includes("@")) {
    return NextResponse.json({ error: "Destinataire invalide." }, { status: 400 });
  }
  const sent = await sendOutboundEmail({
    tenantId,
    userId: user.id,
    fromEmail: user.email ?? null,
    to: [outbox.to_email],
    subject: outbox.subject,
    body: outbox.body,
  });
  if (!sent.ok) {
    // On garde la relance en attente : l'artisan pourra réessayer.
    return NextResponse.json({ error: `Envoi refusé : ${sent.reason}` }, { status: 400 });
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
