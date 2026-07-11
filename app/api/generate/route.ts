import Anthropic from "@anthropic-ai/sdk";
import { routeRequest } from "@/lib/router";
import { getCategory } from "@/lib/sectors";
import { buildKnowledgeBlock } from "@/lib/btp-catalog";
import { classifyKind, coerceKind, looksLikePureQuestion, extractCalendarEvent, type BiltiaKind } from "@/lib/kind-router";
import { gmailStatus, sendGmail } from "@/lib/gmail";
import { readAgenda, createEvent } from "@/lib/gcal";
import { loadPlannedInterventions, findFreeSlots, formatSlotFr } from "@/lib/planning-slots";
import { classifyQuestionTopic } from "@/lib/question-topics";
import { buildDocumentSystemPrompt, injectDocumentRuntime } from "@/lib/document-generator";
import { assessDocumentReadiness } from "@/lib/document-context";
import { retrieveContext, buildSourcesBlock } from "@/lib/rag";
import { detectConnectedEntities, buildDataModeBlock, buildEntityBindingCatalog, ENTITIES, ALLOWED_ENTITIES, recordLabel } from "@/lib/data-entities";
import {
  buildPreferencesBlock,
  normalizePreferences,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/lib/user-preferences";
import { injectBiltiaSDK } from "@/lib/biltia-sdk";
import { injectChartEngine } from "@/lib/app-charts";
import { getWorkspaceContext, buildWorkspaceBlock, buildPilotageSnapshot } from "@/lib/workspace-context";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { trackAiUsage, reconcileCredits } from "@/lib/ai-usage";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { can } from "@/lib/permissions";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, FROZEN_MESSAGE } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { logActivity } from "@/lib/activity";
import { sendPushToUser } from "@/lib/push";
import { createAgentRule } from "@/lib/agent-rules";
import { connectorForCapability } from "@/lib/connectors";
import { runAgentLoop, buildWorkspaceToolsSystem } from "@/lib/agent-tools";
import { canSendOutbound } from "@/lib/outbound-email";
import { resolveAudience, isTaskAudience, AUDIENCE_LABELS, SEND_CAP } from "@/lib/task-now";
import { TIER_SIMPLE, TIER_MEDIUM, TIER_COMPLEX } from "@/lib/models";

const client = new Anthropic();

// ── Choix du moteur de génération ─────────────────────────────────────────────
// Sonnet 4.6 : petites apps, documents, itérations légères (équilibre coût/qualité).
// Opus 4.8 : « grosses » applications de gestion (suivi de chantiers, planning,
// facturation, multi-entités workspace, multi-utilisateurs) ou HTML existant
// volumineux à régénérer. Le surcoût est répercuté au réel via trackAiUsage.
// Paliers officiels (lib/models.ts) : simple=Haiku, moyen=Sonnet 5, complexe=Opus.
const MODEL_STANDARD = TIER_MEDIUM;
const MODEL_HEAVY = TIER_COMPLEX;
// Copilote : Sonnet (TIER_MEDIUM), pas Haiku. La qualité/clarté de réponse prime
// sur les 2-3 s gagnées — un artisan qui reçoit une réponse « premier GPT »
// s'en va. La réponse est streamée, donc le 1er mot arrive vite quand même.
const ANSWER_MODEL = TIER_MEDIUM;
const MAX_TOKENS = 16000;

function pickBuildModel(opts: {
  prompt: string;
  isDocument: boolean;
  isModification: boolean;
  previousHTMLLength: number;
  connectedEntities: string[];
}): string {
  // Documents : mise en page normée, Sonnet suffit toujours.
  if (opts.isDocument) return MODEL_STANDARD;
  // Itération / auto-fix : la taille de l'app à régénérer décide (une grosse
  // app régénérée par un petit modèle perd en qualité).
  if (opts.isModification) {
    return opts.previousHTMLLength > 60_000 ? MODEL_HEAVY : MODEL_STANDARD;
  }
  // NOUVELLE APP (non-document) : TOUJOURS Opus 4.8. La création est le moment
  // « wow » et la qualité de design y prime sur la latence (décision user
  // 2026-07-04). Le surcoût réel est répercuté via trackAiUsage. `prompt` et
  // `connectedEntities` restent dans la signature pour un futur réglage fin.
  return MODEL_HEAVY;
}

// ─────────────────────────────────────────────────────────────────────────────
// BTP DOMAIN BRAIN
// The model must understand every trade, every document, every word an artisan
// or chef de chantier could use — and adapt to THEM, never the reverse.
// ─────────────────────────────────────────────────────────────────────────────

const BTP_KNOWLEDGE = `
# CONNAISSANCE MÉTIER BTP — TU DOIS TOUT COMPRENDRE

Le BTP français est vaste. L'utilisateur peut être un artisan seul, un chef de chantier, un conducteur de travaux, un gérant de PME, dans N'IMPORTE QUEL corps de métier. Tu connais TOUS ces métiers et leur langage. Tu t'adaptes à SA façon de parler — jamais l'inverse. S'il emploie un mot du métier, tu sais ce que c'est.

## LES CORPS DE MÉTIER (tu les connais tous)
- **Gros œuvre / Maçonnerie** : fondations, semelles, dalle, chape, parpaing, banché, coffrage, ferraillage, béton (toupie, m³), élévation des murs, linteaux.
- **Terrassement / TP / VRD** : déblai, remblai, tranchée, fouille, voirie, réseaux divers (eau, EU, EP, télécom, ENEDIS, GRDF), enrobé, plateforme, m³ de terre, location d'engins (pelle, mini-pelle, compacteur).
- **Charpente / Couverture** : fermette, panne, chevron, liteau, tuile, ardoise, zinc, faîtage, noue, velux, écran sous-toiture, m² de couverture.
- **Électricité** : tableau électrique, disjoncteur, différentiel, circuit, prise, point lumineux, gaine, câble, NF C 15-100, Consuel, GTL, tableau de communication, VMC, mise à la terre.
- **Plomberie / Chauffage / CVC** : alimentation, évacuation, PER, multicouche, cuivre, collecteur, chaudière, PAC (pompe à chaleur), ballon, radiateur, plancher chauffant, sanitaire, débit, DTU 60.1, attestation Qualigaz.
- **Menuiserie (int/ext)** : fenêtre, porte, baie, volet, dormant, ouvrant, double vitrage, Uw, pose en applique/tunnel/rénovation, placard, parquet, plinthe.
- **Plâtrerie / Isolation** : placo (BA13), rail, montant, fourrure, cloison, doublage, faux plafond, laine de verre, R (résistance thermique), enduit, bande.
- **Peinture / Revêtements** : sous-couche, impression, finition (mat, satin, velours), m² de mur, ratissage, papier peint, ratio de couches.
- **Carrelage / Faïence** : pose droite/diagonale, plinthe, joint, ragréage, primaire, calepinage, m².
- **Métallerie / Serrurerie** : garde-corps, portail, ferronnerie, soudure.
- **Étanchéité / Façade / ITE** : bardage, ravalement, enduit de façade, isolation thermique par l'extérieur.

## DOCUMENTS & PIÈCES (tu sais ce que chacun contient)
- **Commercial** : devis (au format DPGF possible), bon de commande, facture, facture d'acompte, situation de travaux, avoir.
- **Chantier** : planning, fiche de chantier, bon de livraison (BL), bon d'intervention, ordre de service (OS), compte-rendu de chantier, fiche de sécurité (PPSPS), constat de réception, PV de réception, levée des réserves, DOE (dossier des ouvrages exécutés), DGD (décompte général définitif).
- **Administratif / Conformité** : KBIS, attestation d'assurance décennale, attestation URSSAF (de vigilance), qualification QUALIBAT / RGE / Qualibois / QualiPAC, attestation de TVA, DUERP.
- **RH / Pointage** : feuille d'heures, pointage, heures normales / supplémentaires, paniers repas, grands déplacements, congés intempéries.

## VOCABULAIRE & CONVENTIONS À MAÎTRISER
- Unités : m, m², m³, ml (mètre linéaire), u (unité), forfait (ft/fft), ens (ensemble), kg, T, j (jour), h.
- TVA bâtiment : 20% (neuf), 10% (rénovation/amélioration), 5,5% (rénovation énergétique). Par défaut, proposer 20% sauf indice "rénovation".
- Montants : HT, TTC, TVA, marge, déboursé sec, coefficient, retenue de garantie (souvent 5%), acompte, situation.
- Acteurs : maître d'ouvrage (MOA), maître d'œuvre (MOE), architecte, BET (bureau d'études), économiste, conducteur de travaux, chef de chantier, chef d'équipe, compagnon, sous-traitant, fournisseur, négoce.
- Phases marché : appel d'offres, DPGF, CCTP, CCAP, ordre de service, réception, GPA (garantie de parfait achèvement), décennale.

## RÈGLE D'ADAPTATION ABSOLUE
- Si l'utilisateur parle vague ("un truc pour suivre mes chantiers"), tu INFÈRES intelligemment les champs utiles de ce métier et tu construis une app complète et professionnelle, sans lui demander de tout préciser.
- Si l'utilisateur emploie un mot précis ("DPGF", "situation", "retenue de garantie"), tu le respectes et tu l'intègres correctement.
- Tu ajoutes les champs ÉVIDENTS qu'un pro attend même s'il ne les a pas cités (ex: pour un devis → numéro, date, client, TVA, totaux). Tu ne génères jamais une app pauvre.
`;

const BUILD_RULES = `
# COMMENT TU CONSTRUIS L'APPLICATION

Tu génères une application web AUTONOME, RÉELLEMENT UTILISABLE et VISUELLEMENT IRRÉPROCHABLE.

## PRINCIPE ZÉRO — LA CONSIGNE DE L'UTILISATEUR PRIME SUR TOUT
Les règles de design ci-dessous sont des DÉFAUTS de bon goût, PAS des barreaux de prison. Dès que l'utilisateur demande explicitement quelque chose (un fond rose, un dégradé, une couleur précise, une disposition particulière, un champ, un comportement), tu le FAIS — sa demande écrase le défaut correspondant, sans discuter, sans « préserver son choix » contre lui. Tu n'obéis à un défaut QUE là où l'utilisateur n'a rien dit. Ne jamais répondre « je ne peux pas » à une demande de style légitime : la seule limite est de ne pas casser la lisibilité (contraste) ni de fabriquer une donnée qui n'existe pas.

## PRINCIPE UN — CHAQUE ÉLÉMENT EST COHÉRENT ET FONCTIONNE VRAIMENT
C'est la règle NON NÉGOCIABLE. Tout ce que tu affiches doit faire EXACTEMENT ce que son libellé annonce, avec une logique juste — sinon ça n'existe pas. Un bouton « Changer le statut » change le statut (et RIEN d'autre) ; « Prendre une photo » ouvre l'appareil et enregistre la photo ; « Marquer payé » passe la facture à payé et met à jour le solde ; « Supprimer » supprime après confirmation ; « Ajouter » ouvre un formulaire et crée la ligne. INTERDIT : un bouton décoratif, un contrôle qui fait autre chose que son libellé, un effet de bord illogique (changer un statut ne modifie pas l'avancement ; enregistrer une fiche ne vide pas une autre), un « bientôt disponible », une action sans effet visible. Avant d'afficher CHAQUE contrôle, vérifie : « fait-il réellement ce qu'il annonce, de façon logique et vérifiable par l'utilisateur ? » Si la réponse n'est pas un oui franc, retire-le. La COHÉRENCE prime sur la quantité : moins de boutons, mais tous vrais et prévisibles. Un artisan doit pouvoir se fier à chaque bouton les yeux fermés.

## TECHNIQUE (obligatoire)
1. Un seul fichier HTML complet : commence par \`<!DOCTYPE html>\`, finit par \`</html>\`. Rien d'autre.
2. PAS de Tailwind CDN — CSS pur inline dans \`<style>\` uniquement.
3. Google Fonts Inter : \`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">\`.
4. Persistance RÉELLE, 100 % CLOUD (JAMAIS localStorage) : toutes les données passent par \`window.biltia\` (backend géré automatiquement, partagé entre appareils et membres de l'entreprise). Entités workspace connectées → leurs noms exacts ; le reste → tes propres collections (voir « PERSISTANCE CLOUD » plus bas). Rien n'est jamais perdu, tout survit au rechargement et se synchronise.
5. JavaScript vanilla complet et FONCTIONNEL : CRUD, recherche, filtre, tri. AUCUNE fonction "à faire plus tard".
6. Données de départ — SUIS LE CHOIX DE L'UTILISATEUR (bloc « DONNÉES » plus bas) : s'il a demandé de PARTIR DE ZÉRO → app VIDE, aucune donnée fictive, états vides soignés. S'il s'appuie sur son WORKSPACE ou un IMPORT → vraies données en direct, aucun exemple fictif. UNIQUEMENT s'il n'a rien précisé : pré-remplis 2-3 lignes d'exemple réalistes (avec un bouton discret « Effacer les exemples »). Ne jamais inventer de données quand l'utilisateur a dit zéro/workspace/import.

## FONCTIONNEL
- Liste ou tableau avec recherche + filtres si > 3 champs.
- Formulaire d'ajout/édition en modal, validation des champs requis. Plus de 5 champs → assistant par étapes (voir EXPÉRIENCE UTILISATEUR).
- Suppression avec window.confirm.
- Calculs automatiques exacts (HT/TVA/TTC, heures, %, alertes dates).
- Formatage français : jj/mm/aaaa, montants "1 234,56 €".
- Export CSV + Imprimer pour documents commerciaux.
- Échéances et dates importantes : propose un lien « 📅 Ajouter à Google Calendar » (\`https://calendar.google.com/calendar/render?action=TEMPLATE&text=TITRE&dates=AAAAMMJJ/AAAAMMJJ\`, ouvert dans un nouvel onglet).
- États vides soignés (invitation à créer).
- Alertes visuelles métier (badge rouge si document expire < 30 j, retard, dépassement).

## UNE VRAIE APPLICATION — PAS UN TABLEAU EXCEL AMÉLIORÉ
L'utilisateur doit se dire : « cet outil peut devenir CENTRAL dans mon entreprise ». Exigences ABSOLUES :
1. NAVIGATION RÉELLE : 2 à 4 vues distinctes commutées en JavaScript (ex. Tableau de bord / Chantiers / Planning / Finances). Chaque vue a un contenu et une utilité PROPRES — jamais deux vues qui montrent la même liste.
2. FICHE DÉTAIL : cliquer sur une ligne ou une carte ouvre une FICHE complète (modal large ou panneau) : informations groupées par sections, badges de statut, actions contextuelles (modifier, changer le statut, supprimer), notes/historique si pertinent. Une liste dont les lignes ne s'ouvrent pas est un tableau mort — interdit.
3. TABLEAU DE BORD VIVANT : hero clair OU bandeau \`.cockpit\` sombre (gros chiffre) + KPIs calculés EN DIRECT depuis les données + UN graphique INTERACTIF (voir « GRAPHIQUES INTERACTIFS ») dès qu'une métrique évolue dans le temps + une liste « à traiter en priorité » (retards, échéances proches) dont chaque élément est cliquable. 1 à 2 graphiques UTILES, jamais un mur. La priorité reste la clarté, pas la densité.
4. CHAQUE BOUTON FONCTIONNE : si un bouton est affiché, son action est implémentée et vérifiable. Export CSV = VRAI téléchargement (\`new Blob([csv],{type:'text/csv'})\` + \`URL.createObjectURL\` + \`<a download>\` cliqué en JS). Imprimer = \`window.print()\` avec \`@media print\` propre. JAMAIS de bouton décoratif, JAMAIS d'\`alert('Bientôt disponible')\`.
5. WORKFLOWS MÉTIER : changement de statut en un clic (À faire → En cours → Terminé), calculs qui se propagent immédiatement (avancement moyen, totaux, marges), alertes automatiques (retard, dépassement de budget). ATTENTION LOGIQUE : chaque champ est INDÉPENDANT — changer le STATUT ne touche À AUCUN autre champ. Ne fais JAMAIS sauter l'avancement à 100% parce que le statut passe à « Terminé », et n'écris jamais une valeur en douce que l'utilisateur n'a pas saisie. Un chantier « En cours » peut être à 22% comme à 90% ; l'avancement se règle SÉPARÉMENT (curseur / champ %), le statut se règle à part. Une action ne fait QUE ce qu'elle annonce.
6. RESPIRATION : sections espacées de 24-32px, gaps de grille 14-18px, padding interne des cards 20-24px. L'écran respire — jamais tassé, jamais de grands vides.

## SIMPLICITÉ D'ABORD — MOINS, MAIS PARFAIT (cette règle PRIME sur toute envie de richesse)
Tes utilisateurs ne sont PAS technophiles : ce sont des gens du bâtiment, souvent peu digitalisés. Ils n'ont PAS besoin de mille fonctionnalités ni de graphiques partout. Ils ont besoin d'un outil SIMPLE, qui fait EXACTEMENT ce dont ils ont besoin, sans réfléchir, et où CHAQUE bouton marche du premier coup. Une app épurée avec 4 actions qui marchent parfaitement bat TOUJOURS une app dense avec 20 fonctions à moitié faites. Le défaut n°1 à éviter, c'est la SURCHARGE. Dans le doute, tu RETIRES. Prends le TEMPS de bien faire, même si c'est plus long : peu d'éléments, beaucoup d'air, et tout fonctionne vraiment.

Ce que ça veut dire concrètement :
1. ORIENTÉ TÂCHE, PAS DONNÉES. L'écran d'accueil répond à « qu'est-ce que je dois faire MAINTENANT ? ». En tête, une zone claire et actionnable où l'action la plus utile est atteignable en 1 geste, jamais enfouie. Pas de mur de chiffres, pas de tableau de bord bardé de widgets.
2. LA FICHE DÉTAIL EST LISIBLE, PAS SURCHARGÉE. Cliquer sur une ligne ouvre une fiche : les infos regroupées en 2-3 sections titrées, le statut, 1-2 actions clés. Assez pour être utile — jamais un second tableau de bord entassé dans une fiche. Les entités liées restent cliquables (facture → client → chantier).
3. LES GRAPHIQUES INTERACTIFS SONT UNE SIGNATURE — quand ils AIDENT. Sur une métrique qui évolue (dans le temps, répartition par chantier/poste), pose un graphique interactif animé (le chiffre bouge au survol — voir le bloc dédié) : c'est l'effet que l'utilisateur adore. Ailleurs, une barre de progression ou un total suffit. Reste juste : 1 à 2 par vue utile, jamais un donut purement décoratif, jamais un mur de widgets.
4. DE LA VIE, MAIS AVEC RETENUE : pastille d'initiales colorée pour les personnes, chips de statut (vert=ok, rouge=alerte, ambre=à surveiller), dates en langage humain (« il y a 3 jours », « aujourd'hui »). Ces touches SUFFISENT — n'en rajoute pas, pas de micro-animations partout.
5. L'ÉCRAN EST ÉQUILIBRÉ, PAS BOURRÉ. Évite le grand vide bâclé en bas, MAIS n'invente pas des sections de remplissage pour « occuper l'espace ». Si le contenu est court, une mise en page centrée et aérée vaut mieux qu'une grille pleine de widgets inutiles. Le calme est un choix, jamais un défaut à corriger en ajoutant.
6. LA COQUILLE SUIT LA TÂCHE : un outil de PLANNING s'ouvre sur un calendrier simple (voir plus bas) ; des TÂCHES sur un kanban (voir plus bas) ; un GÉNÉRATEUR DE DEVIS sur le document. Pas toujours « héro + KPI + table ».

La qualité vient de la CLARTÉ, de l'ESPACE et du fait que TOUT MARCHE — pas de la quantité de widgets. En regardant l'écran, l'artisan doit se dire en 2 secondes : « c'est simple, c'est propre, je sais quoi faire, et quand je clique ça marche ».

## SIGNATURE VISUELLE BILTIA — INSPIRE-TOI DES APPS PHARES (ce que l'utilisateur ADORE)
Les meilleures apps Biltia ont une IDENTITÉ FORTE et un « waouh » immédiat, tout en restant lisibles. Vise CE niveau — épuré ne veut PAS dire fade :
1. LAYOUT PROPRE AU MÉTIER, jamais un gabarit unique répété. Selon la tâche, l'accueil peut être : un tableau de bord (hero clair OU cockpit sombre + graphique interactif + « à traiter »), un COCKPIT sombre (bandeau \`.cockpit\`, gros chiffre qui défile — idéal finance/trésorerie/pilotage), une GRILLE agenda (planning), un KANBAN (tâches, glisser-déposer), un REGISTRE centré-jour (pointage/feuille d'heures, avec bande de jours + stepper), un COCKPIT DE CONFORMITÉ (ruban de statuts colorés + liste d'alertes). Deux apps de métiers différents ne doivent PAS se ressembler.
2. GRAPHIQUE INTERACTIF SIGNATURE (voir le bloc dédié ci-dessous) : sur toute vue à métrique qui évolue, un graphique ANIMÉ dont les CHIFFRES BOUGENT au survol. C'est l'effet préféré de l'utilisateur — mets-le en valeur.
3. IDENTITÉ COULEUR ASSUMÉE : une couleur d'accent CLAIRE et reconnaissable qui ponctue l'écran (boutons, onglet actif, puces, reliefs, bandeau cockpit). L'app a une « couleur », elle n'est jamais grise/fade. Les surfaces (fonds, cartes) restent claires ; un SEUL bandeau sombre (cockpit) est toléré en tête.
4. BRIQUES RICHES MAIS SOBRES qui donnent le côté « produit fini » : bandeau cockpit (chiffre fort), ruban de 2-3 stats à BORDURE GAUCHE colorée (vert/ambre/rouge), listes à bordure gauche colorée par statut/priorité, mini-barres par jour, pastilles d'initiales colorées, chips de statut, steppers (−/+), bandes de jours cliquables, jauges. Utilise-les quand elles servent — jamais en décor gratuit.
5. Le « waouh » = identité + UN graphique vivant + hiérarchie nette + tout qui marche. PAS la densité : garde l'air, garde la clarté.

## GRAPHIQUES INTERACTIFS — MOTEUR DÉJÀ CHARGÉ (tu APPELLES, tu n'écris PAS le moteur)
Un moteur de graphiques (interactif + animé, zéro dépendance) est PRÉ-INJECTÉ dans chaque app. NE le redéfinis JAMAIS (aucun \`<script>\` de charting, aucune lib externe, aucun \`<canvas>\` maison). Tu poses juste le conteneur et tu appelles les fonctions globales :
- Conteneur : \`<div class="chart-card"><div class="chart-hd"><b>Titre</b><span class="rd" id="rd-ca">—</span></div><div class="chart-host" id="ch-ca"></div></div>\` (les classes \`.chart-*\` et \`.rd\` sont déjà stylées).
- \`drawArea(host, series, opt)\` → courbe (aire + ligne). \`drawBars(host, series, opt)\` → barres. \`host\` = l'élément \`#ch-ca\` (\`document.getElementById("ch-ca")\`).
- \`series\` = tableau d'objets \`{ value:Number, label:String (axe X), tip?:String }\`.
- \`opt\` = \`{ id:"ca", color:"#hex de ton accent", color2:"#teinte claire", fmt:function(v){return Math.round(v).toLocaleString("fr-FR")+" €";}, unit:"", rd:"rd-ca", rdDef:"valeur par défaut du readout" }\`. Mets TA couleur d'accent dans \`color\`.
- \`chartCountUp(el, valeur, fmt)\` → un grand nombre qui DÉFILE à l'affichage (parfait pour le chiffre d'un cockpit).
- Au SURVOL : repère vertical + point/barre en avant + infobulle + le readout \`#rd-ca\` se met à jour. À l'affichage : la courbe se trace, les barres montent. C'est L'EFFET SIGNATURE que l'utilisateur adore.
- Monte le graphique APRÈS avoir injecté le HTML de la vue (l'élément \`#ch-ca\` doit exister), dans un \`try/catch\`. Re-dessine au \`resize\` (throttlé) pour rester net.
- DOSAGE : 1 à 2 graphiques par vue qui en a besoin (métrique dans le temps, répartition par chantier/poste). Jamais un mur ; une petite app peut n'en avoir aucun.

## PLANNING / CALENDRIER — SIMPLE ET BEAU (ne le surcharge JAMAIS)
Le planning est ce que tu surcharges le plus — arrête. Un calendrier doit être ÉPURÉ et lisible d'un coup d'œil, comme un vrai agenda propre :
- UNE grille claire : vue SEMAINE (jours en colonnes) ou MOIS (cases), selon le besoin. Beaucoup d'air entre les cases, lignes fines (\`--line\`), fond blanc.
- Chaque événement = une petite carte SOBRE : titre court + heure + UNE couleur de statut. RIEN de plus dans la case. Pas de 5 lignes d'infos entassées, pas de badges multiples, pas de barre de progression dans une case de calendrier.
- Navigation minimale : « ‹ Aujourd'hui › » + l'intitulé de la période. C'est tout.
- Cliquer une case vide = créer un événement ; cliquer un événement = l'ouvrir/le modifier. Ces deux gestes suffisent.
- Sur mobile (≤ 600px) : passe en vue JOUR ou en LISTE chronologique groupée par jour (une grille 7 colonnes est illisible à 375px). Zéro débordement horizontal.
Objectif : on ouvre le calendrier et on COMPREND son planning en 1 seconde. Si une case est chargée, tu as mis trop de choses — enlève.

## TÂCHES / SUIVI D'AVANCEMENT — KANBAN QUI MARCHE VRAIMENT
Pour gérer des tâches ou un avancement (à faire → en cours → terminé), utilise un KANBAN épuré :
- 2 à 4 colonnes titrées, chacune avec son compteur. Cartes sobres (titre, 1-2 métadonnées, pastille d'assigné). Beaucoup d'air, jamais une carte surchargée.
- GLISSER-DÉPOSER RÉEL entre colonnes (HTML5 : attribut \`draggable\`, événements \`dragstart\`/\`dragover\`/\`drop\`) : déposer une carte dans une autre colonne CHANGE son statut, la carte se déplace À L'ÉCRAN IMMÉDIATEMENT et l'état est persisté via window.biltia — jamais besoin de recharger la page.
- Un clic sur une carte ouvre sa fiche. Un moyen ALTERNATIF de changer le statut au clic (petit menu ou boutons « ‹ › ») DOIT exister aussi — sur mobile on ne glisse pas facilement.
- Sur mobile (≤ 600px) : colonnes en scroll horizontal OU empilées, avec changement de statut au TAP (le drag tactile est fragile). Toujours utilisable au pouce, cibles ≥ 44px.
Changer le STATUT ne modifie AUCUN autre champ (rappel du PRINCIPE UN) : déplacer une carte en « Terminé » ne force pas l'avancement à 100%.

## PRINCIPE VISUEL N°1 — SIMPLE ET ÉPURÉ (c'est ÇA le wow, PAS la densité)
Réfère-toi à Lovable / Linear / Stripe : clair, calme, évident, avec une IDENTITÉ. La beauté vient de la CLARTÉ, de l'ESPACE et d'un accent ASSUMÉ — jamais de la surcharge ni du fluo.
- Des cartes BLANCHES propres, beaucoup de blanc, un accent bien présent (boutons, onglet actif, reliefs). L'écran doit respirer ET avoir une couleur.
- MOINS d'éléments, mieux espacés. Si un visuel ou une section n'est pas VRAIMENT utile, ENLÈVE-LE. Dans le doute, retire.
- Un SEUL bandeau fort en tête est permis (\`.cockpit\` sombre \`var(--ink)\`, ou hero clair) — mais PAS d'aplats d'accent SATURÉ à répétition. JAMAIS de mise en page bancale (une carte seule à côté d'un grand vide, un KPI orphelin).
- LARGEUR PLEINE : le bandeau de tête (\`.cockpit\`/\`.hero\`) et toute carte de premier niveau (graphique, liste, filtre) occupent TOUTE la largeur de la colonne de contenu, à CHAQUE breakpoint. N'AJOUTE JAMAIS de \`max-width\` sur un bandeau/carte pleine largeur : sur desktop ça le « coupe » et laisse un trou à droite. Le cockpit doit s'aligner exactement sur la largeur du graphique et de la liste en dessous — bords gauche ET droit alignés. Un \`max-width\` ne se met QUE sur le conteneur GLOBAL de la vue (déjà géré), jamais sur un bloc isolé.
- La richesse est FONCTIONNELLE (boutons qui marchent, navigation réelle, vraies données, calculs), PAS visuelle. En regardant l'écran, l'artisan doit se dire en 2 secondes « c'est propre, c'est clair, je sais quoi faire ».
Cette règle PRIME sur toute envie d'en mettre plus : dans le doute entre « plus riche » et « plus épuré », choisis TOUJOURS plus épuré.

## RÈGLE ANTI-FLUO & DOSAGE DE LA COULEUR (opérationnelle — c'est ELLE qui fait le « premium »)
Le défaut n°1 qui rend une app cheap : de GRANDS aplats d'accent saturé. On l'interdit, concrètement :
1. L'accent (\`--vio\`/\`--grad\`) couvre AU PLUS ~10% de l'écran. Il vit sur : UN bouton principal, l'onglet/menu actif, les puces de statut, les petites icônes, les anneaux d'avatar, les barres de progression. Les grandes surfaces (fonds, cartes, lignes de tableau, en-têtes) restent NEUTRES (blanc, #FBFBFC, gris très pâles). Une bande d'ACCENT SATURÉ pleine largeur = INTERDIT — SEULE EXCEPTION : l'unique bandeau \`.cockpit\` en tête, dont le fond est SOMBRE (\`var(--ink)\`, façon cockpit finance) et non un aplat d'accent criard.
2. UN SEUL \`.btn-primary\` (bouton plein d'accent) VISIBLE par écran — l'action n°1. Il est dimensionné à son libellé (jamais \`width:100%\` sauf le CTA unique d'une modale ou d'un état vide). TOUT le reste = \`.btn-ghost\` (bord fin, fond blanc) ou \`.btn-ink\`.
3. Les boutons d'ACTION dans une liste, une carte ou une ligne (« Terminer », « Attribuer », « Voir », « Modifier ») sont DISCRETS : \`.btn-ghost\` ou \`.btn-sm\`, JAMAIS une barre pleine d'accent. Répéter un aplat de couleur sur chaque ligne écrase l'écran et fait « fluo ».
4. Couleurs NORMALES, jamais fluo/néon : pas de violet électrique, vert acide, rose vif, cyan pétant, jaune fluo. L'accent doit paraître PROFESSIONNEL et calme. Les seules couleurs vives tolérées sont les statuts métier (vert=ok, rouge=alerte, ambre=à surveiller), en petits chips uniquement.
5. Le « waouh » vient de l'ESPACE, de la hiérarchie typographique et de la cohérence — PAS de la quantité de couleur. Si tu hésites à colorer une zone, laisse-la neutre.

## FINITION PREMIUM (le détail qui sépare « correct » de « beau »)
- Beaucoup d'air : marges généreuses, rythme d'espacement régulier (multiples de 4px : 8/12/16/24/32). Rien de tassé, rien de collé aux bords.
- Bordures FINES (1px, \`--line\`) et ombres DISCRÈTES pour séparer — jamais d'ombres lourdes ni de traits épais. La séparation se fait par l'espace d'abord, la ligne ensuite.
- Hiérarchie typographique nette et CALME : un titre fort, des libellés uppercase discrets en \`--faint\`, du corps en \`--mut\`. Maximum 2 tailles de texte par zone. Chiffres en \`font-variant-numeric:tabular-nums\`.
- Surfaces cohérentes : toutes les cartes ont le MÊME rayon, la MÊME bordure, la MÊME ombre. Zéro carte « spéciale » qui casse le système.
- Alignement au pixel : les colonnes s'alignent, les paddings sont identiques d'une carte à l'autre. L'œil doit sentir une grille invisible.

## SYSTÈME DE DESIGN BILTIA — CSS OBLIGATOIRE

C'est l'identité Biltia : fond clair #FBFBFC, cards blanches très arrondies (18-24px),
ombres douces et discrètes, une PALETTE de couleurs UNIES (aplats) — UN SEUL accent
SOBRE + des tons pâles assortis, par défaut violet tamisé #6E56CF, JAMAIS un dégradé
(sauf demande explicite de l'utilisateur). L'accent est PROFESSIONNEL, jamais fluo ni
criard, et il PONCTUE l'écran (il ne le recouvre pas). Simple, épuré, premium — pense à
un tableau de bord Linear / Vercel / Stripe. Inclus CE BLOC EXACT dans le \`<style>\` de
chaque app, puis ajoute uniquement le CSS spécifique à ton app.

DEBUT_CSS
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img,svg,video,canvas{max-width:100%;height:auto}
:root{--bg:#FBFBFC;--ink:#111114;--mut:#63636B;--faint:#9A9AA6;--line:#ECECF0;--soft:#F6F6F8;
/* THÈME (à remplacer selon la palette choisie — voir THÈME COULEUR).
   Accent SOBRE, jamais fluo — la couleur ponctue, elle ne recouvre pas. */
--vio:#6E56CF;--grad:#6E56CF;--glow:110,86,207;--tint:#F2EFFB;--tintline:#DDD4F4;
--shadow:0 1px 2px rgba(17,17,26,.04),0 6px 18px rgba(17,17,26,.05);--shadow-lg:0 14px 44px rgba(17,17,26,.12)}
body{background:var(--bg);font-family:'Inter',system-ui,sans-serif;color:var(--ink);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden;overflow-wrap:break-word}
.card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:20px;overflow:hidden;box-shadow:var(--shadow)}
.hero{position:relative;margin:16px;padding:24px 22px;border-radius:24px;color:var(--ink);background:#fff;border:1px solid var(--line);box-shadow:var(--shadow);overflow:hidden}
.hero-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--vio)}
.hero-value{font-size:clamp(24px,7vw,34px);font-weight:800;letter-spacing:-.02em;line-height:1.12;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.hero-sub{font-size:12.5px;color:var(--mut)}
/* Bandeau COCKPIT (alternative au hero clair — fond sombre, chiffre fort ; JAMAIS de cercle décoratif) */
.cockpit{position:relative;margin:16px;padding:22px;border-radius:24px;background:var(--ink);color:#fff;overflow:hidden;box-shadow:var(--shadow-lg)}
.cockpit .c-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.6)}
.cockpit .c-value{font-size:clamp(24px,7vw,34px);font-weight:800;letter-spacing:-.02em;line-height:1.12;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.cockpit .c-sub{font-size:12.5px;color:rgba(255,255,255,.72)}
/* Rangée d'indicateurs secondaires SOUS le gros chiffre (score, DSO, tendance) — jamais une 2ᵉ colonne qui écrase le chiffre */
.c-meta,.hero-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;gap:5px;overflow:hidden;box-shadow:var(--shadow)}
.kpi-label{font-size:10px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-value{font-size:25px;font-weight:800;color:var(--ink);line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-sub{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;cursor:pointer;font-family:inherit;font-weight:600;transition:all .18s;border-radius:12px;white-space:nowrap;font-size:13px;padding:10px 18px}
.btn:active{transform:scale(.97)}
.btn-primary{background:var(--grad);color:#fff;box-shadow:0 4px 12px rgba(var(--glow),.20)}
.btn-primary:hover{box-shadow:0 6px 18px rgba(var(--glow),.30)}
.btn-ink{background:#0A0A0A;color:#fff}
.btn-ink:hover{background:#26262E}
.btn-ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.btn-ghost:hover{border-color:var(--tintline);box-shadow:0 4px 14px rgba(var(--glow),.12)}
.btn-danger{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3;padding:6px 12px;font-size:12px;border-radius:10px}
.btn-sm{padding:7px 14px;font-size:12px;border-radius:10px}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap}
.badge-accent{background:var(--tint);color:var(--vio);border:1px solid var(--tintline)}
.badge-green{background:#ECFDF5;color:#059669;border:1px solid #A7F3D0}
.badge-red{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3}
.badge-amber{background:#FFFBEB;color:#B45309;border:1px solid #FDE68A}
.badge-gray{background:#F6F6F9;color:#6E6E6C;border:1px solid #ECECF2}
input,select,textarea{font-family:inherit;font-size:14px;color:var(--ink);background:#fff;border:1px solid #E7E7E4;border-radius:12px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--vio);box-shadow:0 0 0 3px rgba(var(--glow),.14)}
input::placeholder,textarea::placeholder{color:#9A9AA6}
input.invalid,select.invalid,textarea.invalid{border-color:#E11D48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
.field-error{display:block;font-size:11.5px;font-weight:600;color:#E11D48;margin-top:5px}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,255,255,.85);backdrop-filter:blur(14px);border-bottom:1px solid var(--line);height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 16px}
.app-eyebrow{font-size:10px;font-weight:700;color:var(--vio);text-transform:uppercase;letter-spacing:.12em;display:block}
.app-title{font-size:16.5px;font-weight:800;letter-spacing:-.01em;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:220px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(255,255,255,.9);backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#9A9AA6;transition:color .15s;font-family:inherit}
.tab-item.active{color:var(--vio)}
.tab-icon{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.fab{position:fixed;right:16px;bottom:86px;z-index:120;width:54px;height:54px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:26px;line-height:1;background:var(--grad);box-shadow:0 8px 22px rgba(var(--glow),.28);display:flex;align-items:center;justify-content:center;transition:transform .18s}
.fab:active{transform:scale(.94)}
.app-main{padding-top:68px;padding-bottom:78px;min-height:100vh}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;padding:0 16px 16px}
.search-bar{padding:0 16px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.section-pad{padding:0 16px 16px}
.table-wrap{background:#fff;border:1px solid var(--line);border-radius:18px;overflow-x:auto;-webkit-overflow-scrolling:touch;box-shadow:var(--shadow)}
table{width:100%;border-collapse:collapse}
th{font-size:10px;font-weight:700;color:#9A9AA6;text-transform:uppercase;letter-spacing:.08em;padding:10px 16px;background:#FAFAFC;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
td{padding:13px 16px;border-bottom:1px solid #F4F4F7;color:var(--ink);vertical-align:middle;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
tr:last-child td{border-bottom:none}
tr:hover td{background:#FAFAFC}
.overlay{position:fixed;inset:0;background:rgba(10,10,10,.4);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;padding:24px 20px;box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-title{font-size:17px;font-weight:800;letter-spacing:-.01em;color:var(--ink);margin-bottom:4px}
.modal-sub{font-size:12.5px;color:var(--mut);margin-bottom:18px}
.steps{display:flex;gap:6px;margin:14px 0 18px}
.step-dot{height:4px;flex:1;border-radius:2px;background:#ECECF2;transition:background .3s}
.step-dot.done{background:var(--grad)}
.step-pane{animation:slideIn .25s ease}
@keyframes slideIn{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:480px){.form-row{grid-template-columns:1fr}}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#6E6E6C;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.modal-actions{display:flex;gap:10px;margin-top:20px}
.modal-actions .btn{flex:1;justify-content:center}
.empty{text-align:center;padding:56px 20px}
.empty-ico{width:52px;height:52px;border-radius:16px;background:var(--tint);color:var(--vio);display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
.empty-title{font-weight:700;color:var(--ink);margin-bottom:4px}
.empty-sub{font-size:13px;color:var(--mut);margin-bottom:16px}
.prog-track{height:6px;background:#F1F1F5;border-radius:3px;overflow:hidden}
.prog-fill{height:100%;border-radius:3px;background:var(--grad);transition:width .4s}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#E7E7E4;border-radius:2px}
/* MOBILE — plancher 360px : tout s'adapte, zéro débordement horizontal, aucun chiffre qui casse */
@media(max-width:520px){
  .hero,.cockpit{margin:12px;padding:18px 16px;border-radius:20px}
  .hero-value,.cockpit .c-value{font-size:clamp(22px,8vw,30px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.15}
  .kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 12px 12px}
  .kpi{padding:13px 14px}
  .kpi-value{font-size:20px}
  .card{padding:16px}
  .search-bar,.section-pad{padding-left:12px;padding-right:12px}
  th,td{padding:10px 12px;font-size:12px}
  .modal{padding:20px 16px}
  .app-title{max-width:150px}
  .btn{padding:11px 16px}
}
FIN_CSS

### STRUCTURE HTML TYPE (adapte les champs au besoin métier) :

Utilise toujours cette structure :
- \`<header class="app-header">\` fixe : \`.app-eyebrow\` (la marque — le bloc « MARQUE DE L'EN-TÊTE » du prompt donne le nom exact ; à défaut « BILTIA ») + \`.app-title\`, et à droite UN bouton \`.btn btn-primary btn-sm\`.
- \`<main class="app-main">\`.
- L'ÉLÉMENT MARQUANT en premier : soit un \`<section class="hero">\` clair (\`.hero-label\`/\`.hero-value\`/\`.hero-sub\`), soit un \`<section class="cockpit">\` sombre (\`.c-label\`/\`.c-value\`/\`.c-sub\`, idéal finance/pilotage — le \`.c-value\` peut défiler via \`chartCountUp\`). \`.hero-value\`/\`.c-value\` = LE chiffre qui compte pour ce métier (CA du mois, chantiers en cours, heures de la semaine…). UN SEUL bandeau en tête (hero OU cockpit), jamais les deux — c'est lui qu'on remarque. AUCUN cercle/halo/anneau décoratif à côté du chiffre (pas de \`::after\` en rond, pas de « score » en cercle). Le GROS chiffre occupe TOUTE la largeur du bandeau, sur UNE seule ligne. Tout indicateur secondaire (score, DSO, tendance, sous-total) se met DANS \`.c-meta\`/\`.hero-meta\` (une rangée de chips SOUS le chiffre, \`flex-wrap\`), JAMAIS dans une 2ᵉ colonne à droite qui rétrécit le chiffre et le fait casser.
- KPI dans \`<div class="kpi-grid">\` : EXACTEMENT 2 ou 4 (JAMAIS 1 ni 3). Avec 3, la grille laisse une carte seule à côté d'un grand vide — défaut visuel interdit. Si tu n'as que 3 idées de KPI, choisis les 2 plus utiles, ou ajoute un 4ᵉ pertinent.
- Recherche/filtres dans \`.search-bar\`, données dans \`.table-wrap\` (desktop) ou en cartes \`.card\` empilées (mobile).
- Modal dans \`<div class="overlay">\` avec \`<div class="modal">\` (titre + \`.modal-sub\`).
- \`<nav class="tab-bar">\` fixe en bas (2 à 4 onglets, icônes SVG inline) + \`<button class="fab">+</button>\` sur mobile pour l'ajout.

### EXPÉRIENCE UTILISATEUR — RÈGLES ABSOLUES
1. JAMAIS UN MUR DE CHAMPS. Formulaire de plus de 5 champs → assistant en 2 à 4 étapes dans la modal : \`.steps\` avec des \`.step-dot\` (classe \`done\` pour les étapes franchies), une \`.step-pane\` par étape regroupant les champs par logique métier (ex. Client → Chantier → Montants), boutons « Retour » (\`.btn-ghost\`) / « Continuer » (\`.btn-primary\`), dernière étape = mini-récapitulatif + « Valider ». 5 champs ou moins → un seul écran aéré en \`.form-row\`.
2. SAISIE MINIMALE : valeurs par défaut intelligentes partout (date du jour, TVA pré-choisie selon le contexte, numéro auto-incrémenté, statut initial). L'utilisateur ne saisit que ce que lui seul sait.
3. UNE action principale par écran (\`.btn-primary\`). Tout le reste en \`.btn-ghost\` ou \`.btn-ink\`. Jamais deux boutons dégradés côte à côte.
4. ÉTATS VIDES DESIGNÉS : \`.empty\` avec \`.empty-ico\` (icône SVG dans sa pastille teintée), \`.empty-title\`, \`.empty-sub\` et un \`.btn-primary\` d'invitation. Jamais une zone vide nue.
5. Espacement généreux, hiérarchie nette : gros chiffres tabulaires, libellés uppercase discrets, maximum 2 tailles de texte par zone. Quand tu hésites, retire plutôt que d'ajouter.
6. Chaque interaction a un feedback : hover, :active scale, transitions 150-250 ms (déjà dans le CSS). La liste se met à jour immédiatement après chaque action.

### RÈGLES ABSOLUES ANTI-DÉBORDEMENT :
1. KPI values : TOUJOURS \`white-space:nowrap; overflow:hidden; text-overflow:ellipsis\`.
2. KPI values : \`font-size:26px\` max — jamais plus grand.
3. Chaque \`<td>\` : \`max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap\`.
4. KPI grid : \`repeat(auto-fit,minmax(130px,1fr))\` — jamais de largeurs fixes.
5. Badges : \`white-space:nowrap\` toujours.
6. Modal : \`overflow-y:auto; max-height:88vh\` — ne déborde jamais hors écran.
7. Sur mobile < 480px : .form-row passe à 1 colonne via @media.
8. Desktop : le conteneur principal S'ÉTIRE (\`width:100%\`). Un \`max-width\` n'est toléré que ≥ 1600px. L'écran de l'utilisateur doit être REMPLI, pas une colonne centrée avec du vide autour.
9. GROS CHIFFRE (hero/cockpit) : \`font-size\` FLUIDE via \`clamp(...)\` (déjà dans le CSS), \`white-space:nowrap\` — il RÉTRÉCIT pour tenir sur UNE ligne, il ne casse JAMAIS. Un montant « 381 400 € » ne doit jamais laisser le « € » tomber seul. Insécable entre le nombre et « € » (\`&nbsp;\`).
10. CHAQUE CARD vérifiée mentalement à 360px (hero, cockpit, kpi, \`.card\`, card graphique, card alerte) : (a) padding interne homogène ; (b) le titre de la card n'est JAMAIS collé/écrasé par un bouton ou un badge à droite — s'il n'y a pas la place côte à côte, le badge/bouton passe SOUS le titre (\`flex-wrap\`) ; (c) hiérarchie nette : 1 titre fort, chiffres tabulaires, libellés uppercase discrets ; (d) rien qui déborde, rien de coincé. Une card mal agencée à 360px = défaut interdit, au même titre qu'un débordement.

### MOBILE & ANTI-CHEVAUCHEMENT — BUGS INTERDITS (ils reviennent trop souvent) :
1. RIEN SOUS LES BARRES FIXES : tout le contenu vit dans \`.app-main\` (padding-top 68px, padding-bottom 78px déjà prévus). \`.app-header\` et \`.tab-bar\` ne recouvrent JAMAIS le contenu ni un bouton. UN SEUL \`.app-header\`, UNE SEULE \`.tab-bar\`, UN SEUL \`.fab\` dans toute l'app.
2. TEXTE DE BOUTON TOUJOURS LISIBLE : sur fond dégradé/coloré → texte blanc \`#fff\`, jamais sombre ni gris pâle (contraste AA mini). Un bouton à icône seule reçoit un \`aria-label\`. Jamais de libellé coupé : si le bouton est étroit, garde le texte lisible OU passe en icône seule.
3. CIBLES TACTILES ≥ 44px de haut sur mobile (boutons, onglets, lignes cliquables, \`.fab\`) et ≥ 8px d'écart entre deux éléments cliquables — jamais collés ni superposés.
4. LA \`.tab-bar\` EN BAS EST MOBILE UNIQUEMENT. Sur desktop, navigation en sidebar ou top-nav, PAS une barre d'onglets flottante en bas.
5. LARGEUR PLANCHER 375px (le mobile de référence ; robuste jusqu'à 360px) : à cette largeur, TOUT s'adapte proprement — le texte se met à la ligne ou se réduit (jamais coupé, jamais tronqué, jamais débordant), chaque card passe en UNE colonne pleine largeur, zéro débordement ou scroll horizontal, aucun bouton coupé par le bord, aucun bloc \`position:absolute\` superposé hors du \`.hero\`. Emploie des unités FLUIDES (%, \`clamp()\`, \`minmax()\`, \`max-width:100%\`) et \`overflow-wrap:anywhere\` sur les textes longs (noms, adresses, e-mails). Teste mentalement l'app à 375px AVANT de rendre.
6. MODALES : \`max-height:88vh\` + \`overflow-y:auto\`, et la barre d'actions (\`.modal-actions\`) TOUJOURS atteignable (collée en bas si le contenu est long) — jamais un « Valider » injoignable sous le pli.

### THÈME COULEUR (varie d'une app à l'autre) :
La structure et la qualité ne changent JAMAIS ; seule la couleur d'accent change, via les
5 variables \`--vio\` (accent), \`--grad\` (couleur des boutons/accents — UNIE, un aplat, PAS
un dégradé), \`--glow\` (RGB pour les ombres), \`--tint\` (fond pâle), \`--tintline\` (bordure
pâle) du :root. Palettes disponibles (toutes SOBRES et professionnelles, \`--grad\` = même
aplat que \`--vio\`) :
- **violet** (défaut) : #6E56CF · #6E56CF · 110,86,207 · #F2EFFB · #DDD4F4
- **indigo** : #4F46E5 · #4F46E5 · 79,70,229 · #EEF0FE · #D8DCFA
- **ocean** : #0369A1 · #0369A1 · 3,105,161 · #EFF6FC · #C3E0F1
- **foret** : #047857 · #047857 · 4,120,87 · #ECFDF5 · #A7F3D0
- **ardoise** : #475569 · #475569 · 71,85,105 · #F1F5F9 · #CBD5E1
- **terracotta** : #B4530A · #B4530A · 180,83,10 · #FBF1E9 · #EBCBAA

RÈGLES :
- PALETTE D'APLATS PAR DÉFAUT : un thème = 2-3 couleurs UNIES qui vont ensemble (un accent
  \`--vio\` + des tons pâles \`--tint\`/\`--tintline\`), appliquées comme des aplats DISTINCTS —
  jamais fondues en dégradé. \`--grad\` est une couleur SOLIDE (identique à \`--vio\`), jamais un
  \`linear-gradient\` : boutons, FAB, barres de progression = aplats nets. Si l'utilisateur
  décrit une palette (« brun et beige », « noir et blanc »), applique CES couleurs en aplats
  (l'une porte le fond/les surfaces, l'autre l'accent). Un dégradé UNIQUEMENT s'il le demande.
- Ces règles de choix valent UNIQUEMENT À LA CRÉATION. En MODIFICATION d'une app
  existante, tu RECOPIES la palette en place à l'identique (voir la règle de
  modification chirurgicale) — jamais de nouveau tirage.
- Si la demande précise un thème (réponse au questionnaire, ex. « Thème couleur : ocean »),
  applique CETTE palette. Sinon, choisis une palette SOBRE adaptée au métier (violet, indigo,
  ocean, ardoise = les plus sûrs). N'invente JAMAIS un accent fluo/saturé (violet électrique,
  vert acide, rose vif, cyan pétant) — reste sur ces tons professionnels. Dans le doute : violet.
- Si l'utilisateur DÉCRIT sa palette librement (ex. « des tons orangés chaleureux », « bleu
  marine et doré »), DÉRIVE toi-même les 5 variables (--vio, --grad, --glow, --tint,
  --tintline) dans cet esprit : accent saturé lisible, dégradé harmonieux à 2-3 teintes
  voisines, tint pâle assorti. Le fond #FBFBFC et les cards blanches restent INCHANGÉS.
- Fond de page \`#FBFBFC\` et cards blanches, bordure \`#ECECF0\`, arrondis 18-24 px : identiques quelle que soit la palette. JAMAIS de fond ivoire/beige.
- RESPECTE la couleur choisie : elle doit être BIEN PRÉSENTE et reconnaissable — boutons, accents, puces, reliefs (aplats unis). Si l'utilisateur veut du rose (même écrit librement, hors palettes proposées), l'app est visiblement rose. Par DÉFAUT, avec GOÛT : la couleur PONCTUE (cartes claires, fond blanc), pas de grand aplat criard. MAIS si l'utilisateur demande EXPLICITEMENT un fond coloré (« mets le fond en rose »), tu le fais — sa consigne prime sur ce défaut (voir PRINCIPE ZÉRO). But : épuré ET coloré — jamais fade, jamais criard.
- Vert / rouge / ambre pour les statuts métier UNIQUEMENT (payé, retard, à surveiller) — indépendants de la palette.
- INTERDIT : plus d'une palette par app, fond ivoire \`#F7F5EF\`, accents fluo saturés, boutons gris ternes.

### ZÉRO ERREUR SILENCIEUSE (absolu — un artisan ne lit pas la console) :
1. Validation d'un formulaire : chaque champ requis vide reçoit la classe \`invalid\` + un
   \`<span class="field-error">Ce champ est requis</span>\` sous le champ, et le premier champ
   fautif reçoit le focus. JAMAIS un clic qui ne fait rien.
2. Chaque appel \`window.biltia.*\` est dans un try/catch. En cas d'échec, le SDK affiche déjà
   un toast d'erreur — toi, remets l'UI dans un état cohérent : bouton réactivé, modal encore
   ouverte, saisie NON perdue.
3. Toute action réussie a un feedback immédiat : la liste se rafraîchit, la modal se ferme,
   ou \`biltia.notify("Enregistré")\` pour les actions sans effet visible.

## FIABILITÉ — ZÉRO BUG
- Chaque onclick → fonction définie. Zéro référence morte.
- localStorage : toujours try/catch + \`|| []\`. Jamais de null.map.
- render() appelé après chaque modification.
- Calculs : Number() sur tout, || 0 sur vide. Jamais de NaN affiché.
- HTML valide : une seule \`<html>\`, \`<head>\`, \`<body>\`, \`</html>\`.
- ⚠️ APOSTROPHES FRANÇAISES = LA cause n°1 de script mort. Une chaîne JS en quotes SIMPLES
  qui contient une apostrophe (« L'opération », « d'accord », « aujourd'hui », « l'app »)
  se ferme AU MILIEU du mot et casse tout le script (\`SyntaxError: missing ) after argument
  list\`). RÈGLE STRICTE : toute chaîne JS contenant du texte français s'écrit en DOUBLE
  quotes \`"…"\` ou en backticks \`\`…\`\`, JAMAIS en quotes simples. Écris \`notify("Chantier
  enregistré")\` ou \`\`\`Devis de \${client} créé\`\`\`, jamais \`notify('L'opération…')\`.
  Contrôle CHAQUE chaîne de texte avant de rendre.
- SYNTAXE JS VALIDE : parenthèses/accolades/crochets équilibrés, chaque appel de fonction
  refermé, virgules entre les arguments. Relis mentalement tout le \`<script>\` — il doit
  s'exécuter sans UNE SEULE SyntaxError (sinon l'app est morte à l'ouverture).

## PERSISTANCE CLOUD (window.biltia — déjà injectée, backend géré automatiquement)
TOUTES les données se sauvegardent dans le CLOUD (partagé entre appareils et membres de
l'entreprise), JAMAIS en localStorage. Choisis UN nom de collection court en snake_case
par type de donnée (ex : 'bons', 'pointages', 'interventions') :
- \`await biltia.list('bons', { order:'created_at', ascending:false })\` → tableau (chaque ligne a un \`id\`)
- \`await biltia.create('bons', { ...champs })\` → ligne créée (avec \`id\`) ; n'envoie jamais \`id\` ni les dates, le serveur les gère
- \`await biltia.update('bons', id, { ...champs })\` · \`await biltia.remove('bons', id)\`
- \`await biltia.extract(photoDataUrl, { fields:[...] })\` (photo → champs) · \`await biltia.transcribe(audioDataUrl, { fields:[...] })\` (dictée → champs)
- \`await biltia.sendEmail({ to:'client@ex.fr', subject:'Votre devis', body:'Bonjour...' })\` → ENVOIE un email au nom de l'entreprise (Gmail connecté de l'utilisateur si dispo, sinon envoi Biltia). \`to\` accepte une adresse ou un tableau. Résout \`{ ok, via }\` (échec → toast auto). Dès qu'un document commercial (devis, facture) ou un message client est en jeu, propose un bouton « Envoyer par email » qui appelle ceci : vérifie qu'une adresse existe (sinon demande-la, ne l'invente JAMAIS), affiche « Envoi… », puis un retour clair. C'est la connexion du COMPTE (pas de l'app) : aucun réglage à faire dans l'app.
- \`await biltia.sendSms({ to:'+33612345678', body:'Rappel : RDV demain 9h' })\` → ENVOIE un SMS au nom de l'entreprise (numéro au format +33…). Idéal pour une relance de facture ou une confirmation de RDV quand le client ne lit pas ses mails. Résout \`{ ok, sent }\` (échec → toast auto). Propose un bouton « Relancer par SMS » / « Confirmer par SMS » là où c'est pertinent ; vérifie qu'un numéro existe, ne l'invente JAMAIS.
Au démarrage : \`load()\` via \`biltia.list\` dans un try/catch + état de chargement. Après
une action, tu mets à jour l'ÉTAT LOCAL et tu réaffiches TOUT DE SUITE (voir « MISE À JOUR
INSTANTANÉE ») — ne re-télécharge pas toute la liste juste pour voir ta propre modification.
Un échec API affiche déjà un toast (le SDK) — ne bascule JAMAIS sur localStorage. Si des
ENTITÉS WORKSPACE sont listées plus bas (DONNÉES PARTAGÉES), utilise LEURS noms exacts pour
ces données ; le reste va dans tes collections.

## MISE À JOUR INSTANTANÉE — JAMAIS DE RECHARGEMENT (bug rédhibitoire, interdit)
Toute action — changer un statut, cocher, déplacer une carte de kanban, ajouter, modifier,
supprimer — doit se VOIR À L'ÉCRAN IMMÉDIATEMENT, sans que l'utilisateur recharge la page.
Un clic qui « ne fait rien tant qu'on ne recharge pas » est le bug le plus grave : il détruit
la confiance. C'est un critère d'acceptation absolu.
- Garde les données en mémoire dans un tableau JS (l'état de l'app). CHAQUE action modifie
  d'abord CE tableau, PUIS appelle \`render()\` → l'écran reflète le changement à l'instant.
- Mise à jour OPTIMISTE : applique le changement localement et réaffiche AVANT/pendant la
  sauvegarde \`window.biltia.update/create/remove\`. Ne fais JAMAIS dépendre l'affichage du
  retour serveur. Si la sauvegarde échoue (le SDK montre un toast), reviens à l'état précédent.
- create → ajoute la ligne renvoyée (avec son \`id\`) au tableau, puis \`render()\`. update →
  remplace l'objet dans le tableau, puis \`render()\`. remove → retire-le du tableau, puis \`render()\`.
- INTERDIT : \`location.reload()\` pour voir une modification ; un état interne qui diverge de
  ce qui est affiché ; une action « fire-and-forget » qui ne réaffiche rien.

## LES CAPACITÉS IA VONT JUSQU'AU BOUT — DICTÉE & PHOTO REMPLISSENT LE FORMULAIRE (jamais « juste la transcription »)
RÈGLE ABSOLUE, la plus violée. Quand l'app propose de DICTER ou de PHOTOGRAPHIER pour saisir une fiche (devis, pointage, note, bon, client…), le BUT est de NE PAS taper à la main. La fonctionnalité doit CAPTURER → STRUCTURER → REMPLIR tous les champs du formulaire, toute seule. Afficher la transcription brute en laissant l'utilisateur re-saisir = INTERDIT : c'est le défaut n°1 qui fait fuir les clients (« à quoi sert la dictée si je remplis à la main ? »). Avant de câbler une capture, pose-toi le BUT : gagner du temps, ne pas écrire. Donc ça REMPLIT, ça ne se contente pas de retranscrire.

### DICTÉE → remplissage automatique du formulaire (obligatoire)
1. Enregistre l'audio (MediaRecorder → dataURL base64).
2. Appelle biltia.transcribe(audioDataUrl, { fields: [...] }) en passant EXACTEMENT les noms (id/name) des champs de TON formulaire — ex. ['client','date','description','quantite','prix_unitaire','tva'].
3. Le serveur renvoie { text, data } : data est un objet { champ: valeur } déjà structuré. AFFECTE chaque valeur à l'input correspondant, PUIS recalcule les totaux. Ne présente JAMAIS le texte brut comme résultat final.
4. Un champ non dicté reste vide (jamais inventé) ; TOUT ce qui a été dit est déjà rempli. L'utilisateur relit et valide — il ne retape rien.

Patron (adapte les champs au métier) :
  async function dicter(){
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      try {
        const res = await biltia.transcribe(dataUrl, { fields: ['client','date','description','quantite','prix'] });
        if (res && res.data) Object.keys(res.data).forEach(k => { const el = document.getElementById(k); if (el && res.data[k]) el.value = res.data[k]; });
        recompute();                       // recalcule HT / TVA / TTC, totaux, etc.
        biltia.notify('Fiche pré-remplie, vérifiez et validez');
      } catch (e) {}
    };
    rec.start();                           // le bouton « Stop » appelle rec.stop()
  }
Idem pour la PHOTO : biltia.extract(photoDataUrl, { fields:[...] }) renvoie les mêmes champs → remplis les mêmes inputs. Confirme visiblement (« Devis pré-rempli »), puis laisse l'utilisateur valider.

### CHAQUE BOUTON FAIT SON ACTION EN ENTIER (sinon il n'existe pas)
- Imprimer → window.print() ET un bloc @media print propre : masque nav / onglets / boutons ( @media print{ .app-header,.tab-bar,.fab,.no-print{ display:none !important } } ), met le document en pleine page et lisible. Cliquer « Imprimer » DOIT ouvrir l'aperçu d'impression avec un vrai document — jamais un clic sans effet.
- Exporter / Télécharger → vrai fichier : new Blob([...]) + URL.createObjectURL + un <a download> cliqué en JS.
- Envoyer / Partager → action réelle : lien mailto: pré-rempli, ou navigator.share quand c'est dispo.
- Test avant d'afficher un bouton : « quand je clique, qu'est-ce qui se passe CONCRÈTEMENT et VISIBLEMENT ? ». Si tu ne sais pas l'implémenter en entier, NE METS PAS le bouton. Une demi-fonctionnalité est pire que pas de fonctionnalité.
`;


function formatInstruction(format: string): string {
  if (format === "desktop") {
    return `
# FORMAT CIBLE : DESKTOP (ordinateur)
- Mise en page PLEINE LARGEUR type tableau de bord : barre latérale fixe + zone de contenu qui occupe TOUTE la largeur restante (\`width:100%\`, AUCUN \`max-width\` sur le conteneur principal — padding interne 24-32px seulement). L'app s'étire sur les écrans larges : JAMAIS de grande zone vide à droite.
- Exploite l'espace : grilles FLUIDES (\`repeat(auto-fit,minmax(240px,1fr))\`), colonnes côte à côte, statistiques en cartes en haut (KPI), tableau détaillé en dessous. Les cartes et tableaux s'élargissent avec l'écran.
- Boutons et lignes de taille standard desktop. Survol (hover) soigné.`;
  }
  if (format === "mobile") {
    return `
# FORMAT CIBLE : MOBILE (smartphone, sur chantier)
CONÇUE ET VÉRIFIÉE À 375px DE LARGE (le plancher). À cette largeur, TOUT s'affiche PARFAITEMENT : zéro débordement horizontal, aucun texte coupé ou tronqué, aucun bouton hors écran, aucune carte qui dépasse. C'est le critère d'acceptation n°1.
- UNE seule colonne sur TOUTE la largeur (\`width:100%\`, AUCUN \`max-width\` figé qui laisserait des marges vides), tout empilé verticalement. Unités FLUIDES uniquement (%, \`clamp()\`, \`minmax(0,1fr)\`) — jamais de largeur en pixels fixes sur un conteneur.
- Boutons GRANDS (min 48px de haut), zones de tap larges (≥ 44px), texte lisible (≥ 13px). \`.fab\` d'ajout en bas à droite, \`.tab-bar\` en bas.
- Données en CARTES empilées (\`.card\`), JAMAIS un tableau large : à 375px un tableau multi-colonnes est illisible. Si un tableau est vraiment nécessaire, il vit dans \`.table-wrap\` (qui défile horizontalement, sans casser la page) — mais sur mobile, préfère TOUJOURS les cartes.
- Navigation simple, pas de survol indispensable. Optimisé pour une utilisation rapide avec des gants.`;
  }
  return `
# FORMAT CIBLE : ADAPTATIF — LA NAVIGATION CHANGE SELON LA LARGEUR DISPONIBLE
L'app est UN seul fichier responsive. Sa NAVIGATION et sa mise en page s'adaptent à la
largeur DISPONIBLE (l'app est affichée dans un cadre qui peut être étroit, ex. 768px quand
le chat est ouvert à côté — donc réagis à la largeur, pas à celle de l'écran). Trois régimes
via \`@media\`, avec le MÊME contenu partout — seule la CHROME (nav + colonnes) change :
- **≥ 1024px (bureau)** : SIDEBAR verticale fixe à gauche (icône + libellé), contenu à droite
  PLEINE LARGEUR (grilles fluides \`repeat(auto-fit,minmax(240px,1fr))\`, KPI en haut, tableau
  dessous). AUCUNE barre d'onglets en bas, aucune grande zone vide à droite.
- **600–1023px (tablette)** : sidebar COMPACTE (icônes seules) OU en-tête avec MENU BURGER
  qui ouvre la navigation. Pas de tab-bar flottante en bas.
- **< 600px (mobile)** : TAB-BAR fixe en bas (2-4 onglets) + \`.fab\` d'ajout. Une colonne,
  cartes empilées, boutons ≥ 48px, pensé pour le pouce (gants, chantier).
Utilise \`@media (min-width:1024px)\` et \`@media (min-width:600px)\` ; JAMAIS de largeur figée
sur le conteneur principal. Le passage sidebar ↔ burger ↔ tab-bar doit être FLUIDE et testé.`;
}

// Doctrine de CONTEXTE D'USAGE — orthogonale au format (layout). Le format dit
// « sur quel écran » ; ceci dit « pour qui, où, et donc quelle PHILOSOPHIE de
// design ». Statique → mis en cache avec le reste du socle.
const CONTEXT_DOCTRINE = `
# CONTEXTE D'USAGE — À DÉTERMINER AVANT DE DESSINER (priorité absolue)
Avant d'écrire une ligne, demande-toi POUR QUI et OÙ cette app sera utilisée. Deux mondes, deux philosophies opposées. Déduis-le de la demande.

## A. USAGE TERRAIN (les ouvriers SUR le chantier)
Signaux : « ouvriers », « équipe sur le chantier », « avant/après », « prendre en photo », « pointer les heures », « dicter », « relevé », « bon de passage » — un seul geste répété, dehors, avec des gants et des lunettes de sécurité.
→ RÈGLE : l'EFFICACITÉ et l'ACCESSIBILITÉ passent AVANT la beauté (la beauté reste là, mais après). Pense « un gars pressé, une main, des gants, en plein soleil ».
1. UNE action dominante = le verbe central de l'app (photographier / pointer / dicter). Elle est ÉNORME, au centre, atteignable en 1 seul tap dès l'ouverture — jamais cachée dans un menu ni après un formulaire.
2. Boutons GÉANTS (≥ 64px de haut), cibles très larges, gros espaces entre elles — utilisables avec des gants.
3. Saisie clavier réduite au strict minimum : privilégie l'APPAREIL PHOTO, le MICRO (dictée), les gros interrupteurs/sélecteurs. Un ouvrier ganté ne tape pas au clavier.
   • PHOTO — implémentation OBLIGATOIRE : un \`<input type="file" accept="image/*" capture="environment">\` (caché, déclenché par le bouton via un \`<label>\` ou \`input.click()\`). Sur MOBILE, ça ouvre DIRECTEMENT l'appareil photo arrière ; sur ordinateur, le sélecteur de fichiers. Lis l'image, puis COMPRESSE-la OBLIGATOIREMENT avant de l'afficher/stocker : dessine-la sur un \`<canvas>\` redimensionné à 1400px max sur le grand côté, puis \`canvas.toDataURL('image/jpeg', 0.7)\` → ~150-300 Ko au lieu de plusieurs Mo. Une dataURL brute non compressée rend l'enregistrement LENT et le fait ÉCHOUER (« workspace injoignable »). N'utilise JAMAIS \`getUserMedia\`/\`<video>\` (inutile, fragile, souvent bloqué). Le bouton DOIT marcher du premier coup.
4. Contraste FORT et gros texte (lisible en plein soleil). Actions placées EN BAS de l'écran (portée du pouce).
5. Confirmation immédiate et ÉVIDENTE après chaque action (grande coche verte, message clair) : le gars doit SAVOIR que c'est enregistré sans avoir à lire.
6. Résilience réseau : le chantier a une connexion pourrie. Une capture (photo, pointage) ne doit JAMAIS être perdue à cause du réseau — garde-la localement et réessaie ; ne bloque pas le gars.
7. Zéro superflu : pas de tableau dense, pas de 15 champs, pas de dashboard. Une tâche = un écran épuré.

## B. USAGE PILOTAGE (le patron / le bureau)
Signaux : « suivre mes chantiers », « chiffre d'affaires », « revenus », « marge », « tableau de bord », « vue d'ensemble », « rapport », « KPI » — analyser, décider.
→ RÈGLE : la BEAUTÉ, la LÉGÈRETÉ et la LISIBILITÉ des données priment (tout en restant efficace).
1. Vrais KPI en haut, sur de VRAIES données du workspace (chiffres qui comptent, compteurs animés à l'ouverture).
2. Belles cartes, graphes lisibles, hiérarchie visuelle claire, beaucoup d'air. Le patron doit comprendre l'état de sa boîte en 3 secondes, d'un coup d'œil.
3. Épuré et léger : de l'information utile et hiérarchisée, jamais un mur de chiffres.

## DANS TOUS LES CAS
- Ordre de priorité STRICT : EFFICACITÉ → COMPRÉHENSION → FACILITÉ D'USAGE → puis le beau design. Le design sert l'usage, jamais l'inverse.
- En cas de doute : « les ouvriers font X » = terrain ; « je veux suivre / voir / analyser Y » = pilotage.
- Un usage terrain est mobile par nature : applique l'ergonomie mobile (gros, une main, pouce) même si le format cible est « adaptatif ».
- Horodatage & géo automatiques : toute capture terrain (photo, note, pointage, relevé) est datée à la seconde et, si pertinent, géolocalisée AUTOMATIQUEMENT — l'utilisateur ne saisit jamais la date à la main.

# MÉMOIRE = BOÎTE NOIRE (capturé = enregistré, jamais perdu)
Le workspace est la mémoire de l'entreprise. TOUT ce que l'app capture doit y être écrit IMMÉDIATEMENT, sans étape « Enregistrer » manuelle : dès qu'une photo est prise, une note dictée ou une heure pointée, c'est enregistré et horodaté. Quand des entités du workspace sont connectées (voir le bloc DONNÉES PARTAGÉES plus bas), écris via window.biltia — le serveur pose la date tout seul. L'utilisateur ne doit RIEN perdre : chaque preuve de travail est traçable et retrouvable plus tard.
`;

// Socle STATIQUE du prompt système (identique d'une requête à l'autre pour un
// même format) : marqué cache_control → Anthropic le met en cache 5 min.
// Créations, itérations, continuations et auto-fix réutilisent le cache →
// nettement plus rapide et ~10× moins cher sur cette partie.
function buildSystemStatic(format: string): string {
  return `Tu es BiltiaAI, le meilleur générateur d'applications de gestion pour le secteur du BTP en France. Tu transformes une description en français — même approximative, même en argot de chantier — en une application web complète, professionnelle et réellement utilisable.

${BTP_KNOWLEDGE}

${BUILD_RULES}

${CONTEXT_DOCTRINE}

${formatInstruction(format)}`;
}

// Queue DYNAMIQUE (métier, RAG, workspace, préférences) + consigne de sortie.
function buildSystemDynamic(parts: (string | undefined | "")[]): string {
  return [
    ...parts.filter(Boolean),
    `# SORTIE
Réponds UNIQUEMENT avec le code HTML complet. Aucune explication, aucun texte avant ou après, aucune balise markdown \`\`\`. Le premier caractère de ta réponse est \`<\` et le dernier est \`>\`.`,
  ].join("\n\n");
}

// Consigne de REMPLISSAGE : quand un document est joint (image/PDF), on ne
// génère pas « à partir de rien » — on REPRODUIT proprement le document fourni
// en le COMPLÉTANT avec ce qu'on sait (entreprise, workspace, réponses).
const DOC_FILL_MODE = `# TU REMPLIS UN DOCUMENT FOURNI (un fichier est joint : image ou PDF)
L'utilisateur t'a joint un document et te demande de le COMPLÉTER. Ta mission :
1. LIS le document joint : identifie sa NATURE (devis, facture, attestation, courrier, bon, formulaire…) et TOUTES ses rubriques/champs.
2. REPRODUIS-le PROPREMENT en HTML (même type de document, mêmes sections, même esprit) — une belle feuille A4 lisible, PAS une photo ni une copie pixel par pixel.
3. REMPLIS chaque champ avec les SOURCES DE VÉRITÉ, dans cet ordre : les réponses/contexte fournis par l'utilisateur > la FICHE ENTREPRISE (ton en-tête émetteur) > le WORKSPACE (le client demandé, ses coordonnées, les chantiers) > le contenu déjà présent dans le document joint.
4. NE RECOPIE PAS les zones vides « …… » ou « [à remplir] » du document : REMPLIS-les. N'INVENTE jamais un nom de client, un montant, une quantité, une prestation ni une date : si l'info manque VRAIMENT (et n'a pas été fournie), mets un placeholder clair entre crochets « [Montant HT] » — jamais du faux définitif.
5. Calcule les totaux exactement (HT → TVA → TTC) si le document en comporte. Format français.
Le résultat est un document fini, prêt à imprimer / enregistrer en PDF / signer — l'utilisateur pourra le prévisualiser et le télécharger.`;

// Fiche entreprise émettrice (nom + pays + TVA + SIRET + adresse), depuis
// tenants.company_info (migration 015). Sert à remplir l'EN-TÊTE d'un document
// sans jamais redemander ces infos. "" si rien n'est renseigné.
async function fetchCompanyBlock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string
): Promise<string> {
  try {
    const { data } = await supabase
      .from("tenants")
      .select("name, company_info")
      .eq("id", tenantId)
      .maybeSingle();
    if (!data) return "";
    const ci = (data.company_info ?? {}) as Record<string, string>;
    const isBE = (ci.country ?? "").toUpperCase() === "BE";
    const lines: string[] = [
      "# FICHE ENTREPRISE ÉMETTRICE (TES propres infos — remplis l'en-tête du document avec, ne les redemande jamais)",
    ];
    if (data.name) lines.push(`- Nom : ${data.name}`);
    if (ci.siret) lines.push(`- ${isBE ? "N° d'entreprise (BCE)" : "SIRET"} : ${ci.siret}`);
    if (ci.vat) lines.push(`- N° TVA : ${ci.vat}`);
    if (ci.address) lines.push(`- Adresse : ${ci.address}`);
    if (ci.country) lines.push(`- Pays : ${ci.country}`);
    if (lines.length === 1) return ""; // aucune info renseignée
    lines.push("", "Un champ manquant ci-dessus → placeholder clair [entre crochets], jamais inventé.");
    return lines.join("\n");
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function stripFences(html: string): string {
  let out = html.trim();
  if (out.startsWith("```")) {
    out = out.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "").trim();
  }
  return out;
}

function validateHtml(html: string): string | null {
  const lower = html.toLowerCase();
  if (html.length < 300) return "trop court";
  if (!lower.includes("<!doctype") && !lower.includes("<html")) return "pas de document HTML";
  if (!lower.includes("</body>") || !lower.includes("</html>")) return "document non fermé";

  const opens = (lower.match(/<script\b/g) || []).length;
  const closes = (lower.match(/<\/script>/g) || []).length;
  if (opens !== closes) return "balises <script> déséquilibrées";

  if (html.includes("```")) return "fence markdown résiduelle";

  return null;
}

// ── MODIFICATION CIBLÉE (mode « patch ») ──────────────────────────────────────
// Pour une modification d'app, le modèle renvoie des blocs RECHERCHE/REMPLACE au
// lieu de réécrire toute l'app (sortie ~30k tokens → quelques centaines : bien
// plus rapide et bien moins cher). On applique chaque bloc au HTML existant.
// SÉCURITÉ ABSOLUE : on n'applique un remplacement QUE si le passage recherché
// existe ET est UNIQUE dans le fichier (sinon impossible de garantir la bonne
// cible). Au moindre doute (bloc introuvable, ambigu, ou aucun bloc) on renvoie
// `null` → l'appelant retombe sur la réécriture complète. Le mode patch ne peut
// donc JAMAIS corrompre une app : au pire, on retrouve le comportement d'avant.
const EDIT_BLOCK_RE =
  /<{5,9}\s*RECHERCHE\r?\n([\s\S]*?)\r?\n={5,9}\r?\n([\s\S]*?)\r?\n>{5,9}\s*REMPLACE/g;

function applyTargetedEdits(original: string, modelOutput: string): string | null {
  EDIT_BLOCK_RE.lastIndex = 0;
  let out = original;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = EDIT_BLOCK_RE.exec(modelOutput)) !== null) {
    const search = m[1];
    const replace = m[2];
    if (!search) return null; // bloc vide / insertion sans ancre → non supporté
    const first = out.indexOf(search);
    if (first === -1) return null; // introuvable → repli réécriture complète
    if (out.indexOf(search, first + search.length) !== -1) return null; // ambigu (non unique)
    out = out.slice(0, first) + replace + out.slice(first + search.length);
    count++;
  }
  return count > 0 ? out : null; // aucun bloc valide → repli
}

// ── PORTÉE DES DONNÉES (question du questionnaire) ────────────────────────────
// Forme lâche : la valeur vient du client, on ne fait confiance à rien.
type DataScopeInput = {
  source?: "workspace" | "import" | "zero";
  mode?: "all" | "select";
  records?: { entity?: string; id?: string }[];
};

/** Résout les enregistrements choisis en libellés lisibles, groupés par entité
 *  (requête `in(id)` par entité, bornée). Sert à SCOPER l'app sur ces éléments. */
async function resolveScopeLabels(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  records: { entity: string; id: string }[]
): Promise<string> {
  const byEntity = new Map<string, string[]>();
  for (const r of records) {
    if (!ALLOWED_ENTITIES.includes(r.entity)) continue;
    const arr = byEntity.get(r.entity) ?? [];
    if (arr.length < 100) arr.push(r.id);
    byEntity.set(r.entity, arr);
  }
  const lines: string[] = [];
  let total = 0;
  for (const [entity, ids] of byEntity) {
    if (total >= 60) break;
    const def = ENTITIES[entity];
    if (!def) continue;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from as any)(def.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .in("id", ids);
      const rows = (data ?? []) as Record<string, unknown>[];
      const labels = rows.map((row) => recordLabel(entity, row)).filter((l) => l && l !== "(sans nom)");
      if (labels.length) {
        lines.push(`- ${def.label} : ${labels.slice(0, 40).join(", ")}`);
        total += labels.length;
      }
    } catch {
      // entité indisponible → on saute
    }
  }
  return lines.join("\n");
}

// Capture best-effort d'une demande que Biltia NE PEUT PAS satisfaire — intégration
// tierce absente OU capacité hors périmètre → app_records/__unmet_requests. Signal
// produit pour la roadmap (« qu'est-ce que les gens réclament qu'on n'a pas »).
// Fire-and-forget : jamais bloquant, jamais fatal.
async function recordUnmetRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  userId: string,
  reqKind: "integration" | "capability",
  detail: string,
  prompt: string,
): Promise<void> {
  try {
    // AWAIT indispensable : sur Vercel (serverless), la lambda est gelée dès la
    // réponse renvoyée. Un insert fire-and-forget serait perdu — surtout sur le
    // chemin "capability" qui retourne juste après. On attend (c'est rapide).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from as any)("app_records").insert({
      tenant_id: tenantId,
      collection: "__unmet_requests",
      data: { kind: reqKind, detail: (detail || "").slice(0, 120), prompt: (prompt || "").slice(0, 500) },
      created_by: userId,
    });
  } catch {
    /* signal best-effort — jamais bloquant */
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith("your_")) {
      return Response.json(
        { error: "Clé API Anthropic non configurée. Ajoutez ANTHROPIC_API_KEY dans .env.local." },
        { status: 503 }
      );
    }

    // ── Authentification obligatoire ─────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: "Authentification requise." }, { status: 401 });
    }

    // Rate limiting : rejette un flood au plus tôt (avant toute lecture DB).
    const limited = await enforceRateLimit("generate", user.id, LIMITS.generate);
    if (limited) return limited;

    // ── Récupérer le tenant de l'utilisateur ─────────────────────────────────
    const membership = await getActiveMembershipServer(supabase, user.id);

    if (!membership) {
      return Response.json({ error: "Aucun espace de travail trouvé." }, { status: 403 });
    }

    const tenantId = membership.tenant_id;

    // ── GEL LECTURE SEULE ────────────────────────────────────────────────────
    // Un abonnement expiré (résilié / impayé) fige l'espace : plus de création
    // ni de modification IA. Le compte fondateur (test) n'est jamais gelé.
    if (!isFounderEmail(user.email)) {
      const ent = await getEntitlementsForTenant(supabase, tenantId);
      if (!ent.writable) {
        return Response.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
      }
    }

    // ── Validation du body ───────────────────────────────────────────────────
    let body: {
      prompt?: string;
      previousHTML?: string;
      format?: string;
      isAutoFix?: boolean;
      kind?: string;
      docType?: string;
      // Document : 2e passage après que l'utilisateur a fourni le contexte
      // manquant → court-circuite la porte « contexte suffisant ? ».
      contextProvided?: boolean;
      files?: { name?: string; mediaType?: string; data?: string }[];
      // Portée des données choisie au questionnaire (workspace / import / zéro).
      dataScope?: DataScopeInput;
    };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    const { prompt, previousHTML, format, isAutoFix } = body;

    // Fichiers joints DANS L'ATELIER (capture d'écran d'un problème, document
    // de référence) : contexte multimodal de la génération/modification —
    // rien à voir avec l'analyse workspace (/api/analyze).
    const CONTEXT_MEDIA = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
    const contextFiles = (Array.isArray(body.files) ? body.files : [])
      .slice(0, 4)
      .filter(
        (f): f is { name?: string; mediaType: string; data: string } =>
          !!f &&
          typeof f.data === "string" &&
          f.data.length > 0 &&
          f.data.length < 8_000_000 &&
          CONTEXT_MEDIA.has(String(f.mediaType))
      );

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return Response.json({ error: "Décrivez l'application que vous souhaitez." }, { status: 400 });
    }

    // Limiter la taille du prompt pour éviter les abus
    if (prompt.length > 4000) {
      return Response.json({ error: "Description trop longue (4000 caractères max)." }, { status: 400 });
    }

    const isModification = typeof previousHTML === "string" && previousHTML.length > 0;

    // ── Profil : secteur (aiguillage) + préférences IA en UNE requête ─────────
    // (l'ancien code interrogeait `profiles` deux fois, séquentiellement).
    let sector: string | null = null;
    let preferences: UserPreferences = DEFAULT_PREFERENCES;
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as unknown as { from: (t: string) => any };
      const { data: profile } = await db
        .from("profiles")
        .select("sector, preferences")
        .eq("user_id", user.id)
        .single();
      sector = profile?.sector ?? null;
      preferences = normalizePreferences(profile?.preferences);
    }

    // Tracking best-effort du coût des classifieurs Haiku (aiguillage kind +
    // routage agent). Ils appellent Claude EN AMONT de la génération facturée :
    // sans ça, ~la moitié des appels API de l'app restaient invisibles dans le
    // reporting. Jamais bloquant (écriture via service_role, fire-and-forget).
    const logAuxUsage = (
      usage: { model: string; inputTokens: number; outputTokens: number } | undefined,
      auxAction: string
    ) => {
      if (!usage) return;
      void trackAiUsage({
        supabase,
        userId: user.id,
        tenantId,
        action: auxAction,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        sector: sector ?? undefined,
        internal: true, // plomberie (classify_kind, route_agent…) : coût réel, pas de plancher 5cr
      }).catch(() => {});
    };

    // ── Aiguillage AVANT le hold : une simple question ne coûte pas le prix
    // d'une application, et surtout ne DOIT PAS en produire une. 4 formats :
    // answer (réponse texte) | document | action | module.
    const providedKind = coerceKind(body.kind);
    let kind: BiltiaKind;
    let docType: string | null = null;
    let kindConfidence = 1;
    let kindMethod = "provided";
    let emailDraft: { to: string; subject: string; body: string } | undefined;
    let taskDraft: { audience: string; subject: string; body: string } | undefined;
    let outOfScope = false;
    let oosAlternative = "";
    if (isAutoFix) {
      // Auto-fix : on itère toujours sur le livrable existant, pas de reclasse.
      kind = providedKind ?? "module";
      docType = typeof body.docType === "string" ? body.docType : null;
    } else {
      const k = await classifyKind({ prompt, sector, hasExistingApp: isModification });
      logAuxUsage(k.usage, "classify_kind");
      emailDraft = k.email;
      taskDraft = k.task;
      outOfScope = k.outOfScope === true;
      oosAlternative = k.oosAlternative ?? "";
      if (isModification) {
        // ── APP OUVERTE : deux issues seulement — MODIFIER l'app, ou RÉPONDRE
        // EN CHAT. Une demande qui ne VISE PAS l'app (« traduis ça », « écris un
        // mot à mon client », « c'est quoi la RE2020 ? », « raconte une blague »)
        // ne doit JAMAIS réécrire l'application : on répond en texte et on débite
        // le prix d'une question, pas d'une modification. `targets_open_app`
        // (classifieur Sonnet) tranche modification vs hors-sujet ; sans signal
        // LLM (repli heuristique), on garde le comportement historique — tout ce
        // qui n'est pas une pure question est une modification.
        const pureQuestion = looksLikePureQuestion(prompt);
        const wantsAppChange =
          typeof k.targetsOpenApp === "boolean" ? k.targetsOpenApp : !pureQuestion;
        if (wantsAppChange && !pureQuestion) {
          // Vraie modification de l'app ouverte : on conserve son format.
          kind = providedKind ?? "module";
          docType = providedKind ? (typeof body.docType === "string" ? body.docType : null) : null;
        } else {
          // Hors-sujet ou pure question → réponse en chat, sans toucher à l'app.
          kind = "answer";
          kindConfidence = k.confidence;
          kindMethod = k.method;
        }
      } else if (providedKind) {
        // Le client a EXPLICITEMENT forcé un format (ex : document à remplir à
        // partir d'un fichier joint). On l'honore AVANT la reclasse « answer » —
        // sinon une consigne comme « complète ce document » serait détournée en
        // simple réponse texte, sans produire le document.
        kind = providedKind;
        docType =
          typeof body.docType === "string"
            ? body.docType
            : providedKind === "document"
              ? k.docType
              : null;
      } else if (k.kind === "answer") {
        kind = "answer";
        kindConfidence = k.confidence;
        kindMethod = k.method;
      } else {
        kind = k.kind;
        docType = k.docType;
        kindConfidence = k.confidence;
        kindMethod = k.method;
      }
    }
    const isAnswer = kind === "answer";

    // ── PORTE DE CAPACITÉ : la demande sort des capacités RÉELLES de Biltia
    // (action physique, téléphonie/vocal en temps réel, ingénierie spécialisée,
    // matériel/IoT). On REFUSE avec tact AVANT toute génération — jamais fabriquer
    // un faux outil — on propose une alternative réelle si elle existe, et on
    // ENREGISTRE la demande (signal roadmap). Gratuit : aucune dépense de crédit.
    if (outOfScope && !isAutoFix && !isModification) {
      await recordUnmetRequest(supabase, tenantId, user.id, "capability", oosAlternative, prompt);
      const alt = oosAlternative.trim();
      const message = alt
        ? `Ça, je ne peux pas le faire — ce n'est pas dans mes capacités.\n\nEn revanche, ${alt.charAt(0).toLowerCase() + alt.slice(1)}${/[.!?]$/.test(alt) ? "" : "."}\n\nTu veux que je m'en occupe ?`
        : "Ça, je ne peux pas le faire — ce n'est pas dans mes capacités, en tout cas pas pour l'instant. J'ai noté ta demande : c'est peut-être pour bientôt.";
      return Response.json({ kind: "answer", answer: message });
    }

    // ── SIGNAL PRODUIT : capte (silencieux, best-effort) une demande visant un
    // service tiers que Biltia n'intègre PAS encore. Liste curée (Gmail/Agenda/
    // Drive/Excel/CSV sont supportés → ABSENTS). Fire-and-forget, jamais bloquant.
    {
      const lower = prompt.toLowerCase();
      const UNSUPPORTED = [
        "loom", "sage", "ebp", "pennylane", "quickbooks", "odoo", "slack", "trello",
        "notion", "zapier", "hubspot", "salesforce", "asana", "dropbox", "onedrive",
        "batigest", "obat", "tolteck", "discord", "monday",
      ];
      const hit = UNSUPPORTED.find((n) => new RegExp(`\\b${n}\\b`, "i").test(lower));
      if (hit) await recordUnmetRequest(supabase, tenantId, user.id, "integration", hit, prompt);
    }

    // ── RBAC : un LECTEUR (viewer) est en lecture seule. Il peut poser des
    // questions (answer), pas créer une app/document/action ni envoyer un email
    // ou poser un événement. Tout ce qui n'est pas une réponse lui est refusé
    // proprement, AVANT toute dépense (hold crédits plus bas).
    if (!isAutoFix && !isAnswer && !can(membership.role, "ai.create")) {
      return Response.json(
        {
          kind: "answer",
          answer:
            "Vous êtes en **lecture seule** sur cet espace de travail : vous pouvez consulter les données et poser des questions, mais pas créer ni envoyer. Demandez à un administrateur de l'espace de vous accorder les droits nécessaires.",
        },
        { status: 403 }
      );
    }

    // ── EMAIL : l'intention est comprise (destinataire + objet + corps déjà
    // extraits par le classifieur). On ne vérifie la connexion Gmail QUE
    // maintenant (lazy) : connectée → on envoie ; sinon → on le dit et on donne
    // le message prêt à copier. Jamais deviner le destinataire : s'il manque,
    // on le demande.
    if (kind === "email" && !isModification && !isAutoFix) {
      const to = (emailDraft?.to ?? "").trim();
      const subject = (emailDraft?.subject ?? "").trim() || "Message de votre part";
      const bodyText = (emailDraft?.body ?? "").trim();

      if (!to) {
        return Response.json({
          kind: "email",
          status: "need_recipient",
          message: "À qui dois-je envoyer cet email ? Donnez-moi l'adresse du destinataire.",
        });
      }

      const status = await gmailStatus(tenantId, user.id);
      if (!status.connected || !status.canSend) {
        return Response.json({
          kind: "email",
          status: "not_connected",
          // Carte de connexion inline (Bloc « étape par étape ») : l'utilisateur
          // connecte Gmail juste ici, puis je renvoie la demande et j'envoie.
          connectors: ["gmail"],
          message: `Il me faut d'abord connecter votre **Gmail** pour l'envoyer à votre place — c'est juste ci-dessous.\n\nEn attendant, voici le message prêt à copier :\n\nÀ : ${to}\nObjet : ${subject}\n\n${bodyText}`,
        });
      }

      const sent = await sendGmail({ tenantId, userId: user.id, to, subject, body: bodyText });
      if (sent.ok) {
        return Response.json({
          kind: "email",
          status: "sent",
          message: `✅ Email envoyé à ${to}.\n\nObjet : ${subject}\n\n${bodyText}`,
        });
      }
      const why =
        sent.reason === "missing_scope"
          ? "l'autorisation d'envoi Gmail n'est pas accordée — reconnectez votre compte Google"
          : "l'envoi a échoué côté Gmail";
      return Response.json({
        kind: "email",
        status: "error",
        message: `Je n'ai pas pu envoyer l'email (${why}). Voici le message prêt à copier :\n\nÀ : ${to}\nObjet : ${subject}\n\n${bodyText}`,
      });
    }

    // ── TASK : ENVOI GROUPÉ « fais-le maintenant ». Le workspace a la donnée, la
    // messagerie est branchée → Biltia EXÉCUTE (au lieu de refuser). Deux temps
    // pour la sûreté : ici on RÉSOUT le groupe et on rend un APERÇU (aucun envoi) ;
    // l'envoi réel part de /api/task/execute après validation dans le chat. Avant
    // le hold : préparer un aperçu ne coûte pas une génération.
    if (kind === "task" && !isModification && !isAutoFix) {
      const audience = (taskDraft?.audience ?? "").trim();
      const subject = (taskDraft?.subject ?? "").trim() || "Message de votre part";
      const bodyText = (taskDraft?.body ?? "").trim();

      if (!isTaskAudience(audience)) {
        return Response.json({
          kind: "task",
          status: "need_audience",
          message:
            "À qui dois-je envoyer ce message ? Dis-moi le groupe : **tes clients**, **ton équipe** ou **tes fournisseurs**.",
        });
      }
      const label = AUDIENCE_LABELS[audience];

      if (!bodyText) {
        return Response.json({
          kind: "task",
          status: "need_content",
          message: `Que veux-tu dire à tes ${label.plural} ? Donne-moi le message et je le prépare pour validation.`,
        });
      }

      // Moyen d'envoi d'abord (échec précoce et clair, jamais un aperçu inutile).
      const channels = await canSendOutbound(tenantId, user.id);
      if (!channels.ok) {
        return Response.json({
          kind: "task",
          status: "not_connected",
          // Carte de connexion inline : connecte Gmail ci-dessous, puis je résous
          // le groupe et je prépare l'aperçu.
          connectors: ["gmail"],
          message:
            `Pour écrire à tes ${label.plural}, il me faut d'abord ta messagerie **Gmail** — connecte-la juste ci-dessous. ` +
            `En attendant, voici le message prêt à copier :\n\nObjet : ${subject}\n\n${bodyText}`,
        });
      }

      // Résolution du groupe (lecture seule, RLS tenant). Aucun envoi ici.
      const resolved = await resolveAudience(supabase, tenantId, audience);
      if (resolved.total === 0) {
        return Response.json({
          kind: "task",
          status: "empty",
          message: `Tu n'as aucun ${label.singular} dans ton workspace pour l'instant. Ajoute-les (ou importe-les) et je pourrai les contacter.`,
        });
      }
      if (resolved.recipients.length === 0) {
        return Response.json({
          kind: "task",
          status: "no_email",
          message: `Tes ${resolved.total} ${label.plural} n'ont pas d'email renseigné dans le workspace. Complète au moins un email et je m'en occupe.`,
        });
      }

      const count = resolved.recipients.length;
      const cappedNote = count > SEND_CAP ? ` (j'enverrai aux ${SEND_CAP} premiers pour commencer)` : "";
      const sample = resolved.recipients.slice(0, 3).map((r) => r.name).join(", ");
      const skippedNote = resolved.skipped.length
        ? ` ${resolved.skipped.length} ${resolved.skipped.length > 1 ? "fiches sautées" : "fiche sautée"} (pas d'email).`
        : "";
      const message =
        `📣 Prêt à envoyer à **${count} ${count > 1 ? label.plural : label.singular}**${cappedNote}` +
        `${sample ? ` — ${sample}${count > 3 ? "…" : ""}` : ""}.${skippedNote}\n\n` +
        `**Objet :** ${subject}\n\n${bodyText}\n\n` +
        `👉 Réponds « **oui, envoie** » pour lancer, ou dis-moi quoi changer.`;

      return Response.json({
        kind: "task",
        status: "preview",
        message,
        task: { audience, subject, body: bodyText },
      });
    }

    // ── CALENDAR : consulter l'agenda connecté. Intention comprise → vérif
    // connexion en lazy → lecture réelle des 7 prochains jours. Pas connecté →
    // on propose de connecter (jamais « je ne peux pas »).
    if (kind === "calendar" && !isModification && !isAutoFix) {
      // Extraction dédiée : lecture / création / recherche de créneau.
      const calIntent = await extractCalendarEvent(prompt);

      // RECHERCHE DE CRÉNEAU LIBRE (« trouve-moi un créneau jeudi », « quand suis-je dispo pour 2h »).
      // Base : le planning Biltia (interventions planifiées) = créneaux occupés,
      // heures ouvrées par défaut 8h-18h du lundi au vendredi.
      if (calIntent.action === "find_slot") {
        const now = Date.now();
        const fromMs = Math.max(now, Date.parse(calIntent.fromISO) || now);
        const toMs = Math.max(fromMs + 86_400_000, Date.parse(calIntent.toISO) || fromMs + 14 * 86_400_000);
        const items = await loadPlannedInterventions(
          supabase as unknown as Parameters<typeof loadPlannedInterventions>[0],
          tenantId,
          fromMs,
          toMs
        );
        const busy = items.map((it) => ({ start: it.start, end: it.end }));
        const slots = findFreeSlots({ busy, fromMs, toMs, durationMin: calIntent.durationMin, max: 3 });
        if (slots.length === 0) {
          return Response.json({
            kind: "calendar",
            status: "ok",
            message:
              "Je n'ai trouvé aucun créneau libre sur cette période d'après ton planning Biltia (heures ouvrées 8h-18h du lundi au vendredi). Élargis la fenêtre ou réduis la durée, et je regarde à nouveau.",
          });
        }
        const durH = Math.round((calIntent.durationMin / 60) * 10) / 10;
        const lines = slots.map((s, idx) => `${idx + 1}. ${formatSlotFr(s.start, s.end)}`).join("\n");
        return Response.json({
          kind: "calendar",
          status: "ok",
          message:
            `Voici ${slots.length} créneau${slots.length > 1 ? "x" : ""} libre${slots.length > 1 ? "s" : ""} de ${durH} h d'après ton planning Biltia :\n\n${lines}\n\n` +
            "Dis-moi lequel te va et je crée le rendez-vous (« ajoute un RDV … le 1 »).",
        });
      }

      // CRÉATION d'un rendez-vous (« ajoute un RDV client mardi 14h »).
      if (calIntent.action === "create") {
        if (!calIntent.start || !calIntent.summary) {
          return Response.json({
            kind: "calendar",
            status: "need_info",
            message:
              "Il me manque une info pour créer ce rendez-vous : donne-moi le titre et la date/heure (ex : « RDV client Morel mardi 14h »).",
          });
        }
        const created = await createEvent({
          tenantId,
          userId: user.id,
          summary: calIntent.summary,
          startISO: calIntent.start,
          endISO: calIntent.end,
        });
        if (created.ok) {
          return Response.json({
            kind: "calendar",
            status: "created",
            message: `✅ Rendez-vous ajouté à ton agenda : « ${created.summary} » le ${created.whenLabel}.`,
          });
        }
        const needsCalendar = created.reason === "not_connected" || created.reason === "missing_scope";
        const why =
          created.reason === "not_connected"
            ? "Il me faut d'abord connecter ton **agenda Google** — c'est juste ci-dessous, puis j'ajoute le rendez-vous."
            : created.reason === "missing_scope"
              ? "L'autorisation d'écriture de l'agenda manque : reconnecte ton **agenda Google** ci-dessous et j'ajoute le rendez-vous."
              : "Je n'ai pas pu créer l'événement pour le moment. Réessaie dans un instant.";
        return Response.json({
          kind: "calendar",
          status: created.reason,
          message: why,
          ...(needsCalendar ? { connectors: ["google-calendar"] } : {}),
        });
      }

      // LECTURE de l'agenda (défaut).
      const cal = await readAgenda({ tenantId, userId: user.id });
      if (cal.ok) {
        return Response.json({ kind: "calendar", status: "ok", message: cal.summary });
      }
      const needsCalendar = cal.reason === "not_connected" || cal.reason === "missing_scope";
      const msg =
        cal.reason === "not_connected"
          ? "Il me faut d'abord connecter ton **agenda Google** — c'est juste ci-dessous, puis je te lis ta semaine."
          : cal.reason === "missing_scope"
            ? "L'autorisation de lecture de l'agenda manque : reconnecte ton **agenda Google** ci-dessous et je te lis ta semaine."
            : "Je n'ai pas pu lire ton agenda pour le moment. Réessaie dans un instant.";
      return Response.json({
        kind: "calendar",
        status: cal.reason,
        message: msg,
        ...(needsCalendar ? { connectors: ["google-calendar"] } : {}),
      });
    }

    // ── ACTION sans fichiers : le moteur de lot existe (/api/automate) mais il
    // lui faut les fichiers. On ne génère PAS un module à la place : on invite
    // à glisser les fichiers (gratuit), le front mémorise l'instruction et
    // lance le contrôle dès qu'ils sont joints. Promesse landing tenue :
    // « Décrivez le contrôle, Biltia l'exécute. »
    if (kind === "action" && !isModification && !isAutoFix) {
      return Response.json({ kind: "action", needsFiles: true });
    }

    // ── RULE : mission permanente → on RECRUTE un agent (vision « créer +
    // recruter »). Pas de génération d'app : la règle est parsée, ses
    // destinataires résolus contre le workspace, et le chat répond (« jamais
    // muet ») — y compris quand une info manque (agent créé « bloqué » avec la
    // question précise). Avant le hold : recruter ne coûte pas une génération.
    if (kind === "rule" && !isModification && !isAutoFix) {
      const recruited = await createAgentRule({
        supabase,
        userId: user.id,
        userEmail: user.email ?? null,
        tenantId,
        instruction: prompt,
      });
      if (recruited.usage) logAuxUsage(recruited.usage, "agent_recruit");
      if (recruited.ok) {
        await logActivity(supabase, {
          tenantId,
          userId: user.id,
          action: "create",
          entityType: "agent",
          description: `Agent recruté : « ${prompt.slice(0, 80)} »`,
          entityId: recruited.ruleId,
        });
      }
      // Connexions à proposer inline : uniquement quand l'agent N'A PAS été créé
      // (recruited.ok === false) à cause d'un manque OAuth bloquant. Une fois
      // connecté, le client rejoue la demande → l'agent est créé UNE fois (pas de
      // double recrutement, car il n'existe pas encore). Les gaps « warn » (agent
      // déjà créé) ne déclenchent pas de reprise.
      const ruleConnectors =
        recruited.ok === false
          ? [
              ...new Set(
                (recruited.gaps ?? [])
                  .filter((g) => g.severity === "block")
                  .map((g) => connectorForCapability(g.code))
                  .filter((c): c is string => !!c)
              ),
            ]
          : [];
      return Response.json({
        kind: "rule",
        ok: recruited.ok,
        blocked: recruited.blocked,
        ruleId: recruited.ruleId,
        message: recruited.message,
        // Manques de capacité détectés au preflight (bloquants ou recommandations).
        gaps: recruited.gaps ?? [],
        ...(ruleConnectors.length ? { connectors: ruleConnectors } : {}),
      });
    }
    // ── DATA : opération immédiate sur le workspace (« ajoute un client Jean
    // Dupont », « supprime le client Martin », « passe le devis D-12 en accepté »).
    // Boucle agentique avec accès TOTAL aux 16 entités (lecture + écriture,
    // tenant forcé, RLS active — client de session). Règles d'opérateur :
    // résoudre avant d'agir, ambiguïté = stop + question, jamais deviner.
    if (kind === "data" && !isModification && !isAutoFix) {
      const DATA_HOLD = isFounderEmail(user.email) ? 0 : 10; // même échelle qu'une réponse texte
      if (DATA_HOLD > 0) {
        const { data: credited } = await supabase.rpc("deduct_credits", { p_amount: DATA_HOLD });
        if (!credited) {
          return Response.json(
            { error: "Crédits insuffisants. Rechargez votre compte pour continuer." },
            { status: 402 }
          );
        }
      }
      const refundDataOp = async () => {
        if (DATA_HOLD <= 0) return;
        const admin = createAdminClient();
        if (admin) {
          try {
            await admin.rpc("refund_credits", { p_user_id: user.id, p_amount: DATA_HOLD });
          } catch {
            /* best-effort */
          }
        }
      };

      try {
        const loop = await runAgentLoop({
          model: TIER_SIMPLE,
          system: `Tu es l'OPÉRATEUR du workspace de Biltia, l'OS opérationnel du BTP. L'utilisateur te demande une opération sur SES données. Tu l'exécutes avec les outils, puis tu confirmes.

${buildWorkspaceToolsSystem()}

## Sûreté — OPÉRATION EN MASSE (règle ABSOLUE)
Si la demande vise PLUSIEURS fiches d'un coup en SUPPRESSION ou en ÉCRASEMENT de statut (« supprime TOUS mes clients », « passe TOUTES mes factures impayées en payées », « efface tout », « remets tous les chantiers à zéro ») : tu n'exécutes RIEN d'abord. Tu comptes les fiches concernées (workspace_list en lecture seule), puis tu DEMANDES une confirmation explicite en citant le nombre (« Cela concerne 24 clients. Confirme en écrivant "oui, supprime les 24" et je le fais. »). Tu n'effectues l'opération qu'après cette confirmation nette dans la demande. Une opération sur UNE fiche identifiée (« supprime le client Martin », « passe le devis D-12 en accepté ») reste normale : exécute-la directement.

## Ta réponse finale (français, brève)
- Opération faite → confirme FACTUELLEMENT ce qui a été fait, avec les valeurs clés (« ✓ Client **Jean Dupont** ajouté (06 12 34 56 78) »).
- Ambiguïté → liste les fiches candidates et demande laquelle. Tu n'as RIEN modifié.
- Introuvable → dis-le honnêtement et propose la création si pertinent.
- Jamais de jargon technique (pas d'uuid, pas de nom de table) dans la réponse.`,
          userMessage: prompt,
          db: supabase,
          actor: { tenantId, userId: user.id, label: "Assistant" },
          maxIterations: 6,
          // Filet dur : au plus 3 suppressions/écrasements par passage de chat.
          // Un « supprime tous mes clients » demande d'abord confirmation (règle
          // ci-dessus) ; si le modèle passe outre, il est stoppé net à 3 fiches.
          // Les opérations légitimes (1 fiche) restent très en deçà.
          maxDestructiveWrites: 3,
        });

        void trackAiUsage({
          supabase,
          userId: user.id,
          tenantId,
          action: "data_op",
          model: TIER_SIMPLE,
          inputTokens: loop.usage.inputTokens,
          outputTokens: loop.usage.outputTokens,
          sector: sector ?? undefined,
        }).catch(() => {});

        if (!loop.finalText) {
          await refundDataOp();
          return Response.json({
            kind: "data",
            message:
              "Je n'ai pas réussi à terminer cette opération. Reformulez (ex : « ajoute un client Jean Dupont, tel 06 12 34 56 78 ») — vos crédits ont été remboursés.",
            creditsUsed: 0,
          });
        }

        return Response.json({ kind: "data", message: loop.finalText, creditsUsed: DATA_HOLD });
      } catch (err) {
        await refundDataOp();
        throw err;
      }
    }

    // ── DOCUMENT : porte « employé » — avoir le contexte AVANT de produire ────
    // Un document officiel ne s'invente pas (nom du client, montants, quantités,
    // prestations, dates). Si l'essentiel manque à la fois dans la demande ET
    // dans le workspace, Biltia DEMANDE 1 à 3 questions ciblées au lieu de sortir
    // une facture bidon. AVANT le hold : demander ne coûte rien. `contextProvided`
    // (2e passage, après réponses) franchit la porte.
    // Fiche entreprise émettrice (en-tête du document) : calculée une fois pour
    // le document, réutilisée par la porte contexte ET par la génération.
    const companyBlock =
      kind === "document" && !isAutoFix ? await fetchCompanyBlock(supabase, tenantId) : "";

    if (kind === "document" && !isModification && !isAutoFix && !body.contextProvided) {
      const wsSnapshot = await getWorkspaceContext(supabase, tenantId)
        .then((ws) => buildWorkspaceBlock(ws))
        .catch(() => "");
      const gate = await assessDocumentReadiness({
        prompt,
        docType,
        // La porte voit AUSSI la fiche entreprise (émetteur connu) et le
        // document joint → elle ne redemande pas ce qui y figure déjà.
        workspace: [wsSnapshot, companyBlock].filter(Boolean).join("\n\n"),
        files: contextFiles,
      }).catch(() => null);
      if (gate?.usage) logAuxUsage(gate.usage, "document_context");
      if (gate && !gate.ready && gate.questions.length) {
        return Response.json({
          kind: "document",
          docType,
          needsContext: true,
          recap: gate.recap,
          questions: gate.questions,
        });
      }
    }

    // Filet de sécurité : une « rule »/« data » détectée pendant une modification
    // ne doit jamais atteindre le pipeline de génération (formats inconnus).
    if (kind === "rule" || kind === "data") {
      kind = "module";
      docType = null;
    }

    // Pré-autorisation (hold), réconciliée au coût réel après génération.
    // Les corrections automatiques d'erreurs ne coûtent pas de crédits.
    // Compte fondateur : jamais de hold ni de débit (usage journalisé quand même).
    const founder = isFounderEmail(user.email);
    // Réservation alignée sur la grille tarifaire publique (page /tarifs) :
    //   question ≈ 10 · document/devis ≈ 50 · modification ≈ 60 · application = 300.
    // Un DOCUMENT ne doit JAMAIS être réservé au prix d'une APPLICATION.
    const holdCredits =
      isAutoFix || founder
        ? 0
        : isAnswer
          ? 10
          : isModification
            ? 60
            : kind === "document"
              ? 50
              : 300;

    if (holdCredits > 0) {
      const { data: credited } = await supabase.rpc("deduct_credits", {
        p_amount: holdCredits,
      });

      if (!credited) {
        // Signal d'upsell (best-effort) : l'utilisateur tape le mur des crédits.
        // C'est LE moment de lui proposer l'offre supérieure.
        try {
          await supabase.from("app_events").insert({
            user_id: user.id,
            tenant_id: tenantId,
            event_type: "credits_blocked",
            sector,
            prompt_length: prompt.length,
            metadata: { at: "generate", kind, needed: holdCredits },
          });
        } catch {
          // le tracking ne bloque jamais la réponse
        }
        return Response.json(
          { error: "Crédits insuffisants. Rechargez votre compte pour continuer." },
          { status: 402 }
        );
      }
    }

    const target = format === "mobile" || format === "desktop" ? format : "auto";

    // ── Contexte (routage agent + workspace) — PARALLÉLISÉ ───────────────────
    // Pour une réponse texte, le routage est heuristique pur (useLLM:false) :
    // l'appel LLM de routage n'apportait rien à une question et coûtait ~1 s.
    // Le contexte workspace (vrais noms clients / chantiers / employés) reste
    // jamais bloquant : "" si le RPC/les tables sont absents.
    const [route, workspaceBlock, brandName, pilotageBlock] = await Promise.all([
      routeRequest({ prompt, sector, useLLM: !isAnswer }),
      getWorkspaceContext(supabase, tenantId)
        .then((ws) => buildWorkspaceBlock(ws))
        .catch(() => ""),
      // Marque de l'en-tête : le nom de l'entreprise de l'utilisateur (tenant).
      // Trop long pour l'en-tête (> 24 caractères) ou vide → repli « Biltia ».
      supabase
        .from("tenants")
        .select("name, company_info")
        .eq("id", tenantId)
        .single()
        .then(
          ({ data }) => {
            const info = (data?.company_info ?? {}) as { name?: string; company_name?: string; raison_sociale?: string };
            const n = String(info.company_name || info.raison_sociale || info.name || data?.name || "").trim();
            return n && n.length <= 24 ? n : "";
          },
          () => ""
        ),
      // Pilotage tréso/commercial — SEULEMENT pour une question (assistant patron),
      // en parallèle (aucune latence ajoutée), entièrement toléré (→ "" si erreur).
      isAnswer ? buildPilotageSnapshot(supabase, tenantId).catch(() => "") : Promise.resolve(""),
    ]);
    logAuxUsage(route.usage, "route_agent");
    // Focus métier : connaissance des sous-corps de la catégorie retenue par le
    // routeur. À défaut (demande générique → generalist), on retombe sur le MÉTIER
    // DÉCLARÉ à l'onboarding, pour que la profession colore même un simple planning
    // (« un électricien qui demande un suivi de chantier doit parler électricien »).
    // Métiers déclarés à l'onboarding : un OU PLUSIEURS (un plombier-électricien
    // coche les deux). On combine la catégorie ROUTÉE (le focus de la demande) avec
    // TOUTES les familles déclarées → le prompt connaît réellement chaque métier de
    // l'artisan. Repli sur `sector` (compat comptes créés avant le multi-select).
    const declaredSectors =
      preferences.sectors && preferences.sectors.length
        ? preferences.sectors
        : sector
          ? [sector]
          : [];
    const focusCatId = route.agent !== "generalist" ? getCategory(route.agent)?.id : undefined;
    const catIds = [...new Set([...(focusCatId ? [focusCatId] : []), ...declaredSectors])].slice(0, 5);
    const subTradeIds = [
      ...new Set(catIds.flatMap((id) => getCategory(id)?.subTrades.map((s) => s.id) ?? [])),
    ];
    const expertise =
      subTradeIds.length || preferences.activity_type || preferences.sector_detail
        ? buildKnowledgeBlock(subTradeIds, preferences.activity_type, preferences.sector_detail)
        : undefined;

    // ── RAG : récupération de sources VÉRIFIÉES (bibliothèque BTP globale +
    // documents privés du tenant). Client authentifié → RLS → le tenant ne voit
    // que le global + ses docs. Jamais bloquant : [] si Mistral/pgvector indispo.
    const tradeIds = subTradeIds;
    const ragChunks = await retrieveContext({ supabase, tenantId, prompt, tradeIds }).catch(() => []);
    const sourcesBlock = buildSourcesBlock(ragChunks);

    // ── COPILOTE : une question → une réponse texte immédiate, jamais une app ─
    if (isAnswer) {
      const answerSystem = [
        `Tu es Biltia, le copilote des pros du BTP. Un artisan te parle. Réponds comme un vrai expert du métier : clair, direct, utile.

STRUCTURE (priorité n°1 — une réponse doit être LISIBLE d'un coup d'œil) :
- Commence par LA réponse, en une phrase. Puis, si utile, 2 à 4 points à tirets (un par ligne). Aère avec une ligne vide entre les blocs.
- Court et dense. Zéro intro (« Bien sûr, voici… »), zéro blabla, zéro paragraphe fourre-tout. Si 2 phrases suffisent, 2 phrases.
- Texte brut : pas de HTML, pas de markdown. Des tirets pour les listes, des sauts de ligne pour respirer.

EXACTITUDE — NE JAMAIS INVENTER :
- Ne fabrique JAMAIS une donnée, un chiffre, un NOM (personne, client, contact, chantier) ni une fonctionnalité. Si tu ne sais pas, dis-le en une ligne et propose l'action réelle. Mieux vaut « je ne sais pas » qu'une réponse inventée.
- Chiffres exacts. TVA France : 20 % neuf, 10 % rénovation, 5,5 % rénovation énergétique. TVA Belgique : 21 % neuf, 6 % rénovation (logement > 10 ans). France par défaut. Cas principal, puis la nuance en une ligne.
- Question sur les données de l'entreprise (clients, chantiers, devis…) → utilise le CONTEXTE WORKSPACE ci-dessous et cite les vrais chiffres. Vide → dis-le simplement, ne devine jamais.
- Si des SOURCES sont fournies, elles priment.

TES OUTILS (ne te dévalorise JAMAIS) :
- Biltia se connecte à Gmail (envoyer des emails), Google Agenda (lire/créer des rendez-vous) et Google Drive (fichiers).
- Si la demande a besoin d'un de ces outils, considère qu'il peut être connecté : réponds « Ton [Gmail/agenda/Drive] n'est pas connecté — connecte-le dans les intégrations et je m'en occupe. » Ne dis JAMAIS « je ne peux pas » ni « ce n'est pas dans mes capacités » : c'est à une connexion près.

IDENTITÉ (règle stricte) — Biltia est une technologie MAISON conçue pour le BTP. Ne nomme JAMAIS un modèle, un fournisseur ou une techno sous-jacente (ni Anthropic, Claude, OpenAI, GPT, Gemini, Mistral, « LLM », « modèle de langage »…) et n'en confirme aucun. Si on te demande « quel LLM / quelle IA / c'est quoi derrière / t'es Claude ? » : réponds en une phrase que Biltia est une technologie maison développée spécialement pour les pros du BTP, sans détailler, puis recentre sur ce que tu peux faire pour lui.

INTÉGRATION NON DISPONIBLE — Au-delà de Gmail, Google Agenda et Google Drive, si la demande réclame un service tiers que Biltia ne propose pas encore (ex : Loom, Sage, EBP, Pennylane, Slack, un logiciel de compta ou un CRM externe…) : ne prétends JAMAIS savoir le faire et n'invente pas de connexion. Dis clairement, sans t'excuser, que cette intégration n'est pas encore disponible dans Biltia — puis propose l'alternative la plus proche que tu SAIS réellement faire (ex : au lieu d'un envoi Slack → un email ou un SMS ; au lieu d'un export vers un logiciel de compta → un export PDF ou CSV). Reste utile, jamais un cul-de-sac.

HORS CAPACITÉS (physique, téléphonie, ingénierie) — Si on te demande une action que Biltia ne peut PAS faire par nature (passer ou répondre à des appels en direct, agir physiquement sur un chantier, un calcul de structure ou thermique certifié, piloter du matériel) : dis simplement « Ça, je ne peux pas le faire, ce n'est pas dans mes capacités », propose une alternative RÉELLE si elle existe (sinon dis que c'est peut-être pour plus tard), et n'invente JAMAIS une capacité.`,
        expertise ? `\n# FOCUS MÉTIER\n${expertise}` : "",
        sourcesBlock ? `\n${sourcesBlock}` : "",
        workspaceBlock ? `\n${workspaceBlock}` : "",
        pilotageBlock ? `\n${pilotageBlock}` : "",
      ].join("\n");

      // Routage coût : une question GÉNÉRALE (sans ancrage workspace ni sources)
      // ne risque pas l'invention → Haiku suffit et coûte ~3× moins. Dès qu'une
      // réponse cite les données de l'entreprise ou des sources fournies, on
      // GARDE Sonnet (décision « copilote anti-invention », compréhension avant
      // vitesse : on ne bride que là où la qualité n'est pas en jeu).
      const grounded = !!workspaceBlock || !!sourcesBlock || !!pilotageBlock;
      const answerModel = grounded ? ANSWER_MODEL : TIER_SIMPLE;

      // ── STREAMING (SSE) : le premier mot arrive en < 1 s au lieu d'attendre
      // la réponse complète + la facturation. Métrologie et journal d'activité
      // s'exécutent APRÈS l'envoi du texte, plus jamais sur le chemin critique.
      const encoder = new TextEncoder();
      const refundHold = async () => {
        if (holdCredits <= 0) return;
        try {
          const admin = createAdminClient();
          if (admin) await admin.rpc("refund_credits", { p_user_id: user.id, p_amount: holdCredits });
        } catch (refundErr) {
          console.error("Refund failed after failed answer:", refundErr);
        }
      };

      const stream = new ReadableStream({
        async start(controller) {
          const send = (obj: unknown) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          let full = "";
          try {
            const llm = client.messages.stream({
              model: answerModel,
              max_tokens: 800,
              system: answerSystem,
              messages: [{ role: "user", content: prompt }],
            });
            for await (const event of llm) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                full += event.delta.text;
                send({ type: "delta", text: event.delta.text });
              }
            }
            const message = await llm.finalMessage();

            if (!full.trim()) {
              await refundHold();
              send({ type: "error", error: "La réponse a échoué. Réessayez — vos crédits ont été remboursés." });
              return;
            }

            let realCredits = holdCredits;
            if (holdCredits > 0 || founder) {
              try {
                const tracked = await trackAiUsage({
                  supabase,
                  userId: user.id,
                  tenantId,
                  action: "ask",
                  model: answerModel,
                  inputTokens: message.usage.input_tokens,
                  outputTokens: message.usage.output_tokens,
                  agent: route.agent,
                  sector: sector ?? undefined,
                });
                if (founder) {
                  realCredits = 0; // journalisé pour le suivi des coûts, jamais débité
                } else {
                  realCredits = tracked;
                  await reconcileCredits(supabase, createAdminClient(), user.id, holdCredits, realCredits);
                }
              } catch (meterErr) {
                console.error("Metering failed after answer:", meterErr);
              }
            }
            try {
              await logActivity(supabase, {
                tenantId,
                userId: user.id,
                action: "ask",
                entityType: "question",
                description: `Question résolue : « ${prompt.slice(0, 90)}${prompt.length > 90 ? "…" : ""} »`,
              });
            } catch {
              // Journal best-effort : jamais bloquant.
            }

            // Sujet de la question (heuristique gratuite) → data admin « sur quoi
            // les pros posent des questions ». Best-effort, jamais bloquant.
            try {
              await supabase.from("app_events").insert({
                user_id: user.id,
                tenant_id: tenantId,
                event_type: "question_asked",
                agent: route.agent,
                sector,
                prompt_length: prompt.length,
                metadata: { topic: classifyQuestionTopic(prompt), question: prompt.slice(0, 200) },
              });
            } catch {
              // le tracking ne bloque jamais la réponse
            }

            send({ type: "done", kind: "answer", creditsUsed: realCredits, agent: route.agent });
          } catch (err) {
            console.error("Answer stream failed:", err);
            await refundHold();
            try {
              send({ type: "error", error: "La réponse a échoué. Réessayez — vos crédits ont été remboursés." });
            } catch {
              // Flux déjà fermé côté client.
            }
          } finally {
            try {
              controller.close();
            } catch {
              // Déjà fermé.
            }
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // `action` n'a pas encore de moteur dédié : on génère un module opérationnel
    // en attendant (dégradation honnête, signalée à l'UI via `actionFallback`).
    const isDocument = kind === "document";

    // Mode DONNÉES PARTAGÉES : si la demande mappe des entités du workspace
    // (clients, chantiers, employees…), on injecte le bloc DATA MODE dans le
    // prompt système. Le module utilisera alors window.biltia → /api/data
    // (persistance partagée) au lieu de localStorage pour ces entités.
    const connectedEntities = isDocument
      ? []
      : detectConnectedEntities(prompt, route.appType);

    // ── PORTÉE DES DONNÉES CHOISIE AU QUESTIONNAIRE ───────────────────────────
    // workspace(all)    → connecte les entités détectées + données réelles ;
    // workspace(select) → force les entités choisies + liste les éléments précis ;
    // import            → exige une VRAIE fonction d'import ; zéro → exemples (défaut).
    // Uniquement à la création (une modification conserve le branchement existant).
    const dataScope = body.dataScope;
    let effectiveEntities = connectedEntities;
    let dataScopeBlock = "";
    if (!isDocument && !isModification && dataScope) {
      if (dataScope.source === "workspace") {
        const selKeys = Array.from(
          new Set(
            (dataScope.records ?? [])
              .map((r) => String(r?.entity))
              .filter((k) => ALLOWED_ENTITIES.includes(k))
          )
        );
        effectiveEntities = Array.from(new Set([...connectedEntities, ...selKeys]));
        if (dataScope.mode === "select" && Array.isArray(dataScope.records) && dataScope.records.length) {
          const clean = dataScope.records
            .filter(
              (r): r is { entity: string; id: string } =>
                !!r && typeof r.entity === "string" && typeof r.id === "string"
            )
            .slice(0, 200);
          const labels = await resolveScopeLabels(supabase, tenantId, clean);
          dataScopeBlock =
            `# DONNÉES CHOISIES PAR L'UTILISATEUR (portée de l'application)\n` +
            `L'utilisateur veut une app centrée sur CES éléments PRÉCIS de son workspace. Lis-les en direct via window.biltia (leurs entités sont connectées ci-dessous — données réelles, JAMAIS d'exemples fictifs) et oriente les vues, filtres et compteurs par défaut sur eux :\n` +
            (labels || "(éléments sélectionnés)");
        } else {
          dataScopeBlock =
            `# DONNÉES : TOUT LE WORKSPACE\n` +
            `L'utilisateur veut que l'application s'appuie sur l'ENSEMBLE de ses données réelles du workspace. Connecte les entités pertinentes via window.biltia (données en direct), sans exemples fictifs.`;
        }
      } else if (dataScope.source === "import") {
        dataScopeBlock =
          `# DONNÉES : IMPORT DE FICHIER (l'app DOIT vraiment importer)\n` +
          `L'utilisateur partira d'un fichier. Ajoute une fonction d'IMPORT RÉELLE et VISIBLE dès l'accueil : un bouton « Importer un fichier (CSV/Excel) » déclenchant un <input type="file" accept=".csv,.xlsx,.xls">. Lis le fichier en JS (CSV : parse les lignes, la 1re = en-têtes = colonnes), affiche un APERÇU des lignes détectées, puis à la validation enregistre CHAQUE ligne via window.biltia.create(collection, ligne). L'import doit VRAIMENT fonctionner (jamais un bouton décoratif). Propose aussi un petit modèle CSV téléchargeable (en-têtes attendus).`;
      } else if (dataScope.source === "zero") {
        dataScopeBlock =
          `# DONNÉES : PARTIR DE ZÉRO — APP VIDE AU DÉPART (RÈGLE ABSOLUE, la consigne de l'utilisateur)\n` +
          `L'utilisateur a EXPLICITEMENT choisi de partir de zéro. L'application démarre donc VIDE : ` +
          `AUCUNE donnée d'exemple, AUCUNE ligne fictive, aucun faux client / chantier / devis / tâche pré-rempli. ` +
          `La règle générale « pré-remplis 2-3 exemples » NE S'APPLIQUE PAS ICI — ignore-la complètement. ` +
          `À la place : soigne les ÉTATS VIDES de CHAQUE vue (icône + titre + sous-texte + un bouton « + Ajouter » ` +
          `qui ouvre le vrai formulaire de création). Les compteurs et KPI affichent 0 ou « — » proprement, ` +
          `jamais un chiffre inventé. Ne mets PAS de bouton « Effacer les exemples » (il n'y a rien à effacer). ` +
          `L'utilisateur saisira lui-même sa première donnée — l'app doit être immédiatement utilisable, mais vierge. ` +
          `Créer des données fictives ici serait une TRAHISON de son choix explicite : c'est interdit.`;
      }
    }

    // Moteur : Opus 4.8 pour les grosses apps de gestion, Sonnet 4.6 sinon.
    const buildModel = pickBuildModel({
      prompt,
      isDocument,
      isModification,
      previousHTMLLength: typeof previousHTML === "string" ? previousHTML.length : 0,
      connectedEntities: effectiveEntities,
    });

    // Système en blocs : socle statique mis en cache (prompt caching Anthropic),
    // queue dynamique (métier, RAG, workspace, préférences) à la suite.
    const system: Anthropic.TextBlockParam[] = isDocument
      ? [
          {
            type: "text",
            text:
              buildDocumentSystemPrompt({
                docType,
                expertise,
                sources: sourcesBlock,
                // La fiche entreprise (émetteur) rejoint les sources de vérité du
                // document → l'en-tête se remplit sans redemander SIRET/adresse.
                workspace: [workspaceBlock, companyBlock].filter(Boolean).join("\n\n"),
              }) +
              // Un fichier joint = document à REMPLIR : on bascule en mode remplissage.
              (contextFiles.length ? "\n\n" + DOC_FILL_MODE : "") +
              "\n\n" + buildPreferencesBlock(preferences),
          },
        ]
      : [
          { type: "text", text: buildSystemStatic(target), cache_control: { type: "ephemeral" } },
          {
            type: "text",
            text: buildSystemDynamic([
              expertise ? `# FOCUS MÉTIER (agent spécialiste retenu pour cette demande)\n${expertise}` : "",
              brandName
                ? `# MARQUE DE L'EN-TÊTE\nLe \`.app-eyebrow\` de l'en-tête affiche « ${brandName.toUpperCase()} » (l'entreprise de l'utilisateur), PAS « Biltia ».`
                : "",
              sourcesBlock,
              // Portée des données choisie au questionnaire (tout / sélection / import).
              dataScopeBlock,
              // SOURCE UNIQUE : catalogue des entités canoniques + règle de liaison,
              // TOUJOURS injecté (même si la détection par mots-clés a raté) → une app
              // qui gère un concept du workspace l'écrit dans la vraie table partagée,
              // jamais dans une collection isolée. C'est ce qui garantit « toujours synchro ».
              buildEntityBindingCatalog(),
              // Entités détectées : schémas de champs détaillés + vraies données en live
              // via /api/data. Sinon, contexte workspace résumé (données d'exemple réelles).
              effectiveEntities.length ? buildDataModeBlock(effectiveEntities) : workspaceBlock,
              buildPreferencesBlock(preferences),
            ]),
          },
        ];

    const noun = isDocument ? "le document" : "l'application";

    // Mode PATCH : pour une modification d'app, le modèle renvoie des blocs
    // RECHERCHE/REMPLACE ciblés au lieu de réécrire toute l'app. Documents exclus
    // (déjà courts). Repli automatique sur la réécriture complète si un bloc ne
    // s'applique pas proprement (cf. applyTargetedEdits).
    const patchMode = isModification && !isDocument;
    // Le repérage/remplacement exact ne demande pas Opus : Sonnet est rapide,
    // fiable et bien moins cher. Le repli (réécriture) garde, lui, le modèle
    // dimensionné (Opus sur grosse app) pour ne rien perdre en qualité.
    const patchModel = TIER_MEDIUM;

    // Instruction de réécriture COMPLÈTE (création, document, et repli de modif).
    const userContent = isModification
      ? `Voici ${noun} HTML existant :\n\`\`\`html\n${previousHTML}\n\`\`\`\n\nDemande de modification de l'utilisateur : « ${prompt} »\n\nRenvoie ${noun} COMPLET et mis à jour intégrant cette modification.${
          isAutoFix
            ? `\n\n⚠️ MODE CORRECTION AUTOMATIQUE : la « demande » ci-dessus est un MESSAGE D'ERREUR remonté par l'app. Trouve la CAUSE et corrige-la, sans rien changer d'autre. À vérifier EN PREMIER (cause n°1 de « SyntaxError: missing ) after argument list ») : une APOSTROPHE FRANÇAISE dans une chaîne JS en quotes simples (ex : notify('L'opération…')) qui ferme la chaîne au milieu → repasse ces chaînes en DOUBLE quotes ou backticks. Vérifie ensuite les parenthèses/accolades/crochets non refermés autour de la ligne signalée.`
            : ""
        }

RÈGLE ABSOLUE DE MODIFICATION CHIRURGICALE : tu modifies UNIQUEMENT ce que la demande cible. TOUT LE RESTE reste STRICTEMENT IDENTIQUE :
- la PALETTE DE COULEURS existante (les valeurs actuelles de --vio, --grad, --glow, --tint, --tintline dans :root) — tu les RECOPIES à l'identique, tu n'en choisis JAMAIS une nouvelle ;
- la disposition, la navigation, les textes, les données d'exemple et les fonctionnalités existantes.
L'utilisateur a choisi son thème à la création : ne change PAS les couleurs de ta propre initiative. MAIS dès qu'il demande un changement de style (« mets le fond en rose », « passe l'accent en bleu », « enlève le dégradé », « agrandis le titre »), c'est une consigne EXPLICITE que tu appliques PLEINEMENT et VISIBLEMENT — jamais tu ne la refuses ni ne la minimises au nom de la préservation du thème (voir PRINCIPE ZÉRO). Tu touches alors la partie ciblée et RIEN d'autre.
(Seul cas de migration : si l'existant utilise l'ANCIENNE charte au fond ivoire #F7F5EF / teal #14B8A6, migre la structure vers le SYSTÈME DE DESIGN BILTIA sans rien perdre.)
RATTRAPAGE RESPONSIVE (amélioration attendue, PAS un écart) : si le CSS de l'app ne contient pas déjà le socle mobile à jour, AJOUTE-le sans toucher au reste — \`.table-wrap{overflow-x:auto}\` (au lieu de overflow:hidden qui coupe les colonnes), \`body{overflow-x:hidden;overflow-wrap:break-word}\`, \`img,svg,video,canvas{max-width:100%}\`, et un \`@media(max-width:520px)\` qui met les KPI sur 2 colonnes, réduit les paddings et laisse les gros chiffres revenir à la ligne. L'app doit s'afficher PARFAITEMENT à 375px de large (zéro débordement horizontal, cartes empilées).`
      : `Demande de l'utilisateur : « ${prompt} »\n\nConstruis ${noun} complet correspondant.`;

    // Instruction de modification CIBLÉE (mode patch) : le modèle n'émet QUE des
    // blocs RECHERCHE/REMPLACE, jamais l'app entière.
    const patchInstruction =
      `Voici l'application HTML existante :\n\`\`\`html\n${previousHTML}\n\`\`\`\n\n` +
      `Demande de modification de l'utilisateur : « ${prompt} »\n\n` +
      (isAutoFix
        ? `⚠️ MODE CORRECTION AUTOMATIQUE : la « demande » ci-dessus est un MESSAGE D'ERREUR remonté par l'app. Trouve la CAUSE (souvent une APOSTROPHE FRANÇAISE dans une chaîne JS en quotes simples, ex : notify('L'opération…'), ou une parenthèse/accolade/crochet non refermé) et corrige-la de façon CIBLÉE.\n\n`
        : "") +
      `Tu NE réécris PAS toute l'application. Tu produis UNIQUEMENT les changements nécessaires, sous forme de blocs de remplacement. Pour CHAQUE endroit à modifier, émets EXACTEMENT ce bloc (marqueurs compris) :\n\n` +
      `<<<<<<< RECHERCHE\n` +
      `(recopie ICI, CARACTÈRE POUR CARACTÈRE, le passage EXACT du HTML ci-dessus à remplacer — mêmes espaces et indentation, et assez de lignes pour que ce passage soit UNIQUE dans le fichier)\n` +
      `=======\n` +
      `(le nouveau passage qui le remplace)\n` +
      `>>>>>>> REMPLACE\n\n` +
      `RÈGLES STRICTES :\n` +
      `- Le bloc RECHERCHE doit correspondre MOT POUR MOT à du texte réellement présent dans le HTML ci-dessus (sinon la modification est rejetée).\n` +
      `- Donne assez de contexte pour que le passage soit UNIQUE (jamais une accolade ou une balise seule qui apparaît partout).\n` +
      `- Un bloc par endroit à changer ; ne touche à RIEN d'autre (ni couleurs, ni mise en page, ni fonctions non visées).\n` +
      `- CONSERVE la palette existante (--vio, --grad, --glow, --tint, --tintline) SAUF si l'utilisateur demande explicitement un changement de style — dans ce cas applique-le pleinement et visiblement (PRINCIPE ZÉRO).\n` +
      `- Ne produis AUCUN autre texte : ni explication, ni fence \`\`\`, UNIQUEMENT les blocs RECHERCHE/REMPLACE.`;

    // Fichiers joints → blocs multimodaux AVANT le texte (captures, PDF).
    const withFiles = (text: string): Anthropic.MessageParam["content"] =>
      contextFiles.length
        ? [
            ...contextFiles.map<Anthropic.ContentBlockParam>((f) =>
              f.mediaType === "application/pdf"
                ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } }
                : {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: f.mediaType as "image/png" | "image/jpeg" | "image/webp",
                      data: f.data,
                    },
                  }
            ),
            {
              type: "text",
              text: `${text}\n\n(Les fichiers joints ci-dessus montrent le problème ou servent de référence : prends-les en compte dans ta réponse.)`,
            },
          ]
        : text;

    const firstUserContent = patchMode ? withFiles(patchInstruction) : withFiles(userContent);

    // ── GÉNÉRATION STREAMÉE (SSE) : le HTML arrive au fur et à mesure → le client
    // construit l'aperçu EN DIRECT (fini l'attente aveugle). Validation, sauvegarde
    // et réconciliation des crédits se font à la fin, puis { type:"done", … } porte
    // le résultat. Un échec envoie { type:"error" } (crédits remboursés).
    const buildEnc = new TextEncoder();
    const buildStream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(buildEnc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        try {
          // Une passe de génération streamée, avec continuation si le modèle
          // s'arrête sur max_tokens. `stream=true` pousse le texte au client en
          // direct (création) ; `false` = passe silencieuse (repérage patch, que
          // le client n'affiche de toute façon pas pendant une modification).
          const runTurns = async (
            initialContent: Anthropic.MessageParam["content"],
            model: string,
            stream: boolean
          ): Promise<{ text: string; inTok: number; outTok: number; stopReason: string | null }> => {
            const messages: Anthropic.MessageParam[] = [{ role: "user", content: initialContent }];
            let text = "";
            let inTok = 0;
            let outTok = 0;
            let stopReason: string | null = null;
            const MAX_TURNS = 4;
            for (let turn = 0; turn < MAX_TURNS; turn++) {
              const ms = client.messages.stream({ model, max_tokens: MAX_TOKENS, system, messages });
              let turnText = "";
              for await (const ev of ms) {
                if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
                  turnText += ev.delta.text;
                  text += ev.delta.text;
                  if (stream) send({ type: "html", text: ev.delta.text });
                }
              }
              const finalMsg = await ms.finalMessage();
              inTok += finalMsg.usage.input_tokens;
              outTok += finalMsg.usage.output_tokens;
              stopReason = finalMsg.stop_reason;
              if (finalMsg.stop_reason === "max_tokens") {
                messages.push({ role: "assistant", content: turnText });
                messages.push({
                  role: "user",
                  content: stream
                    ? "Continue exactement où tu t'es arrêté, sans rien répéter ni rouvrir de balise déjà fermée. Termine le fichier HTML."
                    : "Continue exactement où tu t'es arrêté, sans rien répéter. Termine les blocs RECHERCHE/REMPLACE.",
                });
                continue;
              }
              break;
            }
            return { text, inTok, outTok, stopReason };
          };

          let html = "";
          let stopReason: string | null = null;
          let inTok = 0;
          let outTok = 0;
          let usedModel = buildModel;

          if (patchMode) {
            // 1) Repérage ciblé (Sonnet, silencieux) → blocs RECHERCHE/REMPLACE.
            const patchRun = await runTurns(firstUserContent, patchModel, false);
            inTok += patchRun.inTok;
            outTok += patchRun.outTok;
            const patched = applyTargetedEdits(previousHTML, stripFences(patchRun.text));
            if (patched != null) {
              html = patched;
              stopReason = patchRun.stopReason;
              usedModel = patchModel;
            } else {
              // 2) Repli : un bloc n'a pas collé proprement → réécriture complète
              // (comportement historique), streamée et sur le modèle dimensionné.
              const fullRun = await runTurns(withFiles(userContent), buildModel, true);
              inTok += fullRun.inTok;
              outTok += fullRun.outTok;
              html = fullRun.text;
              stopReason = fullRun.stopReason;
              usedModel = buildModel;
            }
          } else {
            const run = await runTurns(firstUserContent, buildModel, true);
            inTok += run.inTok;
            outTok += run.outTok;
            html = run.text;
            stopReason = run.stopReason;
            usedModel = buildModel;
          }

    html = stripFences(html);

    if (!html.toLowerCase().includes("</html>")) {
      if (!html.toLowerCase().includes("</body>")) html += "\n</body>";
      html += "\n</html>";
    }

    const problem = validateHtml(html);
    if (problem) {
      console.error("Generated HTML failed validation:", problem);
      // Rembourser les crédits si la génération échoue (seulement si on en a déduit).
      // refund_credits est réservé au rôle service_role (cf. migration 003) : on
      // rembourse via le client admin, jamais via la session `authenticated`.
      // Encapsulé pour ne jamais transformer le 502 en 500 en cas d'échec.
      if (holdCredits > 0) {
        try {
          const admin = createAdminClient();
          if (admin) {
            await admin.rpc("refund_credits", { p_user_id: user.id, p_amount: holdCredits });
          }
        } catch (refundErr) {
          console.error("Refund failed after generation error:", refundErr);
        }
      }
      // Signal qualité (best-effort) : génération ratée = coût brûlé + risque churn.
      try {
        await supabase.from("app_events").insert({
          user_id: user.id,
          tenant_id: tenantId,
          event_type: "generation_failed",
          agent: route.agent,
          sector,
          app_type: route.appType,
          prompt_length: prompt.length,
          metadata: { kind, doc_type: docType, build_model: buildModel, reason: "incomplete" },
        });
      } catch {
        // le tracking ne bloque jamais la réponse
      }
      send({ type: "error", error: "La génération s'est mal terminée (résultat incomplet). Réessayez — vos crédits ont été remboursés." });
      controller.close();
      return;
    }

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const name = titleMatch
      ? titleMatch[1].trim()
      : isDocument
        ? "Mon document BTP"
        : "Mon application BTP";

    // Documents : injecter la barre « Imprimer / PDF » + les pavés de signature
    // tactiles (plomberie critique gérée serveur, jamais déléguée au LLM).
    if (isDocument) {
      html = injectDocumentRuntime(html);
    } else {
      // TOUTES les apps (connectées ou non) reçoivent le SDK window.biltia :
      // persistance CLOUD (entités workspace OU collection générique via app_records),
      // extraction photo et transcription. Idempotent — n'écrase pas un SDK présent.
      html = injectBiltiaSDK(html);
      // Moteur de graphiques interactifs (signature Biltia) : drawArea/drawBars/
      // chartCountUp + classes .chart-* pré-chargés dans chaque app générée. Le
      // prompt demande au modèle de les APPELER ; ici on garantit qu'ils existent.
      html = injectChartEngine(html);
    }

    // ── Crédits : coût réel + réconciliation du hold (best-effort) ────────────
    // TOUJOURS journalisé (avant, l'auto-fix des non-fondateurs était invisible
    // dans ai_usage → fuite de marge intraçable). Débit :
    //   • création/modification : reconcile du hold vers le coût réel (existant) ;
    //   • auto-fix (hold 0)     : débité à son coût réel (décision user 2026-07-05
    //     — le prix du flux reflète le vrai total). Solde insuffisant → on ne
    //     bloque pas (l'app est déjà réparée) : la passe est offerte mais tracée.
    let realCredits = holdCredits;
    try {
      const tracked = await trackAiUsage({
        supabase,
        userId: user.id,
        tenantId,
        action: isModification ? "edit_app" : "create_app",
        model: usedModel,
        inputTokens: inTok,
        outputTokens: outTok,
        agent: route.agent,
        sector: sector ?? undefined,
        promptType: isAutoFix ? "autofix" : isModification ? "modify" : "create",
      });
      if (founder) {
        realCredits = 0; // journalisé pour le suivi des coûts, jamais débité
      } else if (holdCredits > 0) {
        realCredits = tracked;
        await reconcileCredits(supabase, createAdminClient(), user.id, holdCredits, realCredits);
      } else if (isAutoFix) {
        const { data: debited } = await supabase.rpc("deduct_credits", { p_amount: tracked });
        realCredits = debited ? tracked : 0;
      }
    } catch (meterErr) {
      console.error("Metering failed after generation:", meterErr);
    }

    // ── Tracking (best-effort) — avec tenant_id ───────────────────────────────
    try {
      await supabase.from("app_events").insert({
        user_id: user.id,
        tenant_id: tenantId,
        event_type: isModification ? "app_edited" : "app_created",
        agent: route.agent,
        sector,
        app_type: route.appType,
        format: target,
        prompt_length: prompt.length,
        metadata: {
          route_method: route.method,
          confidence: route.confidence,
          kind,
          doc_type: docType,
          kind_method: kindMethod,
          kind_confidence: kindConfidence,
          build_model: usedModel,
          connected_entities: connectedEntities,
          rag_used: ragChunks.length > 0,
          rag_chunks: ragChunks.length,
        },
      });
    } catch {
      // Le tracking ne bloque jamais la réponse.
    }

    // Journal d'activité (page Activité) — best-effort.
    await logActivity(supabase, {
      tenantId,
      userId: user.id,
      action: isDocument ? "document" : "generate",
      entityType: isDocument ? "document" : "application",
      description: isModification
        ? `« ${name} » mis à jour avec l'IA`
        : `« ${name} » généré avec l'IA`,
    });

    // Notification push « tâche terminée » (préférence IA, activée par défaut).
    // Utile quand l'utilisateur a changé d'onglet pendant la génération.
    // Fire-and-forget : ne bloque jamais la réponse.
    if (preferences.ai_notifications && !isAutoFix) {
      void sendPushToUser(user.id, {
        title: isDocument ? "Document prêt" : "Application prête",
        body: isModification ? `« ${name} » a été mis à jour.` : `« ${name} » est prêt(e) à l'emploi.`,
        url: "/library",
        tag: "biltia-generate",
      });
    }

          send({
            type: "done",
            html,
            name,
            tenantId,
            truncated: stopReason === "max_tokens",
            agent: route.agent,
            appType: route.appType,
            kind,
            docType,
            actionFallback: kind === "action",
            dataMode: connectedEntities,
            creditsUsed: realCredits,
          });
          controller.close();
        } catch (streamErr) {
          console.error("Streamed generation error:", streamErr);
          if (holdCredits > 0) {
            try {
              const admin = createAdminClient();
              if (admin) await admin.rpc("refund_credits", { p_user_id: user.id, p_amount: holdCredits });
            } catch {
              /* remboursement best-effort */
            }
          }
          try {
            send({ type: "error", error: "La génération a échoué. Réessayez — vos crédits ont été remboursés." });
          } catch {
            /* flux déjà fermé */
          }
          try {
            controller.close();
          } catch {
            /* flux déjà fermé */
          }
        }
      },
    });
    return new Response(buildStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Generation error:", err);

    let msg = "Erreur de génération. Réessayez.";
    let status = 500;

    if (err instanceof Anthropic.APIError) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiMsg = (err as any)?.error?.error?.message ?? "";
      status = err.status ?? 500;

      if (/credit balance is too low|billing/i.test(apiMsg)) {
        msg = "Solde Anthropic insuffisant. Ajoutez des crédits sur console.anthropic.com → Plans & Billing pour activer la génération.";
      } else if (err.status === 401) {
        msg = "Clé API Anthropic invalide. Vérifiez ANTHROPIC_API_KEY dans .env.local.";
      } else if (err.status === 429) {
        msg = "Trop de requêtes vers Anthropic. Patientez quelques secondes et réessayez.";
      } else if (apiMsg) {
        msg = `Erreur Anthropic (${err.status}) : ${apiMsg}`;
      } else {
        msg = `Erreur Anthropic (${err.status}). Vérifiez votre clé et votre facturation.`;
      }
    }

    return Response.json({ error: msg }, { status });
  }
}
