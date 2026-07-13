// ─────────────────────────────────────────────────────────────────────────────
// LE RELAIS ENTRE L'ŒIL ET LE CODEUR
//
// Le modèle qui GÉNÈRE (DeepSeek V4 Pro) est AVEUGLE. Le modèle qui VOIT
// (Qwen3-VL) ne sait pas coder une application. Aucun des deux ne peut faire le
// travail seul — et c'est très bien : le meilleur codeur n'est pas le meilleur
// œil, et inversement.
//
// Ce module organise le passage de relais, en trois temps :
//
//   1. L'ŒIL LIT — mais PAS « en général » : il lit EN SACHANT ce que l'artisan
//      veut construire. Lire un plan pour un métré électrique, ce n'est pas le
//      lire pour un devis de peinture. Le but oriente le regard.
//
//   2. L'ŒIL DÉCLARE CE QUI MANQUE — c'est le « il me manque ça ». Lui seul peut
//      le savoir : lui seul voit le document. Sans ça, le codeur, aveugle,
//      INVENTE ou laisse un trou en silence. Les deux sont graves : un artisan
//      commande son matériel sur ces chiffres.
//
//   3. ON RELIT, UNE FOIS, EN CIBLANT — si quelque chose manque, on redemande à
//      l'œil de chercher SPÉCIFIQUEMENT ça. Souvent c'est là, juste écrit petit,
//      dans un coin, dans une légende. Une seule relance : au-delà, c'est que
//      l'information n'y est vraiment pas, et il faut le dire honnêtement.
//
// Ce qui sort d'ici est du TEXTE. Le codeur peut donc être aveugle : il sait que
// quelqu'un a regardé pour lui, et il sait aussi ce que personne n'a pu voir.
// ─────────────────────────────────────────────────────────────────────────────
import type Anthropic from "@anthropic-ai/sdk";
import { client } from "./llm";
import { MODEL_VISION } from "./models";
import { realCostOf } from "./llm";

export type FichierJoint = { name?: string; mediaType: string; data: string };

export type LectureFichiers = {
  /** Retranscription fidèle et exhaustive de ce que les fichiers contiennent. */
  lecture: string;
  /** Nature du document telle que l'œil l'a reconnue (« plan électrique », « devis »…). */
  typeDocument: string;
  /** Le document EST-IL un plan / schéma technique ? → l'app devra le redessiner. */
  estUnPlan: boolean;
  /** Ce que la demande de l'artisan exige et que le document NE CONTIENT PAS. */
  manquant: string[];
  inTok: number;
  outTok: number;
  realCost: number;
};

const OUTIL_LECTURE = {
  name: "restituer_document",
  description:
    "Restitue le contenu réel d'un ou plusieurs documents pour un collègue qui ne peut pas les voir, et signale ce que la demande exige mais que le document ne contient pas.",
  input_schema: {
    type: "object",
    properties: {
      type_document: {
        type: "string",
        description:
          "Nature réelle du document, en clair : « plan électrique », « bon de livraison », « devis fournisseur », « photo de chantier », « facture »…",
      },
      est_un_plan: {
        type: "boolean",
        description:
          "true si c'est un PLAN ou un SCHÉMA technique (plan de masse, plan électrique, coupe, façade, implantation). false pour un devis, une facture, une photo, un tableau.",
      },
      lecture: {
        type: "string",
        description:
          "Retranscription FIDÈLE et EXHAUSTIVE. Tous les textes, chiffres, quantités, cotes, échelles, repères, légendes. Les tableaux sont recopiés ligne par ligne. Si c'est un plan : la liste des PIÈCES avec leurs dimensions si elles sont cotées, et pour chaque pièce les éléments comptés. N'INVENTE RIEN.",
      },
      manquant: {
        type: "array",
        items: { type: "string" },
        description:
          "Ce que la DEMANDE DE L'ARTISAN exige et que le document ne contient PAS (ex : « les longueurs de gaine ne sont pas cotées », « aucun prix unitaire »). Vide si le document suffit. Ne liste que ce qui manque VRAIMENT et qui SERT à la demande.",
      },
    },
    required: ["type_document", "est_un_plan", "lecture", "manquant"],
  },
} as Anthropic.Tool;

function blocsFichiers(fichiers: FichierJoint[]): Anthropic.ContentBlockParam[] {
  return fichiers.map<Anthropic.ContentBlockParam>((f) =>
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
  );
}

const SYSTEME = `Tu es un professionnel du BTP qui LIT un document pour un collègue qui ne peut PAS le voir.

Ce que tu écris est la SEULE chose qu'il connaîtra du document. S'il te manque une information, il ne pourra pas aller la chercher : il inventera, ou il laissera un trou. Dans les deux cas, l'artisan commandera du matériel sur un chiffre faux.

RÈGLES ABSOLUES :
1. N'INVENTE RIEN. Pas une cote, pas un prix, pas une quantité. Ce qui n'est pas écrit n'existe pas.
2. Sois EXHAUSTIF. Recopie les tableaux ligne par ligne. Relève TOUS les chiffres, même écrits petit.
3. LIS AVEC LE BUT EN TÊTE. On te dit ce que l'artisan veut construire : c'est ce qu'il faut chercher en priorité dans le document.
4. DIS CE QUI MANQUE. Si la demande exige une information que le document ne porte pas, signale-la. C'est aussi utile que ce que tu as trouvé.`;

/** Passe 1 : l'œil lit, en sachant ce que l'artisan veut construire. */
async function lirePasse1(fichiers: FichierJoint[], demande: string): Promise<{ r: LectureFichiers | null; inTok: number; outTok: number; cost: number }> {
  const m = await client.messages.create({
    model: MODEL_VISION,
    max_tokens: 6000,
    system: SYSTEME,
    tools: [OUTIL_LECTURE],
    tool_choice: { type: "tool", name: "restituer_document" },
    messages: [
      {
        role: "user",
        content: [
          ...blocsFichiers(fichiers),
          {
            type: "text",
            text: `Ce que l'artisan veut construire à partir de ce ou ces documents :\n« ${demande} »\n\nLis le document dans cette optique, puis restitue-le.`,
          },
        ],
      },
    ],
  });
  const cost = realCostOf(m.usage) ?? 0;
  const bloc = m.content.find((b) => b.type === "tool_use");
  if (!bloc || bloc.type !== "tool_use") {
    return { r: null, inTok: m.usage.input_tokens, outTok: m.usage.output_tokens, cost };
  }
  const i = bloc.input as {
    type_document?: string;
    est_un_plan?: boolean;
    lecture?: string;
    manquant?: unknown;
  };
  return {
    r: {
      lecture: typeof i.lecture === "string" ? i.lecture : "",
      typeDocument: typeof i.type_document === "string" ? i.type_document : "document",
      estUnPlan: i.est_un_plan === true,
      manquant: Array.isArray(i.manquant) ? i.manquant.filter((x): x is string => typeof x === "string").slice(0, 8) : [],
      inTok: m.usage.input_tokens,
      outTok: m.usage.output_tokens,
      realCost: cost,
    },
    inTok: m.usage.input_tokens,
    outTok: m.usage.output_tokens,
    cost,
  };
}

/** Passe 2 : « il me manque ça » → on redemande à l'œil de CHERCHER, précisément. */
async function relire(
  fichiers: FichierJoint[],
  manquant: string[]
): Promise<{ trouve: string; absent: string[]; inTok: number; outTok: number; cost: number }> {
  const m = await client.messages.create({
    model: MODEL_VISION,
    max_tokens: 2000,
    system:
      "Tu relis un document pour y chercher des informations PRÉCISES qu'un collègue n'a pas trouvées. " +
      "Elles sont souvent là, mais écrites petit : dans une légende, une nomenclature, un cartouche, une note en marge. " +
      "Pour CHAQUE point demandé : soit tu donnes la valeur exacte lue dans le document, soit tu écris « ABSENT ». " +
      "N'INVENTE JAMAIS une valeur. Un « ABSENT » honnête vaut mieux qu'un chiffre plausible.",
    messages: [
      {
        role: "user",
        content: [
          ...blocsFichiers(fichiers),
          {
            type: "text",
            text:
              `Cherche spécifiquement ceci dans le document :\n` +
              manquant.map((x, i) => `${i + 1}. ${x}`).join("\n") +
              `\n\nRéponds point par point : le numéro, puis la valeur trouvée, ou « ABSENT ».`,
          },
        ],
      },
    ],
  });
  const texte = m.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Ce qui reste « ABSENT » après la relance ne se trouve VRAIMENT pas dans le
  // document. Le codeur doit le savoir, pour en faire un champ à saisir — jamais
  // une valeur inventée.
  const absent = manquant.filter((_, i) => {
    const ligne = texte.split("\n").find((l) => l.trim().startsWith(String(i + 1)));
    return !ligne || /absent/i.test(ligne);
  });

  return {
    trouve: texte,
    absent,
    inTok: m.usage.input_tokens,
    outTok: m.usage.output_tokens,
    cost: realCostOf(m.usage) ?? 0,
  };
}

/**
 * Fait lire les fichiers joints par le modèle qui a des yeux, et rend un TEXTE
 * exploitable par un modèle aveugle — avec, explicitement, ce que le document ne
 * dit PAS. Ne jette jamais : un œil en panne ne doit pas faire perdre la demande.
 */
export async function lireFichiersPourLeGenerateur(
  fichiers: FichierJoint[],
  demande: string
): Promise<LectureFichiers | null> {
  if (fichiers.length === 0) return null;
  try {
    const p1 = await lirePasse1(fichiers, demande);
    if (!p1.r) return null;
    const r = p1.r;

    // « Il me manque ça » → on relit, UNE fois, en ciblant.
    if (r.manquant.length > 0) {
      try {
        const p2 = await relire(fichiers, r.manquant);
        r.lecture += `\n\n# SECONDE LECTURE (recherche ciblée)\n${p2.trouve}`;
        r.manquant = p2.absent; // ne reste que ce qui est VRAIMENT absent
        r.inTok += p2.inTok;
        r.outTok += p2.outTok;
        r.realCost += p2.cost;
      } catch (e) {
        console.error("[lecture] seconde lecture en échec :", e);
      }
    }
    return r;
  } catch (e) {
    console.error("[lecture] lecture des fichiers en échec :", e);
    return null;
  }
}

/** Met la lecture en forme pour le prompt du générateur (qui, lui, ne voit rien). */
export function blocPourLeGenerateur(r: LectureFichiers): string {
  const parts = [
    `# CE QUE CONTIENT LE FICHIER JOINT (lu pour toi — tu ne peux pas le voir)`,
    `Type de document : ${r.typeDocument}`,
    ``,
    r.lecture,
  ];

  if (r.manquant.length > 0) {
    parts.push(
      ``,
      `# ⚠️ CE QUE LE DOCUMENT NE DIT PAS`,
      `Ces informations ont été cherchées DEUX FOIS dans le document. Elles n'y sont pas :`,
      ...r.manquant.map((x) => `- ${x}`),
      ``,
      `Tu NE LES INVENTES PAS. Pour chacune, l'application prévoit un CHAMP DE SAISIE vide,`,
      `clairement étiqueté, que l'artisan remplira sur le chantier. Un chiffre inventé ici,`,
      `c'est du matériel commandé en trop ou en moins.`
    );
  }

  if (r.estUnPlan) {
    parts.push(
      ``,
      `# 📐 C'EST UN PLAN → L'APPLICATION DOIT LE REDESSINER`,
      `L'artisan doit RETROUVER son plan dans l'application, propre et lisible — pas seulement`,
      `des chiffres dans un tableau. L'application inclut donc une vue « Schéma » qui DESSINE`,
      `en SVG, à partir des données ci-dessus UNIQUEMENT :`,
      `- une pièce = un rectangle légendé (nom + surface si elle est cotée) ;`,
      `- les éléments comptés = des pastilles posées dans la pièce, avec une LÉGENDE claire`,
      `  (une couleur et un symbole par type : prise, interrupteur, point lumineux, RJ45…) ;`,
      `- le total par pièce et par type, lisible d'un coup d'œil.`,
      ``,
      `RÈGLES DU SCHÉMA — non négociables :`,
      `1. AUCUNE cote inventée. Une pièce non cotée dans le document se dessine à taille`,
      `   NEUTRE, et son champ « dimensions » reste vide et saisissable.`,
      `2. Le schéma porte la mention « Schéma de repérage — non contractuel, pas à l'échelle »`,
      `   SAUF si l'échelle figurait au document et que les cotes ont été lues.`,
      `3. Le SVG est dessiné par TON code à partir des données. Jamais une image collée.`,
      `Un artisan commande son matériel là-dessus : un schéma faux coûte un chantier.`
    );
  }

  return parts.join("\n");
}
