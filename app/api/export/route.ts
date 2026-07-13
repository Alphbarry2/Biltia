// ─────────────────────────────────────────────────────────────────────────────
// /api/export — export CSV / Excel des entités partagées du workspace.
//
// Miroir de l'import (/api/data → bulk_create). En un clic, le patron télécharge
// ses données (clients, chantiers, heures…) pour les envoyer à sa fiduciaire.
//
// Sécurité (mêmes garde-fous que /api/data) :
//   1. Auth de session (cookies) → rôle authenticated.
//   2. tenant_id FORCÉ côté serveur (jamais fourni par le client).
//   3. Whitelist d'entités (ALLOWED_ENTITIES) — pas d'accès aux tables sensibles.
//   4. RLS Postgres : isolation tenant, appliquée quoi qu'il arrive.
//
// ?entity=<clé>|all   entité à exporter (all = classeur multi-feuilles)
// ?format=csv|xlsx    csv = feuille unique (séparateur « ; » + BOM UTF-8)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { ENTITIES, ALLOWED_ENTITIES } from "@/lib/data-entities";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { can } from "@/lib/permissions";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";
import { logActivity } from "@/lib/activity";
import {
  buildSheet,
  sheetName,
  exportFilename,
  FK_TO_ENTITY,
  NAME_COLS,
  type Lookups,
} from "@/lib/export";

const MAX_ROWS = 5000; // plafond par entité pour un export

export async function GET(req: Request) {
  const url = new URL(req.url);
  const entityParam = url.searchParams.get("entity") ?? "";
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();

  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  }

  const membership = await getActiveMembershipServer(supabase, user.id);

  if (!membership) {
    return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });
  }
  const tenantId = membership.tenant_id;

  // RBAC : exporter les données de l'espace est réservé aux rôles de gestion
  // (owner / admin / manager) — un employé ou un lecteur n'exfiltre pas la base.
  if (!can(membership.role, "export.data")) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Vous n'avez pas les droits pour exporter les données de cet espace.",
          "You don't have permission to export this workspace's data."
        ),
      },
      { status: 403 }
    );
  }

  // Cible : une entité précise, ou tout le workspace.
  const isAll = entityParam === "all";
  if (!isAll && !ALLOWED_ENTITIES.includes(entityParam)) {
    return NextResponse.json(
      { error: pick(locale, `Entité non autorisée : ${entityParam}`, `Entity not allowed: ${entityParam}`) },
      { status: 400 }
    );
  }
  const entities = isAll ? ALLOWED_ENTITIES : [entityParam];

  // Accès dynamique à la table (entité validée par whitelist ci-dessus).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (t: string) => (supabase.from as any)(t);

  async function fetchRows(entity: string) {
    const { data, error } = await from(ENTITIES[entity].table)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS);
    if (error) throw error;
    return data ?? [];
  }

  // Table de correspondance id → nom lisible pour une entité référencée
  // (ne charge que id + colonnes de nom : léger).
  async function fetchLookup(entity: string): Promise<Map<string, string>> {
    const cols = ["id", ...NAME_COLS[entity]].join(",");
    const { data } = await from(entity)
      .select(cols)
      .eq("tenant_id", tenantId)
      .limit(MAX_ROWS);
    const map = new Map<string, string>();
    for (const r of data ?? []) {
      if (!r?.id) continue;
      const name = NAME_COLS[entity]
        .map((c: string) => r[c])
        .filter(Boolean)
        .join(" ")
        .trim();
      map.set(String(r.id), name || String(r.id));
    }
    return map;
  }

  try {
    // Quelles entités référencées faut-il résoudre (clés étrangères des entités exportées) ?
    const referenced = new Set<string>();
    for (const e of entities) {
      for (const field of ENTITIES[e].writable) {
        if (FK_TO_ENTITY[field]) referenced.add(FK_TO_ENTITY[field]);
      }
    }
    const lookups: Lookups = {};
    await Promise.all(
      [...referenced].map(async (e) => {
        lookups[e] = await fetchLookup(e);
      })
    );

    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    let added = 0;

    for (const entity of entities) {
      const rows = await fetchRows(entity);
      // En mode « tout », on ignore les entités vides pour ne pas noyer le fichier.
      if (isAll && rows.length === 0) continue;
      XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, entity, rows, lookups, locale), sheetName(entity, locale));
      added++;
    }

    // Garantir au moins une feuille (modèle vide si tout est vide).
    if (added === 0) {
      XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, entities[0], [], lookups, locale), sheetName(entities[0], locale));
    }

    const now = new Date();

    await logActivity(supabase, {
      tenantId,
      userId: user.id,
      action: "export",
      entityType: isAll ? "workspace" : ENTITIES[entityParam].label,
      description: isAll
        ? `Export complet du workspace (${format})`
        : `Export ${ENTITIES[entityParam].label} (${format})`,
    });

    // CSV : uniquement pour une entité (un fichier plat = une seule table).
    if (format === "csv" && !isAll) {
      const BOM = "﻿"; // Excel FR/BE ouvre l'UTF-8 proprement avec un BOM
      const csv = BOM + XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ";" });
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${exportFilename(entityParam, "csv", now)}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Excel : classeur (multi-feuilles si « tout »).
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFilename(entityParam, "xlsx", now)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : pick(locale, "Erreur lors de l'export.", "Export failed.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
