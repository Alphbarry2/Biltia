-- ─────────────────────────────────────────────────────────────────────────────
-- 031 — Lien compte ↔ fiche employé (périmètre employé, slice 3 du partage).
--
-- Aujourd'hui rien ne relie un COMPTE qui se connecte (auth.users / tenant_members)
-- à une FICHE employé (public.employees) ni à un chantier. Or toutes les
-- affectations pointent vers employees.id (chantiers.chef_chantier_id,
-- interventions.employee_id, tasks.assignee_id). On ajoute donc le seul chaînon
-- manquant : employees.user_id.
--
-- Le patron/admin relie chaque personne invitée à sa fiche (réglages Équipe).
-- Ensuite, un compte de rôle « member » relié ne voit QUE ses chantiers (ceux
-- dont il est chef, ou sur lesquels il a une intervention/tâche) et leurs enfants.
-- Compte non relié → aucune restriction (rien ne casse pour l'existant).
--
-- Additive et réversible. Aucune policy à changer (la lecture reste tenant-RLS ;
-- le périmètre est appliqué côté /api/data, au-dessus du RLS).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.employees
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Un compte est relié à au plus une fiche employé par espace (unicité souple :
-- index partiel, ne gêne pas les fiches sans compte).
create unique index if not exists employees_tenant_user_uidx
  on public.employees (tenant_id, user_id)
  where user_id is not null;
