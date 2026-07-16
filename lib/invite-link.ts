import { createHmac, timingSafeEqual } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Jeton d'invitation d'équipe — signé, RÉUTILISABLE pendant 24h (contrairement
// au lien de récupération Supabase, qui est à usage unique et se consomme dès
// le premier /verify). Le lien envoyé par email pointe vers /invitation?t=...
// (jamais directement vers Supabase) : /api/invitation/start vérifie ce jeton
// et ne génère un lien de récupération Supabase (usage unique) qu'AU MOMENT du
// clic, à chaque tentative — un second clic, un autre appareil, ou un scan de
// sécurité qui pré-visite le lien n'épuisent donc jamais le jeton lui-même.
// ─────────────────────────────────────────────────────────────────────────────

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export type InviteTokenPayload = { tenantId: string; userId: string };

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function signInviteToken(tenantId: string, userId: string): string {
  const payload = Buffer.from(JSON.stringify({ tenantId, userId })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyInviteToken(token: string): InviteTokenPayload | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof parsed?.tenantId === "string" && typeof parsed?.userId === "string") {
      return { tenantId: parsed.tenantId, userId: parsed.userId };
    }
    return null;
  } catch {
    return null;
  }
}
