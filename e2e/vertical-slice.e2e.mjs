// ─────────────────────────────────────────────────────────────────────────────
// E2E VERTICAL — « Décale le chantier Dupont de trois jours, déplace les tâches
// associées et préviens l'équipe. »
//
// Niveau A DÉTERMINISTE : la VRAIE orchestration (runAgentLoop + executeConfirmedPlan
// + workspace_search + verifyAction/buildVerifiedReport, code réel via loader) tourne
// contre une base Supabase EN MÉMOIRE (fake fidèle) et un MODÈLE SIMULÉ qui réagit aux
// VRAIS résultats d'outils. Transport email SIMULÉ (aucun envoi réel). Dates calculées
// PAR LE CODE de test (le modèle ne décide pas la règle de calcul).
//
// Lancer : node --test --experimental-strip-types --import ./e2e/register.mjs e2e/*.e2e.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { test } from "node:test";
import assert from "node:assert/strict";

import { runAgentLoop, executeConfirmedPlan, buildWorkspaceToolsSystem } from "@/lib/agent-tools";
import { requiresConfirmation } from "@/lib/action-risk";
import { client } from "@/lib/llm";
import { createFakeSupabase } from "./fake-supabase.mjs";

const MISSION = "Décale le chantier Dupont de trois jours, déplace les tâches associées et préviens l'équipe.";
const addDays = (iso, n) => new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
const ACTOR = { tenantId: "tenant-A", userId: "user-A", label: "Assistant", fromEmail: "owner@biltia.test" };

function baseSeed(extraChantiersA = []) {
  return {
    tenants: [{ id: "tenant-A", name: "BILTIA_TEST Entreprise Alpha Bâtiment", company_info: { country: "BE", siret: "BE0999.FAKE.001", vat: "BE0999FAKETVA", address: "1 rue de Test, 1000 Bruxelles", brand: { phone: "+3200000000", email: "contact@biltia.test" } } }],
    clients: [
      { id: "A-client", tenant_id: "tenant-A", nom: "Dupont" },
      { id: "B-client", tenant_id: "tenant-B", nom: "Dupont" },
    ],
    chantiers: [
      { id: "A-ch", tenant_id: "tenant-A", nom: "Rénovation Dupont", client_id: "A-client", statut: "planifie", date_debut: "2026-08-10", date_fin_prevue: "2026-08-14" },
      ...extraChantiersA,
      { id: "B-ch", tenant_id: "tenant-B", nom: "Dupont Rénovation B", client_id: "B-client", statut: "planifie", date_debut: "2026-09-01", date_fin_prevue: "2026-09-05" },
    ],
    tasks: [
      { id: "A-t1", tenant_id: "tenant-A", title: "Préparation", chantier_id: "A-ch", assignee_id: "A-e1", status: "todo", due_date: "2026-08-10" },
      { id: "A-t2", tenant_id: "tenant-A", title: "Installation", chantier_id: "A-ch", assignee_id: "A-e2", status: "todo", due_date: "2026-08-12" },
      { id: "A-t3", tenant_id: "tenant-A", title: "Contrôle", chantier_id: "A-ch", assignee_id: "A-e1", status: "todo", due_date: "2026-08-14" },
      { id: "B-t1", tenant_id: "tenant-B", title: "Tâche B", chantier_id: "B-ch", assignee_id: "B-e1", status: "todo", due_date: "2026-09-01" },
    ],
    employees: [
      { id: "A-e1", tenant_id: "tenant-A", nom: "Test", prenom: "Karim", email: "karim.test@biltia.test", adresse: "10 rue Fictive" },
      { id: "A-e2", tenant_id: "tenant-A", nom: "Test", prenom: "Lucas", email: "lucas.test@biltia.test", adresse: "12 rue Fictive" },
      { id: "B-e1", tenant_id: "tenant-B", nom: "AutreTenant", prenom: "Bob", email: "bob@tenant-b.test" },
    ],
  };
}

// ── Modèle SIMULÉ : lit les VRAIS tool_results et enchaîne la mission ──────────
function extractResults(messages) {
  const calls = {};
  const out = [];
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.content)) for (const b of m.content) if (b?.type === "tool_use") calls[b.id] = { name: b.name, input: b.input };
    if (m.role === "user" && Array.isArray(m.content)) for (const b of m.content) if (b?.type === "tool_result") {
      let content = {};
      try { content = JSON.parse(typeof b.content === "string" ? b.content : "{}"); } catch {}
      const c = calls[b.tool_use_id] || {};
      out.push({ name: c.name, input: c.input, content });
    }
  }
  return out;
}

let uid = 0;
function makeMissionModel() {
  return async ({ messages }) => {
    const usage = { input_tokens: 12, output_tokens: 8 };
    const say = (text) => ({ content: [{ type: "text", text }], usage, stop_reason: "end_turn" });
    const T = (name, input) => ({ type: "tool_use", id: `t${++uid}`, name, input });
    const emit = (blocks) => ({ content: blocks, usage, stop_reason: "tool_use" });

    const r = extractResults(messages);
    const search = r.find((x) => x.name === "workspace_search");
    const got = r.find((x) => x.name === "workspace_get");
    const tks = r.find((x) => x.name === "workspace_list" && x.input?.entity === "tasks");
    const emp = r.find((x) => x.name === "workspace_list" && x.input?.entity === "employees");
    const proposed = r.some((x) => x.content?.pending_confirmation);
    const wroteOrProposed = r.some((x) => x.name === "workspace_update" || x.name === "send_email");

    // 1) Retrouver le chantier
    if (!search) return emit([T("workspace_search", { query: "Dupont", entity: "chantiers" })]);
    if (search.content?.resolution !== "unique") {
      return say(search.content?.resolution === "ambiguous"
        ? "Plusieurs chantiers « Dupont » correspondent. Lequel veux-tu décaler ? Je n'ai encore rien modifié."
        : "Je ne trouve pas ce chantier dans ton espace ; je n'invente pas.");
    }
    const chId = search.content.results[0].id;

    // 2) Lire le chantier + tâches associées + équipe (lectures immédiates)
    if (!got || !tks || !emp) {
      return emit([
        T("workspace_get", { entity: "chantiers", id: chId }),
        T("workspace_list", { entity: "tasks", match: { chantier_id: chId } }),
        T("workspace_list", { entity: "employees" }),
      ]);
    }

    // 3) Proposer les modifications + communications (toutes soumises à confirmation)
    if (!wroteOrProposed) {
      const ch = got.content.row;
      const tasks = tks.content.rows || [];
      const emps = emp.content.rows || [];
      const blocks = [
        T("workspace_update", { entity: "chantiers", id: chId, values: { date_debut: addDays(ch.date_debut, 3), date_fin_prevue: addDays(ch.date_fin_prevue, 3) } }),
        ...tasks.map((t) => T("workspace_update", { entity: "tasks", id: t.id, values: { due_date: addDays(t.due_date, 3) } })),
        ...emps.map((e) => T("send_email", { to: [e.email], subject: "Chantier Rénovation Dupont décalé de 3 jours", body: `Bonjour ${e.prenom}, le chantier Rénovation Dupont est décalé de 3 jours. Merci d'en tenir compte.` })),
      ];
      return emit(blocks);
    }

    // 4) Récapitulatif (au FUTUR : rien n'est fait tant que non confirmé)
    return say("Je vais décaler le chantier Rénovation Dupont de 3 jours (13→17 août), déplacer les 3 tâches associées et prévenir l'équipe (Karim, Lucas) — dès ta confirmation.");
  };
}

const confirmGate = (tool) => requiresConfirmation(tool, { alwaysConfirm: true });

async function runTurn1(db) {
  client.messages.create = makeMissionModel();
  return runAgentLoop({
    model: "test-model", system: buildWorkspaceToolsSystem(), userMessage: MISSION, history: [], db, actor: ACTOR,
    allowEmail: true, allowSms: false, maxIterations: 6, maxTokens: 1000, confirmGate,
  });
}

function toolSequence(loop) {
  return (loop.steps || []).map((s) => s.tool);
}

// ══════════════════════════════════════════════════════════════════════════════
// Scénario A — parcours nominal (happy path)
// ══════════════════════════════════════════════════════════════════════════════
test("E2E-A · nominal : recherche → propose → confirme → exécute → vérifie", async () => {
  globalThis.__E2E_SENT = [];
  globalThis.__E2E_TRANSPORT = {};
  const sb = createFakeSupabase(baseSeed());

  // ── TOUR 1 : rien n'est exécuté, tout est proposé ────────────────────────────
  const loop = await runTurn1(sb);
  console.log("[A] séquence outils :", toolSequence(loop).join(" → "));
  console.log("[A] itérations :", loop.iterations, "| étapes outils :", loop.steps.length, "| proposées :", loop.proposed.length);
  assert.equal(loop.proposed.length, 6, "6 actions proposées (1 chantier + 3 tâches + 2 emails)");
  assert.equal(loop.traces.length, 0, "aucune écriture au tour 1");
  assert.equal(sb.__audit.writes, 0, "aucune écriture en base au tour 1");
  assert.equal(globalThis.__E2E_SENT.length, 0, "aucun email au tour 1");
  assert.doesNotMatch(String(loop.finalText), /tout est terminé|c'est fait/i);
  assert.match(String(loop.finalText), /confirmation|dès ta confirmation/i);
  // Le chantier trouvé de façon UNIQUE (recherche canonique)
  assert.ok(toolSequence(loop).includes("workspace_search"));

  // ── TOUR 2 : exécution du plan confirmé + vérification ───────────────────────
  const res = await executeConfirmedPlan(sb, ACTOR, "owner", loop.proposed);
  console.log("[A] compte rendu :\n" + res.report);
  assert.equal(res.denied, 0, "owner : aucune action refusée");

  const ch = sb.__store.chantiers.find((c) => c.id === "A-ch");
  assert.equal(ch.date_debut, "2026-08-13", "chantier début +3j");
  assert.equal(ch.date_fin_prevue, "2026-08-17", "chantier fin +3j");
  const dues = sb.__store.tasks.filter((t) => t.chantier_id === "A-ch").map((t) => t.due_date).sort();
  assert.deepEqual(dues, ["2026-08-13", "2026-08-15", "2026-08-17"], "3 tâches +3j");

  // Communications : acceptées par le transport, NON livrées
  assert.equal(globalThis.__E2E_SENT.length, 2, "2 emails acceptés");
  assert.ok(globalThis.__E2E_SENT.every((m) => m.accepted === true && m.delivered === false));
  const dests = globalThis.__E2E_SENT.flatMap((m) => m.to);
  assert.deepEqual(dests.sort(), ["karim.test@biltia.test", "lucas.test@biltia.test"]);

  // Vérifications : 4 écritures vérifiées, 2 envois « non vérifiables »
  const verified = res.verifications.filter((v) => v.status === "verified").length;
  const notVerifiable = res.verifications.filter((v) => v.status === "not_verifiable").length;
  assert.equal(verified, 4, "chantier + 3 tâches vérifiés");
  assert.equal(notVerifiable, 2, "2 envois acceptés mais non vérifiables");
  assert.equal(res.verified, false, "pas « tout vérifié » (livraison non confirmée)");

  // Compte rendu HONNÊTE : jamais « tout est terminé »
  assert.match(res.report, /✓/);
  assert.match(res.report, /•/);
  assert.doesNotMatch(res.report, /tout est terminé/i);
  assert.match(res.report, /n'annonce pas comme terminé/i);

  // ── ISOLATION TENANT B : rien n'a bougé ──────────────────────────────────────
  const bch = sb.__store.chantiers.find((c) => c.id === "B-ch");
  assert.equal(bch.date_debut, "2026-09-01", "tenant B chantier intact");
  assert.equal(bch.date_fin_prevue, "2026-09-05", "tenant B chantier intact");
  assert.equal(sb.__store.tasks.find((t) => t.id === "B-t1").due_date, "2026-09-01", "tenant B tâche intacte");
  assert.ok(!dests.includes("bob@tenant-b.test"), "aucun message préparé pour le tenant B");
});

// ══════════════════════════════════════════════════════════════════════════════
// Scénario B — échec partiel (§11)
// ══════════════════════════════════════════════════════════════════════════════
test("E2E-B · échec partiel : chantier ok, 2/3 tâches, 1 email accepté, 1 email échoue", async () => {
  globalThis.__E2E_SENT = [];
  globalThis.__E2E_TRANSPORT = { failEmailTo: ["lucas.test@biltia.test"] }; // l'email de Lucas échoue
  // La 3e tâche (A-t3) reste « bloquée » : sa mise à jour n'aboutit pas en base.
  const sb = createFakeSupabase(baseSeed(), { blockUpdates: new Set(["tasks:A-t3"]) });

  const loop = await runTurn1(sb);
  assert.equal(loop.proposed.length, 6);
  const res = await executeConfirmedPlan(sb, ACTOR, "owner", loop.proposed);
  console.log("[B] compte rendu :\n" + res.report);

  // Chantier ok, 2 tâches ok, 1 tâche NON conforme (reste à l'ancienne date)
  assert.equal(sb.__store.chantiers.find((c) => c.id === "A-ch").date_debut, "2026-08-13");
  assert.equal(sb.__store.tasks.find((t) => t.id === "A-t3").due_date, "2026-08-14", "3e tâche non déplacée");
  const mism = res.verifications.filter((v) => v.status === "mismatch");
  assert.equal(mism.length, 1, "1 mismatch (tâche non déplacée)");

  // 1 email accepté (Karim), 1 email échoué (Lucas) → ✕ explicite
  assert.equal(globalThis.__E2E_SENT.length, 1, "seul l'email de Karim est accepté");
  const failed = res.verifications.filter((v) => v.status === "failed");
  assert.equal(failed.length, 1, "1 envoi en échec → failed");

  // Compte rendu : ✓ + ⚠ + • + ✕, jamais « tout terminé »
  assert.match(res.report, /✓/);
  assert.match(res.report, /⚠/);
  assert.match(res.report, /•/);
  assert.match(res.report, /✕/);
  assert.doesNotMatch(res.report, /tout est terminé/i);
  assert.equal(res.verified, false);
});

// ══════════════════════════════════════════════════════════════════════════════
// Scénario C — ambiguïté (§12) : deux chantiers « Dupont » dans le MÊME tenant
// ══════════════════════════════════════════════════════════════════════════════
test("E2E-C · ambiguïté : deux chantiers Dupont → resolution ambiguous, aucune action", async () => {
  globalThis.__E2E_SENT = [];
  globalThis.__E2E_TRANSPORT = {};
  const sb = createFakeSupabase(baseSeed([
    { id: "A-ch2", tenant_id: "tenant-A", nom: "Toiture Dupont", client_id: "A-client", statut: "planifie", date_debut: "2026-08-20", date_fin_prevue: "2026-08-25" },
  ]));

  const loop = await runTurn1(sb);
  console.log("[C] séquence outils :", toolSequence(loop).join(" → "));
  console.log("[C] réponse :", loop.finalText);
  assert.equal(loop.proposed.length, 0, "aucune action proposée");
  assert.equal(loop.traces.length, 0, "aucune écriture");
  assert.equal(sb.__audit.writes, 0, "aucune écriture en base");
  assert.equal(globalThis.__E2E_SENT.length, 0, "aucun envoi préparé");
  assert.match(String(loop.finalText), /lequel|plusieurs/i, "demande lequel");
  // Les deux chantiers restent intacts
  assert.equal(sb.__store.chantiers.find((c) => c.id === "A-ch").date_debut, "2026-08-10");
  assert.equal(sb.__store.chantiers.find((c) => c.id === "A-ch2").date_debut, "2026-08-20");
});

// ══════════════════════════════════════════════════════════════════════════════
// Scénario D — sécurité tenant (§13) : un acteur tenant B ne voit RIEN de tenant A
// ══════════════════════════════════════════════════════════════════════════════
test("E2E-D · isolation : un acteur du tenant B ne trouve pas le chantier du tenant A", async () => {
  globalThis.__E2E_SENT = [];
  globalThis.__E2E_TRANSPORT = {};
  const sb = createFakeSupabase(baseSeed());
  const actorB = { tenantId: "tenant-B", userId: "user-B", label: "Assistant", fromEmail: "b@tenant-b.test" };

  client.messages.create = makeMissionModel();
  const loop = await runAgentLoop({
    model: "test-model", system: buildWorkspaceToolsSystem(), userMessage: "Décale le chantier Rénovation Dupont de trois jours.",
    history: [], db: sb, actor: actorB, allowEmail: true, allowSms: false, maxIterations: 6, maxTokens: 1000, confirmGate,
  });
  console.log("[D] réponse (tenant B) :", loop.finalText);
  // Le tenant B a « Dupont Rénovation B » (unique chez lui) mais PAS « Rénovation Dupont » de A.
  // La recherche « Rénovation Dupont » côté B ne remonte jamais A-ch → aucune action sur A.
  assert.equal(sb.__store.chantiers.find((c) => c.id === "A-ch").date_debut, "2026-08-10", "tenant A intact");
  assert.equal(sb.__store.tasks.find((t) => t.id === "A-t1").due_date, "2026-08-10", "tâche A intacte");
  // Aucun email n'est parti vers un destinataire du tenant A.
  const dests = globalThis.__E2E_SENT.flatMap((m) => m.to);
  assert.ok(!dests.includes("karim.test@biltia.test") && !dests.includes("lucas.test@biltia.test"));
});
