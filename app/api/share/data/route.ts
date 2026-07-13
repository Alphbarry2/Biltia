// ─────────────────────────────────────────────────────────────────────────────
// /api/share/data — LECTURE tokenisée d'un portail client (slice 2).
//
// Endpoint PUBLIC (visiteur anonyme muni d'un token de lien 'client'). Il sert
// UNIQUEMENT, en LECTURE SEULE :
//   • le chantier racine du scope (scope.record_id) ;
//   • les enfants directs de ce chantier (rattachés par chantier_id).
// Tout le reste est hors périmètre et renvoyé VIDE — jamais divulgué.
//
// Zero-trust : on ne fait JAMAIS confiance à l'`entity`/`id`/`tenant` demandés
// par le client au-delà de leur intersection avec le scope du token. tenant_id
// et le filtre de rattachement sont FORCÉS côté serveur. Accès via service_role
// (la table app_share_links est deny-all pour anon) : le token EST la capacité.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase-admin";
import { isShareToken, isLinkLive, resolveClientScope, CLIENT_CHILD_ENTITIES, clientReadableColumns } from "@/lib/share";
import { ENTITIES } from "@/lib/data-entities";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// app_share_links + tables métier atteintes par nom dynamique → client non typé.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

const CHILD = new Set<string>(CLIENT_CHILD_ENTITIES);

export async function POST(req: Request) {
  const locale = await getLocale();
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    entity?: string;
    action?: string;
    id?: string;
  };

  const action = body.action === "get" ? "get" : "list";
  // Réponse « vide » neutre : ne révèle jamais si un token/enregistrement existe.
  const empty = action === "get" ? { data: null } : { data: [] };

  const token = body.token;
  if (!token || !isShareToken(token)) return Response.json(empty);

  // Limite de débit par token (un token scrappé ne peut pas être martelé).
  const limited = await enforceRateLimit("share_read", token, LIMITS.share_read);
  if (limited) return limited;

  const admin = createAdminClient();
  if (!admin) {
    return Response.json(
      { error: pick(locale, "Service indisponible.", "Service unavailable.") },
      { status: 503 }
    );
  }
  const db = admin as unknown as LooseClient;

  // 1) Résout le token → lien vivant, de type 'client', avec un scope valide.
  const { data: link } = await db
    .from("app_share_links")
    .select("kind, scope, tenant_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!link || !isLinkLive(link, Date.now()) || link.kind !== "client") return Response.json(empty);

  const scope = resolveClientScope(link.scope);
  if (!scope) return Response.json(empty);

  // 2) Écriture interdite : ce lien est en lecture seule (défense en profondeur ;
  //    le bridge côté page bloque déjà tout ce qui n'est pas list/get).
  if (body.action && body.action !== "list" && body.action !== "get") {
    return Response.json(
      { error: pick(locale, "Ce lien est en lecture seule.", "This link is read-only.") },
      { status: 403 }
    );
  }

  // 3) Périmètre : seul le chantier racine + ses enfants directs sont lisibles.
  const entity = typeof body.entity === "string" ? body.entity : "";
  const def = ENTITIES[entity];
  const isRoot = entity === scope.entity; // 'chantiers'
  const isChild = CHILD.has(entity);
  if (!def || (!isRoot && !isChild)) return Response.json(empty); // hors périmètre → vide

  const table = def.table;
  const tid = link.tenant_id as string;
  // Projection stricte client-safe (jamais `*` → pas de fuite budget/marge/notes).
  const cols = clientReadableColumns(entity);

  // Racine : UNIQUEMENT le chantier scopé (jamais un autre id).
  if (isRoot) {
    if (action === "get") {
      if (body.id && body.id !== scope.record_id) return Response.json({ data: null });
      const { data } = await db.from(table).select(cols).eq("tenant_id", tid).eq("id", scope.record_id).maybeSingle();
      return Response.json({ data: data ?? null });
    }
    const { data } = await db.from(table).select(cols).eq("tenant_id", tid).eq("id", scope.record_id);
    return Response.json({ data: data ?? [] });
  }

  // Enfant : UNIQUEMENT les lignes rattachées au chantier scopé.
  if (action === "get") {
    const { data } = await db
      .from(table)
      .select(cols)
      .eq("tenant_id", tid)
      .eq("chantier_id", scope.record_id)
      .eq("id", body.id ?? "")
      .maybeSingle();
    return Response.json({ data: data ?? null });
  }
  const { data } = await db
    .from(table)
    .select(cols)
    .eq("tenant_id", tid)
    .eq("chantier_id", scope.record_id);
  return Response.json({ data: data ?? [] });
}
