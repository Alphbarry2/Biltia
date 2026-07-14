// ─────────────────────────────────────────────────────────────────────────────
// /api/modules/save — CHEMIN D'ÉCRITURE AUTORITAIRE d'une application (Phase 0).
//
// Avant : la persistance des `modules` se faisait entièrement côté client (RLS
// seule). Résultat : aucune version enregistrée, aucun garde-fou possible, une
// modification pouvait écraser une app sans filet. Ce endpoint devient le SEUL
// point d'écriture serveur : il vérifie tenant + RBAC + gel, applique le garde-fou
// anti-réécriture destructive (4.4), enregistre une version à CHAQUE étape (4.1),
// incrémente `modules.version` (4.2), puis journalise.
//
// Sécurité : la ligne `modules` est écrite avec le client de SESSION (RLS = mêmes
// remparts qu'aujourd'hui). L'historique `module_versions` est écrit avec le
// client ADMIN (la table n'a pas encore de policy en prod) — tenant TOUJOURS
// vérifié en amont. Si l'admin manque, l'historique est sauté, jamais la sauvegarde.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { can } from "@/lib/permissions";
import { getEntitlementsForTenant, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";
import { logActivity } from "@/lib/activity";
import { slugify, shortId } from "@/lib/slug";
import {
  snapshotModuleVersion,
  hasVersions,
  assessRewriteRisk,
  type ModuleChangeType,
} from "@/lib/module-versions";
import {
  deriveAppSpecFromHtml,
  coerceDeclaredIntent,
  intentFromStored,
  composeAppSpec,
  asStoredAppSpec,
  type AppSpecV1,
} from "@/lib/app-spec";
import { applyAppSpecPatch, diffToPatch } from "@/lib/app-spec-patch";
import { registerCustomEntities, coerceEntityDefinition, type CustomEntityDefinition } from "@/lib/custom-entities";

// Extrait les définitions d'entités custom DÉCLARÉES par le modèle (bloc spec).
function declaredCustomEntities(appSpec: unknown): CustomEntityDefinition[] {
  if (!appSpec || typeof appSpec !== "object") return [];
  const raw = (appSpec as Record<string, unknown>).customEntities;
  if (!Array.isArray(raw)) return [];
  const out: CustomEntityDefinition[] = [];
  for (const c of raw.slice(0, 20)) {
    const def = coerceEntityDefinition(c);
    if (def) out.push(def);
  }
  return out;
}

// Écrit app_spec en BEST-EFFORT : tant que la colonne 043 n'existe pas en prod,
// l'update échoue proprement (error renvoyée, non lancée) et on l'ignore — la
// sauvegarde du module a déjà réussi. S'active tout seul une fois 043 appliquée.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function persistAppSpec(from: (t: string) => any, moduleId: string, tenantId: string, spec: AppSpecV1) {
  try {
    await from("modules").update({ app_spec: spec }).eq("id", moduleId).eq("tenant_id", tenantId);
  } catch {
    /* colonne absente ou autre → best-effort, jamais bloquant */
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadStoredSpec(from: (t: string) => any, moduleId: string, tenantId: string): Promise<unknown | null> {
  try {
    const { data, error } = await from("modules")
      .select("app_spec")
      .eq("id", moduleId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !data) return null;
    return data.app_spec ?? null;
  } catch {
    return null;
  }
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

const CHANGE_TYPES: ModuleChangeType[] = [
  "create",
  "patch",
  "full_rewrite",
  "rollback",
  "manual_edit",
  "autofix",
];

export async function POST(req: Request) {
  const locale = await getLocale();

  if (!sameOrigin(req)) {
    return NextResponse.json({ error: pick(locale, "Origine non autorisée.", "Origin not allowed.") }, { status: 403 });
  }

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
    return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });
  const tenantId = membership.tenant_id;

  // RBAC : enregistrer une app = capacité de création IA (owner/admin/manager/member).
  // Le RLS de `modules` reste l'autorité finale sur l'écriture.
  if (!can(membership.role, "ai.create")) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Votre rôle ne permet pas d'enregistrer des applications.",
          "Your role does not allow saving applications."
        ),
      },
      { status: 403 }
    );
  }

  // Gel lecture seule : abonnement expiré → aucune écriture.
  const ent = await getEntitlementsForTenant(supabase, tenantId);
  if (!ent.writable) {
    return NextResponse.json({ error: frozenMessage(locale, ent), frozen: true }, { status: 403 });
  }

  let body: {
    moduleId?: string;
    name?: string;
    html?: string;
    description?: string;
    format?: string;
    kind?: string;
    sourcePrompt?: string;
    changeType?: string;
    confirmDestructive?: boolean;
    appSpec?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }

  const html = typeof body.html === "string" ? body.html : "";
  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  const name = rawName || "Application";
  const hasDescription = typeof body.description === "string";
  const description = hasDescription ? (body.description as string) : "";
  const hasFormat = typeof body.format === "string";
  const format = hasFormat ? (body.format as string) : "auto";
  const hasKind = typeof body.kind === "string";
  const dbKind = body.kind === "document" ? "document" : "app";
  const moduleId = typeof body.moduleId === "string" && body.moduleId ? body.moduleId : null;
  const changeType: ModuleChangeType =
    CHANGE_TYPES.includes(body.changeType as ModuleChangeType)
      ? (body.changeType as ModuleChangeType)
      : moduleId
        ? "full_rewrite"
        : "create";

  if (html.length < 40) {
    return NextResponse.json({ error: pick(locale, "Contenu vide.", "Empty content.") }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (t: string) => (supabase.from as any)(t);
  const admin = createAdminClient();

  // ── MISE À JOUR d'une app existante ────────────────────────────────────────
  if (moduleId) {
    const { data: existing, error: loadErr } = await from("modules")
      .select("id, tenant_id, html_content, version, name, created_by")
      .eq("id", moduleId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 400 });
    if (!existing)
      return NextResponse.json(
        { error: pick(locale, "Application introuvable.", "Application not found.") },
        { status: 404 }
      );

    const oldHtml = typeof existing.html_content === "string" ? existing.html_content : "";
    const oldVersion = Number(existing.version) || 1;

    // ── GARDE-FOU 4.4 : bloquer une réécriture destructive non confirmée ──────
    // On l'applique aux modifications RISQUÉES (réécriture / édition manuelle),
    // jamais à l'auto-fix (correction automatique d'un bug, ne doit pas se bloquer).
    const runGuardrail = changeType !== "autofix" && changeType !== "create";
    if (runGuardrail && oldHtml) {
      const risk = assessRewriteRisk(oldHtml, html);
      if (risk.risk === "high" && body.confirmDestructive !== true) {
        return NextResponse.json(
          {
            needsConfirmation: true,
            losses: risk.losses,
            message: pick(
              locale,
              "Cette mise à jour supprimerait des éléments importants de l'application. Elle n'a pas été appliquée.",
              "This update would remove important parts of the application. It was not applied."
            ),
          },
          { status: 409 }
        );
      }
    }

    // Legacy : aucune version encore → on fige d'abord l'ÉTAT ACTUEL comme
    // ligne de base (cible de rollback), avant d'écrire la nouvelle version.
    if (admin && oldHtml && !(await hasVersions(admin, moduleId))) {
      await snapshotModuleVersion(admin, {
        moduleId,
        tenantId,
        userId: existing.created_by ?? user.id,
        version: oldVersion,
        html: oldHtml,
        changeType: "manual_edit",
        changeDescription: "État initial (avant historisation)",
      });
    }

    const newVersion = oldVersion + 1;
    // On ne met à jour QUE les champs fournis (un auto-fix silencieux n'envoie que
    // le HTML → il ne doit jamais écraser le nom/la description de l'app).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = {
      html_content: html,
      version: newVersion,
      updated_at: new Date().toISOString(),
    };
    if (rawName) patch.name = rawName;
    if (hasDescription) patch.description = description;
    if (hasFormat) patch.format = format;
    if (hasKind) patch.kind = dbKind;
    const { error: upErr } = await from("modules")
      .update(patch)
      .eq("id", moduleId)
      .eq("tenant_id", tenantId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    await snapshotModuleVersion(admin, {
      moduleId,
      tenantId,
      userId: user.id,
      version: newVersion,
      html,
      sourcePrompt: body.sourcePrompt ?? null,
      changeDescription: description || body.sourcePrompt || null,
      changeType,
    });

    const effName = rawName || existing.name || "Application";
    await logActivity(supabase, {
      tenantId,
      userId: user.id,
      action: "update",
      entityType: dbKind === "document" ? "document" : "application",
      entityId: moduleId,
      description: `« ${effName} » mis à jour (v${newVersion})`,
    });

    // AppSpec (Phase 1 + A2) : structure DÉRIVÉE du nouveau HTML.
    const derivedU = deriveAppSpecFromHtml(html, { name: effName, description });
    const storedRaw = await loadStoredSpec(from, moduleId, tenantId);
    const storedSpec = asStoredAppSpec(storedRaw);
    let composedU: AppSpecV1;
    if (storedSpec) {
      // A2 : on met à jour la spec STOCKÉE par PATCH (diffToPatch → applyAppSpecPatch).
      // Toute son intention (purpose, permissions, suggestedAutomations, vues
      // déclarées inchangées…) est PRÉSERVÉE ; seuls les changements structurels
      // (vues/actions/bindings ajoutés/retirés) sont appliqués.
      composedU = applyAppSpecPatch(storedSpec, diffToPatch(storedSpec, derivedU));
      composedU.name = effName;
      composedU.description = description || composedU.description;
      composedU.dataMode = derivedU.dataMode;
      const intentU = coerceDeclaredIntent(body.appSpec); // rare en modif, mais honoré
      if (intentU.purpose) composedU.purpose = intentU.purpose;
      if (intentU.suggestedAutomations) composedU.suggestedAutomations = intentU.suggestedAutomations;
      if (intentU.permissions) composedU.permissions = intentU.permissions;
      composedU.metadata = { ...(composedU.metadata ?? {}), source: "patched" };
    } else {
      // Legacy (aucune spec stockée) : composition classique (dérivé + intention).
      const intentU = coerceDeclaredIntent(body.appSpec);
      const carried = Object.keys(intentU).length ? intentU : intentFromStored(storedRaw);
      const src = Object.keys(intentU).length ? "llm" : Object.keys(carried).length ? "carried" : "derived";
      composedU = composeAppSpec(derivedU, carried, src);
    }
    // Agents rattachés à cette app (Phase 6) → référencés dans la spec.
    if (admin) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rules } = await (admin.from as any)("agent_rules")
          .select("id")
          .eq("tenant_id", tenantId)
          .contains("meta", { source_module_id: moduleId })
          .limit(200);
        composedU.attachedRuleIds = (rules ?? []).map((r: { id: string }) => r.id);
      } catch {
        /* best-effort */
      }
    }
    await persistAppSpec(from, moduleId, tenantId, composedU);

    // Entités personnalisées (Phase 3) : enregistre/déduplique les définitions
    // déclarées + les collections libres détectées. Best-effort (jamais bloquant).
    await registerCustomEntities(
      admin,
      tenantId,
      user.id,
      declaredCustomEntities(body.appSpec),
      derivedU.customEntities.map((c) => c.key)
    );

    return NextResponse.json({ ok: true, moduleId, version: newVersion });
  }

  // ── CRÉATION d'une nouvelle app ────────────────────────────────────────────
  const newSlug = `${slugify(name)}-${shortId()}`;
  const { data: row, error: insErr } = await from("modules")
    .insert({
      user_id: user.id,
      tenant_id: tenantId,
      created_by: user.id,
      name,
      description,
      html_content: html,
      format,
      kind: dbKind,
      slug: newSlug,
      is_public: false,
      version: 1,
    })
    .select("id, slug, created_at")
    .single();
  if (insErr || !row) {
    return NextResponse.json(
      { error: insErr?.message ?? pick(locale, "Enregistrement impossible.", "Unable to save.") },
      { status: 400 }
    );
  }

  await snapshotModuleVersion(admin, {
    moduleId: row.id,
    tenantId,
    userId: user.id,
    version: 1,
    html,
    sourcePrompt: body.sourcePrompt ?? null,
    changeDescription: description || null,
    changeType: "create",
  });

  await logActivity(supabase, {
    tenantId,
    userId: user.id,
    action: "create",
    entityType: dbKind === "document" ? "document" : "application",
    entityId: row.id,
    description: `« ${name} » enregistré (v1)`,
  });

  // AppSpec (Phase 1) : structure dérivée du HTML + intention déclarée à la création.
  const declaredC = coerceDeclaredIntent(body.appSpec);
  const derivedC = deriveAppSpecFromHtml(html, { name, description });
  const specC = composeAppSpec(derivedC, declaredC, Object.keys(declaredC).length ? "llm" : "derived");
  await persistAppSpec(from, row.id, tenantId, specC);

  // Entités personnalisées (Phase 3) : enregistre/déduplique les définitions.
  await registerCustomEntities(
    admin,
    tenantId,
    user.id,
    declaredCustomEntities(body.appSpec),
    derivedC.customEntities.map((c) => c.key)
  );

  return NextResponse.json({
    ok: true,
    moduleId: row.id,
    slug: row.slug,
    createdAt: row.created_at,
    version: 1,
  });
}
