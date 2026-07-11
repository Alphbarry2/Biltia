-- ─────────────────────────────────────────────────────────────────────────────
-- 039 — Phase 2 : communication, notes terrain, validations/signatures.
--
-- Complète les hubs Client/Chantier/Intervention avec la couche « traces
-- humaines » qui manquait pour que le Workspace soit vraiment la source de
-- vérité : l'historique des ÉCHANGES, les NOTES de terrain, et les VALIDATIONS
-- (acceptation devis, signature PV/intervention, approbation document).
--
-- NOUVELLES TABLES (3), FK-natives (motif 037/038 — pas de polymorphe) :
--   • messages     — email/SMS/WhatsApp/note d'appel envoyés ou reçus (+ brouillon
--                    à valider par un humain avant envoi)
--   • notes        — note terrain / vocale / client / interne, rattachable à tout
--   • validations  — demande de validation / signature (devis, PV, facture, doc…)
--
-- Ces trois objets se rattachent par FK DIRECTES aux hubs existants (client_id,
-- chantier_id, intervention_id, devis_id, facture_id, demande_id, reserve_id,
-- task_id, supplier_id, employee_id…). L'app lisait déjà les liens ascendants
-- génériquement (FORM_FIELDS) et descendants par hub — donc rien à migrer côté
-- fiches existantes : 100 % ADDITIF, FK on delete set null (jamais casser une
-- fiche parce qu'un lien disparaît).
--
-- Sécurité : motif IDENTIQUE à 018/037/038 — tenant_id NOT NULL, RLS via
-- my_tenant_role() (SELECT = tout membre ; INSERT/UPDATE = owner/admin/manager/
-- member ; DELETE = owner/admin), trigger set_updated_at, index tenant.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── MESSAGES / COMMUNICATION (historique des échanges) ───────────────────────
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  client_id       uuid references public.clients(id)       on delete set null,
  chantier_id     uuid references public.chantiers(id)     on delete set null,
  intervention_id uuid references public.interventions(id) on delete set null,
  devis_id        uuid references public.devis(id)         on delete set null,
  facture_id      uuid references public.factures(id)      on delete set null,
  demande_id      uuid references public.demandes(id)      on delete set null,
  reserve_id      uuid references public.reserves(id)      on delete set null,
  task_id         uuid references public.tasks(id)         on delete set null,
  supplier_id     uuid references public.suppliers(id)     on delete set null,
  employee_id     uuid references public.employees(id)     on delete set null,
  agent_rule_id   uuid references public.agent_rules(id)   on delete set null,  -- agent qui a rédigé le message
  canal           text not null default 'email',       -- email|sms|whatsapp|interne|note_appel|autre
  direction       text not null default 'sortant',     -- entrant|sortant|interne
  statut          text not null default 'brouillon',   -- brouillon|a_valider|envoye|recu|echec|archive
  objet           text,
  corps           text,
  destinataire    text,                                -- email / n° du destinataire
  expediteur      text,
  date_message    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── NOTES (terrain, vocale, client, interne) ─────────────────────────────────
create table if not exists public.notes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  client_id       uuid references public.clients(id)       on delete set null,
  chantier_id     uuid references public.chantiers(id)     on delete set null,
  intervention_id uuid references public.interventions(id) on delete set null,
  devis_id        uuid references public.devis(id)         on delete set null,
  facture_id      uuid references public.factures(id)      on delete set null,
  demande_id      uuid references public.demandes(id)      on delete set null,
  reserve_id      uuid references public.reserves(id)      on delete set null,
  task_id         uuid references public.tasks(id)         on delete set null,
  supplier_id     uuid references public.suppliers(id)     on delete set null,
  lot_id          uuid references public.lots(id)          on delete set null,
  auteur_id       uuid references public.employees(id)     on delete set null,
  titre           text,
  contenu         text not null default '',
  source          text not null default 'manuel',      -- manuel|vocal|ia|import|autre
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── VALIDATIONS / SIGNATURES (acceptation, approbation, PV signé…) ───────────
create table if not exists public.validations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  client_id       uuid references public.clients(id)       on delete set null,
  chantier_id     uuid references public.chantiers(id)     on delete set null,
  intervention_id uuid references public.interventions(id) on delete set null,
  devis_id        uuid references public.devis(id)         on delete set null,
  facture_id      uuid references public.factures(id)      on delete set null,
  document_id     uuid references public.documents(id)     on delete set null,
  reserve_id      uuid references public.reserves(id)      on delete set null,
  demandeur_id    uuid references public.employees(id)     on delete set null,  -- qui a demandé la validation
  type            text not null default 'acceptation_devis',  -- acceptation_devis|validation_facture|signature_pv|signature_intervention|approbation_document|validation_reserve|autre
  statut          text not null default 'en_attente',          -- en_attente|approuve|refuse|signe|expire|annule
  signataire_nom   text,
  signataire_email text,
  signataire_tel   text,
  date_signature  timestamptz,
  motif_refus     text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── RLS + trigger updated_at + index tenant (motif identique à 018/037/038) ──
do $$
declare t text;
begin
  foreach t in array array['messages','notes','validations'] loop
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

-- Index sur les clés étrangères les plus filtrées (hubs Client / Chantier / …).
create index if not exists idx_messages_client         on public.messages(client_id);
create index if not exists idx_messages_chantier       on public.messages(chantier_id);
create index if not exists idx_messages_intervention   on public.messages(intervention_id);
create index if not exists idx_messages_devis          on public.messages(devis_id);
create index if not exists idx_messages_facture        on public.messages(facture_id);
create index if not exists idx_messages_demande        on public.messages(demande_id);
create index if not exists idx_messages_supplier       on public.messages(supplier_id);
create index if not exists idx_messages_statut         on public.messages(tenant_id, statut);

create index if not exists idx_notes_client            on public.notes(client_id);
create index if not exists idx_notes_chantier          on public.notes(chantier_id);
create index if not exists idx_notes_intervention      on public.notes(intervention_id);
create index if not exists idx_notes_demande           on public.notes(demande_id);
create index if not exists idx_notes_reserve           on public.notes(reserve_id);

create index if not exists idx_validations_client      on public.validations(client_id);
create index if not exists idx_validations_chantier    on public.validations(chantier_id);
create index if not exists idx_validations_devis       on public.validations(devis_id);
create index if not exists idx_validations_facture     on public.validations(facture_id);
create index if not exists idx_validations_intervention on public.validations(intervention_id);
create index if not exists idx_validations_statut      on public.validations(tenant_id, statut);
