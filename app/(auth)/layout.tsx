import Link from "next/link";
import { InteractiveMesh } from "@/components/site";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center px-4 py-10 overflow-hidden bg-[#FCFCFD] text-[#0A0A0A]">
      <InteractiveMesh strong />
      <div className="relative z-10 w-full max-w-sm">
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-[11px] bg-[#0A0A0A] flex items-center justify-center">
            <span className="text-white font-bold text-base leading-none">B</span>
          </div>
          <span className="font-bold text-[#0A0A0A] text-xl tracking-[-0.02em]">Batify</span>
        </Link>
        {children}
      </div>
    </div>
  );
}
