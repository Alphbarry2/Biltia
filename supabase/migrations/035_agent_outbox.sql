-- ─────────────────────────────────────────────────────────────────────────────
-- 035 — Outbox des agents : relances PRÉPARÉES en attente de validation humaine.
--
-- Certaines relances ne doivent PAS partir automatiquement :
--   • #70 « relance sensible » : dès que le ton devient FERME (niveau ≥ 3 :
--     pénalités / recouvrement), l'agent prépare l'email et le met EN ATTENTE
--     au lieu de l'envoyer, puis prévient l'artisan qui valide.
--   • #67 « préparer sans envoyer » : un agent en mode brouillon (approval=always)
--     stocke CHAQUE relance ici ; rien ne part sans un clic humain.
--
-- L'exécuteur (service_role) INSÈRE la relance composée (destinataire, objet,
-- corps, niveau). L'artisan la retrouve dans /agents et clique « Envoyer » ou
-- « Ignorer ». L'envoi réel se fait alors via le canal habituel (Gmail/Biltia).
--
-- Sécurité (même modèle que 034 form_submissions) :
--   • RLS activée. Lecture + mise à jour (envoyer/ignorer) réservées aux MEMBRES
--     du tenant via public.my_tenant_role(tenant_id).
--   • AUCUNE policy INSERT / anon : seul le service_role (l'exécuteur d'agents)
--     insère. Un membre ne fabrique jamais une relance à la main ici.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.agent_outbox (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  tenant_id   uuid not null references public.tenants(id)      on delete cascade,
  rule_id     uuid          references public.agent_rules(id)  on delete cascade,
  -- Créateur de l'agent (pour la notification et le reply-to du repli d'envoi).
  created_by  uuid,
  -- Fiche déclenchante (traçabilité ; texte car certaines clés sont préfixées).
  fiche_id    text,
  fiche_label text,
  -- Nature de la pièce en attente (aujourd'hui : 'relance').
  kind        text not null default 'relance',
  -- Niveau d'escalade de la relance (1 doux … 3+ ferme).
  level       int  not null default 1,
  -- Le message PRÊT à partir (composé par l'IA).
  to_email    text not null,
  subject     text not null,
  body        text not null,
  -- Cycle de vie : 'pending' → 'sent' (validé/envoyé) | 'discarded' (ignoré).
  status      text not null default 'pending' check (status in ('pending', 'sent', 'discarded')),
  decided_at  timestamptz,
  decided_by  uuid,
  updated_at  timestamptz not null default now()
);
create index if not exists agent_outbox_tenant_idx on public.agent_outbox (tenant_id, status, created_at desc);
create index if not exists agent_outbox_rule_idx   on public.agent_outbox (rule_id);

-- updated_at auto (même fonction partagée que les autres tables, migration 018).
drop trigger if exists set_agent_outbox_updated_at on public.agent_outbox;
create trigger set_agent_outbox_updated_at
  before update on public.agent_outbox
  for each row execute procedure public.set_updated_at();

alter table public.agent_outbox enable row level security;

-- Lecture réservée aux membres du tenant.
drop policy if exists agent_outbox_select on public.agent_outbox;
create policy agent_outbox_select on public.agent_outbox
  for select using ( public.my_tenant_role(tenant_id) is not null );

-- Mise à jour (envoyer / ignorer : passage du statut) réservée aux membres.
drop policy if exists agent_outbox_update on public.agent_outbox;
create policy agent_outbox_update on public.agent_outbox
  for update
  using      ( public.my_tenant_role(tenant_id) is not null )
  with check ( public.my_tenant_role(tenant_id) is not null );

-- PAS de policy INSERT / anon : seul l'exécuteur (service_role) crée une relance
-- en attente, après avoir composé le message. Les membres ne font que décider.
