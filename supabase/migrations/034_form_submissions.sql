-- ─────────────────────────────────────────────────────────────────────────────
-- 034 — Formulaires publics (capture de leads) — slice 4 du modèle de partage.
--
-- 1) Élargit app_share_links.kind à 'form' : un lien tokenisé qui, au lieu d'une
--    LECTURE seule ('preview'/'client'), autorise une ÉCRITURE BORNÉE — une
--    soumission de formulaire. Le token reste attaché à un module du tenant
--    (la contrainte cross-tenant de 032 reste valable, module_id non touché).
--    scope = { formType:'lead', title, intro, fields:[{key,label,type,required}] }.
--
-- 2) Table form_submissions : l'intake BRUT (nom/tel/email/message…). Le lead
--    atterrit ICI, séparé des vrais clients : pas de pollution du CRM, et un
--    déclencheur PROPRE pour le veilleur `nouveau_lead` (une nouvelle ligne =
--    un nouveau lead, sans confondre avec un client saisi à la main). L'artisan
--    convertit ensuite la soumission en client (status → 'converted', client_id).
--
-- Sécurité (même modèle que 029/030 + demo_bookings 024) :
--   • RLS activée. Lecture / gestion (statut, conversion) réservées aux MEMBRES
--     du tenant via public.my_tenant_role(tenant_id).
--   • AUCUNE policy anon / insert : l'insertion PUBLIQUE passe par le
--     service_role (endpoint /api/share/submit) qui résout le token et impose le
--     tenant. Honeypot + rate-limit sont appliqués côté endpoint (applicatif).
--   • On ne supprime pas une soumission suspecte : on la passe en 'archived'.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Autoriser le niveau 'form' sur les liens de partage (drop/add idempotent).
alter table public.app_share_links
  drop constraint if exists app_share_links_kind_check;
alter table public.app_share_links
  add constraint app_share_links_kind_check
  check (kind in ('preview', 'client', 'form'));

-- 2) Intake des soumissions de formulaire public.
create table if not exists public.form_submissions (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  tenant_id     uuid not null references public.tenants(id)         on delete cascade,
  share_link_id uuid not null references public.app_share_links(id) on delete cascade,
  -- Données brutes du formulaire (nom, tel, email, message, …). Jamais de secret.
  payload       jsonb not null default '{}'::jsonb,
  -- Cycle de vie : 'new' → 'converted' (devenu client) | 'archived' (ignoré/spam).
  status        text not null default 'new' check (status in ('new', 'converted', 'archived')),
  -- Client créé à la conversion (piste d'audit ; null tant que non converti).
  client_id     uuid references public.clients(id) on delete set null,
  updated_at    timestamptz not null default now()
);
create index if not exists form_submissions_tenant_idx on public.form_submissions (tenant_id, created_at desc);
create index if not exists form_submissions_link_idx   on public.form_submissions (share_link_id);

-- updated_at auto (même fonction que les entités BTP, migration 018).
drop trigger if exists set_form_submissions_updated_at on public.form_submissions;
create trigger set_form_submissions_updated_at
  before update on public.form_submissions
  for each row execute procedure public.set_updated_at();

alter table public.form_submissions enable row level security;

-- Lecture réservée aux membres du tenant.
drop policy if exists form_submissions_select on public.form_submissions;
create policy form_submissions_select on public.form_submissions
  for select using ( public.my_tenant_role(tenant_id) is not null );

-- Mise à jour (statut, conversion en client) réservée aux membres du tenant.
drop policy if exists form_submissions_update on public.form_submissions;
create policy form_submissions_update on public.form_submissions
  for update
  using      ( public.my_tenant_role(tenant_id) is not null )
  with check ( public.my_tenant_role(tenant_id) is not null );

-- PAS de policy INSERT / anon : la soumission publique passe UNIQUEMENT par le
-- service_role (endpoint /api/share/submit), après résolution du token. Les
-- membres n'insèrent jamais en direct (une soumission vient du formulaire public).
