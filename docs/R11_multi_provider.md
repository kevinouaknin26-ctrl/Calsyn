# R11 — Abstraction Multi-Provider (Twilio + Telnyx)

## Principe
Le code metier ne parle JAMAIS directement a Twilio ou Telnyx.
Il parle a une interface `CallProvider`. L'implementation concrete est injectee.

## Interface commune

```typescript
// types/provider.ts

type CallState = 'new' | 'trying' | 'ringing' | 'early' | 'active' | 'held' | 'done' | 'error'

interface CallSession {
  id: string                    // CallSid (Twilio) ou call_control_id (Telnyx)
  state: CallState
  hangup(): void
  mute(): void
  unmute(): void
  sendDTMF(digit: string): void
  isMuted: boolean
}

interface CallProviderEvents {
  onStateChange: (state: CallState, session: CallSession) => void
  onReady: () => void
  onError: (error: Error) => void
  onAudioSample?: (metrics: AudioQualityMetrics) => void
}

interface CallProvider {
  // Lifecycle
  init(token: string): Promise<void>
  destroy(): void
  isReady: boolean

  // Appel
  connect(params: { to: string; from: string; conferenceId?: string }): Promise<CallSession | null>
  disconnectAll(): void

  // Events
  on(events: Partial<CallProviderEvents>): () => void  // retourne unsubscribe
}
```

## Mapping SDK → Interface

### Twilio
```
init(token) → new Device(token, opts) + device.register()
connect()   → device.connect({ params })
disconnect  → device.disconnectAll()
state       → call events: 'ringing' | 'accept' | 'disconnect' | 'error'
id          → call.parameters.CallSid
mute        → call.mute(true/false)
metrics     → call.on('sample', ...)
```

### Telnyx
```
init(token) → new TelnyxRTC({ login_token }) + client.connect()
connect()   → client.newCall({ destinationNumber, callerNumber })
disconnect  → call.hangup() / client.disconnect()
state       → notification.call.state: 'ringing' | 'active' | 'done' | ...
id          → call.id
mute        → call.muteAudio() / call.unmuteAudio()
metrics     → getStats() via RTCPeerConnection
```

## Structure fichiers
```
src/services/
├── providers/
│   ├── types.ts              # Interface CallProvider + CallSession
│   ├── twilio-provider.ts    # Implementation Twilio
│   └── telnyx-provider.ts    # Implementation Telnyx
├── call-provider.ts          # Factory : getProvider(name) → CallProvider
└── twilio.ts                 # SUPPRIME — pas de singleton global
```

## Comment XState utilise le provider
```typescript
// Dans callMachine.ts, le provider est injecte via actors
const callMachine = createMachine({
  // ...
}, {
  actors: {
    initiateCall: fromPromise(async ({ input }) => {
      const provider = getProvider(input.providerName)
      return provider.connect({ to: input.phone, from: input.fromNumber })
    }),
  }
})
```

XState ne sait pas si c'est Twilio ou Telnyx. Il recoit un CallSession.

## Decision
- Interface `CallProvider` definie avant toute implementation
- Twilio implemente en premier (infra existante)
- Telnyx ajoute dans un second temps (meme interface, fichier separe)
- Le provider actif est lu depuis les settings de l'organisation (table `organisations.voice_provider`)
- Changement de provider = zero changement dans XState, hooks, ou composants
