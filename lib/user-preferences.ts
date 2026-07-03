// ─────────────────────────────────────────────────────────────────────────────
// Préférences IA par utilisateur.
// Stockées dans profiles.preferences (jsonb) — voir migration 009.
// Consommées : (1) à l'affichage dans Paramètres, (2) injectées dans le prompt
// système de génération (buildPreferencesBlock) pour changer ce que Batify produit.
// ─────────────────────────────────────────────────────────────────────────────

export type Tone = "pro" | "friendly" | "concise";

export type UserPreferences = {
  /** Demander confirmation avant toute action destructive dans l'app générée. */
  always_confirm: boolean;
  /** Générer systématiquement un PDF imprimable quand c'est pertinent. */
  always_pdf: boolean;
  /** Privilégier une application interactive plutôt qu'un document ponctuel. */
  prefer_app: boolean;
  /** Recevoir une notification quand une tâche IA longue se termine. */
  ai_notifications: boolean;
  /** Ton des libellés et messages produits. */
  tone: Tone;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  always_confirm: false,
  always_pdf: false,
  prefer_app: false,
  ai_notifications: true,
  tone: "pro",
};

/** Coerce une valeur jsonb inconnue (ou une colonne absente) vers des préférences sûres. */
export function normalizePreferences(raw: unknown): UserPreferences {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    always_confirm: p.always_confirm === true,
    always_pdf: p.always_pdf === true,
    prefer_app: p.prefer_app === true,
    ai_notifications: p.ai_notifications !== false, // défaut activé
    tone: p.tone === "friendly" || p.tone === "concise" ? p.tone : "pro",
  };
}

const TONE_LABEL: Record<Tone, string> = {
  pro: "professionnel et direct",
  friendly: "chaleureux et accessible",
  concise: "très concis, droit à l'essentiel",
};

export const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: "pro", label: "Professionnel & direct" },
  { value: "friendly", label: "Chaleureux & accessible" },
  { value: "concise", label: "Concis, à l'essentiel" },
];

/**
 * Bloc injecté dans le prompt système de génération.
 * Seules les préférences qui influencent réellement la sortie sont émises
 * (le ton est toujours émis ; les booléens seulement s'ils sont activés).
 */
export function buildPreferencesBlock(p: UserPreferences): string {
  const lines: string[] = [`- Adopte un ton ${TONE_LABEL[p.tone]} dans tous les libellés et messages.`];
  if (p.always_pdf) lines.push("- Prévois systématiquement une sortie imprimable / PDF propre quand la demande s'y prête.");
  if (p.prefer_app) lines.push("- Privilégie une application interactive complète plutôt qu'un simple document ponctuel.");
  if (p.always_confirm) lines.push("- Dans l'app générée, demande TOUJOURS une confirmation (window.confirm) avant toute action destructive ou irréversible.");
  return `# PRÉFÉRENCES DE L'UTILISATEUR (à respecter en priorité)\n${lines.join("\n")}`;
}
