/**
 * ProspectModal — Style Minari pixel-perfect, francais, confettis, boutons bleu/rouge.
 */

import { useState } from 'react'
import type { Prospect } from '@/types/prospect'
import type { Disposition } from '@/types/call'
import type { CallContext } from '@/machines/callMachine'

interface Props {
  prospect: Prospect
  callContext: CallContext | null
  isInCall: boolean
  isDisconnected: boolean
  onCall: (p: Prospect) => void
  onClose: () => void
  onSetDisposition: (d: Disposition) => void
  onSetNotes: (n: string) => void
  onSetMeeting: (m: boolean) => void
  onReset: () => void
  onNextCall: () => void
  providerReady: boolean
}

function formatPhone(phone: string): string {
  if (phone.startsWith('+33') && phone.length === 12) {
    return `+33 ${phone[3]} ${phone.slice(4, 6)} ${phone.slice(6, 8)} ${phone.slice(8, 10)} ${phone.slice(10, 12)}`
  }
  return phone
}

function formatDuration(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

const DISPOSITIONS: Array<{ value: Disposition; label: string }> = [
  { value: 'connected', label: 'Connecte' },
  { value: 'rdv', label: 'RDV pris' },
  { value: 'callback', label: 'Rappel' },
  { value: 'not_interested', label: 'Pas interesse' },
  { value: 'voicemail', label: 'Messagerie' },
  { value: 'no_answer', label: 'Pas de reponse' },
  { value: 'busy', label: 'Occupe' },
]

// ── Confettis (style Minari — quand Meeting booked) ────────────────
function Confetti() {
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    x: Math.random() * 100,
    size: 5 + Math.random() * 8,
    color: ['#059669', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'][i % 6],
    delay: Math.random() * 0.6,
    rotation: Math.random() * 360,
  }))
  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {pieces.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${p.x}%`, top: -20,
          width: p.size, height: p.size,
          borderRadius: Math.random() > 0.5 ? '50%' : 2,
          background: p.color,
          animation: `confettiFall 2s ${p.delay}s ease-in forwards`,
          transform: `rotate(${p.rotation}deg)`,
        }} />
      ))}
      <style>{`@keyframes confettiFall { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }`}</style>
    </div>
  )
}

export default function ProspectModal({
  prospect, callContext, isInCall, isDisconnected,
  onCall, onClose, onSetDisposition, onSetNotes, onSetMeeting, onReset, onNextCall, providerReady,
}: Props) {
  const [activeTab, setActiveTab] = useState('activite')
  const [showConfetti, setShowConfetti] = useState(false)
  const tabs = ['Activite', 'Notes', 'Taches', 'Historique', 'SMS']

  const handleMeetingToggle = (checked: boolean) => {
    onSetMeeting(checked)
    if (checked) {
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 2500)
    }
  }

  return (
    <>
      {showConfetti && <Confetti />}

      <div className="fixed inset-0 bg-black/20 flex items-start justify-center pt-[8vh] z-40" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-[820px] max-h-[80vh] flex overflow-hidden" onClick={e => e.stopPropagation()}>

          {/* ── Gauche — Infos ── */}
          <div className="w-[280px] p-5 border-r border-gray-100 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-400">👤</div>
              <h2 className="text-base font-bold text-gray-800 flex-1">{prospect.name}</h2>
              <button className="text-gray-300 hover:text-gray-500 text-xs">✏️</button>
            </div>

            <div className="flex gap-1.5 mb-3 ml-9">
              <button className="w-5 h-5 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-[9px] text-gray-400 hover:text-blue-500 hover:border-blue-300">in</button>
              <button className="w-5 h-5 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-[9px] text-gray-400 hover:text-gray-600">⚙</button>
            </div>

            <p className="text-sm text-gray-600 mb-0.5">{prospect.sector || '—'}</p>
            <p className="text-sm text-gray-400 mb-4">{prospect.company || '—'}</p>

            <button
              onClick={() => onCall(prospect)}
              disabled={!providerReady || isInCall}
              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 mb-5"
            >
              📞 Appeler {formatPhone(prospect.phone)}
              <span className="text-white/40">▾</span>
            </button>

            <div className="space-y-4 text-sm flex-1">
              <div>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Email</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-gray-700 text-xs">{prospect.email || '—'}</p>
                  {prospect.email && <button onClick={() => navigator.clipboard.writeText(prospect.email!)} className="text-gray-300 hover:text-gray-500 text-[9px]">📋</button>}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Statut</span>
                <p className="text-gray-700 text-xs mt-0.5">{prospect.status} ▾</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Telephone</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-gray-700 text-xs">{formatPhone(prospect.phone)}</p>
                  <button onClick={() => navigator.clipboard.writeText(prospect.phone)} className="text-gray-300 hover:text-gray-500 text-[9px]">📋</button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Droite — Activite ── */}
          <div className="flex-1 flex flex-col">
            {/* Transcription live */}
            {isInCall && (
              <div className="px-5 py-3 bg-emerald-50/80 border-b border-emerald-100">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 animate-pulse" />
                  <p className="text-sm text-gray-600 italic">Appel en cours — transcription bientot disponible...</p>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center justify-between px-5 pt-4">
              <div className="flex gap-5">
                {tabs.map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab.toLowerCase())}
                    className={`text-sm pb-2 transition-colors ${
                      activeTab === tab.toLowerCase() ? 'text-gray-800 font-semibold border-b-2 border-gray-800' : 'text-gray-400 hover:text-gray-600'
                    }`}>{tab}</button>
                ))}
              </div>
              <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg">✕</button>
            </div>
            <div className="h-px bg-gray-100 mx-5" />

            {/* Contenu */}
            <div className="flex-1 overflow-y-auto px-5 py-4">

              {/* Card appel en cours */}
              {isInCall && (
                <div className="border border-emerald-200 rounded-xl p-4 mb-4 bg-emerald-50/30">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-emerald-500">📞</span>
                    <span className="text-sm text-gray-700 font-medium">Appel - Connecte</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-600">En cours</span>
                    <span className="ml-auto text-xs text-gray-400">{new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <textarea
                    placeholder="Ecrire une note..."
                    value={callContext?.notes || ''}
                    onChange={e => onSetNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 outline-none resize-none"
                  />
                </div>
              )}

              {/* Card post-appel (disposition) */}
              {isDisconnected && (
                <div className="border border-gray-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-gray-400">📞</span>
                    <span className="text-sm text-gray-700 font-medium">Appel termine</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-600">
                      Connecte
                    </span>
                    <span className="ml-auto text-xs text-gray-400">{new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  {/* Outcome + Duration + Meeting booked (style Minari frame_050) */}
                  <div className="flex items-start gap-6 mb-4">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Resultat</label>
                      <select
                        value={callContext?.disposition || 'connected'}
                        onChange={e => onSetDisposition(e.target.value as Disposition)}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 outline-none"
                      >
                        {DISPOSITIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Duree</label>
                      <p className="text-sm font-mono text-gray-700 mt-1">{formatDuration(callContext?.duration || 0)}</p>
                    </div>
                    <label className="flex items-center gap-2 mt-5 cursor-pointer">
                      <input type="checkbox" checked={callContext?.meetingBooked || false}
                        onChange={e => handleMeetingToggle(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-teal-600" />
                      <span className={`text-sm font-medium ${callContext?.meetingBooked ? 'text-teal-600' : 'text-gray-600'}`}>
                        {callContext?.meetingBooked ? '✓ RDV pris' : 'RDV pris'}
                      </span>
                    </label>
                  </div>

                  {/* Recording status */}
                  <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-600 text-xs flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    Enregistrement en cours de traitement...
                  </div>

                  {/* Notes */}
                  <textarea
                    placeholder="Ecrire une note..."
                    value={callContext?.notes || ''}
                    onChange={e => onSetNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 outline-none resize-none mb-4"
                  />

                  {/* Boutons bleu + rouge (style Minari) */}
                  <div className="flex gap-3">
                    <button onClick={() => { onReset(); onNextCall() }}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center justify-center gap-2">
                      ▶ Raccrocher et continuer
                    </button>
                    <button onClick={() => { onReset(); onClose() }}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
                      ⏹ Raccrocher et arreter
                    </button>
                  </div>
                </div>
              )}

              {/* Historique vide */}
              {!isInCall && !isDisconnected && (
                <p className="text-sm text-gray-400 text-center py-10">
                  {prospect.call_count > 0 ? `${prospect.call_count} appels precedents` : 'Aucun appel enregistre'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
