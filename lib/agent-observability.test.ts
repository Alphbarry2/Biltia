// Tests unitaires WS-E — rédaction des étapes. Lancer :
//   node --test --experimental-strip-types lib/agent-observability.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyToolKind,
  draftBlockedStep,
  draftToolStep,
  redactToolInput,
  summarizeResult,
} from "./agent-observability.ts";

// ── classifyToolKind ─────────────────────────────────────────────────────────

test("classifyToolKind", () => {
  assert.equal(classifyToolKind("workspace_list"), "read");
  assert.equal(classifyToolKind("workspace_get"), "read");
  assert.equal(classifyToolKind("workspace_create"), "write");
  assert.equal(classifyToolKind("workspace_update"), "write");
  assert.equal(classifyToolKind("workspace_delete"), "write");
  assert.equal(classifyToolKind("workspace_transform"), "write");
  assert.equal(classifyToolKind("send_email"), "email");
  assert.equal(classifyToolKind("send_sms"), "sms");
  assert.equal(classifyToolKind("outil_inconnu"), "read"); // défaut sûr
});

// ── redactToolInput : AUCUNE valeur libre ne doit survivre ───────────────────

test("redact list : garde clés/flags, jamais le terme de recherche ni les valeurs", () => {
  const out = redactToolInput("workspace_list", {
    entity: "clients",
    search: "Dupont",
    match: { statut: "actif", ville: "Namur" },
    order: "nom",
    limit: 10,
  });
  assert.deepEqual(out, { entity: "clients", filterKeys: ["statut", "ville"], search: true, order: "nom", limit: 10 });
  const s = JSON.stringify(out);
  assert.ok(!s.includes("Dupont"), "le terme de recherche ne doit pas fuiter");
  assert.ok(!s.includes("actif") && !s.includes("Namur"), "les valeurs de filtre ne doivent pas fuiter");
});

test("redact create/update : garde les NOMS de champs, jamais les valeurs", () => {
  const out = redactToolInput("workspace_create", {
    entity: "chantiers",
    values: { nom: "Villa Dupont", budget: 125000, ville: "Liège" },
  });
  assert.deepEqual(out, { entity: "chantiers", fields: ["nom", "budget", "ville"] });
  const s = JSON.stringify(out);
  assert.ok(!s.includes("Villa Dupont") && !s.includes("125000") && !s.includes("Liège"));
});

test("redact get/delete : présence d'un id, jamais sa valeur", () => {
  assert.deepEqual(redactToolInput("workspace_get", { entity: "devis", id: "9b2f-secret-uuid" }), {
    entity: "devis",
    byId: true,
  });
  assert.deepEqual(redactToolInput("workspace_delete", { entity: "clients", id: "abc" }), {
    entity: "clients",
    byId: true,
  });
});

test("redact transform : action (enum) conservée", () => {
  const out = redactToolInput("workspace_transform", { entity: "devis", action: "invoice_from_devis", sourceId: "x" });
  assert.equal(out.action, "invoice_from_devis");
  assert.equal(out.byId, true);
  assert.ok(!JSON.stringify(out).includes('"x"'));
});

test("redact fallback (outil inconnu) : clés seulement", () => {
  const out = redactToolInput("send_email", { to: "client@example.com", subject: "Relance", body: "Bonjour Jean" });
  assert.deepEqual(out, { fields: ["to", "subject", "body"] });
  const s = JSON.stringify(out);
  assert.ok(!s.includes("client@example.com") && !s.includes("Bonjour Jean"));
});

// ── summarizeResult : borné, sans valeur de ligne ────────────────────────────

test("summarizeResult", () => {
  assert.equal(summarizeResult({ count: 12, rows: [] }), "12 ligne(s)");
  assert.equal(summarizeResult({ rows: [1, 2, 3] }), "3 ligne(s)");
  assert.equal(summarizeResult({ row: { nom: "x" } }), "1 fiche");
  assert.equal(summarizeResult({ ok: true, id: "F-2026-014" }), "id F-2026-014");
  assert.equal(summarizeResult({ ok: true }), "ok");
  assert.equal(summarizeResult({ error: "duplicate key (nom)=(Dupont)" }), "erreur"); // message NON stocké
  assert.equal(summarizeResult(null), "ok");
});

// ── draftToolStep / draftBlockedStep ─────────────────────────────────────────

test("draftToolStep : lecture", () => {
  const step = draftToolStep("workspace_list", { entity: "chantiers", search: "Dupont" }, { count: 3, rows: [] });
  assert.equal(step.kind, "read");
  assert.equal(step.tool, "workspace_list");
  assert.equal(step.entity, "chantiers");
  assert.equal(step.resultSummary, "3 ligne(s)");
  assert.ok(!JSON.stringify(step).includes("Dupont"));
});

test("draftToolStep : écriture", () => {
  const step = draftToolStep("workspace_create", { entity: "devis", values: { nom: "X" } }, { ok: true, id: "d1" });
  assert.equal(step.kind, "write");
  assert.equal(step.resultSummary, "id d1");
  assert.deepEqual(step.inputRedacted, { entity: "devis", fields: ["nom"] });
});

test("draftBlockedStep : plafond de sûreté", () => {
  const step = draftBlockedStep("workspace_delete", { entity: "clients", id: "x" });
  assert.equal(step.kind, "blocked");
  assert.match(step.resultSummary, /plafond/);
});
