# R28 — Zero Trust : Sécurisation Edge Functions

## Principe
Chaque Edge Function valide QUI appelle et POURQUOI avant de faire quoi que ce soit.

## 2 types de callers

### 1. Frontend (utilisateur authentifié)
- Header `Authorization: Bearer {JWT_SUPABASE}`
- Vérifier le JWT, extraire user_id et org_id
- Rate limiting par user_id

```typescript
async function requireAuth(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) throw new Error('Unauthorized')

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new Error('Unauthorized')

  return user
}
```

### 2. Webhooks (Twilio / Telnyx)
- Pas de JWT — validation par signature
- `X-Twilio-Signature` ou `Telnyx-Signature-ed25519`
- Voir R05 pour le détail

## Rate Limiting

### Supabase recommande Upstash Redis
- Compteur par user_id par fenêtre de temps
- Limite configurable par org (plan starter vs scale)

### Alternative simple (sans Redis)
- Compteur dans une table Postgres `rate_limits(user_id, endpoint, count, window_start)`
- RPC atomique pour incrémenter + vérifier

### Limites par endpoint
| Endpoint | Limite | Fenêtre |
|----------|--------|---------|
| token-gen | 10 req | 1 min |
| save-call | 30 req | 1 min |
| parallel-dial | 5 req | 1 min |
| invite-member | 3 req | 1 min |

## Decision
- Tout endpoint frontend : JWT obligatoire
- Tout webhook : signature obligatoire
- Rate limiting en Phase 5 (pas bloquant pour le MVP mono-user)
- Pattern auth middleware réutilisable pour toutes les Edge Functions
