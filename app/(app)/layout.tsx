"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { BiltiaLogo } from "@/components/brand";
import { CreditPacksDialog } from "@/components/credit-packs";
import { ReferralClaim } from "@/components/referral-claim";
import { ReferralDialog } from "@/components/referral-dialog";
import {
  Home,
  Boxes,
  Library,
  Activity,
  Settings,
  Plug,
  Bot,
  LogOut,
  Zap,
  Menu,
  X,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
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
  const pathname = usePathname();
  const router = useRouter();
  const [credits, setCredits] = useState<number | null>(null);
  const [packsOpen, setPacksOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  // Seul le propriétaire gère la facturation → le CTA « Passer à Pro » ne
  // s'affiche que pour lui (un employé/lecteur ne peut pas souscrire).
  const [canBill, setCanBill] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? "");
      const name = user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "";
      setUserName(name);
      supabase
        .from("user_credits")
        .select("balance, topup_balance")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          // Solde total = abonnement (balance) + packs (topup_balance, non expirable).
          if (data) setCredits((data.balance ?? 0) + (data.topup_balance ?? 0));
        });

      // Abonnement actif ? → masque le CTA « Passer à Pro ».
      const membership = await getActiveMembership(supabase, user.id);
      if (membership?.tenant_id) {
        setCanBill(can(membership.role, "billing.manage"));
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("plan, status")
          .eq("tenant_id", membership.tenant_id)
          .maybeSingle();
        if (sub && sub.plan !== "free" && (sub.status === "active" || sub.status === "trialing")) {
          setIsPaid(true);
        }
      }
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const nav = [
    { label: "Accueil", href: "/dashboard", icon: <Home className="w-4 h-4" /> },
    { label: "Workspace", href: "/workspace", icon: <Boxes className="w-4 h-4" /> },
    { label: "Bibliothèque", href: "/library", icon: <Library className="w-4 h-4" /> },
    { label: "Agents", href: "/agents", icon: <Bot className="w-4 h-4" /> },
    { label: "Connecteurs", href: "/connectors", icon: <Plug className="w-4 h-4" /> },
    { label: "Activité", href: "/activity", icon: <Activity className="w-4 h-4" /> },
    { label: "Paramètres", href: "/settings", icon: <Settings className="w-4 h-4" /> },
  ];

  const initial = (email || userName || "?")[0].toUpperCase();

  return (
    <aside className={`flex flex-col h-full ${collapsed ? "w-[68px]" : "w-[240px]"} bg-[#FCFCFD] border-r border-[#EDEDE9] flex-shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}>
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
            title={collapsed ? "Déployer la barre" : "Réduire la barre"}
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
            pathname.startsWith(href + "/") ||
            (href === "/library" && pathname.startsWith("/apps"));
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
              title="Passer à Pro"
              className="flex items-center justify-center py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_6px_16px_rgba(139,92,246,0.3)] transition-transform hover:scale-[1.03] active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/settings?section=billing"
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(139,92,246,0.32)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <Sparkles className="w-3.5 h-3.5" /> Passer à Pro
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
            title={credits !== null ? `${credits} crédits · Recharger` : "Recharger"}
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
                  {credits !== null ? `${credits.toLocaleString("fr-FR")} crédits` : "…"}
                </p>
                <p className="text-[10px] text-[#9A9A97]">Solde disponible</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPacksOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-[#EDEDE9] py-2 text-[12px] font-semibold text-[#7C3AED] transition-colors hover:bg-[#F7F4FD]"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> Recharger
            </button>
          </div>
        )}
      </div>
      <CreditPacksDialog open={packsOpen} onClose={() => setPacksOpen(false)} />

      {/* Parrainage : inviter son réseau BTP, gagner des crédits (façon Lovable) */}
      <div className="px-2.5 pb-3">
        {collapsed ? (
          <button
            type="button"
            onClick={() => setRefOpen(true)}
            title="Parrainage — gagner des crédits"
            className="flex w-full items-center justify-center py-2.5 rounded-xl hover:bg-black/[0.04] transition-colors"
          >
            <Gift className="w-4 h-4 text-[#7C3AED]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setRefOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-[#E7E7E4] bg-white px-3 py-2.5 text-[13px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F7F4FD]"
          >
            <Gift className="w-4 h-4 text-[#7C3AED]" /> Gagner des crédits
          </button>
        )}
      </div>
      <ReferralDialog open={refOpen} onClose={() => setRefOpen(false)} />

      {/* User */}
      <div className="px-2.5 pb-4 border-t border-[#EDEDE9] pt-3 flex-shrink-0">
        <div className={`flex items-center gap-3 py-1.5 ${collapsed ? "justify-center px-0" : "px-2"}`}>
          <div className="w-7 h-7 rounded-full bg-[#0A0A0A] flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-white">{initial}</span>
          </div>
          {!collapsed && (
            <>
              <p className="text-xs text-[#6E6E6C] truncate flex-1">{email || "…"}</p>
              <button
                onClick={handleLogout}
                className="text-[#9A9A97] hover:text-[#0A0A0A] transition-colors"
                title="Déconnexion"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/login");
    });

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

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("biltia_sidebar_collapsed") === "1"); } catch {}
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
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const n = !c;
      try { localStorage.setItem("biltia_sidebar_collapsed", n ? "1" : "0"); } catch {}
      return n;
    });

  return (
    <AuthGuard>
      <div className="flex h-screen bg-[#FCFCFD] overflow-hidden">
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
            <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-[#EDEDE9] bg-[#FCFCFD]/90 backdrop-blur-md flex-shrink-0 sticky top-0 z-30">
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
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
