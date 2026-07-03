import type { MetadataRoute } from "next";

// Manifest PWA — servi par Next sur /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Batify — l'OS du BTP",
    short_name: "Batify",
    description:
      "Décrivez votre problème, Batify livre la solution : document, application, réponse ou automatisation.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "fr",
    dir: "ltr",
    background_color: "#FAFAF9",
    theme_color: "#FAFAF9",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nouvelle demande", short_name: "Créer", url: "/generate" },
      { name: "Tableau de bord", short_name: "Dashboard", url: "/dashboard" },
    ],
  };
}
