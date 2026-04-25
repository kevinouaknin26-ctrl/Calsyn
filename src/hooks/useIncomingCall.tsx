import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { Device, Call } from '@twilio/voice-sdk'
import { fetchVoiceToken } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/config/supabase'

interface IncomingCallState {
  from: string
  to: string
  callSid: string
  _call: Call
  // Prospect match si le numero de l'appelant correspond a un contact enregistre
  prospect: { id: string; name: string | null; phone: string; company: string | null } | null
}

interface TwilioDeviceContext {
  device: Device | null
  deviceReady: boolean
  incoming: IncomingCallState | null
  accept: () => void
  reject: () => void
}

const Ctx = createContext<TwilioDeviceContext>({
  device: null,
  deviceReady: false,
  incoming: null,
  accept: () => {},
  reject: () => {},
})

export const useTwilioDevice = () => useContext(Ctx)

export function TwilioDeviceProvider({ children }: { children: ReactNode }) {
  const { profile, organisation } = useAuth()
  const navigate = useNavigate()
  const [device, setDevice] = useState<Device | null>(null)
  const [deviceReady, setDeviceReady] = useState(false)
  const [incoming, setIncoming] = useState<IncomingCallState | null>(null)
  // callRowRef retient la row calls.id creee a la SONNERIE, pour pouvoir
  // l'updater au disconnect avec le bon outcome (connected/missed/rejected)
  // et la duration. Garantit que meme les appels manques sont traces.
  const callRowRef = useRef<{
    callRowId: string
    sid: string
    accepted: boolean
    rejected: boolean
    acceptedAt: number | null
  } | null>(null)

  const orgId = organisation?.id
  const voiceProvider = organisation?.voice_provider || 'twilio'

  useEffect(() => {
    if (!orgId || !profile || voiceProvider !== 'twilio') return

    let cancelled = false
    let dev: Device | null = null

    async function init() {
      try {
        const token = await fetchVoiceToken()
        if (cancelled) return

        dev = new Device(token, {
          logLevel: 1,
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
          closeProtection: true,
          enableIceRestart: true,
          allowIncomingWhileBusy: true,
        } as ConstructorParameters<typeof Device>[1])

        dev.on('registered', () => {
          if (!cancelled) {
            console.log('[TwilioDevice] Registered (incoming + outgoing)')
            setDeviceReady(true)
          }
        })

        dev.on('error', (err) => {
          console.error('[TwilioDevice] Error:', err.code, err.message)
        })

        dev.on('unregistered', () => {
          if (!dev || dev.state === Device.State.Destroyed) return
          console.log('[TwilioDevice] Unregistered — re-registering...')
          setTimeout(async () => {
            try {
              if (dev && dev.state !== Device.State.Registered && dev.state !== Device.State.Destroyed) {
                const newToken = await fetchVoiceToken()
                if (!cancelled) {
                  dev.updateToken(newToken)
                  await dev.register()
                }
              }
            } catch (e) {
              console.error('[TwilioDevice] Re-register failed:', e)
            }
          }, 2000)
        })

        dev.on('tokenWillExpire', async () => {
          try {
            const newToken = await fetchVoiceToken()
            if (!cancelled && dev) {
              dev.updateToken(newToken)
              console.log('[TwilioDevice] Token refreshed')
            }
          } catch (e) {
            console.error('[TwilioDevice] Token refresh failed:', e)
          }
        })

        dev.on('incoming', async (call: Call) => {
          const fromNum = call.parameters.From || ''
          const toNum = call.parameters.To || ''
          const sid = call.parameters.CallSid || ''
          console.log(`[TwilioDevice] INCOMING from ${fromNum} to ${toNum}`)

          // Lookup prospect par numero (phone + phone2..5). On fait 5 queries
          // paralleles .eq() plutot qu'un .or(). Raison : le `+` dans un numero
          // E.164 dans le filter .or() est interprete comme un espace par
          // PostgREST URL decode → match fail silencieusement. Les .eq()
          // individuels sont encodes proprement par supabase-js.
          setIncoming({ from: fromNum, to: toNum, callSid: sid, _call: call, prospect: null })
          let matchedProspect: { id: string; name: string | null; phone: string; company: string | null } | null = null
          if (fromNum) {
            const cols = ['phone', 'phone2', 'phone3', 'phone4', 'phone5'] as const
            const results = await Promise.all(cols.map(col =>
              supabase.from('prospects').select('id, name, phone, company').eq(col, fromNum).limit(1)
            ))
            const firstHit = results.flatMap(r => r.data || [])[0]
            if (firstHit) {
              matchedProspect = firstHit
              setIncoming(prev => prev && prev.callSid === sid ? { ...prev, prospect: matchedProspect } : prev)
            }
          }

          // INSERT IMMEDIAT a la sonnerie. Outcome initial = 'ringing_incoming'.
          // Au disconnect on updatera avec l'outcome reel (connected / missed /
          // rejected). Ca garantit qu'on a une trace meme pour les appels manques.
          try {
            const { data: row, error } = await supabase.from('calls').insert({
              sdr_id: profile?.id,
              prospect_id: matchedProspect?.id || null,
              prospect_name: matchedProspect?.name || null,
              prospect_phone: fromNum,
              from_number: toNum,
              call_sid: sid,
              provider: 'twilio',
              call_duration: 0,
              call_outcome: 'ringing_incoming',
              note: '📞 Appel entrant',
            }).select('id').single()
            if (error) {
              console.warn('[TwilioDevice] Failed to insert incoming ringing row', error)
            } else if (row) {
              callRowRef.current = { callRowId: row.id, sid, accepted: false, rejected: false, acceptedAt: null }
            }
          } catch (e) {
            console.error('[TwilioDevice] Insert ringing row threw', e)
          }

          call.on('cancel', async () => {
            console.log('[TwilioDevice] Caller cancelled (missed call)')
            setIncoming(null)
            // Appel raccroche par l'appelant avant qu'on decroche = manque
            const tracked = callRowRef.current
            if (tracked && tracked.sid === sid && !tracked.accepted && !tracked.rejected) {
              await supabase.from('calls').update({
                call_outcome: 'missed_incoming',
              }).eq('id', tracked.callRowId)
              callRowRef.current = null
            }
          })

          call.on('disconnect', async () => {
            setIncoming(null)
            const tracked = callRowRef.current
            if (tracked && tracked.sid === sid) {
              if (tracked.accepted && tracked.acceptedAt) {
                // Accepte puis raccroche : update duration + outcome connecte
                const duration = Math.round((Date.now() - tracked.acceptedAt) / 1000)
                await supabase.from('calls').update({
                  call_duration: duration,
                  call_outcome: 'connected_incoming',
                }).eq('id', tracked.callRowId)
              } else if (tracked.rejected) {
                // Deja update par reject()
              } else {
                // Fallback : disconnect sans cancel ni accept (timeout, error)
                await supabase.from('calls').update({
                  call_outcome: 'missed_incoming',
                }).eq('id', tracked.callRowId)
              }
              callRowRef.current = null
            }
          })
        })

        await dev.register()
        if (!cancelled) setDevice(dev)
      } catch (err) {
        if (!cancelled) console.error('[TwilioDevice] Init failed:', err)
      }
    }

    init()

    return () => {
      cancelled = true
      setDeviceReady(false)
      setDevice(null)
      if (dev) {
        dev.destroy()
        dev = null
      }
    }
  }, [orgId, profile?.id, voiceProvider])

  const accept = useCallback(async () => {
    if (!incoming) return
    const { prospect } = incoming
    incoming._call.accept()
    console.log('[TwilioDevice] Accepted incoming')
    setIncoming(null)

    // La row calls a deja ete creee a la sonnerie. On la marque accepted.
    if (callRowRef.current) {
      callRowRef.current.accepted = true
      callRowRef.current.acceptedAt = Date.now()
    }

    // Si prospect connu : ouvrir sa fiche. Sinon, rediriger vers
    // /app/history pour que le SDR voie au moins le call qu'il vient
    // de prendre (et puisse l'assigner a un prospect si besoin).
    if (prospect?.id) {
      navigate('/app/contacts', { state: { openProspectId: prospect.id } })
    } else {
      navigate('/app/history')
    }
  }, [incoming, navigate])

  const reject = useCallback(async () => {
    if (!incoming) return
    incoming._call.reject()
    console.log('[TwilioDevice] Rejected incoming')
    setIncoming(null)
    // Update la row creee a la sonnerie avec outcome 'rejected_incoming'
    const tracked = callRowRef.current
    if (tracked && tracked.sid === incoming.callSid) {
      tracked.rejected = true
      await supabase.from('calls').update({
        call_outcome: 'rejected_incoming',
      }).eq('id', tracked.callRowId)
    }
  }, [incoming])

  return (
    <Ctx.Provider value={{ device, deviceReady, incoming, accept, reject }}>
      {children}
      {incoming && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-white rounded-2xl shadow-2xl border-2 border-green-400 px-6 py-4 flex items-center gap-4 min-w-[380px]"
          style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
          <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 animate-bounce">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-gray-500">Appel entrant</div>
            <div className="text-[18px] font-bold text-gray-900 truncate">
              {incoming.prospect?.name || incoming.from}
            </div>
            {incoming.prospect && (
              <div className="text-[11px] text-gray-500 truncate">
                {incoming.from}{incoming.prospect.company ? ` · ${incoming.prospect.company}` : ''}
              </div>
            )}
          </div>
          <button onClick={accept}
            className="px-5 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-[14px] font-bold transition-colors shadow-lg">
            Decrocher
          </button>
          <button onClick={reject}
            className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[14px] font-bold transition-colors shadow-lg">
            Rejeter
          </button>
        </div>
      )}
    </Ctx.Provider>
  )
}
