// Stub de next/headers pour le harness (hors runtime Next) : pas de cookies réels
// → i18n retombe sur la locale par défaut (fr). Aucun effet métier.
export function cookies() { return { get: () => undefined, getAll: () => [], has: () => false, set() {}, delete() {} }; }
export function headers() { return { get: () => null, has: () => false, entries: () => [][Symbol.iterator]() }; }
export function draftMode() { return { isEnabled: false }; }
