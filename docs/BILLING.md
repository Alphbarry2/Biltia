# Facturation Biltia — Plans, crédits & Stripe

Source de vérité des tarifs : [`lib/plans.ts`](../lib/plans.ts). Tarifs validés le 2026-07-02.

## Modèle

| Plan | Prix | Crédits | Limites / inclus |
|------|------|---------|------------------|
| **Free** | 0 € | 10 à l'inscription, **non renouvelables** | 1 app, 1 utilisateur, **pas de déploiement Live** |
| **Pro** | voir paliers | 100 → 10 000 / mois | Apps Live illimitées, vocal, offline-first, Workspace partagé |
| **Business** | voir paliers | 100 → 10 000 / mois | Tout le Pro + marque blanche, URL perso, multi-niche, connecteurs comptables |

### Paliers (prix mensuels)

| Crédits | Pro | Business |
|--------:|----:|---------:|
| 100 | 49 € | 99 € |
| 400 | 199 € | 399 € |
| 800 | 399 € | 799 € |
| 1 200 | 579 € | 1 149 € |
| 2 000 | 949 € | 1 899 € |
| 4 000 | 1 799 € | 3 699 € |
| 5 000 | 2 199 € | 4 399 € |
| 7 500 | 3 699 € | 6 499 € |
| 10 000 | 4 399 € | 8 499 € |

**Politique crédits payants : RESET au forfait** à chaque renouvellement mensuel
(les crédits non utilisés ne sont pas reportés). Le Free n'est jamais renouvelé.

## Architecture code

- `lib/plans.ts` — data client-safe (aucun secret). Consommée par la landing, la page settings et le serveur.
- `lib/stripe.ts` — client Stripe + résolution des Price IDs (serveur uniquement).
- `lib/entitlements.ts` — droits d'un utilisateur (plan → limites) pour le gating serveur.
- `app/api/billing/checkout/route.ts` — crée la session Stripe Checkout.
- `app/api/billing/webhook/route.ts` — applique les événements Stripe → DB + crédits.
- `supabase/migrations/006_billing.sql` — table `subscriptions`, RPC `set_credit_balance`,
  `handle_new_user` (10 crédits Free + ligne `free`), trigger `enforce_app_limit` (Free = 1 app).

## Mise en route

1. **Appliquer la migration** `006_billing.sql` sur la base (Supabase SQL editor ou CLI),
   puis **régénérer les types** : `supabase gen types typescript ... > lib/database.types.ts`
   (la table `subscriptions` sera alors typée ; en attendant, le code l'accède en non typé).
2. **Créer les Produits/Prices Stripe** : 2 produits (Pro, Business), et pour chacun 9 Prices
   récurrents mensuels (un par palier de crédits).
3. **Renseigner l'environnement** dans `.env.local` (non versionné) :
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL` et les 18 `STRIPE_PRICE_<PLAN>_<CREDITS>`
   (convention : `STRIPE_PRICE_PRO_400`, `STRIPE_PRICE_BUSINESS_10000`, …).
4. **Configurer le webhook Stripe** vers `/api/billing/webhook` avec les événements :
   `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   En local : `stripe listen --forward-to localhost:3000/api/billing/webhook`.

## Flux

1. L'utilisateur choisit (plan, palier) dans `/settings` → `POST /api/billing/checkout` → redirection Stripe.
2. Paiement OK → `checkout.session.completed` → upsert `subscriptions` + crédits mis au forfait.
3. Chaque mois → `invoice.paid` → crédits **remis au forfait**.
4. Résiliation → `customer.subscription.deleted` → retour au plan Free.
