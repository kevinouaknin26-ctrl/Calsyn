/**
 * Dialer — Page principale style Minari.
 * Fond blanc, table full-width, tabs listes en haut,
 * modal prospect Minari au centre, barre d'appel noire flottante en bas.
 */

import { useState, useEffect, useCallback, memo } from 'react'
import { useCallMachine } from '@/hooks/useCallMachine'
import { useProspectLists, useProspects } from '@/hooks/useProspects'
import ProspectModal from '@/components/call/ProspectModal'
import type { Prospect } from '@/types/prospect'

// ── Status badge (Minari style) ────────────────────────────────────
const STATUS: Record<string, { bg: string; text: string; label: string }> = {
  idle:         { bg: 'bg-gray-100', text: 'text-gray-500', label: 'En attente' },
  calling:      { bg: 'bg-orange-100', text: 'text-orange-600', label: 'Appel...' },
  connected:    { bg: 'bg-emerald-100', text: 'text-emerald-600', label: 'Connecte' },
  to_callback:  { bg: 'bg-yellow-100', text: 'text-yellow-600', label: 'Rappel' },
  interested:   { bg: 'bg-emerald-100', text: 'text-emerald-600', label: 'Interesse' },
  not_reached:  { bg: 'bg-orange-100', text: 'text-orange-500', label: 'Messagerie' },
  refused:      { bg: 'bg-red-100', text: 'text-red-500', label: 'Refuse' },
  converted:    { bg: 'bg-teal-100', text: 'text-teal-600', label: 'RDV pris' },
}

// ── Timer hook ─────────────────────────────────────────────────────
function useTimer(startedAt: number | null) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt) { setElapsed(0); return }
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return elapsed
}

function formatDuration(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

// ── Prospect Row ───────────────────────────────────────────────────
const ProspectRow = memo(function ProspectRow({ prospect, onSelect, onCall }: {
  prospect: Prospect; onSelect: (p: Prospect) => void; onCall: (p: Prospect) => void
}) {
  const st = STATUS[prospect.status] || STATUS.idle
  return (
    <tr onClick={() => onSelect(prospect)}
      className="border-b border-gray-50 hover:bg-gray-50/80 cursor-pointer transition-colors text-sm">
      <td className="py-3 px-4">
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${st.bg} ${st.text}`}>{st.label}</span>
      </td>
      <td className="py-3 px-2 text-gray-400 text-xs">{prospect.call_count}</td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); onCall(prospect) }}
            className="text-gray-300 hover:text-emerald-500 transition-colors">📞</button>
          <span className="font-medium text-gray-800">{prospect.name}</span>
        </div>
      </td>
      <td className="py-3 px-4 text-gray-500">{prospect.sector || '—'}</td>
      <td className="py-3 px-4 text-gray-500">{prospect.company || '—'}</td>
      <td className="py-3 px-4 text-gray-400 text-xs">{prospect.last_call_at ? new Date(prospect.last_call_at).toLocaleDateString('fr-FR') : '—'}</td>
      <td className="py-3 px-4 text-gray-400 text-xs font-mono">{prospect.phone}</td>
    </tr>
  )
})

// ── Page ────────────────────────────────────────────────────────────
export default function Dialer() {
  const cm = useCallMachine()
  const { data: lists } = useProspectLists()
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'last_call' | 'status'>('name')
  const { data: prospects } = useProspects(activeListId)
  const duration = useTimer(cm.context.startedAt)

  useEffect(() => { if (lists?.length && !activeListId) setActiveListId(lists[0].id) }, [lists, activeListId])

  const handleCall = useCallback((p: Prospect) => {
    if ((cm.isIdle || cm.isDisconnected) && cm.providerReady) {
      setSelectedProspect(p)
      cm.call(p)
    }
  }, [cm])

  const isInCall = cm.isDialing || cm.isConnected
  const connected = prospects?.filter(p => ['connected', 'interested', 'converted'].includes(p.status)).length || 0
  const attempted = prospects?.filter(p => p.call_count > 0).length || 0
  const pending = prospects?.filter(p => p.status === 'idle').length || 0
  const meetings = prospects?.filter(p => p.status === 'converted').length || 0

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col">
      {/* Tabs listes */}
      <div className="bg-white border-b border-gray-200 px-6 pt-3 flex items-center gap-1 overflow-x-auto">
        {lists?.map(l => (
          <button key={l.id} onClick={() => setActiveListId(l.id)}
            className={`px-4 py-2 text-sm rounded-t-lg whitespace-nowrap transition-colors ${
              activeListId === l.id ? 'bg-[#f8f9fa] text-gray-800 font-semibold border border-gray-200 border-b-0' : 'text-gray-400 hover:text-gray-600'
            }`}>{l.name}</button>
        ))}
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-gray-800">{lists?.find(l => l.id === activeListId)?.name || 'Prospects'}</h1>
          <span className="text-xs text-gray-400">{prospects?.length || 0} contacts</span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs text-gray-500 bg-transparent outline-none cursor-pointer">
            <option value="name">Tri : Nom</option>
            <option value="last_call">Tri : Dernier appel</option>
            <option value="status">Tri : Statut</option>
          </select>
          <input
            type="text"
            placeholder="🔍 Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 outline-none text-gray-700 w-48 focus:border-teal-400"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs">
            {meetings > 0 && <span className="text-teal-500 font-semibold">📅 {meetings} RDV</span>}
            <span className="text-emerald-500 font-semibold">● Connectes {connected}</span>
            <span className="text-orange-400 font-semibold">● Tentes {attempted}</span>
            <span className="text-gray-400">En attente {pending}</span>
          </div>
          <button onClick={() => { const next = prospects?.find(p => p.status === 'idle'); if (next) handleCall(next) }}
            disabled={!cm.providerReady || !(cm.isIdle || cm.isDisconnected)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors">
            {cm.providerReady ? '▶ Lancer les appels' : '⏳ Connexion...'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="py-2 px-4 text-left">Statut</th>
              <th className="py-2 px-2 text-left">Appels</th>
              <th className="py-2 px-4 text-left">Nom</th>
              <th className="py-2 px-4 text-left">Secteur</th>
              <th className="py-2 px-4 text-left">Entreprise</th>
              <th className="py-2 px-4 text-left">Dernier appel</th>
              <th className="py-2 px-4 text-left">Telephone</th>
            </tr>
          </thead>
          <tbody>
            {prospects
              ?.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.phone.includes(search) || (p.company || '').toLowerCase().includes(search.toLowerCase()))
              .sort((a, b) => {
                if (sortBy === 'name') return a.name.localeCompare(b.name)
                if (sortBy === 'last_call') return (b.last_call_at || '').localeCompare(a.last_call_at || '')
                if (sortBy === 'status') return a.status.localeCompare(b.status)
                return 0
              })
              .map(p => (
              <ProspectRow key={p.id} prospect={p} onSelect={setSelectedProspect} onCall={handleCall} />
            ))}
          </tbody>
        </table>
        {!prospects?.length && <div className="text-center py-20"><p className="text-gray-400 text-sm">Aucun prospect</p></div>}
      </div>

      {/* ── Prospect Modal (Minari style) ── */}
      {selectedProspect && (
        <ProspectModal
          prospect={selectedProspect}
          callContext={cm.context}
          isInCall={isInCall}
          isDisconnected={cm.isDisconnected}
          onCall={handleCall}
          onClose={() => { if (!isInCall) setSelectedProspect(null) }}
          onSetDisposition={cm.setDisposition}
          onSetNotes={cm.setNotes}
          onSetMeeting={cm.setMeeting}
          onReset={() => { cm.reset() }}
          onNextCall={() => {
            cm.reset()
            setSelectedProspect(null)
            // Appeler le prochain prospect idle
            const next = prospects?.find(p => p.status === 'idle' && p.id !== selectedProspect?.id)
            if (next) setTimeout(() => handleCall(next), 300)
          }}
          providerReady={cm.providerReady}
        />
      )}

      {/* ── Barre d'appel noire flottante en bas (Minari style) ── */}
      {isInCall && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white pl-6 pr-4 py-3 rounded-2xl flex items-center gap-6 z-50 shadow-2xl min-w-[500px]">
          <div className="flex-1">
            <p className="font-semibold text-sm">{cm.context.prospect?.name}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">● {cm.context.prospect?.phone}</span>
              <span className="text-xs text-white/50 font-mono">{formatDuration(duration)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={cm.isOnHold ? cm.unmute : cm.mute}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                cm.isOnHold ? 'bg-orange-500/30 text-orange-300' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
              {cm.isOnHold ? '🔇' : '🎤'}
            </button>
            <button className="w-10 h-10 rounded-full bg-white/10 text-white/60 hover:bg-white/20 flex items-center justify-center">⌨️</button>
            <button onClick={cm.hangup}
              className="w-11 h-11 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors text-lg">
              📞
            </button>
            <button className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors">↗️</button>
          </div>
        </div>
      )}
    </div>
  )
}
