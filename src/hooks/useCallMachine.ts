/**
 * useCallMachine V2 — Autosave, rappel immediat.
 *
 * Le save est fire-and-forget (pas bloquant).
 * Apres hangup, l'agent peut rappeler immediatement.
 * La disposition est mise a jour en temps reel via SET_DISPOSITION/SET_NOTES/SET_MEETING.
 */

import { useMachine } from '@xstate/react'
import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { callMachine } from '@/machines/callMachine'
import { createProvider, type CallProvider, type CallSession, type AudioSample } from '@/services/providers'
import { fetchVoiceToken, fetchTelnyxToken, saveCallDisposition, dropVoicemail } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { MOS_ALERT_THRESHOLD } from '@/config/constants'
import type { Prospect } from '@/types/prospect'
import type { Disposition } from '@/types/call'

export function useCallMachine() {
  const { organisation } = useAuth()
  const queryClient = useQueryClient()
  const providerRef = useRef<CallProvider | null>(null)
  const sessionRef = useRef<CallSession | null>(null)
  const audioSamplesRef = useRef<AudioSample[]>([])
  const [providerReady, setProviderReady] = useState(false)

  const [state, send] = useMachine(callMachine)

  // ── Init provider ─────────────────────────────────────────────────
  // CRITIQUE : ne dépendre que de l'ID et du provider, PAS de tout l'objet organisation
  // Sinon chaque refresh org (10s) détruit le Device Twilio → coupe l'appel
  const orgId = organisation?.id
  const voiceProvider = organisation?.voice_provider || 'twilio'
  useEffect(() => {
    if (!orgId) return

    const providerName = voiceProvider
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

    // Auto-refresh token — utiliser le bon fetcher selon le provider
    const tokenFetcher = providerName === 'telnyx' ? fetchTelnyxToken : fetchVoiceToken
    provider.setTokenFetcher(tokenFetcher)

    tokenFetcher()
      .then(token => { if (!cancelled) return provider.init(token) })
      .catch(err => { if (!cancelled) console.error('[useCallMachine] Init failed:', err) })

    return () => {
      cancelled = true
      unsub()
      provider.destroy()
      providerRef.current = null
      setProviderReady(false)
    }
  }, [orgId, voiceProvider, send])

  // ── Wake Lock : empêcher Chrome de mettre en veille pendant un appel ──
  const isInCallState = state.matches('dialing') || state.matches('connected')
  useEffect(() => {
    if (!isInCallState) return
    let wakeLock: any = null
    const request = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen')
          console.log('[useCallMachine] Wake Lock acquired')
        }
      } catch { /* silently fail on unsupported browsers */ }
    }
    request()
    return () => { if (wakeLock) { wakeLock.release(); console.log('[useCallMachine] Wake Lock released') } }
  }, [isInCallState])

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
      // Minari rule : raccrochage < 8 secondes → auto "voicemail" (bible ligne 60)
      // Si l'appel a été answered mais < 8s → c'est un rejet/messagerie
      // Si answered et >= 8s → vrai appel connecté
      // Si jamais answered → no_answer
      const dur = state.context.duration || 0
      const defaultOutcome = state.context.wasAnswered
        ? (dur >= 8 ? 'connected' : 'voicemail')
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
        // Rafraîchir immédiatement
        queryClient.invalidateQueries({ queryKey: ['prospects'] })
        queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] })
        // Re-fetch après 3s (status-callback + recording-callback mettent ~2-3s)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['prospects'] })
          queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] })
        }, 3000)
        // Re-fetch après 8s (recording + process-analysis)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['prospects'] })
          queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] })
        }, 8000)
      }).catch(err => {
        console.error('[useCallMachine] Save failed:', err)
      })
    }
  }, [isDisconnectedState])

  // ── Actions ───────────────────────────────────────────────────────

  const call = useCallback(async (prospect: Prospect, overrideFromNumber?: string) => {
    const provider = providerRef.current
    if (!provider?.isReady) {
      console.warn('[useCallMachine] Provider not ready')
      return
    }

    // POWER DIALER : appel direct via SDK client (pas de conférence, pas d'AMD temps réel)
    // Le SDR entend la sonnerie et parle dès le décroché — 0 latence
    // La détection messagerie se fait post-appel via process-analysis (transcription Deepgram)
    const fromNumber = overrideFromNumber || organisation?.from_number || '+33757905591'
    console.log(`[useCallMachine] Calling ${prospect.name} from ${fromNumber}`)
    send({ type: 'CALL', prospect })

    const session = await provider.connect({
      to: prospect.phone,
      from: fromNumber,
      prospectId: prospect.id,
      prospectName: prospect.name,
    })

    if (session) {
      sessionRef.current = session
    } else {
      send({ type: 'ERROR', message: 'Failed to connect' })
    }
  }, [send, organisation])

  const hangup = useCallback(() => {
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
    // Le save est fait par l'autosave useEffect quand on entre en disconnected.
    // Ici on fait juste un re-save pour capturer les derniers changements de disposition/notes
    // AVANT de reset vers idle (le useEffect ne se re-declenchera pas car isDisconnectedState est deja true).
    if (state.matches('disconnected')) {
      // Mêmes règles que l'autosave (Minari rule : < 8s = voicemail)
      const dur = state.context.duration || 0
      const defaultOutcome = state.context.wasAnswered
        ? (dur >= 8 ? 'connected' : 'voicemail')
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

  // Voicemail drop : déposer un message et raccrocher
  const voicemailDrop = useCallback(async (audioUrl: string) => {
    const callSid = state.context.callSid
    if (!callSid) { console.warn('[useCallMachine] No callSid for voicemail drop'); return }
    console.log(`[useCallMachine] Voicemail drop: ${audioUrl} on ${callSid}`)
    try {
      await dropVoicemail(callSid, audioUrl)
      // Raccrocher le leg SDR — le message continue de jouer côté prospect
      providerRef.current?.disconnectAll()
      sessionRef.current = null
      send({ type: 'HANG_UP' })
    } catch (err) {
      console.error('[useCallMachine] Voicemail drop failed:', err)
    }
  }, [state.context.callSid, send])

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
    voicemailDrop,
  }
}
