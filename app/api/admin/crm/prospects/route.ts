// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/crm/prospects — liste des prospects (CRM interne, console
//      admin), avec le nombre de notes par prospect.
// POST /api/admin/crm/prospects — création manuelle d'un prospect (le gros du
//      volume vient de /api/admin/crm/import, ce endpoint sert pour l'ajout au
//      coup par coup).
//
// Barrière : session dont l'email est en liste blanche (lib/admin.ts). Lecture/
// écriture service_role (bypass RLS, table deny-all) : ne JAMAIS répondre sans
// avoir validé l'email.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminClientUntyped } from "@/lib/supabase-admin";

const STATUSES = ["prospect", "contacted", "pending", "signed", "refused"] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return Response.json({ error: "Accès refusé." }, { status: 403 });
  }

  const db = createAdminClientUntyped();
  if (!db) return Response.json({ error: "Service role non configuré." }, { status: 503 });

  const [{ data: prospects, error }, { data: notes, error: notesError }] = await Promise.all([
    db
      .from("crm_prospects")
      .select("id,created_at,updated_at,company_name,contact_name,contact_email,contact_phone,website,sector,city,status,source_file")
      .order("created_at", { ascending: false })
      .limit(5000),
    db.from("crm_prospect_notes").select("prospect_id").limit(50000),
  ]);

  if (error || notesError) {
    console.error("admin/crm/prospects GET error:", error ?? notesError);
    return Response.json({ error: "Erreur de lecture." }, { status: 500 });
  }

  const noteCounts = new Map<string, number>();
  for (const n of notes ?? []) noteCounts.set(n.prospect_id, (noteCounts.get(n.prospect_id) ?? 0) + 1);

  return Response.json({
    prospects: (prospects ?? []).map((p) => ({ ...p, notes_count: noteCounts.get(p.id) ?? 0 })),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return Response.json({ error: "Accès refusé." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const companyName = typeof body?.company_name === "string" ? body.company_name.trim() : "";
  if (!companyName) return Response.json({ error: "Le nom de l'entreprise est requis." }, { status: 400 });

  const status = STATUSES.includes(body?.status) ? body.status : "prospect";
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const db = createAdminClientUntyped();
  if (!db) return Response.json({ error: "Service role non configuré." }, { status: 503 });

  const { data, error } = await db
    .from("crm_prospects")
    .insert({
      company_name: companyName,
      contact_name: str(body?.contact_name),
      contact_email: str(body?.contact_email),
      contact_phone: str(body?.contact_phone),
      website: str(body?.website),
      sector: str(body?.sector),
      city: str(body?.city),
      status,
      created_by: user.email,
    })
    .select()
    .single();

  if (error) {
    console.error("admin/crm/prospects POST error:", error);
    return Response.json({ error: "Erreur de création." }, { status: 500 });
  }

  return Response.json({ prospect: { ...data, notes_count: 0 } });
}
