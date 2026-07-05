import Link from "next/link";
import { AuthScene } from "@/components/auth";

// Split-screen façon produit : formulaire épuré à gauche, scène animée Biltia
// (mesh + conversation) à droite. La scène disparaît sous lg.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#FCFCFD] text-[#0A0A0A] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <div className="relative flex min-h-[100dvh] flex-col px-6 py-7 sm:px-12">
        <Link href="/" className="flex w-fit items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#0A0A0A]">
            <span className="text-base font-bold leading-none text-white">B</span>
          </div>
          <span className="text-xl font-bold tracking-[-0.02em] text-[#0A0A0A]">Biltia</span>
        </Link>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>

        <div className="flex items-center justify-between text-[12px] text-[#9A9AA6]">
          <span>© 2026 Biltia</span>
          <div className="flex gap-4">
            <a href="#" className="transition-colors hover:text-[#0A0A0A]">CGU</a>
            <a href="#" className="transition-colors hover:text-[#0A0A0A]">Confidentialité</a>
          </div>
        </div>
      </div>

      <div className="sticky top-0 hidden h-[100dvh] p-3 pl-0 lg:block">
        <AuthScene />
      </div>
    </div>
  );
}
