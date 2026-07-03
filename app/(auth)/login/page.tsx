"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

const INPUT =
  "w-full px-4 py-3 bg-white/70 border border-[#E7E7E4] rounded-xl text-[#0A0A0A] placeholder-[#9A9AA6] text-sm focus:outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-500/15 transition-all";
const LABEL = "block text-xs font-semibold text-[#6E6E6C] mb-1.5";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Email ou mot de passe incorrect.");
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="glass rounded-[26px] p-8">
      <h1 className="text-2xl font-black text-[#0A0A0A] mb-1 tracking-[-0.02em]">Bon retour.</h1>
      <p className="text-sm text-[#6E6E6C] mb-6">Accédez à votre workspace.</p>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className={LABEL}>Adresse email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@entreprise.fr" required className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>Mot de passe</label>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className={`${INPUT} pr-12`} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A9AA6] hover:text-[#0A0A0A]">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <button type="submit" disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] transition-shadow disabled:opacity-60 disabled:cursor-wait">
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>Se connecter <ArrowRight className="w-4 h-4" /></>
          )}
        </button>
      </form>

      <p className="text-center text-sm text-[#6E6E6C] mt-6">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="text-[#7C3AED] hover:text-[#0A0A0A] font-semibold">Créer un compte</Link>
      </p>
    </div>
  );
}
