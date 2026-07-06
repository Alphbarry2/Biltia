// ─────────────────────────────────────────────────────────────────────────────
// /api/transcribe — DICTÉE VOCALE (speech-to-text).
//
// La barre de chat enregistre le micro (MediaRecorder) et POST l'audio ici.
// On le transcrit via un modèle Whisper serveur. Anthropic ne fait pas d'audio.
//
// Fournisseurs (dans l'ordre, on prend le premier qui répond) :
//   1. Groq   — `whisper-large-v3-turbo`, endpoint compatible OpenAI, offre
//               un tier GRATUIT généreux (GROQ_API_KEY). Recommandé.
//   2. OpenAI — `whisper-1` (OPENAI_API_KEY, déjà présente pour les embeddings).
//
// Si AUCUN fournisseur n'est utilisable (pas de clé, ou quota épuisé), on répond
// 503 { fallback: true } : le client bascule alors sur la dictée navigateur
// (Web Speech API, gratuite) pour ne pas rester muet.
//
// Appel HTTP direct via `fetch` (multipart) — pas de nouvelle dépendance npm.
// Auth requise (Zero Trust) ; aucun crédit débité (dictée = confort de saisie).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";

const MAX_BYTES = 25 * 1024 * 1024; // limite OpenAI/Groq

// Biais de vocabulaire : « cale » le modèle sur le jargon BTP + franglais du
// métier pour qu'il arrête de massacrer les termes rares. gpt-4o-transcribe et
// Whisper acceptent tous deux ce `prompt`.
const TRANSCRIBE_PROMPT =
  "Dictée d'un professionnel du BTP en France, français avec anglicismes du métier. " +
  "Termes possibles : devis, avenant, acompte, situation de travaux, CCTP, DPGF, DGD, DTU, VRD, " +
  "placo, BA13, parpaing, ferraillage, chape, ragréage, faïence, huisserie, hourdis, VMC, PAC, " +
  "MOA, MOE, showroom, deadline, planning, Velux, Placoplatre, Knauf, Weber, Sika, Rockwool.";

type Provider = { name: string; url: string; key: string; model: string };

function isRealKey(k: string | undefined): k is string {
  return !!k && !k.startsWith("your_") && k.length > 20;
}

function providers(): Provider[] {
  const list: Provider[] = [];
  // 1) OpenAI gpt-4o-transcribe : le meilleur sur le jargon (choix produit).
  if (isRealKey(process.env.OPENAI_API_KEY)) {
    list.push({
      name: "openai",
      url: "https://api.openai.com/v1/audio/transcriptions",
      key: process.env.OPENAI_API_KEY!,
      model: "gpt-4o-transcribe",
    });
  }
  // 2) Groq (Whisper large v3 turbo) : repli GRATUIT si OpenAI est indisponible.
  if (isRealKey(process.env.GROQ_API_KEY)) {
    list.push({
      name: "groq",
      url: "https://api.groq.com/openai/v1/audio/transcriptions",
      key: process.env.GROQ_API_KEY!,
      model: "whisper-large-v3-turbo",
    });
  }
  return list;
}

export async function POST(req: Request) {
  try {
    const provs = providers();
    if (provs.length === 0) {
      return Response.json(
        { error: "Aucun service de transcription configuré.", fallback: true },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Authentification requise." }, { status: 401 });
    }

    // Rate limiting : rejette un flood au plus tôt.
    const limited = await enforceRateLimit("transcribe", user.id, LIMITS.transcribe);
    if (limited) return limited;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: "Requête invalide." }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return Response.json({ error: "Aucun audio fourni." }, { status: 400 });
    }
    if (file.size === 0) return Response.json({ text: "" });
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Audio trop long (25 Mo max)." }, { status: 413 });
    }
    const filename = file instanceof File && file.name ? file.name : "audio.webm";

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
        res = await fetch(p.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${p.key}` },
          body: upstream,
        });
      } catch (e) {
        console.error(`transcribe ${p.name} network error`, e);
        continue; // fournisseur suivant
      }

      if (res.ok) {
        const json = (await res.json()) as { text?: string };
        return Response.json({ text: (json.text ?? "").trim(), provider: p.name });
      }

      const detail = await res.text().catch(() => "");
      console.error(`transcribe ${p.name}`, res.status, detail.slice(0, 200));
      // Quota / paiement / auth -> on tente le fournisseur suivant.
      if (res.status === 429 || res.status === 402 || res.status === 401) {
        quotaExhausted = true;
        continue;
      }
      // Autre erreur -> on tente aussi le suivant, sinon on tombera en 502.
    }

    // Aucun fournisseur n'a abouti.
    return Response.json(
      {
        error: quotaExhausted
          ? "Quota de transcription épuisé (OpenAI/Groq). Ajoutez une clé Groq gratuite ou rechargez OpenAI."
          : "La transcription a échoué. Réessayez.",
        fallback: true,
      },
      { status: quotaExhausted ? 503 : 502 }
    );
  } catch (err) {
    console.error("Transcribe error:", err);
    return Response.json({ error: "Erreur de transcription.", fallback: true }, { status: 500 });
  }
}
