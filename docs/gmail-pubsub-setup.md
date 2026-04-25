# Gmail Push notifications — Setup Google Cloud Pub/Sub

Setup à faire **une seule fois** côté Google Cloud Console pour activer le vrai temps réel sur les emails (sans ce setup, le fallback cron 1 min reste actif).

## Prérequis

- Projet Google Cloud avec OAuth déjà configuré (le même que celui qui sert pour la connexion Gmail des users)
- Avoir setté `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` dans les env Supabase

## Étapes

### 1. Activer Cloud Pub/Sub API

```
https://console.cloud.google.com/apis/library/pubsub.googleapis.com
→ Activer pour ton projet
```

### 2. Créer un topic Pub/Sub

```
https://console.cloud.google.com/cloudpubsub/topic/list
→ "Créer un sujet"
→ ID du sujet : gmail-notifications
→ Cocher "Ajouter une clé de chiffrement Google" (par défaut OK)
→ Créer
```

Note l'ID complet du topic, format : `projects/<project-id>/topics/gmail-notifications`

### 3. Donner à Gmail le droit de publier

Sur la page du topic créé :

```
Onglet "Autorisations" → "Ajouter un compte principal"
→ Compte principal : gmail-api-push@system.gserviceaccount.com
→ Rôle : Pub/Sub Publisher
→ Enregistrer
```

### 4. Générer un secret pour authentifier le webhook

```bash
# génère un token aléatoire
openssl rand -hex 32
```

Garde ce secret pour l'étape 5 et 6.

### 5. Créer une subscription PUSH

```
https://console.cloud.google.com/cloudpubsub/subscription/list
→ "Créer un abonnement"
→ ID : gmail-push-sub
→ Sujet : projects/<project-id>/topics/gmail-notifications
→ Type de diffusion : Push
→ URL du point de terminaison :
   https://enrpuayypjnpfmdgpfhs.supabase.co/functions/v1/gmail-push-webhook?secret=<TON_SECRET>
→ Activer la file d'attente de lettres mortes : non (optionnel)
→ Créer
```

### 6. Setter les env vars Supabase

Dans le dashboard Supabase → Project Settings → Edge Functions → Secrets :

```
GMAIL_PUBSUB_TOPIC = projects/<project-id>/topics/gmail-notifications
GMAIL_PUBSUB_SECRET = <ton secret de l'étape 4>
```

### 7. Activer la watch pour ton compte

Une fois tous les env vars settés, appelle l'endpoint via la console SQL Supabase ou un client REST :

```sql
SELECT net.http_post(
  url := 'https://enrpuayypjnpfmdgpfhs.supabase.co/functions/v1/gmail-watch-start',
  headers := jsonb_build_object('Authorization', 'Bearer <TON_USER_JWT>', 'Content-Type', 'application/json'),
  body := '{}'::jsonb
);
```

Tu devrais recevoir `{ ok: true, results: [{ user_id: ..., historyId: "...", expiration: "..." }] }`.

### 8. Tester

Envoie-toi un mail. Dans les ~2 secondes, il devrait apparaître dans la table `messages` (vérifier dans la page Messagerie de Calsyn). Côté logs :

```
Supabase → Edge Functions → gmail-push-webhook → Logs
```

## Renouvellement automatique

La cron `gmail-watch-renew` (déclenchée quotidiennement à 4h) renouvelle les watches qui expirent dans les 24h. Pas besoin d'intervention.

## Désactiver

```
Console GCP → Pub/Sub → Subscriptions → gmail-push-sub → Supprimer
ou
Désactiver le secret GMAIL_PUBSUB_TOPIC côté Supabase
```

Le fallback cron 1 min (`gmail-ingest`) prend le relais.
