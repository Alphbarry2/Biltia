import Anthropic from "@anthropic-ai/sdk";
import { routeRequest } from "@/lib/router";
import { getCategory } from "@/lib/sectors";
import { buildKnowledgeBlock } from "@/lib/btp-catalog";
import { classifyKind, coerceKind, looksLikePureQuestion, extractCalendarEvent, type BiltiaKind } from "@/lib/kind-router";
import { gmailStatus, sendGmail } from "@/lib/gmail";
import { readAgenda, createEvent } from "@/lib/gcal";
import { classifyQuestionTopic } from "@/lib/question-topics";
import { buildDocumentSystemPrompt, injectDocumentRuntime } from "@/lib/document-generator";
import { assessDocumentReadiness } from "@/lib/document-context";
import { retrieveContext, buildSourcesBlock } from "@/lib/rag";
import { detectConnectedEntities, buildDataModeBlock } from "@/lib/data-entities";
import {
  buildPreferencesBlock,
  normalizePreferences,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/lib/user-preferences";
import { injectBiltiaSDK } from "@/lib/biltia-sdk";
import { getWorkspaceContext, buildWorkspaceBlock } from "@/lib/workspace-context";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { trackAiUsage, reconcileCredits } from "@/lib/ai-usage";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { getEntitlementsForTenant, FROZEN_MESSAGE } from "@/lib/entitlements";
import { isFounderEmail } from "@/lib/founder";
import { logActivity } from "@/lib/activity";
import { sendPushToUser } from "@/lib/push";
import { createAgentRule } from "@/lib/agent-rules";
import { runAgentLoop, buildWorkspaceToolsSystem } from "@/lib/agent-tools";
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

## TECHNIQUE (obligatoire)
1. Un seul fichier HTML complet : commence par \`<!DOCTYPE html>\`, finit par \`</html>\`. Rien d'autre.
2. PAS de Tailwind CDN — CSS pur inline dans \`<style>\` uniquement.
3. Google Fonts Inter : \`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">\`.
4. Persistance RÉELLE en localStorage : clé unique \`biltia_<slug>\`. Tout survit au rechargement.
5. JavaScript vanilla complet et FONCTIONNEL : CRUD, recherche, filtre, tri. AUCUNE fonction "à faire plus tard".
6. Pré-remplis 2-3 lignes d'exemple réalistes au premier lancement. Bouton discret "Effacer les exemples".

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
3. TABLEAU DE BORD VIVANT : hero + KPIs calculés EN DIRECT depuis les données + 1-2 visuels simples en CSS/SVG pur (barres de progression, donut, mini-histogramme) + liste « à traiter en priorité » (retards, échéances proches) dont chaque élément est cliquable.
4. CHAQUE BOUTON FONCTIONNE : si un bouton est affiché, son action est implémentée et vérifiable. Export CSV = VRAI téléchargement (\`new Blob([csv],{type:'text/csv'})\` + \`URL.createObjectURL\` + \`<a download>\` cliqué en JS). Imprimer = \`window.print()\` avec \`@media print\` propre. JAMAIS de bouton décoratif, JAMAIS d'\`alert('Bientôt disponible')\`.
5. WORKFLOWS MÉTIER : changement de statut en un clic (À faire → En cours → Terminé), calculs qui se propagent immédiatement (avancement moyen, totaux, marges), alertes automatiques (retard, dépassement de budget).
6. RESPIRATION : sections espacées de 24-32px, gaps de grille 14-18px, padding interne des cards 20-24px. L'écran respire — jamais tassé, jamais de grands vides.

## LE SAUT « PRODUIT QU'ON A ENVIE D'OUVRIR » (c'est ICI qu'on gagne, pas dans les couleurs)
Un dashboard + une liste + une fiche « label : valeur » = un Excel déguisé, même joli. Un VRAI produit se reconnaît à 6 choses. Applique-les TOUTES, sinon l'app reste tiède :

1. UN VISUEL SIGNATURE QUI RACONTE L'HISTOIRE (pas juste des barres horizontales). Au moins UN graphique riche en SVG pur, choisi selon le métier :
   - répartition / proportions → DONUT ou jauge semi-circulaire, le total au centre ;
   - évolution dans le temps (CA, encaissements, heures) → COURBE avec aire dégradée sous le trait ;
   - planning / échéances → mini-CALENDRIER ou frise chronologique ;
   - pipeline / étapes (devis → signé → facturé → payé) → entonnoir ou colonnes façon kanban.
   Il se lit d'un coup d'œil et s'anime à l'apparition (segments/courbe/barres se remplissent en 400-600ms).

2. ORIENTÉ TÂCHE, PAS DONNÉES. L'écran d'accueil répond à « qu'est-ce que je dois faire MAINTENANT ? ». En tête, une zone « À TRAITER » actionnable où CHAQUE ligne porte son action directe (« Relancer », « Marquer payé », « Planifier »). L'action la plus précieuse du métier est atteignable en 1 geste, jamais enfouie.

3. LA FICHE DÉTAIL EST UNE VRAIE FICHE, PAS UNE COLONNE DE « label : valeur ». Structure imposée : une carte de synthèse en haut (LE chiffre + le statut + les 1-2 actions clés) ; un ANNEAU DE PROGRESSION SVG pour tout ratio (% encaissé, avancement) ; une FRISE VERTICALE datée pour l'historique (relances, paiements, événements) avec pastilles ; les infos regroupées en sections titrées — JAMAIS 10 lignes label:valeur à la suite. Les entités liées sont cliquables (facture → client → chantier).

4. DE LA VIE, DES DÉTAILS HUMAINS :
   - Personnes & clients = pastille ronde avec initiales, couleur dérivée du nom (jamais du texte gris nu).
   - Chiffres importants = COMPTE-UP animé à l'ouverture (0 → valeur en ~700ms, format FR).
   - Dates en langage humain : « il y a 3 jours », « dans 5 jours », « aujourd'hui ».
   - Statuts = chip couleur + petite icône SVG (pas juste un mot).
   - Action positive clé réussie (encaissé, chantier terminé) = micro-célébration : coche qui se dessine / léger burst + biltia.notify.

5. L'ÉCRAN EST PLEIN, JAMAIS UN GRAND VIDE EN BAS (surtout desktop). Compose une grille qui OCCUPE la hauteur : colonne principale + rail droit (activité récente, prochaines échéances, mini-calendrier). Contenu court → ajoute une section UTILE (résumé, raccourcis) plutôt que 40% de blanc. Le vide en bas de page est un défaut, pas une respiration.

6. VARIE LA COQUILLE SELON LE JOB, ne recolle pas toujours « héro + KPI + table ». Un outil de PLANNING s'ouvre sur un calendrier ; un outil de RELANCES sur une file de priorité ; un GÉNÉRATEUR DE DEVIS sur le document. Le squelette suit la tâche, pas l'inverse.

La richesse vient du CONTENU et des VISUELS, pas d'un 2ᵉ dégradé ni de couleurs criardes : garde le système de design ci-dessous à la lettre.

## PRINCIPE VISUEL N°1 — SIMPLE ET ÉPURÉ (c'est ÇA le wow, PAS la densité)
Réfère-toi à Lovable / Linear : clair, calme, évident. La beauté vient de la CLARTÉ et de l'ESPACE, jamais de la surcharge ni des couleurs vives.
- Des cartes BLANCHES propres, beaucoup de blanc, UN accent discret. L'écran doit respirer.
- MOINS d'éléments, mieux espacés. Si un visuel ou une section n'est pas VRAIMENT utile, ENLÈVE-LE. Dans le doute, retire.
- JAMAIS de gros bloc de couleur saturée. JAMAIS de mise en page bancale (une carte seule à côté d'un grand vide, un KPI orphelin).
- La richesse est FONCTIONNELLE (boutons qui marchent, navigation réelle, vraies données, calculs), PAS visuelle. En regardant l'écran, l'artisan doit se dire en 2 secondes « c'est propre, c'est clair, je sais quoi faire ».
Cette règle PRIME sur toute envie d'en mettre plus : dans le doute entre « plus riche » et « plus épuré », choisis TOUJOURS plus épuré.

## SYSTÈME DE DESIGN BILTIA — CSS OBLIGATOIRE

C'est l'identité Biltia : fond clair #FCFCFD, cards blanches très arrondies (18-24px),
ombres douces violacées, UN accent violet #7C3AED et LE dégradé signature
indigo→violet→rose. Simple, épuré, waouh. Inclus CE BLOC EXACT dans le \`<style>\`
de chaque app, puis ajoute uniquement le CSS spécifique à ton app.

DEBUT_CSS
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#FCFCFD;--ink:#0A0A0A;--mut:#6E6E6C;--faint:#9A9AA6;--line:#ECECF2;--soft:#F6F6F9;
/* THÈME (à remplacer selon la palette choisie — voir THÈME COULEUR) */
--vio:#7C3AED;--grad:linear-gradient(135deg,#6366F1,#A855F7 45%,#EC4899);--glow:139,92,246;--tint:#F3EFFC;--tintline:#E2D9F8;
--shadow:0 1px 3px rgba(20,20,40,.05),0 8px 24px rgba(20,20,40,.06);--shadow-lg:0 12px 40px rgba(20,20,40,.14)}
body{background:var(--bg);font-family:'Inter',system-ui,sans-serif;color:var(--ink);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}
.card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:20px;overflow:hidden;box-shadow:var(--shadow)}
.hero{position:relative;margin:16px;padding:24px 22px;border-radius:24px;color:var(--ink);background:#fff;border:1px solid var(--line);box-shadow:var(--shadow);overflow:hidden}
.hero::after{content:"";position:absolute;right:-52px;top:-52px;width:180px;height:180px;border-radius:50%;background:var(--tint);opacity:.75}
.hero-label{position:relative;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--vio)}
.hero-value{position:relative;font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1.15;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hero-sub{position:relative;font-size:12.5px;color:var(--mut)}
.kpi{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;gap:5px;overflow:hidden;box-shadow:var(--shadow)}
.kpi-label{font-size:10px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-value{font-size:25px;font-weight:800;color:var(--ink);line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-sub{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;cursor:pointer;font-family:inherit;font-weight:600;transition:all .18s;border-radius:12px;white-space:nowrap;font-size:13px;padding:10px 18px}
.btn:active{transform:scale(.97)}
.btn-primary{background:var(--grad);color:#fff;box-shadow:0 6px 18px rgba(var(--glow),.35)}
.btn-primary:hover{box-shadow:0 8px 26px rgba(var(--glow),.5)}
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
.fab{position:fixed;right:16px;bottom:86px;z-index:120;width:54px;height:54px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:26px;line-height:1;background:var(--grad);box-shadow:0 10px 28px rgba(var(--glow),.45);display:flex;align-items:center;justify-content:center;transition:transform .18s}
.fab:active{transform:scale(.94)}
.app-main{padding-top:68px;padding-bottom:78px;min-height:100vh}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;padding:0 16px 16px}
.search-bar{padding:0 16px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.section-pad{padding:0 16px 16px}
.table-wrap{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:var(--shadow)}
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
FIN_CSS

### STRUCTURE HTML TYPE (adapte les champs au besoin métier) :

Utilise toujours cette structure :
- \`<header class="app-header">\` fixe : \`.app-eyebrow\` (la marque — le bloc « MARQUE DE L'EN-TÊTE » du prompt donne le nom exact ; à défaut « BILTIA ») + \`.app-title\`, et à droite UN bouton \`.btn btn-primary btn-sm\`.
- \`<main class="app-main">\`.
- L'ÉLÉMENT MARQUANT en premier : \`<section class="hero">\` avec \`.hero-label\`, \`.hero-value\` (LE chiffre qui compte pour ce métier : CA du mois, chantiers en cours, heures de la semaine…) et \`.hero-sub\`. UN seul héro par app — c'est lui qu'on remarque.
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

### MOBILE & ANTI-CHEVAUCHEMENT — BUGS INTERDITS (ils reviennent trop souvent) :
1. RIEN SOUS LES BARRES FIXES : tout le contenu vit dans \`.app-main\` (padding-top 68px, padding-bottom 78px déjà prévus). \`.app-header\` et \`.tab-bar\` ne recouvrent JAMAIS le contenu ni un bouton. UN SEUL \`.app-header\`, UNE SEULE \`.tab-bar\`, UN SEUL \`.fab\` dans toute l'app.
2. TEXTE DE BOUTON TOUJOURS LISIBLE : sur fond dégradé/coloré → texte blanc \`#fff\`, jamais sombre ni gris pâle (contraste AA mini). Un bouton à icône seule reçoit un \`aria-label\`. Jamais de libellé coupé : si le bouton est étroit, garde le texte lisible OU passe en icône seule.
3. CIBLES TACTILES ≥ 44px de haut sur mobile (boutons, onglets, lignes cliquables, \`.fab\`) et ≥ 8px d'écart entre deux éléments cliquables — jamais collés ni superposés.
4. LA \`.tab-bar\` EN BAS EST MOBILE UNIQUEMENT. Sur desktop, navigation en sidebar ou top-nav, PAS une barre d'onglets flottante en bas.
5. TEST MENTAL À 360px DE LARGE avant de rendre : zéro débordement horizontal, aucun texte qui passe sous un autre, aucun bouton coupé par le bord, aucun bloc \`position:absolute\` superposé hors du \`.hero\`.
6. MODALES : \`max-height:88vh\` + \`overflow-y:auto\`, et la barre d'actions (\`.modal-actions\`) TOUJOURS atteignable (collée en bas si le contenu est long) — jamais un « Valider » injoignable sous le pli.

### THÈME COULEUR (varie d'une app à l'autre) :
La structure et la qualité ne changent JAMAIS ; seule la palette d'accent change, via les
5 variables \`--vio\` (accent), \`--grad\` (dégradé), \`--glow\` (RGB pour les ombres),
\`--tint\` (fond pâle), \`--tintline\` (bordure pâle) du :root. Palettes disponibles :
- **violet** : #7C3AED · linear-gradient(135deg,#6366F1,#A855F7 45%,#EC4899) · 139,92,246 · #F3EFFC · #E2D9F8
- **ocean** : #0284C7 · linear-gradient(135deg,#0EA5E9,#6366F1) · 14,165,233 · #EFF8FF · #BAE2FD
- **foret** : #059669 · linear-gradient(135deg,#10B981,#0EA5E9) · 16,185,129 · #ECFDF5 · #A7F3D0
- **ambre** : #D97706 · linear-gradient(135deg,#F59E0B,#EF4444) · 245,158,11 · #FFFBEB · #FDE68A
- **corail** : #E11D48 · linear-gradient(135deg,#F43F5E,#A855F7) · 225,29,72 · #FFF1F2 · #FECDD3
- **graphite** : #334155 · linear-gradient(135deg,#475569,#94A3B8) · 51,65,85 · #F1F5F9 · #CBD5E1

RÈGLES :
- Ces règles de choix valent UNIQUEMENT À LA CRÉATION. En MODIFICATION d'une app
  existante, tu RECOPIES la palette en place à l'identique (voir la règle de
  modification chirurgicale) — jamais de nouveau tirage.
- Si la demande précise un thème (réponse au questionnaire, ex. « Thème couleur : ocean »),
  applique CETTE palette. Sinon, choisis une palette SOBRE adaptée au métier (violet, ocean,
  foret, graphite = les plus sûrs). ÉVITE les palettes très saturées (ambre, corail) sauf si
  l'utilisateur les demande explicitement — elles rendent l'app criarde. Dans le doute : violet.
- Si l'utilisateur DÉCRIT sa palette librement (ex. « des tons orangés chaleureux », « bleu
  marine et doré »), DÉRIVE toi-même les 5 variables (--vio, --grad, --glow, --tint,
  --tintline) dans cet esprit : accent saturé lisible, dégradé harmonieux à 2-3 teintes
  voisines, tint pâle assorti. Le fond #FCFCFD et les cards blanches restent INCHANGÉS.
- Fond de page \`#FCFCFD\` et cards blanches, bordure \`#ECECF2\`, arrondis 18-24 px : identiques quelle que soit la palette. JAMAIS de fond ivoire/beige.
- La couleur/le dégradé reste DISCRET, par petites touches : \`.btn-primary\`, \`.fab\`, \`.prog-fill\`, \`.step-dot.done\`, petites puces. AUCUN grand aplat de couleur saturée. Le hero et TOUTES les cartes restent CLAIRS (fond blanc, texte sombre). L'écran est majoritairement blanc : la couleur PONCTUE, elle ne domine jamais.
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
   ou \`biltia.notify('Enregistré')\` pour les actions sans effet visible.

## FIABILITÉ — ZÉRO BUG
- Chaque onclick → fonction définie. Zéro référence morte.
- localStorage : toujours try/catch + \`|| []\`. Jamais de null.map.
- render() appelé après chaque modification.
- Calculs : Number() sur tout, || 0 sur vide. Jamais de NaN affiché.
- HTML valide : une seule \`<html>\`, \`<head>\`, \`<body>\`, \`</html>\`.
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
- Mise en page une seule colonne, pensée pour le pouce : largeur ~ max-w-md centrée, tout empilé verticalement.
- Boutons GRANDS (min 48px de haut), zones de tap larges, texte lisible.
- Données en CARTES empilées plutôt qu'en tableau large. Bouton d'action flottant \`.fab\` (dégradé signature) en bas à droite.
- Navigation simple, pas de survol indispensable. Optimisé pour une utilisation rapide avec des gants.`;
  }
  return `
# FORMAT CIBLE : ADAPTATIF (responsive)
- L'app doit être parfaite sur mobile ET desktop. Cartes empilées sur petit écran, tableau/grille sur grand écran (via @media).
- Sur grand écran : le contenu occupe TOUTE la largeur (\`width:100%\`, pas de \`max-width\` sur le conteneur principal) — jamais de grande zone vide à droite.
- Boutons confortables au doigt, FAB sur mobile, en-tête classique sur desktop.`;
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
    if (isAutoFix) {
      // Auto-fix : on itère toujours sur le livrable existant, pas de reclasse.
      kind = providedKind ?? "module";
      docType = typeof body.docType === "string" ? body.docType : null;
    } else {
      const k = await classifyKind({ prompt, sector, hasExistingApp: isModification });
      logAuxUsage(k.usage, "classify_kind");
      emailDraft = k.email;
      // App ouverte : une demande n'est traitée en RÉPONSE TEXTE que si
      // l'heuristique locale confirme une pure question. Sinon, un « corrige
      // les espaces blancs » mal classé répondrait en texte au lieu de
      // MODIFIER l'app — l'utilisateur croit que la modification est morte.
      if (k.kind === "answer" && (!isModification || looksLikePureQuestion(prompt))) {
        kind = "answer";
        kindConfidence = k.confidence;
        kindMethod = k.method;
      } else if (providedKind) {
        // Modification : on conserve le format du livrable ouvert.
        kind = providedKind;
        docType = typeof body.docType === "string" ? body.docType : null;
      } else {
        kind = k.kind;
        docType = k.docType;
        kindConfidence = k.confidence;
        kindMethod = k.method;
      }
    }
    const isAnswer = kind === "answer";

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
          message: `Votre messagerie Gmail n'est pas connectée, je ne peux pas l'envoyer à votre place. Connectez-la dans les intégrations, ou voici le message prêt à copier :\n\nÀ : ${to}\nObjet : ${subject}\n\n${bodyText}`,
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

    // ── CALENDAR : consulter l'agenda connecté. Intention comprise → vérif
    // connexion en lazy → lecture réelle des 7 prochains jours. Pas connecté →
    // on propose de connecter (jamais « je ne peux pas »).
    if (kind === "calendar" && !isModification && !isAutoFix) {
      // Extraction dédiée : lecture vs création + détails du RDV (date résolue).
      const calIntent = await extractCalendarEvent(prompt);
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
        const why =
          created.reason === "not_connected"
            ? "Ton agenda Google n'est pas connecté. Connecte-le dans les intégrations et je m'en occupe."
            : created.reason === "missing_scope"
              ? "L'autorisation d'écriture de l'agenda n'est pas accordée — reconnecte ton compte Google avec l'accès Agenda."
              : "Je n'ai pas pu créer l'événement pour le moment. Réessaie dans un instant.";
        return Response.json({ kind: "calendar", status: created.reason, message: why });
      }

      // LECTURE de l'agenda (défaut).
      const cal = await readAgenda({ tenantId, userId: user.id });
      if (cal.ok) {
        return Response.json({ kind: "calendar", status: "ok", message: cal.summary });
      }
      const msg =
        cal.reason === "not_connected"
          ? "Ton agenda Google n'est pas connecté. Connecte-le dans les intégrations et je te lis ta semaine."
          : cal.reason === "missing_scope"
            ? "L'autorisation de lecture de l'agenda n'est pas accordée — reconnecte ton compte Google avec l'accès Agenda."
            : "Je n'ai pas pu lire ton agenda pour le moment. Réessaie dans un instant.";
      return Response.json({ kind: "calendar", status: cal.reason, message: msg });
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
      return Response.json({
        kind: "rule",
        ok: recruited.ok,
        blocked: recruited.blocked,
        ruleId: recruited.ruleId,
        message: recruited.message,
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

## Ta réponse finale (français, brève)
- Opération faite → confirme FACTUELLEMENT ce qui a été fait, avec les valeurs clés (« ✓ Client **Jean Dupont** ajouté (06 12 34 56 78) »).
- Ambiguïté → liste les fiches candidates et demande laquelle. Tu n'as RIEN modifié.
- Introuvable → dis-le honnêtement et propose la création si pertinent.
- Jamais de jargon technique (pas d'uuid, pas de nom de table) dans la réponse.`,
          userMessage: prompt,
          db: supabase,
          actor: { tenantId, userId: user.id, label: "Assistant" },
          maxIterations: 6,
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
    if (kind === "document" && !isModification && !isAutoFix && !body.contextProvided) {
      const wsSnapshot = await getWorkspaceContext(supabase, tenantId)
        .then((ws) => buildWorkspaceBlock(ws))
        .catch(() => "");
      const gate = await assessDocumentReadiness({ prompt, docType, workspace: wsSnapshot }).catch(
        () => null
      );
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
    const [route, workspaceBlock, brandName] = await Promise.all([
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
    ]);
    logAuxUsage(route.usage, "route_agent");
    // Focus métier : connaissance des sous-corps de la catégorie retenue.
    const cat = route.agent !== "generalist" ? getCategory(route.agent) : undefined;
    const expertise = cat ? buildKnowledgeBlock(cat.subTrades.map((s) => s.id)) : undefined;

    // ── RAG : récupération de sources VÉRIFIÉES (bibliothèque BTP globale +
    // documents privés du tenant). Client authentifié → RLS → le tenant ne voit
    // que le global + ses docs. Jamais bloquant : [] si Mistral/pgvector indispo.
    const tradeIds = cat ? cat.subTrades.map((s) => s.id) : [];
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
- Ne fabrique JAMAIS une donnée, un chiffre ou une fonctionnalité. Si tu ne sais pas, dis-le en une ligne et propose l'action réelle.
- Chiffres exacts. TVA France : 20 % neuf, 10 % rénovation, 5,5 % rénovation énergétique. TVA Belgique : 21 % neuf, 6 % rénovation (logement > 10 ans). France par défaut. Cas principal, puis la nuance en une ligne.
- Question sur les données de l'entreprise (clients, chantiers, devis…) → utilise le CONTEXTE WORKSPACE ci-dessous et cite les vrais chiffres. Vide → dis-le simplement, ne devine jamais.
- Si des SOURCES sont fournies, elles priment.

TES OUTILS (ne te dévalorise JAMAIS) :
- Biltia se connecte à Gmail (envoyer des emails), Google Agenda (lire/créer des rendez-vous) et Google Drive (fichiers).
- Si la demande a besoin d'un de ces outils, considère qu'il peut être connecté : réponds « Ton [Gmail/agenda/Drive] n'est pas connecté — connecte-le dans les intégrations et je m'en occupe. » Ne dis JAMAIS « je ne peux pas » ni « ce n'est pas dans mes capacités » : c'est à une connexion près.`,
        expertise ? `\n# FOCUS MÉTIER\n${expertise}` : "",
        sourcesBlock ? `\n${sourcesBlock}` : "",
        workspaceBlock ? `\n${workspaceBlock}` : "",
      ].join("\n");

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
              model: ANSWER_MODEL,
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
                  model: ANSWER_MODEL,
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

    // Moteur : Opus 4.8 pour les grosses apps de gestion, Sonnet 4.6 sinon.
    const buildModel = pickBuildModel({
      prompt,
      isDocument,
      isModification,
      previousHTMLLength: typeof previousHTML === "string" ? previousHTML.length : 0,
      connectedEntities,
    });

    // Système en blocs : socle statique mis en cache (prompt caching Anthropic),
    // queue dynamique (métier, RAG, workspace, préférences) à la suite.
    const system: Anthropic.TextBlockParam[] = isDocument
      ? [
          {
            type: "text",
            text:
              buildDocumentSystemPrompt({ docType, expertise, sources: sourcesBlock, workspace: workspaceBlock }) +
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
              // Modules connectés : les vraies données arrivent en live via /api/data,
              // pas de graine figée. Modules non connectés : on injecte le contexte.
              connectedEntities.length ? buildDataModeBlock(connectedEntities) : workspaceBlock,
              buildPreferencesBlock(preferences),
            ]),
          },
        ];

    const noun = isDocument ? "le document" : "l'application";
    const userContent = isModification
      ? `Voici ${noun} HTML existant :\n\`\`\`html\n${previousHTML}\n\`\`\`\n\nDemande de modification de l'utilisateur : « ${prompt} »\n\nRenvoie ${noun} COMPLET et mis à jour intégrant cette modification.

RÈGLE ABSOLUE DE MODIFICATION CHIRURGICALE : tu modifies UNIQUEMENT ce que la demande cible. TOUT LE RESTE reste STRICTEMENT IDENTIQUE :
- la PALETTE DE COULEURS existante (les valeurs actuelles de --vio, --grad, --glow, --tint, --tintline dans :root) — tu les RECOPIES à l'identique, tu n'en choisis JAMAIS une nouvelle ;
- la disposition, la navigation, les textes, les données d'exemple et les fonctionnalités existantes.
L'utilisateur a choisi son thème à la création : changer les couleurs lors d'une modification est une TRAHISON de son choix. Seule exception : s'il demande EXPLICITEMENT de changer les couleurs.
(Seul cas de migration : si l'existant utilise l'ANCIENNE charte au fond ivoire #F7F5EF / teal #14B8A6, migre la structure vers le SYSTÈME DE DESIGN BILTIA sans rien perdre.)`
      : `Demande de l'utilisateur : « ${prompt} »\n\nConstruis ${noun} complet correspondant.`;

    // Fichiers joints → blocs multimodaux AVANT le texte (captures, PDF).
    const firstUserContent: Anthropic.MessageParam["content"] = contextFiles.length
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
            text: `${userContent}\n\n(Les fichiers joints ci-dessus montrent le problème ou servent de référence : prends-les en compte dans ta réponse.)`,
          },
        ]
      : userContent;

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
          const messages: Anthropic.MessageParam[] = [{ role: "user", content: firstUserContent }];
          let html = "";
          let stopReason: string | null = null;
          let inTok = 0;
          let outTok = 0;
          const MAX_TURNS = 4;

          for (let turn = 0; turn < MAX_TURNS; turn++) {
            const ms = client.messages.stream({
              model: buildModel,
              max_tokens: MAX_TOKENS,
              system,
              messages,
            });
            let turnText = "";
            for await (const ev of ms) {
              if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
                turnText += ev.delta.text;
                html += ev.delta.text;
                send({ type: "html", text: ev.delta.text });
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
                content: "Continue exactement où tu t'es arrêté, sans rien répéter ni rouvrir de balise déjà fermée. Termine le fichier HTML.",
              });
              continue;
            }
            break;
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
    } else if (connectedEntities.length) {
      // Modules connectés : injecter le SDK window.biltia (persistance partagée
      // via /api/data). Idempotent — n'écrase pas un SDK déjà présent (itérations).
      html = injectBiltiaSDK(html);
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
        model: buildModel,
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
          build_model: buildModel,
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
