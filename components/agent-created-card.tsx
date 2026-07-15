"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA CARTE « AGENT ACTIVÉ » dans le chat.
//
// Avant, le copilote rendait un pavé markdown BRUT (les ** littéraux, l'emoji, le
// prix et le premier passage noyés dans une seule bulle grise). Impossible de
// repérer d'un coup d'œil que l'agent était bien lancé, ni ce qu'il allait coûter.
//
// Ici : un badge d'activation qui PULSE (l'agent tourne), le nom en gros, trois
// lignes hiérarchisées (Quand · Action · Coût), le premier passage en pied, et un
// bouton qui mène droit à la page /agents. Les données viennent structurées du
// serveur (lib/agent-card) — ce composant ne fait que les mettre en scène.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Zap, Coins, Users, ArrowRight, AlertTriangle } from "lucide-react";
import type { AgentCard, AgentCardRow } from "@/lib/agent-card";
import { useT } from "@/lib/i18n/context";

const ROW_ICON: Record<AgentCardRow["kind"], typeof Clock> = {
  when: Clock,
  action: Zap,
  cost: Coins,
  recipients: Users,
};

export function AgentCreatedCard({ card }: { card: AgentCard }) {
  const t = useT();
  // Entrée en douceur (opacity + léger glissement) : le petit effet « wow » qui
  // dit « ça vient de se passer ». Déclenché au montage, sans dépendre d'un
  // utilitaire Tailwind d'animation qui pourrait ne pas être présent.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const active = card.status === "active";
  const rowLabel = (kind: AgentCardRow["kind"]): string => {
    switch (kind) {
      case "when":
        return t("Quand", "When");
      case "action":
        return t("Action", "Action");
      case "cost":
        return t("Coût", "Cost");
      case "recipients":
        return t("Destinataires", "Recipients");
    }
  };

  return (
    <div
      className={`w-full max-w-[420px] overflow-hidden rounded-2xl border border-[#ECEAF3] bg-white shadow-[0_6px_22px_rgba(60,40,120,0.08)] transition-all duration-500 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      {/* Liseré d'accent : vert (actif) / ambre (en attente). Le signal couleur
          avant même de lire un mot. */}
      <div
        className={`h-1 w-full bg-gradient-to-r ${
          active ? "from-emerald-400 to-teal-400" : "from-amber-400 to-orange-400"
        }`}
      />

      <div className="p-4">
        {/* Badge d'état + nom de l'agent : la hiérarchie commence ici. */}
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] ${
            active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          <span className="relative flex h-1.5 w-1.5">
            {active && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                active ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
          </span>
          {active ? t("Agent activé", "Agent activated") : t("Presque prêt", "Almost ready")}
        </div>

        <h3 className="mt-2 text-[16px] font-bold leading-snug tracking-[-0.01em] text-[#0A0A0A]">
          {card.title}
        </h3>

        {/* Lignes clés : icône + libellé discret + valeur forte. Chacun son ancre
            visuelle — on ne cherche plus le prix dans un paragraphe. */}
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5">
          {card.rows.map((row, i) => {
            const Icon = ROW_ICON[row.kind];
            return (
              <div key={i} className="contents">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border border-[#F0EEF6] bg-[#FAFAFC] text-[#7C5CFF]">
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#A0A0AC]">
                    {rowLabel(row.kind)}
                  </div>
                  <div className="text-[13.5px] font-medium leading-snug text-[#0A0A0A]">
                    {row.value}
                  </div>
                  {row.hint && (
                    <div className="mt-0.5 text-[12px] leading-snug text-[#9A9AA5]">{row.hint}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* En attente : ce qui manque, sans jargon. Les boutons « Connecter »
            arrivent juste en dessous dans le fil (connectFlow). */}
        {card.pending && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.2} />
            <span>{card.pending}</span>
          </div>
        )}

        {card.footnote && !card.pending && (
          <p className="mt-3 text-[12.5px] leading-snug text-[#8A8A94]">{card.footnote}</p>
        )}

        <Link
          href="/agents"
          className="mt-3.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0A0A0A] px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t("Voir l'agent", "View agent")}
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
        </Link>
      </div>
    </div>
  );
}
