import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// Phrase d'attestation « Limited Use » exigée par Google pour la vérification
// OAuth. Elle DOIT rester en anglais et mot pour mot : c'est ce texte exact que
// le relecteur Google recherche sur la page publique. Ne pas traduire, ne pas
// reformuler.
const LIMITED_USE_GOOGLE_API =
  "Biltia's use and transfer of information received from Google APIs to any other app will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";
const LIMITED_USE_WORKSPACE =
  "The use and transfer of raw or derived user data received from Google Workspace APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: pick(locale, "Politique de confidentialité", "Privacy policy"),
    description: pick(
      locale,
      "Quelles données Biltia collecte, pourquoi, avec quels prestataires, comment elles sont protégées, et vos droits.",
      "What data Biltia collects, why, with which providers, how it is protected, and your rights.",
    ),
  };
}

export default async function ConfidentialitePage() {
  const locale = await getLocale();
  return (
    <LegalPage
      title={pick(locale, "Politique de confidentialité", "Privacy Policy")}
      intro={pick(locale, "Biltia collecte le minimum de données nécessaire pour fonctionner. Voici lesquelles, pourquoi, avec qui elles sont partagées, comment elles sont protégées, et comment garder le contrôle.", "Biltia collects the minimum data needed to work. Here's what, why, who we share it with, how we protect it, and how to stay in control.")}
      updated={pick(locale, "juillet 2026", "July 2026")}
      sections={[
        {
          id: "donnees",
          title: pick(locale, "Les données que nous traitons", "The data we process"),
          body: (
            <ul>
              <li><strong>{pick(locale, "Compte", "Account")}</strong>{pick(locale, " : votre adresse email et votre nom, pour créer et sécuriser votre espace.", ": your email address and name, to create and secure your workspace.")}</li>
              <li><strong>{pick(locale, "Vos données de travail", "Your work data")}</strong>{pick(locale, " : ce que vous saisissez ou importez (clients, chantiers, employés, documents, etc.). Elles vous appartiennent.", ": what you enter or import (clients, job sites, employees, documents, etc.). It belongs to you.")}</li>
              <li><strong>{pick(locale, "Données Google", "Google user data")}</strong>{pick(locale, " : uniquement si vous connectez Gmail, Google Agenda ou Google Drive. Le détail figure à la section suivante.", ": only if you connect Gmail, Google Calendar or Google Drive. Details in the next section.")}</li>
              <li><strong>{pick(locale, "Paiement", "Payment")}</strong>{pick(locale, " : géré par Stripe. Nous ne stockons jamais votre numéro de carte.", ": handled by Stripe. We never store your card number.")}</li>
              <li><strong>{pick(locale, "Mesure d'audience", "Analytics")}</strong>{pick(locale, " : des statistiques d'usage via ", ": usage statistics via ")}<strong>PostHog</strong>{pick(locale, ", pour comprendre comment le produit est utilisé et l'améliorer.", ", to understand how the product is used and improve it.")}</li>
              <li><strong>{pick(locale, "Données techniques", "Technical data")}</strong>{pick(locale, " : journaux et cookies nécessaires au fonctionnement.", ": logs and cookies required for operation.")}</li>
            </ul>
          ),
        },
        {
          id: "google",
          title: pick(locale, "Données Google et usage limité", "Google user data and Limited Use"),
          body: (
            <>
              <p>
                {pick(
                  locale,
                  "La connexion à Google est facultative. Tant que vous ne la faites pas, Biltia n'accède à aucune donnée Google. Si vous la faites, vous nous accordez exactement trois autorisations, et rien de plus :",
                  "Connecting Google is optional. Until you do, Biltia accesses no Google data at all. If you do, you grant exactly three permissions, and nothing more:",
                )}
              </p>
              <ul>
                <li>
                  <strong>Gmail (<code>gmail.send</code>)</strong>
                  {pick(
                    locale,
                    " : envoyer un email en votre nom, quand vous le demandez (un devis, une relance, une confirmation). Cette autorisation est en écriture seule : Biltia ne peut pas lire, lister, ni parcourir votre boîte de réception, et ne le fait jamais.",
                    ": send an email on your behalf, when you ask for it (a quote, a follow-up, a confirmation). This permission is send-only: Biltia cannot read, list or browse your inbox, and never does.",
                  )}
                </li>
                <li>
                  <strong>Google Agenda (<code>calendar.events</code>)</strong>
                  {pick(
                    locale,
                    " : lire vos événements pour vous répondre (« qu'est-ce que j'ai demain ? », planifier une intervention sans doublon) et créer les événements que vous demandez. Nous n'accédons qu'aux événements, jamais aux réglages de votre compte Google.",
                    ": read your events to answer you (\"what's on tomorrow?\", schedule a job without a clash) and create the events you ask for. We access events only, never your Google account settings.",
                  )}
                </li>
                <li>
                  <strong>Google Drive (<code>drive.file</code>)</strong>
                  {pick(
                    locale,
                    " : classer les PDF produits par Biltia (devis, factures, PV) dans un dossier « Biltia / <chantier> » de votre Drive. Cette autorisation ne donne accès QU'AUX fichiers que Biltia a créés : le reste de votre Drive nous est structurellement invisible, et nous ne pouvons ni le lire, ni le modifier, ni le supprimer.",
                    ": file the PDFs produced by Biltia (quotes, invoices, sign-off sheets) into a “Biltia / <job site>” folder in your Drive. This permission grants access ONLY to the files Biltia created: the rest of your Drive is structurally invisible to us, and we can neither read, modify nor delete it.",
                  )}
                </li>
              </ul>
              <p>
                <strong>{pick(locale, "Ce que nous ne faisons jamais avec vos données Google", "What we never do with your Google data")}</strong>
                {pick(
                  locale,
                  " : nous ne les vendons pas, nous ne les cédons pas, nous ne les utilisons pas pour de la publicité ou du profilage, nous ne les transmettons à aucun courtier en données, et nous ne les utilisons pas pour entraîner, réentraîner ou améliorer des modèles d'intelligence artificielle généralisés. Aucun être humain ne les lit, sauf accord explicite de votre part, pour résoudre un incident que vous nous signalez, ou si la loi nous y oblige.",
                  ": we do not sell it, we do not transfer it, we do not use it for advertising or profiling, we do not pass it to any data broker, and we do not use it to train, retrain or improve generalized artificial intelligence models. No human reads it, except with your explicit consent, to resolve an incident you report to us, or where required by law.",
                )}
              </p>
              <p>
                {pick(
                  locale,
                  "Biltia se conforme à la ",
                  "Biltia complies with the ",
                )}
                <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
                  Google API Services User Data Policy
                </a>
                {pick(locale, ", y compris aux exigences d'usage limité (Limited Use). Attestation publique :", ", including the Limited Use requirements. Public attestation:")}
              </p>
              <p>
                <em>{LIMITED_USE_GOOGLE_API}</em>
              </p>
              <p>
                <em>{LIMITED_USE_WORKSPACE}</em>
              </p>
              <p>
                {pick(
                  locale,
                  "Vous pouvez retirer cet accès à tout moment, depuis vos paramètres Biltia ou depuis ",
                  "You can revoke this access at any time, from your Biltia settings or from ",
                )}
                <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                  {pick(locale, "les autorisations de votre compte Google", "your Google account permissions")}
                </a>
                {pick(
                  locale,
                  ". La déconnexion supprime immédiatement et définitivement les jetons d'accès correspondants de notre base.",
                  ". Disconnecting immediately and permanently deletes the corresponding access tokens from our database.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "pourquoi",
          title: pick(locale, "Pourquoi", "Why"),
          body: (
            <p>
              {pick(locale, "Uniquement pour fournir le service, gérer votre abonnement et améliorer Biltia. Nous ne vendons pas vos données et ne les utilisons pas à des fins publicitaires.", "Solely to provide the service, manage your subscription and improve Biltia. We do not sell your data and do not use it for advertising.")}
            </p>
          ),
        },
        {
          id: "partage",
          title: pick(locale, "Avec qui nous partageons vos données", "Who we share your data with"),
          body: (
            <>
              <p>
                {pick(
                  locale,
                  "Nous ne vendons vos données à personne. Nous ne les partageons, ne les transférons et ne les divulguons qu'aux prestataires ci-dessous, qui les traitent pour notre compte, sur nos instructions, et uniquement pour faire fonctionner le service :",
                  "We sell your data to no one. We share, transfer or disclose it only to the providers below, which process it on our behalf, on our instructions, and only to operate the service:",
                )}
              </p>
              <ul>
                <li>
                  <strong>Supabase</strong>
                  {pick(locale, " : hébergement de la base de données et authentification (infrastructure dans l'Union européenne). Reçoit vos données de compte et de travail, ainsi que les jetons Google chiffrés.", ": database hosting and authentication (infrastructure in the European Union). Receives your account and work data, plus your encrypted Google tokens.")}
                </li>
                <li>
                  <strong>Anthropic</strong>
                  {pick(
                    locale,
                    " : génération par intelligence artificielle. Reçoit ce que vous soumettez pour créer un outil, un document ou une réponse. Si votre demande porte sur votre agenda (par exemple « qu'est-ce que j'ai demain ? »), les événements Google concernés lui sont transmis, uniquement le temps de produire ce résultat. En vertu de nos conditions commerciales, Anthropic n'utilise pas ces données pour entraîner ses modèles.",
                    ": generation by artificial intelligence. Receives what you submit to create a tool, a document or an answer. If your request concerns your calendar (for example \"what's on tomorrow?\"), the relevant Google events are sent to it, only for as long as it takes to produce that result. Under our commercial terms, Anthropic does not use this data to train its models.",
                  )}
                </li>
                <li>
                  <strong>Stripe</strong>
                  {pick(locale, " : paiement des abonnements. Reçoit votre email et vos informations de facturation, jamais vos données de travail ni vos données Google.", ": subscription payments. Receives your email and billing details, never your work data nor your Google data.")}
                </li>
                <li>
                  <strong>PostHog</strong>
                  {pick(locale, " : mesure d'audience. Reçoit des statistiques d'usage (pages vues, actions), jamais le contenu de vos documents ni vos données Google.", ": analytics. Receives usage statistics (page views, actions), never the content of your documents nor your Google data.")}
                </li>
                <li>
                  <strong>Vercel</strong>
                  {pick(locale, " : hébergement de l'application et journaux techniques.", ": application hosting and technical logs.")}
                </li>
              </ul>
              <p>
                {pick(
                  locale,
                  "En dehors de cette liste, nous ne divulguons vos données qu'à votre demande explicite (par exemple lorsque vous partagez un document avec votre client), ou lorsque la loi nous y contraint (réquisition judiciaire). Nous ne transférons jamais vos données à des annonceurs, à des courtiers en données ou à des tiers à des fins de publicité, de profilage ou de revente.",
                  "Outside this list, we disclose your data only at your explicit request (for example when you share a document with your client), or where the law compels us to (judicial order). We never transfer your data to advertisers, data brokers or third parties for advertising, profiling or resale.",
                )}
              </p>
            </>
          ),
        },
        {
          id: "protection",
          title: pick(locale, "Comment nous protégeons vos données", "How we protect your data"),
          body: (
            <>
              <p>
                {pick(
                  locale,
                  "Les données sensibles, en particulier vos jetons d'accès Google et le contenu de votre espace de travail, bénéficient des protections suivantes :",
                  "Sensitive data, in particular your Google access tokens and the content of your workspace, is protected as follows:",
                )}
              </p>
              <ul>
                <li>
                  <strong>{pick(locale, "Chiffrement en transit", "Encryption in transit")}</strong>
                  {pick(locale, " : tous les échanges passent par HTTPS (TLS 1.2 ou supérieur). Aucune donnée ne circule en clair.", ": all traffic goes over HTTPS (TLS 1.2 or above). No data travels in the clear.")}
                </li>
                <li>
                  <strong>{pick(locale, "Chiffrement au repos", "Encryption at rest")}</strong>
                  {pick(locale, " : la base de données et les sauvegardes sont chiffrées au repos (AES-256) chez notre hébergeur Supabase.", ": the database and its backups are encrypted at rest (AES-256) at our host Supabase.")}
                </li>
                <li>
                  <strong>{pick(locale, "Jetons Google isolés", "Google tokens isolated")}</strong>
                  {pick(
                    locale,
                    " : vos jetons d'accès et de rafraîchissement Google sont stockés dans une table protégée par une sécurité au niveau des lignes (RLS) sans aucune règle d'accès. Concrètement, aucun utilisateur connecté, même en attaquant directement la base, ne peut les lire : seul notre serveur y accède. Ils ne sont jamais envoyés au navigateur, jamais journalisés, et jamais transmis à un tiers.",
                    ": your Google access and refresh tokens are stored in a table protected by row level security (RLS) with no access policy at all. In practice, no signed-in user, even attacking the database directly, can read them: only our server can. They are never sent to the browser, never logged, and never passed to a third party.",
                  )}
                </li>
                <li>
                  <strong>{pick(locale, "Cloisonnement des espaces", "Tenant isolation")}</strong>
                  {pick(locale, " : chaque espace de travail est isolé des autres au niveau de la base, et les droits de chaque membre sont contrôlés par des rôles (RBAC).", ": each workspace is isolated from the others at database level, and each member's rights are enforced by roles (RBAC).")}
                </li>
                <li>
                  <strong>{pick(locale, "Accès minimal", "Least privilege")}</strong>
                  {pick(locale, " : l'accès aux systèmes de production est restreint, authentifié et journalisé. Nos collaborateurs ne consultent pas vos données.", ": access to production systems is restricted, authenticated and logged. Our staff does not browse your data.")}
                </li>
                <li>
                  <strong>{pick(locale, "Portée minimale", "Minimum scopes")}</strong>
                  {pick(locale, " : nous ne demandons que les autorisations Google strictement nécessaires aux fonctionnalités que vous utilisez, et rien de plus.", ": we request only the Google permissions strictly required by the features you use, and nothing more.")}
                </li>
                <li>
                  <strong>{pick(locale, "Suppression", "Deletion")}</strong>
                  {pick(locale, " : la déconnexion d'un service supprime ses jetons immédiatement. La suppression du compte efface l'ensemble de vos données.", ": disconnecting a service deletes its tokens immediately. Deleting your account erases all of your data.")}
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "duree",
          title: pick(locale, "Combien de temps", "How long"),
          body: (
            <p>
              {pick(locale, "Vos données sont conservées tant que votre compte est actif. Vous pouvez les exporter ou les supprimer à tout moment. À la suppression du compte, elles sont effacées. Les données Google ne sont pas conservées au-delà de ce qui est nécessaire à la fonctionnalité que vous utilisez : les événements d'agenda lus pour répondre à une question ne sont pas stockés.", "Your data is kept as long as your account is active. You can export or delete it at any time. When the account is deleted, it is erased. Google data is not retained beyond what the feature you use requires: calendar events read to answer a question are not stored.")}
            </p>
          ),
        },
        {
          id: "droits",
          title: pick(locale, "Vos droits", "Your rights"),
          body: (
            <p>
              {pick(locale, "Vous pouvez accéder à vos données, les rectifier, les exporter ou les supprimer. La plupart de ces actions sont disponibles directement dans vos paramètres (export et suppression du compte). Pour toute demande : ", "You can access, correct, export or delete your data. Most of these actions are available directly in your settings (export and account deletion). For any request: ")}
              <a href="mailto:contact@biltia.com">contact@biltia.com</a>.
            </p>
          ),
        },
        {
          id: "cookies",
          title: "Cookies",
          body: (
            <p>
              {pick(locale, "Biltia utilise des cookies nécessaires à votre session, ainsi que la mesure d'audience PostHog pour améliorer le produit.", "Biltia uses cookies required for your session, plus PostHog analytics to improve the product.")}
            </p>
          ),
        },
      ]}
    />
  );
}
