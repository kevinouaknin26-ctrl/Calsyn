# R09 — Conference, Coaching & Whispering

## Architecture Twilio recommandee
Twilio recommande que TOUS les appels passent par une Conference (pas du Dial direct).
Pourquoi : Conference permet monitor, whisper, barge sans changer l'architecture.

### Topologie
```
Agent (browser) ──→ Conference Room ←── Prospect (PSTN)
                         ↑
                    Manager (monitor/whisper/barge)
```

### 3 modes superviseur
1. **Monitor** (ecoute silencieuse) : manager entend tout, personne ne l'entend
   - `muted: true, beep: false`
2. **Coach/Whisper** : manager parle a l'agent SEULEMENT, prospect n'entend rien
   - Param `coach: {call_sid_agent}` sur le participant manager
3. **Barge** : manager parle a tout le monde (agent + prospect)
   - `muted: false` sur le participant manager

### Twilio Agent Conference API
- `POST /Conferences/{sid}/Participants` pour ajouter le manager
- Switcher entre modes via `PATCH` sur le participant (muted, coach)
- Pas besoin de TwiML pour les transitions

## Telnyx
- Supporte aussi les conferences avec `<Conference>` en TeXML
- Coach/whisper via Call Control API
- Memes concepts, API differente

## Impact sur notre architecture

### Pourquoi Conference-first est important
Si on commence avec `<Dial><Number>` (appel direct), ajouter le coaching plus tard = REWRITE COMPLET.
Si on commence avec `<Conference>`, c'est juste ajouter un participant.

### Implementation
```xml
<!-- Au lieu de <Dial><Number> -->
<Response>
  <Dial>
    <Conference
      beep="false"
      startConferenceOnEnter="true"
      endConferenceOnExit="true"
      record="record-from-start"
      statusCallback="/status-callback"
      statusCallbackEvent="start end join leave">
      call_{call_id}
    </Conference>
  </Dial>
</Response>
```

L'agent et le prospect rejoignent la meme conference nommee `call_{call_id}`.

## Decision
- **MVP** : Conference-based des le jour 1 (meme si pas de coaching encore)
- Chaque appel = une conference a 2 participants (agent + prospect)
- L'enregistrement est fait au niveau de la conference (pas du dial)
- V2.1 : ajouter le mode monitor/whisper pour les managers
- Stocker le `conference_sid` dans la table `calls`
