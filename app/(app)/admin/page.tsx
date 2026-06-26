"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { AGENTS } from "@/lib/agents";
import { getSector } from "@/lib/sectors";
import { BarChart3, Boxes, Users, Sparkles } from "lucide-react";

type Row = { key: string; count: number };
type Day = { day: string; count: number };
type Company = { company: string | null; sector: string; apps: number };

type Analytics = {
  total_events: number;
  total_created: number;
  total_apps: number;
  total_users: number;
  by_agent: Row[];
  by_sector: Row[];
  by_app_type: Row[];
  by_day: Day[];
  top_companies: Company[];
};

function agentLabel(key: string): string {
  return key in AGENTS ? AGENTS[key as keyof typeof AGENTS].label : key;
}
function sectorLabel(key: string): string {
  return getSector(key)?.label ?? key;
}

function BarList({
  title,
  rows,
  label,
}: {
  title: string;
  rows: Row[];
  label: (k: string) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-depth-1">
      <h3 className="text-sm font-display font-bold text-foreground mb-4">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune donnée pour l'instant.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-3">
              <span className="text-xs text-foreground w-40 truncate flex-shrink-0">
                {label(r.key)}
              </span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-foreground tabular-nums w-8 text-right">
                {r.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-depth-1">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-3xl font-display font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("admin_analytics").then(({ data, error }) => {
      if (error) setError(error.message);
      else setData(data as Analytics);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Chargement des statistiques…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto mt-20 bg-card border border-border rounded-2xl p-8 text-center shadow-depth-2">
        <h2 className="text-lg font-display font-bold text-foreground mb-2">Accès refusé</h2>
        <p className="text-sm text-muted-foreground">
          Cette page est réservée à l'administrateur.
        </p>
      </div>
    );
  }

  const by_day = data.by_day ?? [];
  const by_agent = data.by_agent ?? [];
  const by_sector = data.by_sector ?? [];
  const by_app_type = data.by_app_type ?? [];
  const top_companies = data.top_companies ?? [];
  const maxDay = Math.max(1, ...by_day.map((d) => d.count));

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8">
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 className="w-5 h-5 text-accent-deep" />
        <h1 className="text-xl font-display font-bold text-foreground">Statistiques</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi icon={<Boxes className="w-4 h-4" />} value={data.total_apps} label="Apps créées" />
        <Kpi icon={<Sparkles className="w-4 h-4" />} value={data.total_created} label="Générations" />
        <Kpi icon={<Users className="w-4 h-4" />} value={data.total_users} label="Comptes" />
        <Kpi icon={<BarChart3 className="w-4 h-4" />} value={data.total_events} label="Événements" />
      </div>

      {/* Activité 30 jours */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-depth-1 mb-6">
        <h3 className="text-sm font-display font-bold text-foreground mb-4">
          Activité (30 derniers jours)
        </h3>
        {by_day.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune activité récente.</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {by_day.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end" title={`${d.day} : ${d.count}`}>
                <div
                  className="w-full bg-accent/80 rounded-t"
                  style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: "2px" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Répartitions */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <BarList title="Par agent" rows={by_agent} label={agentLabel} />
        <BarList title="Par secteur" rows={by_sector} label={sectorLabel} />
        <BarList title="Par type d'app" rows={by_app_type} label={(k) => k} />
      </div>

      {/* Top entreprises */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-depth-1">
        <h3 className="text-sm font-display font-bold text-foreground mb-4">
          Top entreprises (par nb de générations)
        </h3>
        {top_companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune donnée.</p>
        ) : (
          <div className="divide-y divide-border">
            {top_companies.map((c, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <span className="text-xs text-muted-foreground w-5 tabular-nums">{i + 1}</span>
                <span className="text-sm text-foreground flex-1 truncate">
                  {c.company || <span className="text-muted-foreground italic">Sans entreprise</span>}
                </span>
                <span className="text-xs text-muted-foreground w-44 truncate hidden sm:block">
                  {sectorLabel(c.sector)}
                </span>
                <span className="text-sm font-semibold text-foreground tabular-nums w-8 text-right">
                  {c.apps}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
