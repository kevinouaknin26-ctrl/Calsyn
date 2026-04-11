/**
 * History — Page historique d'appels.
 * Liste tous les appels avec filtres, clic pour voir les details + scores IA.
 */

import { useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useCalls } from '@/hooks/useCalls'
import { useRealtimeCalls } from '@/hooks/useRealtime'
import AIAnalysis from '@/components/call/AIAnalysis'
import type { Call } from '@/types/call'

function formatDuration(s: number) {
  if (!s) return '—'
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const OUTCOME_COLORS: Record<string, string> = {
  rdv: '#30d158', connected: '#2997ff', callback: '#ff9f0a',
  not_interested: '#ff453a', no_answer: '#86868b', voicemail: '#86868b',
  busy: '#86868b', wrong_number: '#ff453a',
}

export default function History() {
  const { isDark } = useTheme()
  const { isManager } = useAuth()
  const { data: calls, isLoading } = useCalls()
  useRealtimeCalls()

  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [filter, setFilter] = useState('all')

  const filtered = calls?.filter(c => filter === 'all' || c.call_outcome === filter) || []

  const bg = isDark ? 'bg-black' : 'bg-[#f5f5f7]'
  const card = isDark ? 'bg-[#1c1c1e] border-white/[0.08]' : 'bg-white border-black/[0.06]'
  const text = isDark ? 'text-white' : 'text-gray-900'

  return (
    <div className={`min-h-screen ${bg} flex transition-colors`}>
      {/* Liste */}
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className={`text-2xl font-extrabold tracking-tight ${text}`}>
              {isManager ? 'Historique equipe' : 'Mes appels'}
            </h1>
            <p className="text-sm text-[#86868b] mt-1">{filtered.length} appels</p>
          </div>

          {/* Filtres */}
          <div className="flex gap-1.5">
            {['all', 'rdv', 'connected', 'callback', 'no_answer', 'not_interested'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  filter === f
                    ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20'
                    : isDark ? 'text-[#86868b] hover:text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {f === 'all' ? 'Tous' : f === 'rdv' ? 'RDV' : f === 'connected' ? 'Connecte' : f === 'callback' ? 'Rappel' : f === 'no_answer' ? 'Absent' : 'Refus'}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-20">
            <p className="text-sm text-[#86868b]">Chargement...</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">📭</p>
            <p className={`text-sm font-bold ${text}`}>Aucun appel</p>
            <p className="text-xs text-[#86868b] mt-1">Lancez une session depuis le Dialer</p>
          </div>
        )}

        {/* List */}
        {filtered.length > 0 && (
          <div className="space-y-1.5">
            {filtered.map(c => {
              const color = OUTCOME_COLORS[c.call_outcome || ''] || '#86868b'
              const isSelected = selectedCall?.id === c.id
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCall(c)}
                  className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-colors border ${
                    isSelected ? `${card} border-[#0071e3]/30` : `${card} hover:border-[#0071e3]/10`
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-extrabold"
                    style={{ background: color + '22', color }}>
                    {(c.prospect_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${text}`}>{c.prospect_name || 'Inconnu'}</p>
                    <p className="text-[11px] text-[#86868b]">{c.prospect_phone}</p>
                  </div>
                  <div className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: color + '22', color }}>
                    {c.call_outcome || '—'}
                  </div>
                  <div className="text-xs font-mono text-[#86868b] w-12 text-right">{formatDuration(c.call_duration)}</div>
                  {c.ai_score_global && (
                    <div className="text-xs font-bold text-[#bf5af2] w-10 text-right">{c.ai_score_global}</div>
                  )}
                  <div className="text-[11px] text-[#86868b] w-24 text-right">{formatDate(c.created_at)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedCall && (
        <div className={`w-96 border-l p-5 overflow-y-auto ${isDark ? 'border-white/[0.08]' : 'border-black/[0.06]'}`}>
          <div className="flex items-center justify-between mb-5">
            <h2 className={`text-lg font-bold ${text}`}>{selectedCall.prospect_name}</h2>
            <button onClick={() => setSelectedCall(null)} className="text-[#86868b] hover:text-[#ff453a] text-lg">✕</button>
          </div>

          <div className="space-y-3 mb-5">
            <div className="flex justify-between text-sm">
              <span className="text-[#86868b]">Telephone</span>
              <span className={text}>{selectedCall.prospect_phone}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#86868b]">Duree</span>
              <span className={text}>{formatDuration(selectedCall.call_duration)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#86868b]">Date</span>
              <span className={text}>{formatDate(selectedCall.created_at)}</span>
            </div>
            {selectedCall.note && (
              <div>
                <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider mb-1">Notes</p>
                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{selectedCall.note}</p>
              </div>
            )}
            {selectedCall.recording_url && (
              <div>
                <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider mb-1">Enregistrement</p>
                <audio controls src={selectedCall.recording_url} className="w-full h-8" />
              </div>
            )}
          </div>

          <AIAnalysis call={selectedCall} />
        </div>
      )}
    </div>
  )
}
