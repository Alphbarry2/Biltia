# Bibliothèque de connaissances Biltia (corpus RAG global)

Chaque fichier `.md` de ce dossier (sauf ce README) est une **fiche curée**
ingérée dans la bibliothèque **globale** du RAG (`knowledge_documents.tenant_id IS NULL`).

## Règles de rédaction (garde-fou juridique)

- **Aucun texte normatif verbatim.** Les DTU (CSTB), normes NF (AFNOR) et Eurocodes
  sont sous copyright. On reformule des **faits** (taux, seuils, valeurs usuelles,
  obligations) dans nos propres mots, avec une **URL de source publique gratuite**.
- Toujours renseigner le frontmatter (voir ci-dessous).
- Rester prudent : une fiche indique l'ordre de grandeur / la règle générale et
  renvoie à la source officielle pour la valeur exacte en vigueur.

## Frontmatter attendu

```
---
title: Titre lisible de la fiche
source_url: https://source-publique-gratuite
source_type: reglementaire   # guide | reglementaire | catalogue | fiscal | aide | interne
license: public
trade_ids: electricite_generale, photovoltaique   # ids de lib/btp-catalog (vide = transverse)
---
```

Le corps qui suit le second `---` est le contenu vectorisé.

## Ingestion

```
npm run ingest:knowledge
```

(nécessite `MISTRAL_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`).
Idempotent : une fiche inchangée (même checksum) est ignorée.
