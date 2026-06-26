"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  LayoutGrid,
  Sparkles,
  Settings,
  LogOut,
  Zap,
  Menu,
  X,
  ChevronRight,
  BarChart3,
} from "lucide-react";

const ADMIN_EMAIL = "barryalpha9755@gmail.com";

function Sidebar({ onClose }: { onClose?: () => void }) {
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
    { label: "Accueil", href: "/dashboard", icon: <LayoutGrid className="w-4 h-4" /> },
    { label: "Créer", href: "/generate", icon: <Sparkles className="w-4 h-4" /> },
    { label: "Paramètres", href: "/settings", icon: <Settings className="w-4 h-4" /> },
    ...(email === ADMIN_EMAIL
      ? [{ label: "Admin", href: "/admin", icon: <BarChart3 className="w-4 h-4" /> }]
      : []),
  ];

  const initial = (email || userName || "?")[0].toUpperCase();

  return (
    <aside className="flex flex-col h-full w-[220px] bg-[#0C1220] flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 h-[60px] border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#14B8A6] flex items-center justify-center shadow-[0_0_12px_rgba(20,184,166,0.4)]">
            <span className="text-white font-bold text-xs leading-none">B</span>
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">Batify</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ label, href, icon }) => {
          const active =
            pathname === href ||
            (href === "/dashboard" && pathname.startsWith("/apps"));
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-white/[0.1] text-white"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.05]"
              }`}
            >
              <span className={active ? "text-[#14B8A6]" : ""}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Credits */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.05] border border-white/[0.07] rounded-xl">
          <Zap className="w-3.5 h-3.5 text-[#14B8A6] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/80 font-semibold tabular-nums">
              {credits !== null ? `${credits} crédits` : "…"}
            </p>
            <p className="text-[10px] text-white/30">Plan Artisan</p>
          </div>
          <Link href="/settings" className="text-white/30 hover:text-white/60 transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* User */}
      <div className="px-3 pb-4 border-t border-white/[0.06] pt-3 flex-shrink-0">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="w-7 h-7 rounded-full bg-[#14B8A6]/20 border border-[#14B8A6]/30 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-[#14B8A6]">{initial}</span>
          </div>
          <p className="text-xs text-white/50 truncate flex-1">{email || "…"}</p>
          <button
            onClick={handleLogout}
            className="text-white/30 hover:text-white/60 transition-colors"
            title="Déconnexion"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
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
  const pathname = usePathname();
  const isGenerate = pathname === "/generate";

  return (
    <AuthGuard>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Desktop sidebar — hidden on /generate */}
        {!isGenerate && (
          <div className="hidden md:flex flex-shrink-0">
            <Sidebar />
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
          {/* Mobile header — hidden on /generate */}
          {!isGenerate && (
            <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-card flex-shrink-0">
              <button
                onClick={() => setMobileOpen(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[#14B8A6] flex items-center justify-center shadow-[0_0_8px_rgba(20,184,166,0.4)]">
                  <span className="text-white font-bold text-xs leading-none">B</span>
                </div>
                <span className="font-semibold text-foreground text-sm">Batify</span>
              </div>
            </div>
          )}

          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
