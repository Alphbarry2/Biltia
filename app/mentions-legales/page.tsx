import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: pick(locale, "Mentions légales", "Legal notice"),
    description: pick(
      locale,
      "Éditeur, contact et hébergement du service Biltia.",
      "Publisher, contact and hosting of the Biltia service.",
    ),
  };
}

export default async function MentionsLegalesPage() {
  const locale = await getLocale();
  return (
    <LegalPage
      title={pick(locale, "Mentions légales", "Legal Notice")}
      intro={pick(locale, "Les informations à connaître sur l'éditeur du service et son hébergement.", "Key information about the service's publisher and its hosting.")}
      updated={pick(locale, "juillet 2026", "July 2026")}
      sections={[
        {
          id: "editeur",
          title: pick(locale, "Éditeur", "Publisher"),
          body: (
            <>
              <p>
                {pick(locale, "Le service ", "The ")}<strong>Biltia</strong>{pick(locale, " (l'assistant conversationnel du BTP) est édité et exploité par Biltia.", " service (the conversational assistant for construction) is published and operated by Biltia.")}
              </p>
              <p>
                {pick(locale, "Contact : ", "Contact: ")}<a href="mailto:contact@biltia.com">contact@biltia.com</a>
              </p>
            </>
          ),
        },
        {
          id: "hebergement",
          title: pick(locale, "Hébergement", "Hosting"),
          body: (
            <p>
              {pick(locale, "L'application est hébergée par Vercel Inc. Les données des utilisateurs sont stockées et gérées par Supabase, sur une infrastructure située au sein de l'Union européenne.", "The application is hosted by Vercel Inc. User data is stored and managed by Supabase, on infrastructure located within the European Union.")}
            </p>
          ),
        },
        {
          id: "propriete",
          title: pick(locale, "Propriété", "Ownership"),
          body: (
            <p>
              {pick(locale, "La marque Biltia, le site et son contenu (hors données saisies par les utilisateurs) sont la propriété de Biltia. Toute reproduction sans autorisation est interdite.", "The Biltia brand, the site and its content (excluding data entered by users) are the property of Biltia. Any reproduction without authorization is prohibited.")}
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              {pick(locale, "Pour toute question relative au service ou à ces mentions : ", "For any question about the service or this notice: ")}<a href="mailto:contact@biltia.com">contact@biltia.com</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
