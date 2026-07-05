import type { Metadata } from "next";

// Console interne : jamais indexée, jamais suivie. Pas de sidebar applicative
// (route hors du groupe (app)) — elle vit dans sa propre coquille minimale.
export const metadata: Metadata = {
  title: "Console",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-[#FCFCFD] text-[#0A0A0A]">{children}</div>;
}
