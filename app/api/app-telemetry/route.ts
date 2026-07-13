// ─────────────────────────────────────────────────────────────────────────────
// /api/app-telemetry — TÉLÉMÉTRIE D'USAGE des apps (Phase 10).
//
// Reçoit un LOT d'événements d'usage (biltia.track côté app, bufferisé) et les
// écrit dans `app_events` (RLS user_id → l'utilisateur écrit ses propres events).
// Best-effort : la télémétrie ne doit JAMAIS gêner l'app (échoue en silence).
// Whitelist stricte (lib/app-telemetry) → pas de pollution.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { normalizeUsageEvents } from "@/lib/app-telemetry";

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership) return NextResponse.json({ ok: false }, { status: 403 });

  let body: { events?: unknown; moduleId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const moduleId = typeof body.moduleId === "string" ? body.moduleId : null;
  const events = normalizeUsageEvents(body.events, moduleId);
  if (!events.length) return NextResponse.json({ ok: true, inserted: 0 });

  try {
    const rows = events.map((e) => ({
      user_id: user.id,
      tenant_id: membership.tenant_id,
      event_type: e.event_type,
      metadata: e.metadata,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from as any)("app_events").insert(rows);
  } catch {
    // Best-effort : jamais bloquant.
  }
  return NextResponse.json({ ok: true, inserted: events.length });
}
