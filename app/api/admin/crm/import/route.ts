// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/crm/import — importe des prospects depuis un CSV/Excel.
//
// Le fichier est parsé CÔTÉ CLIENT (xlsx, comme components/data-start-modal.tsx)
// et les lignes brutes { en-tête: valeur } arrivent ici en JSON. On mappe les
// colonnes (lib/crm-import.ts, pur) puis on insère en masse via service_role.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminClientUntyped } from "@/lib/supabase-admin";
import { mapImportRows } from "@/lib/crm-import";

// Même plafond que lib/import-map.ts (2000) : au-delà, l'import se scinde.
const MAX_ROWS = 2000;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return Response.json({ error: "Accès refusé." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rawRows = Array.isArray(body?.rows) ? body.rows : null;
  const fileName = typeof body?.fileName === "string" ? body.fileName.slice(0, 200) : null;
  if (!rawRows || rawRows.length === 0) {
    return Response.json({ error: "Aucune ligne à importer." }, { status: 400 });
  }

  const truncated = rawRows.length > MAX_ROWS;
  const result = mapImportRows(rawRows.slice(0, MAX_ROWS));
  if (result.prospects.length === 0) {
    return Response.json({ error: "Aucune ligne exploitable (colonne entreprise vide).", warnings: result.warnings }, { status: 400 });
  }

  const db = createAdminClientUntyped();
  if (!db) return Response.json({ error: "Service role non configuré." }, { status: 503 });

  const { data, error } = await db
    .from("crm_prospects")
    .insert(
      result.prospects.map((p) => ({
        ...p,
        status: "prospect",
        source_file: fileName,
        created_by: user.email,
      }))
    )
    .select("id");

  if (error) {
    console.error("admin/crm/import error:", error);
    return Response.json({ error: "Erreur d'import." }, { status: 500 });
  }

  const warnings = [...result.warnings];
  if (truncated) warnings.push(`Fichier tronqué à ${MAX_ROWS} lignes (${rawRows.length} au total).`);

  return Response.json({
    imported: data?.length ?? 0,
    skipped: result.skipped,
    mapping: result.mapping,
    warnings,
  });
}
