// ─────────────────────────────────────────────────────────────────────────────
// LE REGISTRE DES CAPACITÉS — la LISTE, déclarée UNE SEULE FOIS.
//
// LE BUG QU'ON TUE ICI (incidents des 2026-07-10 et 2026-07-14) : il existait
// TROIS listes de capacités, qui devaient s'accorder et que RIEN n'obligeait à
// s'accorder :
//   1. CONNECTORS_FOR_CAPABILITY (lib/connectors.ts) — quels connecteurs donnent
//      un bouton « Connecter » ;
//   2. CapabilityId (lib/agent-capabilities.ts) — ce dont un AGENT peut avoir
//      besoin, et comment le sonder ;
//   3. CapabilityCode (lib/capability-gate.ts) — ce dont le CHAT peut avoir
//      besoin, et comment le sonder.
//
// Elles ont divergé, et la divergence se voyait à l'écran : une capacité présente
// dans (1) mais pas dans (2) donnait un agent qui refusait la mission SANS jamais
// proposer le bouton qui l'aurait débloquée. À l'inverse, `sms_send` existait dans
// (2) mais pas dans (1) : aucune carte ne pouvait sortir pour lui, jamais.
//
// LA CAUSE EXACTE, et elle tient en un mot : la table était typée
// `Record<string, string[]>`. Le commentaire au-dessus disait « Clé = CapabilityId ».
// Le TYPE, lui, disait « n'importe quelle chaîne ». Une règle écrite en commentaire
// n'est pas une règle : c'est un vœu que le compilateur ignore poliment.
//
// ICI, `Record<CapabilityId, …>`. Ajouter une capacité SANS déclarer ses connecteurs
// ne compile plus. Déclarer des connecteurs pour une capacité qui n'existe pas ne
// compile plus. La liste ne PEUT plus diverger — ce n'est plus une question de
// vigilance, c'est une question de build.
//
// ── POURQUOI DEUX FICHIERS ────────────────────────────────────────────────────
// La FRONTIÈRE CLIENT/SERVEUR, et elle seule :
//   · ICI (client-safe, pur) : la LISTE et les connecteurs qui fournissent chaque
//     capacité. Un composant client en a besoin (components/agent-templates.tsx
//     affiche les cartes) — donc aucun import serveur, aucun accès base.
//   · lib/agent-capabilities.ts (serveur) : les SONDES (« est-ce branché pour CET
//     artisan ? »), qui touchent Supabase et les jetons OAuth.
// La liste, elle, n'est déclarée qu'ICI. Les deux surfaces (chat et agents) la
// lisent. C'est ça, la source unique.
//
// ── AJOUTER UN OUTIL ──────────────────────────────────────────────────────────
//   1. le connecteur au catalogue          → lib/connectors.ts
//   2. la capacité + ses connecteurs       → ICI (le compilateur exige la suite)
//   3. la sonde « est-ce branché ? »       → lib/agent-capabilities.ts
//   4. la POLITIQUE (qui en a besoin, et est-ce bloquant) :
//        · chat   → lib/capability-gate.ts
//        · agents → lib/agent-readiness.ts
// Les étapes 2 et 3 sont vérifiées par le build. On ne peut plus en oublier une.
// ─────────────────────────────────────────────────────────────────────────────

import { getConnector, isConnectable } from "./connectors";

/**
 * Les outils que Biltia peut mobiliser. LA liste — il n'y en a pas d'autre.
 *
 * ⚠️ DEUX capacités d'email, et la distinction n'est pas cosmétique :
 *   · email_send      = écrire à un TIERS (client, fournisseur, employé) EN SON NOM.
 *                       Exige la boîte DE L'ARTISAN (Gmail/Outlook) : une relance de
 *                       facture partie d'une adresse Biltia n'est pas la sienne, et
 *                       le client ne peut pas y répondre.
 *   · email_send_self = LUI écrire À LUI. Biltia sait le faire depuis sa propre
 *                       adresse (Resend) : aucun connecteur requis dans le cas normal.
 * Les confondre a rendu tout le préflight inopérant pendant des semaines
 * (canSendOutbound().ok est vrai dès que Resend existe, c'est-à-dire toujours).
 */
export type CapabilityId =
  | "email_send"
  | "email_send_self"
  | "sms_send"
  | "calendar_read"
  | "push_notify";

/**
 * Quels connecteurs FOURNISSENT chaque capacité. `Record<CapabilityId, …>` : la
 * table est EXHAUSTIVE, le compilateur l'exige. Une liste vide est une réponse
 * valide et volontaire — elle dit « rien à connecter ici » (voir plus bas).
 *
 * PLUSIEURS connecteurs par capacité : un artisan sous Microsoft 365 n'a pas de
 * Gmail. Lui proposer « Connecter Gmail » comme unique issue, c'est lui demander
 * d'ouvrir un compte chez le concurrent de sa messagerie. On propose les deux, il
 * choisit. L'ordre compte : la première carte est la plus mise en avant.
 */
const CAPABILITY_CONNECTORS: Record<CapabilityId, string[]> = {
  email_send: ["gmail", "outlook"],
  // Lui écrire À LUI : Biltia y arrive depuis sa propre adresse, donc cette capacité
  // ne manque presque jamais. Si elle manque (plus aucun canal d'envoi), ce sont les
  // mêmes cartes qui règlent le problème.
  email_send_self: ["gmail", "outlook"],
  calendar_read: ["google-calendar", "outlook-calendar"],

  // ── LES DEUX QUI N'ONT RIEN À CONNECTER, ET C'EST UNE RÉPONSE, PAS UN OUBLI ──
  // Elles étaient ABSENTES de l'ancienne table, ce qui est très différent : absentes,
  // elles tombaient dans un `?? []` silencieux, indiscernable d'une capacité qu'on
  // aurait oublié de câbler. Déclarées vides, elles DISENT quelque chose.
  //
  // SMS : le fournisseur (Twilio) est branché au niveau de la PLATEFORME, pas du
  // compte. L'artisan n'a rien à connecter — soit Biltia sait envoyer des SMS, soit
  // il ne sait pas. Un bouton « Connecter » ici serait un bouton mort.
  sms_send: [],
  // Notifications : une permission du NAVIGATEUR, pas un OAuth. Elle se règle dans
  // les réglages (l'UI garde son lien « aller régler »), pas par une carte.
  push_notify: [],
};

/**
 * Les connecteurs à PROPOSER pour un manque. Vide = rien à connecter (cas prévu
 * côté UI : pas de bouton, on garde le lien « aller régler »).
 *
 * Le filtre `isConnectable` n'est pas une précaution, c'est LA règle d'honnêteté,
 * au seul endroit qui la garantit : cette liste alimente toutes les cartes
 * « Connecter » du produit (chat, agents, génération). Sans lui, un connecteur passé
 * en "soon" continuerait d'apparaître avec un bouton que /api/connections refuse —
 * l'artisan clique, rien ne se passe. Un bouton mort est pire qu'un bouton absent.
 * On filtre ICI plutôt que chez les appelants : le prochain appelant l'obtient sans
 * avoir à y penser.
 *
 * Signature volontairement large (`string`) : les manques d'AGENT portent aussi des
 * codes qui ne sont pas des capacités (team_empty, data_empty, stock_seuil…). Ils
 * retombent naturellement sur « aucun connecteur ». C'est la TABLE qui est typée
 * strictement — c'est là que la divergence était possible, pas ici.
 */
export function connectorsForCapability(code: string): string[] {
  const ids = (CAPABILITY_CONNECTORS as Record<string, string[] | undefined>)[code] ?? [];
  return ids.filter((id) => {
    const c = getConnector(id);
    return !!c && isConnectable(c);
  });
}
