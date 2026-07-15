// ─────────────────────────────────────────────────────────────────────────────
// /api/auth/keepalive — garde l'employé connecté, surtout sur iPhone.
//
// LE PROBLÈME. Le middleware ne fait AUCUN appel réseau (choix de perf assumé,
// cf. middleware.ts) : il lit la présence du cookie, rien d'autre. Le
// rafraîchissement du jeton se fait donc entièrement dans le NAVIGATEUR, et
// @supabase/ssr y écrit les cookies en JavaScript (document.cookie). Or Safari
// purge les cookies écrits en JavaScript au bout de 7 jours sans visite (ITP),
// y compris pour une PWA installée. Un couvreur sur iPhone qui ne touche pas à
// son app pendant une semaine se retrouve déconnecté ; sur Android, jamais.
//
// LA CORRECTION. Ici, côté serveur (runtime Node), on force un refresh : les
// nouveaux jetons repartent par un en-tête Set-Cookie ÉMIS PAR LE SERVEUR, avec
// le maxAge de @supabase/ssr (400 jours). Un cookie posé par le serveur n'est pas
// soumis au plafond des 7 jours. Chaque ouverture de l'app remet donc le compteur
// à zéro, et un usage même hebdomadaire suffit à ne jamais être déconnecté.
//
// Appelé à l'ouverture d'une app en plein écran (cf. components/standalone-app).
// Sans session : 204, pas d'erreur — ce n'est pas un échec, il n'y a juste rien
// à prolonger.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";

// supabase-js n'a rien à faire dans le runtime Edge (cf. l'en-tête du middleware).
export const runtime = "nodejs";
// Aucune mise en cache : la réponse POSE des cookies.
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();

  // getUser() valide le jeton auprès de Supabase (et non le cookie tel quel).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 204 });

  // On ne se contente PAS d'attendre l'expiration : sans refresh explicite, aucun
  // Set-Cookie n'est émis et le cookie resterait celui écrit en JavaScript — donc
  // toujours plafonné à 7 jours sur iOS. Le refresh est ce qui le fait RÉÉCRIRE
  // par le serveur. La rotation du jeton est gérée par Supabase.
  const { error } = await supabase.auth.refreshSession();
  if (error) {
    // Jeton de refresh révoqué ou expiré : rien à prolonger, l'AuthGuard côté
    // client renverra vers /login. On ne casse pas l'ouverture de l'app pour ça.
    return new Response(null, { status: 204 });
  }

  return Response.json({ ok: true });
}
