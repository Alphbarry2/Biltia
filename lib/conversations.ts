// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATIONS — historique du chat de l'atelier (façon ChatGPT).
// Sauvegarde best-effort côté client (RLS : chacun ne voit que les siennes).
// Une erreur de persistance ne doit JAMAIS casser la conversation en cours.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ConversationRow = {
  id: string;
  title: string;
  messages: ChatMessage[];
  app_id: string | null;
  kind: string | null;
  updated_at: string;
};

/** Titre lisible : première demande utilisateur, nettoyée et tronquée. */
export function conversationTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.content ?? "Conversation";
  const line = first.split("\n")[0].replace(/^📎\s*/, "").trim();
  return line.length > 80 ? `${line.slice(0, 77)}…` : line || "Conversation";
}

/**
 * Crée ou met à jour la conversation. Renvoie l'id (nouveau ou existant),
 * ou null si la persistance a échoué (jamais d'exception).
 */
export async function saveConversation(opts: {
  id: string | null;
  tenantId: string | null;
  messages: ChatMessage[];
  appId?: string | null;
  kind?: string | null;
}): Promise<string | null> {
  const { id, tenantId, messages, appId = null, kind = null } = opts;
  if (!messages.some((m) => m.role === "user")) return id;

  try {
    const supabase = createClient();
    const payload = {
      title: conversationTitle(messages),
      messages: messages as unknown as Json,
      app_id: appId,
      kind,
    };

    if (id) {
      const { error } = await supabase.from("conversations").update(payload).eq("id", id);
      return error ? null : id;
    }

    if (!tenantId) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("conversations")
      .insert({ ...payload, tenant_id: tenantId, user_id: user.id })
      .select("id")
      .single();
    return error ? null : data?.id ?? null;
  } catch {
    return null;
  }
}

/** Charge une conversation par id (null si introuvable / accès refusé). */
export async function loadConversation(id: string): Promise<ConversationRow | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("conversations")
      .select("id, title, messages, app_id, kind, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const messages = Array.isArray(data.messages)
      ? (data.messages as unknown as ChatMessage[]).filter(
          (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
        )
      : [];
    return { ...data, messages };
  } catch {
    return null;
  }
}
