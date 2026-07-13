"use client";

// ─────────────────────────────────────────────────────────────────────────────
// « Ajouter au calendrier » — rendez-vous, visite ou réception de chantier vers
// l'agenda de l'artisan, sans OAuth : liens pré-remplis Google Agenda /
// Outlook.com + fichier .ics universel (Apple Calendar, Microsoft 365…).
// ─────────────────────────────────────────────────────────────────────────────

import { CalendarPlus, Calendar, Download } from "lucide-react";
import { ActionMenu, type ActionItem } from "./action-menu";
import { useT } from "@/lib/i18n/context";
import {
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  downloadIcs,
  safeFilename,
  type CalendarEvent,
} from "@/lib/integrations";

export function AddToCalendar({ event }: { event: CalendarEvent }) {
  const t = useT();
  const actions: ActionItem[] = [
    {
      key: "google",
      label: t("Google Agenda", "Google Calendar"),
      icon: <Calendar className="h-3.5 w-3.5" />,
      run: () => {
        window.open(buildGoogleCalendarUrl(event), "_blank", "noopener");
      },
    },
    {
      key: "outlook",
      label: "Outlook.com",
      icon: <Calendar className="h-3.5 w-3.5" />,
      run: () => {
        window.open(buildOutlookCalendarUrl(event), "_blank", "noopener");
      },
    },
    {
      key: "ics",
      label: t("Apple / autre (.ics)", "Apple / other (.ics)"),
      hint: t("Fichier universel : Apple Calendar, Microsoft 365…", "Universal file: Apple Calendar, Microsoft 365…"),
      icon: <Download className="h-3.5 w-3.5" />,
      run: () => {
        downloadIcs(event, safeFilename(event.title, "ics"));
      },
    },
  ];

  return (
    <ActionMenu
      label={t("Ajouter au calendrier", "Add to calendar")}
      icon={<CalendarPlus className="h-3.5 w-3.5" />}
      actions={actions}
      menuClassName="w-[248px]"
      buttonClassName="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#F3EFFC] text-[#7C3AED] border border-[#E2D9F8] text-xs font-semibold rounded-lg hover:bg-[#EAE2FA] hover:border-[#C9BEF0] transition-all"
    />
  );
}
