// ─────────────────────────────────────────────────────────────────────────────
// CONSOLE ADMIN — contrôle d'accès à DEUX barrières indépendantes (défense en
// profondeur). Les deux doivent passer pour voir quoi que ce soit :
//
//   1. CLÉ DE CHEMIN secrète  → l'URL /admin-console/<clé> n'est pas devinable.
//      Toute autre clé renvoie un 404 sec (ne révèle même pas l'existence de la
//      page). Réglable sans toucher au code via la variable d'env ADMIN_ACCESS_KEY.
//
//   2. LISTE BLANCHE d'emails → même en connaissant l'URL, seul un email
//      explicitement autorisé (session Supabase vérifiée) accède au tableau de
//      bord. VIDE par défaut = PERSONNE n'est autorisé (état demandé au départ).
//
// Pour ouvrir l'accès : ajoute l'email dans la variable d'env ADMIN_EMAILS
// (séparés par des virgules) OU dans ADMIN_EMAILS_FALLBACK ci-dessous. Ce
// fichier est SERVEUR uniquement (ne jamais l'importer dans un composant client :
// ADMIN_EMAILS n'est pas préfixée NEXT_PUBLIC et ne doit pas fuiter au navigateur).
// ─────────────────────────────────────────────────────────────────────────────

/** Emails admin en dur (repli si pas de variable d'env). VIDE = personne. */
const ADMIN_EMAILS_FALLBACK: string[] = [];

/** Clé de chemin par défaut si ADMIN_ACCESS_KEY n'est pas définie. Obscure mais
 *  présente dans le repo : mets une vraie valeur secrète en env pour la prod. */
const DEFAULT_ACCESS_KEY = "b7f3a9c2";

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Vrai si l'email est explicitement autorisé sur la console admin. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = new Set([
    ...ADMIN_EMAILS_FALLBACK.map((e) => e.toLowerCase()),
    ...envList("ADMIN_EMAILS"),
  ]);
  return allow.has(email.trim().toLowerCase());
}

/** Segment secret du chemin : /admin-console/<clé>. */
export function getAdminAccessKey(): string {
  return (process.env.ADMIN_ACCESS_KEY || DEFAULT_ACCESS_KEY).trim();
}
