import Link from "next/link";
import { AuthScene } from "@/components/auth";
import { BiltiaLogo } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// Split-screen façon produit : formulaire épuré à gauche, scène animée Biltia
// (mesh + conversation) à droite. La scène disparaît sous lg.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <div className="min-h-[100dvh] bg-[#FCFCFD] text-[#0A0A0A] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <div
        className="relative flex min-h-[100dvh] flex-col px-6 py-7 sm:px-12"
        style={{ paddingTop: "calc(1.75rem + var(--safe-top))", paddingBottom: "calc(1.75rem + var(--safe-bottom))" }}
      >
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex w-fit items-center gap-2.5">
            <BiltiaLogo className="h-8 w-auto text-[#0A0A0A]" />
          </Link>
          <LanguageSwitcher variant="nav" />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>

        <div className="flex items-center justify-between text-[12px] text-[#9A9AA6]">
          <span>© 2026 Biltia</span>
          <div className="flex gap-4">
            <Link href="/cgu" className="transition-colors hover:text-[#0A0A0A]">{pick(locale, "CGU", "Terms")}</Link>
            <Link href="/confidentialite" className="transition-colors hover:text-[#0A0A0A]">{pick(locale, "Confidentialité", "Privacy")}</Link>
            <Link href="/mentions-legales" className="transition-colors hover:text-[#0A0A0A]">{pick(locale, "Mentions légales", "Legal notice")}</Link>
          </div>
        </div>
      </div>

      <div className="sticky top-0 hidden h-[100dvh] p-3 pl-0 lg:block">
        <AuthScene />
      </div>
    </div>
  );
}
