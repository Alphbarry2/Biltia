// ─────────────────────────────────────────────────────────────────────────────
// PATCH  /api/admin/crm/prospects/[id] — modifie le statut (kanban / dropdown)
//        et/ou les champs d'un prospect.
// DELETE /api/admin/crm/prospects/[id] — supprime un prospect (et ses notes,
//        cascade FK).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminClientUntyped } from "@/lib/supabase-admin";

const STATUSES = ["prospect", "contacted", "pending", "signed", "refused"] as const;
const EDITABLE_FIELDS = ["company_name", "contact_name", "contact_email", "contact_phone", "website", "sector", "city"] as const;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && isAdminEmail(user.email) ? user : null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Requête invalide." }, { status: 400 });

  const patch: Record<string, string | null> = {};

  if ("status" in body) {
    if (!STATUSES.includes(body.status)) return Response.json({ error: "Statut invalide." }, { status: 400 });
    patch.status = body.status;
  }
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      const v = body[field];
      if (field === "company_name" && (typeof v !== "string" || !v.trim())) {
        return Response.json({ error: "Le nom de l'entreprise ne peut pas être vide." }, { status: 400 });
      }
      patch[field] = typeof v === "string" && v.trim() ? v.trim() : null;
    }
  }
  if (Object.keys(patch).length === 0) return Response.json({ error: "Rien à modifier." }, { status: 400 });

  const db = createAdminClientUntyped();
  if (!db) return Response.json({ error: "Service role non configuré." }, { status: 503 });

  const { data, error } = await db.from("crm_prospects").update(patch).eq("id", id).select().single();
  if (error) {
    console.error("admin/crm/prospects PATCH error:", error);
    return Response.json({ error: "Erreur de mise à jour." }, { status: 500 });
  }

  return Response.json({ prospect: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await params;
  const db = createAdminClientUntyped();
  if (!db) return Response.json({ error: "Service role non configuré." }, { status: 503 });

  const { error } = await db.from("crm_prospects").delete().eq("id", id);
  if (error) {
    console.error("admin/crm/prospects DELETE error:", error);
    return Response.json({ error: "Erreur de suppression." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
