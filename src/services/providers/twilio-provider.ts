/**
 * Implementation Twilio du CallProvider.
 * Wraps le SDK @twilio/voice-sdk derriere l'interface commune.
 */

import { Device, Call } from '@twilio/voice-sdk'
import type { CallProvider, CallSession, CallState, ConnectParams, CallProviderEvents, AudioSample, IncomingCallInfo } from './types'

function mapTwilioState(call: Call): CallState {
  const status = call.status()
  if (status === 'ringing') return 'ringing'
  if (status === 'open') return 'active'
  if (status === 'closed') return 'done'
  return 'new'
}

class TwilioCallSession implements CallSession {
  private call: Call
  private _isMuted = false

  constructor(call: Call) {
    this.call = call
  }

  get id(): string {
    return this.call.parameters?.CallSid || ''
  }

  get state(): CallState {
    return mapTwilioState(this.call)
  }

  get isMuted(): boolean {
    return this._isMuted
  }

  hangup(): void {
    this.call.disconnect()
  }

  mute(): void {
    this.call.mute(true)
    this._isMuted = true
  }

  unmute(): void {
    this.call.mute(false)
    this._isMuted = false
  }

  sendDTMF(digit: string): void {
    this.call.sendDigits(digit)
  }
}

export class TwilioProvider implements CallProvider {
  readonly name = 'twilio' as const
  private device: Device | null = null
  private externalDevice = false
  private listeners: Partial<CallProviderEvents>[] = []
  private tokenFetcher: (() => Promise<string>) | null = null

  get isReady(): boolean {
    return this.device?.state === Device.State.Registered
  }

  setTokenFetcher(fn: () => Promise<string>): void {
    this.tokenFetcher = fn
  }

  private async fetchToken(): Promise<string | null> {
    if (!this.tokenFetcher) return null
    return this.tokenFetcher()
  }

  useExternalDevice(device: Device): void {
    this.device = device
    this.externalDevice = true
    if (device.state === Device.State.Registered) {
      this.emit('onReady')
    } else {
      device.on('registered', () => this.emit('onReady'))
    }
  }

  async init(token: string): Promise<void> {
    if (this.externalDevice) {
      if (this.device?.state === Device.State.Registered) this.emit('onReady')
      return
    }

    if (this.device) this.device.destroy()

    this.device = new Device(token, {
      logLevel: 1,
      codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      closeProtection: true,
      enableIceRestart: true,
    } as ConstructorParameters<typeof Device>[1])

    this.device.on('registered', () => {
      this.emit('onReady')
    })

    this.device.on('error', (err) => {
      this.log(`[TwilioVoice] DEVICE ERROR: code=${err.code}, message=${err.message}`)
      this.emit('onError', new Error(err.message))
    })

    this.device.on('unregistered', () => {
      if (!this.device || this.device.state === Device.State.Destroyed) return
      this.log('[TwilioVoice] DEVICE UNREGISTERED — re-registering...')
      setTimeout(async () => {
        try {
          if (this.device && this.device.state !== Device.State.Registered && this.device.state !== Device.State.Destroyed) {
            const newToken = await this.fetchToken()
            if (newToken && this.device) {
              this.device.updateToken(newToken)
              await this.device.register()
            }
          }
        } catch (e) {
          this.log('[TwilioVoice] Re-register failed:', e)
        }
      }, 2000)
    })

    this.device.on('tokenWillExpire', async () => {
      try {
        const newToken = await this.fetchToken()
        if (newToken && this.device) {
          this.device.updateToken(newToken)
        }
      } catch (err) {
        this.emit('onError', new Error('TOKEN_REFRESH_FAILED'))
      }
    })

    await this.device.register()
  }

  destroy(): void {
    if (this.device && !this.externalDevice) {
      this.device.destroy()
    }
    this.device = null
    this.externalDevice = false
    this.listeners = []
  }

  async connect(params: ConnectParams): Promise<CallSession | null> {
    if (!this.device || !this.isReady) return null

    try {
      const connectParams: Record<string, string> = {
        To: params.to,
        From: params.from,
      }
      if (params.conferenceId) connectParams.ConferenceId = params.conferenceId
      if (params.prospectId) connectParams.ProspectId = params.prospectId
      if (params.prospectName) connectParams.ProspectName = params.prospectName

      const call = await this.device.connect({ params: connectParams })
      const session = new TwilioCallSession(call)
      this.bindCallEvents(call, session)
      return session
    } catch (err) {
      this.emit('onError', err instanceof Error ? err : new Error(String(err)))
      return null
    }
  }

  private bindCallEvents(call: Call, session: TwilioCallSession): void {
    call.on('ringing', () => {
      this.emit('onStateChange', 'ringing', session)
    })

    call.on('accept', () => {
      this.emit('onStateChange', 'active', session)
    })

    call.on('reconnecting', (twilioError: any) => {
      this.log(`[TwilioVoice] ⚠️ RECONNECTING — ${twilioError?.message || 'network issue'}`)
    })

    call.on('reconnected', () => {
      this.log('[TwilioVoice] ✅ RECONNECTED — appel rétabli')
    })

    call.on('warning', (name: string, data: any) => {
      this.log(`[TwilioVoice] ⚠️ WARNING: ${name}`, data)
    })

    call.on('warning-cleared', (name: string) => {
      this.log(`[TwilioVoice] ✅ WARNING CLEARED: ${name}`)
    })

    call.on('disconnect', (c: any) => {
      this.log(`[TwilioVoice] 📴 DISCONNECT — duration: ${c?.duration || '?'}s, status: ${c?.status?.() || '?'}`)
      this.emit('onStateChange', 'done', session)
    })

    call.on('cancel', () => {
      this.log('[TwilioVoice] 📴 CANCEL — prospect did not pick up')
      this.emit('onStateChange', 'done', session)
    })

    call.on('error', (err) => {
      this.log(`[TwilioVoice] ❌ ERROR: ${err.message}`, err)
      this.emit('onError', new Error(err.message))
      this.emit('onStateChange', 'error', session)
    })

    call.on('sample', (sample) => {
      const audioSample: AudioSample = {
        mos: sample.mos ?? 0,
        jitter: sample.jitter ?? 0,
        rtt: sample.rtt ?? 0,
        packetLoss: sample.packetsLost
          ? (sample.packetsLost / (sample.packetsLost + sample.packetsReceived)) * 100
          : 0,
        timestamp: Date.now(),
      }
      this.emitAudio(audioSample)
    })
  }

  disconnectAll(): void {
    if (this.device) {
      this.device.disconnectAll()
    }
  }

  on(events: Partial<CallProviderEvents>): () => void {
    this.listeners.push(events)
    return () => {
      this.listeners = this.listeners.filter(l => l !== events)
    }
  }

  // ── Private ────────────────────────────────────────────────────

  private emit(event: 'onReady'): void
  private emit(event: 'onError', error: Error): void
  private emit(event: 'onStateChange', state: CallState, session: CallSession): void
  private emit(event: 'onIncoming', info: IncomingCallInfo): void
  private emit(event: string, ...args: unknown[]): void {
    for (const l of this.listeners) {
      const fn = l[event as keyof CallProviderEvents]
      if (typeof fn === 'function') {
        (fn as (...a: unknown[]) => void)(...args)
      }
    }
  }

  private emitAudio(sample: AudioSample): void {
    for (const l of this.listeners) {
      l.onAudioSample?.(sample)
    }
  }

  private emitIncoming(info: IncomingCallInfo): void {
    for (const l of this.listeners) {
      l.onIncoming?.(info)
    }
  }

  private log(...args: unknown[]): void {
    console.log(...args)
  }
}
