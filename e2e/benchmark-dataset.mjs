// Jeu de benchmark d'aiguillage — 30 demandes synthétiques (données fictives).
// ⚠ Sémantique du CODE : kind="task" = message à un GROUPE (PAS une fiche tâche) ;
// créer/modifier une FICHE tâche = "data". Les attentes ci-dessous suivent le CODE.
// requiredIntents : intentions du pré-vol attendues (rappel critique).
export const DATASET = [
  // ── Lectures (answer) ──────────────────────────────────────────────────────
  { prompt: "Quels chantiers sont en retard ?", expectedKind: "answer", requiredIntents: [] },
  { prompt: "J'ai combien de clients ?", expectedKind: "answer", requiredIntents: [] },
  { prompt: "Où en est le chantier Morel ?", expectedKind: "answer", requiredIntents: [] },
  { prompt: "Montre-moi mes factures impayées", expectedKind: "answer", requiredIntents: [] },
  { prompt: "Quel taux de TVA pour une rénovation ?", expectedKind: "answer", requiredIntents: [] },
  // ── Écritures simples (data) ───────────────────────────────────────────────
  { prompt: "Ajoute un client Jean Dupont, tel 06 12 34 56 78", expectedKind: "data", requiredIntents: ["create_object"] },
  { prompt: "Passe le devis D-2026-04 en accepté", expectedKind: "data", requiredIntents: [], forbiddenKinds: ["task", "module"] },
  { prompt: "Supprime le client Martin", expectedKind: "data", requiredIntents: [], forbiddenKinds: ["task", "module"] },
  { prompt: "Le chantier Morel est à 80%", expectedKind: "data", requiredIntents: ["update_chantier"], forbiddenKinds: ["task", "module"] },
  { prompt: "Mets à jour le téléphone de Karim", expectedKind: "data", requiredIntents: [], forbiddenKinds: ["task", "module"] },
  // ── Fiches TÂCHE (data, PAS task) ──────────────────────────────────────────
  { prompt: "Crée une tâche « rappeler le client » pour Karim", expectedKind: "data", requiredIntents: ["update_related_tasks"], forbiddenKinds: ["task", "module"] },
  { prompt: "Marque la tâche installation comme terminée", expectedKind: "data", requiredIntents: ["update_related_tasks"], forbiddenKinds: ["task"] },
  { prompt: "Affecte la tâche de contrôle à Lucas", expectedKind: "data", requiredIntents: ["update_related_tasks"], forbiddenKinds: ["task"] },
  // ── Missions multi-actions (data) ──────────────────────────────────────────
  { prompt: "Décale le chantier Dupont de trois jours, déplace les tâches associées et préviens l'équipe.", expectedKind: "data", requiredIntents: ["update_chantier", "update_related_tasks", "prepare_communication"], forbiddenKinds: ["task", "module"] },
  { prompt: "Décale le chantier Dupont de 3 jours et préviens l'équipe", expectedKind: "data", requiredIntents: ["update_chantier", "prepare_communication"], forbiddenKinds: ["task", "module"] },
  { prompt: "Passe le devis D-12 en accepté et envoie-le au client", expectedKind: "data", requiredIntents: ["prepare_communication"], forbiddenKinds: ["email", "task"] },
  { prompt: "Clôture l'intervention chez Morel et préviens le client", expectedKind: "data", requiredIntents: ["update_related_tasks", "prepare_communication"], forbiddenKinds: ["task"] },
  { prompt: "Affecte Karim au chantier Dupont et informe-le", expectedKind: "data", requiredIntents: ["prepare_communication"], forbiddenKinds: ["task"] },
  { prompt: "Change les dates de toutes les tâches du chantier Morel", expectedKind: "data", requiredIntents: ["update_related_tasks"], forbiddenKinds: ["task", "module"] },
  { prompt: "Crée un chantier pour Martin et ajoute une tâche de préparation", expectedKind: "data", requiredIntents: ["update_related_tasks"], forbiddenKinds: ["task", "module"] },
  // ── Communication SEULE ────────────────────────────────────────────────────
  { prompt: "Préviens toute l'équipe qu'on commence à 7h demain", expectedKind: "task", requiredIntents: [] },
  { prompt: "Envoie un message à tous mes clients pour les portes ouvertes vendredi", expectedKind: "task", requiredIntents: [] },
  { prompt: "Envoie un email à jean@exemple.fr pour confirmer le rendez-vous de lundi", expectedKind: "email", requiredIntents: [] },
  // ── Applications / modules ─────────────────────────────────────────────────
  { prompt: "Crée-moi une application de pointage des heures", expectedKind: "module", requiredIntents: [] },
  { prompt: "Mets en place un tableau de suivi des chantiers", expectedKind: "module", requiredIntents: [] },
  { prompt: "Je veux un outil pour gérer mon inventaire de matériel", expectedKind: "module", requiredIntents: [] },
  // ── Documents ──────────────────────────────────────────────────────────────
  { prompt: "Fais-moi un devis pour la salle de bain de Mme Martin", expectedKind: "document", requiredIntents: [] },
  { prompt: "Rédige une mise en demeure pour le client Durand", expectedKind: "document", requiredIntents: [] },
  // ── Automatisations (rule) ─────────────────────────────────────────────────
  { prompt: "Chaque lundi, relance mes devis sans réponse depuis 7 jours", expectedKind: "rule", requiredIntents: [] },
  { prompt: "Préviens-moi dès qu'une facture dépasse son échéance", expectedKind: "rule", requiredIntents: [] },
];
