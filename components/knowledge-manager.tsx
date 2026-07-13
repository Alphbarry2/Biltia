"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Plus,
  Loader2,
  Globe,
  Lock,
  ExternalLink,
  X,
} from "lucide-react";
import { useT } from "@/lib/i18n/context";

type KnowledgeDoc = {
  id: string;
  tenant_id: string | null;
  title: string;
  source_url: string | null;
  source_type: string;
  license: string;
  trade_ids: string[];
  created_at: string;
};

export default function KnowledgeManager() {
  const t = useT();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  // Upload direct de fichiers : .txt/.md/.csv lus ici, .pdf extraits côté serveur.
  async function uploadFiles(files: FileList) {
    setError(null);
    setSuccess(null);
    let ok = 0;
    const list = Array.from(files).slice(0, 10);
    for (const f of list) {
      setUploading(f.name);
      try {
        const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
        let payload: Record<string, unknown>;
        if (isPdf) {
          if (f.size > 3.5 * 1024 * 1024) throw new Error(t(`${f.name} : PDF trop lourd (3,5 Mo max).`, `${f.name}: PDF too large (3.5 MB max).`));
          const data = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(",") + 1)); };
            r.onerror = () => reject(new Error(t("Lecture impossible.", "Read failed.")));
            r.readAsDataURL(f);
          });
          payload = { title: f.name.replace(/\.pdf$/i, ""), file: { name: f.name, mediaType: "application/pdf", data } };
        } else {
          const text = (await f.text()).trim();
          if (!text) throw new Error(t(`${f.name} : fichier vide.`, `${f.name}: empty file.`));
          payload = { title: f.name.replace(/\.(txt|md|csv)$/i, ""), content: text.slice(0, 50000) };
        }
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`${f.name} : ${data.error ?? t("ajout impossible", "add failed")}`);
        ok++;
      } catch (e) {
        setError(e instanceof Error ? e.message : t(`Échec sur ${f.name}.`, `Failed on ${f.name}.`));
        break;
      }
    }
    setUploading(null);
    if (ok > 0) {
      setSuccess(t(`${ok} document${ok > 1 ? "s" : ""} ajouté${ok > 1 ? "s" : ""} et indexé${ok > 1 ? "s" : ""}.`, `${ok} document${ok > 1 ? "s" : ""} added and indexed.`));
      load();
    }
  }

  async function load() {
    try {
      const res = await fetch("/api/knowledge");
      const data = await res.json();
      if (res.ok) setDocs(data.documents ?? []);
    } catch {
      // silencieux : la section reste utilisable même si la liste ne charge pas
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit() {
    setError(null);
    setSuccess(null);
    if (!title.trim() || !content.trim()) {
      setError(t("Le titre et le contenu sont requis.", "Title and content are required."));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          source_url: sourceUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(t(`Document ajouté (${data.chunks} extrait${data.chunks > 1 ? "s" : ""} indexé${data.chunks > 1 ? "s" : ""}).`, `Document added (${data.chunks} chunk${data.chunks > 1 ? "s" : ""} indexed).`));
        setTitle("");
        setSourceUrl("");
        setContent("");
        setShowForm(false);
        load();
      } else {
        setError(data.error ?? t("Ajout impossible.", "Add failed."));
      }
    } catch {
      setError(t("Erreur réseau. Réessayez.", "Network error. Try again."));
    }
    setSubmitting(false);
  }

  const privateDocs = docs.filter((d) => d.tenant_id !== null);
  const globalDocs = docs.filter((d) => d.tenant_id === null);

  return (
    <section className="mt-8">
      <h2 className="text-[10px] font-bold text-[#6E6E6C] uppercase tracking-[0.18em] mb-4">
        {t("Base de connaissances", "Knowledge base")}
      </h2>

      <div className="bg-white border border-[#ECECF2] rounded-2xl p-5 shadow-[0_4px_14px_rgba(60,40,120,0.08)]">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-[#F3EFFC] flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4 h-4 text-[#7C3AED]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0A0A0A]">{t("Sources vérifiées de vos apps", "Verified sources for your apps")}</p>
            <p className="text-xs text-[#6E6E6C]">
              {t("Ajoutez vos propres documents (catalogues de prix, CCTP, mentions légales, modèles de devis). L'IA s'appuie dessus pour générer vos apps et documents, au lieu de deviner.", "Add your own documents (price lists, specifications, legal notices, quote templates). The AI relies on them to generate your apps and documents, instead of guessing.")}
            </p>
          </div>
        </div>

        {success && (
          <div className="mb-4 rounded-xl border border-[#ECECF2] bg-[#F3EFFC] px-4 py-2.5 text-sm text-[#7C3AED]">
            {success}
          </div>
        )}

        {/* Upload direct (recommandé) + saisie manuelle */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.csv,application/pdf,text/plain,text/markdown,text/csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {!showForm && (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(139,92,246,0.35)] transition-all hover:shadow-[0_8px_24px_rgba(139,92,246,0.5)] disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {uploading.slice(0, 28)}…
                </>
              ) : (
                <>{t("Téléverser des fichiers (PDF, TXT, CSV)", "Upload files (PDF, TXT, CSV)")}</>
              )}
            </button>
            <button
              onClick={() => {
                setShowForm(true);
                setSuccess(null);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#ECECF2] bg-white py-2.5 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F3EFFC]"
            >
              <Plus className="h-4 w-4" /> {t("Coller un texte ou une URL", "Paste text or a URL")}
            </button>
          </div>
        )}

        {/* Formulaire d'ajout */}
        {showForm && (
          <div className="rounded-xl border border-[#ECECF2] bg-[#FCFCFD] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6E6E6C]">
                {t("Nouveau document", "New document")}
              </span>
              <button
                onClick={() => setShowForm(false)}
                className="text-[#6E6E6C] hover:text-[#0A0A0A]"
                aria-label={t("Fermer", "Close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#6E6E6C]">
              {t("Titre", "Title")}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Ex : Catalogue de prix 2026", "e.g. 2026 price list")}
              className="mb-3 w-full rounded-xl border border-[#ECECF2] bg-white px-3.5 py-2.5 text-sm text-[#0A0A0A] focus:border-[#7C3AED] focus:outline-none"
            />

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#6E6E6C]">
              {t("Source (URL, optionnel)", "Source (URL, optional)")}
            </label>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
              className="mb-3 w-full rounded-xl border border-[#ECECF2] bg-white px-3.5 py-2.5 text-sm text-[#0A0A0A] focus:border-[#7C3AED] focus:outline-none"
            />

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#6E6E6C]">
              {t("Contenu", "Content")}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={7}
              placeholder={t("Collez ici le texte du document (tarifs, clauses, notes techniques…).", "Paste the document text here (prices, clauses, technical notes…).")}
              className="mb-1 w-full resize-y rounded-xl border border-[#ECECF2] bg-white px-3.5 py-2.5 text-sm text-[#0A0A0A] focus:border-[#7C3AED] focus:outline-none"
            />
            <p className="mb-3 text-xs text-[#6E6E6C]">
              {t(`${content.length.toLocaleString("fr-FR")} / 50 000 caractères`, `${content.length.toLocaleString("en-US")} / 50,000 characters`)}
            </p>

            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <button
              onClick={submit}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("Indexation…", "Indexing…")}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> {t("Indexer le document", "Index the document")}
                </>
              )}
            </button>
          </div>
        )}

        {/* Liste des documents */}
        <div className="mt-5">
          {loading ? (
            <p className="text-sm text-[#6E6E6C]">{t("Chargement…", "Loading…")}</p>
          ) : (
            <>
              {privateDocs.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6E6E6C]">
                    <Lock className="h-3 w-3" /> {t("Vos documents", "Your documents")} ({privateDocs.length})
                  </p>
                  <ul className="space-y-2">
                    {privateDocs.map((d) => (
                      <DocRow key={d.id} doc={d} />
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6E6E6C]">
                  <Globe className="h-3 w-3" /> {t("Bibliothèque Biltia", "Biltia library")} ({globalDocs.length})
                </p>
                {globalDocs.length === 0 ? (
                  <p className="text-xs text-[#6E6E6C]">
                    {t("Aucune fiche indexée pour le moment.", "No entry indexed yet.")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {globalDocs.map((d) => (
                      <DocRow key={d.id} doc={d} />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function DocRow({ doc }: { doc: KnowledgeDoc }) {
  const t = useT();
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-[#ECECF2] bg-white px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#0A0A0A]">{doc.title}</p>
        <p className="text-xs text-[#6E6E6C] capitalize">{doc.source_type}</p>
      </div>
      {doc.source_url && (
        <a
          href={doc.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-[#6E6E6C] hover:text-[#7C3AED]"
          aria-label={t("Ouvrir la source", "Open source")}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </li>
  );
}
