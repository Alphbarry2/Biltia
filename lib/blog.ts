// ─────────────────────────────────────────────────────────────────────────────
// BLOG (SEO + AEO). Source unique de vérité pour :
//   - les pages /blog et /blog/[slug]
//   - les données structurées JSON-LD (BlogPosting, FAQPage, BreadcrumbList)
//   - le fichier /llms.txt (lisible par les LLM et agents)
//   - le sitemap
// Ligne éditoriale : conseils pratiques, productivité et pédagogie produit.
// Pas de contenu juridique ou réglementaire. Français, zéro em-dash.
// ─────────────────────────────────────────────────────────────────────────────

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://www.biltia.com";

export type FAQ = { q: string; a: string };

export type Section = {
  heading: string;
  body: string[];
  list?: string[];
};

export type BlogPost = {
  slug: string;
  title: string;
  /** Meta description (150 à 160 caractères idéalement). */
  description: string;
  category: string;
  /** ISO date de publication. */
  date: string;
  /** ISO date de mise à jour (optionnel). */
  updated?: string;
  readingMinutes: number;
  keywords: string[];
  /** Accroche de carte, plus courte que la description. */
  excerpt: string;
  intro: string;
  sections: Section[];
  /** Points clés, parfaits pour l'extraction par un LLM. */
  takeaways: string[];
  faq: FAQ[];
  /** Slug produit associé (voir lib/products.ts). */
  relatedProduct: string;
  /** Suggestion de demande pré-remplie pour le CTA. */
  cta: string;
};

export const BLOG_POSTS: BlogPost[] = [
  // 1 ───────────────────────────────────────────────────────────────────────
  {
    slug: "suivi-de-chantier-sans-excel",
    title: "Suivi de chantier : pourquoi arrêter Excel en 2026",
    description:
      "Excel montre vite ses limites pour suivre plusieurs chantiers. Voici les signaux d'alerte et comment passer à un outil qui parle votre langue.",
    category: "Outils",
    date: "2026-01-16",
    updated: "2026-06-20",
    readingMinutes: 8,
    keywords: [
      "suivi de chantier",
      "logiciel suivi chantier",
      "tableau de bord chantier",
      "gestion chantier artisan",
      "alternative Excel BTP",
    ],
    excerpt:
      "Le tableur a fait le job au début. Mais à trois chantiers, il devient le problème plutôt que la solution.",
    intro:
      "Presque tous les artisans commencent leur suivi de chantier sur un tableur. C'est gratuit, souple et familier. Mais dès que le nombre de chantiers augmente, Excel devient une source d'erreurs et de temps perdu. Voici comment repérer le moment de changer, et vers quoi aller.",
    sections: [
      {
        heading: "Pourquoi tout le monde commence sur Excel",
        body: [
          "Le tableur ne demande aucun apprentissage : on ouvre une feuille, on tape des colonnes, et on a un suivi en cinq minutes. Pour un premier chantier, c'est largement suffisant.",
          "Le problème n'est pas Excel en lui-même, c'est ce qu'on lui demande de faire quand l'activité grandit. Un outil pensé pour des calculs devient vite un mauvais outil de pilotage d'entreprise.",
        ],
      },
      {
        heading: "Les signaux qui montrent qu'Excel ne suffit plus",
        body: [
          "Un tableur reste un fichier statique : il ne vous alerte de rien et ne se met pas à jour tout seul. Certains symptômes reviennent chez tous les artisans qui ont dépassé le stade du tableur.",
        ],
        list: [
          "Vous ne savez plus quelle version du fichier est la bonne",
          "Le reste à facturer est faux dès qu'un poste change",
          "Personne sur le terrain ne met le fichier à jour",
          "Retrouver l'historique d'un chantier prend dix minutes",
          "Vous découvrez un retard ou un dépassement trop tard",
        ],
      },
      {
        heading: "Le coût caché du tableur",
        body: [
          "Excel a l'air gratuit, mais il coûte cher en temps et en argent. Chaque ressaisie, chaque erreur de formule et chaque information cherchée est une minute qui ne va pas sur le chantier.",
          "Le vrai coût, ce sont aussi les oublis : une relance qui saute, un poste facturé en moins, un dépassement repéré trop tard. Additionnés sur une année, ces petits ratés pèsent lourd sur la marge.",
        ],
      },
      {
        heading: "Ce qu'un bon suivi doit vraiment apporter",
        body: [
          "Le but n'est pas d'ajouter de la complexité, mais d'avoir la bonne information au bon moment, y compris depuis le chantier.",
        ],
        list: [
          "L'avancement et le reste à facturer par chantier, toujours à jour",
          "Des alertes sur les retards et les dépassements de budget",
          "Un accès simple depuis un téléphone, sur le terrain",
          "Un historique consultable sans fouiller dans des dossiers",
          "Un lien clair entre un chantier, son client et ses documents",
        ],
      },
      {
        heading: "Le frein habituel : la peur de l'usine à gaz",
        body: [
          "Beaucoup d'artisans ont testé un logiciel de gestion lourd et sont revenus à Excel, faute de temps pour le paramétrer. C'est un vrai risque : un outil qui demande une formation d'une semaine finit inutilisé.",
          "La solution n'est pas un logiciel de plus avec cent menus. C'est un outil qui s'adapte à votre façon de travailler, et non l'inverse.",
        ],
      },
      {
        heading: "Un outil qui se génère à la voix",
        body: [
          "Avec Biltia, vous ne configurez rien : vous décrivez le suivi voulu, par exemple un suivi de chantiers avec le client, l'avancement en pourcentage et le reste à facturer, et l'application est générée pour vous.",
          "Vous la modifiez ensuite à la voix : ajouter une colonne, une alerte, un statut. Pas de menus, pas de paramétrage interminable. Et comme le suivi vit dans le même espace que vos clients et vos documents, tout reste relié.",
        ],
      },
      {
        heading: "Par où commencer sans tout casser",
        body: [
          "Nul besoin de tout basculer d'un coup. Commencez par votre chantier le plus actif, celui qui vous fait perdre le plus de temps en suivi, et générez son tableau de bord.",
          "Une fois le réflexe pris, vous ajoutez les autres chantiers en quelques phrases. Le tableur peut rester en secours au début, mais vous verrez qu'il devient vite inutile.",
        ],
      },
    ],
    takeaways: [
      "Excel convient à un chantier isolé, mais atteint ses limites dès que plusieurs tournent en parallèle.",
      "Les vrais besoins : avancement, reste à facturer, alertes et accès mobile.",
      "Un outil trop lourd finit abandonné : la simplicité prime sur la richesse fonctionnelle.",
      "Un suivi généré à partir d'une simple description évite tout paramétrage.",
      "Commencez par votre chantier le plus chronophage pour prendre le réflexe.",
    ],
    faq: [
      {
        q: "Excel est-il vraiment un problème pour un artisan ?",
        a: "Excel convient à un seul chantier simple. Au-delà, l'absence d'alertes, les erreurs de saisie et les versions multiples font perdre du temps et de l'argent.",
      },
      {
        q: "Faut-il une formation pour un logiciel de suivi ?",
        a: "Cela dépend de l'outil. Les solutions lourdes demandent du paramétrage. Un outil qui se génère à partir d'une description en français réduit fortement ce frein.",
      },
      {
        q: "Peut-on suivre un chantier depuis le terrain ?",
        a: "Oui, à condition que l'outil soit accessible sur téléphone. C'est justement là que le tableur pêche, car personne ne le met à jour sur le chantier.",
      },
    ],
    relatedProduct: "applications",
    cta: "Je veux un suivi de mes chantiers avec le client, l'avancement en pourcentage et le reste à facturer.",
  },

  // 2 ───────────────────────────────────────────────────────────────────────
  {
    slug: "comparatif-logiciels-btp",
    title: "Comparatif des logiciels BTP en 2026 : lequel choisir pour votre entreprise",
    description:
      "Tableur, logiciel de devis, ERP de gestion, no-code ou assistant conversationnel : le comparatif des outils BTP pour bien choisir en 2026.",
    category: "Comparatif",
    date: "2026-06-30",
    readingMinutes: 10,
    keywords: [
      "comparatif logiciel BTP",
      "logiciel gestion bâtiment",
      "meilleur logiciel artisan",
      "ERP BTP",
      "alternative logiciel devis",
    ],
    excerpt:
      "Cinq familles d'outils, cinq philosophies. Voici comment elles se comparent, et où se situe Biltia.",
    intro:
      "Choisir un outil pour gérer son activité de BTP n'a jamais été aussi difficile, tant les solutions sont nombreuses. Pour y voir clair, le plus simple est de raisonner par familles d'outils, chacune avec sa logique, ses forces et ses limites. Voici un comparatif honnête, et où se positionne Biltia.",
    sections: [
      {
        heading: "1. Le tableur (Excel, Google Sheets)",
        body: [
          "C'est le point de départ de presque tous les artisans. Gratuit ou presque, souple, sans apprentissage. On y met tout : suivi, devis, planning, heures.",
          "La limite arrive vite : un tableur est statique. Il ne relie rien, n'alerte de rien et se met à jour à la main. Dès que l'activité grossit, il devient une source d'erreurs et de versions multiples.",
        ],
        list: [
          "Pour : gratuit, souple, immédiat",
          "Contre : statique, aucune alerte, erreurs de saisie, ne monte pas en charge",
        ],
      },
      {
        heading: "2. Les logiciels de devis et facturation",
        body: [
          "Des solutions comme Obat, Tolteck, Mediabat ou les modules bâtiment d'EBP sont pensées pour un usage précis : sortir des devis et des factures propres, avec une bibliothèque de prix.",
          "Elles font très bien ce pour quoi elles sont conçues. Mais leur périmètre reste centré sur la facturation. Le suivi de chantier, les questions sur vos données ou les tâches sur mesure sortent souvent de leur cadre, et il faut jongler avec d'autres outils.",
        ],
        list: [
          "Pour : devis et factures soignés, catalogues de prix",
          "Contre : périmètre limité à la facturation, abonnement, tout n'est pas couvert",
        ],
      },
      {
        heading: "3. Les ERP et logiciels de gestion complets",
        body: [
          "Des logiciels comme Batigest, Codial ou les suites de gestion pour le bâtiment visent l'exhaustivité : devis, achats, stock, comptabilité, paie, tout au même endroit.",
          "Cette richesse a un prix. Ces outils sont réputés puissants mais lourds à mettre en place, longs à paramétrer et pensés pour un poste de bureau plus que pour le chantier. Pour un artisan seul ou une petite équipe, c'est souvent surdimensionné.",
        ],
        list: [
          "Pour : couverture très large, adapté aux structures avec un bureau",
          "Contre : coûteux, long à paramétrer, courbe d'apprentissage, peu mobile",
        ],
      },
      {
        heading: "4. Les outils no-code génériques",
        body: [
          "Notion, Airtable et consorts permettent de bâtir ses propres outils sans développeur. C'est flexible et moderne.",
          "Le revers, c'est qu'il faut tout construire soi-même, et que rien n'est pensé pour le BTP. On passe du temps à concevoir sa base au lieu de travailler, et le résultat reste un outil générique.",
        ],
        list: [
          "Pour : flexible, personnalisable",
          "Contre : tout est à construire, non spécialisé BTP, chronophage au départ",
        ],
      },
      {
        heading: "5. L'assistant conversationnel : Biltia",
        body: [
          "Biltia part d'une idée différente : au lieu de choisir un logiciel puis d'apprendre à s'en servir, vous décrivez votre problème en français, à l'écrit ou à la voix, et l'outil livre la solution.",
          "Selon la demande, Biltia bascule seul sur le bon format : un document prêt à signer, une application métier générée sur mesure, une réponse sourcée sur vos données ou une automatisation. Vous ne choisissez jamais l'outil, vous décrivez le besoin. Et tout s'appuie sur la mémoire de votre entreprise, qui s'enrichit à chaque demande.",
        ],
        list: [
          "Pour : aucun paramétrage, une seule barre, mobile, dictée vocale, s'appuie sur vos données",
          "Contre : approche récente, à adopter comme un nouveau réflexe",
        ],
      },
      {
        heading: "Le tableau qui résume tout",
        body: [
          "Si l'on compare sur les critères qui comptent vraiment pour un artisan, les différences sautent aux yeux.",
        ],
        list: [
          "Temps de mise en route : tableur immédiat, ERP long, Biltia immédiat",
          "Périmètre : tableur large mais bricolé, devis limité, ERP très large, Biltia large et guidé",
          "Sur le chantier : tableur et ERP peu adaptés, Biltia pensé mobile et voix",
          "Paramétrage : lourd pour un ERP, nul pour Biltia",
          "Données reliées : faible pour le tableur, forte pour Biltia via le workspace",
        ],
      },
      {
        heading: "Alors, lequel choisir ?",
        body: [
          "Il n'y a pas de réponse unique. Si vous ne faites que des devis, un logiciel de facturation peut suffire. Si vous avez un bureau structuré et beaucoup de flux, un ERP se défend.",
          "Mais si vous êtes artisan ou petite équipe, que vous voulez gagner du temps sans passer par une formation, et travailler autant depuis le chantier que depuis le bureau, l'approche conversationnelle de Biltia a été pensée exactement pour vous. Le plus simple reste de l'essayer sur un vrai besoin.",
        ],
      },
    ],
    takeaways: [
      "Cinq familles d'outils : tableur, logiciel de devis, ERP, no-code générique, assistant conversationnel.",
      "Le tableur est gratuit mais statique ; l'ERP est complet mais lourd et peu mobile.",
      "Les logiciels de devis excellent sur la facturation mais couvrent un périmètre étroit.",
      "Biltia supprime le paramétrage et couvre document, application, réponse et automatisation depuis une seule barre.",
      "Le bon choix dépend de votre taille et de votre besoin : essayez sur un cas réel avant de trancher.",
    ],
    faq: [
      {
        q: "Quel est le meilleur logiciel BTP pour un artisan seul ?",
        a: "Pour un artisan seul, l'important est la simplicité et la rapidité de mise en route. Un outil sans paramétrage, accessible depuis le chantier, est souvent plus rentable qu'un ERP complet mais lourd.",
      },
      {
        q: "Biltia remplace-t-il un logiciel de devis ?",
        a: "Biltia génère des documents comme des devis, mais va au-delà : il crée aussi des applications de suivi, répond à vos questions sur vos données et automatise des tâches, depuis une seule interface.",
      },
      {
        q: "Faut-il abandonner Excel pour passer à un outil dédié ?",
        a: "Pas forcément d'un coup. Beaucoup commencent par déléguer leur chantier le plus chronophage à un outil dédié, puis étendent quand le gain de temps devient évident.",
      },
    ],
    relatedProduct: "workspace",
    cta: "Montre-moi ce que Biltia peut faire sur mon activité : un suivi de chantiers et un devis, tout de suite.",
  },

  // 3 ───────────────────────────────────────────────────────────────────────
  {
    slug: "comment-fonctionne-biltia",
    title: "Comment fonctionne Biltia : une seule barre, tous vos outils",
    description:
      "Biltia part de votre problème, pas d'un menu. Découvrez comment il choisit entre document, application, réponse et automatisation.",
    category: "Guide",
    date: "2026-02-10",
    readingMinutes: 8,
    keywords: [
      "comment fonctionne Biltia",
      "assistant BTP",
      "logiciel conversationnel bâtiment",
      "outil artisan IA",
      "Biltia guide",
    ],
    excerpt:
      "Pas de menus, pas de modules à apprendre. Vous décrivez, Biltia livre. Voici ce qui se passe derrière.",
    intro:
      "La plupart des logiciels vous demandent d'abord de choisir un module, puis d'apprendre à vous en servir. Biltia fait l'inverse : vous décrivez votre problème comme à un collègue, et l'outil s'occupe du reste. Voici, concrètement, comment ça marche.",
    sections: [
      {
        heading: "Le principe : vous décrivez, Biltia résout",
        body: [
          "Tout part d'une seule barre. Vous y écrivez, ou vous dictez, ce dont vous avez besoin : un document, un suivi, une réponse, une vérification.",
          "Vous n'avez pas à savoir dans quelle rubrique cela se range. C'est justement le travail de Biltia de comprendre la demande et de choisir la bonne façon d'y répondre.",
        ],
      },
      {
        heading: "Les quatre formats de réponse",
        body: [
          "Derrière la barre, Biltia sait produire quatre types de solutions, selon ce que vous demandez.",
        ],
        list: [
          "Un document : devis, courrier, compte rendu, prêt à imprimer ou envoyer",
          "Une application : un suivi de chantiers, un pointage, un inventaire, généré sur mesure",
          "Une réponse : une question sur vos données obtient une réponse sourcée",
          "Une automatisation : une vérification ou un rapprochement de fichiers en un passage",
        ],
      },
      {
        heading: "Comment Biltia choisit le bon format",
        body: [
          "Biltia analyse votre phrase et le contexte de votre entreprise pour décider. Une demande qui commence par sortir ou rédige mène à un document. Une demande de suivi ou de tableau mène à une application. Une question mène à une réponse, une vérification à une automatisation.",
          "Vous voyez à l'écran le format choisi, et vous pouvez toujours réorienter si besoin. L'idée est de vous éviter la charge mentale du choix, pas de vous enlever le contrôle.",
        ],
      },
      {
        heading: "La mémoire de votre entreprise",
        body: [
          "Biltia ne repart pas de zéro à chaque fois. Vos clients, vos chantiers, vos documents et vos équipes vivent dans un espace unique, le workspace.",
          "Résultat : quand vous demandez un devis pour un client, Biltia connaît déjà ses coordonnées et ses chantiers. Plus vous utilisez l'outil, plus il devient pertinent, car il en sait davantage sur votre activité.",
        ],
      },
      {
        heading: "À la voix, sur le chantier",
        body: [
          "Biltia est pensé pour être utilisé les mains sales, depuis un téléphone. Vous appuyez sur le micro, vous dictez, et la demande part.",
          "C'est ce qui change tout par rapport à un logiciel de bureau : vous n'attendez pas d'être rentré le soir pour agir, vous le faites entre deux tâches sur le chantier.",
        ],
      },
      {
        heading: "Ce que Biltia n'est pas",
        body: [
          "Biltia n'est pas un ERP à cent menus qu'il faut paramétrer pendant des semaines. Ce n'est pas non plus un simple générateur de texte déconnecté de votre activité.",
          "C'est un point d'entrée unique qui s'appuie sur vos vraies données et qui choisit le bon outil à votre place. La promesse est simple : moins d'administratif, plus de chantier.",
        ],
      },
      {
        heading: "Un exemple du quotidien",
        body: [
          "Imaginez : sur le chantier, un client valide une modification. Vous dictez la demande à Biltia, qui sort le document chiffré à faire signer. De retour au bureau, vous demandez quels chantiers sont en retard, et vous obtenez la réponse en une phrase.",
          "Le même outil a produit un document, puis une analyse, sans que vous changiez d'application. C'est ça, l'idée d'une seule barre pour tous vos outils.",
        ],
      },
    ],
    takeaways: [
      "Biltia part de votre problème décrit en langage naturel, pas d'un menu à choisir.",
      "Quatre formats de réponse : document, application, réponse et automatisation.",
      "L'outil choisit le bon format tout en vous laissant le contrôle.",
      "Tout s'appuie sur la mémoire de l'entreprise, qui s'enrichit à chaque demande.",
      "Pensé pour la voix et le chantier, pas seulement pour le bureau.",
    ],
    faq: [
      {
        q: "Dois-je choisir un module avant de commencer ?",
        a: "Non. Vous décrivez simplement votre besoin dans une seule barre, et Biltia choisit lui-même le format de réponse adapté.",
      },
      {
        q: "Biltia se souvient-il de mes clients et chantiers ?",
        a: "Oui. Vos données vivent dans un workspace unique. Biltia les réutilise pour pré-remplir vos documents et répondre à vos questions.",
      },
      {
        q: "Puis-je utiliser Biltia depuis le chantier ?",
        a: "Oui, c'est même l'usage prévu. Biltia fonctionne sur téléphone et accepte la dictée vocale, pour agir sans revenir au bureau.",
      },
    ],
    relatedProduct: "copilote",
    cta: "Explique-moi ce que tu peux faire, puis prépare un devis pour mon prochain client.",
  },

  // 4 ───────────────────────────────────────────────────────────────────────
  {
    slug: "ia-artisan-btp-taches-administratives",
    title: "IA pour artisans du BTP : 7 tâches à déléguer pour gagner du temps en 2026",
    description:
      "L'IA n'est plus réservée aux grands groupes. Voici 7 tâches concrètes que les artisans du BTP peuvent déléguer pour gagner du temps en 2026.",
    category: "Conseils",
    date: "2026-03-05",
    readingMinutes: 9,
    keywords: [
      "IA BTP",
      "IA artisan",
      "gagner du temps BTP",
      "automatisation bâtiment",
      "intelligence artificielle chantier",
    ],
    excerpt:
      "Deux heures d'administratif par jour, c'est deux heures de moins sur le chantier. L'IA peut en récupérer une bonne partie.",
    intro:
      "Pendant longtemps, l'IA est restée un sujet de grands groupes. Ce n'est plus le cas. En 2026, un artisan seul peut déléguer une grande partie de sa paperasse à des outils qui comprennent le langage naturel. Voici sept tâches concrètes, du devis au suivi, que vous pouvez déléguer dès maintenant.",
    sections: [
      {
        heading: "1. Rédiger devis, comptes rendus et courriers",
        body: [
          "La rédaction de documents est le premier poste de temps administratif. Décrire le besoin en français et obtenir un document chiffré et propre fait gagner des heures chaque semaine.",
          "Au lieu de repartir d'un modèle vide à chaque fois, vous dictez la trame, et l'outil s'occupe de la mise en forme et des calculs.",
        ],
      },
      {
        heading: "2. Vérifier des lots de fichiers d'un coup",
        body: [
          "Comparer trente bons de livraison à leurs devis à la main est fastidieux et source d'erreurs. Une automatisation repère les écarts de prix, les références inconnues et les doublons en un passage.",
          "Vous ne relisez plus que les quelques lignes signalées, au lieu de tout éplucher.",
        ],
      },
      {
        heading: "3. Répondre aux questions sur vos données",
        body: [
          "Quels chantiers sont en retard, combien vous doit un client, où en est un devis : au lieu de fouiller dans vos fichiers, vous posez la question et vous obtenez une réponse appuyée sur vos données.",
          "C'est un changement de posture : vous interrogez votre activité comme vous interrogeriez un assistant qui aurait tout suivi.",
        ],
      },
      {
        heading: "4. Suivre les chantiers et recevoir des alertes",
        body: [
          "Un suivi qui se met à jour et vous alerte sur les retards ou les dépassements de budget remplace avantageusement un tableur figé.",
          "L'IA vous prévient avant que le problème ne devienne coûteux, au lieu de le découvrir après coup.",
        ],
      },
      {
        heading: "Les trois tâches suivantes",
        body: [
          "Au-delà de ces quatre usages, trois autres tâches se prêtent particulièrement bien à la délégation dans une entreprise du bâtiment.",
        ],
        list: [
          "5. Relancer les devis et rappels restés sans réponse",
          "6. Extraire montants et échéances d'un lot de documents",
          "7. Générer les outils récurrents : suivi, pointage, inventaire",
        ],
      },
      {
        heading: "Combien de temps peut-on vraiment gagner",
        body: [
          "Les gains ne viennent pas d'une seule tâche spectaculaire, mais de dizaines de micro-actions récupérées chaque jour. Un devis plus rapide, une relance qui part toute seule, une réponse trouvée en dix secondes.",
          "Mises bout à bout, ces minutes représentent souvent une à deux heures par jour, soit un jour entier par semaine rendu au terrain.",
        ],
      },
      {
        heading: "Le bon réflexe : un seul point d'entrée",
        body: [
          "L'erreur serait d'empiler dix outils différents. L'intérêt d'un assistant unique est de tout centraliser : vous décrivez le problème, l'outil choisit la bonne réponse.",
          "C'est exactement le principe de Biltia : une seule barre, à laquelle vous parlez comme à un collègue, et qui s'appuie sur la mémoire de votre entreprise.",
        ],
      },
    ],
    takeaways: [
      "En 2026, l'IA est accessible à un artisan seul, sans compétence technique.",
      "Rédaction, vérification, réponses et suivi sont les gisements de temps les plus évidents.",
      "Le gain vient de dizaines de micro-actions récupérées, pas d'une seule tâche.",
      "Un assistant unique évite de jongler entre dix outils.",
      "L'IA la plus utile est celle qui s'appuie sur vos vraies données.",
    ],
    faq: [
      {
        q: "L'IA est-elle vraiment utile pour un petit artisan ?",
        a: "Oui. Ce sont justement les petites structures, sans service administratif, qui gagnent le plus de temps en déléguant devis, suivis et relances à un outil intelligent.",
      },
      {
        q: "Faut-il des compétences techniques pour utiliser l'IA ?",
        a: "Non, avec les outils récents. Décrire son besoin en français, à l'écrit ou à la voix, suffit. C'est l'outil qui traduit la demande en document ou en application.",
      },
      {
        q: "Combien de temps peut-on gagner avec l'IA dans le BTP ?",
        a: "Cela varie, mais en additionnant les micro-tâches déléguées, beaucoup d'artisans récupèrent une à deux heures par jour, soit près d'une journée par semaine.",
      },
    ],
    relatedProduct: "copilote",
    cta: "Fais le point sur mon activité : chantiers en retard, devis en attente et tâches à traiter aujourd'hui.",
  },

  // 5 ───────────────────────────────────────────────────────────────────────
  {
    slug: "gagner-temps-administratif-btp",
    title: "10 façons de gagner 1 heure par jour sur l'administratif dans le BTP",
    description:
      "L'administratif grignote vos soirées ? Voici 10 astuces concrètes pour gagner une heure par jour et la rendre au chantier.",
    category: "Conseils",
    date: "2026-03-24",
    readingMinutes: 8,
    keywords: [
      "gagner du temps administratif",
      "administratif BTP",
      "organisation artisan",
      "productivité bâtiment",
      "astuces gestion chantier",
    ],
    excerpt:
      "L'administratif se fait souvent le soir, en plus des journées. Voici comment récupérer cette heure perdue.",
    intro:
      "Pour beaucoup d'artisans, l'administratif se fait le soir, après une journée déjà pleine. C'est le meilleur moyen de s'épuiser et de repousser les tâches importantes. Voici dix astuces concrètes pour reprendre une heure par jour, sans révolutionner votre organisation.",
    sections: [
      {
        heading: "1. Traiter tout de suite, sur le chantier",
        body: [
          "La demande d'un client, une modification, un rappel : plus vous attendez, plus vous oubliez les détails. Traiter la tâche sur le moment, à la voix, évite la pile du soir.",
          "Une minute sur le chantier vaut souvent dix minutes le soir, quand il faut se remémorer le contexte.",
        ],
      },
      {
        heading: "2. Arrêter de repartir d'une page blanche",
        body: [
          "Refaire chaque devis ou compte rendu de zéro est une perte de temps. Réutilisez vos documents précédents comme base, ou laissez un outil les pré-remplir avec vos données.",
        ],
      },
      {
        heading: "3. Centraliser au lieu de disperser",
        body: [
          "Un devis dans un dossier, un contact dans le téléphone, une photo dans la galerie : l'information éparpillée fait perdre un temps fou. Regrouper clients, chantiers et documents au même endroit change la donne.",
        ],
      },
      {
        heading: "4. Dicter plutôt que taper",
        body: [
          "On parle trois fois plus vite qu'on ne tape, surtout sur un téléphone avec les doigts abîmés. La dictée vocale est l'un des plus gros gains de temps disponibles aujourd'hui.",
        ],
      },
      {
        heading: "5. Automatiser les tâches répétitives",
        body: [
          "Vérifier des prix, rapprocher des bons, relancer un devis : ces tâches se ressemblent d'une fois sur l'autre. Ce qui se répète peut se déléguer à un outil, une bonne fois pour toutes.",
        ],
      },
      {
        heading: "Cinq autres réflexes qui font la différence",
        body: [
          "Au-delà des cinq premiers, quelques habitudes simples finissent de dégager du temps chaque semaine.",
        ],
        list: [
          "6. Bloquer un créneau fixe court plutôt que grignoter partout",
          "7. Répondre en une phrase, pas en un roman",
          "8. Numériser un document dès qu'il arrive, pas plus tard",
          "9. Poser une question à ses données au lieu de fouiller",
          "10. Laisser les alertes venir à vous plutôt que tout surveiller",
        ],
      },
      {
        heading: "Le fil rouge : moins de friction",
        body: [
          "Toutes ces astuces ont un point commun : réduire la friction entre le besoin et l'action. Moins d'étapes, moins d'outils, moins de ressaisie.",
          "C'est exactement ce que vise Biltia : une seule barre où vous décrivez ce que vous voulez, et la solution arrive. Beaucoup de ces dix réflexes deviennent alors automatiques.",
        ],
      },
    ],
    takeaways: [
      "L'administratif du soir vient surtout de tâches repoussées : traitez-les sur le moment.",
      "Ne repartez jamais d'une page blanche : réutilisez et laissez pré-remplir.",
      "Centraliser clients, chantiers et documents supprime le temps de recherche.",
      "Dicter et automatiser sont les deux plus gros leviers de gain de temps.",
      "L'objectif est de réduire la friction entre le besoin et l'action.",
    ],
    faq: [
      {
        q: "Combien de temps peut-on réellement gagner sur l'administratif ?",
        a: "En cumulant les petites optimisations, récupérer une heure par jour est un objectif réaliste pour la plupart des artisans, sans changer de métier ni d'organisation en profondeur.",
      },
      {
        q: "Par quoi commencer pour gagner du temps rapidement ?",
        a: "Par la dictée et le traitement immédiat sur le chantier. Ce sont les deux réflexes qui rapportent le plus vite, car ils suppriment la pile de tâches du soir.",
      },
      {
        q: "Faut-il changer tous ses outils d'un coup ?",
        a: "Non. Le plus efficace est de réduire le nombre d'étapes et d'outils, en centralisant progressivement là où vous perdez le plus de temps.",
      },
    ],
    relatedProduct: "documents",
    cta: "Prépare le compte rendu de ma journée de chantier à partir de ces notes, prêt à envoyer au client.",
  },

  // 6 ───────────────────────────────────────────────────────────────────────
  {
    slug: "dicter-plutot-que-taper-btp",
    title: "Dicter au lieu de taper : le réflexe qui change la vie sur le chantier",
    description:
      "On parle trois fois plus vite qu'on ne tape. Voici pourquoi la dictée vocale est le meilleur gain de temps pour un artisan du BTP.",
    category: "Conseils",
    date: "2026-04-08",
    readingMinutes: 7,
    keywords: [
      "dictée vocale BTP",
      "reconnaissance vocale artisan",
      "gagner du temps chantier",
      "saisie vocale",
      "productivité terrain",
    ],
    excerpt:
      "Les mains prises, les doigts abîmés, pas le temps de taper. La voix règle le problème.",
    intro:
      "Sur un chantier, taper sur un téléphone est une punition : les mains sont prises, les doigts sont abîmés, et l'écran est plein de poussière. La dictée vocale change complètement le rapport à l'administratif. Voici pourquoi c'est le réflexe le plus rentable à adopter.",
    sections: [
      {
        heading: "On parle trois fois plus vite qu'on ne tape",
        body: [
          "En moyenne, on dicte autour de 150 mots par minute, contre 40 à la frappe sur un téléphone. Le calcul est vite fait : la voix divise par trois le temps passé à saisir une demande.",
          "Sur une journée remplie de petites saisies, ce facteur trois représente un temps considérable rendu au métier.",
        ],
      },
      {
        heading: "Capter l'information au bon moment",
        body: [
          "Le vrai gain n'est pas seulement la vitesse, c'est l'instant. Quand vous dictez sur le chantier, vous capturez le détail exact au moment où il est frais.",
          "Le soir, on oublie les mesures, le nom du client, la référence précise. En dictant sur le moment, l'information est juste et complète.",
        ],
      },
      {
        heading: "Moins de barrière, plus d'action",
        body: [
          "Beaucoup de tâches ne sont jamais faites parce que taper est trop pénible. La voix supprime cette barrière : si demander prend cinq secondes, on le fait.",
          "Résultat : les comptes rendus se font, les demandes partent, rien ne s'accumule pour le soir.",
        ],
      },
      {
        heading: "Dicter ne veut pas dire texte brut",
        body: [
          "L'intérêt d'un bon outil, c'est qu'il ne se contente pas de transcrire. Vous dictez une intention, et il en tire un document structuré, un suivi ou une réponse.",
          "Vous n'avez donc pas à parler comme un robot ni à tout formuler parfaitement. Vous dites les choses simplement, l'outil met en forme.",
        ],
      },
      {
        heading: "Les situations où la voix gagne à tous les coups",
        body: [
          "Certaines situations sont idéales pour la dictée, celles où vos mains ou votre attention sont déjà prises.",
        ],
        list: [
          "En haut d'un échafaudage ou les mains occupées",
          "En marchant entre deux postes de travail",
          "Juste après un échange avec un client, pour ne rien oublier",
          "En voiture, à l'arrêt, avant de repartir",
        ],
      },
      {
        heading: "La dictée au cœur de Biltia",
        body: [
          "Biltia a été conçu pour la voix. Vous appuyez sur le micro, vous décrivez votre besoin, et l'outil produit la solution : un document, un suivi, une réponse.",
          "C'est ce qui rend l'administratif compatible avec une journée de chantier : vous n'attendez plus le soir, vous agissez sur le moment, à la voix.",
        ],
      },
    ],
    takeaways: [
      "On dicte environ trois fois plus vite qu'on ne tape sur un téléphone.",
      "Dicter sur le chantier capte l'information juste, au moment où elle est fraîche.",
      "La voix supprime la barrière qui fait repousser les tâches au soir.",
      "Un bon outil transforme la dictée en document structuré, pas en texte brut.",
      "Biltia est pensé pour la dictée, afin d'agir sans revenir au bureau.",
    ],
    faq: [
      {
        q: "La dictée vocale est-elle fiable sur un chantier bruyant ?",
        a: "Les outils récents gèrent bien le bruit ambiant. Il suffit souvent de s'écarter un instant ou de rapprocher le téléphone pour obtenir une transcription fidèle.",
      },
      {
        q: "Faut-il parler d'une façon particulière pour dicter ?",
        a: "Non. Vous parlez simplement, comme à un collègue. Un bon outil comprend l'intention et met le résultat en forme, sans que vous ayez à tout formuler parfaitement.",
      },
      {
        q: "Dicter, est-ce seulement pour prendre des notes ?",
        a: "Non. Avec Biltia, la dictée déclenche une vraie solution : un document prêt à envoyer, un suivi généré ou une réponse sur vos données, pas juste une note.",
      },
    ],
    relatedProduct: "documents",
    cta: "Je te dicte le compte rendu de la journée sur le chantier Dumont, prépare-le pour le client.",
  },

  // 7 ───────────────────────────────────────────────────────────────────────
  {
    slug: "creer-outil-metier-sans-code",
    title: "Créer son outil métier sans coder : le guide pour les artisans",
    description:
      "Suivi, pointage, inventaire : découvrez comment créer votre propre outil métier sans développeur, simplement en le décrivant.",
    category: "Guide",
    date: "2026-04-28",
    readingMinutes: 8,
    keywords: [
      "outil métier sans code",
      "application sur mesure BTP",
      "no code artisan",
      "créer application chantier",
      "logiciel personnalisé bâtiment",
    ],
    excerpt:
      "Aucun outil du marché ne colle à votre façon de travailler ? Et si vous créiez le vôtre, sans coder.",
    intro:
      "Chaque entreprise du bâtiment a sa façon de travailler, mais les logiciels sont pensés pour tout le monde. Résultat : on plie ses habitudes à l'outil, ou on abandonne. Il existe désormais une autre voie : créer son propre outil métier, sans développeur, simplement en le décrivant. Voici comment.",
    sections: [
      {
        heading: "Le problème de l'outil qui ne colle jamais",
        body: [
          "Vous avez sûrement déjà testé un logiciel qui faisait presque ce que vous vouliez, mais pas tout à fait. Une colonne en trop, un champ manquant, une logique qui n'est pas la vôtre.",
          "À force de compromis, l'outil devient une contrainte. On finit par le contourner avec un tableur ou un carnet, et le logiciel payé dort dans un coin.",
        ],
      },
      {
        heading: "Le no-code, une première réponse imparfaite",
        body: [
          "Les outils no-code ont ouvert la voie : bâtir son application sans écrire de code. C'est un progrès, mais il faut encore tout concevoir soi-même, penser la structure, relier les données.",
          "Pour un artisan qui n'a pas le temps, cette phase de construction reste un frein. On veut un outil, pas un projet à mener.",
        ],
      },
      {
        heading: "La nouvelle approche : décrire au lieu de construire",
        body: [
          "L'étape suivante, c'est de générer l'outil à partir d'une simple description. Vous dites ce dont vous avez besoin en français, et l'application apparaît, prête à l'emploi.",
          "Par exemple : un tableau de pointage des heures par ouvrier et par chantier, avec les heures supplémentaires. Une phrase, et le suivi est là.",
        ],
      },
      {
        heading: "Modifier à la voix, sans repartir de zéro",
        body: [
          "Un besoin évolue toujours. L'intérêt d'un outil généré, c'est de le faire évoluer par la parole : ajouter une colonne, une alerte, un statut, une signature.",
          "Vous ne rouvrez pas un chantier de configuration, vous dites la modification, et elle est appliquée. L'outil suit votre activité, pas l'inverse.",
        ],
      },
      {
        heading: "Des exemples concrets à générer aujourd'hui",
        body: [
          "Beaucoup de besoins du quotidien se prêtent parfaitement à un outil généré sur mesure.",
        ],
        list: [
          "Un suivi de chantiers avec avancement et reste à facturer",
          "Un pointage des heures par ouvrier et par chantier",
          "Un inventaire du matériel avec état et prochain contrôle",
          "Un planning simple des interventions de la semaine",
          "Un suivi des demandes clients avec statut",
        ],
      },
      {
        heading: "Tout relié dans un seul espace",
        body: [
          "Un outil isolé a peu de valeur. La force vient du fait que vos applications partagent les mêmes clients, chantiers et équipes.",
          "Avec Biltia, chaque application générée puise dans la mémoire de votre entreprise. Un pointage connaît vos chantiers, un suivi connaît vos clients. Rien à ressaisir.",
        ],
      },
    ],
    takeaways: [
      "Les logiciels standards imposent leur logique ; on finit souvent par les contourner.",
      "Le no-code aide, mais demande encore de tout concevoir soi-même.",
      "La nouvelle approche génère l'outil à partir d'une simple description en français.",
      "On fait évoluer l'application à la voix, sans phase de configuration.",
      "Les applications générées partagent les mêmes données que le reste de votre activité.",
    ],
    faq: [
      {
        q: "Faut-il savoir coder pour créer son outil métier ?",
        a: "Non. Avec une approche par description, vous expliquez votre besoin en français et l'application est générée. Aucune compétence technique n'est requise.",
      },
      {
        q: "Peut-on modifier l'outil une fois créé ?",
        a: "Oui. Vous ajoutez une colonne, une alerte ou un statut simplement en le demandant, sans repasser par une phase de paramétrage.",
      },
      {
        q: "Ces applications sont-elles reliées à mes données ?",
        a: "Oui. Dans Biltia, chaque application puise dans la mémoire de l'entreprise, donc elle connaît déjà vos clients, chantiers et équipes.",
      },
    ],
    relatedProduct: "applications",
    cta: "Crée un tableau de pointage des heures par ouvrier et par chantier, avec les heures supplémentaires.",
  },

  // 8 ───────────────────────────────────────────────────────────────────────
  {
    slug: "workspace-memoire-entreprise-btp",
    title: "La mémoire d'entreprise : quand vos données travaillent pour vous",
    description:
      "Clients, chantiers, documents, équipes : découvrez pourquoi centraliser vos données dans une mémoire d'entreprise change tout au quotidien.",
    category: "Guide",
    date: "2026-05-14",
    readingMinutes: 8,
    keywords: [
      "mémoire d'entreprise",
      "centraliser données BTP",
      "workspace artisan",
      "données chantier",
      "gestion information bâtiment",
    ],
    excerpt:
      "Vos données sont éparpillées entre le téléphone, le camion et le bureau. Et si elles travaillaient ensemble ?",
    intro:
      "Dans beaucoup d'entreprises du bâtiment, l'information est partout et nulle part : un devis dans un mail, un contact dans le téléphone, une photo dans la galerie, un chiffre sur un carnet. Cette dispersion coûte du temps et des erreurs. La réponse, c'est une mémoire d'entreprise unique. Voici pourquoi elle change tout.",
    sections: [
      {
        heading: "Le vrai coût de l'information éparpillée",
        body: [
          "Chercher un numéro de client, retrouver le dernier devis, se rappeler d'un détail de chantier : ces petites recherches, répétées toute la journée, finissent par peser lourd.",
          "Pire, l'information dispersée mène aux erreurs : un mauvais prix repris, un contact périmé, une décision oubliée. Ce qui n'est pas centralisé finit par se perdre.",
        ],
      },
      {
        heading: "Qu'est-ce qu'une mémoire d'entreprise",
        body: [
          "C'est un espace unique où vivent, reliés entre eux, tous les éléments de votre activité : clients, chantiers, documents, équipes, applications et historique.",
          "Un client y est rattaché à ses chantiers, ses chantiers à leurs documents, leurs documents à leurs montants. Vous ne consultez plus des fichiers isolés, mais un ensemble cohérent.",
        ],
      },
      {
        heading: "Des documents qui se pré-remplissent",
        body: [
          "Quand vos données sont reliées, produire un document devient immédiat. Vous demandez un devis pour un client, et ses coordonnées, ses chantiers et ses tarifs sont déjà là.",
          "Fini la ressaisie des mêmes informations à chaque document. La mémoire fait le travail à votre place.",
        ],
      },
      {
        heading: "Des réponses au lieu de recherches",
        body: [
          "Avec une mémoire d'entreprise, vous n'ouvrez plus dix fichiers pour comprendre une situation. Vous posez la question et vous obtenez la réponse.",
          "Quels chantiers sont en retard, où en est un devis, quel client reste à relancer : l'information remonte, sourcée sur vos données, sans que vous ayez à la chercher.",
        ],
      },
      {
        heading: "Un outil qui devient plus pertinent avec le temps",
        body: [
          "C'est le point clé : plus vous utilisez cette mémoire, plus elle en sait sur votre activité, et plus l'outil devient utile.",
          "Chaque demande enrichit l'ensemble. Au bout de quelques semaines, l'outil connaît vos clients, vos habitudes et vos chantiers, et anticipe mieux vos besoins.",
        ],
      },
      {
        heading: "La sécurité, condition de la confiance",
        body: [
          "Centraliser ses données suppose de pouvoir compter sur leur protection. Une mémoire d'entreprise n'a de valeur que si elle est strictement isolée et sécurisée.",
          "Dans Biltia, les données de chaque entreprise sont cloisonnées et protégées. Votre mémoire est la vôtre, et elle ne se mélange jamais à celle d'une autre.",
        ],
      },
      {
        heading: "Le workspace Biltia en pratique",
        body: [
          "Le workspace est le cœur de Biltia. Tout ce que vous faites, chaque document, chaque suivi, chaque réponse, l'alimente et s'en nourrit.",
          "C'est ce qui distingue un simple générateur d'un véritable assistant : la mémoire. Sans elle, chaque demande repart de zéro ; avec elle, l'outil grandit avec votre entreprise.",
        ],
      },
    ],
    takeaways: [
      "L'information éparpillée coûte du temps et provoque des erreurs.",
      "Une mémoire d'entreprise relie clients, chantiers, documents et équipes.",
      "Vos documents se pré-remplissent et vos questions trouvent des réponses sourcées.",
      "Plus la mémoire est nourrie, plus l'outil devient pertinent.",
      "La centralisation n'a de valeur que si les données sont isolées et sécurisées.",
    ],
    faq: [
      {
        q: "Qu'est-ce qu'une mémoire d'entreprise dans Biltia ?",
        a: "C'est le workspace : un espace unique où clients, chantiers, documents, équipes et historique sont reliés entre eux et réutilisés par l'outil.",
      },
      {
        q: "Mes données sont-elles en sécurité si je les centralise ?",
        a: "Dans Biltia, les données de chaque entreprise sont strictement isolées et protégées. Votre mémoire ne se mélange jamais à celle d'un autre utilisateur.",
      },
      {
        q: "Pourquoi l'outil devient-il plus utile avec le temps ?",
        a: "Parce que chaque demande enrichit la mémoire. Plus l'outil connaît votre activité, mieux il pré-remplit vos documents et répond à vos questions.",
      },
    ],
    relatedProduct: "workspace",
    cta: "Montre-moi tout l'historique du chantier Villa Dumont : documents, montants et prochaines étapes.",
  },

  // 9 ───────────────────────────────────────────────────────────────────────
  {
    slug: "erreurs-gestion-artisan-btp",
    title: "7 erreurs de gestion qui coûtent cher aux artisans du BTP",
    description:
      "Devis lents, relances oubliées, suivi absent : voici les 7 erreurs de gestion les plus fréquentes chez les artisans, et comment les éviter.",
    category: "Conseils",
    date: "2026-05-29",
    readingMinutes: 8,
    keywords: [
      "erreurs gestion artisan",
      "gestion entreprise BTP",
      "rentabilité artisan",
      "conseils gestion bâtiment",
      "organisation chantier",
    ],
    excerpt:
      "Ce ne sont pas les gros chantiers qui coulent une entreprise, mais les petites fuites de gestion répétées.",
    intro:
      "La plupart des artisans sont excellents dans leur métier, mais la gestion reste le maillon faible. Or ce ne sont pas les grosses erreurs qui font mal, ce sont les petites, répétées tous les jours. Voici les sept plus fréquentes, et comment les corriger sans devenir gestionnaire à plein temps.",
    sections: [
      {
        heading: "1. Mettre trop de temps à envoyer un devis",
        body: [
          "Un devis qui arrive une semaine plus tard, c'est souvent un chantier perdu. Le client sérieux compare, et le premier à répondre part avec un avantage.",
          "La solution n'est pas de bâcler, mais de réduire le délai : réutiliser une base, pré-remplir, dicter. L'objectif est de répondre tant que le client est chaud.",
        ],
      },
      {
        heading: "2. Oublier de relancer",
        body: [
          "Un devis sans réponse n'est pas un refus, c'est souvent un oubli, des deux côtés. Ne pas relancer, c'est laisser filer un chantier déjà à moitié gagné.",
          "Un simple suivi des devis en attente, avec un rappel, transforme une partie de ces silences en contrats signés.",
        ],
      },
      {
        heading: "3. Ne pas suivre l'avancement des chantiers",
        body: [
          "Sans suivi, on découvre les retards et les dépassements trop tard, quand ils coûtent déjà de l'argent. Piloter à vue est le meilleur moyen de rogner sa marge sans le voir.",
          "Un tableau de bord clair, à jour, permet d'agir avant que le problème ne s'installe.",
        ],
      },
      {
        heading: "4. Confondre trésorerie et rentabilité",
        body: [
          "Avoir de l'argent sur le compte ne veut pas dire gagner de l'argent. Beaucoup d'artisans confondent le solde bancaire du moment avec la santé réelle de l'entreprise.",
          "Suivre ce qui reste à facturer et à encaisser, chantier par chantier, donne une image bien plus fiable que le seul relevé bancaire.",
        ],
      },
      {
        heading: "5. Tout garder dans la tête",
        body: [
          "La mémoire est un mauvais logiciel de gestion. Ce qui n'est pas noté est oublié : une promesse au client, un détail de chantier, une échéance.",
          "Capturer l'information au moment où elle apparaît, idéalement à la voix, évite ces oublis qui finissent par coûter cher.",
        ],
      },
      {
        heading: "Les deux dernières erreurs à éviter",
        body: [
          "Deux erreurs plus discrètes complètent le tableau, et elles touchent surtout les entreprises qui grandissent.",
        ],
        list: [
          "6. Repousser l'administratif au soir, jusqu'à l'épuisement",
          "7. Multiplier les outils qui ne se parlent pas entre eux",
        ],
      },
      {
        heading: "Le point commun de toutes ces erreurs",
        body: [
          "Ces sept erreurs ont une racine unique : le manque de visibilité et la friction. Quand agir demande trop d'efforts, on repousse, et les fuites s'installent.",
          "Réduire cette friction, centraliser l'information et automatiser le répétitif suffit à corriger la plupart. C'est précisément l'objet de Biltia : rendre la gestion assez simple pour qu'elle se fasse vraiment.",
        ],
      },
    ],
    takeaways: [
      "Ce sont les petites erreurs répétées, pas les grosses, qui érodent la marge.",
      "Un devis lent ou une relance oubliée, ce sont des chantiers perdus.",
      "Piloter sans suivi mène à découvrir les problèmes trop tard.",
      "Trésorerie et rentabilité ne sont pas la même chose.",
      "La racine commune est la friction : la réduire corrige la plupart des erreurs.",
    ],
    faq: [
      {
        q: "Quelle est l'erreur de gestion la plus coûteuse pour un artisan ?",
        a: "Souvent la lenteur des devis et l'absence de relance : ce sont des chantiers déjà à portée qui sont perdus faute de réactivité.",
      },
      {
        q: "Faut-il être bon en gestion pour éviter ces erreurs ?",
        a: "Non. La plupart se corrigent en réduisant la friction : centraliser l'information, répondre vite et automatiser le répétitif, sans devenir gestionnaire à plein temps.",
      },
      {
        q: "Comment savoir si un chantier est vraiment rentable ?",
        a: "En suivant, chantier par chantier, le reste à facturer et à encaisser, plutôt qu'en se fiant au seul solde bancaire du moment.",
      },
    ],
    relatedProduct: "copilote",
    cta: "Quels devis sont en attente de réponse et quels chantiers dépassent leur budget cette semaine ?",
  },

  // 10 ──────────────────────────────────────────────────────────────────────
  {
    slug: "devis-facturation-plus-vite",
    title: "Devis et facturation : comment aller trois fois plus vite",
    description:
      "Le devis est votre premier commercial. Voici comment produire devis et factures trois fois plus vite, sans rien perdre en qualité.",
    category: "Productivité",
    date: "2026-06-16",
    readingMinutes: 7,
    keywords: [
      "devis rapide BTP",
      "facturation artisan",
      "faire un devis vite",
      "productivité devis",
      "gagner du temps facturation",
    ],
    excerpt:
      "Le premier artisan à envoyer un devis propre gagne souvent le chantier. La vitesse est un avantage commercial.",
    intro:
      "Dans le bâtiment, le devis est votre premier commercial. Celui qui répond vite, avec un document clair, prend une longueur d'avance. Pourtant, beaucoup d'artisans mettent des jours à envoyer un devis, faute de méthode. Voici comment aller trois fois plus vite, sans sacrifier la qualité.",
    sections: [
      {
        heading: "Pourquoi la vitesse est un avantage commercial",
        body: [
          "Un client qui demande un devis est en phase de décision. Plus vous tardez, plus son enthousiasme retombe et plus la concurrence a le temps de passer devant.",
          "Répondre vite, c'est montrer du sérieux et de la disponibilité. À prestation égale, c'est souvent ce qui fait la différence.",
        ],
      },
      {
        heading: "Ne jamais repartir d'une page blanche",
        body: [
          "Refaire chaque devis de zéro est la première cause de lenteur. Vos chantiers se ressemblent plus que vous ne le pensez : réutilisez un devis proche comme point de départ.",
          "Une base de postes récurrents, avec leurs prix, permet d'assembler un devis en quelques minutes au lieu d'une heure.",
        ],
      },
      {
        heading: "Laisser les données se remplir toutes seules",
        body: [
          "Retaper les coordonnées d'un client, l'adresse d'un chantier, vos tarifs : ce sont des minutes perdues à chaque document. Quand ces informations vivent au même endroit, elles se reportent automatiquement.",
          "Vous vous concentrez sur ce qui compte, le contenu du devis, pas sur la ressaisie.",
        ],
      },
      {
        heading: "Dicter le devis sur le chantier",
        body: [
          "Le meilleur moment pour préparer un devis, c'est juste après la visite, quand tout est frais. En dictant les postes sur place, vous ne perdez aucun détail.",
          "De retour au bureau, le devis est déjà à moitié fait. Souvent, il ne reste qu'à vérifier et envoyer.",
        ],
      },
      {
        heading: "Passer du devis à la facture sans ressaisir",
        body: [
          "Un chantier accepté ne devrait pas obliger à tout retaper pour facturer. Le devis contient déjà l'essentiel : il suffit de le transformer.",
          "Réduire ce passage à quelques secondes évite les erreurs de recopie et accélère l'encaissement.",
        ],
      },
      {
        heading: "La méthode Biltia",
        body: [
          "Avec Biltia, vous décrivez le devis en français, ou vous le dictez, et l'outil le rédige, le chiffre et le met en forme, en reprenant les données déjà connues de votre entreprise.",
          "Le résultat est un document propre, prêt à envoyer, produit en une fraction du temps habituel. Répondre vite cesse d'être un effort pour devenir un réflexe.",
        ],
      },
    ],
    takeaways: [
      "Le premier à envoyer un devis clair prend souvent le chantier : la vitesse est commerciale.",
      "Ne repartez jamais de zéro : réutilisez un devis proche et une base de postes.",
      "Des données centralisées se reportent seules et suppriment la ressaisie.",
      "Dicter les postes sur le chantier évite d'oublier des détails.",
      "Passer du devis à la facture sans retaper accélère l'encaissement.",
    ],
    faq: [
      {
        q: "Comment faire un devis plus rapidement sans le bâcler ?",
        a: "En réutilisant une base existante, en laissant les données client se reporter automatiquement et en dictant les postes sur le chantier, quand tout est encore frais.",
      },
      {
        q: "Peut-on transformer un devis en facture sans tout retaper ?",
        a: "Oui, quand le devis et la facture partagent les mêmes données. Le passage se fait alors en quelques secondes, sans erreur de recopie.",
      },
      {
        q: "En quoi Biltia accélère-t-il la création de devis ?",
        a: "Vous décrivez ou dictez le devis, et Biltia le rédige, le chiffre et le met en forme en reprenant les données déjà connues de votre entreprise.",
      },
    ],
    relatedProduct: "documents",
    cta: "Prépare un devis pour la pose de 30 mètres carrés de parquet chez le client Martin, prêt à envoyer.",
  },

  // 11 ──────────────────────────────────────────────────────────────────────
  {
    slug: "biltia-logiciel-ia-btp",
    title: "Biltia : le logiciel IA pour le BTP qui fait l'administratif à votre place",
    description:
      "Biltia est le logiciel IA du bâtiment : vous décrivez votre besoin, il livre le devis, le suivi ou la réponse. À quoi il sert, pour qui, comment démarrer.",
    category: "Découverte",
    date: "2026-07-01",
    readingMinutes: 10,
    keywords: [
      "Biltia",
      "logiciel IA BTP",
      "logiciel intelligence artificielle bâtiment",
      "logiciel IA artisan",
      "logiciel gestion IA BTP",
    ],
    excerpt:
      "Un seul endroit où vous décrivez votre problème, et l'IA livre la solution : document, application, réponse ou automatisation.",
    intro:
      "Biltia est un logiciel IA pensé pour les artisans et les entreprises du BTP. Le principe tient en une phrase : au lieu d'apprendre un logiciel de plus, vous décrivez votre besoin en français, à l'écrit ou à la voix, et Biltia produit la solution. Voici à quoi il sert concrètement, pour qui il est fait, et comment le prendre en main sans y passer une semaine.",
    sections: [
      {
        heading: "Biltia en une phrase",
        body: [
          "Biltia est un logiciel IA du bâtiment qui part de votre problème, pas d'un menu. Vous ouvrez une seule barre, vous dites ce dont vous avez besoin, et l'outil s'occupe du reste.",
          "Là où un logiciel classique vous oblige à choisir un module puis à le paramétrer, Biltia comprend la demande et choisit lui-même la bonne façon d'y répondre. Vous ne pilotez pas un logiciel, vous confiez une tâche.",
        ],
      },
      {
        heading: "Pourquoi un logiciel IA change la donne dans le BTP",
        body: [
          "Le bâtiment est un métier de terrain, pas de bureau. Le problème des logiciels traditionnels, c'est qu'ils demandent du temps assis devant un écran, à saisir et à naviguer dans des rubriques. Ce temps, l'artisan ne l'a pas la journée, alors il s'entasse le soir.",
          "Un logiciel IA renverse la logique : c'est lui qui fait le travail de mise en forme, de calcul et de recherche. Vous fournissez l'intention en quelques mots, il fournit le résultat fini. La barrière entre le besoin et l'action tombe presque entièrement.",
        ],
      },
      {
        heading: "Ce que Biltia sait faire",
        body: [
          "Derrière la barre unique, Biltia produit quatre types de solutions selon ce que vous demandez. Vous n'avez jamais à préciser lequel, il le déduit de votre phrase.",
        ],
        list: [
          "Un document : devis, facture, courrier, compte rendu, prêt à envoyer",
          "Une application : suivi de chantiers, pointage des heures, inventaire, généré sur mesure",
          "Une réponse : une question sur vos données obtient une réponse sourcée",
          "Une automatisation : une vérification ou un rapprochement de fichiers en un passage",
        ],
      },
      {
        heading: "Pour qui Biltia est fait",
        body: [
          "Biltia vise en priorité l'artisan seul et la petite entreprise du bâtiment, ceux qui n'ont pas de service administratif et qui portent la gestion en plus du métier. Ce sont eux qui gagnent le plus à déléguer la paperasse.",
          "Il rend aussi service aux structures un peu plus grandes, avec un bureau et des chantiers multiples, qui veulent un point d'entrée simple pour toute l'équipe. Plombier, électricien, maçon, menuisier, entreprise de rénovation multi-corps : l'outil s'adapte au métier parce qu'il se génère à partir de votre description, pas d'un modèle figé.",
        ],
      },
      {
        heading: "En quoi Biltia diffère d'un logiciel de gestion classique",
        body: [
          "Un ERP ou un logiciel de gestion du bâtiment est puissant, mais lourd : des semaines de paramétrage, une formation, des dizaines de menus, et un usage pensé pour le bureau. Beaucoup d'artisans en achètent un, puis reviennent au tableur faute de temps.",
          "Biltia supprime cette phase. Il n'y a rien à configurer : vous décrivez, il génère. Et comme tout vit dans la mémoire de votre entreprise, chaque document et chaque suivi se nourrit de vos vraies données, sans ressaisie.",
        ],
      },
      {
        heading: "En quoi Biltia diffère d'une IA généraliste",
        body: [
          "Une IA généraliste sait rédiger un texte, mais elle ne connaît ni vos clients, ni vos chantiers, ni vos prix. Elle repart de zéro à chaque fois et vous rend un texte à recopier, pas un outil relié à votre activité.",
          "Biltia est spécialisé pour le BTP et branché sur votre workspace. Quand vous demandez un devis pour un client, il connaît déjà ses coordonnées et ses chantiers. Quand vous posez une question sur vos retards, il répond à partir de vos données. C'est la différence entre un assistant qui parle et un assistant qui agit.",
        ],
      },
      {
        heading: "Comment démarrer sans y passer une semaine",
        body: [
          "Le meilleur moyen de juger Biltia, c'est de l'essayer sur un vrai besoin, pas sur une démo abstraite. Vous pouvez commencer gratuitement et lui confier la tâche qui vous fait perdre le plus de temps : sortir un devis, générer un suivi de chantiers, ou poser une question sur votre activité.",
          "En pratique, vous décrivez ce que vous voulez, Biltia pose au besoin une ou deux questions pour cadrer, puis il livre. Prenez le réflexe sur une tâche, puis étendez au fur et à mesure. En quelques jours, la barre unique remplace plusieurs de vos outils épars.",
        ],
      },
    ],
    takeaways: [
      "Biltia est un logiciel IA du BTP : vous décrivez, il livre la solution.",
      "Quatre formats couverts : document, application, réponse et automatisation.",
      "Pensé d'abord pour l'artisan seul et la petite entreprise, sans service administratif.",
      "Aucun paramétrage, contrairement à un ERP classique du bâtiment.",
      "Spécialisé BTP et branché sur vos données, contrairement à une IA généraliste.",
      "On démarre gratuitement sur un vrai besoin, puis on étend.",
    ],
    faq: [
      {
        q: "Biltia, c'est quoi exactement ?",
        a: "Biltia est un logiciel IA pour le BTP. Vous décrivez votre besoin en français, à l'écrit ou à la voix, et l'outil produit un document, une application métier, une réponse sur vos données ou une automatisation, depuis une seule barre.",
      },
      {
        q: "Biltia est-il fait pour un artisan seul ?",
        a: "Oui, c'est même sa cible première. Les petites structures sans service administratif sont celles qui gagnent le plus de temps en déléguant devis, suivis et relances à un logiciel IA.",
      },
      {
        q: "Quelle différence avec une IA généraliste comme un chatbot ?",
        a: "Une IA généraliste ne connaît pas vos clients ni vos chantiers et vous rend un texte à recopier. Biltia est spécialisé BTP et relié à la mémoire de votre entreprise, donc il pré-remplit vos documents et répond à partir de vos vraies données.",
      },
      {
        q: "Faut-il paramétrer Biltia avant de l'utiliser ?",
        a: "Non. Il n'y a pas de phase de configuration comme sur un ERP. Vous décrivez ce que vous voulez et l'outil le génère, puis vous l'ajustez à la voix si besoin.",
      },
    ],
    relatedProduct: "copilote",
    cta: "Montre-moi ce que tu peux faire pour mon entreprise : prépare un devis et un suivi de mes chantiers.",
  },

  // 12 ──────────────────────────────────────────────────────────────────────
  {
    slug: "chatgpt-artisan-btp",
    title: "ChatGPT pour les artisans du BTP : ce qu'il sait faire, ses limites et l'alternative",
    description:
      "ChatGPT peut aider un artisan à rédiger, mais il ignore vos clients, vos prix et vos chantiers. Ce qu'il fait bien, où il bloque, et quelle alternative BTP.",
    category: "Guide",
    date: "2026-07-02",
    readingMinutes: 10,
    keywords: [
      "ChatGPT artisan",
      "ChatGPT BTP",
      "ChatGPT devis bâtiment",
      "IA générative artisan",
      "ChatGPT pour le bâtiment",
    ],
    excerpt:
      "ChatGPT rédige bien, mais il ne connaît pas votre entreprise. Voici où il aide vraiment un artisan, et où il s'arrête.",
    intro:
      "De plus en plus d'artisans ouvrent ChatGPT pour rédiger un devis, un mail ou un compte rendu. C'est un bon réflexe, mais il faut savoir où l'outil aide et où il bloque. ChatGPT est un excellent rédacteur généraliste, pas un logiciel de gestion du bâtiment. Voici, sans langue de bois, ce qu'il fait bien pour un artisan, ses limites, et l'alternative pensée pour le BTP.",
    sections: [
      {
        heading: "Pourquoi les artisans se tournent vers ChatGPT",
        body: [
          "La raison est simple : c'est gratuit à l'essai, immédiat, et ça écrit mieux que la page blanche. Pour un artisan qui déteste rédiger, obtenir un texte propre en quelques secondes est un vrai soulagement.",
          "ChatGPT est devenu le premier contact de beaucoup de professionnels avec l'IA. Le problème, c'est qu'on lui demande ensuite des choses pour lesquelles il n'est pas conçu, et on se heurte à un mur.",
        ],
      },
      {
        heading: "Ce que ChatGPT fait bien pour un artisan",
        body: [
          "Sur les tâches de pure rédaction et de réflexion générale, ChatGPT rend de vrais services. Tant que la tâche ne dépend pas de vos données précises, il est efficace.",
        ],
        list: [
          "Reformuler un mail client délicat ou une relance polie",
          "Structurer un compte rendu à partir de notes en vrac",
          "Expliquer un terme technique ou administratif",
          "Donner une trame de courrier ou de conditions générales",
          "Traduire un échange avec un client étranger",
        ],
      },
      {
        heading: "Là où ChatGPT bloque",
        body: [
          "Le mur arrive dès que la tâche touche à votre entreprise. ChatGPT ne connaît ni vos clients, ni vos prix, ni l'avancement de vos chantiers. Il ne peut donc pas chiffrer un devis juste, ni vous dire qui vous doit de l'argent.",
          "Autre limite : il vous rend du texte, pas un outil. Vous devez recopier, remettre en forme, ranger le résultat quelque part. Et il n'a pas de mémoire fiable de votre activité d'une fois sur l'autre, donc vous répétez le contexte à chaque échange.",
        ],
        list: [
          "Il ignore vos clients, vos tarifs et vos chantiers",
          "Il rend un texte à recopier, pas un document rangé ni une application",
          "Il ne suit pas vos données dans le temps",
          "Il peut inventer un chiffre plausible mais faux",
        ],
      },
      {
        heading: "L'exemple du devis",
        body: [
          "Demandez un devis à ChatGPT : il vous rendra une belle trame, mais avec des prix inventés et un client fictif. À vous de tout corriger, de remettre vos tarifs, vos coordonnées, votre mise en page.",
          "Le gain de temps réel est donc limité. Vous partez d'une page moins blanche, mais l'essentiel du travail, relier le devis à un vrai client et à de vrais prix, reste sur vos épaules.",
        ],
      },
      {
        heading: "La vraie différence : un outil qui connaît votre entreprise",
        body: [
          "Ce qui manque à une IA généraliste, c'est la mémoire de votre activité. Un outil utile pour un artisan doit savoir qui sont vos clients, quels sont vos chantiers et quels prix vous pratiquez, pour produire un résultat juste et prêt à l'emploi.",
          "C'est exactement le rôle de Biltia. Vous décrivez le devis, et il le chiffre à partir de vos données réelles, avec le bon client et vos tarifs, prêt à envoyer. Il ne se contente pas d'écrire, il produit un document rangé dans la mémoire de votre entreprise.",
        ],
      },
      {
        heading: "Au-delà du texte : documents, applications, réponses",
        body: [
          "Là où ChatGPT s'arrête à la conversation, un outil spécialisé va jusqu'à la solution finie. Avec Biltia, la même barre produit un devis prêt à signer, génère un suivi de chantiers sur mesure, ou répond à une question sur vos données.",
          "Vous ne quittez jamais l'outil pour aller ranger ou recopier. Le résultat vit là où sont vos clients et vos documents, et il se réutilise la fois suivante.",
        ],
      },
      {
        heading: "Faut-il abandonner ChatGPT ?",
        body: [
          "Pas du tout. ChatGPT reste un bon compagnon pour réfléchir, reformuler ou expliquer. Gardez-le pour ces usages généralistes où il excelle.",
          "Mais pour tout ce qui touche à vos clients, vos devis, vos chantiers et votre gestion, un outil spécialisé et relié à vos données vous fera gagner bien plus de temps. Le mieux est souvent d'utiliser les deux, chacun à sa place.",
        ],
      },
    ],
    takeaways: [
      "ChatGPT est un excellent rédacteur généraliste, pas un logiciel de gestion du bâtiment.",
      "Il aide à reformuler, structurer et expliquer, tant que la tâche ne dépend pas de vos données.",
      "Il ignore vos clients, vos prix et vos chantiers, et peut inventer un chiffre faux.",
      "Il rend du texte à recopier, pas un document rangé ni une application.",
      "Un outil BTP relié à vos données produit un résultat juste et prêt à l'emploi.",
      "Le bon réflexe : ChatGPT pour réfléchir, un outil spécialisé pour agir sur votre activité.",
    ],
    faq: [
      {
        q: "Peut-on faire un devis avec ChatGPT ?",
        a: "ChatGPT peut produire une trame de devis, mais avec des prix inventés et un client fictif, car il ignore vos données. Il faut tout corriger ensuite. Un outil relié à vos tarifs et à vos clients chiffre le devis juste, prêt à envoyer.",
      },
      {
        q: "ChatGPT connaît-il mes clients et mes chantiers ?",
        a: "Non. ChatGPT n'a pas accès à votre activité et n'en garde pas de mémoire fiable d'une fois sur l'autre. Vous devez lui répéter le contexte à chaque échange.",
      },
      {
        q: "Quelle est l'alternative à ChatGPT pour un artisan du BTP ?",
        a: "Un outil spécialisé BTP relié à vos données, comme Biltia. Vous décrivez votre besoin et il produit le document, l'application ou la réponse à partir de vos vrais clients, prix et chantiers.",
      },
      {
        q: "Faut-il arrêter d'utiliser ChatGPT ?",
        a: "Non. ChatGPT reste utile pour reformuler, structurer ou expliquer. Réservez-le à ces usages généralistes, et confiez à un outil spécialisé tout ce qui touche vos clients, devis et chantiers.",
      },
    ],
    relatedProduct: "copilote",
    cta: "Prépare un devis chiffré pour mon client Martin à partir de mes tarifs, prêt à envoyer.",
  },

  // 13 ──────────────────────────────────────────────────────────────────────
  {
    slug: "logiciel-devis-facture-batiment",
    title: "Logiciel de devis et facture pour le bâtiment : gratuit, payant, ou plus simple ?",
    description:
      "Gratuit ou payant, comment choisir un logiciel de devis et facture pour le bâtiment. Ce qui compte vraiment, les pièges, et une approche plus rapide.",
    category: "Comparatif",
    date: "2026-07-03",
    readingMinutes: 10,
    keywords: [
      "logiciel devis facture bâtiment",
      "logiciel facturation BTP",
      "logiciel devis artisan gratuit",
      "logiciel devis bâtiment",
      "faire devis et facture BTP",
    ],
    excerpt:
      "Gratuit, payant, mobile, relié à vos données : le vrai critère n'est pas le prix, c'est le temps que vous gagnez.",
    intro:
      "Chercher un logiciel de devis et facture pour le bâtiment, c'est vite se noyer entre les offres gratuites, les abonnements et les promesses. Pour bien choisir, il faut savoir ce qu'on demande vraiment à ce type d'outil, et quel critère compte le plus. Voici un tour d'horizon honnête du gratuit, du payant, et d'une troisième voie plus simple.",
    sections: [
      {
        heading: "Ce qu'on demande vraiment à un logiciel de devis",
        body: [
          "Sur le papier, tout le monde veut la même chose : produire vite un devis clair, puis le transformer en facture sans tout retaper. En réalité, la valeur d'un logiciel se juge sur des détails qui font gagner ou perdre des heures chaque semaine.",
          "Un devis rapide à monter, des prix réutilisables, un passage devis vers facture sans ressaisie, et un accès depuis le chantier : voilà les vrais critères. Le reste est souvent du confort secondaire.",
        ],
      },
      {
        heading: "Les logiciels gratuits : pour qui, jusqu'où",
        body: [
          "Les solutions gratuites, ou les modules gratuits d'outils plus larges, dépannent bien au démarrage. Pour un artisan qui sort quelques devis par mois, elles suffisent souvent.",
          "Leurs limites apparaissent avec le volume : fonctions bridées, nombre de documents plafonné, peu de personnalisation, et souvent une incitation à passer à la version payante dès que l'activité grossit. Le gratuit est un bon banc d'essai, rarement une solution durable.",
        ],
      },
      {
        heading: "Les logiciels payants : ce que vous payez vraiment",
        body: [
          "Un logiciel de facturation payant apporte en général une bibliothèque de prix, des modèles soignés, le suivi des paiements et un support. Pour une entreprise qui facture beaucoup, l'abonnement se justifie.",
          "Mais vous payez aussi pour des fonctions que vous n'utiliserez jamais, et parfois pour une prise en main longue. Le coût n'est pas que l'abonnement : c'est aussi le temps d'apprentissage et le risque de ne pas exploiter la moitié de l'outil.",
        ],
      },
      {
        heading: "Le piège du logiciel qu'on n'utilise pas",
        body: [
          "L'erreur la plus fréquente n'est pas de choisir le mauvais logiciel, c'est d'en choisir un trop lourd et de l'abandonner. Un outil qui demande une formation d'une semaine finit souvent inutilisé, remplacé par un retour au tableur.",
          "Avant de comparer les fonctions, posez-vous une question simple : est-ce que je vais vraiment m'en servir tous les jours, y compris depuis le chantier ? Un outil moins complet mais réellement utilisé bat toujours un outil riche qui dort.",
        ],
      },
      {
        heading: "Ce qui compte plus que gratuit ou payant",
        body: [
          "Le vrai critère n'est ni le prix, ni la longueur de la liste de fonctions. C'est le temps gagné entre le moment où vous devez faire un devis et le moment où il part chez le client.",
        ],
        list: [
          "La vitesse de création, sans repartir d'une page blanche",
          "Des données reliées, pour ne jamais retaper un client ou un prix",
          "Le passage du devis à la facture sans ressaisie",
          "Un accès mobile, pour agir depuis le chantier",
          "Une prise en main immédiate, sans formation",
        ],
      },
      {
        heading: "Une troisième voie : décrire ou dicter le devis",
        body: [
          "À côté du gratuit bridé et du payant complexe, une approche plus récente consiste à décrire le devis en français, ou à le dicter, et à laisser l'outil le rédiger et le chiffrer.",
          "C'est le principe de Biltia. Vous dictez les postes sur le chantier, quand tout est frais, et vous obtenez un document propre reprenant les données déjà connues de votre entreprise. Le devis devient une facture d'un mot, sans retaper. Il n'y a rien à paramétrer, et l'outil vit là où sont vos clients et vos chantiers.",
        ],
      },
      {
        heading: "Comment choisir sans se tromper",
        body: [
          "Si vous débutez et facturez peu, un outil gratuit fait le job. Si vous avez un gros volume et un bureau structuré, un logiciel payant complet se défend.",
          "Mais si votre priorité est de répondre vite, sans formation et sans ressaisie, en travaillant autant depuis le chantier que depuis le bureau, l'approche par description est faite pour vous. Le mieux reste de tester sur un vrai devis et de mesurer le temps réellement gagné.",
        ],
      },
    ],
    takeaways: [
      "Un bon logiciel de devis se juge sur la vitesse et l'absence de ressaisie, pas sur la liste de fonctions.",
      "Le gratuit dépanne au démarrage mais se bride vite avec le volume.",
      "Le payant se justifie pour un gros volume, au prix d'une prise en main plus longue.",
      "Le vrai risque est de choisir un outil trop lourd et de l'abandonner.",
      "Décrire ou dicter le devis supprime le paramétrage et la page blanche.",
      "Testez sur un vrai devis et mesurez le temps gagné avant de trancher.",
    ],
    faq: [
      {
        q: "Existe-t-il un logiciel de devis et facture gratuit pour le bâtiment ?",
        a: "Oui, plusieurs outils proposent une version gratuite ou un module gratuit. Ils dépannent au démarrage, mais brident souvent le nombre de documents et les fonctions dès que l'activité grossit.",
      },
      {
        q: "Vaut-il mieux un logiciel gratuit ou payant pour faire ses devis ?",
        a: "Cela dépend de votre volume. Le gratuit suffit pour quelques devis par mois. Au-delà, le critère décisif n'est pas le prix mais le temps gagné : vitesse de création, données reliées et passage devis vers facture sans ressaisie.",
      },
      {
        q: "Peut-on transformer un devis en facture sans tout retaper ?",
        a: "Oui, quand le devis et la facture partagent les mêmes données. Le passage se fait alors en quelques secondes, sans erreur de recopie. C'est un critère à vérifier avant de choisir un outil.",
      },
      {
        q: "Comment faire un devis plus rapidement dans le bâtiment ?",
        a: "En ne repartant jamais d'une page blanche : réutiliser une base de prix, laisser les données client se reporter, et dicter les postes sur le chantier. Un outil comme Biltia rédige et chiffre le devis à partir de vos données existantes.",
      },
    ],
    relatedProduct: "documents",
    cta: "Prépare un devis clair pour la rénovation d'une salle de bain, avec mes postes habituels, prêt à envoyer.",
  },

  // 14 ──────────────────────────────────────────────────────────────────────
  {
    slug: "suivi-heures-chantier",
    title: "Suivi des heures sur chantier : arrêter le carnet et les fiches papier",
    description:
      "Heures mal suivies, c'est de la marge et de la paie en moins. Voici comment suivre les heures par chantier et par ouvrier, simplement, depuis le terrain.",
    category: "Conseils",
    date: "2026-07-04",
    readingMinutes: 9,
    keywords: [
      "suivi des heures chantier",
      "logiciel pointage BTP",
      "pointage ouvrier chantier",
      "feuille d'heures bâtiment",
      "suivi du temps chantier",
    ],
    excerpt:
      "Les heures notées sur un carnet finissent fausses ou perdues. Et chaque heure mal suivie, c'est de la marge en moins.",
    intro:
      "Le suivi des heures est l'un des points noirs des entreprises du bâtiment. Entre les carnets, les fiches papier et les messages, les heures se perdent, s'arrondissent ou se retrouvent trop tard. Or chaque heure mal suivie, c'est de la facturation oubliée, une paie approximative et une rentabilité floue. Voici comment reprendre la main, simplement, sans usine à gaz.",
    sections: [
      {
        heading: "Pourquoi le suivi des heures est un point noir",
        body: [
          "Les heures se font sur le terrain, mais se notent au bureau, souvent de mémoire, en fin de semaine. Ce décalage est la source de toutes les erreurs : on oublie une intervention, on arrondit, on confond deux chantiers.",
          "Sur le papier, chaque ouvrier a sa méthode, ses ratures et ses oublis. Résultat, celui qui centralise passe un temps fou à déchiffrer, relancer et recompter, pour un total qui reste incertain.",
        ],
      },
      {
        heading: "Le vrai coût des heures mal suivies",
        body: [
          "Une heure non notée est une heure non facturée quand le chantier est en régie. Répétée sur l'année, sur plusieurs ouvriers, cette fuite représente des sommes importantes qui disparaissent sans bruit.",
          "Le flou touche aussi la paie, avec des heures supplémentaires mal comptées, et surtout la rentabilité. Sans heures fiables par chantier, impossible de savoir lequel vous fait vraiment gagner de l'argent. Vous pilotez à l'aveugle.",
        ],
      },
      {
        heading: "Les limites du carnet et des fiches papier",
        body: [
          "Le papier a un avantage, sa simplicité, et beaucoup de défauts. Une fiche se perd, se mouille, se remplit en retard, et ne se totalise pas toute seule. Personne n'a la vue d'ensemble avant la fin du mois.",
          "Le tableur fait à peine mieux : il faut ressaisir les fiches à la main, et personne ne le met à jour depuis le chantier. On déplace le problème du papier vers l'écran, sans le régler.",
        ],
      },
      {
        heading: "Ce qu'un bon suivi des heures doit permettre",
        body: [
          "Un suivi efficace ne demande pas dix fonctions. Il demande de saisir vite, au bon moment, et de tout relier automatiquement.",
        ],
        list: [
          "Pointer les heures par ouvrier et par chantier en quelques secondes",
          "Saisir depuis le terrain, pas seulement au bureau",
          "Distinguer heures normales et heures supplémentaires",
          "Voir le total par chantier, à jour, sans recompter",
          "Relier les heures au chantier et à sa facturation",
        ],
      },
      {
        heading: "Pointer sur le terrain, pas le soir",
        body: [
          "La clé, c'est de capturer l'heure au moment où elle est faite. Quand le pointage se fait sur place, à la voix ou en deux touches, l'information est juste et complète. Le soir, on ne reconstitue plus rien de mémoire.",
          "Ce changement de moment supprime la corvée de fin de semaine et fiabilise tout ce qui vient après : la facturation en régie, la paie et l'analyse de rentabilité.",
        ],
      },
      {
        heading: "Générer votre propre tableau de pointage",
        body: [
          "Les logiciels de pointage du marché sont souvent soit trop simples, soit trop lourds. Une autre voie consiste à générer l'outil qui colle exactement à votre façon de compter.",
          "Avec Biltia, vous décrivez le suivi voulu, par exemple un tableau de pointage des heures par ouvrier et par chantier, avec les heures supplémentaires, et l'application est générée pour vous. Vous la modifiez ensuite à la voix : ajouter un ouvrier, un statut, une alerte. Aucun paramétrage, aucun tableur à maintenir.",
        ],
      },
      {
        heading: "Relier les heures aux chantiers et aux devis",
        body: [
          "Un pointage isolé a peu de valeur. Sa force vient du lien avec le reste : quand les heures sont rattachées au chantier, vous savez en un coup d'oeil si vous êtes dans le budget prévu.",
          "Dans Biltia, le pointage puise dans la mémoire de votre entreprise. Il connaît déjà vos chantiers et vos équipes, et les heures alimentent le suivi du chantier comme sa facturation. Vous passez d'un total incertain à un pilotage clair.",
        ],
      },
    ],
    takeaways: [
      "Les heures se font sur le terrain mais se notent au bureau : d'où les erreurs.",
      "Une heure non notée en régie est une heure non facturée, et une fuite de marge.",
      "Le papier et le tableur ne se totalisent pas seuls et ne suivent pas le chantier.",
      "Un bon suivi se pointe en quelques secondes, depuis le terrain, par ouvrier et par chantier.",
      "Générer son propre tableau de pointage évite l'outil trop simple ou trop lourd.",
      "Relier les heures au chantier transforme un total incertain en pilotage clair.",
    ],
    faq: [
      {
        q: "Comment suivre les heures de mes ouvriers sur les chantiers ?",
        a: "Le plus fiable est de pointer sur le terrain, au moment où l'heure est faite, par ouvrier et par chantier. Un outil accessible sur téléphone, où l'on saisit en quelques secondes, évite la reconstitution de mémoire en fin de semaine.",
      },
      {
        q: "Pourquoi arrêter les fiches d'heures papier ?",
        a: "Le papier se perd, se remplit en retard et ne se totalise pas seul. Personne n'a la vue d'ensemble avant la fin du mois, ce qui provoque des oublis de facturation et une paie approximative.",
      },
      {
        q: "Peut-on créer un tableau de pointage sur mesure sans logiciel compliqué ?",
        a: "Oui. Avec Biltia, vous décrivez le suivi voulu, par exemple les heures par ouvrier et par chantier avec les heures supplémentaires, et l'application est générée. Vous l'ajustez ensuite à la voix, sans paramétrage.",
      },
      {
        q: "En quoi un bon suivi des heures améliore la rentabilité ?",
        a: "Des heures fiables par chantier permettent enfin de savoir lequel vous fait gagner de l'argent, de facturer toutes les heures en régie et de compter juste les heures supplémentaires. Sans elles, vous pilotez à l'aveugle.",
      },
    ],
    relatedProduct: "applications",
    cta: "Crée un tableau de pointage des heures par ouvrier et par chantier, avec les heures supplémentaires.",
  },

  // 15 ──────────────────────────────────────────────────────────────────────
  {
    slug: "relancer-impayes-btp",
    title: "Relancer les impayés dans le BTP : la méthode pour être payé plus vite",
    description:
      "Une facture impayée, c'est de la trésorerie bloquée. Voici une méthode de relance simple et régulière pour être payé plus vite, sans y passer vos soirées.",
    category: "Conseils",
    date: "2026-07-05",
    readingMinutes: 9,
    keywords: [
      "relance impayés bâtiment",
      "facture impayée artisan",
      "se faire payer BTP",
      "relance client bâtiment",
      "trésorerie artisan",
    ],
    excerpt:
      "La plupart des impayés ne sont pas des refus, mais des oublis. Une relance régulière transforme le silence en paiement.",
    intro:
      "Une facture impayée n'est pas qu'un chiffre en attente : c'est de la trésorerie bloquée, du stress et parfois un chantier qui plombe l'année. Pourtant, la plupart des impayés ne sont pas des mauvais payeurs, ce sont des oublis. Avec une méthode de relance simple et régulière, vous transformez une bonne partie de ces silences en paiements. Voici comment faire, sans y passer vos soirées.",
    sections: [
      {
        heading: "L'impayé, premier ennemi de la trésorerie",
        body: [
          "Dans le bâtiment, vous avancez souvent les matériaux et la main-d'oeuvre avant d'être payé. Chaque facture en retard creuse donc un trou dans la trésorerie, même quand le carnet de commandes est plein.",
          "Le danger est sournois : une entreprise rentable sur le papier peut se retrouver en difficulté simplement parce que l'argent gagné n'est pas encore encaissé. Suivre et relancer les impayés n'est pas une corvée administrative, c'est de la survie.",
        ],
      },
      {
        heading: "La plupart des impayés sont des oublis",
        body: [
          "Il est tentant de voir un mauvais payeur derrière chaque retard. La réalité est plus banale : la facture est passée sous une pile, oubliée, ou en attente d'une validation interne chez le client.",
          "C'est une bonne nouvelle. Un oubli se règle avec un simple rappel, à condition qu'il parte au bon moment. La plupart des clients paient dès qu'on leur rafraîchit la mémoire, sans conflit.",
        ],
      },
      {
        heading: "Savoir qui vous doit quoi, tout de suite",
        body: [
          "On ne relance bien que ce qu'on voit. La première étape n'est pas d'écrire, c'est d'avoir en permanence la liste claire des factures dues, de leur montant et de leur ancienneté.",
          "Sans cette visibilité, on relance au hasard, on oublie les plus vieilles, on relance deux fois la même. Avec elle, vous savez chaque matin qui appeler en priorité. Poser la question à vos données, plutôt que de fouiller vos dossiers, change tout.",
        ],
      },
      {
        heading: "Une cadence de relance qui marche",
        body: [
          "L'efficacité vient de la régularité, pas de l'agressivité. Une suite de rappels espacés et de plus en plus fermes règle la grande majorité des situations.",
        ],
        list: [
          "Un rappel courtois quelques jours après l'échéance, en supposant l'oubli",
          "Une relance plus directe une à deux semaines plus tard, avec le détail de la facture",
          "Un appel téléphonique pour comprendre le blocage éventuel",
          "Un dernier rappel écrit plus ferme si le silence persiste",
        ],
      },
      {
        heading: "Le bon ton : ferme mais professionnel",
        body: [
          "Beaucoup d'artisans n'osent pas relancer, de peur de froisser un client. C'est une erreur : réclamer son dû est normal et attendu. Un ton poli mais clair est toujours mieux reçu qu'un silence gêné suivi d'un éclat.",
          "Restez factuel : le numéro de facture, le montant, la date d'échéance, et une demande claire de paiement. Pas de reproche, pas d'émotion. La constance du suivi fait plus d'effet que la dureté du message.",
        ],
      },
      {
        heading: "Automatiser le suivi et les rappels",
        body: [
          "Le vrai frein à la relance, c'est qu'on y pense trop tard, débordé par le chantier. La solution est de ne plus s'en remettre à sa mémoire, mais à un suivi qui fait remonter les factures dues au bon moment.",
          "Avec Biltia, vous demandez en une phrase quelles factures sont en retard et de combien, et vous obtenez la réponse à partir de vos données. Vous pouvez aussi lui faire préparer le courrier de relance, prêt à envoyer. La relance cesse d'être une corvée repoussée pour devenir un réflexe.",
        ],
      },
      {
        heading: "Prévenir plutôt que courir après",
        body: [
          "Le meilleur impayé est celui qui n'arrive pas. Quelques habitudes simples réduisent fortement les retards : demander un acompte, poser des échéances claires dès le devis, et facturer sans attendre la fin du chantier.",
          "Facturer vite, avec des conditions nettes et des documents propres, envoie un signal de sérieux qui incite à payer dans les temps. Un devis clair aujourd'hui, c'est une facture plus facile à encaisser demain.",
        ],
      },
    ],
    takeaways: [
      "Un impayé, c'est de la trésorerie bloquée, même quand l'entreprise est rentable.",
      "La plupart des retards sont des oublis, que règle un simple rappel au bon moment.",
      "On ne relance bien que ce qu'on voit : gardez une liste claire des factures dues.",
      "La régularité d'une cadence de rappels fait plus d'effet que l'agressivité.",
      "Automatiser le suivi évite d'y penser trop tard, débordé par le chantier.",
      "Acompte, échéances claires et facturation rapide préviennent beaucoup d'impayés.",
    ],
    faq: [
      {
        q: "Quand faut-il relancer une facture impayée ?",
        a: "Dès quelques jours après l'échéance, avec un rappel courtois qui suppose l'oubli, puis à intervalles réguliers et de plus en plus fermes. La régularité compte plus que l'agressivité.",
      },
      {
        q: "Comment relancer un client sans le froisser ?",
        a: "En restant factuel et poli : numéro de facture, montant, date d'échéance et demande claire de paiement, sans reproche. Réclamer son dû est normal, et un ton professionnel est toujours mieux reçu qu'un silence gêné.",
      },
      {
        q: "Comment savoir quelles factures sont en retard ?",
        a: "En gardant une vue à jour des factures dues, de leur montant et de leur ancienneté. Avec Biltia, vous demandez quelles factures sont en retard et vous obtenez la réponse à partir de vos données, sans fouiller vos dossiers.",
      },
      {
        q: "Comment éviter les impayés dans le bâtiment ?",
        a: "En demandant un acompte, en posant des échéances claires dès le devis et en facturant vite, sans attendre la fin du chantier. Des documents propres et des conditions nettes incitent à payer dans les temps.",
      },
    ],
    relatedProduct: "copilote",
    cta: "Quelles factures sont en retard, de combien, et prépare une relance polie pour les plus anciennes.",
  },
  // 16 ──────────────────────────────────────────────────────────────────────
  {
    slug: "rentabilite-marge-chantier",
    title:
      "Rentabilité de chantier : calculer sa vraie marge et arrêter de travailler à perte",
    description:
      "Un chantier peut sembler rentable et vous coûter de l'argent. Voici comment calculer la vraie marge d'un chantier et repérer ceux qui vous font travailler à perte.",
    category: "Pilotage",
    date: "2026-07-12",
    readingMinutes: 9,
    keywords: [
      "rentabilité chantier",
      "calculer la marge d'un chantier",
      "coût de revient chantier BTP",
      "marge nette artisan bâtiment",
      "suivi rentabilité par chantier",
    ],
    excerpt:
      "Beaucoup d'artisans travaillent beaucoup et gagnent peu. Souvent, c'est un ou deux chantiers à perte qui mangent la marge de tous les autres.",
    intro:
      "Vous enchaînez les chantiers, le carnet est plein, et pourtant le compte en banque ne suit pas. C'est le paradoxe le plus courant du bâtiment : une entreprise très occupée peut gagner très peu. La raison tient presque toujours à un ou deux chantiers qui coûtent plus qu'ils ne rapportent, sans que personne ne s'en aperçoive. Calculer la vraie marge de chaque chantier, c'est reprendre la main sur ce qui reste vraiment dans la poche.",
    sections: [
      {
        heading: "Le piège du chiffre d'affaires qui monte",
        body: [
          "Un carnet plein rassure, mais le chiffre d'affaires n'est pas de l'argent gagné. Vous pouvez facturer beaucoup et ne rien garder si les coûts montent au même rythme que les factures.",
          "La seule question qui compte n'est pas combien vous avez facturé, mais combien il vous reste une fois tout payé. Un chantier de 40 000 euros qui vous en coûte 41 000 vous appauvrit, même s'il fait gonfler le chiffre d'affaires et donne l'impression d'une bonne année.",
        ],
      },
      {
        heading: "Chiffre d'affaires, marge, bénéfice : ne pas confondre",
        body: [
          "Trois mots reviennent sans arrêt et sont souvent mélangés. Les distinguer clairement est le point de départ de tout pilotage.",
        ],
        list: [
          "Le chiffre d'affaires, c'est ce que le client vous paie",
          "Le coût de revient, c'est ce que le chantier vous coûte vraiment : matériaux, heures, sous-traitance, location",
          "La marge, c'est la différence entre les deux",
          "Le bénéfice, c'est ce qu'il reste une fois retirés vos frais généraux",
        ],
      },
      {
        heading: "Le vrai coût d'un chantier, poste par poste",
        body: [
          "On sous-estime presque toujours le coût réel, parce qu'on ne compte que ce qui sort visiblement du compte en banque. Le vrai coût est plus large.",
        ],
        list: [
          "Les matériaux et fournitures, faciles à chiffrer",
          "Les heures de main-d'oeuvre, à leur coût réel chargé, pas au taux affiché sur le devis",
          "La sous-traitance et l'intérim",
          "Les locations de matériel, la benne, l'échafaudage",
          "Les déplacements, le carburant et le temps de trajet",
          "Les reprises et les heures non prévues, oubliées du devis",
        ],
      },
      {
        heading: "Pourquoi les heures sont le poste le plus dangereux",
        body: [
          "Un devis est calculé sur un nombre d'heures estimé. Sur le terrain, la réalité déborde souvent : intempéries, imprévus, client qui change d'avis, reprises à refaire. Chaque heure passée en plus est une heure payée par vous, pas par le client.",
          "C'est le poste qui transforme un chantier prévu rentable en chantier à perte, sans bruit, parce qu'une heure supplémentaire ne laisse aucune facture derrière elle. Suivre les heures réellement passées par chantier n'est pas de la surveillance, c'est la seule façon de savoir si votre prix tient encore une fois le chantier terminé.",
        ],
      },
      {
        heading: "Calculer la marge d'un chantier, simplement",
        body: [
          "Pas besoin d'un logiciel de comptabilité pour commencer. La formule tient en une ligne : le montant facturé, moins les matériaux, moins les heures réelles à leur coût chargé, moins la sous-traitance et les locations.",
          "Le résultat vous donne la marge en euros et en pourcentage. Comparez-la ensuite à ce que vous aviez prévu au devis : l'écart raconte tout. Un chantier prévu à 25 pour cent de marge qui finit à 5 pour cent vous apprend plus sur votre chiffrage que n'importe quel bilan de fin d'année.",
        ],
      },
      {
        heading: "Repérer le chantier qui mange la marge des autres",
        body: [
          "Quand vous calculez la marge chantier par chantier, un schéma apparaît vite : la plupart sont corrects, et un ou deux tirent tout le résultat vers le bas. Ce sont souvent les mêmes profils qui reviennent.",
          "Le client trop bavard qui multiplie les allers-retours, le type de travaux mal maîtrisé, le devis fait trop vite un soir de fatigue. Les identifier, c'est pouvoir dire non la prochaine fois, ou ajuster le prix. Le but n'est pas de fliquer chaque euro, mais de savoir quels chantiers et quels clients vous font gagner votre vie, et lesquels vous la font perdre.",
        ],
      },
      {
        heading: "Corriger le tir sur les prochains devis",
        body: [
          "La rentabilité passée ne sert à rien si elle ne change pas vos futurs devis. Chaque chantier terminé est une leçon de chiffrage, à condition de la lire.",
        ],
        list: [
          "Rehaussez votre taux horaire si vos heures réelles dépassent toujours le devis",
          "Ajoutez une ligne d'imprévus sur les chantiers à risque",
          "Refusez ou surfacturez les types de travaux qui finissent systématiquement à perte",
          "Demandez un acompte pour ne pas financer le chantier à la place du client",
        ],
      },
      {
        heading: "Suivre la rentabilité sans y passer ses soirées",
        body: [
          "Tout ceci suppose de croiser des chiffres qui vivent d'habitude à des endroits différents : le devis, les factures fournisseurs, les heures pointées. C'est justement ce croisement qui décourage la plupart des artisans, et qui repousse le calcul de la marge à la fin de l'année, quand il est trop tard pour corriger.",
          "Avec Biltia, la rentabilité se calcule à partir de vos données déjà présentes : le montant facturé du chantier, les heures pointées par vos équipes et les achats qui lui sont rattachés. Vous demandez en une phrase quels chantiers sont rentables et lesquels ne le sont pas, et vous obtenez la réponse, chiffres à l'appui.",
          "Comme un chantier, son client, ses heures et ses factures vivent dans le même espace, la marge cesse d'être un calcul de fin d'année : elle devient une information disponible en continu, pendant que le chantier tourne encore.",
        ],
      },
    ],
    takeaways: [
      "Un carnet plein ne veut pas dire une entreprise rentable : le chiffre d'affaires n'est pas du bénéfice.",
      "Le coût réel d'un chantier inclut les heures au coût chargé, les reprises et les imprévus, pas seulement les matériaux.",
      "Les heures dépassées sont le poste qui fait basculer un chantier dans le rouge, sans laisser de facture.",
      "Calculer la marge chantier par chantier révèle vite le ou les deux qui mangent le résultat des autres.",
      "Chaque chantier terminé est une leçon de chiffrage pour vos prochains devis.",
      "Croiser devis, achats et heures pointées permet de suivre la rentabilité en continu, pas une fois par an.",
    ],
    faq: [
      {
        q: "Comment calculer la rentabilité d'un chantier ?",
        a: "Prenez le montant facturé du chantier et retirez son coût réel : matériaux, heures de main-d'oeuvre à leur coût chargé, sous-traitance et locations. La différence est votre marge, en euros et en pourcentage. Comparez-la ensuite à la marge prévue au devis pour repérer les écarts.",
      },
      {
        q: "Pourquoi un chantier peut-il ne pas être rentable malgré un bon prix ?",
        a: "Le plus souvent à cause des heures. Un devis est calculé sur un temps estimé, et chaque heure passée en plus est payée par vous, pas par le client. Les reprises et les imprévus non chiffrés suffisent à effacer la marge d'un chantier pourtant bien vendu.",
      },
      {
        q: "Quelle marge viser sur un chantier dans le BTP ?",
        a: "Il n'existe pas de chiffre universel : il dépend de votre métier et de vos frais généraux. Le plus utile n'est pas de viser un pourcentage théorique, mais de comparer la marge réelle de chaque chantier à celle prévue au devis, et de corriger votre chiffrage quand le même écart se répète.",
      },
      {
        q: "Comment suivre la rentabilité de ses chantiers sans comptable ?",
        a: "En croisant trois chiffres que vous avez déjà : le montant facturé, les achats rattachés au chantier et les heures pointées. Avec Biltia, ce calcul se fait à partir de vos données et vous demandez en une phrase quels chantiers sont rentables, sans attendre le bilan.",
      },
    ],
    relatedProduct: "copilote",
    cta: "Calcule la marge réelle de chaque chantier à partir des montants facturés, des achats et des heures pointées, et dis-moi lesquels sont dans le rouge.",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

/** Articles connexes, hors article courant, priorité à la même catégorie. */
export function relatedPosts(slug: string, count = 3): BlogPost[] {
  const current = getPost(slug);
  if (!current) return BLOG_POSTS.slice(0, count);
  const sameCat = BLOG_POSTS.filter(
    (p) => p.slug !== slug && p.category === current.category,
  );
  const others = BLOG_POSTS.filter(
    (p) => p.slug !== slug && p.category !== current.category,
  );
  return [...sameCat, ...others].slice(0, count);
}

export function postUrl(slug: string): string {
  return `${SITE_URL}/blog/${slug}`;
}

// ── Données structurées JSON-LD (Schema.org) ─────────────────────────────────

const ORG = {
  "@type": "Organization",
  name: "Biltia",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  description:
    "Biltia est l'OS conversationnel du BTP : décrivez votre problème, Biltia livre la solution (document, application, réponse ou automatisation).",
};

/** BlogPosting pour une page d'article. */
export function articleJsonLd(post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: { "@type": "Organization", name: "Biltia" },
    publisher: ORG,
    keywords: post.keywords.join(", "),
    articleSection: post.category,
    inLanguage: "fr-FR",
    mainEntityOfPage: { "@type": "WebPage", "@id": postUrl(post.slug) },
    url: postUrl(post.slug),
  };
}

/** FAQPage : nourrit les AI Overviews et les réponses des LLM. */
export function faqJsonLd(post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** Fil d'Ariane structuré. */
export function breadcrumbJsonLd(post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: postUrl(post.slug) },
    ],
  };
}

/** Blog + liste d'articles pour la page d'index. */
export function blogJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Le blog Biltia",
    description:
      "Conseils, guides et comparatifs pour les artisans et entreprises du BTP : productivité, outils, gestion et découverte de Biltia.",
    url: `${SITE_URL}/blog`,
    publisher: ORG,
    inLanguage: "fr-FR",
    blogPost: BLOG_POSTS.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      datePublished: p.date,
      url: postUrl(p.slug),
    })),
  };
}
