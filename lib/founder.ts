// ─────────────────────────────────────────────────────────────────────────────
// COMPTES FONDATEUR — comptes internes de test, JAMAIS bloqués par les crédits.
//
// Côté serveur (ask / analyze / automate / generate) : aucun hold, aucun débit,
// aucune réconciliation — mais l'usage reste journalisé dans ai_usage pour
// suivre la dépense API réelle (la seule limite est le solde Anthropic).
// Côté client (/generate) : pré-vérifications de solde sautées, pastille ∞.
//
// Sécurité : l'email vient de supabase.auth.getUser() (vérifié par Supabase),
// il ne peut pas être usurpé sans posséder le compte. Fichier client-safe.
// ─────────────────────────────────────────────────────────────────────────────

const FOUNDER_EMAILS = ["contact@biltia.com", "barryalpha9755@gmail.com"];

export function isFounderEmail(email: string | null | undefined): boolean {
  return !!email && FOUNDER_EMAILS.includes(email.trim().toLowerCase());
}
