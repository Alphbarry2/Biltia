// ─────────────────────────────────────────────────────────────────────────────
// SONNERIE DE FIN — signal audio quand un livrable long est prêt (app, document).
//
// Généré à la volée via Web Audio (aucun fichier .mp3, marche hors-ligne, aucune
// requête réseau). Trois notes ascendantes douces = un « c'est prêt » agréable,
// jamais agressif. Silencieux si l'audio n'est pas dispo ou coupé par l'utilisateur.
//
// Autoplay : au moment où un build se termine, l'utilisateur a déjà cliqué
// « Envoyer » → le contexte audio est débloqué. On le crée à la demande.
// ─────────────────────────────────────────────────────────────────────────────

const MUTE_KEY = "biltia_sound_muted";

export function isChimeMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setChimeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* stockage indisponible : on ignore */
  }
}

export function playCompletionChime(): void {
  if (typeof window === "undefined") return;
  if (isChimeMuted()) return;

  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();

    resume
      .then(() => {
        const now = ctx.currentTime;
        // Accord ascendant doux (proche d'un carillon « tâche terminée »).
        const notes = [
          { freq: 880.0, at: 0.0 },   // A5
          { freq: 1174.66, at: 0.11 }, // D6
          { freq: 1567.98, at: 0.22 }, // G6
        ];
        for (const { freq, at } of notes) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          const start = now + at;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.55);
        }
        // Libère le contexte une fois la sonnerie jouée.
        window.setTimeout(() => ctx.close().catch(() => {}), 1100);
      })
      .catch(() => {});
  } catch {
    /* audio indisponible : on reste silencieux, jamais d'erreur remontée */
  }
}
