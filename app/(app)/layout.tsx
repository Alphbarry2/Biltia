"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Home,
  Boxes,
  Library,
  HardHat,
  Activity,
  Settings,
  LogOut,
  Zap,
  Menu,
  X,
  ChevronRight,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const ADMIN_EMAIL = "barryalpha9755@gmail.com";

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
  const [email, setEmail] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? "");
        const name = user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "";
        setUserName(name);
        supabase
          .from("user_credits")
          .select("balance")
          .eq("user_id", user.id)
          .single()
          .then(({ data }) => {
            if (data) setCredits(data.balance);
          });
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
    { label: "Expert BTP", href: "/expert", icon: <HardHat className="w-4 h-4" /> },
    { label: "Activité", href: "/activity", icon: <Activity className="w-4 h-4" /> },
    { label: "Paramètres", href: "/settings", icon: <Settings className="w-4 h-4" /> },
    ...(email === ADMIN_EMAIL
      ? [{ label: "Admin", href: "/admin", icon: <BarChart3 className="w-4 h-4" /> }]
      : []),
  ];

  const initial = (email || userName || "?")[0].toUpperCase();

  return (
    <aside className={`flex flex-col h-full ${collapsed ? "w-[68px]" : "w-[240px]"} bg-[#FCFCFD] border-r border-[#EDEDE9] flex-shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}>
      {/* Header */}
      <div className={`flex items-center h-[64px] border-b border-[#EDEDE9] flex-shrink-0 ${collapsed ? "justify-center px-0" : "justify-between px-4"}`}>
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[9px] bg-[#0A0A0A] flex items-center justify-center">
              <span className="text-white font-bold text-xs leading-none">B</span>
            </div>
            <span className="text-[#0A0A0A] font-bold text-sm tracking-[-0.02em]">Batify</span>
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

      {/* Credits */}
      <div className="px-2.5 pb-3">
        {collapsed ? (
          <Link
            href="/settings"
            title={credits !== null ? `${credits} crédits` : "Crédits"}
            className="flex items-center justify-center py-2.5 rounded-xl hover:bg-black/[0.04] transition-colors"
          >
            <Zap className="w-4 h-4 text-[#7C3AED]" />
          </Link>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-white border border-[#E7E7E4] rounded-xl">
            <Zap className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#0A0A0A] font-semibold tabular-nums">
                {credits !== null ? `${credits} crédits` : "…"}
              </p>
              <p className="text-[10px] text-[#9A9A97]">Solde disponible</p>
            </div>
            <Link href="/settings" className="text-[#9A9A97] hover:text-[#0A0A0A] transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>

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
    try { setCollapsed(localStorage.getItem("batify_sidebar_collapsed") === "1"); } catch {}
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const n = !c;
      try { localStorage.setItem("batify_sidebar_collapsed", n ? "1" : "0"); } catch {}
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
                <div className="w-6 h-6 rounded-md bg-[#0A0A0A] flex items-center justify-center">
                  <span className="text-white font-bold text-xs leading-none">B</span>
                </div>
                <span className="font-bold text-[#0A0A0A] text-sm tracking-[-0.02em]">Batify</span>
              </div>
            </div>
          )}

          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
