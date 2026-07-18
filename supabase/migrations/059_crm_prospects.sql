-- ─────────────────────────────────────────────────────────────────────────────
-- 059 — CRM prospection (console admin).
--
-- Outil INTERNE (pas un module client) : Biltia suit ses propres prospects
-- (entreprises démarchées) via un import CSV/Excel + pipeline kanban. Rien à
-- voir avec le CRM clients (public.customers, migration 036) qui appartient
-- aux tenants — ici il n'y a qu'UN SEUL utilisateur : l'équipe Biltia.
--
-- Sécurité : même motif que demo_bookings (024) — RLS activée SANS policy
-- (deny-all), accès exclusivement via service_role depuis des routes déjà
-- gardées par la double barrière de la console admin (clé de chemin +
-- liste blanche d'emails, lib/admin.ts).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.crm_prospects (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  company_name   text not null,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  website        text,
  sector         text,
  city           text,

  status         text not null default 'prospect'
                   check (status in ('prospect', 'contacted', 'pending', 'signed', 'refused')),

  -- Ligne brute d'origine (import CSV/Excel), pour retrouver une colonne non
  -- mappée sans devoir re-uploader le fichier.
  raw_import     jsonb,
  source_file    text,
  created_by     text
);

create index if not exists crm_prospects_status_idx     on public.crm_prospects (status);
create index if not exists crm_prospects_created_at_idx  on public.crm_prospects (created_at desc);

alter table public.crm_prospects enable row level security;
-- Aucune policy : deny-all. Accès exclusivement via service_role. Voulu.

create or replace function public.touch_crm_prospects_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists crm_prospects_touch_updated_at on public.crm_prospects;
create trigger crm_prospects_touch_updated_at
  before update on public.crm_prospects
  for each row execute function public.touch_crm_prospects_updated_at();

-- Notes horodatées par prospect (journal de suivi, pas un champ unique écrasé
-- à chaque appel).
create table if not exists public.crm_prospect_notes (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  prospect_id   uuid not null references public.crm_prospects(id) on delete cascade,
  body          text not null,
  author        text
);

create index if not exists crm_prospect_notes_prospect_idx on public.crm_prospect_notes (prospect_id, created_at desc);

alter table public.crm_prospect_notes enable row level security;
-- Aucune policy : deny-all. Accès exclusivement via service_role. Voulu.
