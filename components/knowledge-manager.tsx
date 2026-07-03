"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Plus,
  Loader2,
  Globe,
  Lock,
  ExternalLink,
  X,
} from "lucide-react";

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
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");

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
      setError("Le titre et le contenu sont requis.");
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
        setSuccess(`Document ajouté (${data.chunks} extrait${data.chunks > 1 ? "s" : ""} indexé${data.chunks > 1 ? "s" : ""}).`);
        setTitle("");
        setSourceUrl("");
        setContent("");
        setShowForm(false);
        load();
      } else {
        setError(data.error ?? "Ajout impossible.");
      }
    } catch {
      setError("Erreur réseau. Réessayez.");
    }
    setSubmitting(false);
  }

  const privateDocs = docs.filter((d) => d.tenant_id !== null);
  const globalDocs = docs.filter((d) => d.tenant_id === null);

  return (
    <section className="mt-8">
      <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-4">
        Base de connaissances
      </h2>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-depth-1">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4 h-4 text-accent-deep" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Sources vérifiées de vos apps</p>
            <p className="text-xs text-muted-foreground">
              Ajoutez vos propres documents (catalogues de prix, CCTP, mentions légales, modèles de
              devis). L&apos;IA s&apos;appuie dessus pour générer vos apps et documents, au lieu de
              deviner.
            </p>
          </div>
        </div>

        {success && (
          <div className="mb-4 rounded-xl border border-border bg-accent-soft px-4 py-2.5 text-sm text-accent-deep">
            {success}
          </div>
        )}

        {/* Bouton d'ouverture du formulaire */}
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setSuccess(null);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent-soft"
          >
            <Plus className="h-4 w-4" /> Ajouter un document
          </button>
        )}

        {/* Formulaire d'ajout */}
        {showForm && (
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Nouveau document
              </span>
              <button
                onClick={() => setShowForm(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Titre
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Catalogue de prix 2026"
              className="mb-3 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
            />

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Source (URL, optionnel)
            </label>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
              className="mb-3 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
            />

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Contenu
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={7}
              placeholder="Collez ici le texte du document (tarifs, clauses, notes techniques…)."
              className="mb-1 w-full resize-y rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
            />
            <p className="mb-3 text-xs text-muted-foreground">
              {content.length.toLocaleString("fr-FR")} / 50 000 caractères
            </p>

            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <button
              onClick={submit}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Indexation…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Indexer le document
                </>
              )}
            </button>
          </div>
        )}

        {/* Liste des documents */}
        <div className="mt-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <>
              {privateDocs.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Lock className="h-3 w-3" /> Vos documents ({privateDocs.length})
                  </p>
                  <ul className="space-y-2">
                    {privateDocs.map((d) => (
                      <DocRow key={d.id} doc={d} />
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Globe className="h-3 w-3" /> Bibliothèque Batify ({globalDocs.length})
                </p>
                {globalDocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucune fiche indexée pour le moment.
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
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
        <p className="text-xs text-muted-foreground capitalize">{doc.source_type}</p>
      </div>
      {doc.source_url && (
        <a
          href={doc.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-muted-foreground hover:text-accent-deep"
          aria-label="Ouvrir la source"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </li>
  );
}
