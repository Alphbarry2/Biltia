// Transport EMAIL de test — AUCUN envoi réel. Renvoie « accepté par le transport,
// livraison NON confirmée ». Échec pilotable via globalThis.__E2E_TRANSPORT.failEmailTo.
export async function sendOutboundEmail({ to = [], subject = "" }) {
  const cfg = globalThis.__E2E_TRANSPORT || {};
  const failFor = cfg.failEmailTo || [];
  const fails = to.some((r) => failFor.includes(r));
  if (fails) return { ok: false, reason: "BILTIA_TEST transport: échec d'envoi simulé" };
  const sent = (globalThis.__E2E_SENT ||= []);
  const messageId = `BILTIA_TEST_MESSAGE_${String(sent.length + 1).padStart(3, "0")}`;
  sent.push({ kind: "email", to, subject, accepted: true, delivered: false, provider: "test", messageId });
  return { ok: true, via: "test", note: `accepté (${messageId}) ; livraison non confirmée` };
}
