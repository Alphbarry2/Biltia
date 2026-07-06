// ─────────────────────────────────────────────────────────────────────────────
// Cœur de transcription audio, partagé entre /api/transcribe (barre de chat) et
// /api/app-ai (dictée DANS une app générée). Essaie OpenAI (gpt-4o-transcribe,
// meilleur sur le jargon) puis Groq (Whisper large v3 turbo, repli gratuit).
// ─────────────────────────────────────────────────────────────────────────────

type Provider = { name: string; url: string; key: string; model: string };

const TRANSCRIBE_PROMPT =
  "Transcription en français, vocabulaire du BTP (devis, chantier, TVA, m², bon de livraison, pointage, avenant).";

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

/** Transcrit un Blob audio en texte français. Bascule de fournisseur en fournisseur. */
export async function transcribeBlob(file: Blob, filename = "audio.webm"): Promise<TranscribeResult> {
  const provs = providers();
  if (provs.length === 0) return { error: "Aucun service de transcription configuré.", status: 503 };

  let quotaExhausted = false;
  for (const p of provs) {
    const upstream = new FormData();
    upstream.append("file", file, filename);
    upstream.append("model", p.model);
    upstream.append("language", "fr");
    upstream.append("prompt", TRANSCRIBE_PROMPT);
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
    error: quotaExhausted ? "Quota de transcription épuisé (OpenAI/Groq)." : "La transcription a échoué.",
    status: quotaExhausted ? 503 : 502,
  };
}
