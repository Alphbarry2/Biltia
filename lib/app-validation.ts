// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION POST-GÉNÉRATION (Phase 2).
//
// Compare ce que l'app est CENSÉE faire (entités attendues par la demande +
// intention déclarée dans l'AppSpec) à ce que le HTML fait RÉELLEMENT (dérivation
// déterministe). Produit un AppValidationResult : erreurs (bloquantes/critiques),
// avertissements (silos, boutons morts…) et un SCORE DE COUVERTURE 0-100.
//
// 100 % déterministe, sans LLM. Sert à : (1) déclencher une passe corrective
// ciblée quand le branchement workspace a échoué ; (2) alimenter la télémétrie
// qualité ; (3) prévenir l'utilisateur d'une couverture faible. Ne bloque JAMAIS
// la publication de force : un « warning » informe, seule une erreur critique
// déclenche l'auto-fix.
// ─────────────────────────────────────────────────────────────────────────────

import { ENTITIES, ALLOWED_ENTITIES, detectConnectedEntities } from "./data-entities";
import { deriveAppSpecFromHtml, type AppSpecV1 } from "./app-spec";

export type IssueSeverity = "error" | "warning";
export interface AppValidationIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  detail?: string;
}
export interface AppValidationResult {
  valid: boolean; // aucune erreur (severity=error)
  critical: boolean; // au moins une erreur qui justifie une passe corrective
  errors: AppValidationIssue[];
  warnings: AppValidationIssue[];
  coverageScore: number; // 0-100
  actualSpec: AppSpecV1; // spec dérivée du HTML (réutilisable)
  metrics: {
    expectedEntities: string[];
    boundEntities: string[];
    missingEntities: string[];
    unknownEntities: string[];
    customCollections: string[];
    usesLocalStorage: boolean;
    usesBiltia: boolean;
  };
}

// Codes d'erreur qui justifient une passe corrective automatique (auto-fix).
export const CRITICAL_CODES = new Set(["no_workspace_binding", "localstorage_data", "unknown_entity"]);

/** Toutes les entités biltia.* (canoniques + libres) référencées dans le HTML. */
function biltiaEntities(html: string): Set<string> {
  const out = new Set<string>();
  const re = /biltia\.(?:list|get|create|update|remove|bulkCreate)\(\s*["']([a-zA-Z_]+)["']/g;
  for (const m of html.matchAll(re)) out.add(m[1]);
  return out;
}

/** localStorage utilisé pour STOCKER de la donnée (pas juste lire une préférence). */
function usesLocalStorageForData(html: string): boolean {
  return /localStorage\.setItem\s*\(/.test(html) || /localStorage\[[^\]]+\]\s*=/.test(html);
}

/** Un boutton « mort » : alert('bientôt…') / TODO visibles. */
function deadButtonHints(html: string): number {
  let n = 0;
  n += (html.match(/alert\(\s*["'][^"']*(bient[oô]t|coming soon|à venir|todo|non impl)/gi) || []).length;
  return n;
}

/** Clés d'objets littéraux passés à create/update pour une entité donnée (best-effort). */
function writtenFieldsFor(html: string, entity: string): string[] {
  const keys = new Set<string>();
  const re = new RegExp(
    `biltia\\.(?:create|update)\\(\\s*["']${entity}["']\\s*,\\s*(?:[^,{]*,\\s*)?\\{([^{}]*)\\}`,
    "g"
  );
  for (const m of html.matchAll(re)) {
    const body = m[1];
    if (body.includes("...")) continue; // spread → non littéral, on n'analyse pas
    for (const km of body.matchAll(/(?:^|[,{\s])([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) {
      keys.add(km[1]);
    }
  }
  return [...keys];
}

export interface ValidateAppInput {
  html: string;
  /** Entités que la DEMANDE impliquait (detectConnectedEntities / effectiveEntities). */
  expectedEntities?: string[];
  /** Intention déclarée par le modèle (AppSpec brut / coercé). */
  declaredSpec?: unknown;
  name?: string;
  description?: string;
}

/**
 * Valide une app générée. Déterministe. Ne lève jamais.
 */
export function validateApp(input: ValidateAppInput): AppValidationResult {
  const html = input.html || "";
  const expected = (input.expectedEntities ?? []).filter((e) => ALLOWED_ENTITIES.includes(e));
  const errors: AppValidationIssue[] = [];
  const warnings: AppValidationIssue[] = [];

  const actualSpec = deriveAppSpecFromHtml(html, { name: input.name, description: input.description });
  const bound = biltiaEntities(html);
  const usesBiltia = bound.size > 0 || /window\.biltia\b/.test(html);
  const usesLS = usesLocalStorageForData(html);

  const boundCanonical = [...bound].filter((e) => ALLOWED_ENTITIES.includes(e));
  const customCollections = [...bound].filter((e) => !ALLOWED_ENTITIES.includes(e));

  // ── ERREURS ────────────────────────────────────────────────────────────────
  // 1. localStorage pour des données = interdit produit (tout doit être cloud).
  if (usesLS) {
    errors.push({
      code: "localstorage_data",
      severity: "error",
      message: "L'application stocke des données dans localStorage au lieu du workspace cloud.",
    });
  }

  // 2. La demande impliquait des entités workspace, mais AUCUNE n'est branchée.
  const boundExpected = expected.filter((e) => bound.has(e));
  const missing = expected.filter((e) => !bound.has(e));
  if (expected.length > 0 && boundCanonical.length === 0) {
    errors.push({
      code: "no_workspace_binding",
      severity: "error",
      message: "L'application ne lit/écrit aucune donnée du workspace alors que la demande l'impliquait.",
      detail: `Attendu : ${expected.join(", ")}.`,
    });
  }

  // 3. Entité workspace mal orthographiée (typo probable d'une entité canonique).
  const unknownEntities: string[] = [];
  for (const key of customCollections) {
    // Une collection libre dont le NOM mappe vers une entité canonique = presque
    // toujours une faute (singulier : 'chantier'→chantiers) ou un silo.
    const mapped = detectConnectedEntities(key).filter((e) => ALLOWED_ENTITIES.includes(e));
    const looksLikeCanonicalTypo =
      mapped.length > 0 && (key.endsWith("s") === false || ALLOWED_ENTITIES.includes(key + "s"));
    if (mapped.length > 0 && !mapped.includes(key)) {
      if (looksLikeCanonicalTypo && !ALLOWED_ENTITIES.includes(key)) {
        unknownEntities.push(key);
        errors.push({
          code: "unknown_entity",
          severity: "error",
          message: `Collection « ${key} » : semble être une faute pour l'entité workspace « ${mapped[0]} ».`,
          detail: `Utilise biltia.*('${mapped[0]}', …) pour rester synchro avec le reste de l'entreprise.`,
        });
      } else {
        warnings.push({
          code: "possible_silo",
          severity: "warning",
          message: `Collection libre « ${key} » : un concept proche existe déjà (${mapped[0]}). Risque de silo.`,
        });
      }
    }
  }

  // ── AVERTISSEMENTS ───────────────────────────────────────────────────────────
  // 4. Entités attendues partiellement branchées.
  for (const e of missing) {
    if (boundCanonical.length > 0) {
      warnings.push({
        code: "entity_not_bound",
        severity: "warning",
        message: `L'entité « ${ENTITIES[e]?.label ?? e} » attendue n'est pas branchée dans l'app.`,
      });
    }
  }

  // 5. Champs écrits hors whitelist (best-effort, littéraux uniquement).
  for (const e of boundCanonical) {
    const def = ENTITIES[e];
    if (!def) continue;
    const written = writtenFieldsFor(html, e);
    const bad = written.filter((k) => !def.writable.includes(k) && k !== "id" && !k.endsWith("_id"));
    if (bad.length) {
      warnings.push({
        code: "unknown_field",
        severity: "warning",
        message: `Champs non reconnus écrits sur « ${e} » : ${bad.join(", ")}.`,
        detail: "Ils seront ignorés par le serveur (colonnes non inscriptibles).",
      });
    }
  }

  // 6. Boutons « bientôt disponible ».
  const dead = deadButtonHints(html);
  if (dead > 0) {
    warnings.push({
      code: "dead_button",
      severity: "warning",
      message: `${dead} action(s) « bientôt disponible » détectée(s) — un bouton doit toujours faire ce qu'il annonce.`,
    });
  }

  // 7. Aucune vue / aucune action alors que l'app persiste.
  if (usesBiltia && actualSpec.actions.length === 0) {
    warnings.push({ code: "no_actions", severity: "warning", message: "Aucune action (CRUD) détectée." });
  }

  // 8. dataMode déclaré vs réel.
  if (input.declaredSpec && typeof input.declaredSpec === "object") {
    const dm = (input.declaredSpec as Record<string, unknown>).dataMode;
    if (typeof dm === "string" && dm === "workspace" && actualSpec.dataMode !== "workspace" && actualSpec.dataMode !== "hybrid") {
      warnings.push({
        code: "datamode_mismatch",
        severity: "warning",
        message: `Intention « workspace » déclarée mais l'app est « ${actualSpec.dataMode} » en réalité.`,
      });
    }
  }

  // ── SCORE DE COUVERTURE ──────────────────────────────────────────────────────
  let score = 100;
  if (usesLS) score -= 40;
  if (expected.length > 0) {
    if (boundCanonical.length === 0) score -= 40;
    else score -= Math.round(25 * (missing.length / expected.length));
  }
  score -= Math.min(40, unknownEntities.length * 20);
  score -= Math.min(24, warnings.filter((w) => w.code === "possible_silo").length * 8);
  score -= Math.min(15, dead * 5);
  if (usesBiltia && actualSpec.views.length === 0) score -= 10;
  if (usesBiltia && actualSpec.actions.length === 0) score -= 10;
  score = Math.max(0, Math.min(100, score));

  const critical = errors.some((e) => CRITICAL_CODES.has(e.code));

  return {
    valid: errors.length === 0,
    critical,
    errors,
    warnings,
    coverageScore: score,
    actualSpec,
    metrics: {
      expectedEntities: expected,
      boundEntities: boundCanonical,
      missingEntities: missing,
      unknownEntities,
      customCollections,
      usesLocalStorage: usesLS,
      usesBiltia,
    },
  };
}

/** Instruction corrective ciblée à envoyer au modèle (auto-fix Phase 2). */
export function buildCorrectionInstruction(result: AppValidationResult): string {
  const lines: string[] = [
    "L'application ne respecte pas le branchement attendu au workspace. Corrige UNIQUEMENT cela, sans changer le design ni les fonctionnalités :",
  ];
  for (const e of result.errors) {
    if (e.code === "no_workspace_binding")
      lines.push(
        `- Branche les données réelles via window.biltia : ${result.metrics.expectedEntities.join(", ")} (biltia.list/create/update/remove avec ces NOMS EXACTS). JAMAIS localStorage.`
      );
    if (e.code === "localstorage_data")
      lines.push("- Remplace TOUT localStorage par window.biltia (persistance cloud partagée).");
    if (e.code === "unknown_entity")
      lines.push(`- ${e.detail ?? e.message}`);
  }
  return lines.join("\n");
}
