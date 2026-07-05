"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { OAuthButtons, OrDivider, AUTH_INPUT, AUTH_LABEL } from "@/components/auth";
import { Turnstile, turnstileEnabled, type TurnstileHandle } from "@/components/turnstile";
import { Eye, EyeOff, ArrowRight, Check, MailCheck } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const hasLength = password.length >= 8;
  const hasDigit = /\d/.test(password);
  const passwordOk = hasLength && hasDigit;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { setError("Indiquez votre nom pour personnaliser votre espace."); return; }
    if (!passwordOk) { setError("Le mot de passe ne respecte pas encore les deux critères."); return; }
    if (!passwordsMatch) { setError("Les deux mots de passe ne correspondent pas."); return; }
    if (turnstileEnabled && !captchaToken) { setError("Confirmez que vous n'êtes pas un robot."); return; }
    setLoading(true);
    setError("");

    const supabase = createClient();
    // full_name : lu par le greeting (« Quel problème réglons-nous, Alpha ? ») et
    // les paramètres. emailRedirectTo : le lien de confirmation revient sur notre
    // callback, qui aiguille vers l'onboarding.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        ...(captchaToken ? { captchaToken } : {}),
      },
    });

    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? "Cet email a déjà un compte. Connectez-vous."
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
        <h1 className="mb-2 text-[24px] font-black tracking-[-0.02em] text-[#0A0A0A]">Vérifiez vos emails.</h1>
        <p className="text-sm leading-relaxed text-[#6E6E6C]">
          Un lien de confirmation vient de partir vers <span className="font-semibold text-[#0A0A0A]">{email}</span>.
          Cliquez dessus pour activer vos 300 crédits offerts.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <h1 className="mb-1.5 text-[28px] font-black tracking-[-0.03em] text-[#0A0A0A]">Créez votre compte.</h1>
      <p className="mb-7 text-sm text-[#6E6E6C]">300 crédits offerts. Sans carte bancaire.</p>

      <OAuthButtons next="/onboarding" onError={setError} />
      <OrDivider />

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label htmlFor="signup-name" className={AUTH_LABEL}>Votre nom</label>
          <input id="signup-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
            placeholder="Alpha Barry" required autoComplete="name" className={AUTH_INPUT} />
        </div>

        <div>
          <label htmlFor="signup-email" className={AUTH_LABEL}>Adresse email</label>
          <input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@entreprise.fr" required autoComplete="email" className={AUTH_INPUT} />
        </div>

        <div>
          <label htmlFor="signup-password" className={AUTH_LABEL}>Mot de passe</label>
          <div className="relative">
            <input id="signup-password" type={showPassword ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="Votre mot de passe" required
              autoComplete="new-password" className={`${AUTH_INPUT} pr-12`} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password.length > 0 && !passwordOk && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {[{ ok: hasLength, t: "Au moins 8 caractères" }, { ok: hasDigit, t: "Un chiffre (0-9)" }].map((c) => (
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
          <label htmlFor="signup-confirm" className={AUTH_LABEL}>Confirmez le mot de passe</label>
          <input id="signup-confirm" type={showPassword ? "text" : "password"} value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Ressaisissez le mot de passe" required
            autoComplete="new-password" className={AUTH_INPUT} />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="mt-2 text-[12px] font-medium text-rose-500">Les deux mots de passe ne correspondent pas.</p>
          )}
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
            <>Créer mon compte <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-[#9A9AA6]">
        En créant un compte, vous acceptez nos <a href="#" className="underline transition-colors hover:text-[#0A0A0A]">CGU</a> et notre <a href="#" className="underline transition-colors hover:text-[#0A0A0A]">politique de confidentialité</a>.
      </p>
      <p className="mt-5 text-center text-sm text-[#6E6E6C]">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-semibold text-[#7C3AED] transition-colors hover:text-[#0A0A0A]">Se connecter</Link>
      </p>
    </div>
  );
}
