/**
 * Dialer — Page principale style Minari pixel-perfect.
 * Table full-width, colonnes Minari exactes, stats en haut,
 * modal prospect au centre, barre d'appel noire flottante.
 */

import { useState, useEffect, useCallback, memo } from 'react'
import { useCallMachine } from '@/hooks/useCallMachine'
import { useProspectLists, useProspects } from '@/hooks/useProspects'
import { useCallsByProspect } from '@/hooks/useCalls'
import ProspectModal from '@/components/call/ProspectModal'
import type { Prospect, CrmStatus } from '@/types/prospect'

// ── Call status badges (Minari style) ─────────────────────────────
const CALL_STATUS: Record<string, { bg: string; text: string; label: string }> = {
  idle:         { bg: 'bg-gray-100', text: 'text-gray-500', label: 'En attente' },
  calling:      { bg: 'bg-red-50', text: 'text-red-500', label: 'Initiated' },
  connected:    { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Connected' },
  to_callback:  { bg: 'bg-yellow-50', text: 'text-yellow-600', label: 'Callback' },
  interested:   { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Interested' },
  not_reached:  { bg: 'bg-orange-50', text: 'text-orange-500', label: 'No Answer' },
  refused:      { bg: 'bg-red-50', text: 'text-red-500', label: 'Refused' },
  converted:    { bg: 'bg-teal-50', text: 'text-teal-600', label: 'Meeting booked' },
}

// ── CRM status (personnalisable) ──────────────────────────────────
const CRM_STATUS: Record<CrmStatus, { label: string; color: string }> = {
  new:                    { label: 'New', color: 'text-gray-500' },
  open:                   { label: 'Open', color: 'text-blue-500' },
  in_progress:            { label: 'In Progress', color: 'text-indigo-500' },
  open_deal:              { label: 'Open Deal', color: 'text-purple-500' },
  unqualified:            { label: 'Unqualified', color: 'text-gray-400' },
  attempted_to_contact:   { label: 'Attempted', color: 'text-orange-500' },
  connected:              { label: 'Connected', color: 'text-emerald-500' },
  bad_timing:             { label: 'Bad Timing', color: 'text-yellow-600' },
  not_interested:         { label: 'Pas interesse', color: 'text-red-400' },
  callback:               { label: 'A rappeler', color: 'text-amber-500' },
  rdv:                    { label: 'RDV', color: 'text-teal-600' },
  mail_sent:              { label: 'Mail envoye', color: 'text-sky-500' },
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

function formatTimer(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

/** Dates relatives style Minari ("il y a 2h", "hier", etc.) */
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'a l\'instant'
  if (mins < 60) return `il y a ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days}j`
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

// ── Prospect Row (Minari colonnes exactes) ────────────────────────
const ProspectRow = memo(function ProspectRow({ prospect, isActive, onSelect, onCall }: {
  prospect: Prospect; isActive: boolean; onSelect: (p: Prospect) => void; onCall: (p: Prospect) => void
}) {
  const st = CALL_STATUS[prospect.status] || CALL_STATUS.idle
  const crm = CRM_STATUS[prospect.crm_status] || CRM_STATUS.new

  return (
    <tr onClick={() => onSelect(prospect)}
      className={`border-b border-gray-50 cursor-pointer transition-colors text-[13px] ${
        isActive ? 'bg-emerald-50/60' : 'hover:bg-gray-50/80'
      }`}>
      {/* CALL STATUS */}
      <td className="py-2.5 px-4">
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${st.bg} ${st.text}`}>{st.label}</span>
      </td>
      {/* CALLS */}
      <td className="py-2.5 px-3 text-gray-400 text-xs text-center">{prospect.call_count || '—'}</td>
      {/* NAME */}
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); onCall(prospect) }}
            className="text-gray-300 hover:text-emerald-500 transition-colors text-xs flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <span className="font-medium text-gray-800">{prospect.name}</span>
        </div>
      </td>
      {/* TITLE (poste) */}
      <td className="py-2.5 px-4 text-gray-500 truncate max-w-[160px]">{prospect.title || '—'}</td>
      {/* COMPANY */}
      <td className="py-2.5 px-4 text-gray-500 truncate max-w-[160px]">{prospect.company || '—'}</td>
      {/* LAST CALL */}
      <td className="py-2.5 px-4 text-gray-400 text-xs">{timeAgo(prospect.last_call_at)}</td>
      {/* STATUS (CRM) */}
      <td className="py-2.5 px-4">
        <span className={`text-xs font-medium ${crm.color}`}>{crm.label}</span>
      </td>
      {/* PHONE NUMBER */}
      <td className="py-2.5 px-4 text-gray-400 text-xs font-mono">{prospect.phone}</td>
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
  const [sortBy, setSortBy] = useState<'name' | 'last_call' | 'status'>('last_call')
  const { data: prospects } = useProspects(activeListId)
  const { data: callHistory } = useCallsByProspect(selectedProspect?.id ?? null)
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

  const activeList = lists?.find(l => l.id === activeListId)

  const filtered = prospects
    ?.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase())
      || p.phone.includes(search)
      || (p.company || '').toLowerCase().includes(search.toLowerCase())
      || (p.title || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'last_call') return (b.last_call_at || '').localeCompare(a.last_call_at || '')
      return a.status.localeCompare(b.status)
    })

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Header (Minari style) ── */}
      <div className="border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* List name + count */}
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-gray-800">{activeList?.name || 'Prospects'}</h1>
            <span className="text-xs text-gray-400">{prospects?.length || 0} contacts</span>
            <button className="text-gray-300 hover:text-gray-500 text-sm">...</button>
          </div>

          {/* Stats (Minari style) */}
          <div className="flex items-center gap-3 text-xs ml-4">
            {meetings > 0 && <span className="text-teal-600 font-semibold">{meetings} meetings</span>}
            <span className="text-emerald-500 font-semibold">Connected {connected}</span>
            <span className="text-orange-400 font-semibold">Attempted {attempted}</span>
            <span className="text-gray-400">Pending {pending}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Redial button */}
          {attempted > 0 && (
            <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-600 border border-emerald-200 hover:bg-emerald-50 transition-colors">
              Redial {prospects?.filter(p => p.status === 'not_reached').length || 0} contacts
            </button>
          )}

          {/* Resume/Cancel calling */}
          {isInCall ? (
            <button onClick={cm.hangup}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors">
              Cancel calls
            </button>
          ) : (
            <button onClick={() => { const next = prospects?.find(p => p.status === 'idle'); if (next) handleCall(next) }}
              disabled={!cm.providerReady || !(cm.isIdle || cm.isDisconnected)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors">
              {cm.providerReady ? 'Resume calling' : 'Connecting...'}
            </button>
          )}
        </div>
      </div>

      {/* ── Toolbar (Sort + Filter + Search) ── */}
      <div className="border-b border-gray-100 px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Sorted by</span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs text-gray-600 font-medium bg-transparent outline-none cursor-pointer">
            <option value="last_call">Last Call</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
          </select>
          <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filter
          </button>
        </div>
        <input
          type="text"
          placeholder="Search contacts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 outline-none text-gray-700 w-52 focus:border-gray-400"
        />
      </div>

      {/* ── List tabs ── */}
      <div className="border-b border-gray-100 px-6 flex items-center gap-1 overflow-x-auto">
        {lists?.map(l => (
          <button key={l.id} onClick={() => setActiveListId(l.id)}
            className={`px-3 py-2 text-xs whitespace-nowrap transition-colors border-b-2 ${
              activeListId === l.id
                ? 'text-gray-800 font-semibold border-gray-800'
                : 'text-gray-400 hover:text-gray-600 border-transparent'
            }`}>{l.name}</button>
        ))}
      </div>

      {/* ── Table (Minari colonnes exactes) ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="py-2.5 px-4 text-left">Call Status</th>
              <th className="py-2.5 px-3 text-center">Calls</th>
              <th className="py-2.5 px-4 text-left">Name</th>
              <th className="py-2.5 px-4 text-left">Title</th>
              <th className="py-2.5 px-4 text-left">Company</th>
              <th className="py-2.5 px-4 text-left">Last Call</th>
              <th className="py-2.5 px-4 text-left">Status</th>
              <th className="py-2.5 px-4 text-left">Phone Number</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.map(p => (
              <ProspectRow
                key={p.id}
                prospect={p}
                isActive={selectedProspect?.id === p.id && isInCall}
                onSelect={setSelectedProspect}
                onCall={handleCall}
              />
            ))}
          </tbody>
        </table>
        {!prospects?.length && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm">Aucun prospect dans cette liste</p>
          </div>
        )}
      </div>

      {/* ── Prospect Modal ── */}
      {selectedProspect && (
        <ProspectModal
          prospect={selectedProspect}
          callContext={cm.context}
          callHistory={callHistory || []}
          isInCall={isInCall}
          isDisconnected={cm.isDisconnected}
          onCall={handleCall}
          onClose={() => { if (!isInCall) setSelectedProspect(null) }}
          onSetDisposition={cm.setDisposition}
          onSetNotes={cm.setNotes}
          onSetMeeting={cm.setMeeting}
          onReset={cm.reset}
          onNextCall={() => {
            cm.reset()
            setSelectedProspect(null)
            const next = prospects?.find(p => p.status === 'idle' && p.id !== selectedProspect?.id)
            if (next) setTimeout(() => handleCall(next), 300)
          }}
          providerReady={cm.providerReady}
        />
      )}

      {/* ── Barre d'appel noire flottante (Minari style exact) ── */}
      {isInCall && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1c1c1c] text-white pl-6 pr-4 py-3 rounded-2xl flex items-center gap-6 z-50 shadow-2xl min-w-[480px]">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{cm.context.prospect?.name}</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50 font-mono">{cm.context.prospect?.phone}</span>
              <span className="text-xs text-white/70 font-mono">{formatTimer(duration)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Mute */}
            <button onClick={cm.isOnHold ? cm.unmute : cm.mute}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                cm.isOnHold ? 'bg-orange-500/30 text-orange-300' : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {cm.isOnHold ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                )}
              </svg>
            </button>
            {/* DTMF */}
            <button className="w-10 h-10 rounded-full bg-white/10 text-white/60 hover:bg-white/20 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            {/* Raccrocher */}
            <button onClick={cm.hangup}
              className="w-11 h-11 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
              <svg className="w-5 h-5 rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
            {/* Transfert */}
            <button className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
