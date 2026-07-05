"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /connectors — tous les outils de l'artisan, connectés ou intégrés.
// Accessible depuis la sidebar et le badge « Connectez vos outils » de l'accueil.
// ─────────────────────────────────────────────────────────────────────────────

import { Plug } from "lucide-react";
import { ConnectionsPanel } from "@/components/connections";

export default function ConnectorsPage() {
  return (
    <div className="min-h-full bg-[#FCFCFD]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center">
            <Plug className="w-5 h-5 text-violet-600" />
          </span>
          <h1 className="text-2xl font-black text-[#0A0A0A] tracking-[-0.03em]">Connecteurs</h1>
        </div>
        <p className="text-[14px] text-[#6E6E6C] mb-6 ml-12">
          Connectez vos outils pour que Biltia agisse pour vous : envoyer un devis depuis votre email,
          créer un rendez-vous dans votre agenda, sauvegarder vos PDF. Les outils « Intégré »
          fonctionnent déjà, sans connexion.
        </p>
        <ConnectionsPanel />
      </div>
    </div>
  );
}
