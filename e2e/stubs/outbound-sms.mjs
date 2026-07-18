// Transport SMS de test — AUCUN envoi réel (non utilisé par ce scénario, présent
// pour la complétude du câblage). Renvoie « accepté, livraison non confirmée ».
export async function sendSms({ to = [] }) {
  const sent = (globalThis.__E2E_SENT ||= []);
  const messageId = `BILTIA_TEST_SMS_${String(sent.length + 1).padStart(3, "0")}`;
  sent.push({ kind: "sms", to, accepted: true, delivered: false, provider: "test", messageId });
  return { ok: true, sent: to.length, failed: 0, note: `accepté (${messageId}) ; livraison non confirmée` };
}
