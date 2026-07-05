import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description: "Offres, paiement, abonnement et résiliation de Biltia.",
};

export default function CGVPage() {
  return (
    <LegalPage
      title="Conditions générales de vente"
      intro="Ces conditions encadrent les abonnements payants à Biltia."
      sections={[
        {
          id: "objet",
          title: "Objet",
          body: <p>Biltia propose un service en ligne qui, à partir de votre demande, génère des outils, documents et réponses pour votre activité BTP.</p>,
        },
        {
          id: "offres",
          title: "Offres et prix",
          body: (
            <p>
              Une offre gratuite et une offre payante sont proposées, ainsi qu&apos;une formule sur devis pour les
              entreprises. Le détail et les prix figurent sur la page <Link href="/tarifs">Tarifs</Link>.
            </p>
          ),
        },
        {
          id: "paiement",
          title: "Paiement",
          body: (
            <p>
              Le paiement s&apos;effectue par carte via Stripe. L&apos;abonnement payant est mensuel et se renouvelle
              automatiquement, jusqu&apos;à résiliation.
            </p>
          ),
        },
        {
          id: "credits",
          title: "Crédits",
          body: (
            <p>
              L&apos;usage de l&apos;intelligence artificielle consomme des crédits inclus dans votre offre. La consultation
              et la modification manuelle de vos données ne consomment pas de crédits.
            </p>
          ),
        },
        {
          id: "resiliation",
          title: "Résiliation",
          body: (
            <p>
              Vous pouvez résilier à tout moment depuis vos paramètres. Votre accès reste actif jusqu&apos;à la fin de la
              période déjà payée. Vos données restent accessibles en lecture, et exportables, même après la fin d&apos;un
              abonnement payant.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: <p>Pour toute question : <a href="mailto:contact@biltia.com">contact@biltia.com</a>.</p>,
        },
      ]}
    />
  );
}
