"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Zap, ArrowRight, CheckCircle } from "lucide-react";

const PLANS = [
  { name: "Artisan", price: "29€/mois", credits: "50 crédits", desc: "Indépendant / auto-entrepreneur", current: true },
  { name: "PME", price: "89€/mois", credits: "200 crédits", desc: "5 à 20 salariés", current: false },
  { name: "Pro", price: "249€/mois", credits: "600 crédits", desc: "20 à 100 salariés", current: false },
];

export default function SettingsPage() {
  const [credits, setCredits] = useState<number | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? "");
        supabase
          .from("user_credits")
          .select("balance")
          .eq("user_id", user.id)
          .single()
          .then(({ data }) => { if (data) setCredits(data.balance); });
      }
    });
  }, []);

  return (
    <div className="p-6 sm:p-8 max-w-2xl">
      <h1 className="text-2xl font-display font-bold text-foreground mb-8">Paramètres</h1>

      {/* Account */}
      <section className="mb-8">
        <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-4">Compte</h2>
        <div className="bg-card border border-border rounded-2xl p-5 shadow-depth-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
              <span className="text-sm font-bold text-white">{email ? email[0].toUpperCase() : "?"}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{email || "…"}</p>
              <p className="text-xs text-muted-foreground">Membre Batify</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-accent-soft border border-border rounded-xl">
            <Zap className="w-4 h-4 text-accent-deep" />
            <span className="text-sm text-accent-deep font-semibold tabular">
              {credits !== null ? `${credits} crédits disponibles` : "Chargement…"}
            </span>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section>
        <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-4">Abonnement</h2>
        <div className="space-y-3">
          {PLANS.map(({ name, price, credits: planCredits, desc, current }) => (
            <div
              key={name}
              className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                current
                  ? "bg-accent-soft border-accent"
                  : "bg-card border-border hover:shadow-depth-2 shadow-depth-1"
              }`}
            >
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-display font-bold text-foreground">{name}</span>
                  {current && (
                    <span className="text-xs font-semibold text-accent-deep bg-card border border-border px-2 py-0.5 rounded-full">
                      Actuel
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{desc} · {planCredits}/mois</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display font-bold text-foreground tabular">{price}</span>
                {current ? (
                  <CheckCircle className="w-5 h-5 text-accent-deep" />
                ) : (
                  <button className="flex items-center gap-1 text-xs font-semibold text-accent-deep hover:text-foreground transition-colors">
                    Passer <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Paiement via Stripe · Sans engagement · Résiliation à tout moment
        </p>
      </section>
    </div>
  );
}
