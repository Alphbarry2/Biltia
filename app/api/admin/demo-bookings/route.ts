// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/demo-bookings — liste des demandes de démo (console admin).
// Barrière : session dont l'email est en liste blanche (lib/admin.ts). Lecture
// service_role (bypass RLS) : ne JAMAIS répondre sans avoir validé l'email.
// admin_token renvoyé pour lier chaque ligne à sa page organisateur.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";
import { demoDb } from "@/lib/demo-server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return Response.json({ error: "Accès refusé." }, { status: 403 });
  }

  const db = demoDb();
  if (!db) {
    return Response.json({ error: "Service role non configuré." }, { status: 503 });
  }

  const { data, error } = await db
    .from("demo_bookings")
    .select(
      "id,created_at,slot_date,slot_time,status,company_name,website,headcount,looking_for,message,contact_name,contact_email,contact_phone,rescheduled_by,admin_token"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("admin/demo-bookings error:", error);
    return Response.json({ error: "Erreur de lecture." }, { status: 500 });
  }

  return Response.json({ bookings: data ?? [] });
}
