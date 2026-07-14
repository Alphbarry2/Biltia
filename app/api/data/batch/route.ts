// ─────────────────────────────────────────────────────────────────────────────
// /api/data/batch — LIRE PLUSIEURS ENTITÉS EN UN SEUL APPEL.
//
// ⚠️ POURQUOI CETTE ROUTE EXISTE : la page /workspace affiche 25 entités. Elle
// faisait 25 `POST /api/data`, un par entité. Et CHACUN de ces 25 appels refaisait,
// côté serveur :
//
//     supabase.auth.getUser()   →  getActiveMembershipServer()  →  la vraie requête
//
// Soit 25 × 3 = ~75 allers-retours vers Supabase pour UN SEUL affichage de page. Et
// comme le navigateur ne tient que ~6 connexions simultanées, les 25 appels
// partaient en cinq vagues successives.
//
// Ici : on authentifie UNE fois, on résout le workspace UNE fois, on calcule le
// périmètre employé UNE fois, puis les 25 lectures partent EN PARALLÈLE côté serveur
// — où Supabase est à quelques millisecondes, pas à 200 ms.
//
// ── PÉRIMÈTRE DE LA ROUTE (volontairement étroit) ────────────────────────────
// LECTURE SEULE, et UNIQUEMENT les entités TYPÉES du workspace (ENTITIES). Pas de
// collections libres (app_records), pas d'écriture, pas de portée `data_scope`
// (elle vient d'un module appelant — le workspace, lui, montre TOUT).
// Tout le reste continue de passer par /api/data, qui reste la source unique.
//
// ⚠️ LE PÉRIMÈTRE EMPLOYÉ EST PRÉSERVÉ À L'IDENTIQUE : un compte « member » relié à
// une fiche employé ne voit que SES chantiers. Le batch ne doit JAMAIS être une porte
// dérobée qui contourne une règle de visibilité — c'est le seul vrai risque de cette
// optimisation, et c'est pour ça qu'il est écrit ici en toutes lettres.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";
import { ENTITIES, ALLOWED_ENTITIES } from "@/lib/data-entities";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { memberChantierScope, isPerimeterEntity } from "@/lib/employee-perimeter";

/** Garde-fou : au-delà, ce n'est plus un affichage de page, c'est un aspirateur. */
const MAX_ENTITIES = 40;
const MAX_ROWS = 500;

export async function POST(req: Request) {
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
    return NextResponse.json(
      { error: pick(locale, "Aucun espace de travail.", "No workspace.") },
      { status: 403 }
    );
  }
  const tenantId = membership.tenant_id;

  let body: { entities?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }

  // On n'accepte QUE des entités typées et autorisées. Une clé inconnue est ignorée
  // en silence (elle ressortira simplement avec un tableau vide) : une page qui
  // demande une entité retirée du catalogue ne doit pas planter.
  const asked = Array.isArray(body.entities) ? body.entities.map(String) : [];
  const entities = [...new Set(asked)]
    .filter((e) => ALLOWED_ENTITIES.includes(e) && !!ENTITIES[e])
    .slice(0, MAX_ENTITIES);

  if (!entities.length) {
    return NextResponse.json({ data: {} });
  }

  const limit = Math.min(Number(body.limit) || 200, MAX_ROWS);

  // ── PÉRIMÈTRE EMPLOYÉ, calculé UNE SEULE FOIS ──────────────────────────────
  // Un « member » relié à une fiche employé ne voit que SES chantiers (et leurs
  // enfants). null = aucune restriction. [] = aucun chantier visible → il ne verra
  // rien, ce qui est le comportement voulu, pas un bug.
  // Avant, ce calcul était refait à chaque appel, soit 25 fois par affichage.
  // Le client typé refuse un nom de table DYNAMIQUE (il ne connaît que les littéraux).
  // Même adaptateur que /api/data (route.ts:372) : on ne perd que l'autocomplétion,
  // pas la RLS — c'est bien le client de session, donc les policies s'appliquent.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (t: string) => (supabase.from as any)(t);

  const needsPerimeter = membership.role === "member" && entities.some(isPerimeterEntity);
  const allowedChantierIds = needsPerimeter
    ? await memberChantierScope(from, tenantId, user.id)
    : null;

  const results = await Promise.all(
    entities.map(async (entity) => {
      const def = ENTITIES[entity];
      try {
        let q = from(def.table).select("*").eq("tenant_id", tenantId);
        // Racine (chantiers) filtrée par `id`, enfants par `chantier_id` — même
        // règle exactement que /api/data. Ne pas la relâcher ici.
        if (allowedChantierIds !== null && isPerimeterEntity(entity)) {
          q = q.in(entity === "chantiers" ? "id" : "chantier_id", allowedChantierIds);
        }
        const { data, error } = await q
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) throw error;
        return [entity, data ?? []] as const;
      } catch {
        // Une entité en échec ne doit pas emporter les 24 autres : le workspace
        // s'affiche, la section concernée est simplement vide.
        return [entity, []] as const;
      }
    })
  );

  return NextResponse.json({ data: Object.fromEntries(results) });
}
