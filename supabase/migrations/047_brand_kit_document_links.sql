-- ─────────────────────────────────────────────────────────────────────────────
-- 047 — IDENTITÉ VISUELLE DE L'ENTREPRISE + LIENS DE DOCUMENT
--
-- 1. BUCKET `brand` — le PREMIER binaire stocké du produit. Jusqu'ici Biltia ne
--    stockait aucun fichier (les photos partaient en base64 vers l'IA sans jamais
--    être conservées). Le logo de l'artisan a besoin d'une URL STABLE et PUBLIQUE :
--    il apparaît dans les emails envoyés à SES clients, et Gmail/Outlook refusent
--    les images en `data:` — ils exigent une vraie URL chargeable sans cookie.
--
--    Écriture : service_role UNIQUEMENT (la route /api/brand/logo vérifie owner/admin
--    avant d'écrire). Aucune policy insert/update/delete → personne d'autre ne peut
--    écrire dans le bucket, même avec un jeton utilisateur volé.
--    PNG/JPEG seulement : le SVG peut porter du script, et le moteur PDF ne sait
--    décoder NI l'un NI l'autre — un logo WebP disparaîtrait du devis sans un mot.
--
-- 2. TABLE `document_links` — un devis envoyé porte un lien « Voir et accepter ».
--    Le client ouvre la page publique, lit le devis aux couleurs de l'artisan, et
--    signe « Bon pour accord ». L'acceptation revient dans le workspace (statut
--    `accepte`) et alimente la facture 1 clic déjà en place.
--
--    UN SEUL lien par (tenant, kind, record) → renvoyer deux fois le même devis ne
--    crée pas deux liens, et la signature reste attachée au bon document.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Bucket de marque ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public             = true,
      file_size_limit    = 2097152,
      allowed_mime_types = array['image/png', 'image/jpeg'];

-- Lecture publique explicite (le bucket `public` sert déjà /object/public/… sans
-- RLS ; la policy rend l'intention lisible et couvre les accès via l'API objets).
drop policy if exists "brand_public_read" on storage.objects;
create policy "brand_public_read" on storage.objects
  for select
  using (bucket_id = 'brand');

-- ── 2. Liens de document (« Voir et accepter ») ──────────────────────────────
create table if not exists public.document_links (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  kind             text not null,                       -- 'devis' | 'facture'
  record_id        uuid not null,                       -- l'id de la fiche (devis.id / factures.id)
  token            text not null unique,                -- secret d'URL (32+ car. aléatoires)
  created_by       uuid references auth.users(id) on delete set null,
  expires_at       timestamptz,                         -- null = pas d'expiration
  revoked          boolean not null default false,
  view_count       integer not null default 0,
  viewed_at        timestamptz,                         -- 1re ouverture par le client
  accepted_at      timestamptz,
  accepted_by_name text,                                -- « Bon pour accord » : nom saisi
  accepted_ip      text,
  signature_data   text,                                -- dataURL PNG de la signature manuscrite
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint document_links_kind_chk check (kind in ('devis', 'facture')),
  constraint document_links_unique_record unique (tenant_id, kind, record_id)
);

create index if not exists document_links_token_idx     on public.document_links (token);
create index if not exists document_links_tenant_idx    on public.document_links (tenant_id);
create index if not exists document_links_record_idx    on public.document_links (tenant_id, kind, record_id);

alter table public.document_links enable row level security;

-- Le VISITEUR (client de l'artisan) n'est pas authentifié : il passe par la route
-- publique qui résout le jeton en service_role. Ces policies ne servent qu'à
-- l'artisan et son équipe, depuis l'application.
drop policy if exists "document_links_select" on public.document_links;
create policy "document_links_select" on public.document_links
  for select using (public.my_tenant_role(tenant_id) is not null);

drop policy if exists "document_links_insert" on public.document_links;
create policy "document_links_insert" on public.document_links
  for insert with check (public.my_tenant_role(tenant_id) in ('owner', 'admin', 'manager', 'member'));

drop policy if exists "document_links_update" on public.document_links;
create policy "document_links_update" on public.document_links
  for update using (public.my_tenant_role(tenant_id) in ('owner', 'admin', 'manager', 'member'));

drop policy if exists "document_links_delete" on public.document_links;
create policy "document_links_delete" on public.document_links
  for delete using (public.my_tenant_role(tenant_id) in ('owner', 'admin'));

drop trigger if exists document_links_updated_at on public.document_links;
create trigger document_links_updated_at
  before update on public.document_links
  for each row execute procedure public.set_updated_at();

comment on table public.document_links is
  'Lien public par document commercial (devis/facture) : consultation client + « Bon pour accord » signé. Un seul lien par fiche.';
