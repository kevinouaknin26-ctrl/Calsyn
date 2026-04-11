# R26 — Zod : Validation de tout ce qui entre

## Principe
Ne jamais faire confiance aux données qui viennent de l'extérieur.
Tout payload entrant est validé avec Zod AVANT traitement.

## Où on valide

### Edge Functions (données externes)
```typescript
import { z } from 'zod'

// Webhook Twilio status-callback
const TwilioStatusSchema = z.object({
  CallSid: z.string().startsWith('CA'),
  CallStatus: z.enum(['initiated', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'canceled', 'failed']),
  CallDuration: z.coerce.number().optional(),
  From: z.string(),
  To: z.string(),
})

// Webhook Twilio recording-callback
const TwilioRecordingSchema = z.object({
  CallSid: z.string().startsWith('CA'),
  RecordingUrl: z.string().url(),
  RecordingSid: z.string().startsWith('RE'),
  RecordingDuration: z.coerce.number(),
})

// Réponse Claude API
const ClaudeAnalysisSchema = z.object({
  summary: z.array(z.string()),
  score_global: z.number().min(0).max(100),
  score_accroche: z.number().min(0).max(100),
  score_objection: z.number().min(0).max(100),
  score_closing: z.number().min(0).max(100),
  points_forts: z.array(z.string()),
  points_amelioration: z.array(z.string()),
  intention_prospect: z.string(),
  prochaine_etape: z.string(),
})
```

### Frontend (données user)
```typescript
// Disposition post-call
const DispositionSchema = z.object({
  call_id: z.string().uuid(),
  disposition: z.enum(['connected', 'rdv', 'callback', 'not_interested', 'no_answer', 'voicemail', 'busy', 'wrong_number', 'dnc']),
  notes: z.string().max(2000).default(''),
  meeting_booked: z.boolean().default(false),
})

// Variables d'environnement
const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
})
```

### Pattern : safeParse partout
```typescript
const result = TwilioStatusSchema.safeParse(body)
if (!result.success) {
  console.error('Invalid webhook payload:', result.error.flatten())
  return new Response('Bad Request', { status: 400 })
}
// result.data est typé et validé
const { CallSid, CallStatus } = result.data
```

## Decision
- Zod v4 sur chaque point d'entrée
- safeParse (jamais parse qui throw)
- Schemas exportés dans un fichier dédié (`types/schemas.ts`)
- Types TypeScript inférés via `z.infer<typeof Schema>`
