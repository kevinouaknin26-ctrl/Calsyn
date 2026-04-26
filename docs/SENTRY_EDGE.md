# Sentry sur les Edge Functions

## Activation

1. Dans Sentry.io, créer un nouveau projet "calsyn-backend" type **JavaScript** (ou réutiliser le projet front avec un tag différent).
2. Copier la DSN.
3. Ajouter en secret Supabase :
   - Aller sur https://supabase.com/dashboard/project/enrpuayypjnpfmdgpfhs/settings/functions
   - Onglet **Edge Functions Secrets**
   - Add secret : `SENTRY_DSN_BACKEND` = `https://xxx@xxx.ingest.sentry.io/xxx`
4. (Optionnel) `SUPABASE_ENV` = `production` (par défaut)

## Usage dans une edge function

Sans toucher au code existant, on peut wrapper le handler :

```ts
import { withSentry } from '../_shared/sentry.ts'

serve(withSentry('gmail', async (req) => {
  // ton code existant — tout throw sera auto-capturé avec contexte
}))
```

Ou en manuel pour des points précis :

```ts
import { captureError } from '../_shared/sentry.ts'

try {
  // ...
} catch (e) {
  await captureError(e, {
    tags: { fn: 'process-analysis', action: 'transcribe' },
    user: { id: userId },
    extra: { callId, audioUrl },
  })
  throw e
}
```

## Edge functions à instrumenter (priorité)

1. `gmail` — envoi/sync emails (souvent sujet aux 401, 403, quota Google)
2. `process-analysis` — transcription Deepgram + analyse Claude (timeouts, parse errors)
3. `sms-send` / `sms-webhook` — Twilio
4. `gmail-ingest`, `gmail-backfill`, `gmail-push-webhook`
5. `recording-callback` / `status-callback` — webhooks Twilio
6. `team-manage` — actions admin sensibles
7. `impersonate-user` — actions super_admin

## Fonctionnement noop

Si `SENTRY_DSN_BACKEND` n'est pas configuré, `captureError()` log juste en
console.error et n'envoie rien au réseau. Aucun overhead, aucune erreur.

## Pourquoi pas le SDK officiel @sentry/deno

Le SDK officiel marche sur Deno standalone mais a des soucis sur Supabase Edge
Functions (cold start lent, taille bundle, init globale qui interfère avec
le runtime). Notre intégration minimaliste fait juste un fetch vers le Sentry
envelope endpoint — ~80 lignes, zéro dépendance, fiable.

## Test après activation

Modifie temporairement une edge function pour throw une erreur de test :

```ts
serve(withSentry('test-fn', async () => {
  throw new Error('Test Sentry edge')
}))
```

Déclenche-la une fois → l'erreur doit apparaître dans Sentry.io quelques
secondes après. Puis remove le throw.
