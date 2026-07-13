"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Réouverture d'un rapport depuis la Bibliothèque : analyse de document
// ('analyse') ou contrôle par lot ('controle'), rendu avec les mêmes vues
// que l'atelier. Lecture seule.
// ─────────────────────────────────────────────────────────────────────────────

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  AnalysisView,
  ReportView,
  type AnalysisResult,
  type ReportResult,
} from "@/components/report-views";
import { ChevronLeft, Loader2, MessageCircle } from "lucide-react";
import { useT } from "@/lib/i18n/context";

type ReportRow = {
  id: string;
  type: string;
  title: string;
  payload: unknown;
  conversation_id: string | null;
  created_at: string;
};

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useT();
  const { id } = use(params);
  const [row, setRow] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("reports")
      .select("id, type, title, payload, conversation_id, created_at")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        setRow(data);
        setLoading(false);
      });
  }, [id]);

  return (
    <div className="flex h-full flex-col bg-[#FCFCFD]">
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-[#ECECF2] bg-white px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/library" className="text-[#6E6E6C] transition-colors hover:text-[#0A0A0A]">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="truncate text-base font-bold tracking-[-0.01em] text-[#0A0A0A]">
            {row?.title ?? t("Rapport", "Report")}
          </h1>
        </div>
        {row?.conversation_id && (
          <Link
            href={`/generate?chat=${row.conversation_id}`}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#6E6E6C] transition-colors hover:bg-[#F6F6F9] hover:text-[#0A0A0A]"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {t("Rouvrir la conversation", "Reopen conversation")}
          </Link>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#7C3AED]" />
          </div>
        ) : !row ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="mb-2 font-bold text-[#0A0A0A]">{t("Rapport introuvable", "Report not found")}</p>
            <p className="mb-5 text-sm text-[#6E6E6C]">{t("Il a peut-être été supprimé, ou vous n'y avez pas accès.", "It may have been deleted, or you don't have access.")}</p>
            <Link href="/library" className="text-[13px] font-semibold text-violet-600 hover:opacity-80">
              {t("Retour à la bibliothèque", "Back to library")}
            </Link>
          </div>
        ) : row.type === "controle" ? (
          <ReportView report={row.payload as ReportResult} />
        ) : (
          <AnalysisView analysis={row.payload as AnalysisResult} />
        )}
      </div>
    </div>
  );
}
