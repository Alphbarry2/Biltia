"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { OAuthButtons, OrDivider, AUTH_INPUT, AUTH_LABEL } from "@/components/auth";
import { Turnstile, turnstileEnabled, type TurnstileHandle } from "@/components/turnstile";
import { useT } from "@/lib/i18n/context";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

// useSearchParams impose une frontière Suspense au prérendu (Next 15).
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  // 2FA : facteur TOTP à vérifier après le mot de passe.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);

  useEffect(() => {
    if (searchParams.get("error") === "oauth") {
      setError(t("La connexion a échoué. Réessayez, ou utilisez votre email.", "Sign-in failed. Try again, or use your email."));
    }
  }, [searchParams, t]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (turnstileEnabled && !captchaToken) { setError(t("Confirmez que vous n'êtes pas un robot.", "Please confirm you're not a robot.")); return; }
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });

    if (error) {
      setError(t("Email ou mot de passe incorrect.", "Incorrect email or password."));
      turnstileRef.current?.reset();
      setLoading(false);
    } else {
      // Double authentification activée ? On demande le code TOTP avant d'entrer.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.find((f) => f.status === "verified");
        if (totp) {
          setMfaFactorId(totp.id);
          setLoading(false);
          return;
        }
      }
      router.push("/dashboard");
      router.refresh();
    }
  };

  const verifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId || mfaCode.length < 6) return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaFactorId,
      code: mfaCode,
    });
    if (error) {
      setError(t("Code invalide. Réessayez.", "Invalid code. Try again."));
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const forgotPassword = async () => {
    setError("");
    if (!email.trim()) {
      setError(t("Entrez d'abord votre adresse email, puis recliquez sur « Mot de passe oublié ? ».", "Enter your email first, then click “Forgot password?” again."));
      return;
    }
    // Turnstile : la demande de reset est aussi protégée côté Supabase quand le
    // CAPTCHA est activé — sans token, elle serait rejetée en silence.
    if (turnstileEnabled && !captchaToken) {
      setError(t("Confirmez que vous n'êtes pas un robot, puis recliquez sur « Mot de passe oublié ? ».", "Confirm you're not a robot, then click “Forgot password?” again."));
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken: captchaToken ?? undefined,
    });
    // Le token est à usage unique : consommé ici, on réarme le widget.
    turnstileRef.current?.reset();
    setCaptchaToken(null);
    if (error) setError(error.message);
    else setResetSent(true);
  };

  // Étape 2FA : le mot de passe est validé, on attend le code à 6 chiffres.
  if (mfaFactorId) {
    return (
      <div className="animate-fade-in-up">
        <h1 className="mb-1.5 text-[28px] font-black tracking-[-0.03em] text-[#0A0A0A]">{t("Code de vérification.", "Verification code.")}</h1>
        <p className="mb-7 text-sm text-[#6E6E6C]">{t("Ouvrez votre application d'authentification et saisissez le code à 6 chiffres.", "Open your authenticator app and enter the 6-digit code.")}</p>
        <form onSubmit={verifyMfa} className="space-y-4">
          <input
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            autoFocus
            className={`${AUTH_INPUT} text-center text-xl font-bold tracking-[0.4em]`}
          />
          {error && (
            <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
          )}
          <button type="submit" disabled={loading || mfaCode.length < 6}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 py-3 font-semibold text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] active:scale-[0.99] disabled:opacity-60">
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>{t("Vérifier", "Verify")} <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <h1 className="mb-1.5 text-[28px] font-black tracking-[-0.03em] text-[#0A0A0A]">{t("Bon retour.", "Welcome back.")}</h1>
      <p className="mb-7 text-sm text-[#6E6E6C]">{t("Accédez à votre workspace.", "Access your workspace.")}</p>

      <OAuthButtons next="/dashboard" onError={setError} />
      <OrDivider />

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="login-email" className={AUTH_LABEL}>{t("Adresse email", "Email address")}</label>
          <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={t("vous@entreprise.fr", "you@company.com")} required autoComplete="email" className={AUTH_INPUT} />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="login-password" className={AUTH_LABEL}>{t("Mot de passe", "Password")}</label>
            <button type="button" onClick={forgotPassword}
              className="mb-1.5 text-[12px] font-medium text-[#9A9AA6] transition-colors hover:text-[#7C3AED]">
              {t("Mot de passe oublié ?", "Forgot password?")}
            </button>
          </div>
          {resetSent && (
            <p className="mb-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700">
              {t(`Lien de réinitialisation envoyé à ${email}. Vérifiez votre boîte mail.`, `Reset link sent to ${email}. Check your inbox.`)}
            </p>
          )}
          <div className="relative">
            <input id="login-password" type={showPassword ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
              autoComplete="current-password" className={`${AUTH_INPUT} pr-12`} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? t("Masquer le mot de passe", "Hide password") : t("Afficher le mot de passe", "Show password")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-lg text-[#9A9AA6] transition-colors hover:bg-black/[0.05] hover:text-[#0A0A0A]">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Turnstile ref={turnstileRef} onToken={setCaptchaToken} />

        {error && (
          <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
        )}

        <button type="submit" disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 py-3 font-semibold text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60">
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>{t("Se connecter", "Sign in")} <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[#6E6E6C]">
        {t("Pas encore de compte ?", "No account yet?")}{" "}
        <Link href="/signup" className="font-semibold text-[#7C3AED] transition-colors hover:text-[#0A0A0A]">{t("Créer un compte", "Create an account")}</Link>
      </p>
    </div>
  );
}
