-- ─────────────────────────────────────────────────────────────────────────────
-- 024 — Réservations de démo (« Réserver une démo »).
--
-- Formulaire PUBLIC (visiteur non connecté) sur la landing / page Tarifs.
-- Un créneau demandé (date + heure, heure de Belgique) + les infos entreprise.
-- Le propriétaire confirme ou propose un autre créneau ; le visiteur peut
-- modifier tant qu'on n'est pas à moins de 24 h du rendez-vous.
--
-- Sécurité :
--   • RLS activée SANS policy ⇒ deny-all. Tout passe par le service_role :
--     - route publique /api/demo/book (insert)
--     - gestion par JETON non devinable (client_token / admin_token)
--     - console admin (clé + liste blanche)
--   • Aucune donnée lisible par anon/authenticated directement.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.demo_bookings (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Créneau (heure de Belgique, stocké tel quel : date + "HH:00")
  slot_date     date not null,
  slot_time     text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'cancelled')),

  -- Formulaire
  company_name  text not null,
  website       text,
  headcount     text,
  looking_for   text,
  message       text,
  contact_name  text not null,
  contact_email text not null,
  contact_phone text,

  -- Jetons de gestion (liens email, non devinables)
  client_token  uuid not null default gen_random_uuid(),
  admin_token   uuid not null default gen_random_uuid(),

  -- Méta
  source_ip      text,
  confirmed_at   timestamptz,
  rescheduled_by text   -- 'client' | 'owner' | null
);

create index if not exists demo_bookings_slot_date_idx on public.demo_bookings (slot_date);
create index if not exists demo_bookings_status_idx    on public.demo_bookings (status);
create unique index if not exists demo_bookings_client_token_idx on public.demo_bookings (client_token);
create unique index if not exists demo_bookings_admin_token_idx  on public.demo_bookings (admin_token);

alter table public.demo_bookings enable row level security;
-- Aucune policy : deny-all. Accès exclusivement via service_role. Voulu.

-- updated_at auto
create or replace function public.touch_demo_bookings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists demo_bookings_touch_updated_at on public.demo_bookings;
create trigger demo_bookings_touch_updated_at
  before update on public.demo_bookings
  for each row execute function public.touch_demo_bookings_updated_at();
