/**
 * Implementation Telnyx du CallProvider.
 * Wraps le SDK @telnyx/webrtc derriere l'interface commune.
 */

import { TelnyxRTC } from '@telnyx/webrtc'
import type { CallProvider, CallSession, CallState, ConnectParams, CallProviderEvents, AudioSample } from './types'

class TelnyxCallSession implements CallSession {
  private call: any
  private _isMuted = false

  constructor(call: any) {
    this.call = call
  }

  get id(): string {
    return this.call?.id || ''
  }

  get state(): CallState {
    const s = this.call?.state
    if (s === 'ringing' || s === 'requesting' || s === 'trying' || s === 'early') return 'ringing'
    if (s === 'active') return 'active'
    if (s === 'hangup' || s === 'destroy' || s === 'purge' || s === 'done') return 'done'
    return 'new'
  }

  get isMuted(): boolean {
    return this._isMuted
  }

  hangup(): void {
    this.call?.hangup()
  }

  mute(): void {
    this.call?.muteAudio()
    this._isMuted = true
  }

  unmute(): void {
    this.call?.unmuteAudio()
    this._isMuted = false
  }

  sendDTMF(digit: string): void {
    this.call?.dtmf(digit)
  }
}

export class TelnyxProvider implements CallProvider {
  readonly name = 'telnyx' as const
  private client: TelnyxRTC | null = null
  private listeners: Partial<CallProviderEvents>[] = []
  private tokenFetcher: (() => Promise<string>) | null = null
  private currentCall: any = null

  get isReady(): boolean {
    return this.client?.connected ?? false
  }

  setTokenFetcher(fn: () => Promise<string>): void {
    this.tokenFetcher = fn
  }

  async init(token: string): Promise<void> {
    if (this.client) this.client.disconnect()

    this.client = new TelnyxRTC({
      login_token: token,
    })

    this.client.on('telnyx.ready', () => {
      console.log('[TelnyxVoice] Ready')
      this.emit('onReady')
    })

    this.client.on('telnyx.error', (error: any) => {
      console.error('[TelnyxVoice] Error:', error)
      this.emit('onError', new Error(error?.message || 'Telnyx error'))
    })

    this.client.on('telnyx.socket.error', (error: any) => {
      console.error('[TelnyxVoice] Socket error:', error)
      this.emit('onError', new Error('Socket connection failed'))
    })

    this.client.on('telnyx.socket.close', () => {
      console.warn('[TelnyxVoice] Socket closed — attempting reconnect...')
      // Auto-reconnect
      setTimeout(async () => {
        try {
          if (this.tokenFetcher) {
            const newToken = await this.tokenFetcher()
            if (newToken) await this.init(newToken)
          }
        } catch (e) {
          console.error('[TelnyxVoice] Reconnect failed:', e)
        }
      }, 2000)
    })

    // Handle incoming call state changes
    this.client.on('telnyx.notification', (notification: any) => {
      const call = notification.call
      if (!call) return

      this.currentCall = call
      const session = new TelnyxCallSession(call)

      if (notification.type === 'callUpdate') {
        const state = call.state
        console.log(`[TelnyxVoice] Call state: ${state}, id: ${call.id}`)

        if (state === 'ringing' || state === 'requesting' || state === 'trying' || state === 'early') {
          this.emit('onStateChange', 'ringing', session)
        } else if (state === 'active') {
          this.emit('onStateChange', 'active', session)
        } else if (state === 'hangup' || state === 'destroy' || state === 'purge' || state === 'done') {
          this.emit('onStateChange', 'done', session)
        }
      }
    })

    await this.client.connect()
  }

  destroy(): void {
    if (this.client) {
      this.client.disconnect()
      this.client = null
    }
    this.currentCall = null
    this.listeners = []
  }

  async connect(params: ConnectParams): Promise<CallSession | null> {
    if (!this.client || !this.isReady) return null

    try {
      const call = this.client.newCall({
        destinationNumber: params.to,
        callerNumber: params.from,
        audio: true,
        video: false,
        customHeaders: [
          ...(params.prospectId ? [{ name: 'X-Prospect-Id', value: params.prospectId }] : []),
          ...(params.prospectName ? [{ name: 'X-Prospect-Name', value: params.prospectName }] : []),
        ],
      })

      this.currentCall = call
      return new TelnyxCallSession(call)
    } catch (err) {
      console.error('[TelnyxVoice] Connect error:', err)
      this.emit('onError', err instanceof Error ? err : new Error(String(err)))
      return null
    }
  }

  disconnectAll(): void {
    if (this.currentCall) {
      this.currentCall.hangup()
      this.currentCall = null
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
  private emit(event: string, ...args: unknown[]): void {
    for (const l of this.listeners) {
      const fn = l[event as keyof CallProviderEvents]
      if (typeof fn === 'function') {
        (fn as (...a: unknown[]) => void)(...args)
      }
    }
  }
}
