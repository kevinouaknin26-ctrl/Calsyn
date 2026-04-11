/**
 * CallPanel — Panel d'appel en cours (timer, mute, hangup, DTMF).
 * Connecté au useCallMachine. Isolé du reste pour éviter les re-renders.
 */

import { useTheme } from '@/hooks/useTheme'
import type { CallContext } from '@/machines/callMachine'

interface Props {
  state: string
  context: CallContext
  duration: number
  onHangup: () => void
  onMute: () => void
  onUnmute: () => void
  onSendDTMF: (digit: string) => void
  isTalking: boolean
  isOnHold: boolean
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export default function CallPanel({ state, context, duration, onHangup, onMute, onUnmute, onSendDTMF, isTalking, isOnHold }: Props) {
  const { isDark } = useTheme()

  const isActive = state === 'dialing' || state === 'connected' || state === 'connected.talking' || state === 'connected.on_hold'

  if (!isActive) return null

  return (
    <div className={`rounded-2xl border p-5 ${isDark ? 'bg-[#1c1c1e] border-white/[0.08]' : 'bg-white border-black/[0.06]'}`}>
      {/* Prospect name */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {context.prospect?.name || 'Appel en cours'}
          </p>
          <p className="text-xs text-[#86868b]">{context.prospect?.phone}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
          state === 'dialing' ? 'bg-[#ff9f0a]/10 text-[#ff9f0a]' : 'bg-[#30d158]/10 text-[#30d158]'
        }`}>
          {state === 'dialing' ? 'Appel...' : 'En ligne'}
        </div>
      </div>

      {/* Timer */}
      <div className={`text-center text-4xl font-extrabold tracking-tight mb-6 font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
        {formatDuration(duration)}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Mute */}
        <button
          onClick={isOnHold ? onUnmute : onMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-lg transition-colors ${
            isOnHold
              ? 'bg-[#ff9f0a]/20 text-[#ff9f0a]'
              : isDark ? 'bg-white/[0.08] text-white hover:bg-white/[0.15]' : 'bg-black/[0.06] text-gray-700 hover:bg-black/[0.12]'
          }`}
          title={isOnHold ? 'Réactiver le micro' : 'Couper le micro'}
        >
          {isOnHold ? '🔇' : '🎤'}
        </button>

        {/* DTMF */}
        <button
          className={`w-12 h-12 rounded-full flex items-center justify-center text-lg transition-colors ${
            isDark ? 'bg-white/[0.08] text-white hover:bg-white/[0.15]' : 'bg-black/[0.06] text-gray-700 hover:bg-black/[0.12]'
          }`}
          title="Clavier DTMF"
        >
          ⌨️
        </button>

        {/* Hangup */}
        <button
          onClick={onHangup}
          className="w-14 h-14 rounded-full bg-[#ff453a] text-white flex items-center justify-center text-xl hover:bg-[#ff453a]/80 transition-colors"
          title="Raccrocher"
        >
          📞
        </button>
      </div>
    </div>
  )
}
