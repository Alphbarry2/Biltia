// ─────────────────────────────────────────────────────────────────────────────
// /api/agents/activate — ACTIVER UN AGENT PRÊT À L'EMPLOI (template).
//
// POST { templateId } : active un agent DÉJÀ CONFIGURÉ (lib/agent-templates.ts)
// en écrivant directement la règle exécutable (aucun passage LLM). L'agent se met
// au travail au prochain tick du cron ; le crédit est prélevé PAR PASSAGE, à son
// coût réel (agent-executor). Idempotent : ré-activer le même modèle renvoie
// l'agent existant plutôt que d'en créer un doublon.
//
// Sécurité (motif /api/agents) : session + membership actif, RBAC agents.manage
// (owner / admin / manager), gel lecture seule respecté, tenant forcé + RLS.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { getEntitlementsForTenant, canUseAgentActions, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { can } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { activateAgentTemplate } from "@/lib/agent-rules";
import { getAgentTemplate, localizeAgentTemplate } from "@/lib/agent-templates";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

export async function POST(req: Request) {
  const supabase = await createClient();
  const locale = await getLocale();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: pick(locale, "Authentification requise.", "Authentication required.") }, { status: 401 });

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership) return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace found.") }, { status: 403 });

  // RBAC : activer un agent autonome = même droit que le recrutement.
  if (!can(membership.role, "agents.manage")) {
    return NextResponse.json(
      { error: pick(locale, "Seuls le propriétaire, un administrateur ou un chef d'équipe peuvent activer un agent.", "Only the owner, an admin or a team lead can activate an agent.") },
      { status: 403 }
    );
  }

  // Gel lecture seule : activer un agent est une écriture.
  const ent = await getEntitlementsForTenant(supabase, membership.tenant_id);
  if (!ent.writable) {
    return NextResponse.json({ error: frozenMessage(locale, ent), frozen: true }, { status: 403 });
  }

  let body: { templateId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: pick(locale, "Corps de requête invalide.", "Invalid request body.") }, { status: 400 });
  }

  const baseTemplate = getAgentTemplate(String(body.templateId || ""));
  if (!baseTemplate) {
    return NextResponse.json({ error: pick(locale, "Modèle d'agent inconnu.", "Unknown agent template.") }, { status: 404 });
  }
  // Titre + mission traduits si l'interface est en anglais (la règle écrite,
  // donc l'agent, seront en anglais). value/watcher/icon inchangés.
  const template = localizeAgentTemplate(baseTemplate, locale);

  // Plan : les agents qui AGISSENT (template payant : relance, compte-rendu,
  // rapport) sont réservés à Pro. Les alertes gratuites (template.free) restent
  // activables en Free — « le Free goûte, le Pro exécute ». Fondateur exempté.
  if (!template.free && !canUseAgentActions(ent) && !isFounderEmail(user.email)) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          `« ${template.name} » agit à votre place : c'est un agent Pro. Sur le plan Gratuit vous activez les alertes gratuites ; passez à Pro pour les agents qui exécutent.`,
          `“${template.name}” acts on your behalf: it's a Pro agent. On the Free plan you can activate the free alerts; upgrade to Pro for agents that take action.`,
        ),
        upgrade: true,
      },
      { status: 403 }
    );
  }

  // Plan ÉQUIPE : un template qui envoie le planning aux ÉQUIPES (collaboration)
  // est réservé au plan Équipe. Les agents solo (relance, compte-rendu, tréso)
  // restent au plan Pro. Fondateur exempté.
  if (template.scheduleAction === "team_planning" && !ent.collaboration && !isFounderEmail(user.email)) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          `« ${template.name} » travaille avec votre équipe : c'est un agent du plan Équipe. Ajoutez la collaboration (+50 €/mois) dans Paramètres → Facturation pour l'activer.`,
          `“${template.name}” works with your team: it's a Team-plan agent. Add collaboration (+€50/month) in Settings → Billing to activate it.`,
        ),
        upgrade: true,
      },
      { status: 403 }
    );
  }

  const result = await activateAgentTemplate({
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
    tenantId: membership.tenant_id,
    template,
    locale,
  });

  if (result.ok && !result.alreadyActive) {
    await logActivity(supabase, {
      tenantId: membership.tenant_id,
      userId: user.id,
      action: "create",
      entityType: "agent",
      description: `Agent activé depuis un modèle : « ${template.name} »`,
      entityId: result.ruleId,
    });
  }

  return NextResponse.json(
    {
      ok: result.ok,
      ruleId: result.ruleId,
      alreadyActive: result.alreadyActive ?? false,
      blocked: result.blocked ?? false,
      // Manques de capacité (preflight) : bloquants si !ok, sinon recommandations.
      gaps: result.gaps ?? [],
      message: result.message,
    },
    // Un manque de capacité n'est pas une erreur serveur : 200 avec ok:false, pour
    // que l'UI ouvre la pop-up « il manque X » plutôt qu'un message d'échec.
    { status: result.ok || (result.gaps && result.gaps.length) ? 200 : 400 }
  );
}
