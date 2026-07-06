-- ─────────────────────────────────────────────────────────────────────────────
-- 023 — Rate limiting distribué (Postgres).
--
-- Sur Vercel serverless, chaque invocation de route peut tomber sur une instance
-- différente : un compteur en mémoire ne tient pas. On stocke donc le compteur
-- en base, partagé entre toutes les instances. Fenêtre FIXE alignée sur l'epoch
-- (simple, borné, pas de scan d'historique).
--
-- Le compteur est incrémenté et lu en UN SEUL énoncé atomique (insert … on
-- conflict do update … returning) : pas de course entre deux requêtes
-- concurrentes du même utilisateur.
--
-- Sécurité :
--   • RLS activée SANS aucune policy ⇒ deny-all pour anon/authenticated. Seul le
--     service_role (client admin serveur) touche la table.
--   • check_rate_limit est SECURITY DEFINER mais RÉSERVÉE à service_role
--     (revoke public/anon/authenticated), même durcissement que 017/018.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rate_limits (
  bucket       text        primary key,          -- "<nom>:<identité>:<epoch fenêtre>"
  count        int         not null default 0,
  window_start timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- Aucune policy : deny-all pour tout rôle non-privilégié. Voulu.

-- ── RPC atomique : incrémente la fenêtre courante et dit si on dépasse ─────────
create or replace function public.check_rate_limit(
  p_key        text,
  p_limit      int,
  p_window_sec int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_bucket       text;
  v_count        int;
  v_reset        timestamptz;
begin
  if p_window_sec is null or p_window_sec <= 0 then
    raise exception 'invalid window';
  end if;

  -- Début de la fenêtre courante (fenêtre fixe alignée sur l'epoch).
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_sec) * p_window_sec);
  v_bucket       := p_key || ':' || extract(epoch from v_window_start)::bigint;
  v_reset        := v_window_start + make_interval(secs => p_window_sec);

  insert into public.rate_limits (bucket, count, window_start, updated_at)
    values (v_bucket, 1, v_window_start, now())
  on conflict (bucket) do update
    set count = public.rate_limits.count + 1,
        updated_at = now()
  returning count into v_count;

  -- Purge opportuniste (2 % des appels) des fenêtres périmées : garde la table
  -- petite sans dépendre d'un cron dédié.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 hour';
  end if;

  return jsonb_build_object(
    'allowed',   v_count <= p_limit,
    'count',     v_count,
    'limit',     p_limit,
    'remaining', greatest(0, p_limit - v_count),
    'reset',     extract(epoch from v_reset)::bigint
  );
end;
$$;

-- Réservée au service_role : jamais appelable par un utilisateur (anon/authenticated).
revoke all     on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant  execute on function public.check_rate_limit(text, int, int) to   service_role;
