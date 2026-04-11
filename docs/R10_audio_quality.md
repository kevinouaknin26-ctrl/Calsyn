# R10 — Qualite Audio & MOS Score

## Mean Opinion Score (MOS)
Echelle 1-5 de qualite percue :
- 5 = excellent (conversation en personne)
- 4 = bon (VoIP HD standard)
- 3 = acceptable (VoIP basique)
- 2 = mauvais (gresillements, coupures)
- 1 = inutilisable

## Metriques WebRTC cles
- **Packet loss** : > 3% = degradation audible
- **Jitter** : > 30ms = probleme
- **RTT (Round Trip Time)** : > 300ms = latence perceptible
- **Codec** : Opus (48kHz) > G.722 (16kHz) > G.711/PCMU (8kHz)

## Comment monitorer

### Twilio SDK
```javascript
// L'event 'sample' fire toutes les secondes avec les stats
call.on('sample', (sample) => {
  // sample.mos — MOS score calcule par Twilio
  // sample.jitter — jitter en ms
  // sample.rtt — round trip time en ms
  // sample.packetsLost — paquets perdus
  // sample.packetsReceived — paquets recus
})
```
Twilio calcule le MOS automatiquement dans le SDK.

### Telnyx SDK
WebRTC standard `getStats()` via RTCPeerConnection.
Libraries utiles :
- `webrtcmetrics` — aggregation stats + JSON reports
- `webrtc-issue-detector` — calcul MOS + detection problemes

### Pattern implementation
```typescript
interface AudioQualityMetrics {
  mos: number           // 1-5
  jitter: number        // ms
  rtt: number           // ms
  packetLossPercent: number
  codec: string
  timestamp: number
}

// Collecter toutes les 5 secondes pendant l'appel
// Stocker la moyenne dans calls.audio_quality (jsonb)
// Alerter l'agent si MOS < 3 (toast "Qualite audio degradee")
```

## Decision
- MVP : logger les metriques Twilio via `call.on('sample')` dans la console
- Stocker la moyenne MOS dans `calls.audio_quality_mos` (numeric)
- Alerte UI si MOS < 3 pendant l'appel
- V2.1 : dashboard qualite pour le manager (MOS moyen par agent, par heure)
