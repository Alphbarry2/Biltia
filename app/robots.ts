import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/blog";

// Zones applicatives privées, sans intérêt pour l'indexation (les mêmes pour
// tous les robots, humains comme IA).
const PRIVATE = ["/dashboard", "/workspace", "/library", "/expert", "/activity", "/settings", "/admin", "/generate", "/api/"];

// Robots des moteurs génératifs qui CITENT leurs sources (ChatGPT Search,
// Perplexity, Google AI Overviews, Claude…). On les accueille explicitement :
// c'est la porte d'entrée pour être RECOMMANDÉ dans leurs réponses. Techniquement
// « * » les couvre déjà, mais l'accueil est ici écrit noir sur blanc et pilotable.
const AI_BOTS = [
  "OAI-SearchBot", "ChatGPT-User", "GPTBot",        // OpenAI (recherche, navigation, entraînement)
  "PerplexityBot", "Perplexity-User",               // Perplexity
  "Google-Extended",                                 // Gemini / AI Overviews (grounding)
  "Applebot-Extended",                               // Apple Intelligence
  "ClaudeBot", "Claude-User", "anthropic-ai",       // Anthropic / Claude
  "cohere-ai", "Amazonbot", "DuckAssistBot",        // Cohere, Amazon, DuckDuckGo
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_BOTS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
