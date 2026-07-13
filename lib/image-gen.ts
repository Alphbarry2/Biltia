// ─────────────────────────────────────────────────────────────────────────────
// LE RENDU CLIENT — « voilà à quoi ressemblera votre salle de bain »
//
// Un artisan qui MONTRE le résultat gagne le chantier. C'est le seul usage de la
// génération d'image chez Biltia, et c'est un usage COMMERCIAL, assumé comme tel.
//
// ⚠️ CE MODÈLE NE SAIT PAS ÉCRIRE. Banc du 2026-07-13, deux rounds, 20 images :
// sur une photo, Gemini 2.5 Flash Image est indiscernable du Pro à 3,5× le prix.
// Dès qu'on lui demande un mot, il produit « Isolation Thermètic par l'Extréiure »,
// « Mur porter en parpping », « fibre fibre da yerre » — et la même étiquette
// écrite deux fois, avec deux fautes différentes.
//
// Un artisan qui montre ça à son client ne perd pas un chantier : il perd sa
// crédibilité. Le code le lui INTERDIT donc — on ne compte pas sur la consigne
// (cf. le bavardage « Voici le code HTML complet » : le prompt l'interdisait déjà).
//
// ⚠️ ET SURTOUT : cette image est INVENTÉE. Elle est magnifique et ne représente
// RIEN de réel. Parfaite pour vendre un projet. INTERDITE pour un plan, une cote,
// un schéma technique : l'artisan commande son matériel là-dessus. Le technique se
// dessine en SVG à partir de ce qui a été LU (cf. lib/file-reading.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { MODEL_IMAGE } from "./models";

const OPENROUTER_IMAGES = "https://openrouter.ai/api/v1/chat/completions";

export type RenduImage = {
  /** L'image, en base64 (sans le préfixe data:). */
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  /** Montant RÉELLEMENT facturé par OpenRouter. */
  realCost: number;
  ms: number;
};

/**
 * ⚠️ PIÈGE : en JavaScript, `\bécrit\b` NE MATCHE JAMAIS.
 *
 * `\b` marque une frontière entre un caractère de mot (`\w` = [A-Za-z0-9_]) et un
 * autre. Or « é » n'EST PAS un caractère de mot pour le moteur : entre l'espace et
 * le « é », il n'y a donc aucune frontière, et le motif échoue en silence.
 *
 * Vu en vrai le 2026-07-13 : « fais-moi un rendu du salon avec le nom du client
 * ÉCRIT dessus » passait tranquillement le garde-fou. TOUS mes mots accentués
 * étaient morts. Un garde-fou muet est pire qu'aucun garde-fou : on lui fait
 * confiance.
 *
 * On DÉSACCENTUE donc avant de tester, et les motifs restent en pur ASCII.
 */
const sansAccent = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Mots qui trahissent une demande de TEXTE DANS L'IMAGE. Le modèle retenu ne sait
 * pas écrire : mieux vaut refuser franchement que livrer une image truffée de
 * fautes à un artisan qui va la montrer à son client.
 */
const DEMANDE_DU_TEXTE =
  /\b(texte|ecris|ecrit|ecrite|ecrits|ecrites|inscris|inscrit|inscrite|inscrites|marque|marquee|marquees|legende|legendes|legender|etiquette|etiquettes|annote|annotation|libelle|titre|nom du client|cotation|cotes?|dimension|dimensions|nomenclature|tableau|graphique|courbe|diagramme|infographie|logo)\b/;

/**
 * Sujets où une image INVENTÉE est dangereuse : l'artisan construirait dessus.
 * On refuse, et on renvoie vers ce qui existe pour de vrai (schéma SVG issu du plan lu).
 */
const SUJET_TECHNIQUE =
  /\b(plan|plans|coupe|elevation|implantation|metre|metres|schema|schemas|unifilaire|calepinage|dtu|norme|normes|croquis|nomenclature)\b/;

export type RefusRendu = { refus: string };

/** Le sujet est-il un rendu d'ambiance légitime, ou une image qu'on ne doit pas fabriquer ? */
export function verifierDemandeRendu(prompt: string): RefusRendu | null {
  const p = sansAccent(prompt);

  if (SUJET_TECHNIQUE.test(p)) {
    return {
      refus:
        "Je ne fabrique pas d'image technique (plan, coupe, schéma coté). Elle serait INVENTÉE : " +
        "les cotes et les positions seraient plausibles, et fausses. Vous commanderiez du matériel dessus.\n\n" +
        "Ce que je peux faire : un rendu d'ambiance pour montrer le RÉSULTAT au client (« voilà à quoi " +
        "ressemblera la pièce une fois finie »). Et si vous me joignez votre plan, je le lis et j'en tire " +
        "une application avec un schéma de repérage dessiné à partir de ce qui y est VRAIMENT écrit.",
    };
  }
  if (DEMANDE_DU_TEXTE.test(p)) {
    return {
      refus:
        "Je ne mets pas de texte dans une image générée : le moteur d'image écrit avec des fautes " +
        "(testé — il sort « Isolation Thermètic par l'Extréiure »). Montrer ça à un client vous décrédibiliserait.\n\n" +
        "Je fais le rendu SANS texte, et vous l'accompagnez de vos propres mots dans le devis.",
    };
  }
  return null;
}

/** Consignes imposées à CHAQUE rendu, quoi que demande l'utilisateur. */
const CADRE =
  "Photographie d'architecture d'intérieur/extérieur, photoréaliste, lumière naturelle, style sobre et professionnel. " +
  "AUCUN texte, AUCUN mot, AUCUN chiffre, AUCUNE étiquette, AUCUN filigrane, AUCUN logo dans l'image. " +
  "Pas de personne visible. Cadrage large et net.";

/**
 * Produit un rendu client. Ne jette pas sur un refus métier — il faut le DIRE à
 * l'artisan, pas planter.
 */
export async function genererRendu(prompt: string): Promise<RenduImage | RefusRendu> {
  const refus = verifierDemandeRendu(prompt);
  if (refus) return refus;

  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.startsWith("your_")) {
    return { refus: "La génération d'images n'est pas configurée sur ce compte." };
  }

  const t0 = Date.now();
  const r = await fetch(OPENROUTER_IMAGES, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_IMAGE,
      modalities: ["image", "text"],
      // `usage:{include:true}` → OpenRouter renvoie le montant FACTURÉ. Sans lui,
      // on facturerait au prix catalogue, qui n'existe même pas pour les images.
      usage: { include: true },
      messages: [{ role: "user", content: `${prompt}\n\n${CADRE}` }],
    }),
  });

  const j = (await r.json()) as {
    error?: { message?: string };
    usage?: { cost?: number };
    choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
  };

  if (j.error) {
    console.error("[rendu] OpenRouter :", j.error.message);
    return { refus: "Le rendu n'a pas pu être produit. Réessayez dans un instant." };
  }

  const url = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url || !url.startsWith("data:")) {
    return { refus: "Le rendu n'a pas pu être produit. Réessayez dans un instant." };
  }

  const [entete, base64] = url.split(",", 2);
  const mt = /image\/(png|jpeg|webp)/.exec(entete)?.[0] ?? "image/png";

  return {
    base64,
    mediaType: mt as RenduImage["mediaType"],
    realCost: typeof j.usage?.cost === "number" ? j.usage.cost : 0,
    ms: Date.now() - t0,
  };
}

export function estUnRefus(r: RenduImage | RefusRendu): r is RefusRendu {
  return "refus" in r;
}
