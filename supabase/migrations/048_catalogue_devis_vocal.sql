-- ─────────────────────────────────────────────────────────────────────────────
-- 048 — SOCLE DU DEVIS VOCAL : catalogue reconnaissable, prix traçable.
--
-- POURQUOI
-- Le parseur vocal existe (biltia.parseDevis → app-ai/parse_devis) mais il ne voit
-- PAS le catalogue : son prompt lui interdit d'inventer un prix, donc toute ligne
-- non dictée sort à 0 €. L'artisan doit dicter chaque tarif — exactement ce qu'on
-- veut supprimer. Le chaînon manquant n'est pas l'IA : c'est un catalogue capable
-- d'être RETROUVÉ (alias, mots-clés) et un prix capable d'être TRACÉ (d'où il vient,
-- de quand il date).
--
-- CE QUE ÇA AJOUTE
--   • catalogue      : alias/mots-clés (« double prise » = « prise double »), marque,
--                      fraîcheur du prix, marge cible, fournisseur, temps de pose.
--   • catalogue_composants : un OUVRAGE = plusieurs ressources (« pose d'un point
--                      lumineux » = douille + câble + 45 min de main d'œuvre).
--   • lignes         : l'ORIGINE du prix (dicté ? catalogue ? calculé ?) et la
--                      confiance de correspondance → une ligne au prix douteux est
--                      identifiable APRÈS coup, pas seulement au moment du devis.
--   • devis          : acompte_pct (« un acompte de 30 % » se dicte, doit se stocker).
--   • pg_trgm        : recherche floue sur la désignation (« tablo » → « Tableau »).
--
-- 100 % ADDITIF : que des colonnes nullables ou à défaut, et une table neuve. Aucune
-- écriture existante ne casse, l'app actuelle et les 105 articles en base continuent
-- de fonctionner à l'identique. Réversible (drop column / drop table).
--
-- Prod-drift : `db pull` avant DDL.
-- ─────────────────────────────────────────────────────────────────────────────

-- Recherche floue : « tablo 18 module » doit retrouver « Tableau électrique 18 modules ».
create extension if not exists pg_trgm;

-- ── CATALOGUE : de la simple liste de prix au référentiel reconnaissable ─────
alter table public.catalogue
  -- Ce que l'artisan DIT, en face de ce que le catalogue ÉCRIT. Sans ça, aucune
  -- dictée ne retombe sur le bon article (§6 de la mission).
  add column if not exists aliases text[] not null default '{}',
  add column if not exists mots_cles text[] not null default '{}',
  add column if not exists marque text,
  add column if not exists modele text,
  -- Un article retiré ne doit plus être proposé, mais reste lié aux anciens devis.
  add column if not exists actif boolean not null default true,
  -- FRAÎCHEUR DU PRIX. `updated_at` ne convient pas : il bouge dès qu'on corrige une
  -- faute de frappe dans la désignation. Un prix « à jour » doit dire QUAND LE PRIX
  -- a changé, pas quand la ligne a été touchée.
  add column if not exists prix_maj_le timestamptz,
  -- D'où vient ce prix : saisi | fournisseur | calculé (achat + marge) | importé.
  add column if not exists prix_source text not null default 'manuel',
  -- Marge cible → prix de vente calculable depuis le prix d'achat quand il manque.
  add column if not exists marge_cible_pct numeric,
  add column if not exists fournisseur_id uuid references public.suppliers(id) on delete set null,
  -- Ouvrages : de quoi recalculer une composition (temps de pose + fournitures).
  add column if not exists minutes_pose numeric,
  add column if not exists cout_materiel_estime numeric,
  -- Politique de prix d'un OUVRAGE : prix de vente forfaitaire, somme des composants
  -- + marge, ou mixte. Sans objet pour une fourniture simple.
  add column if not exists mode_tarif text not null default 'prix_fixe';

-- Les 105 articles existants ont un prix, mais on ne sait pas de quand il date.
-- On l'initialise à leur dernière modification connue : c'est la seule information
-- honnête dont on dispose (ne PAS mettre now(), ce serait prétendre qu'ils sont frais).
update public.catalogue set prix_maj_le = updated_at where prix_maj_le is null;

comment on column public.catalogue.prix_maj_le is
  'Date du dernier changement de PRIX (≠ updated_at qui bouge à toute modification). Pilote l''avertissement de prix ancien.';
comment on column public.catalogue.mode_tarif is
  'Ouvrages : prix_fixe | somme_composants | fixe_plus_variable. Sans objet pour une fourniture.';

-- ── OUVRAGES COMPOSÉS : « pose d'une prise double » = prise + câble + 45 min ──
create table if not exists public.catalogue_composants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ouvrage_id uuid not null references public.catalogue(id) on delete cascade,
  -- restrict : on n'efface pas un article encore utilisé dans un ouvrage sans le voir.
  composant_id uuid not null references public.catalogue(id) on delete restrict,
  quantite numeric not null default 1,
  -- Quantité VARIABLE selon le devis (« 8 m de câble par prise ») : formule évaluée
  -- par le moteur déterministe (biltiaUI.compute), jamais par un eval().
  formule_quantite text,
  perte_pct numeric not null default 0,
  optionnel boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un ouvrage ne peut pas se contenir lui-même (garde-fou de premier niveau ; les
  -- cycles plus profonds sont bornés par une profondeur max côté serveur).
  constraint catalogue_composants_pas_soi_meme check (ouvrage_id <> composant_id)
);

create unique index if not exists uidx_catalogue_composants
  on public.catalogue_composants (ouvrage_id, composant_id);
create index if not exists idx_catalogue_composants_tenant
  on public.catalogue_composants (tenant_id);
create index if not exists idx_catalogue_composants_composant
  on public.catalogue_composants (composant_id);

-- RLS : motif IDENTIQUE aux tables métier (018) — lecture = tout membre,
-- écriture = owner/admin/manager/member, suppression = owner/admin.
alter table public.catalogue_composants enable row level security;

drop policy if exists catalogue_composants_select on public.catalogue_composants;
create policy catalogue_composants_select on public.catalogue_composants
  for select using (public.my_tenant_role(tenant_id) is not null);

drop policy if exists catalogue_composants_insert on public.catalogue_composants;
create policy catalogue_composants_insert on public.catalogue_composants
  for insert with check (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

drop policy if exists catalogue_composants_update on public.catalogue_composants;
create policy catalogue_composants_update on public.catalogue_composants
  for update using (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

drop policy if exists catalogue_composants_delete on public.catalogue_composants;
create policy catalogue_composants_delete on public.catalogue_composants
  for delete using (public.my_tenant_role(tenant_id) in ('owner','admin'));

drop trigger if exists set_catalogue_composants_updated_at on public.catalogue_composants;
create trigger set_catalogue_composants_updated_at
  before update on public.catalogue_composants
  for each row execute procedure public.set_updated_at();

-- ── LIGNES : la PROVENANCE du prix (le cœur de « ne jamais inventer un prix ») ─
alter table public.lignes
  -- prix_dicte | catalogue | calcule_marge | suggestion_historique | a_saisir
  -- Une ligne « a_saisir » est une ligne SANS prix fiable : le devis ne part pas
  -- tant qu'elle n'est pas tranchée. C'est ce champ qui rend la règle vérifiable
  -- APRÈS coup, et pas seulement au moment de la dictée.
  add column if not exists origine_prix text,
  add column if not exists confiance_match numeric,
  add column if not exists remise_pct numeric not null default 0,
  -- L'ouvrage d'où la ligne est issue, quand elle est le DÉTAIL d'un ouvrage éclaté.
  add column if not exists ouvrage_id uuid references public.catalogue(id) on delete set null;

comment on column public.lignes.origine_prix is
  'prix_dicte | catalogue | calcule_marge | suggestion_historique | a_saisir. « a_saisir » = aucun prix fiable trouvé.';

-- ── DEVIS : les conditions se dictent (« acompte de 30 % »), donc se stockent ──
alter table public.devis
  add column if not exists acompte_pct numeric;

-- ── INDEX DE RECHERCHE DU CATALOGUE (le moteur de correspondance s'appuie dessus) ─
create index if not exists idx_catalogue_designation_trgm
  on public.catalogue using gin (designation gin_trgm_ops);
create index if not exists idx_catalogue_aliases
  on public.catalogue using gin (aliases);
create index if not exists idx_catalogue_mots_cles
  on public.catalogue using gin (mots_cles);
create index if not exists idx_catalogue_tenant_actif
  on public.catalogue (tenant_id, actif);
