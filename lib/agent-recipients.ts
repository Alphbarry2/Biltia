// ─────────────────────────────────────────────────────────────────────────────
// AGENT RECIPIENTS — résolution RELATIONNELLE des destinataires (Phase 3).
//
// Un agent V2 ne vise plus seulement « moi / l'équipe / un client nommé » : il
// vise LE destinataire lié à la FICHE déclenchante — « le chef de CE chantier »,
// « l'intervenant affecté à CETTE intervention », « le client de CETTE facture ».
// Ce module résout ces types À L'EXÉCUTION, à partir de la fiche (entité + champs),
// en marchant les clés étrangères (chantier_id → chantiers.chef_chantier_id →
// employees.email…), tenant-scopé, avec CHAÎNE DE REPLI (« sinon le patron »).
//
// STRICTEMENT CÔTÉ SERVEUR (service_role). Ne throw jamais : une résolution qui
// échoue renvoie null (→ repli, sinon destinataire abandonné). Un destinataire
// SANS email valide est traité comme non résolu (→ repli) : on ne prépare jamais
// un envoi sans canal.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecipientResolver } from "./agent-model";

export type ResolvedRecipient = { type: string; id?: string; name: string; email: string };

/** Contexte de la fiche déclenchante (entité + id + champs enrichis du match). */
export type RecordContext = { entity?: string | null; id?: string | null; fields?: Record<string, unknown> };

export type ResolveCtx = { creatorEmail?: string | null; record?: RecordContext };

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function validEmail(e: unknown): e is string {
  return typeof e === "string" && e.includes("@");
}

// ── Chargeurs tenant-scopés (renvoient un destinataire VALIDE ou null) ───────

async function clientRecipient(admin: SupabaseClient, tenant: string, id: string): Promise<ResolvedRecipient | null> {
  const { data } = await admin.from("clients").select("nom, email").eq("tenant_id", tenant).eq("id", id).maybeSingle();
  const r = data as { nom: string | null; email: string | null } | null;
  return r && validEmail(r.email) ? { type: "related_client", id, name: r.nom ?? "client", email: r.email } : null;
}

async function supplierRecipient(admin: SupabaseClient, tenant: string, id: string): Promise<ResolvedRecipient | null> {
  const { data } = await admin.from("suppliers").select("nom, email").eq("tenant_id", tenant).eq("id", id).maybeSingle();
  const r = data as { nom: string | null; email: string | null } | null;
  return r && validEmail(r.email) ? { type: "related_supplier", id, name: r.nom ?? "fournisseur", email: r.email } : null;
}

async function employeeRecipient(admin: SupabaseClient, tenant: string, id: string, type = "related_employee"): Promise<ResolvedRecipient | null> {
  const { data } = await admin.from("employees").select("nom, prenom, email").eq("tenant_id", tenant).eq("id", id).maybeSingle();
  const r = data as { nom: string | null; prenom: string | null; email: string | null } | null;
  if (!r || !validEmail(r.email)) return null;
  const name = [r.prenom, r.nom].filter(Boolean).join(" ").trim() || (r.nom ?? "intervenant");
  return { type, id, name, email: r.email };
}

/** Chef d'un chantier : chantiers.chef_chantier_id → employees. Deux sauts. */
async function chantierChefRecipient(admin: SupabaseClient, tenant: string, chantierId: string): Promise<ResolvedRecipient | null> {
  const { data } = await admin.from("chantiers").select("chef_chantier_id").eq("tenant_id", tenant).eq("id", chantierId).maybeSingle();
  const chefId = str((data as { chef_chantier_id: string | null } | null)?.chef_chantier_id);
  if (!chefId) return null;
  return employeeRecipient(admin, tenant, chefId, "related_chantier_manager");
}

async function ownerFromUser(admin: SupabaseClient, userId: string): Promise<ResolvedRecipient | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const email = data.user?.email ?? null;
    return validEmail(email) ? { type: "record_creator", id: userId, name: "créateur", email } : null;
  } catch {
    return null;
  }
}

// ── Résolution d'UN resolver (avec repli récursif) ───────────────────────────

async function resolveOne(admin: SupabaseClient, tenant: string, r: RecipientResolver, ctx: ResolveCtx, depth = 0): Promise<ResolvedRecipient | null> {
  if (depth > 5) return null; // garde-fou anti-boucle de fallback
  const f = ctx.record?.fields ?? {};
  const entity = ctx.record?.entity ?? null;
  const recId = ctx.record?.id ?? null;

  let res: ResolvedRecipient | null = null;
  switch (r.type) {
    case "custom_email":
      res = validEmail(r.customEmail) ? { type: "custom_email", name: r.name ?? r.customEmail!, email: r.customEmail! } : null;
      break;
    case "workspace_owner":
    case "me":
      res = validEmail(ctx.creatorEmail) ? { type: "workspace_owner", name: "vous", email: ctx.creatorEmail } : null;
      break;
    case "record_creator": {
      const uid = str(f.created_by);
      res = uid ? await ownerFromUser(admin, uid) : null;
      break;
    }
    case "related_client":
    case "client": {
      const id = entity === "clients" ? str(recId) : str(f.client_id);
      res = id ? await clientRecipient(admin, tenant, id) : null;
      break;
    }
    case "related_supplier":
    case "related_subcontractor":
    case "supplier": {
      const id = entity === "suppliers" ? str(recId) : str(f.supplier_id) || str(f.fournisseur_id);
      res = id ? await supplierRecipient(admin, tenant, id) : null;
      break;
    }
    case "related_chantier_manager": {
      const chId = entity === "chantiers" ? str(recId) : str(f.chantier_id);
      res = chId ? await chantierChefRecipient(admin, tenant, chId) : null;
      break;
    }
    case "related_task_assignee": {
      const id = str(f.assignee_id);
      res = id ? await employeeRecipient(admin, tenant, id, "related_task_assignee") : null;
      break;
    }
    case "related_intervention_employee": {
      const id = str(f.employee_id);
      res = id ? await employeeRecipient(admin, tenant, id, "related_intervention_employee") : null;
      break;
    }
    case "specific_employee": {
      const id = str(r.id);
      res = id ? await employeeRecipient(admin, tenant, id, "specific_employee") : null;
      break;
    }
    default:
      res = null; // role / workspace_team / specific_user / autres relations : gérés ailleurs (team) ou à venir
  }

  if (!res && r.fallback) return resolveOne(admin, tenant, r.fallback, ctx, depth + 1);
  return res;
}

/**
 * Résout une liste de resolvers contre la fiche déclenchante. Applique les replis,
 * DÉDUPLIQUE par email (insensible à la casse), écarte les non résolus / sans canal.
 * L'ordre d'entrée est préservé (1re occurrence d'un email gagne).
 */
export async function resolveRecipientsV2(
  admin: SupabaseClient,
  tenant: string,
  resolvers: RecipientResolver[],
  ctx: ResolveCtx
): Promise<ResolvedRecipient[]> {
  const out: ResolvedRecipient[] = [];
  const seen = new Set<string>();
  for (const r of resolvers ?? []) {
    const resolved = await resolveOne(admin, tenant, r, ctx).catch(() => null);
    if (!resolved) continue;
    const key = resolved.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}
