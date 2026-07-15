// ─────────────────────────────────────────────────────────────────────────────
// /api/agents/activate-pending — ACTIVER un agent qui n'attendait QU'UNE CONNEXION.
//
// POURQUOI (incident 2026-07-14) : un agent à qui il manque la messagerie ou
// l'agenda est désormais CRÉÉ mais BLOQUÉ (status='blocked',
// blocked_reason='needs_connection'). Le cron n'y touche pas. Dès que l'artisan
// branche le connecteur manquant depuis le chat (pop-up OAuth), le client appelle
// cette route : on REJOUE LE MÊME PREFLIGHT que la création, et si plus rien ne
// manque, l'agent passe Actif tout seul.
//
// Deux raisons de passer par un id plutôt que de rejouer la demande d'origine :
//   1. rejouer créerait un SECOND agent (l'agent existe déjà, il est juste bloqué) ;
//   2. rien ne se perd si l'artisan ferme l'onglet : l'agent l'attend dans /agents,
//      avec ses boutons Connecter.
//
// Sécurité : session + membership actif, agent scopé au tenant, RLS en dernier
// rempart. On ne réveille QUE les agents bloqués sur 'needs_connection' — jamais
// un agent bloqué pour une autre raison (destinataire introuvable, crédits épuisés).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { checkAgentReadiness, summarizeGaps } from "@/lib/agent-readiness";
import {
  computeNextRun,
  PENDING_CONNECTION_REASON,
  type AgentAction,
  type AgentSchedule,
  type AgentTrigger,
} from "@/lib/agent-rules";
import { can } from "@/lib/permissions";
import { connectorsForCapability } from "@/lib/capabilities";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

export async function POST(req: Request) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership)
    return NextResponse.json(
      { error: pick(locale, "Aucun espace de travail.", "No workspace.") },
      { status: 403 }
    );
  if (!can(membership.role, "agents.manage"))
    return NextResponse.json(
      { error: pick(locale, "Vous n'avez pas les droits sur les agents.", "You can't manage agents.") },
      { status: 403 }
    );

  const body = (await req.json().catch(() => ({}))) as { ruleId?: string };
  const ruleId = typeof body.ruleId === "string" ? body.ruleId : "";
  if (!ruleId) return NextResponse.json({ error: "ruleId requis." }, { status: 400 });

  const { data: rule } = await supabase
    .from("agent_rules")
    .select("id, title, trigger_type, trigger, schedule, action, status, blocked_reason")
    .eq("id", ruleId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();

  if (!rule)
    return NextResponse.json(
      { error: pick(locale, "Agent introuvable.", "Agent not found.") },
      { status: 404 }
    );

  // Déjà actif (l'artisan a cliqué deux fois, ou une autre connexion l'a réveillé) :
  // succès idempotent plutôt qu'une erreur incompréhensible.
  if (rule.status === "active")
    return NextResponse.json({
      ok: true,
      activated: true,
      alreadyActive: true,
      message: pick(
        locale,
        `✅ **${rule.title}** est actif. Je m'en occupe.`,
        `✅ **${rule.title}** is active. I'm on it.`
      ),
    });

  // On ne réveille que les agents en attente de CONNEXION. Un agent bloqué parce
  // qu'il lui manque l'email d'un client n'a rien à faire ici : le brancher de
  // force le ferait tourner à vide.
  if (rule.status !== "blocked" || rule.blocked_reason !== PENDING_CONNECTION_REASON)
    return NextResponse.json({
      ok: false,
      activated: false,
      message: pick(
        locale,
        `**${rule.title}** attend autre chose qu'une connexion. Ouvrez **Agents** pour voir ce qu'il lui manque.`,
        `**${rule.title}** is waiting on something other than a connection. Open **Agents** to see what it needs.`
      ),
    });

  // ── LE MÊME PREFLIGHT QUE LA CRÉATION ────────────────────────────────────────
  // Surtout pas une seconde implémentation « allégée » : deux preflights finissent
  // toujours par diverger, et c'est l'agent qui ment à nouveau. On relit le plan
  // depuis ce qui a RÉELLEMENT été enregistré (action + trigger), pas depuis la
  // demande d'origine.
  const action = (rule.action ?? {}) as unknown as AgentAction;
  const trigger = (rule.trigger ?? {}) as unknown as AgentTrigger;
  const readiness = await checkAgentReadiness({
    supabase,
    tenantId: membership.tenant_id,
    userId: user.id,
    userEmail: user.email ?? null,
    plan: {
      actionType: action.type,
      recipientKind: action.recipientKind,
      watcher: rule.trigger_type === "event" ? (trigger.watcher ?? null) : null,
    },
    locale,
  });

  if (!readiness.ok) {
    // Il manque encore quelque chose (l'artisan a connecté Outlook alors que
    // l'agent lit l'agenda, ou a fermé la pop-up avant la fin). On ne ment pas :
    // l'agent reste bloqué et on redonne les cartes.
    const blocking = readiness.gaps.filter((g) => g.severity === "block");
    // On redonne les cartes : sans elles, le chat afficherait « il me manque X »
    // sans aucun moyen de le brancher.
    const connectors = [...new Set(blocking.flatMap((g) => connectorsForCapability(g.code)))];
    return NextResponse.json({
      ok: false,
      activated: false,
      gaps: readiness.gaps,
      ...(connectors.length ? { connectors } : {}),
      message: pick(
        locale,
        `Il me manque encore : **${summarizeGaps(blocking)}**. Je n'active pas **${rule.title}** tant que je ne peux pas vraiment travailler.`,
        `I'm still missing: **${summarizeGaps(blocking)}**. I won't activate **${rule.title}** until I can actually do the work.`
      ),
    });
  }

  // Plus rien ne manque → l'agent se met au travail. Un agent événementiel est
  // évalué au prochain tick (≤ 5 min) ; un agent planifié reprend son horaire.
  const nextRun =
    rule.trigger_type === "event"
      ? new Date()
      : computeNextRun((rule.schedule ?? {}) as unknown as AgentSchedule);

  const { error } = await supabase
    .from("agent_rules")
    .update({
      status: "active",
      blocked_reason: null,
      next_run_at: nextRun ? nextRun.toISOString() : null,
    })
    .eq("id", rule.id)
    .eq("tenant_id", membership.tenant_id);

  if (error)
    return NextResponse.json(
      { error: pick(locale, "Activation impossible pour le moment.", "Couldn't activate right now.") },
      { status: 500 }
    );

  const warn = readiness.gaps.length ? ` (${summarizeGaps(readiness.gaps)} : il tournera quand même)` : "";
  return NextResponse.json({
    ok: true,
    activated: true,
    gaps: readiness.gaps,
    message: pick(
      locale,
      `✅ Connecté. **${rule.title}** est activé${warn}. Je m'en occupe.`,
      `✅ Connected. **${rule.title}** is now active${warn}. I'm on it.`
    ),
  });
}
