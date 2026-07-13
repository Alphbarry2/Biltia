// ─────────────────────────────────────────────────────────────────────────────
// /api/workspace/records — CATALOGUE de sélection pour la création d'app.
//
// Renvoie, EN UN SEUL APPEL, les entités du workspace qui ont au moins un
// enregistrement, avec pour chacune une liste compacte { id, label, sub } prête
// à cocher dans le questionnaire (widget « workspace-picker »). L'utilisateur
// peut ainsi scoper une app sur des éléments PRÉCIS (« les chantiers de Liège »)
// plutôt que sur tout le workspace.
//
// Sécurité : session obligatoire, tenant_id FORCÉ serveur, RLS Postgres. Lecture
// seule (aucune écriture) → jamais concerné par le gel d'abonnement.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { ENTITIES, recordLabel, entityLabel } from "@/lib/data-entities";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// Entités qu'il est pertinent de « choisir » pour bâtir une app autour (dans un
// ordre utile). On exclut les sous-tables (lignes) et les entités trop
// techniques : on garde ce qu'un artisan reconnaît et scoperait vraiment.
const PICKABLE = [
  "chantiers", "clients", "devis", "factures", "interventions", "employees",
  "catalogue", "materials", "equipment", "suppliers", "contrats", "parc_installe",
  "documents", "tasks",
];

// Détail secondaire affiché sous le libellé (ville, statut…) — premier trouvé.
const SUB_FIELDS = ["ville", "statut", "categorie", "corps_metier", "role", "type", "date_prevue"];

const PER_ENTITY_LIMIT = 200;

function firstString(row: Record<string, unknown>, cols: string[]): string | null {
  for (const c of cols) {
    const v = row[c];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // fetch same-origin sans header Origin → toléré
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const locale = await getLocale(); // nom des entités traduit si interface EN

  if (!sameOrigin(req)) {
    return NextResponse.json({ error: pick(locale, "Origine non autorisée.", "Origin not allowed.") }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: pick(locale, "Authentification requise.", "Authentication required.") }, { status: 401 });
  }

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership) {
    return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });
  }
  const tenantId = membership.tenant_id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (t: string) => (supabase.from as any)(t);

  const entities: {
    key: string;
    label: string;
    count: number;
    records: { id: string; label: string; sub: string | null }[];
  }[] = [];

  // Une requête par entité, chacune isolée : une table absente ou une erreur ne
  // fait jamais échouer tout le catalogue (best-effort, résilient).
  for (const key of PICKABLE) {
    const def = ENTITIES[key];
    if (!def) continue;
    try {
      const { data, error } = await from(def.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(PER_ENTITY_LIMIT);
      if (error) continue;
      const rows = (data ?? []) as Record<string, unknown>[];
      if (!rows.length) continue;
      entities.push({
        key,
        label: entityLabel(key, locale),
        count: rows.length,
        records: rows
          .filter((r) => r && r.id != null)
          .map((r) => ({
            id: String(r.id),
            label: recordLabel(key, r),
            sub: firstString(r, SUB_FIELDS),
          })),
      });
    } catch {
      // entité indisponible → on la saute
    }
  }

  return NextResponse.json({ entities });
}
