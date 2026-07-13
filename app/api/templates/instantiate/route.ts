// ─────────────────────────────────────────────────────────────────────────────
// /api/templates/instantiate — « un clic = une vraie app ».
//
// Crée une application PHARE (lib/flagship-apps.ts) directement dans le workspace
// de l'utilisateur : HTML branché window.biltia (SDK injecté), nom d'entreprise
// substitué, ligne `modules` insérée via le client de session (RLS = seuls
// Manager/Admin/Propriétaire peuvent créer, tenant isolé). Renvoie { id, slug }
// pour que le client ouvre /apps/[id]. Aucun passage par le LLM.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { getEntitlementsForTenant, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getFlagshipApp, renderFlagshipHtml, getImportTarget, flagshipName, flagshipDescription } from "@/lib/flagship-apps";
import { injectBiltiaSDK } from "@/lib/biltia-sdk";
import { slugify, shortId } from "@/lib/slug";
import { normalizeClientScope, scopeWantsImport, type StoredScope } from "@/lib/data-scope";
import { mapImportedRows } from "@/lib/import-map";
import { ENTITIES } from "@/lib/data-entities";
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
      return Response.json({ error: pick(locale, "Authentification requise.", "Authentication required.") }, { status: 401 });
    }

    const limited = await enforceRateLimit("generate", user.id, LIMITS.generate);
    if (limited) return limited;

    let body: { templateId?: string; dataScope?: unknown; importRows?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: pick(locale, "Requête invalide.", "Invalid request.") }, { status: 400 });
    }

    const app = getFlagshipApp(String(body.templateId || ""));
    if (!app || !app.ready) {
      // Modèle inconnu OU pas encore finalisé au standard → le client retombe
      // proprement sur l'aperçu adaptable (maquette premium).
      return Response.json({ error: pick(locale, "Modèle inconnu.", "Unknown template.") }, { status: 404 });
    }

    const membership = await getActiveMembershipServer(supabase, user.id);
    if (!membership) {
      return Response.json({ error: pick(locale, "Aucun espace de travail trouvé.", "No workspace found.") }, { status: 403 });
    }
    const tenantId = membership.tenant_id;

    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) {
      return Response.json({ error: frozenMessage(locale), frozen: true }, { status: 403 });
    }

    // Nom d'entreprise réel pour l'en-tête et les emails générés par l'app.
    const { data: tenant } = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    const entreprise = tenant?.name || pick(locale, "Mon entreprise", "My company");

    const appName = flagshipName(app, locale);
    const html = injectBiltiaSDK(renderFlagshipHtml(app, entreprise, locale));
    const slug = `${slugify(appName)}-${shortId()}`;

    const { data: row, error } = await supabase
      .from("modules")
      .insert({
        user_id: user.id,
        tenant_id: tenantId,
        created_by: user.id,
        name: appName,
        description: flagshipDescription(app, locale),
        html_content: html,
        format: app.format,
        kind: "app",
        slug,
        is_public: false,
      })
      .select("id, slug, created_at")
      .single();

    if (error || !row) {
      // RLS : un rôle Employé/Lecture seule n'a pas le droit de créer.
      return Response.json(
        {
          error:
            error?.message ??
            pick(
              locale,
              "Création impossible. Seuls les rôles Manager, Admin et Propriétaire peuvent créer une application.",
              "Cannot create. Only the Manager, Admin and Owner roles can create an app.",
            ),
        },
        { status: 403 }
      );
    }

    // ── IMPORT (mode « Importer un fichier ») ── on insère les lignes du fichier
    // dans l'entité principale de l'app (workspace = source unique). Elles sont
    // créées APRÈS le module → leur created_at ≥ celui du module → visibles sous
    // la portée « fresh ». Best-effort : un échec d'import ne casse pas l'app.
    let imported = 0;
    const wantsImport = scopeWantsImport(body.dataScope);
    if (wantsImport && Array.isArray(body.importRows) && body.importRows.length) {
      const target = getImportTarget(app.id);
      if (target && ENTITIES[target]) {
        try {
          const { rows } = mapImportedRows(target, body.importRows);
          if (rows.length) {
            const payload = rows.map((r) => ({ ...r, tenant_id: tenantId, created_by: user.id }));
            // Table dynamique (nom validé via ENTITIES) → cast contrôlé du client typé.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: ins } = await (supabase.from as any)(ENTITIES[target].table).insert(payload).select("id");
            imported = ins?.length ?? 0;
          }
        } catch {
          // import ignoré → l'app s'ouvre quand même (vide), l'utilisateur pourra réimporter.
        }
      }
    }

    // ── PORTÉE DES DONNÉES ── stockée sur le module ; /api/data l'applique en
    // lecture. « fresh » (vierge/import) = depuis le démarrage (created_at du
    // module) ; « select » = ids choisis ; « all »/null = tout le workspace.
    const norm = normalizeClientScope(body.dataScope);
    let stored: StoredScope | null = null;
    if (norm?.mode === "fresh") stored = { mode: "fresh", since: String(row.created_at) };
    else if (norm?.mode === "select") stored = { mode: "select", records: norm.records };
    if (stored) {
      // data_scope (migration 028) pas encore dans les types générés → cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("modules") as any).update({ data_scope: stored }).eq("id", row.id).eq("tenant_id", tenantId);
    }

    return Response.json({ id: row.id, slug: row.slug, imported });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : pick(locale, "Erreur serveur.", "Server error.") },
      { status: 500 }
    );
  }
}
