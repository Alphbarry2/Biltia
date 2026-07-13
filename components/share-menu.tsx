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
// Une seule action sort de l'appareil : « Enregistrer dans Google Drive ». Elle
// remonte les octets du PDF à /api/drive, parce que le jeton Google ne descend
// JAMAIS jusqu'au navigateur — seul le serveur classe le fichier. Elle n'apparaît
// que si l'utilisateur a réellement connecté Drive.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Share2, MessageCircle, Mail, Download, HardDrive } from "lucide-react";
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
  folder = null,
}: {
  /** Document DOM de l'iframe d'aperçu (null si pas encore rendue). */
  getDocument: () => Document | null;
  /** Titre humain du document (nom de fichier + message). */
  title: string;
  /** Chantier de rattachement : sert de sous-dossier Drive. */
  folder?: string | null;
}) {
  const t = useT();
  // Détection Web Share après montage (évite tout écart d'hydratation).
  const [nativeShare, setNativeShare] = useState(false);
  useEffect(() => {
    const probe = new File([""], "probe.pdf", { type: "application/pdf" });
    setNativeShare(canShareFiles([probe]));
  }, []);

  // Drive n'est proposé que s'il est connecté ET autorisé à écrire. Proposer
  // une action qui échouera est pire que ne pas la proposer du tout.
  const [driveReady, setDriveReady] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/drive")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (alive && s?.connected && s?.canFile) setDriveReady(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
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

  if (driveReady) {
    actions.push({
      key: "drive",
      label: t("Enregistrer dans Google Drive", "Save to Google Drive"),
      hint: folder
        ? t(`Rangé dans Biltia / ${folder}`, `Filed under Biltia / ${folder}`)
        : t("Rangé dans Biltia / Documents", "Filed under Biltia / Documents"),
      icon: <HardDrive className="h-3.5 w-3.5" />,
      run: async () => {
        const file = await makePdf();
        const body = new FormData();
        body.append("file", file);
        if (folder) body.append("folder", folder);

        const res = await fetch("/api/drive", { method: "POST", body });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; url?: string; folder?: string; updated?: boolean; error?: string }
          | null;

        if (!res.ok || !json?.ok) {
          throw new Error(
            json?.error ?? t("Le classement dans Drive a échoué.", "Filing to Drive failed.")
          );
        }

        // Le PDF est chez lui, pas dans un dossier « Téléchargements ». On le lui
        // ouvre : sans ça, « c'est enregistré » ne veut rien dire de vérifiable.
        if (json.url) window.open(json.url, "_blank", "noopener");

        const where = `Biltia / ${json.folder}`;
        return json.updated
          ? t(`Mis à jour dans ${where}.`, `Updated in ${where}.`)
          : t(`Classé dans ${where}.`, `Filed in ${where}.`);
      },
    });
  }

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
