"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Invitation d'équipe — atterrissage du lien reçu par email.
// Le lien pointe vers /invitation?t=<jeton signé 24h> (JAMAIS directement vers
// Supabase, cf. lib/invite-link.ts) : on échange ce jeton contre un lien de
// récupération Supabase FRAIS à chaque tentative via /api/invitation/start, ce
// qui rend le lien envoyé par email réutilisable pendant 24h (autre clic, autre
// appareil) même si chaque lien Supabase sous-jacent est à usage unique.
// Supabase nous redirige ensuite ici avec la session dans le hash (#access_token=...).
// L'invité a déjà : un profil rattaché à l'équipe (onboarding sauté) + sa
// membership avec son rôle, et PAS de crédits d'inscription (voir handle_new_user,
// migr. 053). Il ne reste qu'à choisir son NOM et son MOT DE PASSE, puis il entre dans
// l'app — SANS l'onboarding entreprise (il rejoint, il ne crée pas d'entreprise).
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { AUTH_INPUT, AUTH_LABEL } from "@/components/auth";
import { useT } from "@/lib/i18n/context";
import { Check, ArrowRight, Loader2 } from "lucide-react";

type ReadyState = "checking" | "ok" | "invalid" | "expired" | "already_joined";

// useSearchParams impose une frontière Suspense au prérendu (Next 15).
export default function InvitationPage() {
  return (
    <Suspense fallback={null}>
      <InvitationForm />
    </Suspense>
  );
}

function InvitationForm() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState<ReadyState>("checking");
  const [teamName, setTeamName] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const settled = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const loadTeamName = async (userId: string) => {
      try {
        const { data } = await supabase
          .from("tenant_members")
          .select("tenants(name)")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();
        const tn = (data as { tenants?: { name?: string } | { name?: string }[] } | null)?.tenants;
        const name = Array.isArray(tn) ? tn[0]?.name : tn?.name;
        if (name) setTeamName(name);
      } catch {
        /* accueil générique si indisponible */
      }
    };

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;
      settled.current = true;
      setReady("ok");
      void loadTeamName(session.user.id);
      return true;
    };

    const exchangeToken = async (token: string) => {
      try {
        const res = await fetch("/api/invitation/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: token }),
        });
        const data = await res.json().catch(() => ({}));
        if (settled.current) return;
        if (res.status === 410) { setReady("expired"); return; }
        if (data?.error === "already_joined") { setReady("already_joined"); return; }
        if (!res.ok || !data?.actionUrl) { setReady("invalid"); return; }
        window.location.href = data.actionUrl;
      } catch {
        if (!settled.current) setReady("invalid");
      }
    };

    const run = async () => {
      const hasHash =
        typeof window !== "undefined" &&
        (window.location.hash.includes("access_token") || window.location.hash.includes("type=recovery"));

      if (hasHash) {
        // Le client Supabase traite le hash de façon asynchrone : on lui laisse le
        // temps, l'écouteur PASSWORD_RECOVERY/SIGNED_IN ci-dessous peut trancher en premier.
        await new Promise((r) => setTimeout(r, 700));
        if (await checkSession()) return;
        await new Promise((r) => setTimeout(r, 2000));
        if (!settled.current) setReady("invalid");
        return;
      }

      const token = searchParams.get("t");
      if (!token) {
        setReady("invalid");
        return;
      }
      await exchangeToken(token);
    };
    void run();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") void checkSession();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasLength = password.length >= 8;
  const hasDigit = /\d/.test(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { setError(t("Indiquez votre nom.", "Enter your name.")); return; }
    if (!hasLength || !hasDigit) { setError(t("8 caractères minimum, dont un chiffre.", "At least 8 characters, including one digit.")); return; }
    if (password !== confirm) { setError(t("Les deux mots de passe ne correspondent pas.", "The two passwords don't match.")); return; }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: updRes, error: e1 } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName.trim() },
    });
    if (e1) {
      setError(e1.message);
      setSaving(false);
      return;
    }
    // Le profil (créé par le trigger) porte un nom vide pour un invité : on le
    // met à jour avec le nom saisi (RLS : chacun met à jour son propre profil).
    try {
      const uid = updRes.user?.id;
      if (uid) await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("user_id", uid);
    } catch {
      /* best-effort */
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

  if (ready === "already_joined") {
    return (
      <div className="text-center">
        <h1 className="mb-2 text-[24px] font-black tracking-[-0.02em] text-[#0A0A0A]">{t("Déjà rejoint.", "Already joined.")}</h1>
        <p className="mb-6 text-sm leading-relaxed text-[#6E6E6C]">
          {t("Vous avez déjà défini votre mot de passe. Connectez-vous avec vos identifiants habituels.", "You've already set your password. Sign in with your usual credentials.")}
        </p>
        <Link href="/login" className="font-semibold text-[#7C3AED] transition-colors hover:text-[#0A0A0A]">
          {t("Aller à la connexion", "Go to sign-in")}
        </Link>
      </div>
    );
  }

  if (ready === "expired" || ready === "invalid") {
    return (
      <div className="text-center">
        <h1 className="mb-2 text-[24px] font-black tracking-[-0.02em] text-[#0A0A0A]">
          {ready === "expired" ? t("Invitation expirée.", "Invitation expired.") : t("Lien invalide.", "Invalid link.")}
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-[#6E6E6C]">
          {ready === "expired"
            ? t("Cette invitation date de plus de 24 heures. Demandez à la personne qui vous a invité de vous en renvoyer une.", "This invitation is more than 24 hours old. Ask the person who invited you to send a new one.")
            : t("Ce lien d'invitation n'est plus valide. Demandez à la personne qui vous a invité de vous renvoyer une invitation.", "This invitation link is no longer valid. Ask the person who invited you to send a new invitation.")}
        </p>
        <Link href="/login" className="font-semibold text-[#7C3AED] transition-colors hover:text-[#0A0A0A]">
          {t("Aller à la connexion", "Go to sign-in")}
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <h1 className="mb-1.5 text-[28px] font-black tracking-[-0.03em] text-[#0A0A0A]">{t("Vous avez été invité.", "You've been invited.")}</h1>
      <p className="mb-7 text-sm text-[#6E6E6C]">
        {teamName ? <>{t("Rejoignez l'équipe", "Join the team")} <span className="font-semibold text-[#0A0A0A]">{teamName}</span> {t("sur Biltia.", "on Biltia.")}</> : t("Rejoignez votre équipe sur Biltia.", "Join your team on Biltia.")}{" "}
        {t("Choisissez votre nom et un mot de passe, c'est tout.", "Choose your name and a password, that's all.")}
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="inv-name" className={AUTH_LABEL}>{t("Votre nom", "Your name")}</label>
          <input id="inv-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
            placeholder={t("Prénom Nom", "First Last")} required autoComplete="name" className={AUTH_INPUT} />
        </div>
        <div>
          <label htmlFor="inv-password" className={AUTH_LABEL}>{t("Mot de passe", "Password")}</label>
          <input id="inv-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={t("8 caractères min., un chiffre", "8 characters min., one digit")} required autoComplete="new-password" className={AUTH_INPUT} />
          {password.length > 0 && (!hasLength || !hasDigit) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {[{ ok: hasLength, t: t("Au moins 8 caractères", "At least 8 characters") }, { ok: hasDigit, t: t("Un chiffre (0-9)", "A digit (0-9)") }].map((c) => (
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
          <label htmlFor="inv-confirm" className={AUTH_LABEL}>{t("Confirmer", "Confirm")}</label>
          <input id="inv-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("Retapez le mot de passe", "Re-type the password")} required autoComplete="new-password" className={AUTH_INPUT} />
        </div>

        {error && (
          <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
        )}

        <button type="submit" disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 py-3 font-semibold text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60">
          {saving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>{t("Rejoindre l'équipe", "Join the team")} <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </form>
    </div>
  );
}
