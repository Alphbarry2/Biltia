import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation",
  description: "Règles d'utilisation du service Biltia.",
};

export default function CGUPage() {
  return (
    <LegalPage
      title="Conditions générales d'utilisation"
      intro="En utilisant Biltia, vous acceptez les règles ci-dessous."
      sections={[
        {
          id: "service",
          title: "Le service",
          body: <p>Biltia est un assistant qui génère des outils, documents et réponses à partir de votre demande, et vous permet de centraliser les données de votre entreprise.</p>,
        },
        {
          id: "compte",
          title: "Votre compte",
          body: <p>Vous êtes responsable de la confidentialité de vos identifiants et de l&apos;activité sur votre compte.</p>,
        },
        {
          id: "donnees",
          title: "Vos données vous appartiennent",
          body: (
            <p>
              Vous restez propriétaire des données que vous saisissez ou importez. Vous nous autorisez uniquement à les
              traiter pour faire fonctionner le service. Vous pouvez les exporter ou les supprimer à tout moment.
            </p>
          ),
        },
        {
          id: "usage",
          title: "Usage acceptable",
          body: <p>Vous vous engagez à ne pas utiliser Biltia à des fins illégales ni à y stocker de contenu illicite.</p>,
        },
        {
          id: "ia",
          title: "Contenus générés par l'IA",
          body: (
            <p>
              Les résultats produits par l&apos;intelligence artificielle sont fournis en l&apos;état et peuvent comporter
              des erreurs. Vérifiez-les avant tout usage important, notamment les documents. Biltia ne saurait être tenu
              responsable des décisions prises sur cette base.
            </p>
          ),
        },
        {
          id: "dispo",
          title: "Disponibilité et responsabilité",
          body: (
            <p>
              Le service est fourni au mieux, sans garantie d&apos;absence d&apos;interruption. Nous pouvons suspendre un
              compte en cas d&apos;usage abusif ou contraire à ces conditions.
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
