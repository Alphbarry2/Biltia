// ─────────────────────────────────────────────────────────────────────────────
// /api/share/submit — SOUMISSION d'un formulaire public (slice 4, capture de lead).
//
// Endpoint PUBLIC (visiteur anonyme muni d'un token de lien 'form'). Il ÉCRIT
// UNE ligne dans form_submissions, scopée au tenant DU TOKEN — rien d'autre.
//
// Zero-trust : le tenant_id est FORCÉ depuis le lien (jamais depuis le corps).
// Accès via service_role (app_share_links + form_submissions sont deny-all pour
// anon) : le token EST la capacité. Anti-abus : rate-limit par token + honeypot +
// liste blanche de champs + plafonds de taille.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase-admin";
import { isShareToken, isLinkLive } from "@/lib/share";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// app_share_links + form_submissions atteintes via service_role → client non typé.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

// Champs acceptés d'un formulaire de lead (liste BLANCHE ; tout le reste ignoré).
const ALLOWED_FIELDS = ["nom", "email", "tel", "ville", "adresse", "code_postal", "message", "demande", "projet", "budget"];
const MAX_LEN = 4000; // longueur max par champ (anti-payload)
const MAX_FIELDS = 20; // nb max de champs retenus

/** Filtre + borne le payload : liste blanche, trim, coupe la taille, ignore le vide. */
function cleanPayload(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_FIELDS) break;
    if (!ALLOWED_FIELDS.includes(k)) continue;
    const s = String(v ?? "").slice(0, MAX_LEN).trim();
    if (!s) continue;
    out[k] = s;
    n++;
  }
  return out;
}

export async function POST(req: Request) {
  const locale = await getLocale();
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    payload?: Record<string, unknown>;
    hp?: string; // honeypot : champ caché ; rempli = bot
  };

  const token = body.token;
  if (!token || !isShareToken(token)) {
    return Response.json({ error: pick(locale, "Lien invalide.", "Invalid link.") }, { status: 400 });
  }

  // Honeypot : un bot remplit ce champ caché → on ACCEPTE en silence (200) sans
  // rien écrire, pour ne pas lui révéler qu'il a été détecté.
  if (typeof body.hp === "string" && body.hp.trim() !== "") {
    return Response.json({ ok: true });
  }

  // Rate-limit par token (un token scrappé ne peut pas être martelé).
  const limited = await enforceRateLimit("form_submit", token, LIMITS.form_submit);
  if (limited) return limited;

  const payload = cleanPayload(body.payload);
  // Il faut au moins un moyen de recontact ou un message : sinon la soumission
  // n'a aucune valeur (et c'est probablement du bruit).
  if (!payload.email && !payload.tel && !payload.message && !payload.nom) {
    return Response.json(
      { error: pick(locale, "Formulaire incomplet.", "Incomplete form.") },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json(
      { error: pick(locale, "Service indisponible.", "Service unavailable.") },
      { status: 503 }
    );
  }
  const db = admin as unknown as LooseClient;

  // Résout le token → lien vivant de type 'form' (jamais 'preview'/'client').
  const { data: link } = await db
    .from("app_share_links")
    .select("id, kind, tenant_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!link || !isLinkLive(link, Date.now()) || link.kind !== "form") {
    return Response.json(
      { error: pick(locale, "Formulaire indisponible.", "This form is unavailable.") },
      { status: 404 }
    );
  }

  // Insertion scopée au tenant DU LIEN (jamais du corps). status='new' → le
  // veilleur `nouveau_lead` alertera l'artisan, qui convertira en client.
  const { error } = await db.from("form_submissions").insert({
    tenant_id: link.tenant_id,
    share_link_id: link.id,
    payload,
    status: "new",
  });
  if (error) {
    return Response.json(
      { error: pick(locale, "Envoi impossible pour le moment.", "Submission failed. Please try again.") },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
