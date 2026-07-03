"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { SECTORS } from "@/lib/sectors";
import { Eye, EyeOff, ArrowRight, CheckCircle } from "lucide-react";

const INPUT =
  "w-full px-4 py-3 bg-white/70 border border-[#E7E7E4] rounded-xl text-[#0A0A0A] placeholder-[#9A9AA6] text-sm focus:outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-500/15 transition-all";
const LABEL = "block text-xs font-semibold text-[#6E6E6C] mb-1.5";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { setError("Indiquez votre nom."); return; }
    if (!sector) { setError("Sélectionnez votre secteur d'activité."); return; }
    if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères."); return; }
    if (password !== confirmPassword) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim(), company_name: companyName.trim(), sector } },
    });

    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? "Cet email a déjà un compte. Connectez-vous."
          : signUpError.message
      );
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Compte créé. Veuillez vous connecter.");
      setLoading(false);
      setTimeout(() => router.push("/login"), 1200);
      return;
    }

    setSuccess(true);
    const savedPrompt = sessionStorage.getItem("batify_prompt");
    router.refresh();
    setTimeout(() => router.push(savedPrompt ? "/generate" : "/dashboard"), 1200);
  };

  if (success) {
    return (
      <div className="glass rounded-[26px] p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-lg font-black text-[#0A0A0A] mb-2 tracking-[-0.01em]">Compte créé.</h2>
        <p className="text-sm text-[#6E6E6C]">Vous obtenez 10 crédits gratuits. Redirection…</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-[26px] p-8">
      <h1 className="text-2xl font-black text-[#0A0A0A] mb-1 tracking-[-0.02em]">Créer un compte.</h1>
      <p className="text-sm text-[#6E6E6C] mb-6">10 crédits offerts. Pas de carte bancaire.</p>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className={LABEL}>Votre nom</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Prénom Nom" required className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>Nom de l&apos;entreprise <span className="text-[#B0B0B8]">(optionnel)</span></label>
          <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ex : SARL Dupont Bâtiment" className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>Secteur d&apos;activité</label>
          <select value={sector} onChange={(e) => setSector(e.target.value)} required className={`${INPUT} ${sector ? "text-[#0A0A0A]" : "text-[#9A9AA6]"}`}>
            <option value="" disabled>Sélectionnez votre métier</option>
            {SECTORS.map((s) => (<option key={s.id} value={s.id} className="text-[#0A0A0A]">{s.label}</option>))}
          </select>
        </div>

        <div>
          <label className={LABEL}>Adresse email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@entreprise.fr" required className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>Mot de passe</label>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" required className={`${INPUT} pr-12`} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A9AA6] hover:text-[#0A0A0A]">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className={LABEL}>Confirmer le mot de passe</label>
          <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Retapez le mot de passe" required className={INPUT} />
        </div>

        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <button type="submit" disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] transition-shadow disabled:opacity-60 disabled:cursor-wait">
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>Créer mon compte <ArrowRight className="w-4 h-4" /></>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-[#9A9AA6] mt-4">
        En créant un compte, vous acceptez nos <a href="#" className="underline hover:text-[#0A0A0A]">CGU</a>.
      </p>
      <p className="text-center text-sm text-[#6E6E6C] mt-4">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-[#7C3AED] hover:text-[#0A0A0A] font-semibold">Se connecter</Link>
      </p>
    </div>
  );
}
