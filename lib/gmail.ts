// ─────────────────────────────────────────────────────────────────────────────
// ENVOI GMAIL — « les mains » de l'agent pour l'email. Envoie un message AU NOM
// de l'utilisateur, via son compte Gmail connecté (scope gmail.send). Récupère le
// jeton stocké (user_connections), le rafraîchit s'il a expiré, puis appelle
// l'API Gmail. STRICTEMENT côté serveur (lit access_token/refresh_token via le
// client service_role). Ne throw jamais : renvoie un résultat typé pour que
// l'agent puisse réagir (envoyé / pas connecté / scope manquant / échec).
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "./supabase-admin";
import { refreshAccessToken } from "./oauth";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export type GmailSendResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_connected" | "missing_scope" | "no_service" | "send_failed"; detail?: string };

type Conn = {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
};

/** Jeton d'accès Google valide (rafraîchi et re-persisté si nécessaire).
 *  Exporté : partagé par les autres outils Google (agenda, drive…). */
export async function getValidGoogleToken(
  tenantId: string,
  userId: string
): Promise<
  | { ok: true; accessToken: string; scopes: string[] }
  | { ok: false; reason: "not_connected" | "no_service" | "send_failed"; detail?: string }
> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "no_service" };

  const { data } = await admin
    .from("user_connections")
    .select("access_token, refresh_token, token_expires_at, scopes")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  const conn = data as Conn | null;
  if (!conn) return { ok: false, reason: "not_connected" };

  const scopes = conn.scopes ?? [];
  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0;

  // Jeton encore valide (marge de 60 s) → on l'utilise tel quel.
  if (conn.access_token && expiresAt > Date.now() + 60_000) {
    return { ok: true, accessToken: conn.access_token, scopes };
  }

  // Sinon, rafraîchir via le refresh_token.
  if (!conn.refresh_token) return { ok: false, reason: "not_connected" };
  try {
    const t = await refreshAccessToken({ provider: "google", refreshToken: conn.refresh_token });
    const newExpiry = t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null;
    await admin
      .from("user_connections")
      .update({ access_token: t.access_token, token_expires_at: newExpiry, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("provider", "google");
    return { ok: true, accessToken: t.access_token, scopes };
  } catch (e) {
    return { ok: false, reason: "send_failed", detail: e instanceof Error ? e.message : "refresh" };
  }
}

/** Statut Gmail pour l'agent : est-il connecté, et peut-il envoyer (scope) ? */
export async function gmailStatus(
  tenantId: string,
  userId: string
): Promise<{ connected: boolean; canSend: boolean }> {
  const admin = createAdminClient();
  if (!admin) return { connected: false, canSend: false };
  const { data } = await admin
    .from("user_connections")
    .select("scopes")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  const scopes = (data as { scopes?: string[] } | null)?.scopes ?? [];
  return { connected: !!data, canSend: scopes.includes(GMAIL_SEND_SCOPE) };
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Envoie un email via l'API Gmail au nom de l'utilisateur. Ne throw jamais. */
export async function sendGmail(opts: {
  tenantId: string;
  userId: string;
  to: string;
  subject: string;
  body: string;
}): Promise<GmailSendResult> {
  const tok = await getValidGoogleToken(opts.tenantId, opts.userId);
  if (!tok.ok) return { ok: false, reason: tok.reason, detail: tok.detail };
  if (!tok.scopes.includes(GMAIL_SEND_SCOPE)) return { ok: false, reason: "missing_scope" };

  // Sujet en encoded-word RFC 2047 (accents) ; corps UTF-8 base64url via le MIME.
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(opts.subject, "utf8").toString("base64")}?=`;
  const mime = [
    `To: ${opts.to}`,
    `Subject: ${subjectEncoded}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.body,
  ].join("\r\n");
  const raw = base64url(Buffer.from(mime, "utf8"));

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: "send_failed", detail: `${res.status} ${detail.slice(0, 200)}` };
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: json.id ?? "" };
}
