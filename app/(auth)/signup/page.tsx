"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { SECTORS } from "@/lib/sectors";
import { Eye, EyeOff, ArrowRight, CheckCircle } from "lucide-react";

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
    if (!fullName.trim()) {
      setError("Indiquez votre nom.");
      return;
    }
    if (!sector) {
      setError("Sélectionnez votre secteur d'activité.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          company_name: companyName.trim(),
          sector,
        },
      },
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

    // Email auto-confirmé côté DB → on ouvre la session immédiatement.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      // Session non établie (rare) : on bascule vers la connexion.
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
      <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-depth-2">
        <div className="w-12 h-12 rounded-full bg-[#f4f9ec] border border-border flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-6 h-6 text-success" />
        </div>
        <h2 className="text-lg font-display font-bold text-foreground mb-2">Compte créé !</h2>
        <p className="text-sm text-muted-foreground">Vous obtenez 50 crédits gratuits. Redirection...</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-8 shadow-depth-2">
      <h1 className="text-xl font-display font-bold text-foreground mb-1">Créer un compte</h1>
      <p className="text-sm text-muted-foreground mb-6">
        50 crédits offerts · Pas de carte bancaire
      </p>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Votre nom</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Prénom Nom"
            required
            className="w-full px-4 py-3 bg-muted/60 border border-border rounded-xl text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Nom de l'entreprise <span className="text-muted-foreground/60">(optionnel)</span>
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Ex : SARL Dupont Bâtiment"
            className="w-full px-4 py-3 bg-muted/60 border border-border rounded-xl text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Secteur d'activité</label>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            required
            className={`w-full px-4 py-3 bg-muted/60 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all ${
              sector ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <option value="" disabled>
              Sélectionnez votre métier
            </option>
            {SECTORS.map((s) => (
              <option key={s.id} value={s.id} className="text-foreground">
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Adresse email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@entreprise.fr"
            required
            className="w-full px-4 py-3 bg-muted/60 border border-border rounded-xl text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Mot de passe</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              required
              className="w-full px-4 py-3 bg-muted/60 border border-border rounded-xl text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Confirmer le mot de passe</label>
          <input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Retapez le mot de passe"
            required
            className="w-full px-4 py-3 bg-muted/60 border border-border rounded-xl text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all"
          />
        </div>

        {error && (
          <p className="text-sm text-danger bg-[#fdf2f0] border border-border rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white font-semibold rounded-xl shadow-depth-1 hover:shadow-depth-2 transition-all disabled:opacity-60 disabled:cursor-wait"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              Créer mon compte <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground mt-4">
        En créant un compte, vous acceptez nos{" "}
        <a href="#" className="underline hover:text-foreground">CGU</a>.
      </p>

      <p className="text-center text-sm text-muted-foreground mt-4">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-accent-deep hover:text-foreground font-medium">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
