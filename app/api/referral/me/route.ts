// GET /api/referral/me — données de parrainage de l'utilisateur connecté :
// son code, le lien d'invitation, le QR (data-URL PNG), et ses compteurs.
//
// Alimente la modal « Parrainage ». Les RPC (get_or_create_referral_code,
// my_referral_stats) sont security definer et scoppées à auth.uid().

import { createClient } from "@/lib/supabase-server";
import QRCode from "qrcode";

export const runtime = "nodejs";

type LooseRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  // Appel en typage lâche : on garde la méthode SUR l'objet (sinon `this` perdu
  // → le client Supabase plante). RPC hors database.types.ts.
  const db = supabase as unknown as LooseRpc;

  // 1. Code stable (créé à la volée la 1ʳᵉ fois).
  const { data: codeData, error: codeErr } = await db.rpc("get_or_create_referral_code");
  if (codeErr || !codeData || typeof codeData !== "string") {
    console.error("[referral/me] code", codeErr);
    return Response.json({ ok: false, reason: "code_error" }, { status: 500 });
  }
  const code = codeData;

  // 2. Compteurs (agrégats). SETOF → tableau d'une ligne.
  const { data: statsData } = await db.rpc("my_referral_stats");
  const row = Array.isArray(statsData) ? (statsData[0] as Record<string, number> | undefined) : undefined;
  const stats = {
    signedUp: Number(row?.signed_up ?? 0),
    converted: Number(row?.converted ?? 0),
    creditsEarned: Number(row?.credits_earned ?? 0),
  };

  // 3. Lien + QR. Le lien pointe vers la page d'inscription publique du site
  //    (l'origine de la requête = le domaine déployé en prod).
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const link = `${base}/signup?ref=${encodeURIComponent(code)}`;

  let qr = "";
  try {
    qr = await QRCode.toDataURL(link, {
      margin: 1,
      width: 320,
      color: { dark: "#0A0A0A", light: "#FFFFFF" },
    });
  } catch (e) {
    console.error("[referral/me] qr", e);
  }

  return Response.json({ ok: true, code, link, qr, stats });
}
