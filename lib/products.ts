// ─────────────────────────────────────────────────────────────────────────────
// CATALOGUE PRODUITS (marketing, client-safe).
// Alimente le dropdown « Produits » de la nav, les cartes de la landing et les
// pages produit dédiées /produits/[slug].
// ─────────────────────────────────────────────────────────────────────────────

export type Product = {
  slug: string;
  name: string;
  /** Phrase courte pour le dropdown. */
  tagline: string;
  /** Clé d'icône lucide (résolue dans components/site.tsx). */
  icon: string;
  /** Deux arrêts de dégradé (from, to) pour l'accent du produit. */
  accent: [string, string];
  /** Titre du hero de la page produit. */
  hero: string;
  /** Sous-titre du hero. */
  sub: string;
  /** Puces de valeur. */
  features: { title: string; body: string }[];
  /** Exemples de demandes (pré-remplissent la barre). */
  examples: string[];
};

export const PRODUCTS: Product[] = [
  {
    slug: "documents",
    name: "Documents intelligents",
    tagline: "Avenants, PV, devis, courriers, prêts à signer",
    icon: "FileText",
    accent: ["#6366F1", "#A855F7"],
    hero: "Le bon document, dicté en 30 secondes.",
    sub: "Avenant, PV de réception, devis, mise en demeure, attestation, courrier. Biltia le rédige, le calcule et le prépare à la signature.",
    features: [
      { title: "Conforme au métier", body: "Structure, mentions légales et calculs HT/TVA/TTC corrects selon le type de document." },
      { title: "Prêt à signer", body: "Bouton Imprimer / Enregistrer en PDF, et pavés de signature tactiles du bout du doigt." },
      { title: "Pré-rempli", body: "Biltia reprend les données de votre workspace : clients, chantiers, tarifs." },
    ],
    examples: [
      "Sors-moi l'avenant pour 45 m² de carrelage validé à 42 €/m² sur le chantier Villa Dumont.",
      "Rédige une mise en demeure pour la facture 2026-014 impayée depuis 45 jours.",
      "PV de réception des travaux du chantier rue Neuve, sans réserve.",
    ],
  },
  {
    slug: "applications",
    name: "Applications sur mesure",
    tagline: "Des outils métier générés en secondes",
    icon: "LayoutGrid",
    accent: ["#A855F7", "#EC4899"],
    hero: "Votre outil, exactement comme vous le voulez.",
    sub: "Suivi de chantiers, pointage des heures, inventaire, planning. Décrivez votre besoin, Biltia génère l'application, accessible depuis le chantier.",
    features: [
      { title: "En quelques secondes", body: "Une description en français suffit. Pas de menus, pas de configuration." },
      { title: "Modifiable à la voix", body: "Ajoutez une colonne, une alerte, une signature. Dites-le, c'est fait." },
      { title: "Reliée au workspace", body: "Vos apps partagent les mêmes clients, chantiers et équipes." },
    ],
    examples: [
      "Je veux un suivi de mes chantiers avec le client, l'avancement en % et le reste à facturer.",
      "Un tableau de pointage des heures par ouvrier et par chantier, avec heures sup.",
      "Un inventaire de mon matériel avec état, chantier affecté et prochain contrôle.",
    ],
  },
  {
    slug: "automatisations",
    name: "Automatisations",
    tagline: "Vérifications, rapprochements, workflows",
    icon: "Zap",
    accent: ["#EC4899", "#FB923C"],
    hero: "Les corvées répétitives, en pilote automatique.",
    sub: "Contrôle de prix, rapprochement de bons de livraison, relances. Biltia traite vos lots de fichiers et signale ce qui cloche.",
    features: [
      { title: "Traitement par lot", body: "Glissez vos bons de livraison ou factures, Biltia les vérifie d'un coup." },
      { title: "Détection d'écarts", body: "Prix incohérents, références inconnues, doublons : rien ne passe." },
      { title: "Déclenché par une phrase", body: "Aucune règle à programmer. Décrivez le contrôle, Biltia l'exécute." },
    ],
    examples: [
      "Vérifie les prix de ces 30 bons de livraison par rapport à mes devis et signale les écarts.",
      "Compare ces factures fournisseurs avec mes commandes et détecte les doublons.",
      "Relance automatiquement les devis sans réponse depuis 15 jours.",
    ],
  },
  {
    slug: "analyse",
    name: "Analyse de documents",
    tagline: "Devis, factures et plans, lus et résumés",
    icon: "ScanLine",
    accent: ["#FB923C", "#F43F5E"],
    hero: "Vos documents, compris en un instant.",
    sub: "Devis, factures, plans, PDF : Biltia les lit, en extrait l'essentiel et répond à vos questions dessus.",
    features: [
      { title: "Extraction fiable", body: "Montants, échéances, quantités, références : l'essentiel remonte automatiquement." },
      { title: "Questions en langage naturel", body: "Demandez ce que vous voulez savoir sur un document, obtenez la réponse." },
      { title: "Alimente le workspace", body: "Les données extraites enrichissent la mémoire de l'entreprise." },
    ],
    examples: [
      "Analyse ce devis fournisseur et dis-moi si les prix sont cohérents avec le marché.",
      "Extrais les échéances et montants de ces 12 factures.",
      "Résume ce CCTP et liste les postes à chiffrer.",
    ],
  },
  {
    slug: "copilote",
    name: "Copilote & réponses",
    tagline: "Répond à vos questions sur vos données",
    icon: "MessageCircle",
    accent: ["#22D3EE", "#6366F1"],
    hero: "Une question ? Une réponse, tout de suite.",
    sub: "Quels chantiers sont en retard ? Combien me doit ce client ? Biltia interroge votre workspace et répond, sourcé sur vos vraies données.",
    features: [
      { title: "Appuyé sur vos données", body: "Les réponses viennent de votre workspace, pas d'un modèle générique." },
      { title: "Métier BTP natif", body: "DOE, situations, retenue de garantie, RGE : Biltia parle votre langue." },
      { title: "Toujours à jour", body: "Chaque demande s'appuie sur ce que vous avez enregistré la veille." },
    ],
    examples: [
      "Quels chantiers sont en retard cette semaine et lesquels dépassent leur budget ?",
      "Combien me doit encore le client de la Résidence des Prés ?",
      "Quelles attestations de mes sous-traitants expirent dans le mois ?",
    ],
  },
  {
    slug: "workspace",
    name: "Workspace unifié",
    tagline: "La mémoire de votre entreprise",
    icon: "FolderKanban",
    accent: ["#6366F1", "#22D3EE"],
    hero: "La mémoire irremplaçable de votre entreprise.",
    sub: "Clients, chantiers, documents, équipes, applications et historique, centralisés. Plus vous utilisez Biltia, plus il comprend votre activité.",
    features: [
      { title: "Tout relié", body: "Un client, ses chantiers, ses documents et ses factures, connectés entre eux." },
      { title: "Sécurisé et isolé", body: "Vos données sont hébergées en France et strictement isolées par entreprise." },
      { title: "Qui grandit avec vous", body: "Chaque résolution enrichit la mémoire et rend Biltia plus pertinent." },
    ],
    examples: [
      "Montre-moi tout l'historique du chantier Villa Dumont.",
      "Ajoute ce nouveau client et rattache-lui le chantier rue Neuve.",
      "Quels documents manquent sur le chantier École Bellevue ?",
    ],
  },
];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}
