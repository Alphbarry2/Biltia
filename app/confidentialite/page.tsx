import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

// Phrases d'attestation « Limited Use » exigées par la vérification OAuth de
// Google. Elles DOIVENT rester en anglais et mot pour mot : c'est ce texte exact
// que le relecteur Google recherche sur la page publique. Ne pas traduire, ne pas
// reformuler, même le jour où cette page passera en bilingue.
const LIMITED_USE_GOOGLE_API =
  "Biltia's use and transfer of information received from Google APIs to any other app will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";
const LIMITED_USE_WORKSPACE =
  "The use and transfer of raw or derived user data received from Google Workspace APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Quelles données Biltia collecte, pourquoi, avec qui elles sont partagées, comment elles sont protégées, et vos droits.",
  alternates: { canonical: "/confidentialite" },
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro="Biltia collecte le minimum de données nécessaire pour fonctionner. Voici lesquelles, pourquoi, avec qui elles sont partagées, comment elles sont protégées, et comment garder le contrôle."
      updated="juillet 2026"
      sections={[
        {
          id: "donnees",
          title: "Les données que nous traitons",
          body: (
            <ul>
              <li><strong>Compte</strong> : votre adresse email et votre nom, pour créer et sécuriser votre espace.</li>
              <li><strong>Vos données de travail</strong> : ce que vous saisissez ou importez (clients, chantiers, employés, documents, etc.). Elles vous appartiennent.</li>
              <li><strong>Données Google</strong> : uniquement si vous connectez Gmail, Google Agenda ou Google Drive. Le détail figure à la section suivante.</li>
              <li><strong>Paiement</strong> : géré par Stripe. Nous ne stockons jamais votre numéro de carte.</li>
              <li><strong>Mesure d&rsquo;audience</strong> : des statistiques d&rsquo;usage via <strong>PostHog</strong>, pour comprendre comment le produit est utilisé et l&rsquo;améliorer.</li>
              <li><strong>Données techniques</strong> : journaux et cookies nécessaires au fonctionnement.</li>
            </ul>
          ),
        },
        {
          id: "google",
          title: "Données Google et usage limité (Limited Use)",
          body: (
            <>
              <p>
                La connexion à Google est facultative. Tant que vous ne la faites pas, Biltia
                n&rsquo;accède à aucune donnée Google. Si vous la faites, vous nous accordez exactement
                trois autorisations, et rien de plus :
              </p>
              <ul>
                <li>
                  <strong>Gmail (<code>gmail.send</code>)</strong> : envoyer un email en votre nom,
                  quand vous le demandez (un devis, une relance, une confirmation). Cette
                  autorisation est en écriture seule : Biltia ne peut pas lire, lister, ni parcourir
                  votre boîte de réception, et ne le fait jamais.
                </li>
                <li>
                  <strong>Google Agenda (<code>calendar.events</code>)</strong> : lire vos événements
                  pour vous répondre (« qu&rsquo;est-ce que j&rsquo;ai demain ? », planifier une
                  intervention sans doublon) et créer les événements que vous demandez. Nous
                  n&rsquo;accédons qu&rsquo;aux événements, jamais aux réglages de votre compte Google.
                </li>
                <li>
                  <strong>Google Drive (<code>drive.file</code>)</strong> : accéder uniquement aux
                  fichiers que Biltia a créés ou que vous avez explicitement ouverts avec Biltia. Le
                  reste de votre Drive nous est invisible.
                </li>
              </ul>
              <p>
                <strong>Ce que nous ne faisons jamais avec vos données Google</strong> : nous ne les
                vendons pas, nous ne les cédons pas, nous ne les utilisons pas pour de la publicité
                ou du profilage, nous ne les transmettons à aucun courtier en données, et nous ne les
                utilisons pas pour entraîner, réentraîner ou améliorer des modèles
                d&rsquo;intelligence artificielle généralisés. Aucun être humain ne les lit, sauf
                accord explicite de votre part, pour résoudre un incident que vous nous signalez, ou
                si la loi nous y oblige.
              </p>
              <p>
                Biltia se conforme à la{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , y compris aux exigences d&rsquo;usage limité (Limited Use). Attestation publique :
              </p>
              <p><em>{LIMITED_USE_GOOGLE_API}</em></p>
              <p><em>{LIMITED_USE_WORKSPACE}</em></p>
              <p>
                Vous pouvez retirer cet accès à tout moment, depuis vos paramètres Biltia ou depuis{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  les autorisations de votre compte Google
                </a>
                . La déconnexion supprime immédiatement et définitivement les jetons d&rsquo;accès
                correspondants de notre base.
              </p>
            </>
          ),
        },
        {
          id: "pourquoi",
          title: "Pourquoi",
          body: (
            <p>
              Uniquement pour fournir le service, gérer votre abonnement et améliorer Biltia. Nous ne
              vendons pas vos données et ne les utilisons pas à des fins publicitaires.
            </p>
          ),
        },
        {
          id: "partage",
          title: "Avec qui nous partageons vos données",
          body: (
            <>
              <p>
                Nous ne vendons vos données à personne. Nous ne les partageons, ne les transférons et
                ne les divulguons qu&rsquo;aux prestataires ci-dessous, qui les traitent pour notre
                compte, sur nos instructions, et uniquement pour faire fonctionner le service :
              </p>
              <ul>
                <li>
                  <strong>Supabase</strong> : hébergement de la base de données et authentification
                  (infrastructure dans l&rsquo;Union européenne). Reçoit vos données de compte et de
                  travail, ainsi que vos jetons Google.
                </li>
                <li>
                  <strong>Anthropic</strong> : génération par intelligence artificielle. Reçoit ce
                  que vous soumettez pour créer un outil, un document ou une réponse. Si votre
                  demande porte sur votre agenda (par exemple « qu&rsquo;est-ce que j&rsquo;ai
                  demain ? »), les événements Google concernés lui sont transmis, uniquement le temps
                  de produire ce résultat. En vertu de nos conditions commerciales, Anthropic
                  n&rsquo;utilise pas ces données pour entraîner ses modèles.
                </li>
                <li>
                  <strong>Stripe</strong> : paiement des abonnements. Reçoit votre email et vos
                  informations de facturation, jamais vos données de travail ni vos données Google.
                </li>
                <li>
                  <strong>PostHog</strong> : mesure d&rsquo;audience. Reçoit des statistiques
                  d&rsquo;usage (pages vues, actions), jamais le contenu de vos documents ni vos
                  données Google.
                </li>
                <li>
                  <strong>Vercel</strong> : hébergement de l&rsquo;application et journaux techniques.
                </li>
              </ul>
              <p>
                En dehors de cette liste, nous ne divulguons vos données qu&rsquo;à votre demande
                explicite (par exemple lorsque vous partagez un document avec votre client), ou
                lorsque la loi nous y contraint (réquisition judiciaire). Nous ne transférons jamais
                vos données à des annonceurs, à des courtiers en données ou à des tiers à des fins de
                publicité, de profilage ou de revente.
              </p>
            </>
          ),
        },
        {
          id: "protection",
          title: "Comment nous protégeons vos données",
          body: (
            <>
              <p>
                Les données sensibles, en particulier vos jetons d&rsquo;accès Google et le contenu de
                votre espace de travail, bénéficient des protections suivantes :
              </p>
              <ul>
                <li>
                  <strong>Chiffrement en transit</strong> : tous les échanges passent par HTTPS
                  (TLS 1.2 ou supérieur). Aucune donnée ne circule en clair.
                </li>
                <li>
                  <strong>Chiffrement au repos</strong> : la base de données et les sauvegardes sont
                  chiffrées au repos (AES-256) chez notre hébergeur Supabase.
                </li>
                <li>
                  <strong>Jetons Google isolés</strong> : vos jetons d&rsquo;accès et de
                  rafraîchissement Google sont stockés dans une table protégée par une sécurité au
                  niveau des lignes (RLS) sans aucune règle d&rsquo;accès. Concrètement, aucun
                  utilisateur connecté, même en attaquant directement la base, ne peut les lire :
                  seul notre serveur y accède. Ils ne sont jamais envoyés au navigateur, jamais
                  journalisés, et jamais transmis à un tiers.
                </li>
                <li>
                  <strong>Cloisonnement des espaces</strong> : chaque espace de travail est isolé des
                  autres au niveau de la base, et les droits de chaque membre sont contrôlés par des
                  rôles (RBAC).
                </li>
                <li>
                  <strong>Accès minimal</strong> : l&rsquo;accès aux systèmes de production est
                  restreint, authentifié et journalisé. Nos collaborateurs ne consultent pas vos
                  données.
                </li>
                <li>
                  <strong>Portée minimale</strong> : nous ne demandons que les autorisations Google
                  strictement nécessaires aux fonctionnalités que vous utilisez, et rien de plus.
                </li>
                <li>
                  <strong>Suppression</strong> : la déconnexion d&rsquo;un service supprime ses jetons
                  immédiatement. La suppression du compte efface l&rsquo;ensemble de vos données.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "duree",
          title: "Combien de temps",
          body: (
            <p>
              Vos données sont conservées tant que votre compte est actif. Vous pouvez les exporter ou
              les supprimer à tout moment. À la suppression du compte, elles sont effacées. Les
              données Google ne sont pas conservées au-delà de ce qui est nécessaire à la
              fonctionnalité que vous utilisez : les événements d&rsquo;agenda lus pour répondre à une
              question ne sont pas stockés.
            </p>
          ),
        },
        {
          id: "droits",
          title: "Vos droits",
          body: (
            <p>
              Vous pouvez accéder à vos données, les rectifier, les exporter ou les supprimer. La
              plupart de ces actions sont disponibles directement dans vos paramètres (export et
              suppression du compte). Pour toute demande :{" "}
              <a href="mailto:contact@biltia.com">contact@biltia.com</a>.
            </p>
          ),
        },
        {
          id: "cookies",
          title: "Cookies",
          body: (
            <p>
              Biltia utilise des cookies nécessaires à votre session, ainsi que la mesure
              d&rsquo;audience PostHog pour améliorer le produit.
            </p>
          ),
        },
      ]}
    />
  );
}
