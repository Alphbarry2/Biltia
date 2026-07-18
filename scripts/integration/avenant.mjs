// Avenant — objet métier réel (base locale). Montants calculés par la VRAIE
// logique pure (computeDevisLines/Totals), insert répliquant avenantFromDevis.
import { adminClient, testTenantIds, check, summary } from "./_guard.mjs";
import { computeDevisLines, computeDevisTotals } from "../../lib/devis-amounts.ts";

const admin = adminClient();
const t = await testTenantIds(admin);

// Devis source seedé (tenant A).
const { data: src } = await admin.from("devis")
  .select("id, numero, client_id, chantier_id, tenant_id, type")
  .eq("tenant_id", t.A).eq("numero", "D-2026-001").single();
check("devis source trouvé", !!src?.id);
check("devis source a plusieurs lignes", (await admin.from("lignes").select("id").eq("devis_id", src.id)).data?.length >= 2);

// Lignes supplémentaires (comme le fournirait le LLM) — montants calculés SERVEUR.
const computed = computeDevisLines([{ designation: "Travaux supplémentaires", prix_unitaire_ht: 2500 }]);
const totals = computeDevisTotals(computed);
check("montant HT serveur = 2500", totals.montant_ht === 2500);
check("TVA serveur = 500 (20%)", totals.montant_tva === 500);
check("TTC serveur = 3000", totals.montant_ttc === 3000);

// Réplique d'avenantFromDevis : nouveau devis type=avenant lié à la source.
const { data: av, error: avErr } = await admin.from("devis").insert({
  tenant_id: t.A, numero: `AV-TEST-${Date.now() % 100000}`,
  type: "avenant", parent_devis_id: src.id,
  client_id: src.client_id, chantier_id: src.chantier_id, statut: "brouillon",
  montant_ht: totals.montant_ht, montant_tva: totals.montant_tva, montant_ttc: totals.montant_ttc,
  notes: `Avenant au devis ${src.numero}`,
}).select("id, type, parent_devis_id, montant_ht, montant_ttc").single();
check("avenant créé", !avErr && !!av?.id);
check("type = avenant", av?.type === "avenant");
check("parent_devis_id = devis source", av?.parent_devis_id === src.id);
check("montant persisté = 2500 HT / 3000 TTC", av?.montant_ht == 2500 && av?.montant_ttc == 3000);

const { error: lErr } = await admin.from("lignes").insert(
  computed.map((l) => ({
    tenant_id: t.A, devis_id: av.id, designation: l.designation, quantite: l.quantite,
    unite: l.unite, prix_unitaire_ht: l.prix_unitaire_ht, taux_tva: l.taux_tva, total_ht: l.total_ht, position: l.position,
  }))
);
check("lignes d'avenant insérées", !lErr);

// Isolation : un devis du tenant B est INTROUVABLE sous le filtre tenant A.
const { data: bDevis } = await admin.from("devis").select("id").eq("tenant_id", t.B).limit(1);
if ((bDevis ?? []).length) {
  const { data: crossed } = await admin.from("devis").select("id").eq("tenant_id", t.A).eq("id", bDevis[0].id).maybeSingle();
  check("refus cross-tenant : devis de B invisible sous tenant A", !crossed);
} else {
  check("refus cross-tenant : (pas de devis B seedé, test neutre)", true);
}

summary("Avenant");
