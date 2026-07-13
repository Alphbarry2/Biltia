import type { Metadata } from "next";
import ConnectorsView from "./connectors-view";

export const metadata: Metadata = {
  title: "Connecteurs",
  description:
    "Gmail, Google Calendar, WhatsApp, exports, téléphone : ce que Biltia peut faire avec chacun de vos outils, et ce qu'il ne peut pas faire. Les droits demandés, écrits noir sur blanc.",
  alternates: { canonical: "/connecteurs" },
  openGraph: {
    title: "Connecteurs · Biltia",
    description:
      "Chaque connecteur, ses pouvoirs et ses limites. Envoyer un email ne donne pas le droit de les lire.",
    url: "/connecteurs",
  },
};

export default function ConnecteursPage() {
  return <ConnectorsView />;
}
