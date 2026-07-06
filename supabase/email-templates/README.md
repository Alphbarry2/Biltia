# Emails de marque Biltia

Templates HTML aux couleurs de Biltia (logo + bouton violet) pour remplacer les
emails génériques « Supabase » envoyés par l'authentification.

## 1. Coller les templates (2 min)

Dashboard Supabase → projet **biltia** → **Authentication** → **Email Templates**.
Pour chaque type, colle le fichier correspondant dans le champ **Message body (HTML)** :

| Type dans Supabase   | Fichier          | Objet suggéré                          |
| -------------------- | ---------------- | -------------------------------------- |
| **Invite user**      | `invite.html`    | Vous êtes invité à rejoindre une équipe sur Biltia |
| **Reset Password**   | `reset.html`     | Réinitialisez votre mot de passe Biltia |
| **Confirm signup**   | `confirm.html`   | Confirmez votre inscription à Biltia    |

La variable `{{ .ConfirmationURL }}` est remplacée automatiquement par Supabase par
le bon lien (elle est déjà en place dans chaque template — ne pas y toucher).

## 2. Envoyer depuis biltia.com — SMTP personnalisé (IMPORTANT)

Sans SMTP perso, Supabase envoie via son service partagé : **~3-4 emails/heure max**
et expéditeur générique. Pour un vrai produit, configure ton SMTP Hostinger :

Dashboard Supabase → **Authentication** → **SMTP Settings** → *Enable Custom SMTP* :

- **Host** : `smtp.hostinger.com`
- **Port** : `465` (SSL) ou `587` (TLS)
- **Username** : `contact@biltia.com` (ta boîte Hostinger)
- **Password** : le mot de passe de cette boîte email
- **Sender email** : `contact@biltia.com`
- **Sender name** : `Biltia`

Après ça, remonte la limite d'envoi dans **Rate Limits** (par défaut très basse).

## Note

Le logo est chargé depuis `https://www.biltia.com/icon.png` (servi en prod, 200 OK).
Si le domaine change, mettre à jour l'URL `<img src>` dans les 3 fichiers.
