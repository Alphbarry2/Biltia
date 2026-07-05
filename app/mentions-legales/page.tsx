import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur, contact et hébergement du service Biltia.",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      title="Mentions légales"
      intro="Les informations à connaître sur l'éditeur du service et son hébergement."
      sections={[
        {
          id: "editeur",
          title: "Éditeur",
          body: (
            <>
              <p>
                Le service <strong>Biltia</strong> (l&apos;assistant conversationnel du BTP) est édité et exploité par Biltia.
              </p>
              <p>
                Contact : <a href="mailto:contact@biltia.com">contact@biltia.com</a>
              </p>
            </>
          ),
        },
        {
          id: "hebergement",
          title: "Hébergement",
          body: (
            <p>
              L&apos;application est hébergée par Vercel Inc. Les données des utilisateurs sont stockées et gérées par
              Supabase, sur une infrastructure située au sein de l&apos;Union européenne.
            </p>
          ),
        },
        {
          id: "propriete",
          title: "Propriété",
          body: (
            <p>
              La marque Biltia, le site et son contenu (hors données saisies par les utilisateurs) sont la propriété de
              Biltia. Toute reproduction sans autorisation est interdite.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              Pour toute question relative au service ou à ces mentions : <a href="mailto:contact@biltia.com">contact@biltia.com</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
