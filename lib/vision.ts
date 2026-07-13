// ─────────────────────────────────────────────────────────────────────────────
// VISION / ANALYSE DE FICHIERS — socle partagé (produits « Analyse » & « Automatisations »).
//
// Claude Sonnet lit nativement les PDF et les images : pas d'OCR externe, pas de
// dépendance npm. Ce module transforme des fichiers uploadés (base64) en blocs de
// contenu Anthropic, et expose le schéma d'extraction structurée réutilisé par
// /api/analyze (un doc) et /api/automate (lot de docs).
//
// Sécurité / robustesse : whitelist de types MIME, plafonds de taille et de
// nombre. Les data-URL (`data:...;base64,`) du navigateur sont tolérées et
// nettoyées. Aucune exception non maîtrisée : les erreurs de validation
// remontent en `ValidationError` explicite pour un 400 propre côté route.
// ─────────────────────────────────────────────────────────────────────────────

import { pick, type Locale } from "./i18n/config";

import type Anthropic from "@anthropic-ai/sdk";
import { TIER_MEDIUM } from "./models";

/** Modèle vision par défaut (PDF + image natifs) — palier moyen (Sonnet). */
export const VISION_MODEL = TIER_MEDIUM;

/** Types MIME acceptés. PDF → bloc `document` ; images → bloc `image`. */
export const ALLOWED_MEDIA_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

/** Plafonds volontairement conservateurs (limite de corps requête ~4,5 Mo sur Vercel). */
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 3.5 * 1024 * 1024; // 3,5 Mo par fichier (avant base64)

export type UploadedFile = {
  /** Nom d'origine (affichage + traçabilité). */
  name: string;
  /** Type MIME déclaré par le navigateur. */
  mediaType: string;
  /** Contenu en base64 (data-URL toléré). */
  data: string;
};

export class ValidationError extends Error {}

// ── Normalisation & validation ───────────────────────────────────────────────

/** Retire un éventuel préfixe data-URL et les espaces, renvoie le base64 pur. */
function stripDataUrl(data: string): string {
  const s = data.trim();
  const comma = s.indexOf(",");
  if (s.startsWith("data:") && comma !== -1) return s.slice(comma + 1);
  return s;
}

/** Taille approx. en octets d'une chaîne base64 (sans la décoder). */
function base64Bytes(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

function isAllowed(mt: string): mt is AllowedMediaType {
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(mt);
}

type CleanFile = { name: string; mediaType: AllowedMediaType; data: string };

/**
 * Valide et normalise une liste de fichiers uploadés. Lève `ValidationError`
 * (→ 400) si quelque chose cloche : trop de fichiers, type non supporté, vide,
 * ou au-dessus du plafond de taille.
 */
export function validateFiles(input: unknown, locale: Locale = "fr"): CleanFile[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ValidationError(
      pick(locale, "Joignez au moins un fichier (PDF ou image).", "Attach at least one file (PDF or image).")
    );
  }
  if (input.length > MAX_FILES) {
    throw new ValidationError(
      pick(
        locale,
        `Trop de fichiers : ${MAX_FILES} maximum par analyse.`,
        `Too many files: ${MAX_FILES} maximum per analysis.`
      )
    );
  }

  return input.map((raw, i) => {
    const f = raw as Partial<UploadedFile>;
    const fallbackName = pick(locale, `fichier-${i + 1}`, `file-${i + 1}`);
    const name = typeof f.name === "string" && f.name.trim() ? f.name.trim() : fallbackName;
    const mediaType = typeof f.mediaType === "string" ? f.mediaType.trim() : "";
    if (!isAllowed(mediaType)) {
      throw new ValidationError(
        pick(
          locale,
          `Type non supporté (${name}) : acceptés = PDF, PNG, JPEG, WebP.`,
          `Unsupported type (${name}): accepted = PDF, PNG, JPEG, WebP.`
        )
      );
    }
    const data = typeof f.data === "string" ? stripDataUrl(f.data) : "";
    if (!data) {
      throw new ValidationError(
        pick(locale, `Fichier vide ou illisible : ${name}.`, `Empty or unreadable file: ${name}.`)
      );
    }
    const bytes = base64Bytes(data);
    if (bytes > MAX_FILE_BYTES) {
      const mb = (MAX_FILE_BYTES / 1024 / 1024).toFixed(1);
      throw new ValidationError(
        pick(
          locale,
          `Fichier trop lourd (${name}) : ${mb} Mo maximum.`,
          `File too large (${name}): ${mb} MB maximum.`
        )
      );
    }
    return { name, mediaType, data };
  });
}

// ── Blocs de contenu Anthropic ───────────────────────────────────────────────

/**
 * Transforme des fichiers validés en blocs de contenu Anthropic. Chaque fichier
 * est précédé d'un court bloc texte qui le nomme, pour que le modèle sache à quel
 * document se rapporte chaque extraction (utile en mode lot).
 */
export function buildFileBlocks(files: CleanFile[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const f of files) {
    blocks.push({ type: "text", text: `--- Fichier : ${f.name} ---` });
    if (f.mediaType === "application/pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: f.data },
      });
    } else {
      // Ici f.mediaType ∈ { image/png, image/jpeg, image/webp } — tous membres de
      // l'union d'images du SDK ; on l'annote explicitement pour le narrowing TS.
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: f.mediaType as "image/png" | "image/jpeg" | "image/webp",
          data: f.data,
        },
      });
    }
  }
  return blocks;
}

// ── Schéma d'extraction structurée (partagé analyse + automatisation) ─────────

export type ExtractionLine = {
  designation: string;
  quantite?: number | null;
  unite?: string | null;
  pu_ht?: number | null;
  total_ht?: number | null;
};

export type Extraction = {
  type_document: string;
  emetteur: string | null;
  client: string | null;
  reference: string | null;
  date: string | null;
  echeance: string | null;
  montant_ht: number | null;
  montant_tva: number | null;
  montant_ttc: number | null;
  lignes: ExtractionLine[];
  resume: string;
};

/**
 * Outil d'extraction (tool use forcé). Champs volontairement plats et robustes :
 * tout est optionnel côté valeur (null autorisé) pour ne jamais bloquer le modèle
 * sur un champ absent du document.
 */
export const EXTRACT_TOOL: Anthropic.Tool = {
  name: "extract_document",
  description:
    "Extrait les informations clés d'un document BTP (devis, facture, bon de livraison, courrier, plan…). Mets `null` pour tout champ absent du document, n'invente jamais de valeur.",
  input_schema: {
    type: "object",
    properties: {
      type_document: {
        type: "string",
        description: "Nature du document (devis, facture, bon_de_livraison, courrier, plan, attestation, autre).",
      },
      emetteur: { type: ["string", "null"], description: "Nom de l'entreprise émettrice, sinon null." },
      client: { type: ["string", "null"], description: "Nom du client/destinataire, sinon null." },
      reference: { type: ["string", "null"], description: "Numéro/référence du document, sinon null." },
      date: { type: ["string", "null"], description: "Date du document (AAAA-MM-JJ si possible), sinon null." },
      echeance: { type: ["string", "null"], description: "Date d'échéance de paiement (AAAA-MM-JJ), sinon null." },
      montant_ht: { type: ["number", "null"], description: "Total HT en euros, sinon null." },
      montant_tva: { type: ["number", "null"], description: "Total TVA en euros, sinon null." },
      montant_ttc: { type: ["number", "null"], description: "Total TTC en euros, sinon null." },
      lignes: {
        type: "array",
        description: "Postes/lignes du document (vide si non applicable).",
        items: {
          type: "object",
          properties: {
            designation: { type: "string" },
            quantite: { type: ["number", "null"] },
            unite: { type: ["string", "null"] },
            pu_ht: { type: ["number", "null"] },
            total_ht: { type: ["number", "null"] },
          },
          required: ["designation"],
          additionalProperties: false,
        },
      },
      resume: { type: "string", description: "Résumé en 1-2 phrases de l'essentiel du document." },
    },
    required: [
      "type_document",
      "emetteur",
      "client",
      "reference",
      "date",
      "echeance",
      "montant_ht",
      "montant_tva",
      "montant_ttc",
      "lignes",
      "resume",
    ],
    additionalProperties: false,
  },
};

/** Coerce prudente d'une sortie d'outil `extract_document` en `Extraction`. */
export function coerceExtraction(input: unknown): Extraction {
  const o = (input ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const lignesRaw = Array.isArray(o.lignes) ? o.lignes : [];
  const lignes: ExtractionLine[] = lignesRaw.map((l) => {
    const r = (l ?? {}) as Record<string, unknown>;
    return {
      designation: str(r.designation) ?? "—",
      quantite: num(r.quantite),
      unite: str(r.unite),
      pu_ht: num(r.pu_ht),
      total_ht: num(r.total_ht),
    };
  });
  return {
    type_document: str(o.type_document) ?? "autre",
    emetteur: str(o.emetteur),
    client: str(o.client),
    reference: str(o.reference),
    date: str(o.date),
    echeance: str(o.echeance),
    montant_ht: num(o.montant_ht),
    montant_tva: num(o.montant_tva),
    montant_ttc: num(o.montant_ttc),
    lignes,
    resume: str(o.resume) ?? "",
  };
}
