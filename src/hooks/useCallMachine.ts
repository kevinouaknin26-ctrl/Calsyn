/**
 * useCallMachine V2 — Autosave, rappel immediat.
 *
 * Le save est fire-and-forget (pas bloquant).
 * Apres hangup, l'agent peut rappeler immediatement.
 * La disposition est mise a jour en temps reel via SET_DISPOSITION/SET_NOTES/SET_MEETING.
 */

import { useMachine } from '@xstate/react'
import { useEffect, useRef, useCallback, useState } from 'react'
import { callMachine } from '@/machines/callMachine'
import { createProvider, type CallProvider, type CallSession, type AudioSample } from '@/services/providers'
import { fetchVoiceToken, saveCallDisposition } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { MOS_ALERT_THRESHOLD } from '@/config/constants'
import type { Prospect } from '@/types/prospect'
import type { Disposition } from '@/types/call'

export function useCallMachine() {
  const { organisation } = useAuth()
  const providerRef = useRef<CallProvider | null>(null)
  const sessionRef = useRef<CallSession | null>(null)
  const audioSamplesRef = useRef<AudioSample[]>([])
  const [providerReady, setProviderReady] = useState(false)

  const [state, send] = useMachine(callMachine)

  // ── Init provider ─────────────────────────────────────────────────
  useEffect(() => {
    if (!organisation) return

    const providerName = organisation.voice_provider || 'twilio'
    const provider = createProvider(providerName)
    providerRef.current = provider
    let cancelled = false

    const unsub = provider.on({
      onReady: () => {
        if (!cancelled) {
          console.log(`[useCallMachine] ${providerName} ready`)
          setProviderReady(true)
        }
      },
      onError: (err) => {
        if (cancelled) return
        console.error('[useCallMachine] Provider error:', err.message)
      },
      onStateChange: (callState, session) => {
        if (cancelled) return
        sessionRef.current = session
        const sid = session.id
        console.log(`[useCallMachine] Provider state: ${callState}, sid: ${sid}`)
        if (callState === 'ringing') {
          if (sid) send({ type: 'RINGING', callSid: sid })
        }
        if (callState === 'active') {
          // Capturer le callSid au accept si pas encore capturé au ringing
          if (sid) send({ type: 'RINGING', callSid: sid })
          send({ type: 'ANSWERED' })
        }
        if (callState === 'done') {
          // Dernier essai de capturer le callSid
          if (sid) send({ type: 'RINGING', callSid: sid })
          setTimeout(() => { if (!cancelled) send({ type: 'REMOTE_HANG_UP' }) }, 100)
        }
      },
      onAudioSample: (sample) => {
        if (cancelled) return
        audioSamplesRef.current.push(sample)
        if (sample.mos > 0 && sample.mos < MOS_ALERT_THRESHOLD) {
          console.warn('[useCallMachine] MOS:', sample.mos)
        }
      },
    })

    fetchVoiceToken()
      .then(token => { if (!cancelled) return provider.init(token) })
      .catch(err => { if (!cancelled) console.error('[useCallMachine] Init failed:', err) })

    return () => {
      cancelled = true
      unsub()
      provider.destroy()
      providerRef.current = null
      setProviderReady(false)
    }
  }, [organisation, send])

  // ── Autosave : quand on passe en disconnected, save en background ──
  const isDisconnectedState = state.matches('disconnected')
  const contextCallSid = state.context.callSid
  const contextProspectId = state.context.prospect?.id

  useEffect(() => {
    if (isDisconnectedState) {
      console.log(`[useCallMachine] Autosave trigger — callSid: ${contextCallSid}, prospect: ${contextProspectId}`)
      // Save meme sans callSid — le prospect_id suffit pour identifier l'appel
      saveCallDisposition({
        callSid: state.context.callSid,
        conferenceSid: state.context.conferenceSid,
        prospectId: state.context.prospect?.id ?? null,
        prospectName: state.context.prospect?.name ?? null,
        prospectPhone: state.context.prospect?.phone ?? null,
        duration: state.context.duration,
        disposition: state.context.disposition || 'connected',
        notes: state.context.notes,
        meetingBooked: state.context.meetingBooked,
      }).then(() => {
        console.log('[useCallMachine] Call saved OK')
      }).catch(err => {
        console.error('[useCallMachine] Save failed:', err)
      })
    }
  }, [isDisconnectedState])

  // ── Actions ───────────────────────────────────────────────────────

  const call = useCallback(async (prospect: Prospect) => {
    const provider = providerRef.current
    if (!provider?.isReady) {
      console.warn('[useCallMachine] Provider not ready')
      return
    }

    console.log(`[useCallMachine] Calling ${prospect.name}`)
    send({ type: 'CALL', prospect })

    const conferenceId = crypto.randomUUID()
    const session = await provider.connect({
      to: prospect.phone,
      from: '+33159580189',
      conferenceId,
    })

    if (session) {
      sessionRef.current = session
    } else {
      send({ type: 'ERROR', message: 'Failed to connect' })
    }
  }, [send])

  const hangup = useCallback(() => {
    // Capturer le callSid avant de deconnecter
    const sid = sessionRef.current?.id
    if (sid) send({ type: 'RINGING', callSid: sid })
    providerRef.current?.disconnectAll()
    sessionRef.current = null
    send({ type: 'HANG_UP' })
  }, [send])

  const mute = useCallback(() => {
    sessionRef.current?.mute()
    send({ type: 'MUTE' })
  }, [send])

  const unmute = useCallback(() => {
    sessionRef.current?.unmute()
    send({ type: 'UNMUTE' })
  }, [send])

  const setDisposition = useCallback((d: Disposition) => send({ type: 'SET_DISPOSITION', disposition: d }), [send])
  const setNotes = useCallback((n: string) => send({ type: 'SET_NOTES', notes: n }), [send])
  const setMeeting = useCallback((m: boolean) => send({ type: 'SET_MEETING', meetingBooked: m }), [send])
  const reset = useCallback(() => {
    // Save final avec la disposition mise a jour par l'utilisateur
    if (state.matches('disconnected')) {
      saveCallDisposition({
        callSid: state.context.callSid,
        conferenceSid: state.context.conferenceSid,
        prospectId: state.context.prospect?.id ?? null,
        prospectName: state.context.prospect?.name ?? null,
        prospectPhone: state.context.prospect?.phone ?? null,
        duration: state.context.duration,
        disposition: state.context.disposition || 'connected',
        notes: state.context.notes,
        meetingBooked: state.context.meetingBooked,
      }).catch(err => console.error('[useCallMachine] Final save failed:', err))
    }
    audioSamplesRef.current = []
    send({ type: 'RESET' })
  }, [send, state])

  const sendDTMF = useCallback((digit: string) => { sessionRef.current?.sendDTMF(digit) }, [])

  return {
    state: state.value,
    context: state.context,
    isIdle: state.matches('idle'),
    isDialing: state.matches('dialing'),
    isConnected: state.matches('connected'),
    isTalking: state.matches({ connected: 'talking' }),
    isOnHold: state.matches({ connected: 'on_hold' }),
    isDisconnected: state.matches('disconnected'),
    providerReady,

    // Actions
    call,
    hangup,
    mute,
    unmute,
    setDisposition,
    setNotes,
    setMeeting,
    reset,
    sendDTMF,
  }
}
