"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Eye, EyeOff, ArrowRight, ShieldCheck, LogOut } from "lucide-react";

const INPUT =
  "w-full rounded-xl border border-[#ECECF2] bg-white px-4 py-3 text-sm text-[#0A0A0A] outline-none transition-all placeholder:text-[#B4B4BE] focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10";
const LABEL = "mb-1.5 block text-[13px] font-medium text-[#6E6E6C]";

// Login dédié à la console. Séparé du login applicatif : même auth Supabase,
// mais l'accès reste refusé tant que l'email n'est pas sur la liste blanche
// (lib/admin.ts). Aucun OAuth, aucun lien d'inscription : porte de service.
export default function AdminLogin({
  authedButDenied,
  deniedEmail,
}: {
  authedButDenied: boolean;
  deniedEmail: string | null;
}) {
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
      setError("Identifiants incorrects.");
      setLoading(false);
    } else {
      // Le serveur revérifie la liste blanche : accès si autorisé, refus sinon.
      router.refresh();
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6">
      {/* Mesh multicolore (même signature visuelle que la landing / l'app). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-400/30 blur-[100px]" />
        <div className="absolute right-[-6rem] top-24 h-96 w-96 rounded-full bg-pink-400/25 blur-[100px]" />
        <div className="absolute bottom-[-8rem] left-1/3 h-96 w-96 rounded-full bg-violet-400/25 blur-[110px]" />
      </div>

      <div className="w-full max-w-[400px] rounded-3xl border border-white/60 bg-white/70 p-8 shadow-[0_20px_60px_rgba(60,40,120,0.15)] backdrop-blur-xl">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 shadow-[0_8px_20px_rgba(139,92,246,0.4)]">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight tracking-[-0.02em] text-[#0A0A0A]">
              Console Biltia
            </p>
            <p className="text-[12px] text-[#9A9AA6]">Accès restreint</p>
          </div>
        </div>

        {authedButDenied ? (
          <div className="animate-fade-in-up">
            <h1 className="mb-1.5 text-[22px] font-black tracking-[-0.03em] text-[#0A0A0A]">
              Accès refusé.
            </h1>
            <p className="mb-5 text-sm text-[#6E6E6C]">
              Le compte <span className="font-semibold text-[#0A0A0A]">{deniedEmail}</span> n&apos;est
              pas autorisé sur cette console.
            </p>
            <button
              onClick={signOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#ECECF2] bg-white py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F6F6F9]"
            >
              <LogOut className="h-4 w-4" /> Changer de compte
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="animate-fade-in-up space-y-4">
            <div>
              <label htmlFor="admin-email" className={LABEL}>
                Adresse email
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@entreprise.fr"
                required
                autoComplete="email"
                className={INPUT}
              />
            </div>

            <div>
              <label htmlFor="admin-password" className={LABEL}>
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className={`${INPUT} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 py-3 font-semibold text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  Accéder <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
