// ─────────────────────────────────────────────────────────────────────────────
// GARDE-FOU DÉTERMINISTE — « l'app s'ouvre BLANCHE ».
//
// Un modèle de design (Sonnet) trébuche PARFOIS sur un détail de JavaScript : une
// apostrophe française qui ferme une chaîne en quotes simples au milieu d'un mot
// (`notify('L'opération…')`), une parenthèse non refermée. UNE seule SyntaxError et
// TOUT le script meurt → l'app est blanche à l'ouverture, l'artisan ne peut même
// pas « changer de page ». C'était la raison n°1 du choix de DeepSeek (30 apps/30
// sans erreur JS) ; ce module rend la bascule vers un modèle de DESIGN sûre.
//
// On ne fait pas reposer ça sur la bonne volonté du modèle : on PARSE le JS produit
// (acorn, ZÉRO exécution) AVANT de livrer. Si ça ne parse pas, l'appelant répare EN
// SILENCE (l'utilisateur ne voit qu'un chargement, jamais l'erreur ni la
// correction). Frère de app-guards.ts : là c'est le CÂBLAGE, ici la SYNTAXE.
// ─────────────────────────────────────────────────────────────────────────────

import { parse } from "acorn";

export type SyntaxProblem = { message: string; excerpt: string };

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
// Types de <script> qui ne sont PAS du JS exécutable → à ne pas parser.
const NON_JS_TYPE = /json|template|text\/html|importmap/i;

/**
 * Parse chaque <script> JS de l'app. Renvoie la PREMIÈRE erreur de syntaxe, ou
 * null si tout est sain. Ne juge que la SYNTAXE (aucune exécution) : les fonctions
 * injectées au service (biltia, drawBars…) sont des identifiants non résolus, ce
 * qui ne gêne PAS le parseur (donc aucun faux positif de ce côté).
 */
export function findSyntaxError(html: string): SyntaxProblem | null {
  if (typeof html !== "string" || !html) return null;
  SCRIPT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_RE.exec(html)) !== null) {
    const attrs = m[1] || "";
    const code = m[2] || "";
    if (!code.trim()) continue;
    const type = (attrs.match(/type\s*=\s*["']?([^"'\s>]+)/i)?.[1] || "").toLowerCase();
    if (type && NON_JS_TYPE.test(type)) continue; // JSON-LD, gabarits : pas du code
    try {
      parse(code, {
        ecmaVersion: "latest",
        // Permissif : ces apps sont des SCRIPTS (pas des modules), souvent en IIFE
        // ou en code top-level. On ne veut AUCUN faux positif sur du JS valide.
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        allowImportExportEverywhere: true,
        allowSuperOutsideMethod: true,
      });
    } catch (e) {
      const err = e as { message?: string; pos?: number };
      const pos = typeof err.pos === "number" ? err.pos : 0;
      const excerpt = code
        .slice(Math.max(0, pos - 70), pos + 40)
        .replace(/\s+/g, " ")
        .trim();
      return {
        message: (err.message || "SyntaxError").slice(0, 200),
        excerpt: excerpt.slice(0, 160),
      };
    }
  }
  return null;
}

/** Consigne de réparation CHIRURGICALE d'une erreur de syntaxe (ne touche QUE ça). */
export function buildSyntaxRepairPrompt(p: SyntaxProblem): string {
  return [
    "⚠️ CORRECTION DE SYNTAXE JAVASCRIPT — l'application ci-dessous NE S'EXÉCUTE PAS : elle contient une erreur de syntaxe qui la rend BLANCHE à l'ouverture.",
    `Erreur du parseur : « ${p.message} »`,
    p.excerpt ? `Aux alentours de : … ${p.excerpt} …` : "",
    "",
    "Corrige UNIQUEMENT cette erreur (et toute erreur de syntaxe du MÊME type ailleurs). Ne change RIEN d'autre : ni le design, ni la logique, ni les libellés, ni les données.",
    "CAUSE N°1 à vérifier : une APOSTROPHE FRANÇAISE dans une chaîne en quotes simples (ex. notify('L'opération a réussi') ou 'd'échéance') qui ferme la chaîne au milieu du mot. Solution : repasse CES chaînes en guillemets DOUBLES (\"L'opération a réussi\") ou en backticks, ou échappe l'apostrophe (une seule barre : \\'). N'AJOUTE PAS de double barre (\\\\' est FAUX et casse aussi).",
    "Vérifie ensuite les parenthèses / accolades / crochets non refermés autour de la zone signalée.",
    "",
    "Renvoie l'application ENTIÈRE corrigée — le document HTML complet, du <!DOCTYPE html> jusqu'au </html>. AUCUN texte avant ou après, aucun bloc markdown.",
  ]
    .filter(Boolean)
    .join("\n");
}
