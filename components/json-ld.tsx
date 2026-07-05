// Server Component : injecte des données structurées Schema.org (JSON-LD).
// Lu par Google (rich results, AI Overviews) et par les LLM pour comprendre
// et recommander le contenu. Rendu côté serveur, aucun JS client.

export default function JsonLd({ data }: { data: object | object[] }) {
  const graph = Array.isArray(data) ? data : [data];
  return (
    <>
      {graph.map((node, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Le contenu provient de nos propres données statiques (lib/blog.ts).
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
        />
      ))}
    </>
  );
}
