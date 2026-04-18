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
import { createProvider, type CallProvider, type CallSession, type AudioSample, type IncomingCallInfo } from '@/services/providers'
import { TwilioProvider } from '@/services/providers/twilio-provider'
import { fetchVoiceToken, fetchTelnyxToken, saveCallDisposition, dropVoicemail } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { useTwilioDevice } from '@/hooks/useIncomingCall'
import { MOS_ALERT_THRESHOLD } from '@/config/constants'
import type { Prospect } from '@/types/prospect'
import type { Disposition } from '@/types/call'
import { normalizePhone } from '@/utils/phone'

export function useCallMachine() {
  const { organisation, profile } = useAuth()
  const queryClient = useQueryClient()
  const { device: sharedDevice, deviceReady: sharedDeviceReady } = useTwilioDevice()
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
    // Twilio : attendre le Device partagé du TwilioDeviceProvider
    if (voiceProvider === 'twilio' && !sharedDevice) return

    const providerName = voiceProvider
    const provider = createProvider(providerName)
    providerRef.current = provider
    let cancelled = false

    // Injecter le Device partagé — PAS de 2ème Device
    if (providerName === 'twilio' && sharedDevice && provider instanceof TwilioProvider) {
      provider.useExternalDevice(sharedDevice)
    }

    const unsub = provider.on({
      onReady: () => {
        if (!cancelled) {
          console.log(`[useCallMachine] ${providerName} ready (shared device)`)
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
          if (sid) send({ type: 'RINGING', callSid: sid })
          send({ type: 'ANSWERED' })
        }
        if (callState === 'done') {
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

    const tokenFetcher = providerName === 'telnyx' ? fetchTelnyxToken : fetchVoiceToken
    provider.setTokenFetcher(tokenFetcher)

    // Twilio avec Device externe : init() est un no-op mais trigger onReady
    // Telnyx : init normal avec token
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
  }, [orgId, voiceProvider, send, sharedDevice])

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

    const fromNumber = overrideFromNumber || profile?.assigned_phone || organisation?.from_number || '+33757905591'
    const toNumber = normalizePhone(prospect.phone)
    if (!toNumber) {
      console.error(`[useCallMachine] Numéro invalide pour ${prospect.name}: "${prospect.phone}"`)
      send({ type: 'ERROR', message: 'Numéro invalide' })
      return
    }
    console.log(`[useCallMachine] Calling ${prospect.name} from ${fromNumber} to ${toNumber}`)
    send({ type: 'CALL', prospect })

    const session = await provider.connect({
      to: toNumber,
      from: fromNumber,
      prospectId: prospect.id,
      prospectName: prospect.name,
    })

    if (session) {
      sessionRef.current = session
    } else {
      send({ type: 'ERROR', message: 'Failed to connect' })
    }
  }, [send, organisation, profile])

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

  // Voicemail drop : arme un drop sur le call (amd-callback le posera au bip).
  // Pas de disconnect immédiat — answerOnBridge=true ferait hangup le child
  // avant que AMD ne tire. Le call se termine naturellement quand amd-callback
  // pose <Play><Hangup/> sur le child, qui cascade au parent via answerOnBridge.
  const voicemailDrop = useCallback(async (audioUrl: string) => {
    const callSid = state.context.callSid
    if (!callSid) { console.warn('[useCallMachine] No callSid for voicemail drop'); return }
    console.log(`[useCallMachine] Arming voicemail drop: ${audioUrl} on ${callSid}`)
    try {
      await dropVoicemail(callSid, audioUrl)
      // Marque le outcome voicemail en anticipation (au cas où status-callback
      // arrive avant amd-callback pour un scénario racy).
      send({ type: 'SET_DISPOSITION', disposition: 'voicemail' })
    } catch (err) {
      console.error('[useCallMachine] Arm voicemail drop failed:', err)
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
