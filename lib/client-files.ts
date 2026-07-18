// ─────────────────────────────────────────────────────────────────────────────
// FICHIERS JOINTS CÔTÉ CLIENT — contrat PARTAGÉ entre les deux points d'entrée
// qui peuvent joindre un fichier à une demande : le composeur de /generate et
// la barre de création rapide du tableau de bord (qui, elle, navigue vers
// /generate avant d'exécuter — le fichier doit donc survivre au changement de
// page). Les deux DOIVENT produire exactement la même forme : un `AttachedFile`
// avec les données en base64 pur, sans quoi un fichier joint depuis l'un des
// deux points d'entrée se perd en route et la demande repart sans lui (bug
// confirmé : la barre du tableau de bord ne transmettait que le NOM du fichier
// en texte, jamais son contenu — Biltia répondait donc à l'aveugle).
//
// Miroir de lib/vision.ts (types acceptés, taille max) côté serveur.
// ─────────────────────────────────────────────────────────────────────────────

export type AttachedFile = { name: string; mediaType: string; data: string; size: number };

export const ACCEPTED_FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const MAX_FILES_CLIENT = 5;
export const MAX_FILE_BYTES_CLIENT = 3.5 * 1024 * 1024;

/** Lit un fichier en base64 pur (sans préfixe data-URL). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result);
      const comma = res.indexOf(",");
      resolve(comma !== -1 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}
