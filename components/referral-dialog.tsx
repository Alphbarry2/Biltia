"use client";

import { useEffect, useState } from "react";
import { Gift, Copy, Check, Download, Mail, MessageCircle, Smartphone, X, Sparkles } from "lucide-react";

type RefData = {
  code: string;
  link: string;
  qr: string;
  stats: { signedUp: number; converted: number; creditsEarned: number };
};

// Message de partage : simple, orienté artisan, met en avant le cadeau du filleul.
function shareMessage(link: string): string {
  return `Je gère mes chantiers avec Biltia. Inscris-toi avec mon lien, tu reçois 200 crédits offerts pour tester : ${link}`;
}

export function ReferralDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<RefData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    fetch("/api/referral/me")
      .then((r) => r.json())
      .then((res) => {
        if (res?.ok) setData(res as RefData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, data]);

  if (!open) return null;

  const link = data?.link ?? "";
  const msg = link ? shareMessage(link) : "";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard indisponible */
    }
  };

  const stat = (value: number, label: string) => (
    <div className="flex-1 rounded-xl border border-[#EDEDE9] bg-white px-3 py-2.5 text-center">
      <p className="text-[18px] font-black tabular-nums text-[#0A0A0A] leading-tight">{value.toLocaleString("fr-FR")}</p>
      <p className="mt-0.5 text-[10.5px] font-medium text-[#9A9A97] leading-tight">{label}</p>
    </div>
  );

  const step = (n: string, text: React.ReactNode) => (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 text-[11px] font-bold text-white">
        {n}
      </span>
      <span className="text-[13px] leading-relaxed text-[#4A4A56]">{text}</span>
    </li>
  );

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40 backdrop-blur-[2px] p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-[440px] overflow-y-auto rounded-t-[24px] bg-[#FCFCFD] shadow-[0_24px_80px_rgba(20,18,39,0.28)] sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête coloré */}
        <div className="relative overflow-hidden px-5 pt-6 pb-5 sm:px-6">
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(139,92,246,0.35), rgba(236,72,153,0.22) 55%, transparent 75%)" }}
          />
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-[#9A9A97] transition-colors hover:bg-black/[0.05] hover:text-[#0A0A0A]"
          >
            <X className="h-4 w-4" />
          </button>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E2D7] bg-white/70 px-3 py-1 text-[12px] font-semibold text-[#7C3AED] backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> Gagnez jusqu&apos;à 3&nbsp;000 crédits
          </span>
          <h2 className="mt-3 text-[22px] font-black tracking-[-0.02em] text-[#0A0A0A]">Invitez votre réseau BTP</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6E6E6C]">
            Vous gagnez des crédits IA quand vos invités passent sur un plan payant. Eux reçoivent 200 crédits dès l&apos;inscription.
          </p>
        </div>

        <div className="px-5 pb-6 sm:px-6">
          {/* Comment ça marche */}
          <ul className="space-y-2.5">
            {step("1", "Partagez votre lien ou votre QR code.")}
            {step("2", <>Votre invité reçoit <b className="font-semibold text-[#0A0A0A]">+200 crédits</b> en s&apos;inscrivant.</>)}
            {step("3", <>S&apos;il passe en <b className="font-semibold text-[#0A0A0A]">Pro</b> : vous gagnez <b className="font-semibold text-[#0A0A0A]">+1&nbsp;500</b>, lui <b className="font-semibold text-[#0A0A0A]">+1&nbsp;000</b>.</>)}
            {step("4", <>S&apos;il passe en <b className="font-semibold text-[#0A0A0A]">Équipe</b> : vous gagnez <b className="font-semibold text-[#0A0A0A]">+3&nbsp;000</b>, lui <b className="font-semibold text-[#0A0A0A]">+2&nbsp;000</b>.</>)}
          </ul>

          {/* Compteurs */}
          <div className="mt-5 flex gap-2.5">
            {stat(data?.stats.signedUp ?? 0, "inscrits")}
            {stat(data?.stats.converted ?? 0, "convertis")}
            {stat(data?.stats.creditsEarned ?? 0, "crédits gagnés")}
          </div>

          {/* Bloc lien + QR */}
          <div className="mt-5 rounded-2xl border border-[#EDEDE9] bg-white p-4">
            <div className="flex items-center gap-4">
              {/* QR */}
              <div className="flex-shrink-0">
                {data?.qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.qr} alt="QR code d'invitation" className="h-[104px] w-[104px] rounded-lg border border-[#EDEDE9]" />
                ) : (
                  <div className="grid h-[104px] w-[104px] place-items-center rounded-lg border border-dashed border-[#E7E7E4] text-[#C9C9C4]">
                    <Gift className="h-6 w-6" />
                  </div>
                )}
              </div>
              {/* Lien + copier */}
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97]">Votre lien d&apos;invitation</p>
                <div className="truncate rounded-lg border border-[#EDEDE9] bg-[#FAFAF8] px-2.5 py-2 text-[12px] text-[#4A4A56]">
                  {loading && !link ? "…" : link || "—"}
                </div>
                <button
                  onClick={copy}
                  disabled={!link}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0A0A0A] py-2 text-[13px] font-semibold text-white transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                >
                  {copied ? <><Check className="h-3.5 w-3.5" /> Copié</> : <><Copy className="h-3.5 w-3.5" /> Copier le lien</>}
                </button>
              </div>
            </div>

            {/* Partages */}
            <div className="mt-3 grid grid-cols-4 gap-2">
              <a
                href={link ? `https://wa.me/?text=${encodeURIComponent(msg)}` : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 rounded-lg border border-[#EDEDE9] py-2 text-[10.5px] font-medium text-[#4A4A56] transition-colors hover:bg-[#F6F6F9]"
              >
                <MessageCircle className="h-4 w-4 text-[#25D366]" /> WhatsApp
              </a>
              <a
                href={link ? `sms:?&body=${encodeURIComponent(msg)}` : undefined}
                className="flex flex-col items-center gap-1 rounded-lg border border-[#EDEDE9] py-2 text-[10.5px] font-medium text-[#4A4A56] transition-colors hover:bg-[#F6F6F9]"
              >
                <Smartphone className="h-4 w-4 text-[#7C3AED]" /> SMS
              </a>
              <a
                href={link ? `mailto:?subject=${encodeURIComponent("Teste Biltia (200 crédits offerts)")}&body=${encodeURIComponent(msg)}` : undefined}
                className="flex flex-col items-center gap-1 rounded-lg border border-[#EDEDE9] py-2 text-[10.5px] font-medium text-[#4A4A56] transition-colors hover:bg-[#F6F6F9]"
              >
                <Mail className="h-4 w-4 text-[#4A4A56]" /> Email
              </a>
              <a
                href={data?.qr || undefined}
                download="biltia-invitation-qr.png"
                className="flex flex-col items-center gap-1 rounded-lg border border-[#EDEDE9] py-2 text-[10.5px] font-medium text-[#4A4A56] transition-colors hover:bg-[#F6F6F9]"
              >
                <Download className="h-4 w-4 text-[#4A4A56]" /> QR code
              </a>
            </div>
          </div>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-[#9A9A97]">
            Les crédits bonus sont réservés aux nouveaux utilisateurs. Les gros bonus sont versés lorsqu&apos;un invité passe sur un plan payant, après 14 jours sans remboursement. Crédits non convertibles en argent ; annulables en cas de fraude ou d&apos;abus.
          </p>
        </div>
      </div>
    </div>
  );
}
