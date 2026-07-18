// ─────────────────────────────────────────────────────────────────────────────
// WS-C — Politique de confirmation des actions du chat.
//
// Trois niveaux :
//   - immediate  : lectures/recherches → jamais de confirmation.
//   - preference : créer/mettre à jour → confirmation SI l'utilisateur a activé
//                  « toujours confirmer » (profiles.preferences.always_confirm).
//   - mandatory  : supprimer, transformer (facture !), envoyer email/SMS →
//                  confirmation TOUJOURS, quel que soit le réglage.
//
// Pur et testable. Sert de `confirmGate` à runAgentLoop : une action de niveau
// « à confirmer » n'est PAS exécutée dans la boucle — elle est proposée, puis
// exécutée seulement après le « oui » explicite de l'utilisateur.
// ─────────────────────────────────────────────────────────────────────────────

export type ActionTier = "immediate" | "preference" | "mandatory";

const MANDATORY = new Set(["workspace_delete", "workspace_transform", "send_email", "send_sms"]);
// create_avenant crée un BROUILLON d'avenant (réversible) → niveau création.
const PREFERENCE = new Set(["workspace_create", "workspace_update", "create_avenant"]);

/** Niveau de risque d'un outil. Tout ce qui n'est ni mandatory ni preference (les
 *  lectures : workspace_list, workspace_get, app_data_list, app_collections) = immediate. */
export function actionTier(tool: string): ActionTier {
  if (MANDATORY.has(tool)) return "mandatory";
  if (PREFERENCE.has(tool)) return "preference";
  return "immediate";
}

/**
 * Cette action doit-elle être confirmée avant exécution ?
 *  - mandatory  → toujours.
 *  - preference → seulement si `alwaysConfirm`.
 *  - immediate  → jamais.
 */
export function requiresConfirmation(tool: string, opts: { alwaysConfirm?: boolean } = {}): boolean {
  const tier = actionTier(tool);
  if (tier === "mandatory") return true;
  if (tier === "preference") return !!opts.alwaysConfirm;
  return false;
}
