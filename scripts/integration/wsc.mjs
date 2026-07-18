// WS-C — politique de confirmation & RBAC (base locale).
// Logique de risque PURE réelle (requiresConfirmation) + matrice RBAC réelle (can)
// + filet RLS (un member ne peut pas supprimer). Honnête sur les limites actuelles.
import { adminClient, sessionClient, testTenantIds, TEST_USERS, check, summary } from "./_guard.mjs";
import { requiresConfirmation } from "../../lib/action-risk.ts";
import { can } from "../../lib/permissions.ts";

const admin = adminClient();
const t = await testTenantIds(admin);

// ── Niveaux de confirmation (déterministe) ──
check("lecture → sans confirmation", requiresConfirmation("workspace_list") === false);
check("création → sans confirmation (défaut)", requiresConfirmation("workspace_create") === false);
check("création → confirmation SI always_confirm", requiresConfirmation("workspace_create", { alwaysConfirm: true }) === true);
check("suppression → confirmation obligatoire", requiresConfirmation("workspace_delete") === true);
check("envoi email → confirmation obligatoire", requiresConfirmation("send_email") === true);
check("create_avenant → niveau préférence", requiresConfirmation("create_avenant", { alwaysConfirm: true }) === true);

// ── RBAC (matrice) ──
check("member NE peut PAS supprimer (data.delete)", can("member", "data.delete") === false);
check("owner PEUT supprimer", can("owner", "data.delete") === true);
check("member PEUT écrire (data.write)", can("member", "data.write") === true);

// ── Exécution d'un « plan confirmé » (réplique phase 2 : écriture directe) ──
const { data: created, error: cErr } = await admin.from("clients")
  .insert({ tenant_id: t.A, nom: "BILTIA_TEST Plan confirme" }).select("id").single();
check("plan confirmé exécuté (client créé)", !cErr && !!created?.id);

// ── Filet RLS : un member ne supprime pas, même s'il tente directement ──
const { data: victim } = await admin.from("clients")
  .insert({ tenant_id: t.A, nom: "BILTIA_TEST RLS victim" }).select("id").single();
await sessionClient(TEST_USERS.memberA).from("clients").delete().eq("id", victim.id); // RLS doit bloquer
const { data: stillThere } = await admin.from("clients").select("id").eq("id", victim.id).maybeSingle();
check("RLS : suppression par un member REFUSÉE (fiche intacte)", !!stillThere);

// Un owner, lui, peut supprimer (contrôle positif).
await sessionClient(TEST_USERS.ownerA).from("clients").delete().eq("id", victim.id);
const { data: gone } = await admin.from("clients").select("id").eq("id", victim.id).maybeSingle();
check("RLS : suppression par l'owner AUTORISÉE", !gone);

console.log("\n[WS-C] NOTE HONNÊTE : l'idempotence SERVEUR complète (plan à usage unique) n'est PAS");
console.log("garantie tant que WS-C+ n'est pas implémenté (plan actuel = sans état, re-validé à l'exécution).");

summary("WS-C");
