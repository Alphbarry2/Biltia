// ─────────────────────────────────────────────────────────────────────────────
// CATALOGUE PRODUITS (marketing, client-safe).
// Alimente le dropdown « Produits » de la nav, les cartes de la landing et les
// pages produit dédiées /produits/[slug].
// ─────────────────────────────────────────────────────────────────────────────

import type { Locale } from "@/lib/i18n/config";

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
    slug: "agents",
    name: "Agents autonomes",
    tagline: "Des agents IA qui exécutent vos tâches récurrentes et vous rendent compte de chaque action.",
    icon: "Bot",
    accent: ["#7C3AED", "#22D3EE"],
    hero: "Dites-le une fois. C'est fait tous les jours.",
    sub: "Relances clients, contrôles du soir, rappels d'échéances : confiez la mission une seule fois, Biltia l'exécute seul, en temps et en heure, et vous rend compte.",
    features: [
      { title: "Recruté en une phrase", body: "« Relance mes devis sans réponse tous les jours à 9 h. » C'est tout : l'agent est au travail dès le lendemain." },
      { title: "Fiable et transparent", body: "Chaque passage est tracé dans un journal. S'il lui manque une info (un email, un numéro), il vous la demande au lieu d'inventer." },
      { title: "Sous votre contrôle", body: "Pause, reprise, suppression en un clic. Le coût est annoncé au recrutement et débité au réel, jamais de surprise." },
    ],
    examples: [
      "Relance le client Martin tous les jours à midi jusqu'à sa réponse.",
      "Chaque soir à 18 h, vérifie mes factures impayées et fais-moi le point.",
      "Préviens-moi dès qu'un document d'un sous-traitant expire.",
    ],
  },
  {
    slug: "documents",
    name: "Documents intelligents",
    tagline: "Devis, avenants, procès-verbaux et courriers générés à partir de vos informations.",
    icon: "FileText",
    accent: ["#6366F1", "#A855F7"],
    hero: "Le bon document, dicté en 30 secondes.",
    sub: "Avenant, PV de réception, devis, mise en demeure, attestation, courrier. Biltia le rédige, le calcule et le prépare à la signature.",
    features: [
      { title: "Conforme au métier", body: "Structure, mentions légales et calculs HT/TVA/TTC corrects selon le type de document." },
      { title: "Prêt à signer", body: "Bouton Imprimer / Enregistrer en PDF, et pavés de signature tactiles du bout du doigt." },
      { title: "Pré-rempli", body: "Biltia reprend les données de la mémoire de votre entreprise : clients, chantiers, tarifs." },
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
    tagline: "Des outils métier adaptés à votre façon de travailler, créés à partir d'une simple demande.",
    icon: "LayoutGrid",
    accent: ["#A855F7", "#EC4899"],
    hero: "Votre outil, exactement comme vous le voulez.",
    sub: "Suivi de chantiers, pointage des heures, inventaire, planning. Décrivez votre besoin, Biltia génère l'application, accessible depuis le chantier.",
    features: [
      { title: "En quelques secondes", body: "Une description en français suffit. Pas de menus, pas de configuration." },
      { title: "Modifiable à la voix", body: "Ajoutez une colonne, une alerte, une signature. Dites-le, c'est fait." },
      { title: "Reliée à votre entreprise", body: "Vos apps partagent les mêmes clients, chantiers et équipes." },
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
    tagline: "Des tâches déclenchées automatiquement selon vos règles, vos dates et vos données.",
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
    tagline: "Vos devis, factures, plans et PDF sont lus, vérifiés et résumés.",
    icon: "ScanLine",
    accent: ["#FB923C", "#F43F5E"],
    hero: "Vos documents, compris en un instant.",
    sub: "Devis, factures, plans, PDF : Biltia les lit, en extrait l'essentiel et répond à vos questions dessus.",
    features: [
      { title: "Extraction fiable", body: "Montants, échéances, quantités, références : l'essentiel remonte automatiquement." },
      { title: "Questions en langage naturel", body: "Demandez ce que vous voulez savoir sur un document, obtenez la réponse." },
      { title: "Alimente la mémoire de l'entreprise", body: "Les données extraites enrichissent la mémoire de l'entreprise." },
    ],
    examples: [
      "Analyse ce devis fournisseur et dis-moi si les prix sont cohérents avec le marché.",
      "Extrais les échéances et montants de ces 12 factures.",
      "Résume ce CCTP et liste les postes à chiffrer.",
    ],
  },
  {
    slug: "copilote",
    name: "Réponses instantanées",
    tagline: "Posez des questions sur vos clients, vos chantiers, vos devis et votre activité.",
    icon: "MessageCircle",
    accent: ["#22D3EE", "#6366F1"],
    hero: "Une question ? Une réponse, tout de suite.",
    sub: "Quels chantiers sont en retard ? Combien me doit ce client ? Biltia interroge la mémoire de votre entreprise et répond, sourcé sur vos vraies données.",
    features: [
      { title: "Appuyé sur vos données", body: "Les réponses viennent de la mémoire de votre entreprise, pas d'un modèle générique." },
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
    name: "Mémoire de l'entreprise",
    tagline: "Toutes les informations de votre entreprise sont reliées et réutilisables.",
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

// ─────────────────────────────────────────────────────────────────────────────
// TRADUCTIONS EN — textes anglais (US) par slug. Seuls les champs texte sont
// traduits ; slug / icon / accent restent partagés avec la source FR ci-dessus.
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_EN: Record<
  string,
  {
    name: string;
    tagline: string;
    hero: string;
    sub: string;
    features: { title: string; body: string }[];
    examples: string[];
  }
> = {
  agents: {
    name: "Autonomous agents",
    tagline: "AI agents that run your recurring tasks and report back on every action.",
    hero: "Say it once. It gets done every day.",
    sub: "Client follow-ups, evening checks, deadline reminders: hand over the job just once, and Biltia runs it on its own, right on time, and reports back to you.",
    features: [
      { title: "Hired in one sentence", body: "\"Follow up on my unanswered quotes every day at 9am.\" That's it: the agent is on the job the very next morning." },
      { title: "Reliable and transparent", body: "Every run is recorded in a log. If it's missing a detail (an email, a number), it asks you instead of making something up." },
      { title: "Under your control", body: "Pause, resume, or delete in one click. The cost is stated when you hire it and billed as you go, with no surprises." },
    ],
    examples: [
      "Follow up with client Martin every day at noon until they reply.",
      "Every evening at 6pm, check my unpaid invoices and give me the rundown.",
      "Let me know the moment a subcontractor's document expires.",
    ],
  },
  documents: {
    name: "Smart documents",
    tagline: "Quotes, change orders, sign-off reports and letters generated from your own information.",
    hero: "The right document, dictated in 30 seconds.",
    sub: "Change order, handover sign-off, quote, formal notice, certificate, letter. Biltia writes it, runs the numbers, and gets it ready to sign.",
    features: [
      { title: "Built for the trade", body: "Correct structure, legal wording, and net/VAT/gross calculations for each type of document." },
      { title: "Ready to sign", body: "Print / Save as PDF button, plus signature blocks you can sign right on screen with your finger." },
      { title: "Pre-filled", body: "Biltia pulls in your company's memory: clients, job sites, pricing." },
    ],
    examples: [
      "Draw up the change order for 45 sq m of tiling approved at €42/sq m on the Villa Dumont job.",
      "Draft a formal notice for invoice 2026-014, unpaid for 45 days.",
      "Handover sign-off for the completed work on the rue Neuve job, with no outstanding items.",
    ],
  },
  applications: {
    name: "Custom applications",
    tagline: "Business tools shaped around how you work, built from a simple request.",
    hero: "Your tool, exactly the way you want it.",
    sub: "Job tracking, timesheets, inventory, scheduling. Describe what you need and Biltia builds the app, ready to use from the job site.",
    features: [
      { title: "In just seconds", body: "A plain-English description is all it takes. No menus, no setup." },
      { title: "Editable by voice", body: "Add a column, an alert, a signature. Just say it, and it's done." },
      { title: "Connected to your business", body: "Your apps share the same clients, job sites, and crews." },
    ],
    examples: [
      "I want a job tracker with the client, percent complete, and amount left to invoice.",
      "A timesheet by worker and by job site, with overtime.",
      "An inventory of my equipment with condition, assigned job site, and next inspection.",
    ],
  },
  automatisations: {
    name: "Automations",
    tagline: "Tasks triggered automatically by your rules, dates and data.",
    hero: "The repetitive grunt work, on autopilot.",
    sub: "Price checks, delivery-note reconciliation, follow-ups. Biltia processes your batches of files and flags whatever's off.",
    features: [
      { title: "Batch processing", body: "Drop in your delivery notes or invoices, and Biltia checks them all at once." },
      { title: "Discrepancy detection", body: "Off prices, unknown references, duplicates: nothing slips through." },
      { title: "Triggered by a sentence", body: "No rules to program. Describe the check, and Biltia runs it." },
    ],
    examples: [
      "Check the prices on these 30 delivery notes against my quotes and flag any discrepancies.",
      "Compare these supplier invoices with my orders and spot the duplicates.",
      "Automatically follow up on quotes with no reply for 15 days.",
    ],
  },
  analyse: {
    name: "Document analysis",
    tagline: "Your quotes, invoices, plans and PDFs, read, checked and summarized.",
    hero: "Your documents, understood in an instant.",
    sub: "Quotes, invoices, plans, PDFs: Biltia reads them, pulls out what matters, and answers your questions about them.",
    features: [
      { title: "Reliable extraction", body: "Amounts, due dates, quantities, references: the essentials surface automatically." },
      { title: "Questions in plain language", body: "Ask whatever you need to know about a document and get the answer." },
      { title: "Feeds your company's memory", body: "The extracted data enriches your company's memory." },
    ],
    examples: [
      "Analyze this supplier quote and tell me whether the prices are in line with the market.",
      "Pull the due dates and amounts from these 12 invoices.",
      "Summarize this technical spec (CCTP) and list the line items to price.",
    ],
  },
  copilote: {
    name: "Instant answers",
    tagline: "Ask questions about your clients, your job sites, your quotes and your activity.",
    hero: "Got a question? An answer, right away.",
    sub: "Which jobs are behind schedule? How much does this client owe me? Biltia queries your company's memory and answers, sourced from your real data.",
    features: [
      { title: "Grounded in your data", body: "Answers come from your company's memory, not a generic model." },
      { title: "Native to the building trade", body: "DOE (as-builts), progress billing, retention, RGE: Biltia speaks your language." },
      { title: "Always current", body: "Every request draws on what you logged the day before." },
    ],
    examples: [
      "Which jobs are behind schedule this week and which ones are over budget?",
      "How much does the Résidence des Prés client still owe me?",
      "Which of my subcontractors' certificates expire within the month?",
    ],
  },
  workspace: {
    name: "Company memory",
    tagline: "All your company's information, connected and reusable.",
    hero: "Your company's irreplaceable memory.",
    sub: "Clients, job sites, documents, crews, applications, and history, all in one place. The more you use Biltia, the better it understands your business.",
    features: [
      { title: "Everything connected", body: "A client, their job sites, their documents, and their invoices, all linked together." },
      { title: "Secure and isolated", body: "Your data is hosted in France and strictly isolated per company." },
      { title: "Grows with you", body: "Every task you resolve enriches the memory and makes Biltia more relevant." },
    ],
    examples: [
      "Show me the full history of the Villa Dumont job.",
      "Add this new client and link the rue Neuve job to them.",
      "Which documents are missing on the École Bellevue job?",
    ],
  },
};

/** Produit avec ses textes traduits si l'interface est en anglais. */
export function localizeProduct(p: Product, locale: Locale): Product {
  if (locale !== "en") return p;
  const en = PRODUCT_EN[p.slug];
  return en ? { ...p, ...en } : p;
}
