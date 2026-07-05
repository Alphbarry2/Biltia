import type { MetadataRoute } from "next";
import { BLOG_POSTS, SITE_URL } from "@/lib/blog";
import { PRODUCTS } from "@/lib/products";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/tarifs`, changeFrequency: "monthly", priority: 0.7 },
  ];

  const productPages: MetadataRoute.Sitemap = PRODUCTS.map((p) => ({
    url: `${SITE_URL}/produits/${p.slug}`,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const blogPages: MetadataRoute.Sitemap = BLOG_POSTS.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.updated ?? p.date),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...productPages, ...blogPages];
}
