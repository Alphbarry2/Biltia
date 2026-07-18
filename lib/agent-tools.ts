// ─────────────────────────────────────────────────────────────────────────────
// AGENT TOOLS — le WORKSPACE ENTIER exposé comme outils IA (« accès à tout »).
//
// Toutes les entités du registre (lib/data-entities.ts) deviennent 5 outils Claude :
// lister/chercher, lire, créer, modifier, supprimer. Utilisés par :
//   • le CHAT (kind "data") — « ajoute un client Jean Dupont », « supprime le
//     client Martin », « passe le devis D-12 en accepté » → exécuté, confirmé.
//   • l'EXÉCUTEUR d'agents (lib/agent-executor.ts) — les missions planifiées
//     lisent ET écrivent le workspace à chaque passage.
//
// Sécurité (mêmes remparts que /api/data) :
//   1. Whitelist d'entités (ALLOWED_ENTITIES) — rien d'autre n'est accessible.
//   2. Colonnes inscriptibles whitelistées — le reste est ignoré.
//   3. tenant_id FORCÉ sur chaque opération (le modèle ne le voit jamais).
//   4. Suppression UNITAIRE uniquement (jamais de bulk par l'IA).
//   5. RLS en dernier rempart quand le client est une session ; l'exécuteur
//      (service_role) reste scopé par le filtre tenant explicite.
//   6. Chaque écriture est journalisée dans activity_logs.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { client } from "@/lib/llm";
import { ENTITIES, ALLOWED_ENTITIES } from "./data-entities";
import {
  runWorkspaceTransform,
  avenantFromDevis,
  isTransformAction,
  TRANSFORM_ACTIONS,
  TRANSFORM_LABEL,
} from "./workspace-transforms";
import { logActivity } from "./activity";
import { draftToolStep, draftBlockedStep, type RunStepDraft } from "./agent-observability";
import { listAppCollections, listAppRecords } from "./app-records";
import { sendOutboundEmail } from "./outbound-email";
import { sendSms } from "./outbound-sms";
import { toMessages, type ChatTurn } from "./chat-thread";

// Client base minimal (session RLS ou service_role) — motif lib/activity.ts.
type MinimalClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

// ── Définition des outils ────────────────────────────────────────────────────

const ENTITY_ENUM = ALLOWED_ENTITIES;

/** Colonne de recherche texte par entité (défaut : nom). */
const SEARCH_COLUMN: Record<string, string> = {
  catalogue: "designation",
  lignes: "designation",
  tasks: "title",
  devis: "numero",
  factures: "numero",
  interventions: "type",
  parc_installe: "type",
  pointages: "date_pointage",
  documents: "nom",
};

function entityCatalog(): string {
  return ALLOWED_ENTITIES.map((k) => `- ${k} (${ENTITIES[k].label}) : ${ENTITIES[k].fields}`).join("\n");
}

export const WORKSPACE_TOOLS: Anthropic.Tool[] = [
  {
    name: "workspace_list",
    description:
      "Liste ou cherche des fiches d'une entité du workspace. `search` filtre sur le champ principal (nom/désignation/numéro). `match` filtre par égalité exacte (ex: {\"statut\":\"en_cours\"}). Retourne au plus `limit` lignes.",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ENTITY_ENUM, description: "Entité à interroger." },
        search: { type: "string", description: "Texte cherché sur le champ principal (optionnel)." },
        match: {
          type: "object",
          description: "Filtres d'égalité exacte colonne→valeur (optionnel).",
          additionalProperties: true,
        },
        order: { type: "string", description: "Colonne de tri (défaut created_at)." },
        limit: { type: "integer", description: "Max lignes (défaut 20, max 50)." },
      },
      required: ["entity"],
      additionalProperties: false,
    },
  },
  {
    name: "workspace_get",
    description: "Lit UNE fiche par son id.",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ENTITY_ENUM },
        id: { type: "string", description: "uuid de la fiche." },
      },
      required: ["entity", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "workspace_create",
    description:
      "Crée une fiche. `values` = les champs de l'entité (voir le catalogue dans le prompt système). Champ optionnel inconnu/vide → omets-le (jamais de chaîne vide).",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ENTITY_ENUM },
        values: { type: "object", description: "Champs à écrire.", additionalProperties: true },
      },
      required: ["entity", "values"],
      additionalProperties: false,
    },
  },
  {
    name: "workspace_update",
    description: "Met à jour UNE fiche existante (par id). `values` = uniquement les champs à changer.",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ENTITY_ENUM },
        id: { type: "string" },
        values: { type: "object", additionalProperties: true },
      },
      required: ["entity", "id", "values"],
      additionalProperties: false,
    },
  },
  {
    name: "workspace_delete",
    description:
      "Supprime UNE fiche (par id). UNIQUEMENT après l'avoir identifiée sans ambiguïté (workspace_list d'abord). Jamais en masse.",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ENTITY_ENUM },
        id: { type: "string" },
      },
      required: ["entity", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "workspace_transform",
    description:
      "Transforme UNE fiche existante en une autre, sans re-saisie (rattachements repris, liens posés, idempotent). PRÉFÈRE cet outil à workspace_create quand la fiche cible dérive d'une source : " +
      TRANSFORM_ACTIONS.map((a) => `${a} = ${TRANSFORM_LABEL[a]}`).join(" ; ") +
      ". `source_id` = l'uuid de la fiche SOURCE (le devis pour chantier_from_devis/…, la demande, la note). Retourne la fiche créée (ou l'existante si déjà liée).",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: [...TRANSFORM_ACTIONS], description: "La transformation à appliquer." },
        source_id: { type: "string", description: "uuid de la fiche source (devis / demande / note)." },
      },
      required: ["action", "source_id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_avenant",
    description:
      "Crée un AVENANT (un VRAI objet, pas du texte) à partir d'un devis existant : un nouveau devis de type « avenant », lié au devis source, avec les LIGNES SUPPLÉMENTAIRES. Le SERVEUR calcule les montants HT/TVA/TTC — tu ne fournis JAMAIS de total, SEULEMENT les lignes (désignation, quantité, prix unitaire HT, taux de TVA). Trouve d'abord le devis source (workspace_list sur devis), puis appelle cet outil.",
    input_schema: {
      type: "object",
      properties: {
        devis_id: { type: "string", description: "uuid du devis SOURCE." },
        lignes: {
          type: "array",
          description: "Lignes supplémentaires de l'avenant.",
          items: {
            type: "object",
            properties: {
              designation: { type: "string", description: "Description de la prestation." },
              quantite: { type: "number", description: "Quantité (défaut 1)." },
              unite: { type: "string", description: "Unité (u, m², h, forfait…)." },
              prix_unitaire_ht: { type: "number", description: "Prix unitaire HT (en euros)." },
              taux_tva: { type: "number", description: "Taux de TVA en % (défaut 20 ; 10 ou 5,5 en rénovation)." },
            },
            required: ["designation", "prix_unitaire_ht"],
            additionalProperties: false,
          },
        },
      },
      required: ["devis_id", "lignes"],
      additionalProperties: false,
    },
  },
];

// Lecture des données d'apps HORS entités standard (collections libres, table
// app_records). Toujours disponibles : lecture seule, aucun risque. Sans elles,
// l'agent est aveugle à tout ce que les apps stockent en dehors du registre.
export const APP_DATA_TOOLS: Anthropic.Tool[] = [
  {
    name: "app_collections",
    description:
      "Liste les COLLECTIONS de données créées par les applications de l'utilisateur (données hors entités workspace standard) : chaque nom de collection + son nombre de fiches. Appelle-le AVANT de dire « je n'ai pas cette donnée » : elle est peut-être dans une collection d'app.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "app_data_list",
    description:
      "Lit les fiches d'une collection d'app (nom exact obtenu via app_collections). `match` filtre par égalité sur les champs. Lecture seule.",
    input_schema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Nom exact de la collection (voir app_collections)." },
        match: {
          type: "object",
          description: "Filtres d'égalité optionnels champ→valeur (ex : {\"statut\":\"en_retard\"}).",
          additionalProperties: true,
        },
        limit: { type: "integer", description: "Max fiches (défaut 50, max 200)." },
      },
      required: ["collection"],
      additionalProperties: false,
    },
  },
];

// Envoi d'email : les « mains » de l'agent vers l'extérieur. OPT-IN (activé par
// l'appelant via allowEmail) — le chat lecture seule ne l'a pas par défaut.
export const SEND_EMAIL_TOOL: Anthropic.Tool = {
  name: "send_email",
  description:
    "Envoie un email AU NOM de l'entreprise. Canal choisi automatiquement : le Gmail connecté de l'utilisateur si disponible (les réponses lui reviennent), sinon l'envoi transactionnel Biltia. N'envoie QUE si la mission le demande explicitement, à des destinataires que tu as identifiés (workspace ou collections d'app). JAMAIS de placeholder ([nom], XXX) : si une donnée manque, n'envoie pas — signale-le.",
  input_schema: {
    type: "object",
    properties: {
      to: { type: "array", items: { type: "string" }, description: "Adresses email des destinataires." },
      subject: { type: "string", description: "Objet de l'email." },
      body: {
        type: "string",
        description: "Corps de l'email, prêt à envoyer (français professionnel, signé au nom de l'entreprise).",
      },
    },
    required: ["to", "subject", "body"],
    additionalProperties: false,
  },
};

// Envoi de SMS : relances/confirmations vers les mobiles clients. OPT-IN (allowSms).
export const SEND_SMS_TOOL: Anthropic.Tool = {
  name: "send_sms",
  description:
    "Envoie un SMS court AU NOM de l'entreprise (relance de facture, confirmation de RDV…). Idéal quand le client ne lit pas ses mails. N'envoie QUE si la mission le demande, à des numéros identifiés (workspace/collections d'app). Numéros au format +33… de préférence. JAMAIS de placeholder : si le numéro ou une donnée manque, n'envoie pas et signale-le.",
  input_schema: {
    type: "object",
    properties: {
      to: { type: "array", items: { type: "string" }, description: "Numéros des destinataires (ex : +33612345678)." },
      body: {
        type: "string",
        description: "Message court (≤ ~300 caractères conseillé), signé du nom de l'entreprise.",
      },
    },
    required: ["to", "body"],
    additionalProperties: false,
  },
};

/** Bloc système : le catalogue des entités + les règles d'opérateur. */
export function buildWorkspaceToolsSystem(): string {
  return `# LE WORKSPACE (tu y as accès TOTAL via les outils workspace_*)

## Entités disponibles
${entityCatalog()}

## Données d'applications (hors entités standard)
Certaines apps de l'utilisateur stockent leurs données dans des COLLECTIONS libres
(hors du catalogue ci-dessus). Pour toute question qui pourrait les concerner :
appelle d'abord \`app_collections\` (inventaire), puis \`app_data_list(collection)\`
pour lire. Ne réponds JAMAIS « je n'ai pas cette donnée » sans avoir vérifié les
collections d'app — la donnée y est peut-être.

## Règles d'opérateur (ABSOLUES)
1. RÉSOUDRE AVANT D'AGIR : pour modifier/supprimer, commence par workspace_list (search) pour identifier LA fiche. Tu ne devines JAMAIS un id.
2. AMBIGUÏTÉ = STOP : plusieurs fiches correspondent → tu ne modifies RIEN, tu listes les candidats dans ta réponse et tu demandes de préciser.
3. INTROUVABLE = HONNÊTETÉ : la fiche n'existe pas (workspace ET collections d'app vérifiés) → tu le dis, et tu proposes de la créer si pertinent.
4. Champs : respecte STRICTEMENT les noms et enums du catalogue. Optionnel vide → omets la clé (jamais "").
5. Relations : un champ *_id se remplit avec l'uuid d'une fiche EXISTANTE (workspace_list pour le trouver). Si la fiche liée n'existe pas, crée-la d'abord.
6. Suppression : UNE fiche à la fois, identifiée sans ambiguïté.
7. TRANSFORMER plutôt que recréer : pour « ouvrir le chantier d'un devis accepté », « faire un devis à partir d'une demande », « transformer une note en tâche/réserve », utilise \`workspace_transform\` (source_id = l'uuid de la fiche source). Il reprend les rattachements, pose les liens retour et évite les doublons — bien mieux qu'un workspace_create manuel.`;
}

// ── Exécution des outils ─────────────────────────────────────────────────────

/** Nettoie les valeurs : colonnes whitelistées, "" → null (motif /api/data). */
function sanitize(values: unknown, writable: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!values || typeof values !== "object") return out;
  const v = values as Record<string, unknown>;
  for (const key of writable) {
    if (!(key in v)) continue;
    let val = v[key];
    if (typeof val === "string" && val.trim() === "") val = null;
    out[key] = val;
  }
  return out;
}

/** Nom lisible d'une ligne (journal + confirmations). */
function rowName(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const n = row.nom ?? row.designation ?? row.title ?? row.numero ?? row.type ?? "";
  return typeof n === "string" && n.trim() ? n.trim().slice(0, 60) : "";
}

export type ToolActor = {
  tenantId: string;
  userId?: string | null;
  label: string;
  /** Email de l'acteur — reply-to du repli Resend quand l'agent envoie un email. */
  fromEmail?: string | null;
};

export type ToolTrace = { action: "create" | "update" | "delete" | "email" | "sms"; description: string };

/**
 * Exécute un appel d'outil workspace_*. Tenant forcé, colonnes whitelistées.
 * Retourne un résultat JSON-sérialisable pour le tool_result (jamais de throw :
 * l'erreur est renvoyée AU MODÈLE, qui la gère dans sa réponse).
 */
export async function runWorkspaceTool(
  db: MinimalClient,
  actor: ToolActor,
  toolName: string,
  input: Record<string, unknown>,
  traces: ToolTrace[]
): Promise<Record<string, unknown>> {
  const entity = typeof input.entity === "string" ? input.entity : "";
  if (!ALLOWED_ENTITIES.includes(entity)) {
    return { error: `Entité non autorisée : ${entity}` };
  }
  const def = ENTITIES[entity];
  const { tenantId } = actor;

  const log = (action: string, description: string, entityId?: string | null) =>
    logActivity(db, {
      tenantId,
      userId: actor.userId ?? undefined,
      action,
      entityType: def.label,
      entityId,
      description: `${actor.label} — ${description}`,
    });

  try {
    if (toolName === "workspace_list") {
      const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
      let q = db.from(def.table).select("*").eq("tenant_id", tenantId);
      if (typeof input.search === "string" && input.search.trim()) {
        const col = SEARCH_COLUMN[entity] ?? "nom";
        q = q.ilike(col, `%${input.search.trim()}%`);
      }
      if (input.match && typeof input.match === "object") {
        for (const [k, v] of Object.entries(input.match as Record<string, unknown>)) {
          // Colonnes de filtre limitées au schéma connu (id inclus pour les jointures).
          if (k === "id" || def.writable.includes(k)) q = q.eq(k, v);
        }
      }
      q = q.order(typeof input.order === "string" ? input.order : "created_at", { ascending: false }).limit(limit);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: (data ?? []).length, rows: data ?? [] };
    }

    if (toolName === "workspace_get") {
      const { data, error } = await db
        .from(def.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", String(input.id ?? ""))
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: "Fiche introuvable." };
      return { row: data };
    }

    if (toolName === "workspace_create") {
      const values = sanitize(input.values, def.writable);
      if (Object.keys(values).length === 0) return { error: "Aucun champ valide fourni." };
      const { data, error } = await db
        .from(def.table)
        .insert({ ...values, tenant_id: tenantId })
        .select()
        .single();
      if (error) return { error: error.message };
      const name = rowName(data);
      const desc = `${def.label}${name ? ` « ${name} »` : ""} — ajout`;
      traces.push({ action: "create", description: desc });
      await log("create", desc, data?.id ?? null);
      return { ok: true, row: data };
    }

    if (toolName === "workspace_update") {
      const id = String(input.id ?? "");
      if (!id) return { error: "id manquant." };
      const values = sanitize(input.values, def.writable);
      if (Object.keys(values).length === 0) return { error: "Aucun champ valide fourni." };
      const { data, error } = await db
        .from(def.table)
        .update(values)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select()
        .single();
      if (error) return { error: error.message };
      const name = rowName(data);
      const desc = `${def.label}${name ? ` « ${name} »` : ""} — mise à jour (${Object.keys(values).join(", ")})`;
      traces.push({ action: "update", description: desc });
      await log("update", desc, id);
      return { ok: true, row: data };
    }

    if (toolName === "workspace_delete") {
      const id = String(input.id ?? "");
      if (!id) return { error: "id manquant." };
      // Lecture préalable : la confirmation cite CE qui a été supprimé.
      const { data: existing } = await db
        .from(def.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .maybeSingle();
      if (!existing) return { error: "Fiche introuvable (déjà supprimée ?)." };
      const { error } = await db.from(def.table).delete().eq("tenant_id", tenantId).eq("id", id);
      if (error) return { error: error.message };
      const name = rowName(existing);
      const desc = `${def.label}${name ? ` « ${name} »` : ""} — suppression`;
      traces.push({ action: "delete", description: desc });
      await log("delete", desc, id);
      return { ok: true, deleted: { id, name } };
    }

    return { error: `Outil inconnu : ${toolName}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur base de données." };
  }
}

/**
 * Dispatcher UNIQUE de tous les outils d'agent : lecture app_records, envoi
 * d'email, ou opération workspace. Route vers le bon handler. Ne throw jamais
 * (l'erreur revient AU MODÈLE dans le tool_result).
 */
export async function runAgentTool(
  db: MinimalClient,
  actor: ToolActor,
  toolName: string,
  input: Record<string, unknown>,
  traces: ToolTrace[]
): Promise<Record<string, unknown>> {
  // ── Lecture des collections d'apps (app_records) ──────────────────────────
  if (toolName === "app_collections") {
    const collections = await listAppCollections(db, actor.tenantId);
    return { count: collections.length, collections };
  }
  if (toolName === "app_data_list") {
    const collection = typeof input.collection === "string" ? input.collection : "";
    const res = await listAppRecords(db, actor.tenantId, collection, {
      match: (input.match as Record<string, unknown> | undefined) ?? undefined,
      limit: Number(input.limit) || undefined,
    });
    return res as Record<string, unknown>;
  }

  // ── Envoi d'email (opt-in : le tool n'est proposé que si allowEmail) ──────
  if (toolName === "send_email") {
    const to = Array.isArray(input.to) ? input.to.map(String).filter((e) => e.includes("@")) : [];
    const subject = String(input.subject ?? "").trim().slice(0, 200);
    const bodyText = String(input.body ?? "").slice(0, 6000);
    if (!to.length || !subject || !bodyText) {
      return { error: "Email incomplet : destinataire valide, objet et corps requis." };
    }
    const sent = await sendOutboundEmail({
      tenantId: actor.tenantId,
      userId: actor.userId ?? null,
      fromEmail: actor.fromEmail ?? null,
      to,
      subject,
      body: bodyText,
    });
    if (!sent.ok) return { error: sent.reason };
    const desc = `Email « ${subject} » → ${to.join(", ")} (${sent.via})`;
    traces.push({ action: "email", description: desc });
    await logActivity(db, {
      tenantId: actor.tenantId,
      userId: actor.userId ?? undefined,
      action: "send",
      entityType: "email",
      description: `${actor.label} — ${desc}`,
    });
    return { ok: true, via: sent.via, note: sent.note };
  }

  // ── Envoi de SMS (opt-in : le tool n'est proposé que si allowSms) ─────────
  if (toolName === "send_sms") {
    const to = Array.isArray(input.to) ? input.to.map(String).filter(Boolean) : [];
    const bodyText = String(input.body ?? "").trim();
    if (!to.length || !bodyText) return { error: "SMS incomplet : au moins un numéro et un message requis." };
    const sent = await sendSms({ to, body: bodyText });
    if (!sent.ok) return { error: sent.reason };
    const desc = `SMS → ${to.join(", ")} (${sent.sent} envoyé${sent.sent > 1 ? "s" : ""}${sent.failed ? `, ${sent.failed} échec` : ""})${sent.note ? ` — ${sent.note}` : ""}`;
    traces.push({ action: "sms", description: desc });
    await logActivity(db, {
      tenantId: actor.tenantId,
      userId: actor.userId ?? undefined,
      action: "send",
      entityType: "sms",
      description: `${actor.label} — ${desc}`,
    });
    // `note` remonte au modèle : s'il a été plafonné, il doit le DIRE dans son
    // compte-rendu plutôt que d'affirmer avoir prévenu tout le monde.
    return { ok: true, sent: sent.sent, failed: sent.failed, note: sent.note };
  }

  // ── Transformation atomique (devis→chantier, demande→devis, note→tâche/réserve) ──
  if (toolName === "workspace_transform") {
    const action = typeof input.action === "string" ? input.action : "";
    if (!isTransformAction(action)) return { error: `Transformation inconnue : ${action}` };
    const sourceId = String(input.source_id ?? input.sourceId ?? "");
    const log = (act: string, description: string, entityId?: string | null) =>
      logActivity(db, {
        tenantId: actor.tenantId,
        userId: actor.userId ?? undefined,
        action: act,
        entityType: "workspace",
        entityId,
        description: `${actor.label} — ${description}`,
      });
    const r = await runWorkspaceTransform({
      from: (t: string) => db.from(t),
      tenantId: actor.tenantId,
      action,
      sourceId,
      log,
    });
    if (r.error) return { error: r.error };
    traces.push({ action: "create", description: `Transformation ${action} (source ${sourceId})` });
    return { ok: true, row: r.data };
  }

  // ── Avenant depuis un devis (vrai objet ; montants calculés SERVEUR) ───────
  if (toolName === "create_avenant") {
    const devisId = String(input.devis_id ?? input.devisId ?? "");
    const raw = Array.isArray(input.lignes) ? input.lignes : Array.isArray(input.lines) ? input.lines : [];
    const lines = raw.map((item) => {
      const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        designation: String(o.designation ?? ""),
        quantite: o.quantite != null ? Number(o.quantite) : undefined,
        unite: typeof o.unite === "string" ? o.unite : null,
        prix_unitaire_ht: Number(o.prix_unitaire_ht) || 0,
        taux_tva: o.taux_tva != null ? Number(o.taux_tva) : undefined,
      };
    });
    const log = (act: string, description: string, entityId?: string | null) =>
      logActivity(db, {
        tenantId: actor.tenantId,
        userId: actor.userId ?? undefined,
        action: act,
        entityType: "workspace",
        entityId,
        description: `${actor.label} — ${description}`,
      });
    const r = await avenantFromDevis({ from: (t: string) => db.from(t), tenantId: actor.tenantId, devisId, lines, log });
    if (r.error) return { error: r.error };
    traces.push({ action: "create", description: `Avenant créé (devis source ${devisId})` });
    return { ok: true, row: r.data };
  }

  // ── Sinon : opération workspace ───────────────────────────────────────────
  return runWorkspaceTool(db, actor, toolName, input, traces);
}

// ── Boucle agentique partagée ────────────────────────────────────────────────

/** WS-C : action sensible NON exécutée, en attente de confirmation de l'utilisateur. */
export type ProposedAction = { tool: string; input: Record<string, unknown> };

export type AgentLoopResult = {
  /** Texte final du modèle (chat) — null si un outil final (compose) a été appelé. */
  finalText: string | null;
  /** Input de l'outil final si `finishToolName` a été appelé. */
  finishInput: Record<string, unknown> | null;
  /** Écritures effectuées (trace lisible). */
  traces: ToolTrace[];
  /** WS-E : étapes RÉDIGÉES (lectures + écritures) pour agent_run_steps. */
  steps: RunStepDraft[];
  /** WS-C : actions interceptées par le confirmGate, à exécuter après confirmation. */
  proposed: ProposedAction[];
  usage: { inputTokens: number; outputTokens: number };
  iterations: number;
};

/**
 * Boucle Claude + outils workspace. S'arrête quand le modèle répond en texte
 * (chat) ou appelle `finishToolName` (exécuteur : compose). Plafond d'itérations
 * strict — un agent ne part jamais en vrille.
 */
export async function runAgentLoop(opts: {
  model: string;
  system: string;
  userMessage: string;
  /**
   * LE FIL des tours précédents. Sans lui, l'opérateur reçoit le message NU :
   * « oui je valide » arrivait seul, et il répondait « Pouvez-vous préciser
   * quelle opération ? » alors que la proposition datait du tour d'avant.
   * Facultatif : un agent planifié qui s'exécute à 3 h du matin n'a pas de fil.
   */
  history?: ChatTurn[];
  db: MinimalClient;
  actor: ToolActor;
  finishTool?: Anthropic.Tool;
  /** Expose l'outil send_email (envoi sortant). Opt-in : false par défaut. */
  allowEmail?: boolean;
  /** Expose l'outil send_sms (relances/confirmations). Opt-in : false par défaut. */
  allowSms?: boolean;
  /**
   * Autorise l'outil workspace_delete. Défaut = true (chat/agents planifiés).
   * Un agent AUTONOME qui agit sans supervision (act événementiel) le met à
   * false : il peut créer/mettre à jour, JAMAIS supprimer sans humain dans la boucle.
   */
  allowDelete?: boolean;
  /**
   * WS-B : mode LECTURE SEULE — n'expose QUE les outils de lecture (workspace_list,
   * workspace_get, collections d'app). Aucune écriture/suppression/envoi possible.
   * Utilisé par le chemin RÉPONSE du chat : une question ne doit jamais rien modifier.
   */
  readOnly?: boolean;
  /**
   * WS-C : portail de confirmation. Renvoie true pour une action SENSIBLE qui ne
   * doit PAS être exécutée dans la boucle mais PROPOSÉE (collectée dans `proposed`,
   * exécutée seulement après le « oui » de l'utilisateur). Les lectures et les
   * écritures anodines (gate=false) s'exécutent normalement.
   */
  confirmGate?: (toolName: string, input: Record<string, unknown>) => boolean;
  maxIterations?: number;
  maxTokens?: number;
  /**
   * FILET DE SÛRETÉ (opt-in) : nombre MAX d'écritures destructrices (suppression
   * ou mise à jour) autorisées sur un même passage. Au-delà, l'outil n'est PAS
   * exécuté — le modèle reçoit un signal l'invitant à s'arrêter et à demander
   * confirmation. Défaut = Infinity : aucun changement pour l'exécuteur d'agents
   * planifiés (qui doivent pouvoir traiter beaucoup de fiches). Le CHAT « data »
   * le fixe bas pour qu'un « supprime tous mes clients » ne parte jamais en vrille.
   */
  maxDestructiveWrites?: number;
}): Promise<AgentLoopResult> {
  const { model, system, userMessage, history, db, actor, finishTool, allowEmail = false, allowSms = false, allowDelete = true, readOnly = false, confirmGate, maxIterations = 6, maxTokens = 1500, maxDestructiveWrites = Infinity } = opts;

  // WS-B : en lecture seule, on n'expose QUE list/get (aucune écriture ni envoi).
  const workspaceTools = readOnly
    ? WORKSPACE_TOOLS.filter((t) => t.name === "workspace_list" || t.name === "workspace_get")
    : allowDelete
      ? WORKSPACE_TOOLS
      : WORKSPACE_TOOLS.filter((t) => t.name !== "workspace_delete");
  const tools: Anthropic.Tool[] = [...workspaceTools, ...APP_DATA_TOOLS];
  if (!readOnly && allowEmail) tools.push(SEND_EMAIL_TOOL);
  if (!readOnly && allowSms) tools.push(SEND_SMS_TOOL);
  if (finishTool) tools.push(finishTool);
  // Le fil PUIS la demande, normalisés ensemble (démarrage sur l'utilisateur,
  // alternance stricte) : un fil tronqué peut commencer par une réponse, et
  // l'API refuse. Sans fil, on retrouve exactement l'ancien comportement.
  const messages: Anthropic.MessageParam[] = toMessages(history, userMessage).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const traces: ToolTrace[] = [];
  const steps: RunStepDraft[] = []; // WS-E : trace rédigée de CHAQUE appel d'outil (lecture incluse)
  const proposed: ProposedAction[] = []; // WS-C : actions sensibles en attente de confirmation
  let inputTokens = 0;
  let outputTokens = 0;
  let destructiveWrites = 0; // suppressions + mises à jour déjà effectuées ce passage

  for (let i = 0; i < maxIterations; i++) {
    const msg = await client.messages.create({ model, max_tokens: maxTokens, system, tools, messages });
    inputTokens += msg.usage.input_tokens;
    outputTokens += msg.usage.output_tokens;

    const toolBlocks = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolBlocks.length === 0) {
      // Réponse texte = fin de mission (chat).
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { finalText: text || null, finishInput: null, traces, steps, proposed, usage: { inputTokens, outputTokens }, iterations: i + 1 };
    }

    // Outil final (compose) → mission terminée avec livrable structuré.
    const finish = finishTool ? toolBlocks.find((b) => b.name === finishTool.name) : undefined;
    if (finish) {
      return {
        finalText: null,
        finishInput: finish.input as Record<string, unknown>,
        traces,
        steps,
        proposed,
        usage: { inputTokens, outputTokens },
        iterations: i + 1,
      };
    }

    // Exécute chaque outil (workspace / app_records / email) et renvoie au modèle.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolBlocks) {
      // WS-C : action SENSIBLE (suppression, envoi, facture, ou création/MàJ selon
      // les préférences) → on NE l'exécute PAS. On la collecte pour confirmation et
      // on dit au modèle de la traiter comme « à confirmer » (au futur).
      if (confirmGate && confirmGate(block.name, block.input as Record<string, unknown>)) {
        proposed.push({ tool: block.name, input: block.input as Record<string, unknown> });
        steps.push(draftToolStep(block.name, block.input as Record<string, unknown>, { pending: true }));
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({
            pending_confirmation: true,
            note: "Action mise EN ATTENTE de confirmation de l'utilisateur. Ne la considère PAS comme faite : dans ton récapitulatif, décris-la au FUTUR (« Je vais… ») comme une action À CONFIRMER.",
          }),
        });
        continue;
      }
      // FILET DE SÛRETÉ : au-delà du plafond d'écritures destructrices (opt-in),
      // on n'exécute PAS l'opération et on demande au modèle de s'arrêter pour
      // confirmation. Protège contre un « supprime/passe TOUTES les fiches »
      // qui enchaînerait les suppressions/écrasements sans validation humaine.
      const isDestructive = block.name === "workspace_delete" || block.name === "workspace_update";
      if (isDestructive && destructiveWrites >= maxDestructiveWrites) {
        steps.push(draftBlockedStep(block.name, block.input as Record<string, unknown>));
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: JSON.stringify({
            error: `Limite de sûreté atteinte : ${destructiveWrites} fiche(s) déjà modifiée(s)/supprimée(s) sur ce passage. STOP. N'exécute AUCUNE autre suppression ou mise à jour. Réponds en indiquant à l'utilisateur ce que tu as fait et combien de fiches restent concernées, et demande-lui une confirmation explicite avant d'aller plus loin.`,
          }),
        });
        continue;
      }
      const result = await runAgentTool(db, actor, block.name, block.input as Record<string, unknown>, traces);
      steps.push(draftToolStep(block.name, block.input as Record<string, unknown>, result));
      if (isDestructive && (result as { ok?: boolean }).ok) destructiveWrites++;
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
    messages.push({ role: "assistant", content: msg.content });
    messages.push({ role: "user", content: results });
  }

  return {
    finalText: null,
    finishInput: null,
    traces,
    steps,
    proposed,
    usage: { inputTokens, outputTokens },
    iterations: maxIterations,
  };
}
