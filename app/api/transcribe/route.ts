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
import { getLocale } from "@/lib/i18n/server";
import { pick, type Locale } from "@/lib/i18n/config";

const MAX_BYTES = 25 * 1024 * 1024; // limite OpenAI/Groq

// Biais de vocabulaire : « cale » le modèle sur le jargon BTP + franglais du
// métier pour qu'il arrête de massacrer les termes rares. gpt-4o-transcribe et
// Whisper acceptent tous deux ce `prompt`.
const TRANSCRIBE_PROMPT =
  "Dictée d'un professionnel du BTP en France, français avec anglicismes du métier. " +
  "Termes possibles : devis, avenant, acompte, situation de travaux, CCTP, DPGF, DGD, DTU, VRD, " +
  "placo, BA13, parpaing, ferraillage, chape, ragréage, faïence, huisserie, hourdis, VMC, PAC, " +
  "MOA, MOE, showroom, deadline, planning, Velux, Placoplatre, Knauf, Weber, Sika, Rockwool.";

const TRANSCRIBE_PROMPT_EN =
  "Dictation by a construction professional. Likely terms: quote, variation order, deposit, " +
  "progress claim, bill of quantities, snagging, plasterboard, drywall, screed, skim coat, " +
  "blockwork, rebar, joinery, lintel, ventilation (MVHR), heat pump, scaffolding, site survey, " +
  "handover, punch list, RFI, lead time, schedule.";

/** Langue + biais de vocabulaire de la dictée, selon l'interface. Sans ça, un
 *  utilisateur anglophone se ferait transcrire EN FRANÇAIS (language forcé "fr"). */
function transcribeHints(locale: Locale): { language: string; prompt: string } {
  return locale === "en"
    ? { language: "en", prompt: TRANSCRIBE_PROMPT_EN }
    : { language: "fr", prompt: TRANSCRIBE_PROMPT };
}

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
    const locale = await getLocale();
    const provs = providers();
    if (provs.length === 0) {
      return Response.json(
        {
          error: pick(
            locale,
            "Aucun service de transcription configuré.",
            "No transcription service is configured."
          ),
          fallback: true,
        },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json(
        { error: pick(locale, "Authentification requise.", "Authentication required.") },
        { status: 401 }
      );
    }

    // Rate limiting : rejette un flood au plus tôt.
    const limited = await enforceRateLimit("transcribe", user.id, LIMITS.transcribe);
    if (limited) return limited;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: pick(locale, "Requête invalide.", "Invalid request.") }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return Response.json({ error: pick(locale, "Aucun audio fourni.", "No audio provided.") }, { status: 400 });
    }
    if (file.size === 0) return Response.json({ text: "" });
    if (file.size > MAX_BYTES) {
      return Response.json(
        { error: pick(locale, "Audio trop long (25 Mo max).", "Audio too long (25 MB max).") },
        { status: 413 }
      );
    }
    const filename = file instanceof File && file.name ? file.name : "audio.webm";

    const hints = transcribeHints(locale);

    let quotaExhausted = false;
    for (const p of provs) {
      const upstream = new FormData();
      upstream.append("file", file, filename);
      upstream.append("model", p.model);
      upstream.append("language", hints.language);
      upstream.append("prompt", hints.prompt);
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
          ? pick(
              locale,
              "Quota de transcription épuisé (OpenAI/Groq). Ajoutez une clé Groq gratuite ou rechargez OpenAI.",
              "Transcription quota exhausted (OpenAI/Groq). Add a free Groq key or top up OpenAI."
            )
          : pick(locale, "La transcription a échoué. Réessayez.", "Transcription failed. Please try again."),
        fallback: true,
      },
      { status: quotaExhausted ? 503 : 502 }
    );
  } catch (err) {
    console.error("Transcribe error:", err);
    const locale = await getLocale();
    return Response.json(
      { error: pick(locale, "Erreur de transcription.", "Transcription error."), fallback: true },
      { status: 500 }
    );
  }
}
