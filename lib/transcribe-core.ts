// ─────────────────────────────────────────────────────────────────────────────
// Cœur de transcription audio, partagé entre /api/transcribe (barre de chat) et
// /api/app-ai (dictée DANS une app générée). Essaie OpenAI (gpt-4o-transcribe,
// meilleur sur le jargon) puis Groq (Whisper large v3 turbo, repli gratuit).
// ─────────────────────────────────────────────────────────────────────────────

import { getLocale } from "./i18n/server";
import { pick } from "./i18n/config";

type Provider = { name: string; url: string; key: string; model: string };

const TRANSCRIBE_PROMPT =
  "Transcription en français, vocabulaire du BTP (devis, chantier, TVA, m², bon de livraison, pointage, avenant).";
const TRANSCRIBE_PROMPT_EN =
  "Transcription in English, construction vocabulary (quote, job site, VAT, m², delivery note, time log, variation order).";

function isRealKey(k?: string): boolean {
  return !!k && !k.startsWith("your_") && k.length > 20;
}

function providers(): Provider[] {
  const list: Provider[] = [];
  if (isRealKey(process.env.OPENAI_API_KEY)) {
    list.push({ name: "openai", url: "https://api.openai.com/v1/audio/transcriptions", key: process.env.OPENAI_API_KEY!, model: "gpt-4o-transcribe" });
  }
  if (isRealKey(process.env.GROQ_API_KEY)) {
    list.push({ name: "groq", url: "https://api.groq.com/openai/v1/audio/transcriptions", key: process.env.GROQ_API_KEY!, model: "whisper-large-v3-turbo" });
  }
  return list;
}

export type TranscribeResult =
  | { text: string }
  | { error: string; status: number };

// ── PLAFOND DE DURÉE ─────────────────────────────────────────────────────────
//
// La transcription est facturée à la MINUTE (gpt-4o-transcribe : 0,006 $/min) et
// n'était bornée nulle part : /api/transcribe acceptait 25 Mo, soit ~100 minutes
// d'audio, soit **0,60 $ en un seul appel** — pour une action facturée 15 crédits
// (dictée de devis) ou carrément OFFERTE (dictée de la barre de chat).
//
// 4 Mo ≈ 8 à 10 minutes de parole (~0,05 $). C'est très au-delà d'une dictée
// réelle — un devis dicté fait 2 à 3 minutes, un message de chat quelques secondes —
// tout en restant sous la limite de corps de requête de la plateforme (~4,5 Mo),
// que les 25 Mo annoncés ne pouvaient de toute façon jamais atteindre.
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/** Transcrit un Blob audio. La LANGUE de dictée suit l'interface : sans ça, un
 *  utilisateur anglophone serait transcrit en français (language forcé "fr"). */
export async function transcribeBlob(file: Blob, filename = "audio.webm"): Promise<TranscribeResult> {
  const locale = await getLocale();
  const provs = providers();
  if (provs.length === 0) {
    return {
      error: pick(locale, "Aucun service de transcription configuré.", "No transcription service configured."),
      status: 503,
    };
  }
  // Borne appliquée ICI (et pas seulement dans les routes) : c'est le seul point
  // par lequel passent les DEUX chemins de dictée (barre de chat et dictée en app).
  if (file.size > MAX_AUDIO_BYTES) {
    return {
      error: pick(
        locale,
        "Enregistrement trop long (environ 8 minutes maximum). Découpez-le en plusieurs dictées.",
        "Recording too long (about 8 minutes max). Split it into several dictations."
      ),
      status: 413,
    };
  }

  let quotaExhausted = false;
  for (const p of provs) {
    const upstream = new FormData();
    upstream.append("file", file, filename);
    upstream.append("model", p.model);
    upstream.append("language", locale === "en" ? "en" : "fr");
    upstream.append("prompt", locale === "en" ? TRANSCRIBE_PROMPT_EN : TRANSCRIBE_PROMPT);
    upstream.append("response_format", "json");

    let res: Response;
    try {
      res = await fetch(p.url, { method: "POST", headers: { Authorization: `Bearer ${p.key}` }, body: upstream });
    } catch {
      continue; // fournisseur suivant
    }

    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as { text?: string };
      return { text: (json.text ?? "").trim() };
    }
    if (res.status === 429 || res.status === 402 || res.status === 401) {
      quotaExhausted = true;
      continue;
    }
  }
  return {
    error: quotaExhausted
      ? pick(locale, "Quota de transcription épuisé (OpenAI/Groq).", "Transcription quota exhausted (OpenAI/Groq).")
      : pick(locale, "La transcription a échoué.", "Transcription failed."),
    status: quotaExhausted ? 503 : 502,
  };
}
