// ─────────────────────────────────────────────────────────────────────────────
// GÉNÉRÉ (Phase 4) — NE PAS ÉDITER À LA MAIN via un outil de masse.
// Description LLM des veilleurs, découpée SANS PERTE depuis la description
// historique (agent-rules.ts) en un doc par veilleur. buildEventWatcherDescription()
// la reconstitue à l'identique (snapshot testé). Décrire un veilleur = éditer
// PARSER_DOCS ici (un seul endroit) au lieu d'une string monolithique.
// ─────────────────────────────────────────────────────────────────────────────

const PREFIX = "OBLIGATOIRE si trigger_type=event : le veilleur qui colle. ";

/** [clé, description LLM] dans l'ordre exact de la description historique. */
export const PARSER_DOCS: [string, string][] = [
  ["chantier_en_retard", "chantiers qui dépassent leur DATE de fin prévue (déjà en retard, APRÈS la date). "],
  ["chantier_fin_proche", "chantiers dont la date de fin prévue APPROCHE / va bientôt arriver (alerter AVANT l'échéance, « préviens-moi quand un chantier arrive bientôt à son terme ») — à distinguer de chantier_en_retard qui agit APRÈS. "],
  ["chantier_hors_budget", "chantiers dont le BUDGET/coût engagé dépasse le budget prévu (marge, rentabilité, « dépasse son budget »). "],
  ["chantier_sans_activite", "chantiers en cours qui N'AVANCENT PLUS / stagnent / pas bougé depuis X jours. "],
  ["chantier_sans_devis", "chantiers démarrés SANS devis signé (accepté). "],
  ["chantier_termine", "un chantier vient d'être TERMINÉ (demande d'avis au client, remerciement, solde à facturer). "],
  ["demande_urgente", "demandes/interventions clients URGENTES restées sans réponse (SAV, dépannage urgent, « alerte-moi si une demande urgente traîne » — l'IA lit la description pour juger l'urgence). "],
  ["devis_non_signe", "devis envoyés sans réponse. "],
  ["devis_accepte", "un devis vient d'être ACCEPTÉ/signé par le client (confirmer/remercier + prochaines étapes, OU créer le chantier/la facture). "],
  ["devis_expire_bientot", "un devis ENVOYÉ approche de sa DATE DE VALIDITÉ / va bientôt EXPIRER (relancer le client avant qu'il ne soit plus valable, ou prévenir l'artisan). "],
  ["facture_echeance_proche", "une facture non soldée approche de sa DATE D'ÉCHÉANCE / va BIENTÔT être due (rappel de paiement AVANT le retard, ou alerte à l'artisan) — À DISTINGUER de facture_impayee qui agit APRÈS l'échéance. "],
  ["facture_impayee", "factures ÉCHUES non payées / impayés / relances de paiement (l'échéance est DÉJÀ dépassée). "],
  ["facture_payee", "une facture vient d'être RÉGLÉE (remercier le client). "],
  ["echeance_proche", "documents, attestations, assurances, contrats d'entretien ou entretiens qui arrivent à échéance / expirent. "],
  ["visite_terminee", "une intervention/visite chantier vient d'être TERMINÉE, y compris exprimé comme « un salarié/ouvrier/gars finit son travail / sa tâche / son intervention / son chantier » (= une intervention assignée passe en terminé ; « préviens-moi » → notify, « fais le compte-rendu » → compte_rendu). "],
  ["rdv_demain", "un RDV/intervention client est prévu PROCHAINEMENT (rappeler le client avant le RDV, « rappelle au client son rendez-vous la veille »). "],
  ["conflit_planning", "deux interventions d'un MÊME intervenant se CHEVAUCHENT / se superposent dans le planning (« préviens-moi s'il y a un conflit de planning », « si un gars est sur deux chantiers en même temps », « alerte-moi en cas de double réservation ») → notify le patron. "],
  ["intervention_annulee", "un RDV/intervention vient d'être ANNULÉ (statut annulé) et il faut prévenir le client ou le patron (« quand un rendez-vous est annulé, préviens le client », « en cas d'annulation »). "],
  ["tache_en_retard", "des TÂCHES dont l'échéance est DÉPASSÉE et pas terminées (« préviens-moi des tâches en retard », « alerte si une tâche traîne / n'est pas commencée à temps »). "],
  ["tache_terminee", "une TÂCHE vient d'être TERMINÉE / cochée (« préviens-moi quand une tâche est finie »). "],
  ["tache_sans_responsable", "des TÂCHES ouvertes SANS personne assignée (« signale les tâches que personne ne prend », « les tâches sans intervenant »). "],
  ["chantier_sans_responsable", "des CHANTIERS actifs SANS chef de chantier désigné (« préviens-moi si un chantier n'a pas de responsable / de chef »). "],
  ["equipe_surchargee", "un INTERVENANT a TROP de travail ouvert (tâches + interventions) au-delà d'un seuil (« préviens-moi si quelqu'un est surchargé », « détecte les gars débordés ») → notify le patron. "],
  ["nouveau_lead", "une nouvelle demande arrive via un FORMULAIRE public (un lead/prospect à traiter). "],
  ["nouveau_client", "une fiche CLIENT vient d'être créée (« à chaque nouveau client, crée… »). "],
  ["nouveau_chantier", "une fiche CHANTIER vient d'être créée (« quand j'ajoute un chantier, crée les tâches / le devis »). "],
  ["client_inactif", "un CLIENT n'a plus AUCUNE activité (devis, facture, intervention) depuis longtemps et serait à recontacter/relancer (« mes clients inactifs », « les clients qu'on n'a pas vus depuis 6 mois », « relance ceux qui dorment »). "],
  ["pointage_manquant", "des EMPLOYÉS n'ont PAS POINTÉ récemment / il manque des heures / une journée sans pointage (« préviens-moi si un ouvrier n'a pas pointé », « alerte-moi des heures non remplies », « qui n'a pas fait ses heures »). "],
  ["heures_a_valider", "des heures/pointages restent NON VALIDÉS et attendent une validation (« préviens-moi des heures à valider », « les pointages pas encore validés »). "],
  ["heures_incoherentes", "des heures pointées sont ANORMALES / incohérentes / trop élevées sur une journée (« signale les pointages bizarres / aberrants », « si quelqu'un pointe plus de 12h dans la journée »). "],
  ["chantier_trop_heures", "un CHANTIER consomme TROP d'heures de main-d'œuvre au-delà d'un seuil (« alerte-moi si un chantier dépasse X heures », « le chantier consomme trop d'heures »). "],
  ["document_a_regulariser", "des DOCUMENTS/attestations sont MANQUANTS ou DÉJÀ EXPIRÉS et à régulariser (« préviens-moi des documents manquants », « mes attestations périmées / plus à jour », « papiers à régulariser ») — à distinguer de echeance_proche qui alerte AVANT l'expiration. "],
  ["assurance_expiree", "l'assurance DÉCENNALE d'un fournisseur/sous-traitant est DÉJÀ EXPIRÉE (« alerte-moi si la décennale d'un sous-traitant est périmée / n'est plus valable ») — risque de conformité. "],
  ["clients_doublons", "des fiches CLIENTS font DOUBLON / sont en double (même email ou téléphone) (« détecte les doublons clients », « préviens-moi si j'ai deux fois le même client »). "],
  ["client_mauvais_payeur", "un CLIENT cumule plusieurs factures ÉCHUES IMPAYÉES / paie mal (« signale mes mauvais payeurs », « les clients qui paient mal / en retard tout le temps ») — À DISTINGUER de facture_impayee qui relance UNE facture ; ici on qualifie le CLIENT. "],
  ["sous_traitant_a_probleme", "un SOUS-TRAITANT cumule des RÉSERVES/incidents/malfaçons ouverts (« signale les sous-traitants à problème », « quels sous-traitants posent souci »). "],
  ["sous_traitant_sans_assurance", "un SOUS-TRAITANT n'a PAS d'assurance décennale renseignée (« préviens-moi des sous-traitants sans assurance / pas assurés / sans décennale ») — à distinguer de assurance_expiree (décennale DÉJÀ expirée). "],
  ["documents_a_classer", "des DOCUMENTS/fichiers sont uploadés SANS rattachement (à ranger/classer) (« signale les documents à classer », « les fichiers non rangés / en vrac »). "],
  ["chantier_sans_photo", "un CHANTIER TERMINÉ n'a AUCUNE photo au dossier (« préviens-moi des chantiers finis sans photo », « les chantiers livrés sans photo de fin »). "],
  ["intervention_sans_responsable", "une INTERVENTION/SAV ouverte n'a PERSONNE d'assigné (« les SAV sans technicien / sans responsable », « interventions non affectées »). "],
  ["intervention_sans_date", "une INTERVENTION/SAV ouverte n'a PAS de date prévue / n'est pas planifiée (« les SAV sans date », « interventions à planifier »). "],
  ["intervention_en_retard", "une INTERVENTION/SAV a sa date prévue DÉPASSÉE et n'est pas terminée (« les SAV en retard / dépassés / non traités », « interventions qui traînent »). "],
  ["commande_en_retard", "une COMMANDE fournisseur a sa LIVRAISON en retard / n'est pas arrivée (« relance le fournisseur si la commande tarde », « préviens-moi si une commande / livraison est en retard ou bloque un chantier »). "],
  ["achat_non_affecte", "des DÉPENSES / ACHATS / FACTURES FOURNISSEUR ne sont RATTACHÉS À AUCUN CHANTIER (« signale les achats non affectés », « les factures fournisseurs non classées », « les dépenses sans chantier ») — fausse la marge. "],
  ["facture_fournisseur_a_payer", "des FACTURES FOURNISSEUR / dépenses sont À PAYER et leur échéance est DÉPASSÉE (« ce que je dois aux fournisseurs », « les factures fournisseurs à régler / en retard de paiement », « préviens-moi de ce qu'il faut payer ») — À DISTINGUER de facture_impayee qui concerne l'argent que les CLIENTS nous doivent ; ici c'est ce que NOUS devons. "],
  ["chantier_sans_budget", "des CHANTIERS actifs n'ont AUCUN budget renseigné (« les chantiers sans budget / sans marge renseignée », « détecte les chantiers dont je n'ai pas chiffré le budget ») — impossible de piloter la marge sans montant de référence, à distinguer de chantier_hors_budget qui compare un budget EXISTANT au coût engagé. "],
  ["devis_accepte_sans_chantier", "un DEVIS est ACCEPTÉ mais le CHANTIER n'a pas encore été ouvert / créé (« préviens-moi si un devis signé n'a pas de chantier », « les devis acceptés sans chantier ouvert », « quand un devis est accepté et qu'on n'a pas démarré le chantier ») — à distinguer de chantier_sans_devis (chantier existant SANS devis signé). "],
  ["chantier_termine_non_facture", "un CHANTIER est TERMINÉ mais AUCUNE facture n'a été émise (« les chantiers finis pas encore facturés », « préviens-moi si un chantier terminé n'est pas facturé », « le travail est livré mais pas facturé ») — à distinguer de facture_impayee (facture émise mais pas payée). "],
  ["facture_brouillon_non_envoyee", "une FACTURE reste en BROUILLON, jamais envoyée (« mes factures en brouillon », « les factures préparées mais pas envoyées », « des factures qui traînent en brouillon ») — à distinguer de facture_impayee (facture ENVOYÉE non payée). "],
  ["rappel_echu", "un RAPPEL / une échéance programmée arrivé à terme et pas encore traité (« mes rappels du jour », « les relances programmées arrivées à échéance », « ce qui était à faire aujourd'hui »). Vide si trigger_type=schedule."],
];

/** Reconstruit la description `event_watcher` (identique à l'historique). */
export function buildEventWatcherDescription(): string {
  return PREFIX + PARSER_DOCS.map(([k, d]) => k + " = " + d).join("");
}
