import "./globals.css";
import type { Metadata, Viewport } from "next";
import PWARegister from "@/components/pwa-register";

export const metadata: Metadata = {
  applicationName: "Batify",
  title: {
    default: "Batify — l'OS conversationnel du BTP",
    template: "%s · Batify",
  },
  description:
    "Décrivez votre problème, Batify livre la solution : document, application, réponse ou automatisation. L'OS conversationnel du BTP.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Batify",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FAFAF9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
