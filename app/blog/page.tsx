import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { BLOG_POSTS, blogJsonLd, SITE_URL } from "@/lib/blog";
import { Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter } from "@/components/site";
import JsonLd from "@/components/json-ld";

export const metadata: Metadata = {
  title: "Blog : conseils, guides et actualités pour le BTP",
  description:
    "Devis, avenants, facturation, réglementation et outils : les guides Biltia pour faire moins d'administratif et plus de chantier.",
  keywords: [
    "blog BTP",
    "conseils artisan",
    "gestion chantier",
    "facturation bâtiment",
    "réglementation BTP",
  ],
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    type: "website",
    title: "Le blog Biltia : conseils et actualités BTP",
    description:
      "Guides pratiques pour les artisans et entreprises du bâtiment : devis, avenants, facturation, réglementation et outils.",
    url: `${SITE_URL}/blog`,
  },
};

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export default function BlogIndex() {
  const posts = [...BLOG_POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
  const [featured, ...rest] = posts;

  return (
    <main className="bg-[#FCFCFD] min-h-screen overflow-x-hidden text-[#0A0A0A]">
      <JsonLd data={blogJsonLd()} />
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden px-5 sm:px-8 pt-36 pb-16">
        <InteractiveMesh strong />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <span className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-[#4A4A56] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500" />
            Le blog Biltia
          </span>
          <h1 className="text-[42px] sm:text-[64px] md:text-[72px] font-black tracking-[-0.045em] leading-[0.92] text-[#0A0A0A]">
            Moins d&apos;administratif, <span className="text-gradient">plus de savoir.</span>
          </h1>
          <p className="text-[17px] sm:text-[19px] text-[#5B5B66] max-w-[600px] mx-auto leading-[1.55] mt-7">
            Conseils, guides et actualités pour les artisans et entreprises du BTP. Devis, avenants,
            facturation, réglementation et outils : l&apos;essentiel, sans jargon.
          </p>
        </div>
      </section>

      {/* Article à la une */}
      <section className="relative px-5 sm:px-8 pb-6">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <Link href={`/blog/${featured.slug}`} className="block group">
              <Spot className="glass glass-hover rounded-[30px] p-7 sm:p-10 overflow-hidden">
                <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
                  <div>
                    <div className="flex items-center gap-3 mb-5 text-[12.5px]">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full grad-border font-semibold text-[#0A0A0A]">
                        {featured.category}
                      </span>
                      <span className="text-[#9A9AA6]">{fmtDate(featured.date)}</span>
                      <span className="text-[#9A9AA6]">{featured.readingMinutes} min</span>
                    </div>
                    <h2 className="text-[28px] sm:text-[38px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[1.02] mb-4">
                      {featured.title}
                    </h2>
                    <p className="text-[15px] sm:text-[16px] text-[#5B5B66] leading-relaxed mb-6 max-w-xl">
                      {featured.excerpt}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0A0A0A] group-hover:gap-2.5 transition-all">
                      Lire l&apos;article <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="hidden lg:flex items-center justify-center">
                    <div className="w-full aspect-[4/3] rounded-[22px] bg-gradient-to-br from-indigo-500/12 via-violet-500/10 to-pink-500/12 border border-white/60 flex items-center justify-center">
                      <span className="text-[72px] font-black text-gradient leading-none tracking-tighter opacity-90">
                        {featured.category}
                      </span>
                    </div>
                  </div>
                </div>
              </Spot>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Grille d'articles */}
      <section className="relative px-5 sm:px-8 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rest.map((p, k) => (
            <Reveal key={p.slug} delay={(k % 3) * 0.06}>
              <Link href={`/blog/${p.slug}`} className="block h-full group">
                <Spot className="glass glass-hover h-full rounded-[26px] p-7 overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2.5 mb-4 text-[12px]">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/70 border border-white/60 font-semibold text-[#4A4A56]">
                      {p.category}
                    </span>
                    <span className="text-[#9A9AA6]">{p.readingMinutes} min</span>
                  </div>
                  <h3 className="text-[18px] font-bold text-[#0A0A0A] mb-2.5 tracking-[-0.01em] leading-snug">
                    {p.title}
                  </h3>
                  <p className="text-[13.5px] text-[#5B5B66] leading-relaxed mb-5 flex-1">{p.excerpt}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#9A9AA6]">{fmtDate(p.date)}</span>
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#0A0A0A] group-hover:gap-2 transition-all">
                      Lire <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Spot>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative px-5 sm:px-8 py-24 sm:py-32 overflow-hidden">
        <InteractiveMesh strong grid={false} />
        <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,0.55), transparent 75%)" }} />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <Reveal>
            <h2 className="text-[36px] sm:text-[56px] font-black text-[#0A0A0A] tracking-[-0.04em] leading-[0.95] mb-6">
              Assez lu ? <span className="text-gradient">Passez à l&apos;action.</span>
            </h2>
            <p className="text-[16px] text-[#5B5B66] max-w-md mx-auto mb-9 leading-relaxed">
              Décrivez votre problème, Biltia livre la solution : document, application, réponse ou automatisation.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/signup?from=blog"
                className="w-full sm:w-auto bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white font-semibold text-[15px] px-7 py-3.5 rounded-full inline-flex items-center justify-center gap-1.5 shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] transition-shadow"
              >
                Commencer avec Biltia <ArrowUpRight className="w-4 h-4" />
              </Link>
              <Link
                href="/tarifs"
                className="w-full sm:w-auto glass font-semibold text-[15px] px-7 py-3.5 rounded-full text-[#0A0A0A] hover:bg-white transition-colors"
              >
                Voir les tarifs
              </Link>
            </div>
            <p className="text-[12px] text-[#9A9AA6] mt-4">Aucune carte bancaire requise.</p>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
