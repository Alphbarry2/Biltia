import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Sparkles } from "lucide-react";
import {
  BLOG_POSTS,
  getPost,
  relatedPosts,
  articleJsonLd,
  faqJsonLd,
  breadcrumbJsonLd,
  postUrl,
} from "@/lib/blog";
import { getProduct } from "@/lib/products";
import { localizePost } from "@/lib/blog-i18n";
import { Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter } from "@/components/site";
import JsonLd from "@/components/json-ld";
import { getLocale } from "@/lib/i18n/server";
import { pick, type Locale } from "@/lib/i18n/config";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const raw = getPost(slug);
  if (!raw) return {};
  // Titre/description d'onglet + mots-clés dans la langue du lecteur. Un robot
  // n'a pas de cookie → il reçoit le FR (le SEO français reste la référence).
  const post = localizePost(raw, await getLocale());
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: postUrl(slug) },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: postUrl(slug),
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      authors: ["Biltia"],
    },
  };
}

function fmtDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function BlogArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raw = getPost(slug);
  if (!raw) notFound();

  const locale = await getLocale();
  // Corps de l'article traduit (titre, intro, sections, FAQ, points clés…).
  const post = localizePost(raw, locale);
  const product = getProduct(post.relatedProduct);
  const grad = product
    ? `linear-gradient(135deg, ${product.accent[0]}, ${product.accent[1]})`
    : "linear-gradient(135deg, #6366F1, #EC4899)";
  const related = relatedPosts(slug, 3).map((p) => localizePost(p, locale));

  return (
    <main className="bg-[#FCFCFD] min-h-screen overflow-x-hidden text-[#0A0A0A]">
      <JsonLd data={[articleJsonLd(post), faqJsonLd(post), breadcrumbJsonLd(post)]} />
      <SiteNav />

      {/* En-tête */}
      <article className="relative">
        <header className="relative overflow-hidden px-5 sm:px-8 pt-36 pb-14">
          <InteractiveMesh strong />
          <div className="relative z-10 max-w-3xl mx-auto">
            {/* Fil d'Ariane */}
            <nav aria-label={pick(locale, "Fil d'Ariane", "Breadcrumb")} className="flex items-center gap-2 text-[13px] text-[#9A9AA6] mb-7">
              <Link href="/" className="hover:text-[#0A0A0A] transition-colors">{pick(locale, "Accueil", "Home")}</Link>
              <span>/</span>
              <Link href="/blog" className="hover:text-[#0A0A0A] transition-colors">Blog</Link>
            </nav>
            <div className="flex items-center gap-3 mb-6 text-[13px]">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full grad-border font-semibold text-[#0A0A0A]">
                {post.category}
              </span>
              <span className="text-[#9A9AA6]">{fmtDate(post.date, locale)}</span>
              <span className="text-[#9A9AA6]">{post.readingMinutes} {pick(locale, "min de lecture", "min read")}</span>
            </div>
            <h1 className="text-[34px] sm:text-[50px] font-black tracking-[-0.04em] leading-[1.02] text-[#0A0A0A]">
              {post.title}
            </h1>
            <p className="text-[17px] sm:text-[19px] text-[#5B5B66] leading-[1.55] mt-7">{post.intro}</p>
          </div>
        </header>

        {/* Corps de l'article */}
        <div className="relative px-5 sm:px-8 pb-8">
          <div className="max-w-3xl mx-auto">
            {/* À retenir */}
            <Reveal>
              <div className="glass rounded-[24px] p-6 sm:p-7 mb-12">
                <p className="text-[12px] font-bold uppercase tracking-wider text-[#7C3AED] mb-4">{pick(locale, "À retenir", "Key takeaways")}</p>
                <ul className="space-y-3">
                  {post.takeaways.map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: grad }}>
                        <Check className="w-3 h-3" strokeWidth={3} />
                      </span>
                      <span className="text-[15px] text-[#334155] leading-relaxed">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            {/* Sections */}
            <div className="space-y-11">
              {post.sections.map((s) => (
                <section key={s.heading}>
                  <h2 className="text-[24px] sm:text-[30px] font-black text-[#0A0A0A] tracking-[-0.02em] leading-tight mb-4">
                    {s.heading}
                  </h2>
                  {s.body.map((para, i) => (
                    <p key={i} className="text-[16px] sm:text-[17px] text-[#3F4653] leading-[1.7] mb-4">
                      {para}
                    </p>
                  ))}
                  {s.list && (
                    <ul className="mt-4 space-y-2.5">
                      {s.list.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-[16px] text-[#3F4653] leading-relaxed">
                          <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gradient-to-br from-indigo-500 to-pink-500" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>

            {/* Encart produit associé */}
            {product && (
              <Reveal>
                <div className="relative overflow-hidden rounded-[26px] mt-14 p-7 sm:p-9 bg-[#0A0A0A] text-white">
                  <div
                    className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-[90px] opacity-50"
                    style={{ background: grad }}
                  />
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-white/60 uppercase tracking-wider mb-4">
                      <Sparkles className="w-3.5 h-3.5" /> {pick(locale, "Avec Biltia", "With Biltia")}
                    </div>
                    <p className="text-[19px] sm:text-[22px] font-bold leading-snug mb-2 max-w-xl">
                      « {post.cta} »
                    </p>
                    <p className="text-[14px] text-white/70 leading-relaxed mb-6 max-w-lg">
                      {pick(locale, "Biltia bascule sur le bon produit, ici ", "Biltia switches to the right product, here ")}{product.name.toLowerCase()}{pick(locale, ", et livre la solution. Vous décrivez le problème, Biltia choisit l'outil.", ", and delivers the solution. You describe the problem, Biltia picks the tool.")}
                    </p>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <Link
                        href="/signup?from=blog"
                        className="bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white font-semibold text-[14px] px-6 py-3 rounded-full inline-flex items-center gap-1.5 shadow-[0_8px_24px_rgba(139,92,246,0.45)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.6)] transition-shadow"
                      >
                        {pick(locale, "Essayer maintenant", "Try it now")} <ArrowUpRight className="w-4 h-4" />
                      </Link>
                      <Link
                        href={`/produits/${product.slug}`}
                        className="text-[14px] font-semibold text-white/80 hover:text-white transition-colors inline-flex items-center gap-1.5"
                      >
                        {pick(locale, "Découvrir ", "Discover ")}{product.name} <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </Reveal>
            )}

            {/* FAQ */}
            <section className="mt-14">
              <h2 className="text-[24px] sm:text-[30px] font-black text-[#0A0A0A] tracking-[-0.02em] mb-6">
                {pick(locale, "Questions fréquentes", "Frequently asked questions")}
              </h2>
              <div className="space-y-3">
                {post.faq.map((f) => (
                  <details key={f.q} className="glass rounded-[20px] p-5 group">
                    <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-[16px] font-semibold text-[#0A0A0A]">
                      {f.q}
                      <span className="text-[#7C3AED] text-[20px] leading-none group-open:rotate-45 transition-transform">+</span>
                    </summary>
                    <p className="text-[15px] text-[#3F4653] leading-relaxed mt-3">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </div>
      </article>

      {/* Articles connexes */}
      <section className="relative px-5 sm:px-8 py-20 sm:py-28 border-t border-[#EDEDEB] mt-10">
        <div className="max-w-6xl mx-auto">
          <Reveal className="mb-8">
            <h2 className="text-[26px] sm:text-[36px] font-black text-[#0A0A0A] tracking-[-0.03em]">
              {pick(locale, "À lire ensuite", "Read next")}
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {related.map((p, k) => (
              <Reveal key={p.slug} delay={k * 0.06}>
                <Link href={`/blog/${p.slug}`} className="block h-full group">
                  <Spot className="glass glass-hover h-full rounded-[26px] p-7 overflow-hidden flex flex-col">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/70 border border-white/60 font-semibold text-[12px] text-[#4A4A56] mb-4 w-fit">
                      {p.category}
                    </span>
                    <h3 className="text-[17px] font-bold text-[#0A0A0A] mb-2 leading-snug">{p.title}</h3>
                    <p className="text-[13px] text-[#5B5B66] leading-relaxed mb-4 flex-1">{p.excerpt}</p>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0A0A0A] group-hover:gap-2.5 transition-all">
                      {pick(locale, "Lire", "Read")} <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </Spot>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
