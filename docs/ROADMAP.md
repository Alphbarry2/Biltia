# Batify — Feuille de route « OS métier » (v2)

> Document de séquencement. Mappe la vision en 19 phases à l'état **réel** du code et
> de la base de données, classe chaque phase (Fait / Partiel / À faire), puis ordonne
> la construction par dépendances.
>
> **v2 (2026-06-27)** : intègre le retour produit — réordonnancement en 8 étapes, RAG
> repoussé, et ajout des **moteurs** manquants (Business Engine, Event Bus, AI Context
> Engine, AI Memory, Template Engine, Workflow Engine). Voir §2 et §3.

État constaté le 2026-06-27 (lecture du dépôt + base Supabase `Batify` / `docqrznkbtyctjqpvifu`).

---

## 0. Ce que j'ai constaté (faits, pas opinions)

### Le front est très avancé, le back est l'angle mort

Les écrans existent presque tous : landing, signup/login, dashboard avec gros prompt + wizard
de clarification ([dashboard/page.tsx](../app/(app)/dashboard/page.tsx)), générateur conversationnel complet
([generate/page.tsx](../app/(app)/generate/page.tsx)), settings avec **toutes** les sections de la Phase 16
déjà présentes en onglets ([settings/page.tsx](../app/(app)/settings/page.tsx) : Workspace, Équipe, Facturation,
Usage IA, Analytics, Logs, Skills & Knowledge, Intégrations, Cloud, Database, Storage, API & Webhooks,
Sécurité, Notifications, Danger). Beaucoup de ces sections sont des **coquilles UI** sans logique derrière.

### La faille structurante : les modules ne partagent aucune donnée

Les modules générés persistent dans le **`localStorage` du navigateur**, pas dans la base.
Règle de génération : [route.ts:23](../app/api/generate/route.ts#L23) — « Persistance RÉELLE en localStorage ».
Le contexte workspace ([workspace-context.ts](../lib/workspace-context.ts)) n'est qu'un **instantané figé dans le HTML**
au moment de la génération. Conséquence : chaque module est un silo. Les Phases 12, 18, 19 et la Marketplace
sont **inatteignables** tant que ce point n'est pas réglé. → traité à l'**Étape 2**.

### La base de données réelle est très en avance sur le dépôt (drift majeur)

Le dépôt versionne ~12 tables (migrations 001 + 002). La base **en production en contient 27**, toutes
avec RLS activé :

`tenants, tenant_members, profiles, modules, module_versions, app_members, app_events,
clients, chantiers, employees, documents, materials, suppliers, equipment, interventions, tasks,
workflows, custom_entities, files, notifications, integrations, subscriptions, ai_usage, templates,
audit_logs, activity_logs, user_credits`

Points notables :
- `modules` **existe** en base (RLS on, 2 lignes) — mais **aucune migration ne la crée**. Tout le code
  applicatif lit `from("modules")`. La table a donc été créée à la main → **le dépôt n'est plus la source de vérité**.
- `custom_entities`, `workflows`, `module_versions`, `interventions`, `activity_logs`, `notifications` existent
  déjà : la base **anticipe** le modèle « données partagées / entités définies par l'utilisateur / événements ».
  C'est exactement la matière des Étapes 3 et 6, mais non câblée et non versionnée.
- `templates` (6 lignes) + `is_public` sur `modules` = la graine de la Marketplace existe.

### Alertes de sécurité réelles (Supabase advisors)

Aligné avec ta contrainte « Zero Trust / RLS obligatoire ». Toutes les tables ont RLS ✅, mais :

1. **🔴 URGENT — `refund_credits(p_user_id, p_amount)` est exécutable par le rôle `anon`.**
   Définie en migration [002:55](../supabase/migrations/002_btp_workspace.sql#L55), `SECURITY DEFINER`, **sans
   aucun contrôle d'auth** : elle fait `update user_credits set balance = balance + p_amount where user_id = p_user_id`.
   Un attaquant **non connecté** peut appeler `POST /rest/v1/rpc/refund_credits` et **créditer n'importe quel
   compte à l'infini**. Faille économique exploitable.
2. **🟠 `admin_analytics()` et `auto_confirm_email()` exécutables par `anon`** — fuite de stats agrégées /
   contournement de vérification d'email.
3. **🟠 ~10 fonctions `SECURITY DEFINER` exposées à `anon`/`authenticated`** via RPC REST (`deduct_credits`,
   `log_audit`, `my_tenant_role`, `rls_auto_enable`…). À auditer : `REVOKE EXECUTE` au minimum.
4. **🟡 `function_search_path_mutable`** sur 6 fonctions → ajouter `set search_path = public, pg_temp`.
5. **🟡 Protection « mots de passe compromis » (HaveIBeenPwned) désactivée** dans Auth.

→ traité à l'**Étape 1**.

---

## 1. Mapping des 19 phases → état réel

Légende : ✅ Fait · 🟡 Partiel · 🔴 À faire

| # | Phase | État | Preuve / Gap |
|---|-------|------|--------------|
| 1 | Landing + CTA | ✅ | [app/page.tsx](../app/page.tsx), [tarifs](../app/tarifs/page.tsx) |
| 2 | Création compte (prénom/nom/email/mdp) | ✅ | [signup](../app/(auth)/signup/page.tsx) — demande aussi le corps de métier |
| 3 | Création Workspace (nom/pays/devise/langue/fuseau) | 🔴 | Trigger `handle_new_user` crée un tenant nommé « X's workspace ». **`tenants` n'a ni pays/devise/langue/fuseau.** Aucun wizard. |
| 4 | Profil métier (métiers multi / effectifs / travaux) | 🟡 | `profiles.sector` stocke `{subTrades, activityType}`. **Effectifs et types de travaux non captés.** |
| 5 | Knowledge auto (vocabulaire/templates/workflows/suggestions) | 🟡 | [btp-catalog.ts](../lib/btp-catalog.ts) (statique, 650 l.) + `buildKnowledgeBlock`. Pas de knowledge appris par workspace. |
| 6 | Backend auto (tenant→subscription→owner→…→crédits→audit) | 🟡 | Trigger crée tenant+owner+crédits+profil. `subscriptions`/plan Free non créés au signup ; storage/dossier fichiers non provisionnés. |
| 7 | Dashboard « Que voulez-vous créer ? » | ✅ | [dashboard](../app/(app)/dashboard/page.tsx) : prompt géant, typewriter, `ClarifyingWizard`, exemples |
| 8 | Première génération (Intent→Knowledge→Template→Context→Claude→Validation) | ✅ | [route.ts](../app/api/generate/route.ts) + [router.ts](../lib/router.ts) + [clarify.ts](../lib/clarify.ts). Pas d'étape « workflow métier » ni de template injecté dans la génération. |
| 9 | Création module (Version/Permissions/RLS/Tables/Relations/Deploy/Logs) | 🟡 | `modules` + `module_versions` existent. Mais le module = **blob HTML** : pas de Tables/Relations/RLS propres. Deploy ✅ (Vercel). |
| 10 | Première utilisation + Import (CSV/Excel/PDF/Photos) | 🔴 | Aucune fonction d'import. |
| 11 | IA continue (ajoute colonne/photo/signature/PDF) | 🟡 | Édition supportée (`previousHTML` → régénère le HTML). Marche **dans** le paradigme localStorage. |
| 12 | Construction progressive (modules partagent Clients/Employés/Chantiers) | 🔴 | **Bloqué par localStorage.** Les tables partagées existent mais les modules ne les touchent pas. |
| 13 | Inviter l'équipe (mail/lien, rôle, crédits, permissions, modules) | 🟡 | `tenant_members` (invite) + `app_members` (accès par module) prêts. Flux d'invitation = coquille UI. |
| 14 | Import massif (Excel/ERP/Pennylane/Batigest/EBP/Google) | 🔴 | Table `integrations` (vide) + onglet UI. Aucun connecteur réel. |
| 15 | Knowledge upload + indexation (RAG) | 🔴 | Onglet « Skills & Knowledge » UI. Pas de `pgvector`, pas d'embeddings. **Repoussé** (cf. §3). |
| 16 | Paramètres (16 sections) | 🟡 | **Toutes les sections existent en UI.** Backing variable (Workspace/Billing/Usage IA partiels, le reste = coquilles). |
| 17 | Déploiement Cloud (Privé/Public/Client + DB/Auth/Realtime/Backups/SSL) | 🟡 | [deploy/route.ts](../app/api/deploy/route.ts) déploie le HTML sur Vercel. **Un seul mode**, aucune provision DB/Auth/Realtime par tenant. |
| 18 | Vie du Workspace (données qui s'accumulent) | 🔴 | Émergent — dépend de l'Étape 2-3. |
| 19 | Copilote (« quels chantiers en retard ? ») | 🔴 | **Bloqué.** Nécessite données partagées + relations + contexte (Étapes 2-4). |
| ★ | Marketplace (publier/installer un module) | 🔴 | Graine : `templates` (6) + `is_public`. Tout le flux publish/install reste à faire. |

**Résumé : ~6 phases solides, ~6 partielles, ~7 à faire.** Le gros du travail restant est **back-end,
données et moteurs**, pas UI.

---

## 2. Les briques d'architecture (les « moteurs »)

Au-delà des features, l'OS repose sur 6 moteurs transverses. **Le piège : ils se recouvrent.** Frontières
explicites pour ne pas les construire deux fois :

### Business Engine — *le modèle de relations* (cœur)
Ce n'est pas « stocker » les entités, c'est **connaître leurs relations** : `client 1—N chantier`,
`chantier 1—N intervention`, `intervention N—N employés / matériel / photos / documents / devis`.
Le système doit savoir qu'une facture découle d'un chantier, qu'un SAV se rattache à une intervention, etc.
- **Déjà en base :** `clients, chantiers, interventions, employees, materials, documents` + `custom_entities`
  (pour les entités définies par l'IA). Les FK existent partiellement.
- **À construire :** une couche de **métadonnées de relations** (quelles entités, comment elles se lient,
  quelles actions sont permises) que lisent **à la fois** l'API data ET le Context Engine.
- **Dépendance :** interdépendant avec l'Étape 2 (le SDK écrit dans ces tables). C'est le chemin (B).

### AI Context Engine — *le sélecteur/assembleur* (plus haut levier)
À la génération, décide **quoi injecter** dans un budget de tokens : knowledge métier + données réelles +
Memory + modules existants + templates pertinents + relations. Décide aussi **quoi NE PAS injecter**.
- **Déjà en code :** `buildSystemPrompt` ([route.ts:159](../app/api/generate/route.ts#L159)) concatène déjà
  knowledge + workspace. C'est l'embryon.
- **À construire :** transformer cette concaténation naïve en assembleur **conscient du budget** et de la
  pertinence. → **gros gain de tokens + pertinence**.
- **Dépendance :** son **premier incrément peut démarrer dès l'Étape 2** (évolution, pas greenfield) et
  mûrit jusqu'à l'Étape 5. Ce n'est pas une phase isolée tardive.

### AI Memory — *le magasin de préférences* (à ne pas confondre avec le Context Engine)
Ce que le workspace a persisté et que l'IA réutilise : logo, couleurs, conventions de nommage, style,
gabarits, habitudes, préférences. **Memory = données ; Context Engine = consommateur.**
- **Embryon :** `profiles` + section Workspace des settings.
- **Dépendance :** alimenté progressivement ; consommé par le Context Engine.

### Event Bus — *le système nerveux* (Postgres-natif, pas Kafka)
Chaque action émet un événement → `activity_logs`, analytics, notifications, copilote, audit, workflows.
- **Pattern recommandé :** une table `events` + triggers (ou émission explicite depuis l'API data) +
  **Supabase Realtime** (UI live) + `pg_net`/Edge Functions (mail/SMS/webhooks). Unifie `activity_logs` +
  `audit_logs` existants.
- **Garde-fou :** un bus **sans consommateur est du poids mort**. On *sème* la table `events` dès l'Étape 2
  (chaque écriture SDK émet), mais on ne bâtit le bus qu'**avec** son 1er consommateur (Étape 6).

### Template Engine — *composer au lieu de régénérer* (économie de tokens)
Bibliothèque de blocs typés (liste, formulaire, planning, signature, upload photo, export PDF, KPI) qui se
**bindent aux entités via le SDK**. L'IA *compose* ces blocs et ne *génère* que la colle.
- **Garde-fou :** la composition n'est fiable **qu'après** le contrat de données (Étape 2) et le modèle
  d'entités (Étape 3). Avant → Frankenstein. Cible **hybride** : composer le connu, générer le custom.
- **Dépendance :** Étape 3-4. Nourrit le Context Engine (il choisit les blocs).

### Workflow Engine — *les règles métier qui agissent*
`devis → validation → signature → facture → paiement → archive`, ou
`document expire → notification → relance → blocage chantier → réactivation`.
- **Déjà en base :** table `workflows` (vide).
- **Dépendance :** consomme l'Event Bus. Étape 6.

---

## 3. Séquencement en 8 étapes

Réordonné selon le retour produit. Chaque étape débloque les suivantes. **L'ordre 1 → 2 → 3 n'est pas
négociable** ; le reste est ajustable. Effort : S / M / L.

### Étape 1 — Sécurité & gouvernance du schéma · **M** *(Phases sécu)*
Prérequis absolu : on n'empile rien sur une base dont le dépôt ne décrit pas la réalité et qui expose
`refund_credits` à l'anonyme.
- Corriger `refund_credits` (`auth.uid()` interne + `REVOKE EXECUTE FROM anon`).
- Auditer toutes les fonctions `SECURITY DEFINER` exposées : `REVOKE` / `SECURITY INVOKER` / `set search_path`.
- Activer la protection mots de passe compromis (Auth).
- **Réconcilier le drift** : dumper le schéma live → migrations versionnées. Le **dépôt
  Git redevient la source de vérité**. Vérifier les **policies** RLS de `modules`, `module_versions`,
  `custom_entities` (RLS « enabled » ≠ « policies présentes »).

> **Statut au 2026-06-27 — sécurité ✅ FAIT** (migration `003_security_hardening.sql`, appliquée en prod) :
> - 🔴 `refund_credits` verrouillée à `service_role` (ACL `postgres | service_role`) + app recâblée via
>   [lib/supabase-admin.ts](../lib/supabase-admin.ts). **Plus aucune fonction SECURITY DEFINER exécutable par `anon`** (advisor 0028 = 0).
> - `search_path` figé sur les 6 fonctions flaggées ; `log_audit`/`my_tenant_role`/`is_app_member`/`handle_new_user`
>   retirées de PUBLIC ; `admin_analytics` réparée (`public.apps` → `public.modules`).
> - Policies RLS vérifiées sur `modules` / `module_versions` / `custom_entities` : **présentes** (CRUD par rôle).
> - Les warns `authenticated_security_definer` restants sont **by-design** (RLS helpers + crédits) — ne pas révoquer.
>
> **Reste sur Étape 1 :**
> - ⚠️ **Action manuelle** : ajouter `SUPABASE_SERVICE_ROLE_KEY` à `.env.local` **et** Vercel (sinon le
>   remboursement de crédits sur échec de génération est ignoré — dégradation propre, pas de crash).
> - ⚠️ **Action manuelle** : activer *Leaked Password Protection* (Auth → Dashboard) — non scriptable en SQL.
> - 🟡 **Réconciliation du drift** : capturer les 27 tables live en migration baseline versionnée (`supabase db pull`
>   recommandé, ou baseline par introspection). Pas urgent, mais à faire avant l'Étape 2.

### Étape 2 — Socle de données partagé · **L** *(Phases 9, 11, 12, 18 — débloque tout)*
Le passage de « générateur de silos » à « OS ». Remplacer `localStorage` par de vraies données multi-tenant.
- Route CRUD générique `/api/data` scopée tenant + RLS ; mini-SDK Batify (`batify.list/create/update/delete`)
  injecté dans le HTML **à la place de localStorage** ([route.ts:23](../app/api/generate/route.ts#L23) à réécrire).
- **Module pilote** : « suivi chantiers » écrit dans la vraie table `chantiers`.
- **Sème ici** : la table `events` (chaque écriture émet) + le 1er incrément du **Context Engine**.

### Étape 3 — Business Engine · **L** *(Phases 12, 18)*
Modéliser les **relations** entre clients, chantiers, interventions, employés, documents, matériel.
Couche de métadonnées lue par l'API data et le Context Engine. S'appuie sur `custom_entities`.
- *Interdépendant avec l'Étape 2.* C'est le chemin (B).

### Étape 4 — AI Context Engine + AI Memory + Template Engine · **M–L** *(Phases 5, 8)*
- **Context Engine** : assembleur conscient du budget (knowledge + données + Memory + modules + templates).
  *Commencé en Étape 2, finalisé ici.*
- **AI Memory** : magasin des préférences/conventions du workspace.
- **Template Engine** : blocs typés bindés au SDK → l'IA compose, génère seulement la colle.
- *RAG reste hors-scope ici — plug-in tardif dans le Context Engine.*

### Étape 5 — Imports · **M → L** *(Phases 10, 14)*
- CSV/Excel → entités partagées (clients, chantiers, employés). Personne ne re-saisit 400 clients à la main.
- Connecteurs ERP (Batigest / EBP / Pennylane) ensuite, un par un. *Dépend de l'Étape 2-3.*

### Étape 6 — Workflows & automatisations · **M–L** *(Phases 13 partiel, 19 prérequis)*
- **Event Bus** complet (consommateurs réels) + **Workflow Engine** (règles métier, transitions d'état) +
  **notifications** (mail/SMS/dashboard). Inclut le flux d'invitation équipe.

### Étape 7 — Copilote IA · **M–L** *(Phase 19)*
Agent qui **requête et agit** sur les données du workspace (« chantiers en retard ? », « prépare le planning »).
*Strictement après Étapes 2-4 (données + relations + contexte) et idéalement 6 (actions).*

### Étape 8 — Marketplace & Cloud avancé · **L** *(Phase 17, ★)*
- Publier / installer / re-personnaliser un module entre tenants (possible seulement si le module décrit
  son schéma — Étape 3).
- Provisioning cloud par tenant (DB/Auth/Realtime/Backups/domaine/SSL). Gros chantier infra, à cadrer seul.

---

## 4. Chemin critique (vue compacte)

```
1. Sécu + drift
      │
      ▼
2. Données partagées (SDK)  ── sème ──►  table events + Context Engine v0
      │
      ▼
3. Business Engine (relations)
      │
      ▼
4. Context Engine + Memory + Template Engine
      │
      ├─►  5. Imports
      ├─►  6. Workflows + Event Bus + notifications
      │          │
      │          ▼
      └────────► 7. Copilote IA
                       │
                       ▼
                 8. Marketplace + Cloud
```

Tout converge sur les **Étapes 2-3** (données partagées + relations). C'est là que se joue le passage de
builder à OS.

---

## 5. Décisions ouvertes (à trancher pour figer le plan)

1. **Persistance (Étape 2) — (A) SDK sur tables typées, ou (B) `custom_entities` génériques d'emblée ?**
   Reco : (A) pour le pilote, (B) en cible via le Business Engine.
2. **Drift schéma (Étape 1) — réconcilier le dépôt sur la base live, ou repartir d'un schéma propre redéployé ?**
   Reco : réconcilier (la base contient déjà des données).
3. **Périmètre v1 du « module branché » (Étape 2) — convertir tout le générateur, ou un seul type pilote
   (suivi chantiers) d'abord ?** Reco : un pilote.
4. **Onboarding (Phases 3-4) — où l'insérer ?** Pas dans le chemin critique. À glisser après l'Étape 2
   (valeur conversion) selon ta priorité acquisition vs rétention.
5. **Template Engine — bibliothèque de blocs maison, ou générer puis figer les bons modules comme blocs
   réutilisables ?** À trancher à l'Étape 4.
</content>
