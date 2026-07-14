// ─────────────────────────────────────────────────────────────────────────────
// AGENT STATUS — les sentinelles d'état d'un agent, partagées CLIENT ET SERVEUR.
//
// Fichier volontairement SANS AUCUN IMPORT : la page /agents (« use client ») a
// besoin de ces constantes, et les lire depuis lib/agent-rules embarquerait le SDK
// Anthropic et Supabase dans le bundle du navigateur. Une chaîne recopiée à la main
// des deux côtés finirait par diverger : elle vit donc ici, une seule fois.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `agent_rules.blocked_reason` d'un agent à qui il ne manque QU'UNE CONNEXION
 * (messagerie, agenda). Il existe, il est visible dans /agents avec ses boutons,
 * le cron ne le touche pas, et il s'active tout seul dès la connexion faite.
 *
 * Sentinelle EXACTE : l'activation automatique ne réveille que ces agents-là,
 * jamais un agent bloqué pour une autre raison (destinataire introuvable, contenu
 * manquant, crédits épuisés) — le réveiller le ferait tourner à vide.
 */
export const PENDING_CONNECTION_REASON = "needs_connection";
