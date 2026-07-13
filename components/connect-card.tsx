"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CARTE DE CONNEXION INLINE — proposée DANS la conversation (copilote) ou dans la
// pop-up d'activation d'un agent quand une intégration manque. L'utilisateur
// clique « Connecter » → flux OAuth en pop-up → la carte passe « Connecté ✅ »
// sans quitter l'écran. Une intégration à la fois (l'orchestration « étape par
// étape » est gérée par l'appelant qui n'affiche la suivante qu'une fois celle-ci
// connectée).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import Image from "next/image";
import { CheckCircle, Loader2, Plug, Puzzle } from "lucide-react";
import { getConnector } from "@/lib/connectors";
import { connectViaPopup } from "@/lib/connect-popup";
import { useT } from "@/lib/i18n/context";

export function ConnectCard({
  connectorId,
  onConnected,
  onRefused,
  refused,
}: {
  connectorId: string;
  onConnected?: (provider: string) => void;
  onRefused?: () => void;
  /** L'appelant a déjà enregistré un refus → carte neutralisée. */
  refused?: boolean;
}) {
  const t = useT();
  const connector = getConnector(connectorId);
  const [state, setState] = useState<"idle" | "busy" | "connected">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!connector) return null;

  const connect = async () => {
    if (state === "busy") return;
    setState("busy");
    setError(null);
    const r = await connectViaPopup(connectorId);
    if (r.ok) {
      setState("connected");
      onConnected?.(r.provider ?? connector.provider ?? "");
    } else {
      setState("idle");
      if (!r.canceled) setError(r.error ?? t("Connexion impossible.", "Connection failed."));
    }
  };

  const isGoogle = connector.provider === "google";
  const done = state === "connected";

  return (
    <div className="max-w-md rounded-2xl border border-[#EAEAEF] bg-white p-4 shadow-[0_4px_20px_rgba(60,40,120,0.05)]">
      <div className="flex items-center gap-3">
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${connector.logo ? "bg-white border border-[#EDEDF2]" : "bg-[#F3EFFC]"}`}
        >
          {connector.logo ? (
            <Image src={connector.logo} alt={t(`Logo ${connector.name}`, `${connector.name} logo`)} width={22} height={22} className="w-[22px] h-[22px] object-contain" />
          ) : (
            <Puzzle className="w-[18px] h-[18px] text-[#7C3AED]" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-[#0A0A0A] leading-tight truncate">{connector.name}</p>
          <p className="text-[12px] text-[#9A9A97] leading-snug mt-0.5 line-clamp-2">{connector.desc}</p>
        </div>
        {done && (
          <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-600">
            <CheckCircle className="w-3 h-3" /> {t("Connecté", "Connected")}
          </span>
        )}
      </div>

      {!done && isGoogle && (
        <p className="mt-3 text-[10.5px] leading-snug text-[#B4ADC4]">
          {t("L'utilisation des informations reçues des API Google respectera la", "Biltia's use of information received from Google APIs will adhere to the")}{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[#D8D0EC] hover:text-[#7C3AED]"
          >
            {t("Politique relative aux données utilisateur de Google", "Google API Services User Data Policy")}
          </a>
          {t(", y compris les exigences d'utilisation limitée.", ", including the Limited Use requirements.")}
        </p>
      )}

      {error && <p className="mt-2 text-[11px] text-rose-600 leading-snug">{error}</p>}

      {!done && !refused && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onRefused?.()}
            disabled={state === "busy"}
            className="rounded-lg border border-[#E6E6EC] px-3 py-1.5 text-[12px] font-semibold text-[#6A6A75] hover:bg-[#F7F7F9] transition-colors disabled:opacity-50"
          >
            {t("Refuser", "Decline")}
          </button>
          <button
            type="button"
            onClick={connect}
            disabled={state === "busy"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A0A0A] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_4px_14px_rgba(60,40,120,0.12)] hover:shadow-[0_8px_24px_rgba(60,40,120,0.16)] transition-all disabled:opacity-60"
          >
            {state === "busy" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
            {t("Connecter", "Connect")}
          </button>
        </div>
      )}

      {refused && !done && (
        <p className="mt-2 text-[11px] text-[#B4ADC4] leading-snug">{t("Connexion ignorée.", "Connection skipped.")}</p>
      )}
    </div>
  );
}
