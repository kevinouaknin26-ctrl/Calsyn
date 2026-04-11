/**
 * DispositionForm — Formulaire post-appel (disposition, notes, RDV).
 * Affiché quand XState est en état 'disconnected'.
 */

import { useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import type { Disposition } from '@/types/call'

interface Props {
  prospectName: string
  onSave: (disposition: Disposition, notes: string, meetingBooked: boolean) => void
  error?: string | null
}

const DISPOSITIONS: Array<{ value: Disposition; label: string; color: string }> = [
  { value: 'rdv', label: 'RDV confirmé', color: '#30d158' },
  { value: 'connected', label: 'Connecté', color: '#2997ff' },
  { value: 'callback', label: 'Rappel', color: '#ff9f0a' },
  { value: 'not_interested', label: 'Pas intéressé', color: '#ff453a' },
  { value: 'voicemail', label: 'Messagerie', color: '#86868b' },
  { value: 'no_answer', label: 'Pas de réponse', color: '#86868b' },
  { value: 'busy', label: 'Occupé', color: '#86868b' },
  { value: 'wrong_number', label: 'Mauvais numéro', color: '#ff453a' },
]

export default function DispositionForm({ prospectName, onSave, error }: Props) {
  const { isDark } = useTheme()
  const [disposition, setDisposition] = useState<Disposition | null>(null)
  const [notes, setNotes] = useState('')
  const [meetingBooked, setMeetingBooked] = useState(false)

  const canSave = disposition !== null

  return (
    <div className={`rounded-2xl border p-5 ${isDark ? 'bg-[#1c1c1e] border-white/[0.08]' : 'bg-white border-black/[0.06]'}`}>
      <h3 className={`text-sm font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
        Disposition — {prospectName}
      </h3>

      {/* Disposition pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {DISPOSITIONS.map(d => (
          <button
            key={d.value}
            onClick={() => { setDisposition(d.value); if (d.value === 'rdv') setMeetingBooked(true) }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{
              background: disposition === d.value ? d.color + '22' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              color: disposition === d.value ? d.color : '#86868b',
              border: `1px solid ${disposition === d.value ? d.color + '44' : 'transparent'}`,
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Notes */}
      <textarea
        placeholder="Notes..."
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={3}
        className={`w-full px-3 py-2 rounded-xl text-sm outline-none resize-none mb-3 ${
          isDark ? 'bg-[#2c2c2e] border-white/[0.08] text-white' : 'bg-gray-50 border-black/[0.06] text-gray-900'
        } border`}
      />

      {/* RDV checkbox */}
      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={meetingBooked}
          onChange={e => setMeetingBooked(e.target.checked)}
          className="rounded"
        />
        <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>RDV confirmé</span>
      </label>

      {/* Error */}
      {error && (
        <div className="text-xs text-[#ff453a] bg-[#ff453a]/10 px-3 py-2 rounded-lg mb-3">{error}</div>
      )}

      {/* Save button */}
      <button
        onClick={() => { if (disposition) onSave(disposition, notes, meetingBooked) }}
        disabled={!canSave}
        className="w-full py-3 rounded-xl text-sm font-bold bg-[#0071e3] text-white hover:bg-[#0077ed] transition-colors disabled:opacity-30"
      >
        Sauvegarder et continuer
      </button>
    </div>
  )
}
