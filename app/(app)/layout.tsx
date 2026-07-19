"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { can } from "@/lib/permissions";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { SessionProvider, useSession } from "@/components/session-provider";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { BiltiaLogo } from "@/components/brand";
import { CreditPacksDialog } from "@/components/credit-packs";
import { ReferralClaim } from "@/components/referral-claim";
import { ReferralDialog } from "@/components/referral-dialog";
import { useT, useLocale } from "@/lib/i18n/context";
import {
  Home,
  Boxes,
  Settings,
  Plug,
  Bot,
  Users,
  CreditCard,
  LogOut,
  Zap,
  Menu,
  X,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronsUpDown,
  Sparkles,
  Gift,
} from "lucide-react";

function Sidebar({
  onClose,
  collapsed = false,
  onToggle,
}: {
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [packsOpen, setPacksOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // TOUT vient de la session partagée (components/session-provider). La sidebar
  // faisait avant sa PROPRE chaîne : getUser() → user_credits → membership →
  // subscriptions, soit 4 allers-retours dupliqués avec ceux du bandeau et de la
  // page. Le getUser() est un appel réseau SÉRIALISÉ par un verrou global : chaque
  // composant qui le refaisait allongeait la file d'attente de tous les autres.
  const { user, membership, billing } = useSession();
  const email = user?.email ?? "";
  const userName = user?.name ?? "";
  const credits = billing ? billing.credits : null;
  // Seul le propriétaire gère la facturation → le CTA « Passer à Pro » ne
  // s'affiche que pour lui (un employé/lecteur ne peut pas souscrire).
  const canBill = membership ? can(membership.role, "billing.manage") : false;
  const isPaid =
    !!billing?.plan &&
    billing.plan !== "free" &&
    (billing.status === "active" || billing.status === "trialing");

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Navigation principale réduite à 3 destinations (Demander / Consulter / Déléguer).
  // Le reste (Bibliothèque, Connecteurs, Activité, Paramètres) reste joignable mais
  // n'occupe plus la nav : il vit dans le menu du compte, en contextuel, ou via
  // « Voir tout ». Aucune route n'est supprimée — juste retirée du menu de gauche.
  const nav = [
    { label: t("Accueil", "Home"), href: "/dashboard", icon: <Home className="w-4 h-4" /> },
    { label: t("Entreprise", "Workspace"), href: "/workspace", icon: <Boxes className="w-4 h-4" /> },
    { label: t("Agents", "Agents"), href: "/agents", icon: <Bot className="w-4 h-4" /> },
  ];

  const initial = (email || userName || "?")[0].toUpperCase();

  return (
    // Largeur au CONTENU (w-fit), pas un fixe arbitraire : elle se coupe juste après le
    // plus long libellé (« Bibliothèque »/« Connecteurs »). max-w en garde-fou (une
    // entreprise au nom démesuré ne doit pas l'élargir : email et nom tronquent au lieu
    // de pousser la largeur, cf. min-w-0 plus bas et sur WorkspaceSwitcher).
    <aside className={`flex flex-col h-full pt-safe pb-safe ${collapsed ? "w-[68px]" : "w-fit max-w-[224px] min-w-[188px]"} bg-[#FCFCFD] border-r border-[#EDEDE9] flex-shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}>
      {/* Header */}
      <div className={`flex items-center h-[64px] border-b border-[#EDEDE9] flex-shrink-0 ${collapsed ? "justify-center px-0" : "justify-between px-4"}`}>
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <BiltiaLogo className="h-[22px] w-auto text-[#0A0A0A]" />
          </Link>
        )}
        {onClose ? (
          <button onClick={onClose} className="text-[#9A9A97] hover:text-[#0A0A0A] transition-colors">
            <X className="w-4 h-4" />
          </button>
        ) : onToggle ? (
          <button
            onClick={onToggle}
            title={collapsed ? t("Déployer la barre", "Expand sidebar") : t("Réduire la barre", "Collapse sidebar")}
            className="w-8 h-8 rounded-lg hover:bg-black/[0.05] flex items-center justify-center text-[#6E6E6C] hover:text-[#0A0A0A] transition-colors"
          >
            {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
          </button>
        ) : null}
      </div>

      {/* Sélecteur d'espace (multi-entreprises : basculer, renommer, créer) */}
      <div className={`flex-shrink-0 border-b border-[#EDEDE9] ${collapsed ? "px-1.5 py-1.5" : "px-2.5 py-1.5"}`}>
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ label, href, icon }) => {
          const active =
            pathname === href ||
            pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-xl text-sm font-medium transition-colors ${
                collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
              } ${
                active
                  ? "bg-gradient-to-r from-violet-500/[0.12] to-pink-500/[0.08] text-[#0A0A0A]"
                  : "text-[#6E6E6C] hover:text-[#0A0A0A] hover:bg-black/[0.03]"
              }`}
            >
              <span className={active ? "text-[#7C3AED]" : ""}>{icon}</span>
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* Passer à Pro (masqué si déjà abonné, ou si le rôle ne gère pas la facturation) */}
      {!isPaid && canBill && (
        <div className="px-2.5 pb-2">
          {collapsed ? (
            <Link
              href="/settings?section=billing"
              title={t("Passer à Pro", "Upgrade to Pro")}
              className="flex items-center justify-center py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_6px_16px_rgba(139,92,246,0.3)] transition-transform hover:scale-[1.03] active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/settings?section=billing"
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(139,92,246,0.32)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <Sparkles className="w-3.5 h-3.5" /> {t("Passer à Pro", "Upgrade to Pro")}
            </Link>
          )}
        </div>
      )}

      {/* Credits */}
      <div className="px-2.5 pb-3">
        {collapsed ? (
          <button
            type="button"
            onClick={() => setPacksOpen(true)}
            title={credits !== null ? `${credits} ${t("crédits · Recharger", "credits · Top up")}` : t("Recharger", "Top up")}
            className="flex w-full items-center justify-center py-2.5 rounded-xl hover:bg-black/[0.04] transition-colors"
          >
            <Zap className="w-4 h-4 text-[#7C3AED]" />
          </button>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#E7E7E4] bg-white">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <Zap className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#0A0A0A] font-semibold tabular-nums">
                  {credits !== null ? `${credits.toLocaleString(locale === "en" ? "en-US" : "fr-FR")} ${t("crédits", "credits")}` : "…"}
                </p>
                <p className="text-[10px] text-[#9A9A97]">{t("Solde disponible", "Available balance")}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPacksOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-[#EDEDE9] py-2 text-[12px] font-semibold text-[#7C3AED] transition-colors hover:bg-[#F7F4FD]"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> {t("Recharger", "Top up")}
            </button>
          </div>
        )}
      </div>
      <CreditPacksDialog open={packsOpen} onClose={() => setPacksOpen(false)} />

      {/* Compte : un seul point d'entrée en bas → menu déroulant. Y vivent désormais
          les destinations retirées de la nav principale (Paramètres, Connexions,
          Équipe, Abonnement) + le parrainage + la déconnexion. Les liens Équipe /
          Abonnement pointent vers les sections existantes de /settings (deep-link),
          pas de nouvelles routes. */}
      <div className="relative px-2.5 pb-4 border-t border-[#EDEDE9] pt-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => setAccountOpen((v) => !v)}
          aria-expanded={accountOpen}
          title={collapsed ? (userName || email) : undefined}
          className={`flex w-full items-center gap-3 rounded-xl py-2 transition-colors hover:bg-black/[0.04] ${collapsed ? "justify-center px-0" : "px-2"}`}
        >
          <div className="w-7 h-7 rounded-full bg-[#0A0A0A] flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-white">{initial}</span>
          </div>
          {!collapsed && (
            <>
              <span className="flex-1 min-w-0 text-left">
                <span className="block text-xs font-semibold text-[#0A0A0A] truncate">{userName || email || "…"}</span>
                {userName && <span className="block text-[11px] text-[#9A9A97] truncate">{email}</span>}
              </span>
              <ChevronsUpDown className="w-3.5 h-3.5 text-[#9A9A97] flex-shrink-0" />
            </>
          )}
        </button>

        {accountOpen && (
          <>
            {/* Ferme au clic en dehors */}
            <div className="fixed inset-0 z-40" onClick={() => setAccountOpen(false)} />
            <div
              className={`absolute bottom-full mb-2 z-50 rounded-2xl border border-[#ECECF2] bg-white shadow-[0_16px_50px_rgba(17,24,39,0.14)] p-1.5 anim-pop-up ${collapsed ? "left-2 w-56" : "left-2.5 right-2.5"}`}
            >
              {[
                { icon: Settings, label: t("Paramètres", "Settings"), href: "/settings" },
                { icon: Plug, label: t("Connexions", "Connections"), href: "/connectors" },
                { icon: Users, label: t("Équipe", "Team"), href: "/settings?section=team" },
                ...(canBill
                  ? [{ icon: CreditCard, label: t("Abonnement", "Subscription"), href: "/settings?section=billing" }]
                  : []),
              ].map(({ icon: Icon, label, href }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => { setAccountOpen(false); onClose?.(); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[13px] text-[#2A2A32] hover:bg-[#F4F4F7] transition-colors"
                >
                  <Icon className="w-4 h-4 text-[#6E6E6C] flex-shrink-0" /> {label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => { setAccountOpen(false); setRefOpen(true); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[13px] text-[#2A2A32] hover:bg-[#F4F4F7] transition-colors"
              >
                <Gift className="w-4 h-4 text-[#6E6E6C] flex-shrink-0" /> {t("Gagner des crédits", "Earn credits")}
              </button>
              <div className="my-1 border-t border-[#EFEFF3]" />
              <button
                type="button"
                onClick={() => { setAccountOpen(false); handleLogout(); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[13px] text-[#D95C4A] hover:bg-[#fdf2f0] transition-colors"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" /> {t("Déconnexion", "Log out")}
              </button>
            </div>
          </>
        )}
      </div>
      <ReferralDialog open={refOpen} onClose={() => setRefOpen(false)} />
    </aside>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // La session est déjà résolue par le fournisseur — plus de getUser() ici (c'était
  // le PREMIER de la file d'attente, celui qui retardait tous les autres).
  const { user, loading } = useSession();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isGenerate = pathname === "/generate";
  // Tant que l'utilisateur n'a jamais cliqué le bouton replier/déplier lui-même,
  // la barre suit la largeur d'écran (repliée en icônes sous 1024px — une
  // tablette perd trop de place utile avec les 240px déployés) plutôt que de
  // rester figée sur le dernier état choisi par défaut (false).
  const userSetRef = useRef(false);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem("biltia_sidebar_collapsed"); } catch {}
    if (stored !== null) {
      setCollapsed(stored === "1");
      userSetRef.current = true;
      return;
    }
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => { if (!userSetRef.current) setCollapsed(mq.matches); };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Préchauffage DEV : compile toutes les pages principales en arrière-plan
  // dès l'arrivée dans l'app — chaque clic de sidebar devient instantané au
  // lieu d'attendre le « Compiling… » à la première visite. Étalé pour ne pas
  // saturer le CPU. Inutile en prod (tout est déjà compilé) → dev uniquement.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const pages = ["/generate", "/library", "/workspace", "/settings", "/connectors", "/activity", "/expert"];
    const timers = pages.map((p, i) =>
      setTimeout(() => { fetch(p).catch(() => {}); }, 2000 + i * 1200)
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  const toggleCollapsed = () => {
    userSetRef.current = true; // choix explicite : ne plus suivre la largeur d'écran
    setCollapsed((c) => {
      const n = !c;
      try { localStorage.setItem("biltia_sidebar_collapsed", n ? "1" : "0"); } catch {}
      return n;
    });
  };

  return (
    // La session est résolue UNE fois ici, puis partagée. Tout ce qui est en dessous
    // (garde d'auth, sidebar, bandeau, pages) la LIT au lieu de la redemander.
    <SessionProvider>
    <AuthGuard>
      <div className="flex h-dvh bg-[#FCFCFD] overflow-hidden">
        {/* Desktop sidebar (masquée sur /generate) */}
        {!isGenerate && (
          <div className="hidden md:flex flex-shrink-0">
            <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
          </div>
        )}

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <Sidebar onClose={() => setMobileOpen(false)} />
            <div
              className="flex-1 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile header (masqué sur /generate) */}
          {!isGenerate && (
            <div
              className="md:hidden flex items-center gap-3 px-4 border-b border-[#EDEDE9] bg-[#FCFCFD]/90 backdrop-blur-md flex-shrink-0 sticky top-0 z-30"
              style={{ height: "calc(3.5rem + var(--safe-top))", paddingTop: "var(--safe-top)" }}
            >
              <button
                onClick={() => setMobileOpen(true)}
                className="w-9 h-9 -ml-1 rounded-[11px] bg-black/[0.05] hover:bg-black/[0.09] flex items-center justify-center text-[#0A0A0A] transition-colors"
              >
                <Menu className="w-[18px] h-[18px]" />
              </button>
              <div className="flex items-center gap-2">
                <BiltiaLogo className="h-5 w-auto text-[#0A0A0A]" />
              </div>
            </div>
          )}

          <ReferralClaim />
          <SubscriptionBanner />
          {/* Réserve la zone « home indicator » en bas pour TOUTES les pages qui
              défilent (le dernier bouton ne passe plus sous l'indicateur). /generate
              gère ses propres barres → exclu. */}
          <main className={`flex-1 overflow-auto ${isGenerate ? "" : "pb-safe"}`}>{children}</main>
        </div>
      </div>
    </AuthGuard>
    </SessionProvider>
  );
}
