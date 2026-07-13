// ─────────────────────────────────────────────────────────────────────────────
// BLOG — traductions EN.
//
// CHOIX D'ARCHI (cohérent avec tout le reste du produit) : MÊME URL, bascule par
// COOKIE. Le blog est un actif SEO FRANÇAIS ; un robot d'indexation n'envoie pas
// de cookie → il reçoit TOUJOURS le français, donc le référencement FR est
// intact et il n'y a ni URLs /en à créer ni contenu dupliqué. Un visiteur qui a
// choisi l'anglais lit l'article en anglais, à la même adresse.
//
// Seul le TEXTE est traduit. `slug`, `date`, `updated`, `readingMinutes` et
// `relatedProduct` restent partagés avec la source FR (lib/blog.ts) : ce sont des
// identifiants / métadonnées, pas du contenu.
//
// Le corpus EN est découpé en plusieurs fichiers (lib/blog-en/*) uniquement pour
// pouvoir être traduit en parallèle sans conflit d'écriture.
// ─────────────────────────────────────────────────────────────────────────────

import type { BlogPost, FAQ, Section } from "./blog";
import type { Locale } from "./i18n/config";
import { BLOG_EN_1 } from "./blog-en/part1";
import { BLOG_EN_2 } from "./blog-en/part2";
import { BLOG_EN_3 } from "./blog-en/part3";
import { BLOG_EN_4 } from "./blog-en/part4";

/** Champs TEXTE d'un article, en anglais. Le reste est repris de la source FR. */
export type BlogPostEn = {
  title: string;
  description: string;
  category: string;
  keywords: string[];
  excerpt: string;
  intro: string;
  sections: Section[];
  takeaways: string[];
  faq: FAQ[];
  cta: string;
};

/** Corpus EN complet, indexé par slug. */
export const BLOG_EN: Record<string, BlogPostEn> = {
  ...BLOG_EN_1,
  ...BLOG_EN_2,
  ...BLOG_EN_3,
  ...BLOG_EN_4,
};

/** Article dans la langue de l'interface (repli sur le FR si non traduit). */
export function localizePost(post: BlogPost, locale: Locale): BlogPost {
  if (locale !== "en") return post;
  const en = BLOG_EN[post.slug];
  return en ? { ...post, ...en } : post;
}
