import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getAdminAccessKey, isAdminEmail } from "@/lib/admin";
import AdminLogin from "./admin-login";
import AdminDashboard from "./admin-dashboard";

// Console admin — /admin-console/<clé secrète>.
//   • Barrière 1 : la clé du chemin doit matcher ADMIN_ACCESS_KEY → sinon 404.
//   • Barrière 2 : session Supabase + email autorisé → sinon écran de connexion
//     dédié (ou « accès refusé » si connecté mais non autorisé).
export default async function AdminConsolePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  // Barrière 1 — chemin secret. On ne révèle RIEN sur une mauvaise clé.
  if (key !== getAdminAccessKey()) notFound();

  // Barrière 2 — session + liste blanche.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return <AdminLogin authedButDenied={!!user} deniedEmail={user?.email ?? null} />;
  }

  return <AdminDashboard email={user.email ?? ""} />;
}
