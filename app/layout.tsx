import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Batify — Créez vos outils BTP par la voix, en 90 secondes",
  description:
    "Batify génère des applications sur-mesure pour artisans et PME du bâtiment. Devis, chantiers, sous-traitants — décrivez ce que vous voulez, c'est prêt. Zéro code. Zéro formation.",
  keywords: ["BTP", "bâtiment", "artisan", "PME", "application", "devis", "chantier", "QUALIBAT", "EBP", "Batigest"],
  openGraph: {
    title: "Batify — Créez vos outils BTP par la voix",
    description:
      "Décrivez en 30 secondes l'outil dont vous avez besoin. Batify génère l'application, la déploie sur mobile, et vous pouvez l'utiliser sur le chantier le soir même.",
    type: "website",
    locale: "fr_FR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
