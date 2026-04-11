/**
 * Historique — Style Minari, fond blanc, tout en francais.
 */

import { useState } from 'react'
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
  rdv: '#059669', connected: '#0ea5e9', callback: '#f59e0b',
  not_interested: '#ef4444', no_answer: '#9ca3af', voicemail: '#9ca3af',
  busy: '#9ca3af', wrong_number: '#ef4444',
}

const OUTCOME_LABELS: Record<string, string> = {
  rdv: 'RDV pris', connected: 'Connecte', callback: 'Rappel',
  not_interested: 'Pas interesse', no_answer: 'Pas de reponse',
  voicemail: 'Messagerie', busy: 'Occupe', wrong_number: 'Mauvais numero',
}

const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'rdv', label: 'RDV' },
  { key: 'connected', label: 'Connecte' },
  { key: 'callback', label: 'Rappel' },
  { key: 'no_answer', label: 'Absent' },
  { key: 'not_interested', label: 'Refuse' },
]

export default function History() {
  const { isManager } = useAuth()
  const { data: calls, isLoading } = useCalls()
  useRealtimeCalls()
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [filter, setFilter] = useState('all')

  const filtered = calls?.filter(c => filter === 'all' || c.call_outcome === filter) || []

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#0f0f1a] flex">
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{isManager ? 'Historique equipe' : 'Mes appels'}</h1>
            <p className="text-sm text-gray-400 mt-1">{filtered.length} appels</p>
          </div>
          <div className="flex gap-1.5">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  filter === f.key ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'text-gray-400 hover:text-gray-600'
                }`}>{f.label}</button>
            ))}
          </div>
        </div>

        {isLoading && <p className="text-sm text-gray-400 text-center py-20">Chargement...</p>}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">📭</p>
            <p className="text-sm font-semibold text-gray-700">Aucun appel</p>
            <p className="text-xs text-gray-400 mt-1">Lancez une session depuis le Dialer</p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="bg-white dark:bg-[#1a1a2e] rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="py-2 px-4 text-left">Prospect</th>
                  <th className="py-2 px-4 text-left">Resultat</th>
                  <th className="py-2 px-4 text-left">Duree</th>
                  <th className="py-2 px-4 text-left">Score IA</th>
                  <th className="py-2 px-4 text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const color = OUTCOME_COLORS[c.call_outcome || ''] || '#9ca3af'
                  const label = OUTCOME_LABELS[c.call_outcome || ''] || c.call_outcome || '—'
                  return (
                    <tr key={c.id} onClick={() => setSelectedCall(c)}
                      className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors text-sm ${
                        selectedCall?.id === c.id ? 'bg-indigo-50/50' : ''
                      }`}>
                      <td className="py-3 px-4">
                        <p className="font-medium text-gray-800">{c.prospect_name || 'Inconnu'}</p>
                        <p className="text-xs text-gray-400">{c.prospect_phone}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: color + '18', color }}>{label}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 font-mono text-xs">{formatDuration(c.call_duration)}</td>
                      <td className="py-3 px-4 text-purple-500 font-bold text-xs">{c.ai_score_global || '—'}</td>
                      <td className="py-3 px-4 text-gray-400 text-xs">{formatDate(c.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedCall && (
        <div className="w-96 border-l border-gray-200 bg-white p-5 overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-800">{selectedCall.prospect_name}</h2>
            <button onClick={() => setSelectedCall(null)} className="text-gray-400 hover:text-red-400 text-lg">✕</button>
          </div>
          <div className="space-y-3 mb-5 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Telephone</span><span className="text-gray-700">{selectedCall.prospect_phone}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Duree</span><span className="text-gray-700">{formatDuration(selectedCall.call_duration)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="text-gray-700">{formatDate(selectedCall.created_at)}</span></div>
            {selectedCall.note && (
              <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Notes</p><p className="text-gray-600">{selectedCall.note}</p></div>
            )}
            {selectedCall.recording_url && (
              <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Enregistrement</p><audio controls src={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recording-proxy?url=${encodeURIComponent(selectedCall.recording_url!)}`} className="w-full h-8" /></div>
            )}
          </div>
          <AIAnalysis call={selectedCall} />
        </div>
      )}
    </div>
  )
}
