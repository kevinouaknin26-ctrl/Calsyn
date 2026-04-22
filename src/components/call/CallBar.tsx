import { useEffect, useState } from 'react'
import { useCall } from '@/contexts/CallContext'

function formatTimer(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/**
 * Barre d'appel noire flottante — globale (Layout).
 * Visible dès qu'un appel est en cours (dialing ou connected), quelle que soit la page.
 * Variante "basique" : mute / DTMF / raccrocher. Les actions power-dialer avancées
 * (voicemail drop, raccrocher → suivant) restent dans Dialer.tsx car elles ont besoin
 * du contexte dialSession / liste active.
 *
 * Pour éviter la double-barre sur Dialer quand une session power est active,
 * on accepte une prop `hidden` que Dialer peut forcer à true pendant sa session.
 */
export default function CallBar({ hidden = false }: { hidden?: boolean }) {
  const cm = useCall()
  const isInCall = cm.isDialing || cm.isConnected
  const [showDTMF, setShowDTMF] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = cm.context.startedAt
    if (!startedAt) { setElapsed(0); return }
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [cm.context.startedAt])

  if (!isInCall || hidden) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1c1c1c] text-white pl-6 pr-4 py-3.5 rounded-2xl flex items-center gap-6 z-50 shadow-2xl min-w-[480px] animate-slide-up">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[14px] truncate">{cm.context.prospect?.name}</p>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-white/40">● {cm.context.prospect?.phone}</span>
          <span className="text-[12px] text-white/60 font-mono">{formatTimer(elapsed)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Mute */}
        <button onClick={cm.isOnHold ? cm.unmute : cm.mute} title={cm.isOnHold ? 'Réactiver le micro' : 'Couper le micro'}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border ${
            cm.isOnHold ? 'bg-orange-500/30 text-orange-300 border-orange-500/40' : 'bg-white/10 text-white/50 hover:bg-white/20 border-white/20'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {cm.isOnHold ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            )}
          </svg>
        </button>
        {/* DTMF */}
        <div className="relative">
          <button onClick={() => setShowDTMF(v => !v)} title="Pavé numérique"
            className="w-10 h-10 rounded-full bg-white/10 text-white/50 hover:bg-white/20 border border-white/20 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          {showDTMF && (
            <>
              <div className="fixed inset-0 z-[59]" onClick={() => setShowDTMF(false)} />
              <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#2a2a2a] rounded-xl shadow-xl border border-white/10 p-4 z-[60] animate-slide-up">
                <div className="grid grid-cols-3 gap-1.5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(d => (
                    <button key={d} onClick={() => cm.sendDTMF(d)}
                      className="w-12 h-12 rounded-lg bg-white/10 text-white text-[17px] font-semibold hover:bg-white/20 active:bg-white/30 transition-colors border border-white/10">
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        {/* Raccrocher rouge */}
        <button onClick={() => { cm.hangup(); setTimeout(() => cm.reset(), 500) }} title="Raccrocher"
          className="w-11 h-11 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors border border-red-400/50">
          <svg className="w-5 h-5 rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
