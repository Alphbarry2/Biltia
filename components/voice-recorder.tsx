"use client";

/**
 * Dictaphone temps réel :
 *   • Ondes pilotées par l'amplitude RÉELLE du micro (Web Audio AnalyserNode).
 *   • Aperçu live GRATUIT pendant qu'on parle (Web Speech API du navigateur).
 *   • Transcription FINALE précise à la validation via /api/transcribe
 *     (OpenAI gpt-4o-transcribe, repli Groq). UN SEUL appel serveur par dictée
 *     → coût = durée réelle uniquement (pas de re-transcription en boucle).
 *   • Si le serveur est indisponible (quota), on garde le texte du navigateur :
 *     la dictée n'est jamais muette.
 */

import { useEffect, useRef, useState } from "react";
import { Check, X, Mic, Loader2 } from "lucide-react";
import { useT, useLocale } from "@/lib/i18n/context";

const BAR_COUNT = 44;

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ }
  }
  return "";
}

function extFor(mime: string) {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/* ── Ressources micro partagées à l'échelle de la page ──────────────────────
   iOS/WebKit plafonne le nombre d'AudioContext VIVANTS (~4) et libère la session
   audio de façon PARESSEUSE. En recréer/fermer un à chaque dictée finit par les
   épuiser (ondes mortes) et peut coincer la capture micro → LA cause du « la 2e
   dictée bugue ». On réutilise donc UN SEUL AudioContext pour toute la vie de la
   page, et on mémorise l'instant de libération du micro pour laisser iOS respirer
   avant de rouvrir. */
let sharedAudioCtx: AudioContext | null = null;
let lastMicReleaseAt = 0;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") sharedAudioCtx = new AC();
  return sharedAudioCtx;
}

export function VoiceRecorder({
  initialText = "",
  onCancel,
  onCommit,
}: {
  initialText?: string;
  onCancel: () => void;
  onCommit: (text: string) => void;
}) {
  const tr = useT();
  const locale = useLocale();
  const base = initialText ? initialText.trimEnd() + " " : "";

  const [speechText, setSpeechText] = useState(""); // aperçu live navigateur
  const [status, setStatus] = useState<"connecting" | "listening" | "finalizing" | "error">("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  // Bump pour REDÉMARRER une dictée après une erreur (« Réessayer ») : relance
  // proprement tout le pipeline micro (l'effet dépend de retryKey).
  const [retryKey, setRetryKey] = useState(0);

  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("");
  const stoppedRef = useRef(false);
  const serverDownRef = useRef(false);

  // Web Speech (aperçu live + repli)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const speechFinalRef = useRef("");
  const speechInterimRef = useRef("");

  const cleanup = () => {
    stoppedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { recognitionRef.current?.stop(); } catch { /* déjà arrêté */ }
    recognitionRef.current = null;
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    } catch { /* déjà arrêté */ }
    recorderRef.current = null;
    // Déconnecte la source du graphe SANS fermer le contexte partagé (il resservira
    // à la prochaine dictée — iOS plafonne les AudioContext, cf. getSharedAudioContext).
    try { sourceRef.current?.disconnect(); } catch { /* */ }
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    lastMicReleaseAt = Date.now();
    // Mise en veille du contexte partagé (économie batterie) — jamais close().
    if (sharedAudioCtx && sharedAudioCtx.state === "running") {
      sharedAudioCtx.suspend().catch(() => {});
    }
  };

  const stopRecorder = () =>
    new Promise<void>((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") return resolve();
      rec.onstop = () => resolve();
      try { rec.stop(); } catch { resolve(); }
    });

  // UN SEUL appel serveur, sur l'audio complet. Ne throw jamais : marque
  // serverDownRef si indisponible et renvoie "" (on prendra le texte navigateur).
  const transcribeFinal = async (): Promise<string> => {
    const chunks = chunksRef.current;
    if (chunks.length === 0) return "";
    const blob = new Blob(chunks, { type: mimeRef.current || "audio/webm" });
    // gpt-4o est la source de vérité : on lui laisse 2 tentatives (un hoquet
    // réseau transitoire ne doit PAS nous faire tomber sur le Web Speech pourri).
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = new FormData();
        fd.append("file", blob, `audio.${extFor(mimeRef.current)}`);
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (res.ok) {
          const j = (await res.json()) as { text?: string };
          return (j.text || "").trim();
        }
        const j = await res.json().catch(() => ({} as { fallback?: boolean }));
        // 429/402/401 = quota/auth : inutile de réessayer, on abandonne le serveur.
        if (res.status === 429 || res.status === 402 || res.status === 401 || j?.fallback) {
          serverDownRef.current = true;
          return "";
        }
        // 5xx transitoire : on retente une fois.
      } catch {
        // réseau : on retente une fois.
      }
    }
    serverDownRef.current = true;
    return "";
  };

  const bestSpeech = () =>
    (speechFinalRef.current + " " + speechInterimRef.current).replace(/\s+/g, " ").trim();

  const commit = async () => {
    if (status === "finalizing") return;
    stoppedRef.current = true; // stoppe la relance Web Speech
    setStatus("finalizing");
    try { recognitionRef.current?.stop(); } catch { /* */ }
    await stopRecorder();

    const serverText = await transcribeFinal();
    // gpt-4o d'abord. Le Web Speech du navigateur est BEAUCOUP moins bon (et
    // carrément mauvais sur Brave/Firefox) : on ne l'accepte QUE si le serveur est
    // réellement injoignable ET qu'il a produit un texte substantiel — jamais pour
    // « améliorer » un résultat serveur, jamais du charabia d'une lettre.
    const speech = bestSpeech();
    const finalText = serverText || (serverDownRef.current && speech.length >= 8 ? speech : "");

    if (!finalText) {
      setStatus("error");
      setErrorMsg(
        serverDownRef.current
          ? tr("Service de dictée momentanément indisponible. Réessayez dans un instant.", "Dictation service momentarily unavailable. Try again in a moment.")
          : tr("Aucune parole détectée. Réessayez en parlant un peu plus fort, micro proche.", "No speech detected. Try again, speaking a bit louder with the mic close.")
      );
      return;
    }
    const out = (base + finalText).replace(/\s+/g, " ").trim();
    cleanup();
    onCommit(out);
  };

  const cancel = () => {
    cleanup();
    onCancel();
  };

  useEffect(() => {
    let cancelled = false;

    // (Ré)ouverture : on repart d'un état PROPRE. Indispensable au « refaire une
    // dictée » — sans ça, les refs gardaient l'état de la session précédente
    // (stoppedRef=true, anciens chunks) et la 2e dictée semblait morte.
    stoppedRef.current = false;
    serverDownRef.current = false;
    chunksRef.current = [];
    speechFinalRef.current = "";
    speechInterimRef.current = "";
    setSpeechText("");
    setErrorMsg("");
    setStatus("connecting");

    // Ouvre le micro avec RÉESSAIS : après une session précédente (surtout en PWA
    // iOS), le micro met un instant à se libérer et getUserMedia jette un
    // NotReadableError/AbortError transitoire — la cause n°1 du « je refais un
    // vocal et ça bugue ». Une permission RÉELLEMENT refusée ne se retente pas.
    async function openMic(): Promise<MediaStream> {
      const constraints: MediaStreamConstraints = {
        // Audio NETTOYÉ pour gpt-4o : autoGainControl remonte une voix faible/loin,
        // noiseSuppression coupe le fond, echoCancellation évite le larsen. Mono.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      };
      // Laisse iOS finir de libérer la session micro précédente avant de rouvrir :
      // sans ce répit, getUserMedia jette un NotAllowedError/AbortError transitoire.
      const since = Date.now() - lastMicReleaseAt;
      if (lastMicReleaseAt && since < 700) {
        await new Promise((r) => setTimeout(r, 700 - since));
      }
      let lastErr: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (cancelled) throw new Error("cancelled");
        try {
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
          lastErr = e;
          const name = (e as { name?: string })?.name;
          // SecurityError = contexte non sécurisé (http) → jamais récupérable.
          if (name === "SecurityError") throw e;
          // NotAllowedError est AMBIGU en PWA iOS : vrai refus utilisateur OU simple
          // hoquet juste après la session précédente. On RETENTE (attente croissante) ;
          // si c'est un vrai refus, les 4 tentatives échouent et on affiche le blocage.
          // C'est la cause n°1 corrigée du « je refais un vocal et rien ne se passe ».
          await new Promise((r) => setTimeout(r, 300 + attempt * 350));
        }
      }
      throw lastErr;
    }

    async function begin() {
      let stream: MediaStream;
      try {
        stream = await openMic();
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string })?.name;
        setStatus("error");
        setErrorMsg(
          name === "NotAllowedError" || name === "SecurityError"
            ? tr("Micro bloqué. Autorisez l'accès au microphone dans votre navigateur, puis réessayez.", "Mic blocked. Allow microphone access in your browser, then try again.")
            : tr("Micro momentanément indisponible (déjà utilisé ou pas encore libéré). Réessayez.", "Mic momentarily unavailable (in use or not yet released). Try again.")
        );
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      setStatus("listening");

      // 1) Analyseur -> ondes réactives à la voix. Contexte PARTAGÉ réutilisé
      //    (jamais recréé) pour ne pas épuiser le quota d'AudioContext iOS.
      const ctx = getSharedAudioContext();
      if (ctx) {
        // Mobile / PWA : le contexte démarre/reste souvent « suspended » (politique
        // autoplay, ou mis en veille par la dictée précédente) → ondes mortes. On le
        // réveille explicitement à chaque session.
        if (ctx.state !== "running") { try { await ctx.resume(); } catch { /* ignore */ } }
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const source = ctx.createMediaStreamSource(stream);
        sourceRef.current = source;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const render = () => {
          analyser.getByteFrequencyData(data);
          const bars = barsRef.current;
          const n = bars.length;
          const usable = Math.floor(data.length * 0.66);
          const mid = (n - 1) / 2;
          for (let i = 0; i < n; i++) {
            const dist = Math.abs(i - mid) / mid;
            const idx = Math.floor((1 - dist) * (usable - 1));
            const v = (data[idx] || 0) / 255;
            const scale = 0.12 + Math.pow(v, 1.35) * 2.4;
            const el = bars[i];
            if (el) el.style.transform = `scaleY(${Math.min(scale, 2.7).toFixed(3)})`;
          }
          rafRef.current = requestAnimationFrame(render);
        };
        render();
      }

      // 2) Enregistreur -> audio pour la transcription serveur (1 appel final).
      const mime = pickMime();
      mimeRef.current = mime;
      try {
        const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
        try { rec.start(1000); } catch { rec.start(); }
        recorderRef.current = rec;
      } catch {
        // Pas de MediaRecorder : on comptera sur Web Speech seul.
      }

      // 3) Web Speech (gratuit) : aperçu live + repli. Best-effort.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
      if (SR) {
        const startRec = () => {
          if (stoppedRef.current) return;
          const rec = new SR();
          rec.lang = locale === "en" ? "en-US" : "fr-FR";
          rec.continuous = true;
          rec.interimResults = true;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rec.onresult = (e: any) => {
            let it = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const t = e.results[i][0].transcript;
              if (e.results[i].isFinal) speechFinalRef.current += t + " ";
              else it += t;
            }
            speechInterimRef.current = it;
            setSpeechText((speechFinalRef.current + it).trimStart());
          };
          rec.onend = () => { if (!stoppedRef.current) startRec(); };
          try { rec.start(); } catch { /* relancé par onend */ }
          recognitionRef.current = rec;
        };
        startRec();
      }
    }

    begin();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
      else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  const isError = status === "error";
  const isFinalizing = status === "finalizing";
  const shown = (base + speechText).replace(/\s+/g, " ").trim();

  return (
    <div className="relative animate-fade-in px-4 pt-3.5 pb-3">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-8 h-24 rounded-full bg-gradient-to-r from-indigo-400/20 via-violet-400/25 to-pink-400/20 blur-2xl animate-glow-pulse"
      />

      {/* ligne du haut : point rec + état + fermer */}
      <div className="relative flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isError ? "bg-[#9A9AA6]" : isFinalizing ? "bg-[#7C3AED]" : "bg-rose-500 animate-pulse"}`} />
          </span>
          <span className="text-[12.5px] text-[#9A9AA6]">
            {isError
              ? tr("Interrompu", "Interrupted")
              : isFinalizing
              ? tr("Transcription en cours…", "Transcribing…")
              : status === "connecting"
              ? tr("Connexion du micro…", "Connecting the mic…")
              : tr("À l'écoute…", "Listening…")}
          </span>
        </div>
        <button
          onClick={cancel}
          aria-label={tr("Fermer la dictée", "Close dictation")}
          className="w-8 h-8 flex items-center justify-center rounded-full text-[#9A9AA6] hover:text-[#0A0A0A] hover:bg-black/[0.05] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ondes réactives */}
      <div className="relative flex items-center justify-center gap-[3px] h-16 mb-3">
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <span
            key={i}
            ref={(el) => { barsRef.current[i] = el; }}
            className="w-[3px] h-10 rounded-full bg-gradient-to-t from-indigo-500 via-violet-500 to-pink-500"
            style={{ transform: "scaleY(0.12)", transformOrigin: "center", willChange: "transform" }}
          />
        ))}
      </div>

      {/* transcription live (aperçu navigateur ; le texte final précis arrive à la validation) */}
      <div className="relative min-h-[46px] max-h-[140px] overflow-y-auto text-left text-[15px] leading-relaxed">
        {isError ? (
          <p className="text-[13.5px] text-rose-600">{errorMsg}</p>
        ) : isFinalizing ? (
          <p className="flex items-center gap-2 text-[#6E6E7A]">
            <Loader2 className="w-4 h-4 animate-spin text-[#7C3AED]" />
            {tr("Transcription précise de votre dictée…", "Accurately transcribing your dictation…")}
          </p>
        ) : shown ? (
          <p className="text-[#0A0A0A]">{shown}</p>
        ) : (
          <p className="text-[#9A9AA6]">{tr("Parlez, votre dictée s’écrit ici…", "Speak, your dictation appears here…")}</p>
        )}
      </div>

      {/* actions */}
      <div className="relative flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-1.5 text-[11.5px] text-[#9A9AA6]">
          <Mic className="w-3.5 h-3.5" />
          <span>{tr("Entrée pour valider · Échap pour annuler", "Enter to confirm · Esc to cancel")}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cancel}
            className="px-3.5 py-2 text-[13px] font-medium rounded-full text-[#4A4A56] bg-black/[0.04] border border-black/[0.06] hover:bg-black/[0.07] transition-colors"
          >
            {isError ? tr("Fermer", "Close") : tr("Annuler", "Cancel")}
          </button>
          {isError && (
            <button
              onClick={() => { setErrorMsg(""); setStatus("connecting"); setRetryKey((k) => k + 1); }}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-full text-white bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 shadow-[0_6px_20px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_28px_rgba(139,92,246,0.55)] active:scale-95 transition-all"
            >
              <Mic className="w-4 h-4" />
              {tr("Réessayer", "Retry")}
            </button>
          )}
          {!isError && (
            <button
              onClick={commit}
              disabled={isFinalizing}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-full text-white bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 shadow-[0_6px_20px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_28px_rgba(139,92,246,0.55)] active:scale-95 transition-all disabled:opacity-60 disabled:active:scale-100"
            >
              {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isFinalizing ? tr("Transcription…", "Transcribing…") : tr("Valider", "Confirm")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
