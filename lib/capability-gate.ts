// ─────────────────────────────────────────────────────────────────────────────
// LA PORTE DE CAPACITÉ DU CHAT — une seule, avant tout aiguillage.
//
// LE BUG, ET IL EST ARCHITECTURAL (constaté en prod le 2026-07-14) :
// l'artisan demande une action qui réclame un outil. Le copilote répond « Je m'en
// occupe. Un lien te sera partagé ici dès que c'est fait. » Trois mensonges en une
// phrase : l'outil n'était pas connecté (l'état réel était pourtant dans son
// contexte), aucun bouton ne lui était proposé pour le connecter, et rien n'est
// jamais parti.
//
// LA CAUSE N'EST PAS LE MODÈLE. Chaque branche de /api/generate vérifiait ses
// connexions DANS SON COIN — quand elle le faisait. Le chemin "answer", fourre-tout
// du copilote qui récupère tout ce qui a été mal aiguillé, ne vérifiait rien, ne
// pouvait rien exécuter, et ne savait pas afficher de carte « Connecter ». Un prompt
// lui interdisait par ailleurs de dire « je ne peux pas ». Il ne lui restait qu'une
// sortie : promettre. Le mensonge n'était pas une défaillance du modèle, c'était la
// seule issue que l'architecture lui laissait.
//
// D'où ce fichier. UNE porte, franchie par TOUTES les demandes, AVANT que le moindre
// chemin ne se prononce. Trois questions, dans l'ordre :
//   1. cette demande a-t-elle besoin d'un outil ?   → requiredCapabilities (la POLITIQUE du chat)
//   2. cet outil est-il branché pour CET artisan ?  → le registre (getCapabilityStatuses)
//   3. sinon, quels connecteurs proposer ?          → le registre (connectorsForCapability)
//
// ⚠️ CE FICHIER NE DÉCLARE PLUS AUCUNE LISTE, ET NE SONDE PLUS RIEN LUI-MÊME.
// Il en avait une (CapabilityCode) et des sondes en propre — c'était la TROISIÈME
// copie de la même chose, après lib/connectors.ts et lib/agent-capabilities.ts. Trois
// listes qui devaient s'accorder, et que rien n'obligeait à s'accorder : elles ont
// divergé, et la divergence se voyait à l'écran (une capacité connue du chat mais
// inconnue des agents = un agent qui refuse sans proposer de bouton).
// Ici, on ne garde QUE la politique : « quel kind réclame quel outil ». L'état des
// outils vient du registre (lib/capabilities.ts + lib/agent-capabilities.ts).
//
// FAIL-OPEN, jamais fail-closed : si le registre tombe (réseau, jeton), on LAISSE
// PASSER. Bloquer une demande légitime parce qu'un appel Google a expiré, ce serait
// remplacer un mensonge par une porte close.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { connectorsForCapability, type CapabilityId } from "./capabilities";
import { getCapabilityStatuses } from "./agent-capabilities";
import { type BiltiaKind } from "./kind-heuristic";
import { pick, type Locale } from "./i18n/config";

export type CapabilityMiss = {
  code: CapabilityId;
  /** Ce qu'on dit à l'artisan. Jamais « je ne peux pas » : c'est à un clic près. */
  message: string;
  /** Les connecteurs à proposer en cartes. Toujours "live", jamais vide ici. */
  connectors: string[];
};

// ── LA POLITIQUE DU CHAT : quel kind réclame quel outil ? ────────────────────

/**
 * Les capacités qu'exige une demande, dérivées du KIND — c'est le travail de
 * l'aiguilleur : « email » veut dire messagerie, « calendar » veut dire agenda.
 *
 * C'est le SEUL endroit à toucher quand un nouveau kind mobilise un outil. Le
 * `Record` du registre garantit le reste : une capacité citée ici sans connecteurs
 * ni sonde ne compile pas.
 *
 * "rule" est volontairement ABSENT : les agents ont leur propre politique, plus riche
 * (lib/agent-readiness.ts — équipe vide, table vide, seuils…). Deux portes sur le même
 * chemin finiraient par se contredire. Elles lisent en revanche le MÊME registre.
 */
export function requiredCapabilities(kind: BiltiaKind): CapabilityId[] {
  switch (kind) {
    case "email":
    case "task":
      // Envoyer AU NOM de l'artisan exige SA boîte. Biltia sait écrire depuis sa
      // propre adresse (Resend), mais un devis parti de « no-reply@biltia » n'est pas
      // un devis de l'artisan : c'est du spam à son nom.
      return ["email_send"];
    case "calendar":
      return ["calendar_read"];
    default:
      // document, module, action, data, image, answer, rule : aucun outil externe
      // requis pour PRODUIRE. L'envoi, lui, viendra au tour suivant — et repassera ici.
      return [];
  }
}

// ── CE QU'ON DIT QUAND L'OUTIL MANQUE ────────────────────────────────────────

function say(code: CapabilityId, connectedButUnauthorized: boolean, locale: Locale): string {
  if (connectedButUnauthorized) {
    // Branché, mais sans le droit d'agir (un compte Google branché pour Gmail n'a
    // aucun droit sur l'agenda). Le renvoyer « connecter son compte » alors qu'il EST
    // connecté est le meilleur moyen de le perdre : il a déjà cliqué, il ne comprendra
    // pas qu'on lui redemande la même chose.
    switch (code) {
      case "email_send":
      case "email_send_self":
        return pick(
          locale,
          "Ton compte est branché, mais Biltia n'a pas encore le droit d'envoyer en ton nom. Reconnecte ta messagerie et j'envoie.",
          "Your account is connected, but Biltia isn't allowed to send on your behalf yet. Reconnect your mailbox and I'll send."
        );
      case "calendar_read":
        return pick(
          locale,
          "Ton compte est branché, mais Biltia n'a pas encore accès à ton agenda. Reconnecte-le et je m'en occupe.",
          "Your account is connected, but Biltia can't reach your calendar yet. Reconnect it and I'll handle it."
        );
      case "sms_send":
      case "push_notify":
        break; // rien à reconnecter : ces deux-là ne passent pas par un OAuth
    }
  }

  // Rien de branché. Le ton compte autant que le fond : ce n'est pas un refus, c'est
  // un branchement qui manque. Et on annonce ce qui se passe APRÈS le clic — la
  // reprise automatique de la demande est justement ce qui rend la carte utile.
  switch (code) {
    case "email_send":
    case "email_send_self":
      return pick(
        locale,
        "Pour envoyer en ton nom, il me faut ta messagerie. Connecte-la ci-dessous et je reprends ta demande aussitôt.",
        "To send on your behalf I need your mailbox. Connect it below and I'll pick your request straight back up."
      );
    case "calendar_read":
      return pick(
        locale,
        "Pour ça, il me faut ton agenda. Connecte-le ci-dessous et je reprends ta demande aussitôt.",
        "For that I need your calendar. Connect it below and I'll pick your request straight back up."
      );
    case "sms_send":
      return pick(
        locale,
        "L'envoi de SMS n'est pas disponible aujourd'hui. Je peux le faire par email à la place.",
        "Text messaging isn't available today. I can do it by email instead."
      );
    case "push_notify":
      return pick(
        locale,
        "Les notifications ne sont pas activées. Tu peux les activer dans tes réglages.",
        "Notifications are turned off. You can enable them in your settings."
      );
  }
}

/**
 * LA PORTE. `null` = tout ce qu'il faut est branché, la demande continue son chemin.
 *
 * Deux cas passent SANS carte, et c'est délibéré :
 *   · le registre est tombé → on laisse passer (fail-open, voir l'en-tête) ;
 *   · aucun connecteur "live" ne couvre la capacité manquante → une carte qui ne mène
 *     nulle part serait une insulte de plus. Le chemin normal reprend la main et
 *     expliquera honnêtement la limite (c'est le cas du SMS : rien à connecter, le
 *     fournisseur est au niveau de la plateforme).
 */
export async function capabilityGate(opts: {
  supabase: SupabaseClient;
  tenantId: string;
  userId: string;
  kind: BiltiaKind;
  locale: Locale;
}): Promise<CapabilityMiss | null> {
  const { supabase, tenantId, userId, kind, locale } = opts;

  const besoins = requiredCapabilities(kind);
  if (!besoins.length) return null;

  let statuses: Awaited<ReturnType<typeof getCapabilityStatuses>>;
  try {
    statuses = await getCapabilityStatuses({ supabase, tenantId, userId, locale });
  } catch {
    return null; // registre indisponible → on ne barre la route à personne
  }

  for (const code of besoins) {
    const st = statuses[code];
    if (!st || st.connected) continue;

    const connectors = connectorsForCapability(code);
    if (!connectors.length) continue;

    // `supported && !connected` = l'outil existe, il n'est pas branché. Le cas
    // « branché mais pas autorisé » (scope manquant) est déjà replié dans `connected`
    // par les sondes du registre : elles vérifient le SCOPE, pas la simple présence
    // d'une ligne en base.
    return { code, message: say(code, false, locale), connectors };
  }

  return null;
}
