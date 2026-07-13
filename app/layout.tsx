import "./globals.css";
import type { Metadata, Viewport } from "next";
import PWARegister from "@/components/pwa-register";
import NativeShell from "@/components/native-shell";
import { DemoBookingProvider } from "@/components/demo-booking";
import { LocaleProvider } from "@/lib/i18n/context";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// Métadonnées LOCALISÉES : le titre d'onglet et la description suivent la langue
// choisie (cookie). Un robot d'indexation n'a pas de cookie → il reçoit le FR,
// qui reste la version de référence pour le SEO (pas d'URLs /en aujourd'hui).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.biltia.com",
    ),
    applicationName: "Biltia",
    title: {
      default: pick(
        locale,
        "Biltia — l'OS conversationnel du BTP",
        "Biltia — the conversational OS for construction",
      ),
      template: "%s · Biltia",
    },
    description: pick(
      locale,
      "Décrivez votre problème, Biltia livre la solution : document, application, réponse ou automatisation. L'OS conversationnel du BTP.",
      "Describe your problem, Biltia delivers the solution: a document, an app, an answer or an automation. The conversational OS for construction.",
    ),
    ...BASE_METADATA,
  };
}

const BASE_METADATA: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Biltia",
  },
  // Icône d'accueil iOS : sans apple-touch-icon, iOS génère une vignette de mauvaise
  // qualité (capture d'écran). On pointe l'icône maskable haute résolution.
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FAFAF9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Le clavier virtuel REDIMENSIONNE la mise en page (au lieu de flotter par-dessus)
  // → l'input de chat reste visible au-dessus du clavier, plus de champ caché.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Langue choisie (cookie), lue côté serveur → <html lang> correct dès le SSR
  // et pas de flash de langue au chargement pour qui a déjà choisi l'anglais.
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider initial={locale}>
          <DemoBookingProvider>
            {children}
          </DemoBookingProvider>
        </LocaleProvider>
        <NativeShell />
        <PWARegister />
      </body>
    </html>
  );
}
