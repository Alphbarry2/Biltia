"use client";

// ─────────────────────────────────────────────────────────────────────────────
// « BON POUR ACCORD » — le geste que fait le client de l'artisan.
//
// Un devis se signe. On reproduit le geste papier : le client écrit son nom et
// signe au doigt (téléphone) ou à la souris. Pas de compte à créer, pas de mot de
// passe : il est arrivé par un lien secret, ça suffit.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  token: string;
  primary: string;
  onPrimary: string;
  clientName: string;
  /** Déjà signé : on affiche la preuve, pas le formulaire. */
  acceptedAt: string | null;
  acceptedByName: string | null;
  signatureData: string | null;
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function AcceptCard({
  token,
  primary,
  onPrimary,
  clientName,
  acceptedAt,
  acceptedByName,
  signatureData,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const [name, setName] = useState(clientName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ at: string; name: string } | null>(
    acceptedAt ? { at: acceptedAt, name: acceptedByName ?? "" } : null
  );

  // Le canvas doit être net sur écran Retina ET suivre la largeur du téléphone :
  // on le redimensionne à la densité réelle, sinon la signature est floue et
  // décalée du doigt.
  const sizeCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111114";
  }, []);

  useEffect(() => {
    if (done) return;
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, [sizeCanvas, done]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Capture du pointeur : le doigt qui sort du cadre ne coupe pas le trait.
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault(); // sinon le téléphone fait défiler la page au lieu de signer
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasInk.current = true;
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
  };

  const submit = async () => {
    setError("");
    if (name.trim().length < 2) {
      setError("Merci d'indiquer votre nom.");
      return;
    }
    if (!hasInk.current) {
      setError("Merci de signer dans le cadre.");
      return;
    }
    const signature = canvasRef.current?.toDataURL("image/png") ?? "";
    setBusy(true);
    try {
      const res = await fetch("/api/documents/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim(), signature }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        acceptedAt?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "Signature non enregistrée. Réessayez.");
        return;
      }
      setDone({ at: json.acceptedAt ?? new Date().toISOString(), name: name.trim() });
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div
        style={{ borderColor: primary, background: `${primary}0D` }}
        className="rounded-2xl border p-6 sm:p-8"
      >
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
            style={{ background: primary, color: onPrimary }}
            aria-hidden
          >
            ✓
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#111114]">Devis accepté</h2>
            <p className="mt-1 text-sm text-[#63636B]">
              Signé par <strong className="text-[#111114]">{done.name || "vous"}</strong> le{" "}
              {fmtDateTime(done.at)}. L&apos;entreprise en a été informée et revient vers vous.
            </p>
            {signatureData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signatureData}
                alt="Signature"
                className="mt-4 h-16 w-auto max-w-[220px] object-contain"
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#ECECF0] bg-white p-6 sm:p-8">
      <h2 className="text-lg font-bold text-[#111114]">Bon pour accord</h2>
      <p className="mt-1 text-sm text-[#63636B]">
        Signez ci-dessous pour accepter ce devis. L&apos;entreprise est prévenue immédiatement.
      </p>

      <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-[#63636B]">
        Votre nom
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Prénom et nom"
          autoComplete="name"
          className="mt-2 w-full rounded-xl border border-[#ECECF0] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#111114] outline-none transition focus:border-transparent focus:ring-2"
          style={{ ["--tw-ring-color" as string]: primary }}
        />
      </label>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#63636B]">
            Votre signature
          </span>
          <button
            type="button"
            onClick={clear}
            className="text-xs font-semibold text-[#63636B] underline underline-offset-2 hover:text-[#111114]"
          >
            Effacer
          </button>
        </div>
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          // touch-action:none → le doigt SIGNE au lieu de faire défiler la page.
          className="mt-2 h-40 w-full touch-none rounded-xl border border-dashed border-[#D6D6DE] bg-[#FBFBFC]"
        />
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-[#D92D20]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-5 w-full rounded-xl px-6 py-4 text-base font-bold transition active:scale-[0.99] disabled:opacity-60"
        style={{ background: primary, color: onPrimary }}
      >
        {busy ? "Enregistrement…" : "Je signe et j'accepte ce devis"}
      </button>
    </div>
  );
}
