"use client";

import { useEffect, useRef, useState } from "react";
import { SIGNUP_FREE_CREDITS, REFERRAL_SIGNUP_BONUS } from "@/lib/plans";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { OAuthButtons, OrDivider, AUTH_INPUT, AUTH_LABEL } from "@/components/auth";
import { Turnstile, turnstileEnabled, type TurnstileHandle } from "@/components/turnstile";
import { useT } from "@/lib/i18n/context";
import { Eye, EyeOff, ArrowRight, Check, MailCheck, Gift } from "lucide-react";

export default function SignupPage() {
  const t = useT();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [invited, setInvited] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);

  // « Choisir Pro » depuis la page tarifs arrive avec ?plan=pro&credits=…&cycle=…
  // On mémorise le palier choisi pour lancer le paiement APRÈS l'onboarding
  // (localStorage survit à la confirmation email, sur le même navigateur).
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const plan = p.get("plan");
      if (plan === "pro" || plan === "equipe") {
        const credits = Number(p.get("credits"));
        const cycle = p.get("cycle") === "annual" ? "annual" : "monthly";
        if (Number.isFinite(credits) && credits > 0) {
          localStorage.setItem("biltia_pending_plan", JSON.stringify({ plan, credits, cycle }));
        }
      }
      // Parrainage : un lien /signup?ref=CODE mémorise le code (survit à la
      // confirmation email sur le même navigateur). Réclamé une fois connecté
      // par <ReferralClaim /> (idempotent). REFERRAL_SIGNUP_BONUS (400) crédits au filleul.
      const ref = p.get("ref");
      if (ref) {
        localStorage.setItem("biltia_ref", ref.trim().toUpperCase().slice(0, 16));
        setInvited(true);
      }
    } catch {
      /* localStorage indisponible : on dégrade sans bloquer l'inscription. */
    }
  }, []);

  const hasLength = password.length >= 8;
  const hasDigit = /\d/.test(password);
  const passwordOk = hasLength && hasDigit;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { setError(t("Indiquez votre nom pour personnaliser votre espace.", "Enter your name to personalize your workspace.")); return; }
    if (!passwordOk) { setError(t("Le mot de passe ne respecte pas encore les deux critères.", "The password doesn't meet both requirements yet.")); return; }
    if (!passwordsMatch) { setError(t("Les deux mots de passe ne correspondent pas.", "The two passwords don't match.")); return; }
    if (!acceptedTerms) { setError(t("Vous devez accepter les conditions pour créer un compte.", "You must accept the terms to create an account.")); return; }
    if (turnstileEnabled && !captchaToken) { setError(t("Confirmez que vous n'êtes pas un robot.", "Please confirm you're not a robot.")); return; }
    setLoading(true);
    setError("");

    const supabase = createClient();
    // Plan payant choisi (« Choisir Pro ») → on le fait voyager dans le lien de
    // confirmation (next), pour qu'il survive même si l'email est confirmé sur un
    // AUTRE appareil (là où localStorage seul ne suffit pas).
    let nextPath = "/onboarding";
    try {
      const sp = new URLSearchParams(window.location.search);
      const pl = sp.get("plan");
      if (pl === "pro" || pl === "equipe") {
        const c = Number(sp.get("credits"));
        const cyc = sp.get("cycle") === "annual" ? "annual" : "monthly";
        if (Number.isFinite(c) && c > 0) nextPath = `/onboarding?plan=${pl}&credits=${c}&cycle=${cyc}`;
      }
    } catch {
      /* pas de plan : onboarding standard */
    }
    // full_name : lu par le greeting (« Quel problème réglons-nous, Alpha ? ») et
    // les paramètres. emailRedirectTo : le lien de confirmation revient sur notre
    // callback, qui aiguille vers l'onboarding (en préservant le plan).
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        ...(captchaToken ? { captchaToken } : {}),
      },
    });

    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? t("Cet email a déjà un compte. Connectez-vous.", "This email already has an account. Please sign in.")
          : signUpError.message
      );
      turnstileRef.current?.reset();
      setLoading(false);
      return;
    }

    if (!data.session) {
      // Confirmation d'email activée côté Supabase : pas de session immédiate.
      setAwaitingEmail(true);
      setLoading(false);
      return;
    }

    router.refresh();
    router.push("/onboarding");
  };

  if (awaitingEmail) {
    return (
      <div className="animate-scale-in text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-pink-500">
          <MailCheck className="h-6 w-6 text-white" />
        </div>
        <h1 className="mb-2 text-[24px] font-black tracking-[-0.02em] text-[#0A0A0A]">{t("Vérifiez vos emails.", "Check your email.")}</h1>
        <p className="text-sm leading-relaxed text-[#6E6E6C]">
          {t("Un lien de confirmation vient de partir vers ", "A confirmation link was just sent to ")}<span className="font-semibold text-[#0A0A0A]">{email}</span>.
          {t(` Cliquez dessus pour activer vos ${SIGNUP_FREE_CREDITS} crédits offerts`, ` Click it to activate your ${SIGNUP_FREE_CREDITS} free credits`)}{invited ? t(` et vos ${REFERRAL_SIGNUP_BONUS} crédits bonus d'invitation`, ` and your ${REFERRAL_SIGNUP_BONUS} bonus invite credits`) : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      {invited && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-violet-200/70 bg-gradient-to-r from-indigo-50 via-violet-50 to-pink-50 px-4 py-3">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 text-white">
            <Gift className="h-4 w-4" />
          </span>
          <p className="text-[13px] leading-snug text-[#4A4A56]">
            <b className="font-semibold text-[#0A0A0A]">{t("Vous avez été invité sur Biltia.", "You've been invited to Biltia.")}</b> {t("Créez votre compte et recevez", "Create your account and get")}{" "}
            <b className="font-semibold text-[#7C3AED]">{t(`${REFERRAL_SIGNUP_BONUS} crédits bonus`, `${REFERRAL_SIGNUP_BONUS} bonus credits`)}</b>{t(`, en plus de vos ${SIGNUP_FREE_CREDITS} crédits offerts.`, `, on top of your ${SIGNUP_FREE_CREDITS} free credits.`)}
          </p>
        </div>
      )}
      <h1 className="mb-1.5 text-[28px] font-black tracking-[-0.03em] text-[#0A0A0A]">{t("Créez votre compte.", "Create your account.")}</h1>
      <p className="mb-7 text-sm text-[#6E6E6C]">{t(`${SIGNUP_FREE_CREDITS} crédits offerts. Sans carte bancaire.`, `${SIGNUP_FREE_CREDITS} free credits. No credit card.`)}</p>

      <OAuthButtons next="/onboarding" onError={setError} disabled={!acceptedTerms} />
      <OrDivider />

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label htmlFor="signup-name" className={AUTH_LABEL}>{t("Votre nom", "Your name")}</label>
          <input id="signup-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
            placeholder="Alpha Barry" required autoComplete="name" className={AUTH_INPUT} />
        </div>

        <div>
          <label htmlFor="signup-email" className={AUTH_LABEL}>{t("Adresse email", "Email address")}</label>
          <input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={t("vous@entreprise.fr", "you@company.com")} required autoComplete="email" className={AUTH_INPUT} />
        </div>

        <div>
          <label htmlFor="signup-password" className={AUTH_LABEL}>{t("Mot de passe", "Password")}</label>
          <div className="relative">
            <input id="signup-password" type={showPassword ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder={t("Votre mot de passe", "Your password")} required
              autoComplete="new-password" className={`${AUTH_INPUT} pr-12`} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? t("Masquer le mot de passe", "Hide password") : t("Afficher le mot de passe", "Show password")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-lg text-[#9A9AA6] transition-colors hover:bg-black/[0.05] hover:text-[#0A0A0A]">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password.length > 0 && !passwordOk && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {[{ ok: hasLength, t: t("Au moins 8 caractères", "At least 8 characters") }, { ok: hasDigit, t: t("Un chiffre (0-9)", "A digit (0-9)") }].map((c) => (
                <span key={c.t} className={`flex items-center gap-1.5 text-[12px] transition-colors ${c.ok ? "font-semibold text-emerald-600" : "text-[#9A9AA6]"}`}>
                  <span className={`grid h-3.5 w-3.5 place-items-center rounded-full ${c.ok ? "bg-emerald-500" : "bg-[#E7E7E4]"}`}>
                    <Check className="h-2 w-2 text-white" strokeWidth={4} />
                  </span>
                  {c.t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="signup-confirm" className={AUTH_LABEL}>{t("Confirmez le mot de passe", "Confirm password")}</label>
          <input id="signup-confirm" type={showPassword ? "text" : "password"} value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t("Ressaisissez le mot de passe", "Re-enter your password")} required
            autoComplete="new-password" className={AUTH_INPUT} />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="mt-2 text-[12px] font-medium text-rose-500">{t("Les deux mots de passe ne correspondent pas.", "The two passwords don't match.")}</p>
          )}
        </div>

        <Turnstile ref={turnstileRef} onToken={setCaptchaToken} />

        <label htmlFor="signup-terms" className="flex cursor-pointer select-none items-start gap-3">
          <span className="relative mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center">
            <input id="signup-terms" type="checkbox" checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)} className="peer sr-only" />
            <span className="h-5 w-5 rounded-md border border-[#D6D0E4] bg-white transition-all peer-checked:border-transparent peer-checked:bg-gradient-to-br peer-checked:from-indigo-500 peer-checked:via-violet-500 peer-checked:to-pink-500 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500/40" />
            <Check className="pointer-events-none absolute h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={4} />
          </span>
          <span className="text-xs leading-relaxed text-[#6E6E6C]">
            {t("J'ai lu et j'accepte les", "I have read and accept the")}{" "}
            <a href="/mentions-legales" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#7C3AED] underline-offset-2 hover:underline">{t("mentions légales", "legal notice")}</a>,{" "}
            {t("les", "the")} <a href="/cgu" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#7C3AED] underline-offset-2 hover:underline">{t("CGU", "Terms of Use")}</a>,{" "}
            {t("les", "the")} <a href="/cgv" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#7C3AED] underline-offset-2 hover:underline">{t("CGV", "Sales Terms")}</a> {t("et la", "and the")}{" "}
            <a href="/confidentialite" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#7C3AED] underline-offset-2 hover:underline">{t("politique de confidentialité", "privacy policy")}</a>.
          </span>
        </label>

        {error && (
          <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
        )}

        <button type="submit" disabled={loading || !acceptedTerms}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white transition-all ${
            acceptedTerms
              ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
              : "cursor-not-allowed bg-[#D6D3DE] shadow-none"
          }`}>
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>{t("Créer mon compte", "Create my account")} <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-[#6E6E6C]">
        {t("Déjà un compte ?", "Already have an account?")}{" "}
        <Link href="/login" className="font-semibold text-[#7C3AED] transition-colors hover:text-[#0A0A0A]">{t("Se connecter", "Sign in")}</Link>
      </p>
    </div>
  );
}
