import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/blog";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Zones applicatives privées, sans intérêt pour l'indexation.
        disallow: ["/dashboard", "/workspace", "/library", "/expert", "/activity", "/settings", "/admin", "/generate", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
