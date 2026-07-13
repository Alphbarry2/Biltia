// ─────────────────────────────────────────────────────────────────────────────
// /api/push — gestion des abonnements Web Push de l'utilisateur connecté.
//
//   GET    → { enabled, publicKey } : le client sait si les push sont possibles.
//   POST   → { subscription } enregistre l'appareil (upsert par endpoint),
//            puis envoie une notification de bienvenue (preuve immédiate).
//   DELETE → { endpoint } désabonne cet appareil.
//
// RLS : l'utilisateur n'écrit/efface que SES abonnements (session requise).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { sendPushToUser } from "@/lib/push";
import { getLocale } from "@/lib/i18n/server";
import { pick, type Locale } from "@/lib/i18n/config";

export const runtime = "nodejs";

type WebPushSubscription = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

async function requireUser(locale: Locale) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { error: pick(locale, "Authentification requise.", "Authentication required.") },
        { status: 401 }
      ),
    };
  }
  return { supabase, user };
}

export async function GET() {
  const locale = await getLocale();
  const ctx = await requireUser(locale);
  if ("error" in ctx) return ctx.error;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  return NextResponse.json({ enabled: publicKey.length > 20, publicKey });
}

export async function POST(req: Request) {
  const locale = await getLocale();
  const ctx = await requireUser(locale);
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  let body: { subscription?: WebPushSubscription };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }

  const sub = body.subscription;
  const endpoint = sub?.endpoint ?? "";
  const p256dh = sub?.keys?.p256dh ?? "";
  const auth = sub?.keys?.auth ?? "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json(
      { error: pick(locale, "Abonnement push invalide.", "Invalid push subscription.") },
      { status: 400 }
    );
  }

  const membership = await getActiveMembershipServer(supabase, user.id);

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      tenant_id: membership?.tenant_id ?? null,
      endpoint,
      p256dh,
      auth,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    console.error("[push] subscribe error:", error.message);
    return NextResponse.json(
      { error: pick(locale, "Enregistrement impossible.", "Could not register this device.") },
      { status: 500 }
    );
  }

  // Preuve immédiate : l'appareil reçoit une notification de bienvenue.
  const sent = await sendPushToUser(user.id, {
    title: pick(locale, "Notifications activées", "Notifications enabled"),
    body: pick(
      locale,
      "Biltia vous préviendra ici quand vos tâches seront prêtes.",
      "Biltia will let you know here when your tasks are ready.",
    ),
    url: "/settings",
    tag: "biltia-welcome",
  });

  return NextResponse.json({ ok: true, testSent: sent > 0 });
}

export async function DELETE(req: Request) {
  const locale = await getLocale();
  const ctx = await requireUser(locale);
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }
  if (!body.endpoint) {
    return NextResponse.json(
      { error: pick(locale, "endpoint requis.", "“endpoint” is required.") },
      { status: 400 }
    );
  }

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", body.endpoint);

  return NextResponse.json({ ok: true });
}
