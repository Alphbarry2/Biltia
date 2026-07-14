-- ─────────────────────────────────────────────────────────────────────────────
-- 055 — UNE CONNEXION PAR OUTIL, PLUS PAR COMPTE.
--
-- LE BUG (constaté le 2026-07-14) : connecter Gmail faisait passer Google Agenda
-- en « Connecté » tout seul.
--
-- Pourquoi : on demande à Google `include_granted_scopes=true` (autorisation
-- incrémentale), donc Google renvoie un jeton portant TOUS les droits jamais
-- accordés à l'application — pas seulement ceux qu'on vient de demander. Le
-- callback fusionnait ces scopes, et l'état d'une carte se DÉDUISAIT uniquement
-- des scopes stockés. Un droit Agenda accordé lors d'un essai précédent (et jamais
-- révoqué chez Google, car « Déconnecter » ne supprimait que la ligne locale)
-- ressuscitait donc à la première reconnexion Gmail.
--
-- LE CORRECTIF : on cesse de DÉDUIRE l'activation depuis les scopes, on la
-- MÉMORISE. `connectors` porte ce que l'artisan a explicitement branché ; les
-- `scopes` stockés sont désormais filtrés sur ces connecteurs-là. Tout le code
-- existant (gmailStatus, googleCalendarConnected, microsoftStatus) continue de
-- lire les scopes : il devient correct sans être touché.
--
-- On garde UNE ligne de jeton par fournisseur : c'est indispensable (un même
-- jeton Google doit couvrir Gmail ET l'Agenda si les deux sont branchés). Ce
-- n'est pas le jeton qui devient individuel, c'est l'INTENTION.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_connections
  add column if not exists connectors text[] not null default '{}';

comment on column public.user_connections.connectors is
  'Ids des connecteurs (gmail, google-calendar…) que l''utilisateur a EXPLICITEMENT branchés. Source de vérité de l''activation : ne jamais la redéduire des scopes, que le fournisseur peut renvoyer en trop (include_granted_scopes).';

-- BACKFILL — on part des scopes déjà accordés : personne ne doit voir un outil
-- qui marchait passer « déconnecté » du jour au lendemain. Le filtre `provider`
-- est indispensable : '%mail.send%' matcherait aussi bien 'gmail.send' que
-- 'Mail.Send', et Outlook se retrouverait activé chez les utilisateurs Google.
update public.user_connections uc
set connectors = array_remove(array[
  case when uc.provider = 'google'    and exists (select 1 from unnest(uc.scopes) s where s ilike '%gmail.send%')                then 'gmail'            end,
  case when uc.provider = 'google'    and exists (select 1 from unnest(uc.scopes) s where s ilike '%calendar.events%')           then 'google-calendar'  end,
  case when uc.provider = 'google'    and exists (select 1 from unnest(uc.scopes) s where s ilike '%drive.file%')                then 'google-drive'     end,
  case when uc.provider = 'microsoft' and exists (select 1 from unnest(uc.scopes) s where s ilike '%/mail.send%')                then 'outlook'          end,
  case when uc.provider = 'microsoft' and exists (select 1 from unnest(uc.scopes) s where s ilike '%calendars.readwrite%')       then 'outlook-calendar' end,
  case when uc.provider = 'microsoft' and exists (select 1 from unnest(uc.scopes) s where s ilike '%files.readwrite.appfolder%') then 'onedrive'         end
], null)
where uc.connectors = '{}';
