import Anthropic from "@anthropic-ai/sdk";
import { routeRequest } from "@/lib/router";
import { getCategory } from "@/lib/sectors";
import { buildKnowledgeBlock } from "@/lib/btp-catalog";
import { classifyKind, coerceKind, type BatifyKind } from "@/lib/kind-router";
import { buildDocumentSystemPrompt, injectDocumentRuntime } from "@/lib/document-generator";
import { retrieveContext, buildSourcesBlock } from "@/lib/rag";
import { detectConnectedEntities, buildDataModeBlock } from "@/lib/data-entities";
import {
  buildPreferencesBlock,
  normalizePreferences,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/lib/user-preferences";
import { injectBatifySDK } from "@/lib/batify-sdk";
import { getWorkspaceContext, buildWorkspaceBlock } from "@/lib/workspace-context";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

const client = new Anthropic();

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 16000;

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
3. Google Fonts Inter : \`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">\`.
4. Persistance RÉELLE en localStorage : clé unique \`batify_<slug>\`. Tout survit au rechargement.
5. JavaScript vanilla complet et FONCTIONNEL : CRUD, recherche, filtre, tri. AUCUNE fonction "à faire plus tard".
6. Pré-remplis 2-3 lignes d'exemple réalistes au premier lancement. Bouton discret "Effacer les exemples".

## FONCTIONNEL
- Liste ou tableau avec recherche + filtres si > 3 champs.
- Formulaire d'ajout/édition en modal, validation des champs requis.
- Suppression avec window.confirm.
- Calculs automatiques exacts (HT/TVA/TTC, heures, %, alertes dates).
- Formatage français : jj/mm/aaaa, montants "1 234,56 €".
- Export CSV + Imprimer pour documents commerciaux.
- États vides soignés (invitation à créer).
- Alertes visuelles métier (badge rouge si document expire < 30 j, retard, dépassement).

## SYSTÈME DE DESIGN — CSS OBLIGATOIRE

Inclus CE BLOC EXACT dans le \`<style>\` de chaque app. Copie-le fidèlement.

DEBUT_CSS
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#F7F5EF;font-family:'Inter',system-ui,sans-serif;color:#111827;font-size:14px;line-height:1.5}
.card{background:#fff;border:1px solid #E7E2D7;border-radius:16px;padding:20px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.04),0 1px 3px rgba(115,100,70,.06),0 4px 16px rgba(115,100,70,.04)}
.kpi{background:#fff;border:1px solid #E7E2D7;border-radius:16px;padding:18px 20px;overflow:hidden;display:flex;flex-direction:column;gap:6px;box-shadow:0 0 0 1px rgba(0,0,0,.04),0 1px 3px rgba(115,100,70,.06),0 4px 16px rgba(115,100,70,.04)}
.kpi-label{font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-value{font-size:26px;font-weight:700;color:#0F172A;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-sub{font-size:11px;color:#6B7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{display:inline-flex;align-items:center;gap:6px;border:none;cursor:pointer;font-family:inherit;font-weight:600;transition:all .15s;border-radius:10px;white-space:nowrap;font-size:13px;padding:9px 18px}
.btn-ink{background:#0F172A;color:#fff}
.btn-ink:hover{background:#1E293B}
.btn-ink:active{transform:scale(.98)}
.btn-ghost{background:#F1EEE6;color:#0F172A;border:1px solid #E7E2D7}
.btn-ghost:hover{background:#E7E2D7}
.btn-teal{background:#EEF9F7;color:#0D9488;border:1px solid #99F6E4}
.btn-danger{background:#FEF2F2;color:#D95C4A;border:1px solid #FECACA;padding:5px 12px;font-size:12px;border-radius:8px}
.btn-sm{padding:6px 14px;font-size:12px;border-radius:8px}
.badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap}
.badge-green{background:#F0FDF9;color:#0D9488;border:1px solid #99F6E4}
.badge-red{background:#FEF2F2;color:#D95C4A;border:1px solid #FECACA}
.badge-amber{background:#FFFBEB;color:#D89B2B;border:1px solid #FDE68A}
.badge-gray{background:#F3F4F6;color:#6B7280;border:1px solid #E5E7EB}
.badge-blue{background:#EFF6FF;color:#3B82F6;border:1px solid #BFDBFE}
input,select,textarea{font-family:inherit;font-size:14px;color:#111827;background:#fff;border:1px solid #E7E2D7;border-radius:10px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:#14B8A6;box-shadow:0 0 0 3px rgba(20,184,166,.12)}
input::placeholder,textarea::placeholder{color:#9CA3AF}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;border-bottom:1px solid #E7E2D7;height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;box-shadow:0 1px 0 rgba(115,100,70,.04)}
.app-eyebrow{font-size:10px;font-weight:700;color:#14B8A6;text-transform:uppercase;letter-spacing:.12em;display:block}
.app-title{font-size:17px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:220px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #E7E2D7;display:flex;z-index:100;box-shadow:0 -4px 16px rgba(115,100,70,.06)}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#9CA3AF;transition:color .15s;font-family:inherit}
.tab-item.active{color:#14B8A6}
.tab-icon{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.app-main{padding-top:68px;padding-bottom:76px;min-height:100vh}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;padding:16px}
.search-bar{padding:0 16px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.section-pad{padding:0 16px 16px}
.table-wrap{background:#fff;border:1px solid #E7E2D7;border-radius:16px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.04),0 1px 3px rgba(115,100,70,.06),0 4px 16px rgba(115,100,70,.04)}
table{width:100%;border-collapse:collapse}
th{font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em;padding:10px 16px;background:#F7F5EF;border-bottom:1px solid #E7E2D7;text-align:left;white-space:nowrap}
td{padding:13px 16px;border-bottom:1px solid #F1EEE6;color:#111827;vertical-align:middle;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
tr:last-child td{border-bottom:none}
tr:hover td{background:#FAFAF7}
.overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:540px;max-height:88vh;overflow-y:auto;padding:24px 20px}
@media(min-width:600px){.modal{border-radius:20px}}
.modal-title{font-size:17px;font-weight:700;color:#0F172A;margin-bottom:20px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:480px){.form-row{grid-template-columns:1fr}}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}
.modal-actions{display:flex;gap:10px;margin-top:20px}
.modal-actions .btn{flex:1;justify-content:center}
.empty{text-align:center;padding:60px 20px;color:#9CA3AF}
.prog-track{height:6px;background:#F1EEE6;border-radius:3px;overflow:hidden}
.prog-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#14B8A6,#0D9488);transition:width .4s}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#E7E2D7;border-radius:2px}
FIN_CSS

### STRUCTURE HTML TYPE (adapte les champs au besoin métier) :

Utilise toujours cette structure :
- \`<header class="app-header">\` fixe en haut avec logo BATIFYAI + titre + bouton CTA
- \`<main class="app-main">\` avec padding-top:68px et padding-bottom:76px
- KPI cards dans \`<div class="kpi-grid">\` (auto-fit, minmax 130px)
- Tableau dans \`<div class="table-wrap"><table>...\`
- Modal dans \`<div class="overlay">\` avec \`<div class="modal">\`
- \`<nav class="tab-bar">\` fixe en bas avec 2 à 4 onglets

### RÈGLES ABSOLUES ANTI-DÉBORDEMENT :
1. KPI values : TOUJOURS \`white-space:nowrap; overflow:hidden; text-overflow:ellipsis\`.
2. KPI values : \`font-size:26px\` max — jamais plus grand.
3. Chaque \`<td>\` : \`max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap\`.
4. KPI grid : \`repeat(auto-fit,minmax(130px,1fr))\` — jamais de largeurs fixes.
5. Badges : \`white-space:nowrap\` toujours.
6. Modal : \`overflow-y:auto; max-height:88vh\` — ne déborde jamais hors écran.
7. Sur mobile < 480px : .form-row passe à 1 colonne via @media.

### RÈGLES COULEUR ABSOLUES :
- Body background : \`#F7F5EF\` — JAMAIS #fff ou #ffffff en fond de page.
- Cards et KPI : \`background:#fff; border:1px solid #E7E2D7\`.
- Bouton principal : \`background:#0F172A\` (encre) — JAMAIS coloré.
- Accent teal \`#14B8A6\` : tab active, badges, liens, barres de progression uniquement.

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
- Mise en page pleine largeur type tableau de bord : barre latérale ou en-tête horizontal, tableaux denses multi-colonnes, largeur max ~1200px centrée.
- Exploite l'espace : colonnes côte à côte, statistiques en cartes en haut (KPI), tableau détaillé en dessous.
- Boutons et lignes de taille standard desktop. Survol (hover) soigné.`;
  }
  if (format === "mobile") {
    return `
# FORMAT CIBLE : MOBILE (smartphone, sur chantier)
- Mise en page une seule colonne, pensée pour le pouce : largeur ~ max-w-md centrée, tout empilé verticalement.
- Boutons GRANDS (min 48px de haut), zones de tap larges, texte lisible.
- Données en CARTES empilées plutôt qu'en tableau large. Bouton d'action flottant (FAB) bleu en bas à droite.
- Navigation simple, pas de survol indispensable. Optimisé pour une utilisation rapide avec des gants.`;
  }
  return `
# FORMAT CIBLE : ADAPTATIF (responsive)
- L'app doit être parfaite sur mobile ET desktop. Cartes empilées sur petit écran, tableau/grille sur grand écran (breakpoints Tailwind sm/md/lg).
- Boutons confortables au doigt, FAB sur mobile, en-tête classique sur desktop.`;
}

function buildSystemPrompt(
  format: string,
  expertise?: string,
  sources?: string,
  workspace?: string
): string {
  const focus = expertise
    ? `\n# FOCUS MÉTIER (agent spécialiste retenu pour cette demande)\n${expertise}\n`
    : "";
  const src = sources ? `\n${sources}\n` : "";
  const ws = workspace ? `\n${workspace}\n` : "";
  return `Tu es BatifyAI, le meilleur générateur d'applications de gestion pour le secteur du BTP en France. Tu transformes une description en français — même approximative, même en argot de chantier — en une application web complète, professionnelle et réellement utilisable.

${BTP_KNOWLEDGE}
${focus}
${BUILD_RULES}

${formatInstruction(format)}
${src}${ws}
# SORTIE
Réponds UNIQUEMENT avec le code HTML complet. Aucune explication, aucun texte avant ou après, aucune balise markdown \`\`\`. Le premier caractère de ta réponse est \`<\` et le dernier est \`>\`.`;
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

    // ── Récupérer le tenant de l'utilisateur ─────────────────────────────────
    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null)
      .limit(1)
      .single();

    if (!membership) {
      return Response.json({ error: "Aucun espace de travail trouvé." }, { status: 403 });
    }

    const tenantId = membership.tenant_id;

    // ── Validation du body ───────────────────────────────────────────────────
    let body: {
      prompt?: string;
      previousHTML?: string;
      format?: string;
      isAutoFix?: boolean;
      kind?: string;
      docType?: string;
    };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    const { prompt, previousHTML, format, isAutoFix } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return Response.json({ error: "Décrivez l'application que vous souhaitez." }, { status: 400 });
    }

    // Limiter la taille du prompt pour éviter les abus
    if (prompt.length > 4000) {
      return Response.json({ error: "Description trop longue (4000 caractères max)." }, { status: 400 });
    }

    const isModification = typeof previousHTML === "string" && previousHTML.length > 0;
    // Les corrections automatiques d'erreurs ne coûtent pas de crédits
    const creditCost = isAutoFix ? 0 : isModification ? 1 : 2;

    if (creditCost > 0) {
      const { data: credited } = await supabase.rpc("deduct_credits", {
        p_amount: creditCost,
      });

      if (!credited) {
        return Response.json(
          { error: "Crédits insuffisants. Rechargez votre compte pour continuer." },
          { status: 402 }
        );
      }
    }

    const target = format === "mobile" || format === "desktop" ? format : "auto";

    // ── Secteur utilisateur pour le routage ───────────────────────────────────
    let sector: string | null = null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("sector")
      .eq("user_id", user.id)
      .single();
    sector = profile?.sector ?? null;

    // ── Préférences IA (best-effort) ──────────────────────────────────────────
    // Si la colonne `preferences` n'existe pas encore (migration 009 non appliquée),
    // la requête échoue proprement → on retombe sur les défauts. Jamais bloquant.
    let preferences: UserPreferences = DEFAULT_PREFERENCES;
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as unknown as { from: (t: string) => any };
      const { data: prefRow } = await db
        .from("profiles")
        .select("preferences")
        .eq("user_id", user.id)
        .single();
      preferences = normalizePreferences(prefRow?.preferences);
    }

    // ── Contexte workspace : vrais noms clients / chantiers / employés, pour que
    // le document (ou le module non connecté) reprenne les données réelles au lieu
    // d'exemples inventés. Jamais bloquant : "" si le RPC/les tables sont absents.
    let workspaceBlock = "";
    try {
      const wsContext = await getWorkspaceContext(supabase, tenantId);
      workspaceBlock = buildWorkspaceBlock(wsContext);
    } catch {
      workspaceBlock = "";
    }

    const route = await routeRequest({ prompt, sector });
    // Focus métier : connaissance des sous-corps de la catégorie retenue.
    const cat = route.agent !== "generalist" ? getCategory(route.agent) : undefined;
    const expertise = cat ? buildKnowledgeBlock(cat.subTrades.map((s) => s.id)) : undefined;

    // ── RAG : récupération de sources VÉRIFIÉES (bibliothèque BTP globale +
    // documents privés du tenant). Client authentifié → RLS → le tenant ne voit
    // que le global + ses docs. Jamais bloquant : [] si Mistral/pgvector indispo.
    const tradeIds = cat ? cat.subTrades.map((s) => s.id) : [];
    const ragChunks = await retrieveContext({ supabase, tenantId, prompt, tradeIds });
    const sourcesBlock = buildSourcesBlock(ragChunks);

    // ── Aiguillage polymorphe : document | action | module ────────────────────
    // En modification/auto-fix, le client renvoie le `kind` d'origine : on ne
    // reclasse pas (on itère sur le même livrable). Sinon on classe la demande.
    const providedKind = coerceKind(body.kind);
    let kind: BatifyKind;
    let docType: string | null = null;
    let kindConfidence = 1;
    let kindMethod = "provided";
    if (providedKind) {
      kind = providedKind;
      docType = typeof body.docType === "string" ? body.docType : null;
    } else {
      const k = await classifyKind({ prompt, sector });
      kind = k.kind;
      docType = k.docType;
      kindConfidence = k.confidence;
      kindMethod = k.method;
    }

    // `action` n'a pas encore de moteur dédié : on génère un module opérationnel
    // en attendant (dégradation honnête, signalée à l'UI via `actionFallback`).
    const isDocument = kind === "document";

    // Mode DONNÉES PARTAGÉES : si la demande mappe des entités du workspace
    // (clients, chantiers, employees…), on injecte le bloc DATA MODE dans le
    // prompt système. Le module utilisera alors window.batify → /api/data
    // (persistance partagée) au lieu de localStorage pour ces entités.
    const connectedEntities = isDocument
      ? []
      : detectConnectedEntities(prompt, route.appType);

    let system = isDocument
      ? buildDocumentSystemPrompt({ docType, expertise, sources: sourcesBlock, workspace: workspaceBlock })
      : buildSystemPrompt(
          target,
          expertise,
          sourcesBlock,
          // Modules connectés : les vraies données arrivent en live via /api/data,
          // pas de graine figée. Modules non connectés : on injecte le contexte.
          connectedEntities.length ? undefined : workspaceBlock
        );
    if (!isDocument && connectedEntities.length) {
      system += "\n\n" + buildDataModeBlock(connectedEntities);
    }
    // Préférences utilisateur : influencent le ton et le type de livrable produit.
    system += "\n\n" + buildPreferencesBlock(preferences);

    const noun = isDocument ? "le document" : "l'application";
    const userContent = isModification
      ? `Voici ${noun} HTML existant :\n\`\`\`html\n${previousHTML}\n\`\`\`\n\nDemande de modification de l'utilisateur : « ${prompt} »\n\nRenvoie ${noun} COMPLET et mis à jour intégrant cette modification, en conservant le contenu et les fonctionnalités existants.`
      : `Demande de l'utilisateur : « ${prompt} »\n\nConstruis ${noun} complet correspondant.`;

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];
    let html = "";
    let stopReason: string | null = null;
    const MAX_TURNS = 4;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages,
      });

      const block = message.content[0];
      const text = block && block.type === "text" ? block.text : "";
      html += text;
      stopReason = message.stop_reason;

      if (message.stop_reason === "max_tokens") {
        messages.push({ role: "assistant", content: text });
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
      if (creditCost > 0) {
        try {
          const admin = createAdminClient();
          if (admin) {
            await admin.rpc("refund_credits", { p_user_id: user.id, p_amount: creditCost });
          }
        } catch (refundErr) {
          console.error("Refund failed after generation error:", refundErr);
        }
      }
      return Response.json(
        { error: "La génération s'est mal terminée (résultat incomplet). Réessayez — vos crédits ont été remboursés." },
        { status: 502 }
      );
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
      // Modules connectés : injecter le SDK window.batify (persistance partagée
      // via /api/data). Idempotent — n'écrase pas un SDK déjà présent (itérations).
      html = injectBatifySDK(html);
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
          connected_entities: connectedEntities,
          rag_used: ragChunks.length > 0,
          rag_chunks: ragChunks.length,
        },
      });
    } catch {
      // Le tracking ne bloque jamais la réponse.
    }

    return Response.json({
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
      creditsUsed: creditCost,
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
