-- ─────────────────────────────────────────────────────────────────────────────
-- 037 — Phase 1 d'extension du data model BTP : intake → argent → SAV.
--
-- Complète le workspace pour couvrir la boucle réelle d'une entreprise BTP :
--   demande client → devis → chantier → facture → PAIEMENT, et le SAV/coûts.
--
-- NOUVELLES TABLES (7), FK-natives (pas de polymorphe — 80 % des cas) :
--   • sites      — adresses/sites d'un client (facturation, chantier, siège…)
--   • demandes   — demandes/opportunités entrantes (avant le devis)
--   • commandes  — commandes / achats fournisseur
--   • depenses   — dépenses / factures fournisseur (marge chantier réelle)
--   • paiements  — encaissements sur factures client (partiels, relances, tréso)
--   • reserves   — réserves / incidents / malfaçons / litiges chantier
--   • rappels    — rappels / échéances rattachables à tout objet
--
-- CÂBLAGE des entités existantes (FK ascendantes) :
--   • chantiers/devis/interventions/factures/parc_installe/contrats  + site_id
--   • chantiers/devis/interventions                                  + demande_id
--
-- Sécurité : motif IDENTIQUE aux tables existantes (cf. 018) — tenant_id NOT NULL,
-- RLS via my_tenant_role() (SELECT = tout membre ; INSERT/UPDATE = owner/admin/
-- manager/member ; DELETE = owner/admin), trigger set_updated_at, index tenant.
-- FK en on delete set null (jamais casser une fiche parce qu'un lien disparaît).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── SITES / ADRESSES (un client peut en avoir plusieurs) ─────────────────────
create table if not exists public.sites (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete set null,
  nom           text not null,
  type          text not null default 'chantier',  -- facturation|chantier|intervention|siege|residence|immeuble|appartement|local
  adresse       text,
  ville         text,
  code_postal   text,
  contact_nom   text,
  contact_tel   text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── DEMANDES / OPPORTUNITÉS (l'intake, AVANT le devis) ───────────────────────
create table if not exists public.demandes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete set null,
  site_id       uuid references public.sites(id) on delete set null,
  titre         text not null,
  type          text not null default 'demande_prix',  -- demande_prix|sav|appel|formulaire|whatsapp|email|prospect
  canal         text,                                   -- telephone|email|whatsapp|formulaire|site|salon
  statut        text not null default 'nouveau',        -- nouveau|en_cours|converti|perdu
  priorite      text not null default 'normale',        -- basse|normale|haute
  source        text,
  description   text,
  date_demande  date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── COMMANDES / ACHATS FOURNISSEUR ───────────────────────────────────────────
create table if not exists public.commandes (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  fournisseur_id        uuid references public.suppliers(id) on delete set null,
  chantier_id           uuid references public.chantiers(id) on delete set null,
  numero                text,
  statut                text not null default 'brouillon',  -- brouillon|envoyee|confirmee|livree|annulee
  montant_ht            numeric not null default 0,
  montant_ttc           numeric not null default 0,
  date_commande         date,
  date_livraison_prevue date,
  date_livraison_reelle date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── DÉPENSES / FACTURES FOURNISSEUR (coût réel → marge chantier) ──────────────
create table if not exists public.depenses (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  fournisseur_id uuid references public.suppliers(id) on delete set null,
  chantier_id    uuid references public.chantiers(id) on delete set null,
  commande_id    uuid references public.commandes(id) on delete set null,
  numero         text,                                  -- n° de la facture fournisseur
  categorie      text not null default 'materiaux',     -- materiaux|sous_traitance|location|carburant|frais|autre
  montant_ht     numeric not null default 0,
  montant_tva    numeric not null default 0,
  montant_ttc    numeric not null default 0,
  date_depense   date,
  date_echeance  date,
  statut         text not null default 'a_payer',       -- a_payer|payee|en_retard
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── PAIEMENTS / ENCAISSEMENTS (sur factures client — partiels, tréso) ─────────
create table if not exists public.paiements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  facture_id    uuid references public.factures(id) on delete set null,
  client_id     uuid references public.clients(id) on delete set null,
  chantier_id   uuid references public.chantiers(id) on delete set null,
  montant       numeric not null default 0,
  date_paiement date,
  methode       text not null default 'virement',  -- virement|cheque|especes|cb|prelevement
  reference     text,                              -- n° chèque / réf virement
  statut        text not null default 'recu',      -- recu|en_attente|rejete
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── RÉSERVES / INCIDENTS / MALFAÇONS / LITIGES ───────────────────────────────
create table if not exists public.reserves (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  chantier_id     uuid references public.chantiers(id) on delete set null,
  client_id       uuid references public.clients(id) on delete set null,
  intervention_id uuid references public.interventions(id) on delete set null,
  assignee_id     uuid references public.employees(id) on delete set null,
  supplier_id     uuid references public.suppliers(id) on delete set null,  -- sous-traitant responsable
  titre           text not null,
  type            text not null default 'reserve',    -- reserve|malfacon|incident|litige|point_bloquant
  gravite         text not null default 'normale',    -- mineure|normale|majeure|bloquante
  statut          text not null default 'ouverte',    -- ouverte|en_cours|levee|annulee
  description     text,
  date_constat    date,
  date_resolution date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── RAPPELS / ÉCHÉANCES (rattachables à n'importe quel objet) ─────────────────
create table if not exists public.rappels (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  client_id       uuid references public.clients(id) on delete set null,
  chantier_id     uuid references public.chantiers(id) on delete set null,
  devis_id        uuid references public.devis(id) on delete set null,
  facture_id      uuid references public.factures(id) on delete set null,
  intervention_id uuid references public.interventions(id) on delete set null,
  contrat_id      uuid references public.contrats(id) on delete set null,
  document_id     uuid references public.documents(id) on delete set null,
  assignee_id     uuid references public.employees(id) on delete set null,
  titre           text not null,
  type            text not null default 'rappel',   -- rappel|relance|echeance|maintenance|rdv|expiration
  statut          text not null default 'a_faire',  -- a_faire|fait|reporte|annule
  due_date        date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── RLS + trigger updated_at + index tenant (motif identique à 018) ──────────
do $$
declare t text;
begin
  foreach t in array array['sites','demandes','commandes','depenses','paiements','reserves','rappels'] loop
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
create index if not exists idx_sites_client         on public.sites(client_id);
create index if not exists idx_demandes_client       on public.demandes(client_id);
create index if not exists idx_demandes_site         on public.demandes(site_id);
create index if not exists idx_commandes_fournisseur on public.commandes(fournisseur_id);
create index if not exists idx_commandes_chantier    on public.commandes(chantier_id);
create index if not exists idx_depenses_fournisseur  on public.depenses(fournisseur_id);
create index if not exists idx_depenses_chantier     on public.depenses(chantier_id);
create index if not exists idx_paiements_facture     on public.paiements(facture_id);
create index if not exists idx_paiements_client      on public.paiements(client_id);
create index if not exists idx_paiements_chantier    on public.paiements(chantier_id);
create index if not exists idx_reserves_chantier     on public.reserves(chantier_id);
create index if not exists idx_rappels_due           on public.rappels(tenant_id, due_date);

-- ── CÂBLAGE : sites + demandes comme rattachements des entités existantes ─────
alter table public.chantiers
  add column if not exists site_id    uuid references public.sites(id)    on delete set null,
  add column if not exists demande_id uuid references public.demandes(id) on delete set null;
alter table public.devis
  add column if not exists site_id    uuid references public.sites(id)    on delete set null,
  add column if not exists demande_id uuid references public.demandes(id) on delete set null;
alter table public.interventions
  add column if not exists site_id    uuid references public.sites(id)    on delete set null,
  add column if not exists demande_id uuid references public.demandes(id) on delete set null;
alter table public.factures
  add column if not exists site_id    uuid references public.sites(id)    on delete set null;
alter table public.parc_installe
  add column if not exists site_id    uuid references public.sites(id)    on delete set null;
alter table public.contrats
  add column if not exists site_id    uuid references public.sites(id)    on delete set null;

create index if not exists idx_chantiers_site     on public.chantiers(site_id);
create index if not exists idx_devis_site         on public.devis(site_id);
create index if not exists idx_interventions_site on public.interventions(site_id);
