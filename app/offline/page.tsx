import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hors ligne" };

// Page servie par le service worker quand une navigation échoue sans réseau.
// Volontairement sans JavaScript : elle s'affiche même si les chunks ne sont pas en cache.
export default function OfflinePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#FCFCFD] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#0F172A] flex items-center justify-center mb-6 shadow-[0_8px_24px_rgba(60,40,120,0.12)]">
        <span className="text-white font-bold text-2xl leading-none">B</span>
      </div>
      <h1 className="text-2xl font-bold text-[#0F172A] mb-2 tracking-tight">Vous êtes hors ligne</h1>
      <p className="text-[#6B7280] text-[15px] max-w-xs leading-relaxed mb-7">
        Biltia a besoin d&apos;une connexion pour résoudre votre demande. Vérifiez votre réseau, puis réessayez.
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
