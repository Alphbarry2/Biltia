import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Quelles données Biltia collecte, pourquoi, avec quels prestataires, et vos droits.",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro="Biltia collecte le minimum de données nécessaire pour fonctionner. Voici lesquelles, pourquoi, et comment garder le contrôle."
      sections={[
        {
          id: "donnees",
          title: "Les données que nous traitons",
          body: (
            <ul>
              <li><strong>Compte</strong> : votre adresse email et votre nom, pour créer et sécuriser votre espace.</li>
              <li><strong>Vos données de travail</strong> : ce que vous saisissez ou importez (clients, chantiers, employés, documents, etc.). Elles vous appartiennent.</li>
              <li><strong>Paiement</strong> : géré par Stripe. Nous ne stockons jamais votre numéro de carte.</li>
              <li><strong>Mesure d&apos;audience</strong> : des statistiques d&apos;usage via <strong>PostHog</strong>, pour comprendre comment le produit est utilisé et l&apos;améliorer.</li>
              <li><strong>Données techniques</strong> : journaux et cookies nécessaires au fonctionnement.</li>
            </ul>
          ),
        },
        {
          id: "pourquoi",
          title: "Pourquoi",
          body: (
            <p>
              Uniquement pour fournir le service, gérer votre abonnement et améliorer Biltia. Nous ne vendons pas vos
              données et ne les utilisons pas à des fins publicitaires.
            </p>
          ),
        },
        {
          id: "prestataires",
          title: "Nos prestataires",
          body: (
            <>
              <p>Pour fonctionner, Biltia s&apos;appuie sur des prestataires de confiance qui traitent des données pour notre compte :</p>
              <ul>
                <li><strong>Supabase</strong> : base de données et authentification (infrastructure dans l&apos;Union européenne).</li>
                <li><strong>Stripe</strong> : paiement des abonnements.</li>
                <li><strong>PostHog</strong> : mesure d&apos;audience.</li>
                <li><strong>Anthropic</strong> : génération par intelligence artificielle. Ce que vous soumettez pour créer un outil, un document ou une réponse lui est transmis uniquement pour produire ce résultat.</li>
              </ul>
            </>
          ),
        },
        {
          id: "duree",
          title: "Combien de temps",
          body: (
            <p>
              Vos données sont conservées tant que votre compte est actif. Vous pouvez les exporter ou les supprimer à
              tout moment. À la suppression du compte, elles sont effacées.
            </p>
          ),
        },
        {
          id: "droits",
          title: "Vos droits",
          body: (
            <p>
              Vous pouvez accéder à vos données, les rectifier, les exporter ou les supprimer. La plupart de ces actions
              sont disponibles directement dans vos paramètres (export et suppression du compte). Pour toute demande :{" "}
              <a href="mailto:contact@biltia.com">contact@biltia.com</a>.
            </p>
          ),
        },
        {
          id: "cookies",
          title: "Cookies",
          body: (
            <p>
              Biltia utilise des cookies nécessaires à votre session, ainsi que la mesure d&apos;audience PostHog pour
              améliorer le produit.
            </p>
          ),
        },
      ]}
    />
  );
}
