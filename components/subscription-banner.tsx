"use client";

// Bandeau global d'état d'abonnement, affiché en haut de l'app.
//   • past_due (grâce)                 → bandeau ORANGE « paiement refusé, régularisez ».
//   • canceled / unpaid / … (gel)      → bandeau ROUGE « espace en lecture seule ».
// Le blocage réel des écritures est fait CÔTÉ SERVEUR (routes /api/data + IA) ;
// ce bandeau ne fait qu'expliquer à l'utilisateur pourquoi ses actions échouent.
//
// NB : le décompte quotidien exact (J-5 → J-1) exige de connaître l'échéance de
// grâce. Tant qu'elle n'est pas persistée (voir webhook), on affiche « sous 5 jours ».

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";
import { useT } from "@/lib/i18n/context";
import { AlertTriangle, Lock } from "lucide-react";

const FROZEN = new Set(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]);

type BannerState = "ok" | "grace" | "frozen";

export function SubscriptionBanner() {
  const t = useT();
  const [state, setState] = useState<BannerState>("ok");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const membership = await getActiveMembership(supabase, user.id);
      if (!membership?.tenant_id) return;
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("tenant_id", membership.tenant_id)
        .maybeSingle();
      const status: string | undefined = sub?.status;
      if (!status) return;
      if (FROZEN.has(status)) setState("frozen");
      else if (status === "past_due") setState("grace");
    });
  }, []);

  if (state === "ok") return null;

  if (state === "grace") {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 border-b border-orange-200 text-orange-800 text-sm flex-shrink-0">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 min-w-0">
          {t("Paiement refusé. Mettez à jour votre moyen de paiement sous 5 jours pour éviter le gel de vos outils.", "Payment declined. Update your payment method within 5 days to avoid your tools being frozen.")}
        </span>
        <Link
          href="/settings?section=billing"
          className="font-semibold underline whitespace-nowrap hover:text-orange-950"
        >
          {t("Régulariser", "Fix payment")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-800 text-sm flex-shrink-0">
      <Lock className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        {t("Espace en lecture seule : votre abonnement a expiré. Vos données restent consultables et exportables. Réactivez pour reprendre votre activité.", "Read-only workspace: your subscription has expired. Your data stays viewable and exportable. Reactivate to resume your work.")}
      </span>
      <Link
        href="/settings?section=billing"
        className="font-semibold underline whitespace-nowrap hover:text-rose-950"
      >
        {t("Réactiver", "Reactivate")}
      </Link>
    </div>
  );
}
