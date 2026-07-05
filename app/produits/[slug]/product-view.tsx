"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import type { Product } from "@/lib/products";
import {
  PRODUCT_ICONS, Reveal, Spot, Magnetic, InteractiveMesh, SiteNav, SiteFooter,
} from "@/components/site";

export default function ProductView({ product, others }: { product: Product; others: Product[] }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const Icon = PRODUCT_ICONS[product.icon];
  const grad = `linear-gradient(135deg, ${product.accent[0]}, ${product.accent[1]})`;

  const tryPrompt = (p: string) => {
    if (p.trim()) sessionStorage.setItem("biltia_prompt", p.trim());
    router.push("/signup?from=prompt");
  };

  return (
    <main className="bg-[#FCFCFD] min-h-screen overflow-x-hidden text-[#0A0A0A]">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden px-5 sm:px-8 pt-36 pb-24">
        <InteractiveMesh strong />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <span className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-[#4A4A56] mb-8">
            <span className="w-6 h-6 rounded-md flex items-center justify-center text-white" style={{ background: grad }}><Icon className="w-3.5 h-3.5" /></span>
            {product.name}
          </span>
          <h1 className="text-[42px] sm:text-[64px] md:text-[76px] font-black tracking-[-0.045em] leading-[0.92] text-[#0A0A0A]">{product.hero}</h1>
          <p className="text-[17px] sm:text-[19px] text-[#5B5B66] max-w-[600px] mx-auto leading-[1.55] mt-7 mb-10">{product.sub}</p>
          <div className="flex items-center justify-center gap-3">
            <Magnetic>
              <button onClick={() => tryPrompt(product.examples[0])} className="bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white font-semibold text-[15px] px-6 py-3.5 rounded-full inline-flex items-center gap-1.5 shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] transition-shadow">Essayer maintenant <ArrowUpRight className="w-4 h-4" /></button>
            </Magnetic>
            <Link href="/tarifs" className="glass font-semibold text-[15px] px-6 py-3.5 rounded-full text-[#0A0A0A] hover:bg-white transition-colors">Voir les tarifs</Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative px-5 sm:px-8 py-24 sm:py-32 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-4">
            {product.features.map((f, k) => (
              <Reveal key={f.title} delay={k * 0.06}>
                <Spot className="glass glass-hover h-full rounded-[26px] p-7 overflow-hidden">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white mb-5" style={{ background: grad }}><Check className="w-5 h-5" strokeWidth={2.5} /></div>
                  <h3 className="text-[18px] font-bold text-[#0A0A0A] mb-2 tracking-[-0.01em]">{f.title}</h3>
                  <p className="text-[14px] text-[#5B5B66] leading-relaxed">{f.body}</p>
                </Spot>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Essayer */}
      <section className="relative px-5 sm:px-8 py-24 sm:py-32 overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(55% 55% at 50% 45%, rgba(139,92,246,0.08), transparent 72%)" }} />
        <div className="max-w-2xl mx-auto text-center">
          <Reveal>
            <h2 className="text-[34px] sm:text-[48px] font-black text-[#0A0A0A] tracking-[-0.03em] leading-[0.98] mb-8">Essayez, dictez.</h2>
            <div className="glass glass-hover rounded-[26px] p-2.5 text-left">
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") tryPrompt(input); }} placeholder={product.examples[0]}
                className="w-full bg-transparent px-4 pt-4 pb-2 text-[15px] text-[#0A0A0A] placeholder-[#9A9AA6] focus:outline-none" />
              <div className="flex items-center justify-between gap-3 px-2 pb-1">
                <span className="text-[12px] text-[#9A9AA6] pl-2">Entrée pour lancer</span>
                <button onClick={() => tryPrompt(input || product.examples[0])} aria-label="Lancer" className="w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_6px_20px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_28px_rgba(139,92,246,0.55)] active:scale-95 transition-all">
                  <ArrowUpRight className="w-[18px] h-[18px]" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
              {product.examples.map((ex) => (
                <button key={ex} onClick={() => setInput(ex)} className="glass text-[12.5px] text-[#4A4A56] px-3.5 py-2 rounded-full hover:bg-white transition-colors max-w-full truncate">{ex}</button>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Autres produits */}
      <section className="relative px-5 sm:px-8 py-24 sm:py-32 overflow-hidden border-t border-[#EDEDEB]">
        <div className="max-w-6xl mx-auto">
          <Reveal className="mb-10"><h2 className="text-[28px] sm:text-[38px] font-black text-[#0A0A0A] tracking-[-0.03em]">Les autres produits</h2></Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {others.map((p, k) => {
              const OIcon = PRODUCT_ICONS[p.icon];
              return (
                <Reveal key={p.slug} delay={k * 0.06}>
                  <Link href={`/produits/${p.slug}`} className="block h-full">
                    <Spot className="glass glass-hover h-full rounded-[26px] p-7 overflow-hidden group">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white mb-5" style={{ background: `linear-gradient(135deg, ${p.accent[0]}, ${p.accent[1]})` }}><OIcon className="w-5 h-5" /></div>
                      <h3 className="text-[17px] font-bold text-[#0A0A0A] mb-1.5">{p.name}</h3>
                      <p className="text-[13px] text-[#5B5B66] leading-relaxed mb-4">{p.tagline}.</p>
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0A0A0A] group-hover:gap-2.5 transition-all">En savoir plus <ArrowRight className="w-3.5 h-3.5" /></span>
                    </Spot>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
