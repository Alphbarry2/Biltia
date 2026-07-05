// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT HTML → FICHIER PDF, côté client.
//
// Les documents Biltia (devis, PV, avenants…) sont des feuilles A4 HTML rendues
// dans une iframe (cf. document-generator.ts). Pour « Envoyer au client », il
// faut un vrai fichier PDF joignable (WhatsApp via Web Share, email…) — pas
// juste window.print(). html2pdf.js (html2canvas + jsPDF) rastérise la feuille
// en A4, entièrement dans le navigateur : rien ne quitte l'appareil.
//
// Import dynamique uniquement : la lib touche `window` et ne doit jamais être
// évaluée côté serveur ni peser sur le bundle initial.
// ─────────────────────────────────────────────────────────────────────────────

import { safeFilename } from "./integrations";

/**
 * Convertit le document A4 affiché (document de l'iframe) en fichier PDF.
 * @param sourceDoc document DOM de l'iframe (srcDoc same-origin)
 * @param title     titre humain → nom de fichier (« Devis n°D-2026-014 »)
 */
export async function documentToPdfFile(sourceDoc: Document, title: string): Promise<File> {
  const html2pdf = (await import("html2pdf.js")).default;

  const opts = {
    margin: 0,
    image: { type: "jpeg" as const, quality: 0.95 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      // La capture travaille sur un CLONE du document : on y retire la barre
      // d'outils écran et on remet la feuille à plat (pas d'ombre ni de marge).
      onclone: (cloned: Document) => {
        cloned.querySelector(".biltia-doc-toolbar")?.remove();
        cloned.body.classList.remove("biltia-has-toolbar");
        const style = cloned.createElement("style");
        style.textContent = [
          "body{background:#fff!important;padding:0!important}",
          ".sheet{margin:0 auto!important;box-shadow:none!important;border-radius:0!important}",
          ".sheet+.sheet{page-break-before:always}",
          ".sign-pad{border-color:#CBD5E1!important}",
        ].join("\n");
        cloned.head.appendChild(style);
        // html2canvas ne copie pas le contenu dessiné des <canvas> clonés :
        // on recopie les signatures pixel à pixel depuis l'original.
        const src = sourceDoc.querySelectorAll<HTMLCanvasElement>("canvas.sign-pad");
        cloned.querySelectorAll<HTMLCanvasElement>("canvas.sign-pad").forEach((dst, i) => {
          const from = src[i];
          if (!from || !from.width || !from.height) return;
          dst.width = from.width;
          dst.height = from.height;
          dst.getContext("2d")?.drawImage(from, 0, 0);
        });
      },
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
    pagebreak: { mode: ["css", "legacy"] },
  };

  const blob = await html2pdf().set(opts).from(sourceDoc.body).output("blob");
  return new File([blob], safeFilename(title, "pdf"), { type: "application/pdf" });
}
