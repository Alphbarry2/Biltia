"use client";

// ─────────────────────────────────────────────────────────────────────────────
// « Envoyer au client » — partage d'un document généré (devis, PV, avenant…).
//
// Le document HTML A4 est converti en vrai PDF dans le navigateur, puis :
//   · mobile  → feuille de partage native (API Web Share) : l'artisan choisit
//               WhatsApp / SMS / Mail et le PDF est réellement JOINT ;
//   · partout → WhatsApp avec message pré-rempli (wa.me ne joint pas de
//               fichier : sur desktop le PDF est téléchargé à côté),
//               email pré-rempli (mailto:), ou simple téléchargement.
//
// AUCUNE action ne sort vers un stockage externe : le connecteur Drive/OneDrive a
// été retiré. Le document reste chez Biltia, et l'artisan le partage lui-même.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Share2, MessageCircle, Mail, Download } from "lucide-react";
import { ActionMenu, type ActionItem } from "./action-menu";
import {
  buildDocMessage,
  buildMailtoUrl,
  buildWhatsAppUrl,
  canShareFiles,
  downloadBlob,
} from "@/lib/integrations";
import { documentToPdfFile } from "@/lib/pdf-share";
import { useT } from "@/lib/i18n/context";

export function ShareMenu({
  getDocument,
  title,
}: {
  /** Document DOM de l'iframe d'aperçu (null si pas encore rendue). */
  getDocument: () => Document | null;
  /** Titre humain du document (nom de fichier + message). */
  title: string;
}) {
  const t = useT();
  // Détection Web Share après montage (évite tout écart d'hydratation).
  const [nativeShare, setNativeShare] = useState(false);
  useEffect(() => {
    const probe = new File([""], "probe.pdf", { type: "application/pdf" });
    setNativeShare(canShareFiles([probe]));
  }, []);

  const makePdf = async () => {
    const doc = getDocument();
    if (!doc) throw new Error(t("Le document n'est pas encore affiché. Réessayez.", "The document isn't displayed yet. Try again."));
    return documentToPdfFile(doc, title);
  };

  const message = buildDocMessage({ docTitle: title });

  const actions: ActionItem[] = [];

  if (nativeShare) {
    actions.push({
      key: "share",
      label: t("Partager le PDF", "Share the PDF"),
      hint: t("WhatsApp, SMS, email… le PDF est joint", "WhatsApp, SMS, email… the PDF is attached"),
      icon: <Share2 className="h-3.5 w-3.5" />,
      run: async () => {
        const file = await makePdf();
        try {
          await navigator.share({ files: [file], title, text: message });
        } catch (e) {
          // Partage annulé par l'utilisateur → silencieux. Refusé par le
          // navigateur (activation expirée) → on retombe sur le téléchargement.
          if (e instanceof DOMException && e.name === "AbortError") return;
          downloadBlob(file, file.name);
          return t("Partage indisponible : le PDF a été téléchargé à la place.", "Sharing unavailable: the PDF was downloaded instead.");
        }
      },
    });
  }

  actions.push(
    {
      key: "whatsapp",
      label: "WhatsApp",
      hint: nativeShare
        ? t("Message prêt à envoyer (PDF via « Partager »)", "Message ready to send (PDF via “Share”)")
        : t("Message prêt + PDF téléchargé à joindre", "Message ready + PDF downloaded to attach"),
      icon: <MessageCircle className="h-3.5 w-3.5" />,
      run: async () => {
        if (!nativeShare) {
          // Desktop (WhatsApp Web) : on met le PDF sous la main de l'utilisateur.
          const file = await makePdf();
          downloadBlob(file, file.name);
          window.open(buildWhatsAppUrl(message), "_blank", "noopener");
          return t("PDF téléchargé — glissez-le dans la conversation WhatsApp.", "PDF downloaded — drag it into the WhatsApp chat.");
        }
        window.open(buildWhatsAppUrl(message), "_blank", "noopener");
      },
    },
    {
      key: "email",
      label: t("Par email", "By email"),
      hint: t("Email pré-rempli + PDF téléchargé à joindre", "Pre-filled email + PDF downloaded to attach"),
      icon: <Mail className="h-3.5 w-3.5" />,
      run: async () => {
        const file = await makePdf();
        downloadBlob(file, file.name);
        window.location.href = buildMailtoUrl({ subject: title, body: message });
        return t("PDF téléchargé — joignez-le à l'email qui vient de s'ouvrir.", "PDF downloaded — attach it to the email that just opened.");
      },
    },
    {
      key: "download",
      label: t("Télécharger le PDF", "Download the PDF"),
      icon: <Download className="h-3.5 w-3.5" />,
      run: async () => {
        const file = await makePdf();
        downloadBlob(file, file.name);
      },
    }
  );


  return (
    <ActionMenu
      label={t("Envoyer", "Send")}
      title={t("Envoyer au client (WhatsApp, email, PDF)", "Send to client (WhatsApp, email, PDF)")}
      icon={<Share2 className="h-3.5 w-3.5" />}
      actions={actions}
      buttonClassName="flex items-center gap-1.5 px-3 py-1.5 bg-[#F3EFFC] text-[#7C3AED] border border-[#E2D9F8] text-xs font-semibold rounded-lg hover:bg-[#EAE2FA] hover:border-[#C9BEF0] transition-all"
    />
  );
}
