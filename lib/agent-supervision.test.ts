// Tests unitaires WS-E — supervision. Lancer :
//   node --test --experimental-strip-types lib/agent-supervision.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSupervisionRows, STALE_GRACE_MS } from "./agent-supervision.ts";
import type { SupervisionRuleInput, SupervisionRunInput } from "./agent-supervision.ts";

const NOW = Date.parse("2026-07-18T12:00:00Z");

function rule(over: Partial<SupervisionRuleInput>): SupervisionRuleInput {
  return {
    id: over.id ?? "r1",
    title: over.title ?? "Agent",
    status: over.status ?? "active",
    trigger_type: over.trigger_type ?? "schedule",
    next_run_at: over.next_run_at ?? null,
    last_run_at: over.last_run_at ?? null,
  };
}

test("stale : agent actif dont le créneau est dépassé au-delà de la tolérance", () => {
  const past = new Date(NOW - STALE_GRACE_MS - 60_000).toISOString();
  const rows = buildSupervisionRows([rule({ next_run_at: past })], [], NOW);
  assert.equal(rows[0].stale, true);
});

test("non stale : créneau récent (dans la tolérance)", () => {
  const soon = new Date(NOW - 60_000).toISOString();
  const rows = buildSupervisionRows([rule({ next_run_at: soon })], [], NOW);
  assert.equal(rows[0].stale, false);
});

test("non stale : futur", () => {
  const future = new Date(NOW + 3_600_000).toISOString();
  const rows = buildSupervisionRows([rule({ next_run_at: future })], [], NOW);
  assert.equal(rows[0].stale, false);
});

test("non stale : règle non active même si créneau dépassé", () => {
  const past = new Date(NOW - STALE_GRACE_MS - 60_000).toISOString();
  const rows = buildSupervisionRows([rule({ status: "blocked", next_run_at: past })], [], NOW);
  assert.equal(rows[0].stale, false);
});

test("non stale : pas de next_run_at", () => {
  const rows = buildSupervisionRows([rule({ next_run_at: null })], [], NOW);
  assert.equal(rows[0].stale, false);
});

test("dernier passage : première occurrence (tri desc en amont) retenue", () => {
  const runs: SupervisionRunInput[] = [
    { rule_id: "r1", status: "success", summary: "récent", error: null, finished_at: null, created_at: "2026-07-18T11:00:00Z" },
    { rule_id: "r1", status: "failed", summary: "ancien", error: "boom", finished_at: null, created_at: "2026-07-17T11:00:00Z" },
  ];
  const rows = buildSupervisionRows([rule({ id: "r1" })], runs, NOW);
  assert.equal(rows[0].last_status, "success");
  assert.equal(rows[0].last_summary, "récent");
  assert.equal(rows[0].last_error, null);
});

test("règle sans passage : champs de passage à null", () => {
  const rows = buildSupervisionRows([rule({ id: "r9" })], [], NOW);
  assert.equal(rows[0].last_status, null);
  assert.equal(rows[0].last_summary, null);
});
