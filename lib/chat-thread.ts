// ─────────────────────────────────────────────────────────────────────────────
// LE FIL — parce que « oui je valide » ne veut rien dire tout seul.
//
// LE BUG (constaté en prod le 2026-07-14) : le fil de la conversation partait
// bien au CLASSIFIEUR et au COPILOTE, mais aucun des chemins qui AGISSENT
// (données, document, application) ne le recevait : ils travaillaient sur le
// message NU. L'artisan validait une facture proposée au tour précédent —
// « oui je valide » — et l'opérateur de données, qui ne voyait que ces trois
// mots, répondait « Pouvez-vous préciser quelle opération ? ». La proposition
// venait pourtant d'être faite. De l'extérieur, ça ne ressemble pas à un oubli
// de contexte : ça ressemble à une IA bête.
//
// Deuxième piège, silencieux : l'API exige un fil qui COMMENCE par l'utilisateur
// et qui ALTERNE. Un fil tronqué aux 12 derniers tours peut très bien commencer
// par une réponse de l'assistant → 400 en pleine conversation. On normalise ici,
// une fois pour toutes, pour tous les chemins.
// ─────────────────────────────────────────────────────────────────────────────

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Fil prêt à partir à l'API : vide écarté, démarre sur l'utilisateur, alterne
 * strictement. Deux tours du même côté sont FUSIONNÉS (jamais perdus : ce sont
 * souvent deux bouts d'une même pensée, « fais-moi une facture » puis « pour
 * Alpha »).
 */
export function sanitizeThread(turns: readonly ChatTurn[] | undefined): ChatTurn[] {
  const clean = (turns ?? []).filter(
    (t): t is ChatTurn =>
      !!t &&
      (t.role === "user" || t.role === "assistant") &&
      typeof t.content === "string" &&
      t.content.trim().length > 0
  );

  // Rien avant le premier tour de l'utilisateur : l'API refuse un fil qui
  // s'ouvre sur l'assistant, et un accueil (« Que puis-je faire pour vous ? »)
  // n'apporte de toute façon aucun contexte.
  const start = clean.findIndex((t) => t.role === "user");
  if (start === -1) return [];

  const out: ChatTurn[] = [];
  for (const turn of clean.slice(start)) {
    const last = out[out.length - 1];
    if (last && last.role === turn.role) {
      out[out.length - 1] = { role: last.role, content: `${last.content}\n\n${turn.content}` };
    } else {
      out.push({ role: turn.role, content: turn.content });
    }
  }
  return out;
}

/**
 * Le fil + la demande courante, en messages alternés valides. C'est ce que doit
 * recevoir TOUT chemin qui appelle le modèle avec un vrai dialogue (copilote,
 * opérateur de données).
 */
export function toMessages(
  history: readonly ChatTurn[] | undefined,
  current: string
): ChatTurn[] {
  return sanitizeThread([...(history ?? []), { role: "user", content: current }]);
}

/**
 * Le fil rendu en TEXTE, pour les chemins qui n'envoient qu'UN SEUL message
 * (génération d'app ou de document : le prompt système y est mis en cache, on
 * ne va pas casser la structure des messages pour autant). Borné : le contexte
 * utile d'une validation tient dans les derniers tours.
 */
export function threadAsText(
  history: readonly ChatTurn[] | undefined,
  maxTurns = 6
): string {
  const turns = sanitizeThread(history).slice(-maxTurns);
  if (!turns.length) return "";
  const lignes = turns
    .map((m) => `${m.role === "user" ? "L'artisan" : "Toi"} : ${m.content}`)
    .join("\n");
  return `FIL DE LA CONVERSATION (contexte : la demande ci-dessous s'y réfère peut-être — « oui », « je valide », « comme tu as dit », « celle-là ») :\n${lignes}`;
}
