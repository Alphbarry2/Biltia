// ─────────────────────────────────────────────────────────────────────────────
// LE MÉTIER DE L'ARTISAN — SOURCE UNIQUE, PARTAGÉE PAR TOUTES LES ROUTES IA.
//
// Décision user (2026-07-12) : « je suis électricien → tu dois TOUJOURS me
// proposer des choses d'électricien ». Le métier était bien capturé (onboarding
// + réglages) et lu par /api/generate et /api/ask, mais /api/analyze,
// /api/clarify, /api/automate, /api/annotate et /api/file-intent en étaient
// AVEUGLES : un électricien qui déposait un plan se voyait proposer un métré
// peinture/carrelage. Ce helper est le raccordement manquant.
//
// RÈGLE DU PRINCIPAL : le PREMIER métier coché est le principal. C'est déjà ce
// que font l'onboarding et les réglages (`sectors[0]` → `profiles.sector`) ; on
// s'aligne dessus et on le REDIT au modèle — c'est sur lui qu'on se base quand
// plusieurs métiers sont déclarés.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCategory, catLabel, buildKnowledgeBlock } from "./btp-catalog";
import type { Locale } from "./i18n/config";

export type SectorContext = {
  /** Métier PRINCIPAL (le premier coché). null si rien de déclaré. */
  primary: string | null;
  /** Tous les métiers déclarés, principal en tête. */
  all: string[];
  activityType: string | null;
  detail: string | null;
  /** Bloc prêt à injecter dans un system prompt. "" si aucun métier déclaré. */
  block: string;
};

const EMPTY: SectorContext = { primary: null, all: [], activityType: null, detail: null, block: "" };

/**
 * Construit le bloc de prompt « métier de l'utilisateur ». Séparé de la lecture
 * DB pour être testable et réutilisable quand le secteur est déjà en main.
 */
export function buildSectorBlock(
  sectors: string[],
  activityType: string | null,
  detail: string | null,
  locale: Locale = "fr"
): string {
  if (!sectors.length && !activityType && !detail) return "";

  const primary = sectors[0] ?? null;
  const primaryLabel = primary ? (catLabel(getCategory(primary)?.label ?? primary, locale) || primary) : null;
  const othersLabels = sectors
    .slice(1)
    .map((id) => catLabel(getCategory(id)?.label ?? id, locale) || id)
    .filter(Boolean);

  const subTradeIds = [
    ...new Set(sectors.flatMap((id) => getCategory(id)?.subTrades.map((s) => s.id) ?? [])),
  ];

  const lines: string[] = ["# LE MÉTIER DE L'UTILISATEUR — ADAPTE TOUT À CE MÉTIER"];
  if (primaryLabel) {
    lines.push(
      `Métier PRINCIPAL : **${primaryLabel}**. C'est SA référence : quand tu dois choisir, trancher ou proposer, tu te bases sur CE métier.`
    );
  }
  if (othersLabels.length) {
    lines.push(`Il exerce AUSSI : ${othersLabels.join(", ")} (secondaires — le principal prime).`);
  }
  if (detail) lines.push(`Précision qu'il a lui-même donnée : « ${detail} ».`);

  lines.push(
    "",
    "CE QUE ÇA CHANGE, CONCRÈTEMENT :",
    "- Tes PROPOSITIONS, tes exemples, ton vocabulaire, les CHAMPS et les POSTES que tu crées sont ceux de SON métier — pas ceux d'un autre corps d'état.",
    "- Un électricien qui te donne un plan attend un relevé de points lumineux, prises, interrupteurs, tableau, circuits, gaines — PAS un métré peinture/carrelage. Un plombier attend points d'eau, évacuations, radiateurs, colonnes. Un peintre attend surfaces murs/plafonds, couches, rendement. Un carreleur attend surfaces de sol, chutes, calepinage. Chaque métier a SES postes : sers-lui les SIENS.",
    "- Si la demande sort clairement de son métier, tu la traites quand même (il peut sous-traiter, ou gérer un chantier global) — mais tu PARS TOUJOURS de son métier.",
    "- Ne lui demande JAMAIS quel est son métier : tu le sais déjà."
  );

  const knowledge =
    subTradeIds.length || activityType || detail
      ? buildKnowledgeBlock(subTradeIds, activityType, detail)
      : "";

  return [lines.join("\n"), knowledge].filter(Boolean).join("\n\n");
}

/**
 * Lit le métier déclaré (profiles.sector = PRINCIPAL, preferences.sectors = tous)
 * et renvoie le contexte + le bloc de prompt. Jamais bloquant : un échec DB
 * renvoie un contexte vide (le prompt marche sans, il est juste moins ciblé).
 */
export async function getSectorContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  locale: Locale = "fr"
): Promise<SectorContext> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("sector, preferences")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return EMPTY;

    const prefs = (data.preferences ?? {}) as {
      sectors?: unknown;
      activity_type?: unknown;
      sector_detail?: unknown;
    };
    const primary = typeof data.sector === "string" && data.sector ? data.sector : null;
    const declared = Array.isArray(prefs.sectors)
      ? prefs.sectors.filter((s): s is string => typeof s === "string" && s.length > 0)
      : [];

    // Le PRINCIPAL est le premier coché : profiles.sector fait foi et passe en
    // tête, même si preferences.sectors a été réordonné ailleurs.
    const all = [...new Set([...(primary ? [primary] : []), ...declared])].slice(0, 6);
    const activityType = typeof prefs.activity_type === "string" ? prefs.activity_type : null;
    const detail = typeof prefs.sector_detail === "string" ? prefs.sector_detail : null;

    if (!all.length && !activityType && !detail) return EMPTY;

    return {
      primary: all[0] ?? null,
      all,
      activityType,
      detail,
      block: buildSectorBlock(all, activityType, detail, locale),
    };
  } catch {
    return EMPTY; // jamais bloquant
  }
}
