export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden"
      style={{
        background: "radial-gradient(ellipse 80% 60% at 20% -10%, rgba(139,92,246,0.4) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 10%, rgba(109,40,217,0.25) 0%, transparent 55%), #030305",
      }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="animate-glow absolute top-[-5%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full"
          style={{ background: "radial-gradient(ellipse at center, rgba(139,92,246,0.18) 0%, transparent 65%)" }} />
      </div>

      <div className="relative w-full max-w-sm">
        <a href="/" className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center shadow-[0_4px_16px_rgba(139,92,246,0.45)]">
            <span className="text-white font-display font-bold text-base leading-none">B</span>
          </div>
          <span className="font-display font-bold text-foreground text-xl">Batify</span>
        </a>
        {children}
      </div>
    </div>
  );
}
