// Génère un slug propre à partir du nom de l'application (pour l'URL publique).
export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // espaces/symboles → tiret
    .replace(/^-+|-+$/g, "") // tirets en trop
    .slice(0, 40);
  return base || "app";
}

// Suffixe court aléatoire pour garantir l'unicité du slug.
export function shortId(len = 5): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
