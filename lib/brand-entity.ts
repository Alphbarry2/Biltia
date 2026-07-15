// SOURCE UNIQUE de l'identité d'ENTREPRISE de Biltia.
// À NE PAS confondre avec lib/app-brand.ts, qui décrit la marque de l'ARTISAN
// sur ses propres documents. Ici, c'est Biltia qui se décrit lui-même.
//
// But : donner à Google (Knowledge Graph, AI Overviews) et aux LLM une entité
// « Biltia » nette et sans ambiguïté — pour ne plus être confondu avec le
// hameau belge « Bultia ». Consommé par le JSON-LD (app/page.tsx) et, à terme,
// par tout autre endroit qui décrit la marque. Un fait de marque écrit à deux
// endroits finit toujours par diverger : on le centralise ici.

import { SITE_URL } from "@/lib/blog";

// Page entreprise LinkedIn officielle. URL PUBLIQUE et propre : sans le
// paramètre `?viewAsMember=true`, qui ne sert qu'à SE voir soi-même en aperçu.
const LINKEDIN_URL = "https://www.linkedin.com/company/biltia/";

export const BRAND = {
  name: "Biltia",

  // Variantes réellement tapées ou écrites par les utilisateurs et la presse.
  // Aide Google à rattacher « Biltia app », « Biltia BTP », « biltia.com » à la
  // MÊME entité, au lieu de partir sur une autre interprétation.
  alternateName: ["Biltia BTP", "Biltia app", "biltia.com"],

  // Raison sociale légale. À remplacer par la dénomination exacte du KBIS /
  // registre d'entreprise quand elle est arrêtée (ex. « Biltia SAS »).
  legalName: "Biltia",

  slogan: "L'OS conversationnel du BTP",
  email: "contact@biltia.com",
  linkedin: LINKEDIN_URL,
  logo: `${SITE_URL}/icon.png`,

  description:
    "Biltia est l'OS conversationnel du BTP : un artisan ou une entreprise du bâtiment décrit son problème en langage naturel, à l'écrit ou à la voix, et Biltia livre la solution — un document prêt à signer, une application métier sur mesure, une réponse sourcée sur ses données, ou une automatisation. L'utilisateur ne choisit jamais l'outil, il décrit le problème.",

  // Ancrage géographique et linguistique : renforce « logiciel FR/BE » face à un
  // lieu-dit belge homonyme.
  areaServed: ["FR", "BE"],
  inLanguage: ["fr-FR", "fr-BE"],

  // ─────────────────────────────────────────────────────────────────────────
  // PROFILS OFFICIELS — le signal n°1 de désambiguïsation pour Google et les LLM.
  // C'est ce qui dit « Biltia = cette entreprise-là, précisément ».
  //
  // ⚠️ N'AJOUTER QUE des URLs qui RÉSOLVENT vraiment : un `sameAs` vers un lien
  // mort DÉGRADE le signal au lieu de l'améliorer.
  //   ✅ LinkedIn (fait)
  //   ⬜ À créer, puis coller ici :
  //     • Wikidata  (le plus puissant : Google KG et les LLM s'en nourrissent)
  //     • X / Twitter
  //     • Crunchbase
  //     • Product Hunt
  //     • Une fiche G2 / Capterra (annuaires de logiciels)
  // ─────────────────────────────────────────────────────────────────────────
  sameAs: [LINKEDIN_URL] as string[],
} as const;

// Graphe Schema.org de la marque (Organization + WebSite + SoftwareApplication),
// SANS aucune date : « entité permanente d'une entreprise/d'un logiciel », pas un
// article daté. SoftwareApplication est le nœud clé : il affirme noir sur blanc
// que Biltia est un LOGICIEL de gestion pour le BTP — l'interprétation qui doit
// l'emporter sur tout homonyme géographique.
export const BRAND_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: BRAND.name,
      alternateName: BRAND.alternateName,
      legalName: BRAND.legalName,
      url: SITE_URL,
      logo: BRAND.logo,
      image: BRAND.logo,
      email: BRAND.email,
      slogan: BRAND.slogan,
      description: BRAND.description,
      areaServed: BRAND.areaServed,
      knowsLanguage: BRAND.inLanguage,
      // Ajouté seulement si non vide : un sameAs vide n'apporte rien.
      ...(BRAND.sameAs.length ? { sameAs: BRAND.sameAs } : {}),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: BRAND.name,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "fr-FR",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: BRAND.name,
      alternateName: BRAND.alternateName,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Logiciel de gestion pour le BTP",
      operatingSystem: "Web, iOS, Android (PWA)",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
      description: BRAND.description,
      inLanguage: BRAND.inLanguage,
      // Point d'entrée gratuit (sans carte). Décrit l'essai, pas une gratuité
      // permanente : on ne raconte que ce qui est vrai.
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
        description:
          "Essai gratuit sans carte bancaire, puis offre Pro selon le volume de crédits.",
      },
    },
  ],
};
