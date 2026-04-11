# R05 — Validation Webhook Signature

## Twilio
- Header `X-Twilio-Signature` sur chaque webhook
- HMAC-SHA1 avec Auth Token comme cle
- Validation : `twilio.validateRequest(authToken, signature, url, params)`
- En Deno (Edge Functions) : pas de middleware Express, validation manuelle
- Pour POST : trier les params alphabetiquement, les concatener a l'URL, signer

## Telnyx
- Header `Telnyx-Signature-ed25519` + `Telnyx-Timestamp`
- Verification via package `telnyx` ou crypto ED25519
- Public key recuperable via API

## Implementation pour notre abstraction
```typescript
// Middleware generique dans chaque Edge Function webhook
async function validateWebhook(req: Request, provider: 'twilio' | 'telnyx'): Promise<boolean> {
  if (provider === 'twilio') {
    // HMAC-SHA1 avec AUTH_TOKEN
    const signature = req.headers.get('X-Twilio-Signature')
    return twilio.validateRequest(AUTH_TOKEN, signature, url, body)
  }
  if (provider === 'telnyx') {
    // ED25519 avec public key
    const signature = req.headers.get('Telnyx-Signature-ed25519')
    const timestamp = req.headers.get('Telnyx-Timestamp')
    return telnyx.Webhook.constructEvent(body, signature, timestamp, TELNYX_PUBLIC_KEY)
  }
}
```

## Decision
Chaque Edge Function webhook DOIT valider la signature AVANT tout traitement.
Retourner 403 Forbidden si invalide.
