# Runbook — Validation du runner d'agents V2 (conditions réelles)

> But : prouver, sur un **tenant de test**, que le moteur V2 (relative_date, séquences
> multi-actions, email rédigé par IA + métering, idempotence, gating) fonctionne
> bout en bout. `tsc` + tests node ne prouvent que la logique pure ; **ceci** prouve
> que ça tourne.

---

## 0. Activation — ORDRE STRICT (⚠️ à faire avant tout)

**✅ Migrations 035 + 040 + 041 APPLIQUÉES en prod le 2026-07-12** (`docqrznkbtyctjqpvifu`).
Pré-vol vérifié : `agent_rules.spec` présent, `agent_outbox` créée (RLS + policies), `operation/params/record_ref`
présents, `to_email/subject/body` relâchés nullable. **Effet de bord assumé** : 035 réactive la validation
humaine des relances *legacy* (avant, les inserts outbox échouaient en silence).

Il ne reste donc que **le déploiement du code + le flag** :

1. ~~035 / 040 / 041~~ — **déjà appliquées.**
2. **Déployer** le code (le runner V2 + Piece A/B). ⚠️ le working tree contient aussi des changements
   non commités hors agents (generate/analyze/data/report-views/agent-tools/workspace-transforms) → à
   trier avant de pousser en prod.
3. **`AGENT_V2_RUNNER=1`** dans les variables d'env Vercel, puis **redeploy**. Flag **global** (tous tenants).

> ⚠️ Le flag est **global** (tous les tenants). Idéalement, tester sur un **environnement/preview
> séparé**. Sinon, accepter que le V2 s'active pour tout le monde au même instant.

> ⚠️ **Gating** : un agent V2 qui **agit** (toute étape ≠ `send_notification`) exige le plan **Pro**
> (fondateur exempté). Le tenant de test doit être **Pro**, ou utiliser un `created_by` = compte
> **fondateur** (`barryalpha9755@gmail.com`, crédits illimités + exempt de gating).

### Pré-vol (après migrations, avant tests) — doit renvoyer 3 lignes
```sql
select 'spec' as ok from information_schema.columns
  where table_name='agent_rules' and column_name='spec'
union all
select 'outbox' from information_schema.tables where table_name='agent_outbox'
union all
select 'outbox_op' from information_schema.columns
  where table_name='agent_outbox' and column_name='operation';
```

---

## Variables utilisées ci-dessous
```
$BASE   = https://www.biltia.com   (ou l'URL du preview)
$CRON   = valeur de CRON_SECRET
$TENANT = uuid du tenant de test
$USER   = uuid d'un membre owner/admin du tenant (Pro ou fondateur) = created_by
```
Récupérer `$TENANT` / `$USER` :
```sql
select t.id as tenant, m.user_id as user_owner
from tenants t join memberships m on m.tenant_id = t.id
where t.name ilike '%test%' and m.role in ('owner','admin')
limit 5;
```

### Déclencher un tick MANUELLEMENT (sans attendre le cron 5 min)
```bash
curl -s -X POST "$BASE/api/agents/run" -H "x-cron-secret: $CRON" | jq
# → { ok, scanned, metrics, results:[{title,status,summary}] }
# (à défaut du secret : être connecté avec un email admin — ADMIN_EMAILS)
```

---

## Scénario A — Déclencheur `relative_date` (Piece A)

### A1. Le PARSEUR peut émettre relative_date (dépend du flag ON)
Choisir un cas SANS veilleur nommé concurrent (le veilleur nommé prime toujours).
Bon cas : **avant la date de DÉBUT d'un chantier** (aucun veilleur ne couvre « avant date_debut »).

Dans **Agents**, recruter :
> « Préviens-moi 2 jours avant la date de début prévue de chaque chantier. »

Vérifier que la règle porte bien un trigger relative_date :
```sql
select title, trigger_type,
       spec->'trigger'->>'subtype'      as subtype,   -- attendu : relative_date
       spec->'trigger'->'relative'      as relative   -- {entityType:chantiers, dateField:date_debut, ...}
from agent_rules
where tenant_id = '$TENANT' and created_at > now() - interval '10 min'
order by created_at desc limit 3;
```
✅ **Attendu** : `subtype = relative_date`, `relative.entityType = chantiers`, `dateField = date_debut`.
❌ Si `subtype` est `watcher_scan` ou vide → le parseur a préféré un veilleur/planning (recommencer
avec une formulation plus « date précise », ou passer directement au test déterministe A2).

> **Test négatif (optionnel, prouve l'inertie)** : avec `AGENT_V2_RUNNER` **désarmé** puis redéployé,
> la même phrase ne doit **jamais** produire `relative_date` (le champ d'outil n'est pas exposé) →
> elle retombe sur un veilleur nommé ou un planning. Nécessite un redeploy → à faire une seule fois.

### A2. Le RUNNER exécute un relative_date (DÉTERMINISTE, indépendant du parseur)
On insère une règle avec un `spec` fabriqué à la main + une facture qui échoit dans 2 jours.

**Seed** (client avec email + facture à échéance J+2) :
```sql
with c as (
  insert into clients (tenant_id, nom, email, type)
  values ('$TENANT', 'Client Test RelDate', 'client.reldate@example.test', 'particulier')
  returning id
)
insert into factures (tenant_id, client_id, numero, statut, date_facture, date_echeance, montant_ht, montant_tva, montant_ttc)
select '$TENANT', c.id, 'F-TEST-RELDATE', 'envoyee', current_date, current_date + 2, 1000, 200, 1200
from c;
```

**Règle** (relative_date, before 3j, factures.date_echeance, email au client lié) :
```sql
insert into agent_rules (tenant_id, created_by, title, instruction, trigger_type, schedule, trigger, action, spec, status, next_run_at)
values (
  '$TENANT', '$USER',
  'TEST reldate facture', 'test relative_date',
  'event',
  '{}'::jsonb,
  '{"relative":{"entityType":"factures","dateField":"date_echeance","offsetValue":3,"offsetUnit":"days","direction":"before"},"scanEveryMinutes":720}'::jsonb,
  '{"type":"send_email","recipientKind":"client","contentInstruction":"Rappelle avec courtoisie que la facture arrive a echeance et invite a preparer le reglement."}'::jsonb,
  '{"version":2,"trigger":{"type":"event","subtype":"relative_date","scanEveryMinutes":720,"relative":{"entityType":"factures","dateField":"date_echeance","offsetValue":3,"offsetUnit":"days","direction":"before"}},"actions":[{"id":"a1","operation":"send_email","params":{"instruction":"Rappelle avec courtoisie que la facture arrive a echeance et invite a preparer le reglement."},"onFailure":"stop"}],"recipients":[{"type":"related_client","fallback":{"type":"workspace_owner"}}],"approval":{"mode":"auto"},"escalation":[],"retry":{"maxAttempts":1,"backoffMinutes":30,"retryOn":["api_error"]},"execution":{"onFailure":"stop","maxActions":8,"maxDestructiveWrites":12,"allowDelete":false},"metadata":{"test":"reldate"}}'::jsonb,
  'active', now() - interval '1 minute'
);
```

**Tick** → `curl … /api/agents/run`. Puis vérifier :
```sql
-- 1 email préparé (rédigé par IA), destinataire = email du client
select kind, to_email, subject, left(body, 200) as body_preview, status
from agent_outbox where tenant_id='$TENANT' order by created_at desc limit 5;

-- le passage a réussi et a débité le coût de la rédaction (métering V2)
select status, summary, credits_used
from agent_runs r join agent_rules ru on ru.id=r.rule_id
where ru.tenant_id='$TENANT' and ru.title='TEST reldate facture'
order by r.created_at desc limit 3;
```
✅ **Attendu** : une ligne `agent_outbox` `kind='relance'`, `to_email='client.reldate@example.test'`,
un `body` **rédigé** (pas le gabarit « Bonjour … Bien cordialement »), `status='pending'`.
Le run `success`, `credits_used > 0` (fondateur : peut rester 0 — tracé non débité).

**Idempotence** : relancer le tick. ✅ **Attendu** : `summary='rien de nouveau'`, **aucune** nouvelle
ligne outbox (la fiche a déjà « tiré » — `agent_event_fires`).
```sql
select count(*) from agent_event_fires f join agent_rules ru on ru.id=f.rule_id
where ru.tenant_id='$TENANT' and ru.title='TEST reldate facture';  -- attendu : 1
```

---

## Scénario B — Flagship « devis accepté → chantier + acompte + tâches + email » (multi-actions)

### Seed : un devis accepté, client avec email
```sql
with c as (
  insert into clients (tenant_id, nom, email, type)
  values ('$TENANT', 'Client Test Devis', 'client.devis@example.test', 'particulier')
  returning id
)
insert into devis (tenant_id, client_id, numero, statut, date_devis, date_validite, montant_ht, montant_tva, montant_ttc)
select '$TENANT', c.id, 'D-TEST-FLAGSHIP', 'accepte', current_date, current_date + 30, 10000, 2000, 12000
from c
returning id, client_id;   -- noter le devis id si besoin
```

### Règle multi-actions déterministe (spec fabriqué ; veilleur `devis_accepte`)
```sql
insert into agent_rules (tenant_id, created_by, title, instruction, trigger_type, schedule, trigger, action, spec, status, next_run_at)
values (
  '$TENANT', '$USER',
  'TEST flagship devis accepte', 'test multi-actions',
  'event', '{}'::jsonb,
  '{"watcher":"devis_accepte","params":{"days":0},"scanEveryMinutes":60}'::jsonb,
  '{"type":"act","recipientKind":"me","contentInstruction":"Ouvre le chantier, prepare l acompte, cree les taches, prepare l email."}'::jsonb,
  '{"version":2,"trigger":{"type":"event","subtype":"watcher_scan","scanEveryMinutes":60},"watcher":{"key":"devis_accepte","params":{"days":0}},"actions":[{"id":"a1","operation":"convert_quote_to_chantier","params":{},"onFailure":"continue","outputKey":"ch"},{"id":"a2","operation":"create_deposit_invoice","params":{"percentage":30},"onFailure":"continue"},{"id":"a3","operation":"create_task","params":{"instruction":"Planifier le demarrage du chantier"},"onFailure":"continue"},{"id":"a4","operation":"create_email_draft","params":{"instruction":"Remercie le client d avoir accepte le devis et annonce les prochaines etapes."},"onFailure":"continue"}],"recipients":[{"type":"related_client","fallback":{"type":"workspace_owner"}}],"approval":{"mode":"auto"},"escalation":[],"retry":{"maxAttempts":1,"backoffMinutes":30,"retryOn":["api_error"]},"execution":{"onFailure":"continue","maxActions":8,"maxDestructiveWrites":12,"allowDelete":false},"metadata":{"test":"flagship"}}'::jsonb,
  'active', now() - interval '1 minute'
);
```

**Tick** → `curl … /api/agents/run`. Puis vérifier l'état APRÈS le passage (avant validation) :
```sql
-- Attendu : 1 tâche EXÉCUTÉE (auto) + 3 items EN ATTENTE de validation :
--   workflow_step 'chantier_from_devis', workflow_step 'invoice_from_devis', relance email.
select kind, operation, subject, to_email, status
from agent_outbox where tenant_id='$TENANT' and created_at > now() - interval '5 min'
order by created_at desc;

select title, status from tasks
where tenant_id='$TENANT' and title ilike '%demarrage%' order by created_at desc limit 3;
```
✅ **Attendu** : `tasks` +1 (auto) ; `agent_outbox` = 1×`relance` (email composé) + 1×`workflow_step`
`operation='chantier_from_devis'` + 1×`workflow_step` `operation='invoice_from_devis'`, tous `pending`.

### Valider les actions (applique la transformation réelle)
Via l'UI **Agents → « à valider »** (bouton « Valider » sur les actions, « Envoyer » sur l'email),
ou par API pour chaque `id` d'outbox :
```bash
curl -s -X POST "$BASE/api/agents/outbox" -H 'content-type: application/json' \
  --cookie "…session…" -d '{"id":"<OUTBOX_ID>","decision":"send"}' | jq
```
Puis vérifier les vraies écritures :
```sql
select nom, statut from chantiers where tenant_id='$TENANT' order by created_at desc limit 2;
-- facture d'acompte avec numéro LÉGAL F-AAAA-NNN
select numero, type, statut, montant_ttc from factures
where tenant_id='$TENANT' and numero ~ '^F-[0-9]{4}-[0-9]+$' order by created_at desc limit 2;
```
✅ **Attendu** : un `chantier` créé (depuis le devis) ; une `facture` d'acompte (`numero` au format
`F-2026-NNN`, `montant_ttc ≈ 30 %` du devis). L'email part réellement à la validation.

---

## Scénario C — Gating & métering (contrôles de sûreté)

- **Gating Free** : sur un tenant **Free** (created_by ≠ fondateur), insérer la règle A2 (send_email).
  Tick → ✅ **Attendu** : la règle passe `status='blocked'`, `blocked_reason` mentionne « plan Pro »,
  `next_run_at` NULL. Aucun email préparé.
  ```sql
  select status, blocked_reason from agent_rules where tenant_id='$TENANT_FREE' and title like 'TEST%';
  ```
- **Métering** : après le Scénario A2 sur un tenant **Pro non-fondateur**, `agent_runs.credits_used > 0`
  et le solde de crédits du compte a baissé (RPC `deduct_credits_for_user`).

---

## Nettoyage (après tests)
```sql
delete from agent_outbox where tenant_id='$TENANT' and (subject like '%TEST%' or fiche_label like '%Test%');
delete from agent_event_fires f using agent_rules ru where f.rule_id=ru.id and ru.tenant_id='$TENANT' and ru.title like 'TEST%';
delete from agent_runs   r using agent_rules ru where r.rule_id=ru.id and ru.tenant_id='$TENANT' and ru.title like 'TEST%';
delete from agent_rules  where tenant_id='$TENANT' and title like 'TEST%';
delete from factures where tenant_id='$TENANT' and numero in ('F-TEST-RELDATE') or (tenant_id='$TENANT' and numero ~ '^F-[0-9]{4}-[0-9]+$' and notes is null);  -- ⚠️ vérifier avant
delete from tasks    where tenant_id='$TENANT' and title ilike '%demarrage%';
delete from chantiers where tenant_id='$TENANT' and nom ilike '%Client Test Devis%';
delete from devis    where tenant_id='$TENANT' and numero='D-TEST-FLAGSHIP';
delete from clients  where tenant_id='$TENANT' and email in ('client.reldate@example.test','client.devis@example.test');
```
> ⚠️ Le `delete from factures` de nettoyage est volontairement prudent : **relire** les lignes
> avant de supprimer (une facture d'acompte réelle a un `F-AAAA-NNN` — ne pas effacer autre chose).

---

## Grille de lecture rapide
| Test | Preuve de succès |
|------|------------------|
| A1 parseur | `spec.trigger.subtype = relative_date` sur la règle recrutée |
| A2 runner | 1 email outbox rédigé par IA + run `success` + `credits_used>0` |
| A2 idempotence | 2ᵉ tick = `rien de nouveau`, 1 seule ligne `agent_event_fires` |
| B multi-actions | tâche auto + 2 `workflow_step` + 1 `relance` en `pending` |
| B validation | `chantier` créé + `facture` `F-2026-NNN` acompte 30 % |
| C gating Free | règle `blocked`, motif « plan Pro », aucun envoi |
| C métering Pro | `credits_used>0`, solde décrémenté |
