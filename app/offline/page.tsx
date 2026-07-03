import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hors ligne" };

// Page servie par le service worker quand une navigation échoue sans réseau.
// Volontairement sans JavaScript : elle s'affiche même si les chunks ne sont pas en cache.
export default function OfflinePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#F7F5EF] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#0F172A] flex items-center justify-center mb-6 shadow-depth-2">
        <span className="font-display text-white font-bold text-2xl leading-none">B</span>
      </div>
      <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-2 tracking-tight">Vous êtes hors ligne</h1>
      <p className="text-[#6B7280] text-[15px] max-w-xs leading-relaxed mb-7">
        Batify a besoin d&apos;une connexion pour résoudre votre demande. Vérifiez votre réseau, puis réessayez.
      </p>
      <a
        href="/dashboard"
        className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#0F172A] text-white text-[14px] font-semibold hover:bg-[#1E293B] transition-colors"
      >
        Réessayer
      </a>
    </div>
  );
}
