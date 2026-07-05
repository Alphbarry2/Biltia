"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { OAuthButtons, OrDivider, AUTH_INPUT, AUTH_LABEL } from "@/components/auth";
import { Turnstile, turnstileEnabled, type TurnstileHandle } from "@/components/turnstile";
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
      setError("La connexion a échoué. Réessayez, ou utilisez votre email.");
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (turnstileEnabled && !captchaToken) { setError("Confirmez que vous n'êtes pas un robot."); return; }
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });

    if (error) {
      setError("Email ou mot de passe incorrect.");
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
      setError("Code invalide. Réessayez.");
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const forgotPassword = async () => {
    setError("");
    if (!email.trim()) {
      setError("Entrez d'abord votre adresse email, puis recliquez sur « Mot de passe oublié ? ».");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(error.message);
    else setResetSent(true);
  };

  // Étape 2FA : le mot de passe est validé, on attend le code à 6 chiffres.
  if (mfaFactorId) {
    return (
      <div className="animate-fade-in-up">
        <h1 className="mb-1.5 text-[28px] font-black tracking-[-0.03em] text-[#0A0A0A]">Code de vérification.</h1>
        <p className="mb-7 text-sm text-[#6E6E6C]">Ouvrez votre application d&apos;authentification et saisissez le code à 6 chiffres.</p>
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
              <>Vérifier <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <h1 className="mb-1.5 text-[28px] font-black tracking-[-0.03em] text-[#0A0A0A]">Bon retour.</h1>
      <p className="mb-7 text-sm text-[#6E6E6C]">Accédez à votre workspace.</p>

      <OAuthButtons next="/dashboard" onError={setError} />
      <OrDivider />

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="login-email" className={AUTH_LABEL}>Adresse email</label>
          <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@entreprise.fr" required autoComplete="email" className={AUTH_INPUT} />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="login-password" className={AUTH_LABEL}>Mot de passe</label>
            <button type="button" onClick={forgotPassword}
              className="mb-1.5 text-[12px] font-medium text-[#9A9AA6] transition-colors hover:text-[#7C3AED]">
              Mot de passe oublié ?
            </button>
          </div>
          {resetSent && (
            <p className="mb-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700">
              Lien de réinitialisation envoyé à {email}. Vérifiez votre boîte mail.
            </p>
          )}
          <div className="relative">
            <input id="login-password" type={showPassword ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
              autoComplete="current-password" className={`${AUTH_INPUT} pr-12`} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
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
            <>Se connecter <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[#6E6E6C]">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="font-semibold text-[#7C3AED] transition-colors hover:text-[#0A0A0A]">Créer un compte</Link>
      </p>
    </div>
  );
}
