// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/crm/prospects/[id]/notes — journal de suivi d'un prospect.
// POST /api/admin/crm/prospects/[id]/notes — ajoute une note horodatée.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminClientUntyped } from "@/lib/supabase-admin";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && isAdminEmail(user.email) ? user : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await params;
  const db = createAdminClientUntyped();
  if (!db) return Response.json({ error: "Service role non configuré." }, { status: 503 });

  const { data, error } = await db
    .from("crm_prospect_notes")
    .select("id,created_at,body,author")
    .eq("prospect_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("admin/crm/notes GET error:", error);
    return Response.json({ error: "Erreur de lecture." }, { status: 500 });
  }

  return Response.json({ notes: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return Response.json({ error: "Note vide." }, { status: 400 });

  const db = createAdminClientUntyped();
  if (!db) return Response.json({ error: "Service role non configuré." }, { status: 503 });

  const { data, error } = await db
    .from("crm_prospect_notes")
    .insert({ prospect_id: id, body: text, author: user.email })
    .select()
    .single();

  if (error) {
    console.error("admin/crm/notes POST error:", error);
    return Response.json({ error: "Erreur d'enregistrement." }, { status: 500 });
  }

  return Response.json({ note: data });
}
