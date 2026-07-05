-- ─────────────────────────────────────────────────────────────────────────────
-- 018 — Socle métier BTP complet : la couche argent + le récurrent + la mémoire.
--
-- Le workspace devient le cœur de l'entreprise (dès qu'un artisan demande
-- « mes devis en attente » ou « ma trésorerie », l'IA a de quoi le nourrir).
--
-- NOUVELLES TABLES (7) :
--   • catalogue      — bibliothèque de prix (fournitures / main d'œuvre / ouvrages)
--   • parc_installe  — équipements posés CHEZ le client (chaudière, clim, tableau…)
--   • devis          — devis avec cycle de vie
--   • factures       — factures + acomptes + situations + avoirs
--   • lignes         — lignes d'un devis OU d'une facture (TVA par ligne)
--   • pointages      — heures réelles par employé / chantier / intervention
--   • contrats       — contrats d'entretien récurrents (revenu récurrent, SAV)
--
-- ENRICHISSEMENTS :
--   • materials  — + prix achat/vente, fournisseur, seuil d'alerte (vrai stock)
--   • suppliers  — + categorie (fournisseur|sous_traitant) + assurance décennale
--
-- Sécurité : motif IDENTIQUE aux tables existantes — tenant_id NOT NULL, RLS
-- via my_tenant_role() (SELECT = tout membre ; INSERT/UPDATE = owner/admin/
-- manager/member ; DELETE = owner/admin), trigger set_updated_at, index tenant.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── CATALOGUE (bibliothèque de prix) ─────────────────────────────────────────
create table if not exists public.catalogue (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  designation   text not null,
  type          text not null default 'ouvrage',   -- fourniture|main_oeuvre|ouvrage
  reference     text,
  unite         text,                               -- u|m²|m³|ml|kg|h|forfait
  prix_achat_ht   numeric,
  prix_vente_ht   numeric,
  taux_tva      numeric not null default 20,        -- 20|10|5.5 (BTP)
  corps_metier  text,                               -- macon|electricien|plombier|chauffagiste|…
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── PARC INSTALLÉ (équipements posés chez le client — la mémoire SAV) ─────────
create table if not exists public.parc_installe (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  client_id         uuid references public.clients(id) on delete set null,
  chantier_id       uuid references public.chantiers(id) on delete set null,
  type              text not null default 'autre',  -- chaudiere|climatisation|pompe_chaleur|chauffe_eau|tableau_electrique|vmc|autre
  marque            text,
  modele            text,
  numero_serie      text,
  localisation      text,                           -- où chez le client (cave, toiture…)
  date_pose         date,
  date_garantie     date,
  dernier_entretien date,
  prochain_entretien date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── DEVIS ────────────────────────────────────────────────────────────────────
create table if not exists public.devis (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  numero        text,
  client_id     uuid references public.clients(id) on delete set null,
  chantier_id   uuid references public.chantiers(id) on delete set null,
  statut        text not null default 'brouillon',  -- brouillon|envoye|accepte|refuse|expire
  date_devis    date,
  date_validite date,
  montant_ht    numeric not null default 0,
  montant_tva   numeric not null default 0,
  montant_ttc   numeric not null default 0,
  conditions    text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── FACTURES (facture | acompte | situation | avoir) ─────────────────────────
create table if not exists public.factures (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  numero        text,
  client_id     uuid references public.clients(id) on delete set null,
  chantier_id   uuid references public.chantiers(id) on delete set null,
  devis_id      uuid references public.devis(id) on delete set null,
  type          text not null default 'facture',    -- facture|acompte|situation|avoir
  statut        text not null default 'brouillon',  -- brouillon|envoyee|payee|partiellement_payee|en_retard|annulee
  date_facture  date,
  date_echeance date,
  montant_ht    numeric not null default 0,
  montant_tva   numeric not null default 0,
  montant_ttc   numeric not null default 0,
  montant_paye  numeric not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── LIGNES (d'un devis OU d'une facture — TVA par ligne) ─────────────────────
create table if not exists public.lignes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  devis_id         uuid references public.devis(id) on delete cascade,
  facture_id       uuid references public.factures(id) on delete cascade,
  catalogue_id     uuid references public.catalogue(id) on delete set null,
  designation      text not null,
  quantite         numeric not null default 1,
  unite            text,
  prix_unitaire_ht numeric not null default 0,
  taux_tva         numeric not null default 20,
  total_ht         numeric not null default 0,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint lignes_parent_chk check (devis_id is not null or facture_id is not null)
);

-- ── POINTAGES (heures réelles — coût main d'œuvre + paie) ─────────────────────
create table if not exists public.pointages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  employee_id     uuid references public.employees(id) on delete set null,
  chantier_id     uuid references public.chantiers(id) on delete set null,
  intervention_id uuid references public.interventions(id) on delete set null,
  date_pointage   date not null,
  heures          numeric not null default 0,
  type            text not null default 'normal',   -- normal|heure_sup|trajet|absence
  valide          boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── CONTRATS D'ENTRETIEN (revenu récurrent) ──────────────────────────────────
create table if not exists public.contrats (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  client_id         uuid references public.clients(id) on delete set null,
  parc_id           uuid references public.parc_installe(id) on delete set null,
  reference         text,
  type              text not null default 'entretien',  -- entretien|maintenance|garantie
  montant           numeric,
  periodicite       text not null default 'annuel',     -- mensuel|trimestriel|semestriel|annuel
  date_debut        date,
  date_fin          date,
  prochaine_echeance date,
  statut            text not null default 'actif',       -- actif|suspendu|expire|resilie
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── RLS + triggers + index tenant (motif identique aux tables existantes) ─────
do $$
declare t text;
begin
  foreach t in array array['catalogue','parc_installe','devis','factures','lignes','pointages','contrats'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format($f$create policy %I on public.%I for select using (public.my_tenant_role(tenant_id) is not null)$f$, t||'_select', t);
    execute format($f$create policy %I on public.%I for insert with check (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'))$f$, t||'_insert', t);
    execute format($f$create policy %I on public.%I for update using (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'))$f$, t||'_update', t);
    execute format($f$create policy %I on public.%I for delete using (public.my_tenant_role(tenant_id) in ('owner','admin'))$f$, t||'_delete', t);
    execute format('drop trigger if exists %I on public.%I', 'set_'||t||'_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute procedure public.set_updated_at()', 'set_'||t||'_updated_at', t);
    execute format('create index if not exists %I on public.%I(tenant_id)', 'idx_'||t||'_tenant', t);
  end loop;
end $$;

-- Index sur les clés étrangères les plus filtrées
create index if not exists idx_parc_client       on public.parc_installe(client_id);
create index if not exists idx_devis_client       on public.devis(client_id);
create index if not exists idx_devis_chantier     on public.devis(chantier_id);
create index if not exists idx_factures_client    on public.factures(client_id);
create index if not exists idx_factures_chantier  on public.factures(chantier_id);
create index if not exists idx_lignes_devis       on public.lignes(devis_id);
create index if not exists idx_lignes_facture     on public.lignes(facture_id);
create index if not exists idx_pointages_employee on public.pointages(employee_id);
create index if not exists idx_pointages_chantier on public.pointages(chantier_id);
create index if not exists idx_contrats_client    on public.contrats(client_id);

-- Numérotation légale : un numéro de devis/facture unique par entreprise
create unique index if not exists uidx_devis_numero    on public.devis(tenant_id, numero)    where numero is not null;
create unique index if not exists uidx_factures_numero on public.factures(tenant_id, numero) where numero is not null;

-- ── ENRICHISSEMENTS des tables existantes ────────────────────────────────────
alter table public.materials
  add column if not exists prix_achat_ht numeric,
  add column if not exists prix_vente_ht numeric,
  add column if not exists fournisseur_id uuid references public.suppliers(id) on delete set null,
  add column if not exists seuil_alerte numeric;
create index if not exists idx_materials_fournisseur on public.materials(fournisseur_id);

alter table public.suppliers
  add column if not exists categorie text not null default 'fournisseur',  -- fournisseur|sous_traitant
  add column if not exists specialite text,                                -- corps de métier (sous-traitant)
  add column if not exists assurance_decennale text,                       -- n° / assureur
  add column if not exists assurance_expire date;                          -- alerte J-30
