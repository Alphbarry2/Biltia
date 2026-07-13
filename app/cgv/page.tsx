import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: pick(locale, "Conditions générales de vente", "Terms of Sale"),
    description: pick(
      locale,
      "Offres, paiement, abonnement et résiliation de Biltia.",
      "Biltia's offers, payment, subscription and cancellation.",
    ),
  };
}

export default async function CGVPage() {
  const locale = await getLocale();
  return (
    <LegalPage
      title={pick(locale, "Conditions générales de vente", "Terms of Sale")}
      intro={pick(locale, "Ces conditions encadrent les abonnements payants à Biltia.", "These terms govern paid subscriptions to Biltia.")}
      updated={pick(locale, "juillet 2026", "July 2026")}
      sections={[
        {
          id: "objet",
          title: pick(locale, "Objet", "Purpose"),
          body: <p>{pick(locale, "Biltia propose un service en ligne qui, à partir de votre demande, génère des outils, documents et réponses pour votre activité BTP.", "Biltia offers an online service that, from your request, generates tools, documents and answers for your construction business.")}</p>,
        },
        {
          id: "offres",
          title: pick(locale, "Offres et prix", "Plans and pricing"),
          body: (
            <p>
              {pick(locale, "Une offre gratuite et une offre payante sont proposées, ainsi qu'une formule sur devis pour les entreprises. Le détail et les prix figurent sur la page ", "A free plan and a paid plan are available, along with a custom-quote plan for companies. Details and pricing are on the ")}<Link href="/tarifs">{pick(locale, "Tarifs", "Pricing")}</Link>{pick(locale, ".", " page.")}
            </p>
          ),
        },
        {
          id: "paiement",
          title: pick(locale, "Paiement", "Payment"),
          body: (
            <p>
              {pick(locale, "Le paiement s'effectue par carte via Stripe. L'abonnement payant est mensuel et se renouvelle automatiquement, jusqu'à résiliation.", "Payment is made by card through Stripe. The paid subscription is monthly and renews automatically until cancellation.")}
            </p>
          ),
        },
        {
          id: "credits",
          title: pick(locale, "Crédits", "Credits"),
          body: (
            <p>
              {pick(locale, "L'usage de l'intelligence artificielle consomme des crédits inclus dans votre offre. La consultation et la modification manuelle de vos données ne consomment pas de crédits.", "Using artificial intelligence consumes credits included in your plan. Viewing and manually editing your data does not consume credits.")}
            </p>
          ),
        },
        {
          id: "resiliation",
          title: pick(locale, "Résiliation", "Cancellation"),
          body: (
            <p>
              {pick(locale, "Vous pouvez résilier à tout moment depuis vos paramètres. Votre accès reste actif jusqu'à la fin de la période déjà payée. Vos données restent accessibles en lecture, et exportables, même après la fin d'un abonnement payant.", "You can cancel at any time from your settings. Your access stays active until the end of the period already paid. Your data remains readable and exportable, even after a paid subscription ends.")}
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: <p>{pick(locale, "Pour toute question : ", "For any question: ")}<a href="mailto:contact@biltia.com">contact@biltia.com</a>.</p>,
        },
      ]}
    />
  );
}
