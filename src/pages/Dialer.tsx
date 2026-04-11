/**
 * Dialer — Copie pixel-perfect de Minari (frames 001, 002, 012).
 * Fond vert menthe, table dans cadre blanc arrondi, tabs chips,
 * Call Settings dropdown, badges pill, icones LinkedIn/copier dans rows.
 */

import { useState, useEffect, useCallback, memo } from 'react'
import { useCallMachine } from '@/hooks/useCallMachine'
import { useProspectLists, useProspects, useCreateList } from '@/hooks/useProspects'
import { useCallsByProspect } from '@/hooks/useCalls'
import CSVImport from '@/components/import/CSVImport'
import ProspectModal from '@/components/call/ProspectModal'
import { useRealtimeProspects } from '@/hooks/useRealtime'
import type { Prospect } from '@/types/prospect'

// ── Call status badges (Minari exact : pill shape) ────────────────
// CALL STATUS = resultat du DERNIER APPEL, pas le statut du prospect
// "Pending" si jamais appele (call_count === 0)
const CALL_OUTCOME_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  // Etats idle (resultat dernier appel)
  pending:        { bg: '#f3f4f6', text: '#6b7280', label: 'Pending' },
  connected:      { bg: '#d1fae5', text: '#059669', label: 'Connected' },
  rdv:            { bg: '#ccfbf1', text: '#0d9488', label: 'Meeting booked' },
  callback:       { bg: '#fef3c7', text: '#d97706', label: 'Callback' },
  not_interested: { bg: '#fecaca', text: '#dc2626', label: 'Exposed' },
  no_answer:      { bg: '#f3f4f6', text: '#6b7280', label: 'No Answer' },
  voicemail:      { bg: '#fed7aa', text: '#ea580c', label: 'Voicemail' },
  busy:           { bg: '#f3f4f6', text: '#6b7280', label: 'Busy' },
  wrong_number:   { bg: '#fecaca', text: '#dc2626', label: 'Wrong Number' },
  dnc:            { bg: '#fecaca', text: '#dc2626', label: 'Do not call' },
  // Etats LIVE pendant session (frame 010/015)
  'in-progress':  { bg: '#fee2e2', text: '#dc2626', label: 'In-progress' },
  ringing:        { bg: '#fecaca', text: '#dc2626', label: 'Ringing' },
  cancelled:      { bg: '#f3f4f6', text: '#6b7280', label: 'Cancelled' },
}

// ── Timer ──────────────────────────────────────────────────────────
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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '-'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `about ${mins} minutes ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `about ${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `about ${days} days ago`
}

// ── Call Settings Dropdown (Minari frame 012 exact) ───────────────
function CallSettingsDropdown({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [parallel, setParallel] = useState(1)
  const [autoRotate, setAutoRotate] = useState(true)
  const [voicemail, setVoicemail] = useState(false)
  const [maxAttempts, setMaxAttempts] = useState('Unlimited')
  const [attemptPeriod, setAttemptPeriod] = useState('day')

  return (
    <div className="relative">
      <button onClick={onToggle} className="flex items-center gap-1.5 text-[13px] text-gray-600 hover:text-gray-800">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
        Call settings
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute right-0 top-8 w-[420px] bg-white rounded-xl shadow-lg border border-gray-200 z-50 p-5 space-y-5">
          {/* Parallel calls */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">Parallel calls</span>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setParallel(n)}
                  className={`w-9 h-8 text-xs font-medium border-r border-gray-200 last:border-r-0 ${
                    parallel === n ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'
                  }`}>{n}</button>
              ))}
            </div>
          </div>

          {/* From phone number */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">From phone number</span>
            <span className="text-[13px] text-gray-500">+33 1 59 58 01 89</span>
          </div>

          {/* Voicemail */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">Voicemail</span>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <span className="text-[13px] text-gray-500">{voicemail ? 'On' : 'Off'}</span>
              <button onClick={() => setVoicemail(!voicemail)}
                className={`w-10 h-5 rounded-full relative transition-colors ${voicemail ? 'bg-teal-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow absolute top-0.5 transition-transform ${voicemail ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Contact phone number field */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">Contact phone number field</span>
            <span className="text-[13px] text-gray-500">Phone number ▾</span>
          </div>

          {/* Complete task when contact dialed */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">Complete task when contact dialed</span>
            <button className="w-10 h-5 rounded-full bg-gray-300 relative">
              <div className="w-4 h-4 bg-white rounded-full shadow absolute top-0.5 translate-x-0.5" />
            </button>
          </div>

          {/* Auto-rotate */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">Auto-rotate caller phone numbers</span>
            <button onClick={() => setAutoRotate(!autoRotate)}
              className={`w-10 h-5 rounded-full relative transition-colors ${autoRotate ? 'bg-teal-500' : 'bg-gray-300'}`}>
              <div className={`w-4 h-4 bg-white rounded-full shadow absolute top-0.5 transition-transform ${autoRotate ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Max call attempts */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">Maximum call attempts<br/><span className="text-gray-400">per contact</span></span>
            <div className="flex items-center gap-1.5">
              <select value={maxAttempts} onChange={e => setMaxAttempts(e.target.value)}
                className="text-[13px] text-gray-600 bg-transparent border border-gray-200 rounded-lg px-2 py-1 outline-none">
                <option>Unlimited</option><option>1</option><option>2</option><option>3</option><option>5</option><option>10</option>
              </select>
              <span className="text-[13px] text-gray-400">per</span>
              <select value={attemptPeriod} onChange={e => setAttemptPeriod(e.target.value)}
                className="text-[13px] text-gray-600 bg-transparent border border-gray-200 rounded-lg px-2 py-1 outline-none">
                <option value="day">day</option><option value="week">week</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Prospect Row (Minari exact : LinkedIn + contact icons) ────────
const ProspectRow = memo(function ProspectRow({ prospect, isActive, onSelect, onCall }: {
  prospect: Prospect; isActive: boolean; onSelect: (p: Prospect) => void; onCall: (p: Prospect) => void
}) {
  // CALL STATUS = dernier appel outcome, ou "pending" si jamais appele
  const outcomeKey = prospect.call_count === 0 ? 'pending' : (prospect.last_call_outcome || 'connected')
  const st = CALL_OUTCOME_BADGE[outcomeKey] || CALL_OUTCOME_BADGE.pending

  return (
    <tr onClick={() => onSelect(prospect)}
      className={`border-b border-gray-100 cursor-pointer transition-colors ${
        isActive ? 'bg-emerald-50/60' : 'hover:bg-gray-50/60'
      }`}>
      {/* CALL STATUS — pill badge */}
      <td className="py-3.5 px-5">
        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
          style={{ background: st.bg, color: st.text }}>{st.label}</span>
      </td>
      {/* CALLS */}
      <td className="py-3.5 px-3 text-[13px] text-gray-400 text-center">{prospect.call_count || 0}</td>
      {/* NAME + icons */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-2">
          {/* LinkedIn icon */}
          <div className="w-5 h-5 rounded bg-blue-50 flex items-center justify-center flex-shrink-0">
            <span className="text-[9px] font-bold text-blue-500">in</span>
          </div>
          {/* Contact/call icon */}
          <button onClick={e => { e.stopPropagation(); onCall(prospect) }}
            className="w-5 h-5 rounded bg-gray-50 flex items-center justify-center flex-shrink-0 hover:bg-emerald-50 group">
            <svg className="w-3 h-3 text-gray-300 group-hover:text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <span className="text-[13px] font-medium text-gray-800">{prospect.name}</span>
        </div>
      </td>
      {/* TITLE */}
      <td className="py-3.5 px-4 text-[13px] text-gray-500 truncate max-w-[180px]">{prospect.title || '-'}</td>
      {/* COMPANY */}
      <td className="py-3.5 px-4 text-[13px] text-gray-500 truncate max-w-[160px]">{prospect.company || '-'}</td>
      {/* LAST CALL */}
      <td className="py-3.5 px-4 text-[13px] text-gray-400">{timeAgo(prospect.last_call_at)}</td>
      {/* STATUS (CRM) */}
      <td className="py-3.5 px-4 text-[13px] text-gray-500">{prospect.crm_status === 'new' ? 'New' : prospect.crm_status === 'open' ? 'Open' : prospect.crm_status === 'in_progress' ? 'In Progress' : prospect.crm_status === 'open_deal' ? 'Open Deal' : prospect.crm_status === 'attempted_to_contact' ? 'Attempted to Contact' : prospect.crm_status === 'not_interested' ? 'Not interested' : prospect.crm_status === 'callback' ? 'Callback' : prospect.crm_status === 'rdv' ? 'RDV' : prospect.crm_status === 'mail_sent' ? 'Mail sent' : prospect.crm_status}</td>
      {/* PHONE NUMBER */}
      <td className="py-3.5 px-4 text-[13px] text-gray-400 font-mono">{prospect.phone}</td>
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
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [showCallSettings, setShowCallSettings] = useState(false)
  const { data: prospects } = useProspects(activeListId)
  const { data: callHistory } = useCallsByProspect(selectedProspect?.id ?? null)
  const createList = useCreateList()
  const duration = useTimer(cm.context.startedAt)
  useRealtimeProspects()

  useEffect(() => { if (lists?.length && !activeListId) setActiveListId(lists[0].id) }, [lists, activeListId])

  const handleCall = useCallback((p: Prospect) => {
    if ((cm.isIdle || cm.isDisconnected) && cm.providerReady) {
      setSelectedProspect(p)
      cm.call(p)
    }
  }, [cm])

  const isInCall = cm.isDialing || cm.isConnected
  const connected = prospects?.filter(p => p.last_call_outcome === 'connected' || p.last_call_outcome === 'rdv').length || 0
  const attempted = prospects?.filter(p => p.call_count > 0).length || 0
  const pending = prospects?.filter(p => p.call_count === 0).length || 0
  const meetings = prospects?.filter(p => p.last_call_outcome === 'rdv' || p.crm_status === 'rdv').length || 0
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
    <div className="min-h-screen bg-[#f0faf4]">
      {/* ── Tabs listes (Minari exact — marque-pages plats fond gris fonce) ── */}
      <div className="bg-[#2d2d2d] flex items-center overflow-x-auto">
        <button onClick={async () => {
          const name = prompt('Nom de la nouvelle liste :')
          if (name?.trim()) { const l = await createList.mutateAsync(name.trim()); setActiveListId(l.id) }
        }} className="flex items-center gap-1 px-4 py-2.5 text-[12px] font-medium text-emerald-400 hover:text-emerald-300 whitespace-nowrap flex-shrink-0">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New list
        </button>
        {lists?.map(l => (
          <button key={l.id} onClick={() => setActiveListId(l.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-[12px] whitespace-nowrap flex-shrink-0 transition-colors border-b-2 ${
              activeListId === l.id
                ? 'bg-white text-gray-800 font-semibold border-transparent rounded-t-lg -mb-px'
                : 'text-white/60 hover:text-white/80 border-transparent'
            }`}>
            {l.name}
            <span className="text-current opacity-40 hover:opacity-80 ml-0.5">&times;</span>
          </button>
        ))}
        {(lists?.length || 0) > 8 && (
          <span className="px-3 py-2.5 text-[12px] text-white/40 whitespace-nowrap flex-shrink-0">+{(lists?.length || 0) - 8}</span>
        )}
      </div>

      {/* ── List header ── */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[17px] font-bold text-gray-800">{activeList?.name || 'Prospects'}</h1>
            <span className="text-[13px] text-gray-400">{prospects?.length || 0} contacts</span>
            <button className="text-[13px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Refresh
            </button>
          </div>
          <div className="flex items-center gap-4 text-[13px]">
            <span className="text-gray-400 flex items-center gap-1">
              <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              {meetings} meetings
            </span>
            <span className="text-gray-500"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Connected {connected}</span>
            <span className="text-gray-500"><span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1" />Attempted {attempted}</span>
            <span className="text-gray-400">Pending {pending}</span>
          </div>
        </div>
      </div>

      {/* ── Progress bar (Minari exact — under stats) ── */}
      {(prospects?.length || 0) > 0 && (
        <div className="px-5 pt-1 pb-0">
          <div className="h-1 w-full bg-gray-200 rounded-full overflow-hidden flex">
            {connected > 0 && <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(connected / (prospects?.length || 1)) * 100}%` }} />}
            {attempted > 0 && <div className="h-full bg-orange-400 transition-all" style={{ width: `${((attempted - connected) / (prospects?.length || 1)) * 100}%` }} />}
          </div>
        </div>
      )}

      {/* ── Toolbar (Minari exact layout) ── */}
      <div className="px-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Resume calling / Cancel calls */}
          {isInCall ? (
            <button onClick={cm.hangup}
              className="px-4 py-2 rounded-full text-[13px] font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors">
              Cancel calls
            </button>
          ) : (
            <button onClick={() => { const next = prospects?.find(p => p.call_count === 0); if (next) handleCall(next) }}
              disabled={!cm.providerReady || !(cm.isIdle || cm.isDisconnected)}
              className="px-4 py-2 rounded-full text-[13px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
              {cm.providerReady ? 'Resume calling' : 'Connecting...'}
            </button>
          )}

          {/* Redial */}
          {(prospects?.filter(p => p.last_call_outcome === 'no_answer' || p.last_call_outcome === 'voicemail').length || 0) > 0 && (
            <button className="px-4 py-2 rounded-full text-[13px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              Redial {prospects?.filter(p => p.last_call_outcome === 'no_answer' || p.last_call_outcome === 'voicemail').length} contacts
            </button>
          )}

          {/* Sorted by */}
          <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
            Sorted by
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="text-[13px] text-gray-700 font-medium bg-transparent outline-none cursor-pointer">
              <option value="last_call">Last Call</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
            </select>
          </div>

          {/* Sort icon */}
          <button className="text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
          </button>

          {/* Filter */}
          <button className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-700">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
            Filter
          </button>

          {/* Search */}
          <div className="flex items-center gap-1.5 text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)}
              className="text-[13px] bg-transparent outline-none text-gray-700 placeholder:text-gray-400 w-40" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Import CSV */}
          <button onClick={() => setShowCSVImport(true)}
            className="text-[13px] text-gray-400 hover:text-gray-600">+ Import</button>

          {/* Call settings dropdown (Minari exact position) */}
          <CallSettingsDropdown open={showCallSettings} onToggle={() => setShowCallSettings(!showCallSettings)} />
        </div>
      </div>

      {/* ── Table (Minari exact — white rounded card) ── */}
      <div className="px-5 pb-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-3 px-5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Call Status</th>
                <th className="py-3 px-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Calls</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Name</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Title</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Company</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Last Call</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Status</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Phone Number</th>
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
              <p className="text-[13px] text-gray-400">No contacts in this list</p>
              <button onClick={() => setShowCSVImport(true)} className="text-[13px] text-emerald-600 hover:text-emerald-700 mt-2 font-medium">Import from CSV</button>
            </div>
          )}
        </div>
      </div>

      {/* ── CSV Import Modal ── */}
      {showCSVImport && activeListId && (
        <CSVImport listId={activeListId} onClose={() => setShowCSVImport(false)}
          onSuccess={(count) => { setShowCSVImport(false); console.log(`[Dialer] Imported ${count} contacts`) }} />
      )}

      {/* ── Prospect Modal ── */}
      {selectedProspect && (
        <ProspectModal
          prospect={selectedProspect} callContext={cm.context} callHistory={callHistory || []}
          isInCall={isInCall} isDisconnected={cm.isDisconnected}
          onCall={handleCall} onClose={() => { if (!isInCall) setSelectedProspect(null) }}
          onSetDisposition={cm.setDisposition} onSetNotes={cm.setNotes} onSetMeeting={cm.setMeeting}
          onReset={cm.reset}
          onNextCall={() => { cm.reset(); setSelectedProspect(null)
            const next = prospects?.find(p => p.call_count === 0 && p.id !== selectedProspect?.id)
            if (next) setTimeout(() => handleCall(next), 300) }}
          providerReady={cm.providerReady}
        />
      )}

      {/* ── Barre d'appel noire flottante (Minari exact — frame 025) ── */}
      {isInCall && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1c1c1c] text-white pl-6 pr-4 py-3.5 rounded-2xl flex items-center gap-6 z-50 shadow-2xl min-w-[480px]">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[14px] truncate">{cm.context.prospect?.name}</p>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-white/40">● {cm.context.prospect?.phone}</span>
              <span className="text-[12px] text-white/60 font-mono">{formatTimer(duration)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Mute */}
            <button onClick={cm.isOnHold ? cm.unmute : cm.mute}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                cm.isOnHold ? 'bg-orange-500/30 text-orange-300' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
            {/* DTMF */}
            <button className="w-10 h-10 rounded-full bg-white/10 text-white/50 hover:bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            {/* Raccrocher */}
            <button onClick={cm.hangup}
              className="w-11 h-11 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
              <svg className="w-5 h-5 rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
            {/* Transfer */}
            <button className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Close call settings when clicking outside */}
      {showCallSettings && <div className="fixed inset-0 z-40" onClick={() => setShowCallSettings(false)} />}
    </div>
  )
}
