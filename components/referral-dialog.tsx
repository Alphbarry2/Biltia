"use client";

import { useEffect, useState } from "react";
import { Gift, Copy, Check, Download, Mail, MessageCircle, Smartphone, X, Sparkles } from "lucide-react";
import { useT, useLocale } from "@/lib/i18n/context";
import { pick, type Locale } from "@/lib/i18n/config";
import { REFERRAL_SIGNUP_BONUS, REFERRAL_PRO_REFERRER, REFERRAL_PRO_REFERRED } from "@/lib/plans";

const fmtRef = (n: number, locale: Locale) => n.toLocaleString(locale === "en" ? "en-US" : "fr-FR");

type RefData = {
  code: string;
  link: string;
  qr: string;
  stats: { signedUp: number; converted: number; creditsEarned: number };
};

// Message de partage : simple, orienté artisan, met en avant le cadeau du filleul.
function shareMessage(link: string, locale: Locale): string {
  return pick(
    locale,
    `Je gère mes chantiers avec Biltia. Inscris-toi avec mon lien, tu reçois ${fmtRef(REFERRAL_SIGNUP_BONUS, "fr")} crédits offerts pour tester : ${link}`,
    `I run my job sites with Biltia. Sign up with my link and get ${fmtRef(REFERRAL_SIGNUP_BONUS, "en")} free credits to try it: ${link}`,
  );
}

export function ReferralDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
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
  const msg = link ? shareMessage(link, locale) : "";

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
      <p className="text-[18px] font-black tabular-nums text-[#0A0A0A] leading-tight">{value.toLocaleString(locale === "en" ? "en-US" : "fr-FR")}</p>
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
        className="relative max-h-[92dvh] w-full max-w-[440px] overflow-y-auto rounded-t-[24px] bg-[#FCFCFD] pb-safe shadow-[0_24px_80px_rgba(20,18,39,0.28)] sm:rounded-[24px] sm:pb-0"
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
            aria-label={t("Fermer", "Close")}
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-[#9A9A97] transition-colors hover:bg-black/[0.05] hover:text-[#0A0A0A]"
          >
            <X className="h-4 w-4" />
          </button>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E2D7] bg-white/70 px-3 py-1 text-[12px] font-semibold text-[#7C3AED] backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> {t(`Gagnez jusqu'à ${fmtRef(REFERRAL_PRO_REFERRER, locale)} crédits`, `Earn up to ${fmtRef(REFERRAL_PRO_REFERRER, locale)} credits`)}
          </span>
          <h2 className="mt-3 text-[22px] font-black tracking-[-0.02em] text-[#0A0A0A]">{t("Invitez votre réseau BTP", "Invite your trade network")}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6E6E6C]">
            {t(`Vous gagnez des crédits IA quand vos invités passent sur un plan payant. Eux reçoivent ${fmtRef(REFERRAL_SIGNUP_BONUS, locale)} crédits dès l'inscription.`, `You earn AI credits when your invitees move to a paid plan. They get ${fmtRef(REFERRAL_SIGNUP_BONUS, locale)} credits on sign-up.`)}
          </p>
        </div>

        <div className="px-5 pb-6 sm:px-6">
          {/* Comment ça marche */}
          <ul className="space-y-2.5">
            {step("1", t("Partagez votre lien ou votre QR code.", "Share your link or QR code."))}
            {step("2", <>{t("Votre invité reçoit", "Your invitee gets")} <b className="font-semibold text-[#0A0A0A]">{t(`+${fmtRef(REFERRAL_SIGNUP_BONUS, locale)} crédits`, `+${fmtRef(REFERRAL_SIGNUP_BONUS, locale)} credits`)}</b> {t("en s'inscrivant.", "on sign-up.")}</>)}
            {step("3", <>{t("S'il passe en", "If they go")} <b className="font-semibold text-[#0A0A0A]">Pro</b> : {t("vous gagnez", "you earn")} <b className="font-semibold text-[#0A0A0A]">+{fmtRef(REFERRAL_PRO_REFERRER, locale)}</b>, {t("lui", "they")} <b className="font-semibold text-[#0A0A0A]">+{fmtRef(REFERRAL_PRO_REFERRED, locale)}</b>.</>)}
          </ul>

          {/* Compteurs */}
          <div className="mt-5 flex gap-2.5">
            {stat(data?.stats.signedUp ?? 0, t("inscrits", "signed up"))}
            {stat(data?.stats.converted ?? 0, t("convertis", "converted"))}
            {stat(data?.stats.creditsEarned ?? 0, t("crédits gagnés", "credits earned"))}
          </div>

          {/* Bloc lien + QR */}
          <div className="mt-5 rounded-2xl border border-[#EDEDE9] bg-white p-4">
            <div className="flex items-center gap-4">
              {/* QR */}
              <div className="flex-shrink-0">
                {data?.qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.qr} alt={t("QR code d'invitation", "Invitation QR code")} className="h-[104px] w-[104px] rounded-lg border border-[#EDEDE9]" />
                ) : (
                  <div className="grid h-[104px] w-[104px] place-items-center rounded-lg border border-dashed border-[#E7E7E4] text-[#C9C9C4]">
                    <Gift className="h-6 w-6" />
                  </div>
                )}
              </div>
              {/* Lien + copier */}
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9A9A97]">{t("Votre lien d'invitation", "Your invite link")}</p>
                <div className="truncate rounded-lg border border-[#EDEDE9] bg-[#FAFAF8] px-2.5 py-2 text-[12px] text-[#4A4A56]">
                  {loading && !link ? "…" : link || "—"}
                </div>
                <button
                  onClick={copy}
                  disabled={!link}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0A0A0A] py-2 text-[13px] font-semibold text-white transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                >
                  {copied ? <><Check className="h-3.5 w-3.5" /> {t("Copié", "Copied")}</> : <><Copy className="h-3.5 w-3.5" /> {t("Copier le lien", "Copy link")}</>}
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
                href={link ? `mailto:?subject=${encodeURIComponent(t("Teste Biltia (200 crédits offerts)", "Try Biltia (200 free credits)"))}&body=${encodeURIComponent(msg)}` : undefined}
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
            {t("Les crédits bonus sont réservés aux nouveaux utilisateurs. Les gros bonus sont versés lorsqu'un invité passe sur un plan payant, après 14 jours sans remboursement. Crédits non convertibles en argent ; annulables en cas de fraude ou d'abus.", "Bonus credits are for new users only. The larger bonuses are paid when an invitee moves to a paid plan, after 14 days with no refund. Credits aren't convertible to cash; revocable in case of fraud or abuse.")}
          </p>
        </div>
      </div>
    </div>
  );
}
