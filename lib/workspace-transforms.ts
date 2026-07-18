// ─────────────────────────────────────────────────────────────────────────────
// TRANSFORMATIONS ATOMIQUES DU WORKSPACE — source unique.
//
// Une transformation crée une fiche À PARTIR d'une autre, sans re-saisie, en
// reprenant les rattachements (FK) et en posant les liens retour. Même famille
// que `invoice_from_devis` (devis→facture, resté dans /api/data car il touche la
// numérotation LÉGALE des factures — on n'y touche pas).
//
// Cette logique est appelée par DEUX chemins, avec un comportement IDENTIQUE :
//   • /api/data (UI Workspace + SDK des apps générées) — client RLS de l'utilisateur ;
//   • les OUTILS agent (lib/agent-tools.ts) — l'IA peut transformer atomiquement.
// tenant_id est TOUJOURS forcé (.eq) ici, quel que soit le client fourni.
// ─────────────────────────────────────────────────────────────────────────────

import { getLocale } from "./i18n/server";
import { pick } from "./i18n/config";

import { ENTITIES } from "./data-entities";
import { computeDevisLines, computeDevisTotals, type DevisLineInput } from "./devis-amounts";

export const TRANSFORM_ACTIONS = [
  "chantier_from_devis",
  "devis_from_demande",
  "task_from_note",
  "reserve_from_note",
] as const;

export type TransformAction = (typeof TRANSFORM_ACTIONS)[number];

/** Entité workspace CIBLE (créée) de chaque transformation. */
export const TRANSFORM_TARGET: Record<TransformAction, string> = {
  chantier_from_devis: "chantiers",
  devis_from_demande: "devis",
  task_from_note: "tasks",
  reserve_from_note: "reserves",
};

/** Libellé lisible d'une transformation (pour l'UI / le prompt agent). */
export const TRANSFORM_LABEL: Record<TransformAction, string> = {
  chantier_from_devis: "ouvrir le chantier d'un devis accepté",
  devis_from_demande: "ébaucher un devis à partir d'une demande",
  task_from_note: "créer une tâche à partir d'une note",
  reserve_from_note: "créer une réserve à partir d'une note",
};

export function isTransformAction(a: string): a is TransformAction {
  return (TRANSFORM_ACTIONS as readonly string[]).includes(a);
}

// Le builder de requête est le même que celui de /api/data : `(table) => client.from(table)`.
// Volontairement `any` (retour Supabase dynamique), tenant_id forcé partout ci-dessous.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FromFn = (table: string) => any;
type LogFn = (action: string, description: string, entityId?: string | null) => Promise<void> | void;

export type TransformResult = { data?: Record<string, unknown>; error?: string; status?: number };

/**
 * Exécute une transformation atomique. Renvoie { data } en cas de succès, ou
 * { error, status } en cas d'échec métier (source introuvable…) ou technique.
 * Ne lève JAMAIS : les erreurs DB sont capturées et renvoyées en { error }.
 */
export async function runWorkspaceTransform(opts: {
  from: FromFn;
  tenantId: string;
  action: TransformAction;
  sourceId: string;
  log?: LogFn;
}): Promise<TransformResult> {
  const { from, tenantId, action, sourceId } = opts;
  const log: LogFn = opts.log ?? (() => {});
  const locale = await getLocale();
  if (!sourceId) return { error: pick(locale, "Fiche source manquante.", "Source record missing."), status: 400 };

  try {
    // ── DEVIS ACCEPTÉ → CHANTIER ── reprend client/site/demande + adresse, budgète
    // au montant HT, RELIE devis.chantier_id. Idempotent : devis déjà relié → renvoyé.
    if (action === "chantier_from_devis") {
      const { data: dv, error: dErr } = await from("devis")
        .select("id, numero, client_id, chantier_id, site_id, demande_id, montant_ht")
        .eq("tenant_id", tenantId)
        .eq("id", sourceId)
        .single();
      if (dErr || !dv) return { error: pick(locale, "Devis introuvable.", "Quote not found."), status: 404 };

      if (dv.chantier_id) {
        const { data: existing } = await from("chantiers")
          .select("*").eq("tenant_id", tenantId).eq("id", dv.chantier_id).maybeSingle();
        if (existing) return { data: existing as Record<string, unknown> };
      }

      let clientNom = "";
      let addr: { adresse: string | null; ville: string | null; code_postal: string | null } = {
        adresse: null, ville: null, code_postal: null,
      };
      if (dv.client_id) {
        const { data: cl } = await from("clients")
          .select("nom, adresse, ville, code_postal").eq("tenant_id", tenantId).eq("id", dv.client_id).maybeSingle();
        if (cl) {
          clientNom = String(cl.nom || "");
          addr = { adresse: cl.adresse ?? null, ville: cl.ville ?? null, code_postal: cl.code_postal ?? null };
        }
      }
      if (dv.site_id) {
        const { data: st } = await from("sites")
          .select("adresse, ville, code_postal").eq("tenant_id", tenantId).eq("id", dv.site_id).maybeSingle();
        if (st) addr = { adresse: st.adresse ?? null, ville: st.ville ?? null, code_postal: st.code_postal ?? null };
      }
      const nom = clientNom ? `Chantier — ${clientNom}` : `Chantier ${dv.numero ?? ""}`.trim();

      const { data: chantier, error: insErr } = await from("chantiers")
        .insert({
          tenant_id: tenantId,
          nom,
          client_id: dv.client_id ?? null,
          site_id: dv.site_id ?? null,
          demande_id: dv.demande_id ?? null,
          adresse: addr.adresse,
          ville: addr.ville,
          code_postal: addr.code_postal,
          budget: Number(dv.montant_ht) || 0,
          avancement: 0,
          statut: "en_attente",
        })
        .select()
        .single();
      if (insErr || !chantier) throw insErr || new Error("Création du chantier impossible.");

      await from("devis").update({ chantier_id: chantier.id }).eq("tenant_id", tenantId).eq("id", sourceId);
      await log("create", `${ENTITIES.chantiers.label} « ${nom} » — ouvert depuis le devis ${dv.numero ?? ""}`.trim(), (chantier.id as string) ?? null);
      return { data: chantier as Record<string, unknown> };
    }

    // ── DEMANDE → DEVIS ── devis brouillon (D-AAAA-NNN), reprend client/site + relie
    // demande_id, passe la demande « en cours ». Idempotent : devis déjà lié → renvoyé.
    if (action === "devis_from_demande") {
      const { data: dm, error: dErr } = await from("demandes")
        .select("id, titre, client_id, site_id, description")
        .eq("tenant_id", tenantId)
        .eq("id", sourceId)
        .single();
      if (dErr || !dm) return { error: pick(locale, "Demande introuvable.", "Request not found."), status: 404 };

      const { data: dejaDevis } = await from("devis")
        .select("*").eq("tenant_id", tenantId).eq("demande_id", sourceId).limit(1);
      if (Array.isArray(dejaDevis) && dejaDevis[0]) return { data: dejaDevis[0] as Record<string, unknown> };

      const year = new Date().getFullYear();
      const pre = `D-${year}-`;
      const { data: nums } = await from("devis").select("numero").eq("tenant_id", tenantId).ilike("numero", `${pre}%`);
      let seq = 0;
      for (const r of (nums ?? []) as { numero: string | null }[]) {
        const val = parseInt(String(r.numero || "").slice(pre.length), 10);
        if (Number.isFinite(val) && val > seq) seq = val;
      }
      const today = new Date();
      const dateDevis = today.toISOString().slice(0, 10);
      const dateValidite = new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

      let devis: Record<string, unknown> | null = null;
      let insErr: unknown = null;
      for (let attempt = 1; attempt <= 6; attempt++) {
        const numero = `${pre}${String(seq + attempt).padStart(3, "0")}`;
        const { data: ins, error } = await from("devis")
          .insert({
            tenant_id: tenantId,
            numero,
            client_id: dm.client_id ?? null,
            site_id: dm.site_id ?? null,
            demande_id: sourceId,
            statut: "brouillon",
            date_devis: dateDevis,
            date_validite: dateValidite,
            montant_ht: 0,
            montant_tva: 0,
            montant_ttc: 0,
            notes: dm.description || dm.titre || null,
          })
          .select()
          .single();
        if (!error) { devis = ins as Record<string, unknown>; break; }
        insErr = error;
        if ((error as { code?: string }).code !== "23505") break;
      }
      if (!devis) throw insErr || new Error("Création du devis impossible.");

      await from("demandes").update({ statut: "en_cours" }).eq("tenant_id", tenantId).eq("id", sourceId);
      await log("create", `${ENTITIES.devis.label} ${devis.numero} — ébauché depuis la demande « ${dm.titre ?? ""} »`.trim(), (devis.id as string) ?? null);
      return { data: devis };
    }

    // ── NOTE → TÂCHE / RÉSERVE ── reprend les rattachements de la note (chantier,
    // intervention, auteur) pour en faire une action suivie.
    if (action === "task_from_note" || action === "reserve_from_note") {
      const { data: nt, error: nErr } = await from("notes")
        .select("id, titre, contenu, chantier_id, client_id, intervention_id, auteur_id")
        .eq("tenant_id", tenantId)
        .eq("id", sourceId)
        .single();
      if (nErr || !nt) return { error: pick(locale, "Note introuvable.", "Note not found."), status: 404 };

      const titre = String(nt.titre || nt.contenu || "").trim().slice(0, 120) || "Note";
      if (action === "task_from_note") {
        const { data: task, error: insErr } = await from("tasks")
          .insert({
            tenant_id: tenantId,
            title: titre,
            description: nt.contenu || null,
            status: "todo",
            priority: "normal",
            chantier_id: nt.chantier_id ?? null,
            assignee_id: nt.auteur_id ?? null,
          })
          .select()
          .single();
        if (insErr || !task) throw insErr || new Error("Création de la tâche impossible.");
        await log("create", `${ENTITIES.tasks.label} « ${titre} » — créée depuis une note`, (task.id as string) ?? null);
        return { data: task as Record<string, unknown> };
      }
      const { data: reserve, error: insErr } = await from("reserves")
        .insert({
          tenant_id: tenantId,
          titre,
          description: nt.contenu || null,
          type: "reserve",
          gravite: "normale",
          statut: "ouverte",
          chantier_id: nt.chantier_id ?? null,
          client_id: nt.client_id ?? null,
          intervention_id: nt.intervention_id ?? null,
          assignee_id: nt.auteur_id ?? null,
          date_constat: new Date().toISOString().slice(0, 10),
        })
        .select()
        .single();
      if (insErr || !reserve) throw insErr || new Error("Création de la réserve impossible.");
      await log("create", `${ENTITIES.reserves.label} « ${titre} » — créée depuis une note`, (reserve.id as string) ?? null);
      return { data: reserve as Record<string, unknown> };
    }

    return { error: `Transformation inconnue : ${action}`, status: 400 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur base de données.", status: 400 };
  }
}

/**
 * FACTURE depuis un DEVIS accepté (acompte / situation / solde). Distincte des
 * transformations atomiques ci-dessus car elle touche la NUMÉROTATION LÉGALE
 * (F-AAAA-NNN, index unique tenant+numero, anti-collision par retry). Logique
 * IDENTIQUE à celle de /api/data (qui la rappelle) — désormais réutilisable par la
 * validation d'un item d'agent (outbox workflow_step). Crée une facture en
 * `brouillon`. Ne throw jamais : erreur → { error, status }.
 */
export async function invoiceFromDevis(opts: {
  from: FromFn;
  tenantId: string;
  devisId: string;
  mode?: "acompte" | "situation" | "solde";
  pct?: number | null;
  log?: LogFn;
  factureLabel?: string;
}): Promise<TransformResult> {
  const { from, tenantId, devisId } = opts;
  const log: LogFn = opts.log ?? (() => {});
  const locale = await getLocale();
  const factureLabel = opts.factureLabel ?? "Facture";
  if (!devisId) return { error: pick(locale, "Devis manquant.", "Quote missing."), status: 400 };

  try {
    const { data: dv, error: dErr } = await from("devis")
      .select("id, numero, client_id, chantier_id, montant_ht, montant_tva, montant_ttc, statut")
      .eq("tenant_id", tenantId)
      .eq("id", devisId)
      .single();
    if (dErr || !dv) return { error: pick(locale, "Devis introuvable.", "Quote not found."), status: 404 };

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const totalHt = Number(dv.montant_ht) || 0;
    const totalTva = Number(dv.montant_tva) || 0;
    if (totalHt <= 0) return { error: pick(locale, "Ce devis n'a pas de montant à facturer.", "This quote has no amount to invoice."), status: 400 };

    // Déjà facturé pour ce devis (les avoirs se déduisent) → base du solde.
    const { data: prev } = await from("factures")
      .select("montant_ht, type")
      .eq("tenant_id", tenantId)
      .eq("devis_id", devisId);
    let invoicedHt = 0;
    for (const p of (prev ?? []) as { montant_ht: number | null; type: string | null }[]) {
      const v = Number(p.montant_ht) || 0;
      invoicedHt += p.type === "avoir" ? -v : v;
    }

    const mode = opts.mode === "acompte" || opts.mode === "situation" ? opts.mode : "solde";
    let ht: number;
    let factType: string;
    if (mode === "acompte") {
      factType = "acompte";
      const pct = Math.min(100, Math.max(1, Number(opts.pct) || 30));
      ht = round2(totalHt * (pct / 100));
    } else if (mode === "situation") {
      factType = "situation";
      const pct = Math.min(100, Math.max(1, Number(opts.pct) || 0));
      ht = round2(totalHt * (pct / 100));
    } else {
      factType = "facture";
      ht = round2(totalHt - invoicedHt); // solde = total − déjà facturé
    }
    if (!(ht > 0)) return { error: pick(locale, "Rien à facturer : le devis est déjà entièrement facturé.", "Nothing to invoice: this quote is already fully invoiced."), status: 400 };

    // PLAFOND. Seul le mode `solde` déduisait le déjà-facturé : `acompte` et
    // `situation` calculaient un pourcentage du TOTAL sans jamais regarder ce qui
    // était déjà parti. Cinq appels en « acompte 100 % » produisaient cinq
    // factures pleines. On refuse ici, avec un message lisible.
    //
    // Ce test n'est PAS la sécurité — deux appels concurrents le franchiraient
    // tous les deux. La garantie est le trigger `factures_guard_devis_total`
    // (migration 051), qui verrouille le devis et fait respecter l'invariant en
    // base. Ce test n'existe que pour dire à l'artisan CE QUI reste à facturer
    // plutôt que de lui renvoyer une erreur Postgres.
    const restant = round2(totalHt - invoicedHt);
    if (ht > restant + 0.01) {
      return {
        error: pick(
          locale,
          `Ce devis est déjà facturé à hauteur de ${round2(invoicedHt)} € HT sur ${round2(totalHt)} € HT. Il reste ${restant} € HT à facturer.`,
          `This quote is already invoiced for ${round2(invoicedHt)} € excl. tax out of ${round2(totalHt)} €. Remaining: ${restant} € excl. tax.`
        ),
        status: 400,
      };
    }

    // TVA proportionnelle au HT du devis (conserve le taux moyen, multi-taux inclus).
    const tvaRate = totalHt > 0 ? totalTva / totalHt : 0.2;
    const tva = round2(ht * tvaRate);
    const ttc = round2(ht + tva);

    // Prochain numéro F-AAAA-NNN (base = max de l'année).
    const year = new Date().getFullYear();
    const pre = `F-${year}-`;
    const { data: existing } = await from("factures")
      .select("numero")
      .eq("tenant_id", tenantId)
      .ilike("numero", `${pre}%`);
    let seq = 0;
    for (const r of (existing ?? []) as { numero: string | null }[]) {
      const n = String(r.numero || "");
      if (!n.startsWith(pre)) continue;
      const val = parseInt(n.slice(pre.length), 10);
      if (Number.isFinite(val) && val > seq) seq = val;
    }

    const today = new Date();
    const dateFacture = today.toISOString().slice(0, 10);
    const dateEcheance = new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

    // Anti-collision de NUMÉRO uniquement (index unique tenant_id+numero).
    //
    // ⚠️ Cette boucle ne doit réessayer QUE sur un conflit d'unicité (23505), et
    // seulement parce que deux devis DIFFÉRENTS facturés en même temps peuvent
    // viser le même numéro. Elle ne doit JAMAIS servir de rattrapage à une double
    // facturation du même devis : c'est précisément ce qu'elle faisait avant la
    // migration 051 (le 2ᵉ clic collisionnait sur le numéro, la boucle réessayait
    // avec le suivant… et créait une seconde facture pleine). Le trigger renvoie
    // désormais un 23514 (check_violation) que l'on NE réessaie pas.
    let facture: Record<string, unknown> | null = null;
    let insErr: unknown = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const numero = `${pre}${String(seq + attempt).padStart(3, "0")}`;
      const { data: ins, error } = await from("factures")
        .insert({
          tenant_id: tenantId,
          numero,
          client_id: dv.client_id ?? null,
          chantier_id: dv.chantier_id ?? null,
          devis_id: devisId,
          type: factType,
          statut: "brouillon",
          date_facture: dateFacture,
          date_echeance: dateEcheance,
          montant_ht: ht,
          montant_tva: tva,
          montant_ttc: ttc,
          montant_paye: 0,
        })
        .select()
        .single();
      if (!error) {
        facture = ins as Record<string, unknown>;
        break;
      }
      insErr = error;
      if ((error as { code?: string }).code !== "23505") break; // pas un conflit d'unicité → stop
    }
    if (!facture) {
      // Une erreur Supabase est un OBJET { message, code, … }, PAS une instance de
      // Error : le test `instanceof Error` était toujours faux et écrasait le vrai
      // motif par un générique. On lit donc `.message` directement — c'est ainsi
      // que le refus du garde-fou (« ce devis est déjà facturé à hauteur de… »)
      // parvient jusqu'à l'artisan.
      const raw = (insErr as { message?: string } | null)?.message;
      return {
        error: raw || pick(locale, "Création de la facture impossible.", "Could not create the invoice."),
        status: 400,
      };
    }

    const kindLabel = factType === "acompte" ? "acompte" : factType === "situation" ? "situation" : "facture";
    await log(
      "create",
      `${factureLabel} ${facture.numero} — ${kindLabel} depuis le devis ${dv.numero ?? ""}`.trim(),
      (facture.id as string) ?? null
    );
    return { data: facture };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur base de données.", status: 400 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — AVENANT depuis un devis (VRAI objet metier, pas du HTML).
//
// Cree un `devis` type='avenant' lie a sa source (parent_devis_id), avec les
// LIGNES SUPPLEMENTAIRES fournies. Les MONTANTS sont calcules SERVEUR (jamais par
// le LLM), TVA par ligne. Meme famille qu'invoice_from_devis, mais standalone car
// il recoit des lignes (au-dela d'un simple source_id).
// ─────────────────────────────────────────────────────────────────────────────
export async function avenantFromDevis(opts: {
  from: FromFn;
  tenantId: string;
  devisId: string;
  lines: DevisLineInput[];
  log?: LogFn;
}): Promise<TransformResult> {
  const { from, tenantId, devisId } = opts;
  const log: LogFn = opts.log ?? (() => {});
  const locale = await getLocale();
  if (!devisId) return { error: pick(locale, "Devis source manquant.", "Source quote missing."), status: 400 };

  const computed = computeDevisLines(Array.isArray(opts.lines) ? opts.lines : []).filter(
    (l) => l.designation && l.total_ht > 0
  );
  if (!computed.length) {
    return {
      error: pick(
        locale,
        "Aucune ligne d'avenant valide (désignation + prix unitaire requis).",
        "No valid amendment line (designation + unit price required)."
      ),
      status: 400,
    };
  }

  try {
    const { data: dv, error: dErr } = await from("devis")
      .select("id, numero, client_id, chantier_id")
      .eq("tenant_id", tenantId)
      .eq("id", devisId)
      .single();
    if (dErr || !dv) return { error: pick(locale, "Devis source introuvable.", "Source quote not found."), status: 404 };

    const totals = computeDevisTotals(computed);

    // Numéro AV-AAAA-NNN (séquence propre aux avenants ; base = max de l'année).
    const year = new Date().getFullYear();
    const pre = `AV-${year}-`;
    const { data: nums } = await from("devis").select("numero").eq("tenant_id", tenantId).ilike("numero", `${pre}%`);
    let seq = 0;
    for (const r of (nums ?? []) as { numero: string | null }[]) {
      const val = parseInt(String(r.numero || "").slice(pre.length), 10);
      if (Number.isFinite(val) && val > seq) seq = val;
    }

    const today = new Date();
    const dateDevis = today.toISOString().slice(0, 10);
    const dateValidite = new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

    // Anti-collision de NUMÉRO uniquement (23505). Deux avenants créés en parallèle
    // peuvent viser le même numéro → on réessaie le suivant.
    let avenant: Record<string, unknown> | null = null;
    let insErr: unknown = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const numero = `${pre}${String(seq + attempt).padStart(3, "0")}`;
      const { data: ins, error } = await from("devis")
        .insert({
          tenant_id: tenantId,
          numero,
          type: "avenant",
          parent_devis_id: devisId,
          client_id: dv.client_id ?? null,
          chantier_id: dv.chantier_id ?? null,
          statut: "brouillon",
          date_devis: dateDevis,
          date_validite: dateValidite,
          montant_ht: totals.montant_ht,
          montant_tva: totals.montant_tva,
          montant_ttc: totals.montant_ttc,
          notes: `Avenant au devis ${dv.numero ?? ""}`.trim(),
        })
        .select()
        .single();
      if (!error) {
        avenant = ins as Record<string, unknown>;
        break;
      }
      insErr = error;
      if ((error as { code?: string }).code !== "23505") break;
    }
    if (!avenant) {
      const raw = (insErr as { message?: string } | null)?.message;
      return { error: raw || pick(locale, "Création de l'avenant impossible.", "Could not create the amendment."), status: 400 };
    }

    // Lignes de l'avenant (rattachées au nouvel avenant).
    const avenantId = avenant.id as string;
    const rows = computed.map((l) => ({
      tenant_id: tenantId,
      devis_id: avenantId,
      designation: l.designation,
      quantite: l.quantite,
      unite: l.unite,
      prix_unitaire_ht: l.prix_unitaire_ht,
      taux_tva: l.taux_tva,
      total_ht: l.total_ht,
      position: l.position,
    }));
    const { error: lErr } = await from("lignes").insert(rows);
    if (lErr) throw lErr;

    await log(
      "create",
      `Avenant ${avenant.numero ?? ""} créé depuis le devis ${dv.numero ?? ""} — ${totals.montant_ht} € HT`.trim(),
      avenantId
    );
    return { data: avenant };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur base de données.", status: 400 };
  }
}
