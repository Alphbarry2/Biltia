import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: pick(locale, "Conditions générales d'utilisation", "Terms of Use"),
    description: pick(locale, "Règles d'utilisation du service Biltia.", "Rules for using the Biltia service."),
  };
}

export default async function CGUPage() {
  const locale = await getLocale();
  return (
    <LegalPage
      title={pick(locale, "Conditions générales d'utilisation", "Terms of Use")}
      intro={pick(locale, "En utilisant Biltia, vous acceptez les règles ci-dessous.", "By using Biltia, you agree to the rules below.")}
      updated={pick(locale, "juillet 2026", "July 2026")}
      sections={[
        {
          id: "service",
          title: pick(locale, "Le service", "The service"),
          body: <p>{pick(locale, "Biltia est un assistant qui génère des outils, documents et réponses à partir de votre demande, et vous permet de centraliser les données de votre entreprise.", "Biltia is an assistant that generates tools, documents and answers from your request, and lets you centralize your company's data.")}</p>,
        },
        {
          id: "compte",
          title: pick(locale, "Votre compte", "Your account"),
          body: <p>{pick(locale, "Vous êtes responsable de la confidentialité de vos identifiants et de l'activité sur votre compte.", "You are responsible for keeping your credentials confidential and for the activity on your account.")}</p>,
        },
        {
          id: "donnees",
          title: pick(locale, "Vos données vous appartiennent", "Your data belongs to you"),
          body: (
            <p>
              {pick(locale, "Vous restez propriétaire des données que vous saisissez ou importez. Vous nous autorisez uniquement à les traiter pour faire fonctionner le service. Vous pouvez les exporter ou les supprimer à tout moment.", "You remain the owner of the data you enter or import. You authorize us solely to process it to operate the service. You can export or delete it at any time.")}
            </p>
          ),
        },
        {
          id: "usage",
          title: pick(locale, "Usage acceptable", "Acceptable use"),
          body: <p>{pick(locale, "Vous vous engagez à ne pas utiliser Biltia à des fins illégales ni à y stocker de contenu illicite.", "You agree not to use Biltia for illegal purposes or to store unlawful content on it.")}</p>,
        },
        {
          id: "ia",
          title: pick(locale, "Contenus générés par l'IA", "AI-generated content"),
          body: (
            <p>
              {pick(locale, "Les résultats produits par l'intelligence artificielle sont fournis en l'état et peuvent comporter des erreurs. Vérifiez-les avant tout usage important, notamment les documents. Biltia ne saurait être tenu responsable des décisions prises sur cette base.", "Results produced by artificial intelligence are provided as-is and may contain errors. Check them before any significant use, especially documents. Biltia cannot be held liable for decisions made on this basis.")}
            </p>
          ),
        },
        {
          id: "dispo",
          title: pick(locale, "Disponibilité et responsabilité", "Availability and liability"),
          body: (
            <p>
              {pick(locale, "Le service est fourni au mieux, sans garantie d'absence d'interruption. Nous pouvons suspendre un compte en cas d'usage abusif ou contraire à ces conditions.", "The service is provided on a best-effort basis, with no guarantee of uninterrupted availability. We may suspend an account in case of abusive use or breach of these terms.")}
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
