-- ─────────────────────────────────────────────────────────────────────────────
-- 016 — CONNEXIONS OAUTH PAR UTILISATEUR (Google / Microsoft).
--
-- Stocke les jetons OAuth des outils connectés (Gmail, Calendars, Drive,
-- OneDrive…). Les jetons ne doivent JAMAIS atteindre le navigateur :
-- RLS activée SANS policy → seule service_role lit/écrit. L'API
-- /api/connections n'expose que provider / scopes / connected_at.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  -- Scopes OAuth accordés (cumulés au fil des connexions incrémentales).
  scopes text[] not null default '{}',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, provider)
);

alter table public.user_connections enable row level security;
-- Volontairement AUCUNE policy : accès service_role uniquement (défense en
-- profondeur, même si un client authentifié tentait un accès direct).

create index if not exists user_connections_lookup
  on public.user_connections (tenant_id, user_id);
