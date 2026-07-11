// POST /api/referral/claim — le filleul CONNECTÉ réclame son parrainage.
//
// Appelé par <ReferralClaim /> au 1ᵉʳ chargement authentifié, avec le code
// mémorisé au signup (localStorage `biltia_ref`). La RPC claim_referral est
// idempotente et sécurisée : le filleul est TOUJOURS auth.uid() côté SQL (jamais
// forgeable), l'auto-parrainage et le double-parrainage sont refusés, et le +200
// va dans la poche non-expirable. Ici on ne fait que router le code.

import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  let code = "";
  try {
    const body = (await req.json()) as { code?: unknown };
    code = String(body.code ?? "").trim().toUpperCase().slice(0, 16);
  } catch {
    /* corps absent/invalide → pas de code */
  }
  if (!code || !/^[A-Z0-9]{4,16}$/.test(code)) {
    return Response.json({ ok: false, reason: "no_code" });
  }

  // La RPC claim_referral n'est pas dans database.types.ts (comme les autres RPC
  // récentes) → appel en typage lâche. On garde la méthode SUR l'objet supabase
  // (sinon `this` perdu → le client plante sur this.rest). Même esprit que le webhook.
  const db = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await db.rpc("claim_referral", { p_code: code });
  if (error) {
    console.error("[referral/claim] rpc", error);
    return Response.json({ ok: false, reason: "rpc_error" }, { status: 500 });
  }
  // data ∈ 'linked' | 'already' | 'self' | 'unknown' | 'unauthenticated'
  return Response.json({ ok: true, result: data });
}
