"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Turnstile — anti-bot pour signup/login.
// Sans NEXT_PUBLIC_TURNSTILE_SITE_KEY, le widget ne s'affiche pas et l'auth
// fonctionne sans captcha (à activer aussi côté Supabase : Auth → Attack
// Protection → Turnstile, avec la secret key).
// ─────────────────────────────────────────────────────────────────────────────

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const turnstileEnabled = SITE_KEY.length > 0;

type TurnstileAPI = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileAPI }
}

export type TurnstileHandle = { reset: () => void };

export const Turnstile = forwardRef<TurnstileHandle, {
  onToken: (token: string | null) => void;
  className?: string;
}>(function Turnstile({ onToken, className = "" }, ref) {
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    // À appeler après un échec d'auth : le token Turnstile est à usage unique.
    reset() {
      if (widgetRef.current && window.turnstile) {
        window.turnstile.reset(widgetRef.current);
        onTokenRef.current(null);
      }
    },
  }), []);

  useEffect(() => {
    if (!turnstileEnabled) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || widgetRef.current || !boxRef.current || !window.turnstile) return;
      widgetRef.current = window.turnstile.render(boxRef.current, {
        sitekey: SITE_KEY,
        language: "fr",
        theme: "light",
        size: "flexible",
        callback: (t: string) => onTokenRef.current(t),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      let script = document.getElementById("cf-turnstile") as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = "cf-turnstile";
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }

    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetRef.current); } catch { /* déjà démonté */ }
        widgetRef.current = null;
      }
    };
  }, []);

  if (!turnstileEnabled) return null;
  return <div ref={boxRef} className={className} />;
});
