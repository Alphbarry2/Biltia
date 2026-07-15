import type { Metadata } from "next";

// La page /tarifs est un composant client (barre de prix interactive, bascule
// mensuel/annuel), et un composant client NE PEUT PAS exporter `metadata`.
// Sans ce layout, la page héritait du titre par défaut « Biltia — l'OS
// conversationnel du BTP » : Google indexait la page prix sous un titre
// générique. Ce layout serveur lui rend son propre titre et sa description,
// sur le même modèle que /connecteurs. Un robot n'a pas de cookie de langue,
// il reçoit donc le FR, version de référence pour le SEO (pas d'URLs /en).
export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Un prix clair, tout est inclus. Choisissez votre capacité IA en crédits : Découverte gratuit avec 400 crédits offerts, Pro dès 49 € par mois, Équipe pour collaborer. Créez vos applications métier et vos agents, sans quota caché.",
  keywords: [
    "tarifs Biltia",
    "prix logiciel BTP",
    "tarif logiciel bâtiment",
    "logiciel devis facture prix",
    "abonnement logiciel artisan",
  ],
  alternates: { canonical: "/tarifs" },
  openGraph: {
    title: "Tarifs · Biltia",
    description:
      "Un prix clair, tout est inclus. Vous choisissez votre capacité IA en crédits, et la collaboration si vous êtes plusieurs. Gratuit pour commencer.",
    url: "/tarifs",
  },
};

export default function TarifsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
