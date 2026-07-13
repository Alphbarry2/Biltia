import { SiteNav, SiteFooter } from "@/components/site";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

const PROSE =
  "space-y-3 text-[15px] text-[#3A3F4C] leading-[1.75] [&_a]:text-violet-600 [&_a:hover]:underline [&_a]:font-medium " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_li]:marker:text-[#C4B5FD] [&_strong]:text-[#0A0A0A] [&_strong]:font-semibold";

// Page légale : hero maillé (identité Biltia) + sommaire collant + sections numérotées.
export async function LegalPage({
  title,
  intro,
  updated,
  sections,
}: {
  title: string;
  intro?: string;
  updated?: string;
  sections: LegalSection[];
}) {
  const locale = await getLocale();
  const updatedLabel = updated ?? pick(locale, "juillet 2026", "July 2026");
  return (
    <main className="relative min-h-screen bg-[#FCFCFD]">
      <SiteNav />

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-[#EDEDEB]">
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="mesh-blob absolute -top-[42%] left-[-8%] w-[55vw] h-[55vw] max-w-[680px] rounded-full blur-[120px]" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.16), transparent 66%)" }} />
          <div className="mesh-blob absolute -top-[30%] right-[-8%] w-[48vw] h-[48vw] max-w-[600px] rounded-full blur-[120px]" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.12), transparent 66%)" }} />
          <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)", backgroundSize: "40px 40px", WebkitMaskImage: "linear-gradient(to bottom, #000, transparent 88%)", maskImage: "linear-gradient(to bottom, #000, transparent 88%)" }} />
        </div>
        <div className="relative max-w-5xl mx-auto px-5 sm:px-8 pt-28 sm:pt-36 pb-16">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/70 backdrop-blur-md border border-[#ECECF2] text-[#4A4A56] text-[13px] font-medium rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500" />
            {pick(locale, "Informations légales", "Legal information")}
          </span>
          <h1 className="text-[36px] sm:text-[54px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[1.0]">{title}</h1>
          {intro && <p className="text-[16px] sm:text-[17px] text-[#5B5B66] leading-relaxed mt-5 max-w-2xl">{intro}</p>}
          <p className="text-[13px] text-[#9A9AA6] mt-5">{pick(locale, "Dernière mise à jour", "Last updated")} : {updatedLabel}</p>
        </div>
      </header>

      {/* Corps : sommaire + sections */}
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-14 grid lg:grid-cols-[210px_1fr] gap-10 lg:gap-14">
        <nav className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9A9AA6] mb-3">{pick(locale, "Sommaire", "Contents")}</p>
            {sections.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className="block text-[13.5px] text-[#5B5B66] hover:text-[#0A0A0A] py-1.5 transition-colors">
                <span className="text-[#C4C4CE] tabular-nums mr-2">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="flex items-baseline gap-3 text-[20px] sm:text-[22px] font-bold text-[#0A0A0A] tracking-[-0.01em] mb-4">
                <span className="text-[13px] font-black tabular-nums text-transparent bg-clip-text bg-gradient-to-br from-indigo-500 to-pink-500">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              <div className={PROSE}>{s.body}</div>
            </section>
          ))}

          <div className="rounded-2xl border border-[#ECECF2] bg-white p-6 shadow-[0_12px_44px_rgba(60,40,120,0.05)]">
            <p className="text-[15px] font-semibold text-[#0A0A0A] mb-1">{pick(locale, "Une question ?", "A question?")}</p>
            <p className="text-[14px] text-[#5B5B66]">
              {pick(locale, "Écrivez-nous à ", "Write to us at ")}<a href="mailto:contact@biltia.com" className="text-violet-600 hover:underline font-medium">contact@biltia.com</a>.
            </p>
          </div>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
