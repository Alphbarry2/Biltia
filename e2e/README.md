# E2E — parcours vertical de l'agent

Éprouve la première mission opérationnelle complète :

> « Décale le chantier Dupont de trois jours, déplace les tâches associées et préviens l'équipe. »

## Ce qui est RÉEL (couche déterministe, `e2e/vertical-slice.e2e.mjs`)

Le VRAI code d'orchestration tourne, importé tel quel via un resolve hook ESM
(`e2e/loader.mjs`, uniquement pour les tests) :

- `runAgentLoop` (boucle agentique, confirmGate, vérification post-action) ;
- `workspace_search` (recherche canonique tolérante) ;
- `runAgentTool` / `runWorkspaceTool` (lectures + écritures, tenant forcé, colonnes whitelistées) ;
- `executeConfirmedPlan` (exécution du plan confirmé — **le même code que `/api/generate`**) ;
- `verifyAction` / `buildVerifiedReport` (relecture + compte rendu déterministe honnête).

Sont **simulés** (par conception) :

- **le modèle** : `client.messages.create` est remplacé par un modèle scripté qui
  réagit aux **vrais** résultats d'outils (il ne connaît pas les ids à l'avance) ;
- **la base** : Supabase en mémoire fidèle (`e2e/fake-supabase.mjs`), tenant forcé
  par le code via `.eq("tenant_id", …)` ;
- **le transport** email/SMS : aucun envoi réel (`e2e/stubs/`), renvoie
  « accepté / non livré ».

Les **dates** attendues sont calculées **par le test** (décalage de 3 jours
calendaires) — le modèle ne décide jamais la règle de calcul.

## Ce qui N'EST PAS couvert ici (limites d'environnement, cf. rapport)

- La **route HTTP** `/api/generate` complète (auth GoTrue, crédits, classifieur) et
  la **RLS Postgres réelle** exigent Docker/Postgres — **absents de cet
  environnement**. La logique d'orchestration testée est le vrai code ; l'enveloppe
  HTTP/auth ne l'est pas.
- Un run « base réelle » utiliserait `supabase/baselines/e2e-current-public.sql`
  (baseline **contractuel**, pas un clone de prod).

## Lancer

```bash
node --test --experimental-strip-types --import ./e2e/register.mjs e2e/*.e2e.mjs
```
