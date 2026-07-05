"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Réinitialisation du mot de passe — atterrissage du lien reçu par email
// (resetPasswordForEmail). Le lien ouvre une session de récupération ; on
// définit alors le nouveau mot de passe. Jamais de changement direct en session.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { AUTH_INPUT, AUTH_LABEL } from "@/components/auth";
import { Check, ArrowRight, Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    // Le client traite le lien de récupération (hash/code) puis ouvre la session.
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setReady(session ? "ok" : "invalid");
    }, 600);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady("ok");
    });
    return () => { clearTimeout(timer); sub.subscription.unsubscribe(); };
  }, []);

  const hasLength = password.length >= 8;
  const hasDigit = /\d/.test(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasLength || !hasDigit) { setError("8 caractères minimum, dont un chiffre."); return; }
    if (password !== confirm) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: e2 } = await supabase.auth.updateUser({ password });
    if (e2) {
      setError(e2.message);
      setSaving(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  if (ready === "checking") {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#7C3AED]" />
      </div>
    );
  }

  if (ready === "invalid") {
    return (
      <div className="text-center">
        <h1 className="mb-2 text-[24px] font-black tracking-[-0.02em] text-[#0A0A0A]">Lien expiré.</h1>
        <p className="mb-6 text-sm leading-relaxed text-[#6E6E6C]">
          Ce lien de réinitialisation n&apos;est plus valide. Demandez-en un nouveau depuis la page de connexion.
        </p>
        <Link href="/login" className="font-semibold text-[#7C3AED] transition-colors hover:text-[#0A0A0A]">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <h1 className="mb-1.5 text-[28px] font-black tracking-[-0.03em] text-[#0A0A0A]">Nouveau mot de passe.</h1>
      <p className="mb-7 text-sm text-[#6E6E6C]">Choisissez-le solide, vous êtes le seul à le connaître.</p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="rp-password" className={AUTH_LABEL}>Nouveau mot de passe</label>
          <input id="rp-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="8 caractères min., un chiffre" required autoComplete="new-password" className={AUTH_INPUT} />
          {password.length > 0 && (!hasLength || !hasDigit) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {[{ ok: hasLength, t: "Au moins 8 caractères" }, { ok: hasDigit, t: "Un chiffre (0-9)" }].map((c) => (
                <span key={c.t} className={`flex items-center gap-1.5 text-[12px] ${c.ok ? "font-semibold text-emerald-600" : "text-[#9A9AA6]"}`}>
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
          <label htmlFor="rp-confirm" className={AUTH_LABEL}>Confirmer</label>
          <input id="rp-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="Retapez le mot de passe" required autoComplete="new-password" className={AUTH_INPUT} />
        </div>

        {error && (
          <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
        )}

        <button type="submit" disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 py-3 font-semibold text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60">
          {saving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>Enregistrer et continuer <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </form>
    </div>
  );
}
