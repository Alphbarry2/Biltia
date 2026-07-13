# Audit des coûts réels de Biltia — 13/07/2026

Audit établi **par lecture du code de production**, recoupé avec la table `ai_usage`
(coûts réellement facturés par OpenRouter) et les tarifs publics des fournisseurs
vérifiés en direct le 13/07/2026. **Aucune estimation théorique.**

Ce document ne contient **aucune recommandation de pricing**. Il décrit uniquement
ce que coûte le fonctionnement du produit.

---

## 0. Socle : ce qui tourne réellement en production

### 0.1 Les modèles (résolus depuis `.env.local` + `lib/models.ts`)

**Aucun appel Anthropic en production.** Les cinq paliers pointent tous vers OpenRouter
(`lib/llm.ts` : tout identifiant contenant un `/` part chez OpenRouter). Les prix
Anthropic du catalogue ne sont plus qu'un repli mort.

| Palier | Modèle réel | Prix catalogue (code) | Prix RELEVÉ (facture OpenRouter) | Usage |
|---|---|---|---|---|
| `MODEL_KIND` | `qwen/qwen3.5-flash-02-23` | 0,07 / 0,26 | 0,065 / 0,26 (opérateur unique) | Classification |
| `TIER_SIMPLE` | `mistralai/mistral-medium-3.1` | 0,43 / 2,15 | 0,40 / 2,00 (opérateur unique) | Questionnaire, e-mails d'agent |
| `TIER_MEDIUM` | `deepseek/deepseek-v4-pro` | **1,74 / 3,48** | **0,435 / 0,87** ⚠️ | Apps, copilote, documents, agents |
| `TIER_COMPLEX` | `deepseek/deepseek-v4-pro` | **1,74 / 3,48** | **0,435 / 0,87** ⚠️ | Idem |
| `MODEL_VISION` | `qwen/qwen3-vl-235b-a22b-instruct` | 0,25 / 1,12 | 0,20–0,30 / 0,88–1,90 | Vision, OCR |
| (secondaire) | `deepseek/deepseek-v4-flash` | 0,08 / 0,15 | **0,14 / 0,28** ⚠️ | Peu utilisé |

*(USD par million de tokens, entrée / sortie.)*

### 0.2 ⚠️ Le catalogue se trompe sur le modèle central, dans les deux sens

`lib/llm.ts` force `usage.include = true` : OpenRouter renvoie donc le **montant réellement
facturé**, et `trackAiUsage` l'enregistre tel quel. Les trois lignes DeepSeek V4 Pro de
`ai_usage` (13/07, 14 h 15 – 15 h 25) portent ce relevé réel :

| Action | Tokens in / out | Coût **enregistré** | Si catalogue (1,74/3,48) | Si endpoint DeepSeek (0,435/0,87) |
|---|---|---|---|---|
| `create_app` | 28 091 / 13 444 | **0,023775 $** | 0,095663 $ | 0,023916 $ ✅ |
| `classify_kind` | 3 432 / 177 | **0,001630 $** | 0,006588 $ | 0,001647 $ ✅ |
| `classify_kind` | 428 / 177 | **0,000338 $** | 0,001361 $ | 0,000340 $ ✅ |

**Conclusion : on paie 4× MOINS que ce que le code croit.** Malgré `sort: "throughput"`,
OpenRouter route vers l'endpoint DeepSeek natif (0,435/0,87), pas vers Fireworks/Together.
Le commentaire de `lib/models.ts:311-328`, qui affirme l'inverse, est démenti par les seuls
relevés réels disponibles.

*Contre-épreuve :* les lignes **DeepSeek Flash** collent *exactement* au catalogue
(0,08/0,15 → 0,001922 $ au centime près). Elles ne sont donc **pas** relevées : ces chemins
ne passent pas `realCostUsd`. Or le vrai prix de Flash est 0,14/0,28 → **sous-estimé de 1,8×**.

> **Tout le reste de cet audit donne deux colonnes :**
> **« relevé »** (0,435/0,87 — ce qu'on paie vraiment aujourd'hui) et
> **« pire cas »** (1,74/3,48 — si OpenRouter bascule sur un opérateur rapide et cher).
> Le pire cas n'est pas théorique : il suffit que l'endpoint DeepSeek sature.

### 0.3 Ce qui ne coûte RIEN en IA (vérifié par grep sur tout le dépôt)

| Domaine | Appels LLM |
|---|---|
| CRUD workspace, recherche, filtres | **0** |
| Import CSV / Excel (même 1 000 lignes) | **0** — matching de chaînes (`lib/import-map.ts`) |
| Export CSV / XLSX | **0** |
| Facture depuis devis | **0** — TypeScript pur (`workspace-transforms.ts:254`) |
| Rendu PDF devis/facture | **0** — `@react-pdf/renderer`, vectoriel, pas de Chromium |
| Formulaire public (affichage + soumission) | **0** |
| Les **51 veilleurs d'agents** (détection) | **0** — SQL pur, 1 seul veilleur utilise l'IA |
| Modification d'un agent | **0** — UPDATE SQL |
| Notifications push (VAPID) | **0** |
| Localisation FR/EN de l'intérieur des apps | **0** — dictionnaire |

**Le cœur métier de Biltia est déterministe et quasi gratuit.** Le coût est concentré
sur trois surfaces : **la génération d'apps, la boucle agentique, et la vision.**

---

## 1. COPILOTE

### Workflow réel

⚠️ Le copilote de production **n'est pas** `/api/ask` (route morte, aucun appelant).
C'est la branche `kind === "answer"` de `/api/generate`.

```
Utilisateur
  ↓ heuristique client (gratuite)
  ↓ [si "module"] classification qwen3.5-flash ......... 0,0003 $
  ↓ [si "module"] questionnaire mistral-medium ........ 0,0017 $
  ↓ classification qwen3.5-flash (REFAITE de zéro) .... 0,0003 $
  ↓ embedding OpenAI (TOUJOURS, même pour « bonjour ») . 0,00002 $
  ↓ recherche RAG pgvector (6 chunks) ................. ~0 $
  ↓ contexte workspace + pilotage (4 requêtes SQL) .... 0 $
  ↓ RÉPONSE — deepseek-v4-pro si workspace non vide,
  ↓           mistral-medium sinon — max_tokens 800
  ↓ sauvegarde (ai_usage + activity_logs + app_events)
Réponse
```

### Coûts

| Scénario | Appels LLM | Tokens in | Tokens out | **Relevé** | **Pire cas** |
|---|---|---|---|---|---|
| Question simple (workspace vide) | 1 | 1 090 | 300 | **0,0011 $** | 0,0011 $ |
| Question moyenne (workspace peuplé) | 1–3 | 2 000 | 400 | **0,0012 $** | 0,0049 $ |
| Question complexe (RAG + 5 métiers + pilotage) | 1–3 | 6 500 | 800 | **0,0035 $** | 0,0141 $ |
| Question complexe MAX (12 familles + EN) | 3 | 7 910 | 800 | **0,0041 $** | 0,0166 $ |
| Question mal classée (double classification) | 3–4 | +5 700 | +760 | **+0,0022 $** | +0,0022 $ |
| Conversation avec documents | 2 | image + 3 300 | ≤ 2 128 | **0,0051 $** | 0,0058 $ |

### Faits marquants

1. **Une conversation longue ne coûte pas plus cher.** `generate:1879` n'envoie que le
   message courant : `messages: [{ role: "user", content: prompt }]`. L'historique n'est
   **jamais** relu (`lib/conversations.ts` écrit en base sans jamais relire).
   **Le 30ᵉ message coûte exactement ce que coûte le 1ᵉʳ.**
2. **Le fixe écrase le variable.** Une question de 60 caractères (~17 tokens) déclenche un
   prompt système de 3 800 à 28 500 caractères. **Le texte de l'utilisateur pèse < 1 % du coût.**
3. **Double classification** : tout message classé `module` par l'heuristique paie
   `classify_kind` **deux fois** à l'identique (`/api/clarify:164` puis `/api/generate:1064`),
   sans que rien ne transite entre les deux. ~3 058 tokens gaspillés.
4. **L'embedding est inconditionnel** : appel HTTP OpenAI sur le chemin critique de chaque
   message, même quand la base de connaissances est **vide** (elle l'est : 0 chunk en prod).

---

## 2. APPLICATIONS

### Workflow

```
Demande → classification → [questionnaire] → contexte workspace + entités
  → GÉNÉRATION deepseek-v4-pro, max_tokens 16 000
     ↳ boucle de continuation MAX_TURNS = 4 (renvoie TOUT à chaque tour)
  → validation → [passe de réparation des liaisons : renvoie TOUT le HTML]
  → injection du runtime Biltia (33 747 car.) → sauvegarde (module + version)
```

### Coûts

| Scénario | Appels LLM | Tokens in | Tokens out | **Relevé** | **Pire cas** |
|---|---|---|---|---|---|
| **Création simple** | 2 | 28 000 | 13 000 | **0,024 $** ✅ *(mesuré)* | 0,096 $ |
| **Création moyenne** | 2–4 | 45 000 | 30 000 | **0,046 $** | 0,183 $ |
| **Création complexe** | 3–9 | 110 000 | 45 000 | **0,087 $** | 0,348 $ |
| Création complexe MAX | 9 | 250 000 | 64 000 | **0,164 $** | 0,658 $ |
| **Modification simple** | 2 | 46 000 | 6 000 | **0,025 $** | 0,101 $ |
| **Modification moyenne** | 2–4 | 110 000 | 25 000 | **0,070 $** | 0,278 $ |
| **Modification complexe** | jusqu'à 13 | 215 000 | 55 000 | **0,141 $** | 0,566 $ |
| Modification complexe MAX | 13 | 400 000 | 100 000 | **0,261 $** | 1,044 $ |
| **Auto-fix** | 1–8 | 90 000 | 20 000 | **0,057 $** | 0,226 $ |

✅ La ligne « création simple » n'est pas estimée : c'est la facture OpenRouter réelle
enregistrée en base (0,023775 $ pour 28 091 / 13 444 tokens).

### Trois causes structurelles de surcoût

1. **`MAX_TOKENS = 16 000` est en dessous de ce qu'une app pèse.** Sortie médiane mesurée :
   15 056 tokens ; max 21 847. La génération **heurte la limite en régime normal** → la boucle
   de continuation (`MAX_TURNS = 4`) se déclenche, et **chaque tour refacture l'intégralité du
   prompt système et du HTML**. C'est ce qui produit les 212 539 tokens d'entrée observés en base.
2. **Le prompt système fait 61 617 caractères (~16 200 tokens)**, dont **84 % pour le seul bloc
   `BUILD_RULES`** (51 634 car.). Le `cache_control: ephemeral` posé dans le code **ne sert à
   rien** : il n'est honoré que par Anthropic, qui n'est plus appelé.
3. **~8 900 tokens gaspillés par modification.** Le runtime Biltia (SDK + graphiques + composants
   = 33 747 car.) est injecté dans le HTML sauvegardé, puis **renvoyé tel quel au modèle** à
   chaque édition, et refacturé à chaque tour de continuation.

**Effet de bord :** la règle « petite app → modèle moins cher » (seuil 60 000 car.,
`generate:79`) est **morte** : les 10 apps phares pèsent 79 700 à 116 764 caractères une fois
sauvegardées. Tout passe par la branche lourde. *(Sans effet aujourd'hui, `TIER_MEDIUM` et
`TIER_COMPLEX` pointant sur le même modèle — mais le jour où vous les différenciez, la règle
ne s'appliquera jamais.)*

### Coûts annexes

- **7 à 9 requêtes Supabase** par génération.
- **Stockage : 80–117 Ko écrits par sauvegarde**, et `snapshotModuleVersion` est appelé **deux
  fois** dans `modules/save`. Croissance linéaire par édition.
- **Vercel : SSE tenu ouvert jusqu'à 300 s** — la mémoire provisionnée est facturée pendant
  toute l'attente du LLM. C'est le poste Vercel dominant.
- **`/api/deploy` crée un vrai projet Vercel par app publiée, sur VOTRE compte.**

---

## 3. AGENTS IA

### L'architecture est saine

`lib/agent-watchers.ts` (2 917 lignes, 51 veilleurs) **n'importe aucun SDK LLM**.
La détection est du **SQL pur** : 0 token. Un seul veilleur (`demande_urgente`) utilise l'IA.

```
Tick pg_cron (toutes les 5 min)
  ↓ 4 requêtes SQL de plancher (reaper, outbox, backlog, candidats)
  ↓ pour chaque règle due :
      ↓ DÉTECTION — SQL pur ....................... 0 $
      ↓ [si rien de neuf] → STOP .................. 0 $  ← sortie anticipée
      ↓ DÉCISION (aiJudge, 1 veilleur sur 51) ..... 0,0012 $
      ↓ RÉDACTION / ACTION ........................ voir tableau
      ↓ ENVOI (Gmail / Resend / Twilio / push)
```

### Coût par type de passage

| Type de passage | Appels LLM | Modèle | **Relevé** | **Pire cas** |
|---|---|---|---|---|
| **Rien ne se déclenche** | **0** | — | **0 $** | 0 $ |
| **notify / digest** (gabarit) | **0** | — | **0 $** | 0 $ |
| **team_planning** (gabarit) | **0** | — | **0 $** | 0 $ |
| `aiJudge` (demande urgente) | 1 | mistral | 0,0012 $ | 0,0012 $ |
| **Relance e-mail** (1 fiche) | 1 | mistral | 0,0022 $ | 0,0022 $ |
| Relance e-mail (6 fiches, plafond) | 6 | mistral | 0,013 $ | 0,013 $ |
| **Compte-rendu** (1 fiche) | 1 | deepseek | 0,004 $ | 0,016 $ |
| Compte-rendu (3 fiches, plafond) | 3 | deepseek | 0,012 $ | 0,048 $ |
| **Agent PLANIFIÉ** (boucle 8 itér.) | 8 | deepseek | **0,033 $** | **0,132 $** |
| **Agent `act`** (4 fiches × 10 itér.) | **40** | deepseek | **0,165 $** | **0,661 $** |
| Création d'un agent | 1 | deepseek | 0,0031 $ | 0,0122 $ |
| Modification d'un agent | **0** | — | **0 $** | 0 $ |

### Les deux fuites

1. **`buildWorkspaceToolsSystem()` = 13 666 caractères réinjectés à CHAQUE itération** de la
   boucle agentique (le catalogue des 28 entités), × jusqu'à 10 itérations, × jusqu'à 4 fiches.
   Un `act` au plafond, c'est **~260 000 tokens d'entrée pour un seul passage**.
2. **Un agent PLANIFIÉ n'a aucune sortie anticipée.** L'agent événementiel s'arrête sur
   `fresh.length === 0` ; `executeRule` appelle `compose()` **sans condition** (`:2152`).
   **Un rapport quotidien sur un workspace vide paie plein tarif.**

*Incohérence relevée :* `PARSE_MODEL = TIER_MEDIUM` → le recrutement d'agent tourne sur
DeepSeek V4 Pro alors que le commentaire du code annonce Haiku. Une classification sur le
moteur le plus lourd du parc.

### Coût FIXE du cron (indépendant du nombre de clients)

| Période | Ticks | Requêtes SQL | Invocations Vercel |
|---|---|---|---|
| Heure | 12 | 48 | 12 |
| Jour | 288 | 1 152 | 288 |
| **Mois** | **8 640** | **34 560** | **8 640** ≈ **0,005 $** |

**Ce coût est plat** : la sélection est globale, pas par tenant. 1 000 entreprises n'y ajoutent
rien. *(État actuel : 0 agent en prod — le cron tourne à vide 288 fois par jour.)*

---

## 4. DOCUMENTS / VISION / OCR

### Il n'y a AUCUN moteur OCR

Ni Tesseract, ni Google Vision, ni Textract, ni `sharp`. **L'OCR est un appel LLM vision**
(`qwen3-vl-235b`). Les images partent en **base64 brut, sans aucun redimensionnement**.

### Coût d'une image (règle : tokens ≈ pixels / 750)

| Source | Pixels | Tokens image | Coût entrée |
|---|---|---|---|
| Scan A4 150 dpi | 2,2 Mpx | 2 900 | 0,0007 $ |
| Image cadrée 1568 px | 1,8 Mpx | 2 459 | 0,0006 $ |
| Photo 8 Mpx | 8,0 Mpx | 10 654 | 0,0027 $ |
| **Photo iPhone 12 Mpx (défaut)** | 12,2 Mpx | **16 257** | **0,0041 $** |
| Photo Samsung 16 Mpx | 16,0 Mpx | 21 381 | 0,0053 $ |

### Coût par type de document

| Scénario | Appels | Tokens image | Texte in/out | **MIN** | **MOYEN** | **MAX** |
|---|---|---|---|---|---|---|
| 1 photo (avec consigne) | 2 | 2 900 → 16 257 | 2 500 / 1 000 | 0,0016 $ | **0,0051 $** | 0,0078 $ |
| 1 facture photographiée | 2 | 10 654 | 2 500 / 2 000 | 0,0036 $ | **0,0056 $** | 0,0085 $ |
| 1 PDF (1 / 10 / 40 pages) | 2 | ~2 000/page | 2 400 / 2 000 | 0,0030 $ | **0,0080 $** | 0,024 $ |
| 1 plan de chantier annoté | 2 | 10 654–16 257 | 1 400 / 3 000 | 0,0043 $ | **0,0071 $** | 0,0092 $ |
| Multi-images (5 photos) | 2 | jusqu'à 81 285 | 2 500 / 3 000 | 0,0080 $ | **0,025 $** | 0,025 $ |
| Photo lue dans une app | 1 | 1 960 → 16 257 | 400 / 2 000 | 0,0009 $ | **0,0015 $** | 0,0064 $ |
| **Devis vocal** (dictée 2 min) | 2 | 0 | 1 200 / 800 | 0,0040 $ | **0,013 $** | 0,60 $ ⚠️ |
| **Document généré** (devis/PV HTML) | 3–6 | 0 | 4 500 / 6 000 | 0,004 $ | **0,008 $** | 0,023 $ *(pire cas ×4)* |
| **PDF devis/facture rendu** | **0** | 0 | 0 | **0 $** | **0 $** | **0 $** |
| PDF → base de connaissances | 2 | ~2 000/page | 0 / 8 000 | 0,003 $ | 0,013 $ | 0,03 $ |

### Les fuites, par ordre d'impact

1. **Aucun redimensionnement avant vision.** Une photo 12 Mpx coûte **6,6× plus** qu'un cadrage
   à 1568 px, sur *tous* les chemins (`analyze`, `annotate`, `automate`, `app-ai`, porte de contexte).
2. **`/api/generate` envoie les images à un modèle AVEUGLE.** `withFiles()` attache les blocs
   image à `buildModel` = `deepseek-v4-pro`, que votre propre catalogue décrit comme
   *« AVEUGLE (pas de vision) »*. Soit OpenRouter refuse, soit **la photo est ignorée en silence
   et l'utilisateur paie 0,024 à 0,16 $ pour un fichier jamais lu**. ⚠️ Bug fonctionnel, à vérifier.
3. **La transcription part chez OpenAI, pas chez Groq** — contrairement à ce qu'annonce le
   commentaire du fichier. **9× plus cher** (0,006 $/min contre 0,00067 $/min).
4. **Aucun plafond de durée d'enregistrement** : 25 Mo ≈ 100 minutes ≈ **0,60 $ en un seul appel**.
5. **`FILE_INTENT_MODEL = TIER_MEDIUM`** : une classification à 128 tokens de sortie tourne sur
   DeepSeek V4 Pro. Le modèle de classification (`qwen3.5-flash`) ferait la même chose **23× moins cher**.
6. **`MAX_FILE_BYTES` (3,5 Mo) dépasse la limite de corps Vercel (~4,5 Mo)** : en base64 (+33 %),
   un seul fichier de 3,5 Mo produit 4,67 Mo → **erreur 413** après que l'utilisateur a attendu l'upload.

### Stockage

Un seul bucket Supabase (`brand`, logos, 2 Mo max). **Les photos et PDF analysés ne sont jamais
persistés** (base64 en vol). Les PDF de devis/factures sont **rendus à la volée, jamais stockés**
(re-rendus à chaque téléchargement). Les photos prises dans une app sont compressées (1400 px,
JPEG 0.7) et stockées en **JSONB Postgres**, pas en Storage.

---

## 5. WORKSPACE, DEVIS, FACTURES, FORMULAIRES

**Zéro appel LLM sur les 30 fichiers du périmètre.** Coût = requêtes Supabase.

| Opération | LLM | Requêtes DB | Coût |
|---|---|---|---|
| CRUD — création | non | 5 | ~0 $ |
| CRUD — modification | non | 6–8 | ~0 $ |
| CRUD — suppression | non | 8 | ~0 $ |
| CRUD — liste / lecture | non | 3–6 | ~0 $ |
| Recherche / filtres | non | 1 | ~0 $ |
| **Import CSV/Excel (100 ou 1 000 lignes)** | **non** | **3** | **0 $** |
| Export CSV/XLSX (1 entité / tout) | non | 3–7 / ~34 | ~0 $ |
| **Facture depuis devis** | **non** | 8 | **0 $** |
| **Rendu PDF (react-pdf, vectoriel)** | **non** | 0 | **0 $** (100–400 ms CPU) |
| Formulaire public — affichage | non | 1 | ~0 $ |
| **Formulaire public — soumission** | **non** | **3** | **~0 $** |
| Envoi d'un devis par e-mail | non | ~13 | 0 $ (Gmail) / 0,0004 $ (Resend) |
| **Devis vocal** | **oui ×2** | 4 | **0,013 $** |
| Devis/facture **en document généré** | oui ×1 | ~4 | 0,008 $ |
| Compte-rendu / rapport | oui ×1 | ~3 | 0,004 $ |

### Points de vigilance

- **Le devis vocal ne lit toujours pas le catalogue.** La migration 048 est en base, mais
  **aucune ligne de code ne la lit** → toute ligne non dictée sort encore à **0 €**.
- **`reglesTvaPourPrompt()` n'est appelé nulle part** : le prompt impose « TVA 20 % par défaut ».
  Un artisan belge produit des devis à un taux qui n'existe pas chez lui.
- **Deux scans non bornés** dans la numérotation légale (`ILIKE 'F-2026-%'` sans `LIMIT`) :
  coût linéaire dans le nombre de factures de l'année, **à chaque facturation**.
- Le formulaire public est en `no-store` : **aucun cache**, chaque affichage refait la requête.

---

## 6. E-MAILS, SMS, API EXTERNES

| Canal | Fournisseur | Coût unitaire | Vérifié |
|---|---|---|---|
| **E-mail via Gmail connecté** (voie préférée) | Google | **0 $** | code |
| E-mail via Resend (repli) | Resend | 0 $ (3 000/mois) puis **0,0004 $** | tarif public |
| **SMS Twilio (1 segment, FR)** | Twilio | **0,0798 $ ≈ 0,073 €** | tarif public |
| **SMS Twilio (corps max, 10 segments)** | Twilio | **jusqu'à 0,80 $ ≈ 0,73 €** | dérivé du code |
| Notification push (VAPID) | — | **0 $** | code |
| Gmail / Agenda / Drive / Outlook | Google, MS | **0 $** (quotas) | tarif public |
| WhatsApp | — | **0 $** — simple deep-link, pas d'API | code |
| Embeddings (`text-embedding-3-small`) | OpenAI | **0,02 $/M tokens** | tarif public |
| 1 recherche RAG | OpenAI + pgvector | **0,000001 $** → 1 M de recherches ≈ **1 $** | dérivé |
| 1 document indexé (50 000 car.) | OpenAI | **0,00025 $** → 4 000 docs pour 1 $ | dérivé |
| Transcription (`gpt-4o-transcribe`) | OpenAI | **0,006 $/min** | tarif public |
| Transcription (repli Groq) | Groq | 0,00067 $/min | tarif public |
| **Stripe (carte EEE)** | Stripe | **1,5 % + 0,25 €** (+ 0,7 % Billing) | tarif public |

### ⚠️ Le SMS est le seul poste sans plafond

- Le chemin **agent** (`agent-tools.ts:464`) n'est **ni rate-limité, ni budgété en segments**.
  Les budgets d'agent ne comptent que les **crédits IA**, pas les segments Twilio.
- Un corps de 1 600 caractères = **10 segments**. × 50 destinataires (plafond d'un appel) =
  **36 € en un seul appel**, dans la limite du rate-limit.
- Le rate-limiter est **fail-open** (`rate-limit.ts:47,58`) : il autorise si la RPC échoue.
- Twilio est **armé en prod** (4 clés présentes) alors que la page connecteurs affiche
  encore `status: "soon"`.

---

## 7. RÉCAPITULATIF — COÛT FIXE / VARIABLE / MARGINAL

### Coût FIXE mensuel (à zéro client, à zéro usage)

| Poste | Montant | Note |
|---|---|---|
| Supabase Pro | **25 $** | Free impossible : pause auto, 500 Mo, pas de backup |
| Vercel Pro | **20 $**/siège | Hobby **interdit** l'usage commercial |
| Domaine | ~1 $ | |
| Resend | 0 $ | 3 000 e-mails/mois inclus |
| Twilio, Stripe, OpenRouter, OpenAI | 0 $ | 100 % à l'usage |
| Cron agents (8 640 invocations) | ~0,005 $ | plat, indépendant du nombre de clients |
| **PLANCHER** | **≈ 46 $/mois** | |

**Coût à prévoir en croissance :** compute Supabase (Small 15 $ → Medium 60 $) dès que l'index
HNSW pgvector ne tient plus en RAM, et la **mémoire Vercel tenue ouverte pendant le streaming
SSE de `/api/generate`** (jusqu'à 300 s par génération) — c'est le premier poste qui bougera.

### Coût MARGINAL

Pour **toutes** les fonctionnalités, le coût marginal ≈ le coût variable : aucune économie
d'échelle, sauf deux paliers gratuits (Resend 3 000 e-mails, quotas Supabase/Vercel inclus).
**Le coût fixe ne croît pas avec le nombre de clients** — il croît avec le *volume de données*
(compute Supabase) et le *temps de génération* (mémoire Vercel).

---

## 8. TOP 20 DES ACTIONS LES PLUS COÛTEUSES (coût unitaire)

| # | Action | **Relevé** | **Pire cas** | Facturé (crédits) |
|---|---|---|---|---|
| 1 | **SMS long (10 segments)** | **0,80 $** | 0,80 $ | — ⚠️ non plafonné |
| 2 | Modification d'app complexe (MAX) | **0,261 $** | 1,044 $ | 60 |
| 3 | Création d'app complexe (MAX) | **0,164 $** | 0,658 $ | 250 |
| 4 | **Passage d'agent `act`** (4 fiches × 10 itér.) | **0,165 $** | 0,661 $ | 25 |
| 5 | Modification d'app complexe (moyenne) | **0,141 $** | 0,566 $ | 60 |
| 6 | Création d'app complexe (moyenne) | **0,087 $** | 0,348 $ | 250 |
| 7 | Modification d'app moyenne | **0,070 $** | 0,278 $ | 60 |
| 8 | **Dictée de 100 min (plafond 25 Mo)** | **0,60 $** | 0,60 $ | 15 ⚠️ |
| 9 | **Auto-fix** | **0,057 $** | 0,226 $ | **0** ⚠️ |
| 10 | Création d'app moyenne | **0,046 $** | 0,183 $ | 250 |
| 11 | **Agent planifié** (rapport quotidien) | **0,033 $** | 0,132 $ | 25 |
| 12 | Modification d'app simple | **0,025 $** | 0,101 $ | 60 |
| 13 | Multi-images (5 photos non redimensionnées) | **0,025 $** | 0,025 $ | 50 |
| 14 | Création d'app simple | **0,024 $** | 0,096 $ | 250 |
| 15 | PDF 40 pages | **0,024 $** | 0,024 $ | 10 |
| 16 | Devis vocal (2 min, OpenAI) | **0,013 $** | 0,014 $ | 15 |
| 17 | Passage agent « relance » (6 fiches) | **0,013 $** | 0,013 $ | 25 |
| 18 | Passage agent « compte-rendu » (3 fiches) | **0,012 $** | 0,048 $ | 25 |
| 19 | Document généré (devis/PV HTML) | **0,008 $** | 0,030 $ | 30 |
| 20 | Photo de chantier analysée | **0,005 $** | 0,006 $ | 10 |

*Hors classement : question au copilote 0,001–0,004 $ ; création d'agent 0,003 $ ;
CRUD / import / export / facture / PDF / formulaire = **0 $**.*

---

## 9. SIMULATION — UN MOIS D'UNE ENTREPRISE QUI UTILISE BILTIA NORMALEMENT

Profil : 4 applications créées · 20 modifications · 400 questions IA · 150 devis ·
80 factures · 300 e-mails · 2 agents actifs · 500 passages d'agents · 50 photos ·
15 plans PDF.

| Poste | Volume | Coût unitaire (relevé) | **Total relevé** | **Total pire cas** |
|---|---|---|---|---|
| Créations d'app | 4 | 0,046 $ | **0,18 $** | 0,73 $ |
| Modifications d'app | 20 | 0,070 $ | **1,40 $** | 5,57 $ |
| Questions au copilote | 400 | 0,0035 $ | **1,40 $** | 5,64 $ |
| Devis (100 saisis + 50 dictés) | 150 | 0 $ / 0,013 $ | **0,65 $** | 0,70 $ |
| Factures (depuis devis) | 80 | **0 $** | **0 $** | 0 $ |
| PDF devis + factures rendus | 230 | **0 $** | **0 $** | 0 $ |
| E-mails (Gmail connecté) | 300 | 0 $ | **0 $** | 0,12 $ *(Resend)* |
| **Agents — 500 passages, veilleurs SQL + notify** | 500 | ~0 $ | **0,15 $** | 0,15 $ |
| Photos analysées | 50 | 0,0051 $ | **0,26 $** | 0,29 $ |
| Plans PDF (10 pages) | 15 | 0,0080 $ | **0,12 $** | 0,13 $ |
| Embeddings + RAG | 400 | 0,00002 $ | **0,01 $** | 0,01 $ |
| **TOTAL VARIABLE / MOIS** | | | **≈ 4,20 $** | **≈ 13,30 $** |

### ⚠️ Le même mois, avec des agents « intelligents »

Le poste agents dépend **entièrement du type d'agent**, et l'écart est vertigineux :

| Type des 2 agents | 500 passages | **Relevé** | **Pire cas** |
|---|---|---|---|
| Veilleurs SQL + notification (gabarit) | 500 | **0,15 $** | 0,15 $ |
| Agents rédacteurs (relance e-mail) | 500 | **3,30 $** | 3,30 $ |
| **Agents planifiés (boucle agentique)** | 500 | **16,50 $** | **66,00 $** |
| **Agents `act` au plafond** | 500 | **82,50 $** | **330,00 $** |

**→ Coût total du mois : de 4,20 $ à 336 $ pour la MÊME entreprise, au même volume d'usage.**
La variable dominante n'est ni le nombre de questions, ni le nombre d'apps : c'est **le type
d'agent activé**, puis **l'endpoint OpenRouter servi**.

### Coût par entreprise / par utilisateur

| Hypothèse | Variable | Quote-part infra (46 $) | Stripe (abo 49 €) | **Coût total / entreprise** |
|---|---|---|---|---|
| 10 entreprises | 4,20 $ | 4,60 $ | ~1,45 $ | **≈ 10,25 $/mois** |
| 100 entreprises | 4,20 $ | 0,46 $ + compute | ~1,45 $ | **≈ 6,60 $/mois** |
| 1 000 entreprises | 4,20 $ | ~0,10 $ + compute | ~1,45 $ | **≈ 5,80 $/mois** |
| 100 entreprises, agents à boucle | 20,70 $ | 0,46 $ | ~1,45 $ | **≈ 22,60 $/mois** |

**Coût par utilisateur** : Biltia facture par workspace, pas par siège. Un workspace de 5
employés ne coûte pas 5× plus — le coût suit l'**usage IA**, pas les sièges. Le seul poste
par-siège est **Vercel Pro (20 $/siège)**, qui concerne *vos* développeurs, pas vos clients.

### Ce que Stripe coûte vraiment

Sur un abonnement à 49 € : **1,5 % + 0,25 € = 0,99 €**, plus **0,7 % de Stripe Billing = 0,34 €**
→ **≈ 1,33 €/mois/abonné**. Dans le scénario « agents sages », **Stripe coûte plus cher que
tout le LLM du mois.** C'est un fait à retenir pour bâtir le modèle économique.

---

## 10. SYNTHÈSE — OÙ PART VRAIMENT L'ARGENT

1. **Le cœur métier est gratuit.** CRUD, devis, factures, PDF, import/export, formulaires,
   recherche, 51 veilleurs sur 51 : **0 token**. Biltia n'est pas un produit « cher en IA ».
2. **Trois surfaces concentrent 95 % du coût variable** : la génération d'apps, la boucle
   agentique, la vision non redimensionnée.
3. **Le coût est piloté par le prompt FIXE, pas par l'utilisateur.** 61 617 caractères de
   prompt système pour une app, 13 666 réinjectés à chaque itération d'agent, 16 257 tokens
   pour une photo d'iPhone. La demande de l'artisan pèse moins de 1 %.
4. **Deux inconnues à lever avant tout modèle économique :**
   - **Le prix réel de DeepSeek V4 Pro** (0,435 ou 1,74 $/M ?). Facteur **×4** sur la moitié
     du produit. Les relevés disent 0,435 ; le code croit 1,74.
   - **Le type d'agent que vos clients activeront.** Facteur **×550** entre un veilleur SQL
     et un agent `act` au plafond.
5. **Le seul risque financier non borné du produit, c'est le SMS par le chemin agent** :
   ni rate-limit, ni budget en segments, sur un canal facturé à 0,073 €/segment.
