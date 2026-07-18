// Tests unitaires WS-C — politique de confirmation. Lancer :
//   node --test --experimental-strip-types lib/action-risk.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { actionTier, requiresConfirmation } from "./action-risk.ts";

test("actionTier : lectures = immediate", () => {
  assert.equal(actionTier("workspace_list"), "immediate");
  assert.equal(actionTier("workspace_get"), "immediate");
  assert.equal(actionTier("app_data_list"), "immediate");
  assert.equal(actionTier("outil_inconnu"), "immediate");
});

test("actionTier : create/update/avenant = preference", () => {
  assert.equal(actionTier("workspace_create"), "preference");
  assert.equal(actionTier("workspace_update"), "preference");
  assert.equal(actionTier("create_avenant"), "preference");
});

test("actionTier : delete/transform/envois = mandatory", () => {
  assert.equal(actionTier("workspace_delete"), "mandatory");
  assert.equal(actionTier("workspace_transform"), "mandatory");
  assert.equal(actionTier("send_email"), "mandatory");
  assert.equal(actionTier("send_sms"), "mandatory");
});

test("requiresConfirmation : lecture → jamais", () => {
  assert.equal(requiresConfirmation("workspace_list"), false);
  assert.equal(requiresConfirmation("workspace_get", { alwaysConfirm: true }), false);
});

test("requiresConfirmation : mandatory → toujours", () => {
  assert.equal(requiresConfirmation("workspace_delete"), true);
  assert.equal(requiresConfirmation("workspace_delete", { alwaysConfirm: false }), true);
  assert.equal(requiresConfirmation("workspace_transform"), true);
  assert.equal(requiresConfirmation("send_email"), true);
});

test("requiresConfirmation : preference → selon always_confirm", () => {
  assert.equal(requiresConfirmation("workspace_create"), false);
  assert.equal(requiresConfirmation("workspace_create", { alwaysConfirm: false }), false);
  assert.equal(requiresConfirmation("workspace_create", { alwaysConfirm: true }), true);
  assert.equal(requiresConfirmation("workspace_update", { alwaysConfirm: true }), true);
});
