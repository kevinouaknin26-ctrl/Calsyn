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
import { fetchVoiceToken, saveCallDisposition, initiateCallWithAMD, callEdgeFunction } from '@/services/api'
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
        // Auto-refresh token quand il expire
        if (err.message === 'TOKEN_WILL_EXPIRE') {
          console.log('[useCallMachine] Token expiring, refreshing...')
          fetchVoiceToken()
            .then(newToken => { if (!cancelled) return provider.init(newToken) })
            .catch(e => console.error('[useCallMachine] Token refresh failed:', e))
          return
        }
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
      // Déterminer le default outcome intelligemment :
      // - Si le SDR a choisi un outcome → l'utiliser
      // - Si l'appel a été "answered" mais < 5s → c'est un rejet/messagerie, pas un vrai appel
      // - Si l'appel a été answered et >= 5s → vrai appel connecté
      // - Si jamais answered → no_answer
      const dur = state.context.duration || 0
      const defaultOutcome = state.context.wasAnswered
        ? (dur >= 5 ? 'connected' : 'no_answer')
        : 'no_answer'

      saveCallDisposition({
        callSid: state.context.callSid,
        conferenceSid: state.context.conferenceSid,
        prospectId: state.context.prospect?.id ?? null,
        prospectName: state.context.prospect?.name ?? null,
        prospectPhone: state.context.prospect?.phone ?? null,
        duration: dur,
        disposition: state.context.disposition || defaultOutcome,
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

    const fromNumber = organisation?.from_number || '+33159580189'
    console.log(`[useCallMachine] Calling ${prospect.name} from ${fromNumber}`)
    send({ type: 'CALL', prospect })

    const conferenceName = `callio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    try {
      // 1. Initier l'appel prospect côté serveur (avec AMD)
      const result = await initiateCallWithAMD({
        to: prospect.phone,
        from: fromNumber,
        prospectId: prospect.id,
        prospectName: prospect.name,
        conferenceName,
      })

      console.log(`[useCallMachine] Prospect call initiated: ${result.callSid}, conference: ${conferenceName}`)

      // 2. Connecter le SDR à la même conférence via device.connect()
      const session = await provider.connect({
        to: prospect.phone,
        from: fromNumber,
        conferenceId: conferenceName,
      })

      if (session) {
        sessionRef.current = session
        // Stocker le callSid du prospect (pas celui du SDR)
        send({ type: 'RINGING', callSid: result.callSid })
      } else {
        send({ type: 'ERROR', message: 'Failed to connect SDR to conference' })
      }
    } catch (err) {
      console.error('[useCallMachine] initiate-call failed:', err)
      send({ type: 'ERROR', message: (err as Error).message })
    }
  }, [send, organisation])

  const hangup = useCallback(() => {
    // Capturer le callSid du prospect avant de déconnecter
    const prospectCallSid = state.context.callSid
    providerRef.current?.disconnectAll()
    sessionRef.current = null
    send({ type: 'HANG_UP' })

    // Terminer l'appel prospect côté serveur (sinon il continue vers la messagerie)
    if (prospectCallSid) {
      callEdgeFunction('end-call', { callSid: prospectCallSid }).catch(err => {
        console.error('[useCallMachine] end-call failed:', err)
      })
    }
  }, [send, state])

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
    // Le save est fait par l'autosave useEffect quand on entre en disconnected.
    // Ici on fait juste un re-save pour capturer les derniers changements de disposition/notes
    // AVANT de reset vers idle (le useEffect ne se re-declenchera pas car isDisconnectedState est deja true).
    if (state.matches('disconnected')) {
      const dur = state.context.duration || 0
      const defaultOutcome = state.context.wasAnswered
        ? (dur >= 5 ? 'connected' : 'no_answer')
        : 'no_answer'
      saveCallDisposition({
        callSid: state.context.callSid,
        conferenceSid: state.context.conferenceSid,
        prospectId: state.context.prospect?.id ?? null,
        prospectName: state.context.prospect?.name ?? null,
        prospectPhone: state.context.prospect?.phone ?? null,
        duration: dur,
        disposition: state.context.disposition || defaultOutcome,
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
