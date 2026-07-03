"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  ArrowUp,
  ExternalLink,
  BookOpen,
  AlertTriangle,
} from "lucide-react";

import { ENTITIES } from "@/lib/data-entities";

type Source = { title: string; source_url: string | null; similarity: number };

const EXAMPLES = [
  "Quels chantiers sont en retard cette semaine ?",
  "Quelles attestations expirent dans les 30 jours ?",
  "Quelle est l'épaisseur minimum d'une chape sur un dallage de garage ?",
  "Quel taux de TVA pour une rénovation de salle de bain ?",
];

function entityLabel(key: string): string {
  return ENTITIES[key]?.label ?? key;
}

export default function ExpertPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [ragUsed, setRagUsed] = useState(false);
  const [queried, setQueried] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function ask(q?: string) {
    const text = (q ?? question).trim();
    if (!text || loading) return;
    setQuestion(text);
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    setQueried([]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (res.ok) {
        setAnswer(data.answer);
        setSources(data.sources ?? []);
        setRagUsed(!!data.ragUsed);
        setQueried(Array.isArray(data.queried) ? data.queried : []);
      } else {
        setError(data.error ?? "Erreur. Réessayez.");
      }
    } catch {
      setError("Erreur réseau. Réessayez.");
    }
    setLoading(false);
  }

  return (
    <div className="p-6 sm:p-8 max-w-2xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/[0.14] to-pink-500/[0.10]">
          <Sparkles className="h-5 w-5 text-[#7C3AED]" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Copilote BTP</h1>
          <p className="text-sm text-muted-foreground">
            Une question sur vos données (chantiers, échéances) ou sur une norme BTP. Réponses appuyées sur votre workspace et des sources vérifiées.
          </p>
        </div>
      </div>

      {/* Zone de saisie */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-depth-1">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
          }}
          rows={3}
          placeholder="Ex : quels chantiers sont en retard ? ou : quelle épaisseur minimum pour une chape ?"
          className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">1 crédit par question</span>
          <button
            onClick={() => ask()}
            disabled={loading || !question.trim()}
            className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Recherche…
              </>
            ) : (
              <>
                Demander <ArrowUp className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Exemples */}
      {!answer && !loading && (
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => ask(ex)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Réponse */}
      {answer && (
        <div className="mt-6">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-depth-1">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{answer}</p>
          </div>

          {queried.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <BookOpen className="h-3 w-3" /> Données consultées
              </p>
              <div className="flex flex-wrap gap-2">
                {queried.map((k) => (
                  <span
                    key={k}
                    className="rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-medium text-accent-deep"
                  >
                    {entityLabel(k)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {sources.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <BookOpen className="h-3 w-3" /> Sources (normes)
              </p>
              <ul className="space-y-2">
                {sources.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5"
                  >
                    <span className="truncate text-sm text-foreground">{s.title}</span>
                    {s.source_url && (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-muted-foreground hover:text-accent-deep"
                        aria-label="Ouvrir la source"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sources.length === 0 && queried.length === 0 && !ragUsed && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                Aucune source vérifiée n&apos;a été trouvée pour cette question. Enrichissez votre
                base de connaissances (Paramètres) et vérifiez toute valeur auprès d&apos;un
                professionnel.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
