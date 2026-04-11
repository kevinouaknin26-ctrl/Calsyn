/**
 * ProspectModal — Style Minari pixel-perfect.
 * 2 colonnes : gauche (infos prospect) + droite (activité/tabs).
 * Call history, player audio, AI summary, confetti.
 */

import { useState } from 'react'
import type { Prospect, CrmStatus } from '@/types/prospect'
import type { Disposition, Call } from '@/types/call'
import type { CallContext } from '@/machines/callMachine'

interface Props {
  prospect: Prospect
  callContext: CallContext
  callHistory: Call[]
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
  if (s < 60) return `${s}sec`
  return `${Math.floor(s / 60)}mn${(s % 60).toString().padStart(2, '0')}sec`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'a l\'instant'
  if (mins < 60) return `il y a ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days}j`
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const DISPOSITIONS: Array<{ value: Disposition; label: string }> = [
  { value: 'connected', label: 'Connected' },
  { value: 'rdv', label: 'RDV pris' },
  { value: 'callback', label: 'Callback' },
  { value: 'not_interested', label: 'Pas interesse' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'busy', label: 'Busy' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'dnc', label: 'Do not call' },
]

const CRM_OPTIONS: Array<{ value: CrmStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'open_deal', label: 'Open Deal' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'attempted_to_contact', label: 'Attempted to Contact' },
  { value: 'connected', label: 'Connected' },
  { value: 'bad_timing', label: 'Bad Timing' },
  { value: 'not_interested', label: 'Pas interesse' },
  { value: 'callback', label: 'A rappeler' },
  { value: 'rdv', label: 'RDV' },
  { value: 'mail_sent', label: 'Mail envoye' },
]

// ── Confettis ───────────────────────────────────────────────────
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

// ── Outcome badge color ─────────────────────────────────────────
function outcomeBadge(outcome: string | null, meetingBooked: boolean) {
  if (meetingBooked) return { bg: 'bg-teal-100', text: 'text-teal-600', label: 'Meeting booked' }
  if (!outcome) return { bg: 'bg-gray-100', text: 'text-gray-500', label: '—' }
  const map: Record<string, { bg: string; text: string; label: string }> = {
    connected:      { bg: 'bg-emerald-100', text: 'text-emerald-600', label: 'Connected' },
    rdv:            { bg: 'bg-teal-100', text: 'text-teal-600', label: 'Meeting booked' },
    callback:       { bg: 'bg-yellow-100', text: 'text-yellow-600', label: 'Callback' },
    not_interested: { bg: 'bg-red-100', text: 'text-red-500', label: 'Not interested' },
    no_answer:      { bg: 'bg-orange-100', text: 'text-orange-500', label: 'No Answer' },
    voicemail:      { bg: 'bg-purple-100', text: 'text-purple-500', label: 'Voicemail' },
    busy:           { bg: 'bg-orange-100', text: 'text-orange-500', label: 'Busy' },
    wrong_number:   { bg: 'bg-red-100', text: 'text-red-500', label: 'Wrong Number' },
    dnc:            { bg: 'bg-red-100', text: 'text-red-600', label: 'DNC' },
  }
  return map[outcome] || { bg: 'bg-gray-100', text: 'text-gray-500', label: outcome }
}

// ── Call History Entry (Minari style) ───────────────────────────
function CallEntry({ call }: { call: Call }) {
  const badge = outcomeBadge(call.call_outcome, call.meeting_booked)
  const [showTranscript, setShowTranscript] = useState(false)

  return (
    <div className="border border-gray-200 rounded-xl p-4 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <span className="text-xs text-gray-600 font-medium">Outbound call</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${badge.bg} ${badge.text}`}>{badge.label}</span>
        <span className="ml-auto text-[11px] text-gray-400">{timeAgo(call.created_at)}</span>
      </div>

      {/* From → To */}
      <p className="text-[11px] text-gray-400 mb-2">
        {call.from_number || '—'} → {call.prospect_phone || '—'}
      </p>

      {/* Duration */}
      {call.call_duration > 0 && (
        <p className="text-xs text-gray-500 mb-2">{formatDuration(call.call_duration)}</p>
      )}

      {/* Recording player */}
      {call.recording_url && (
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 mb-2">
          <button className="text-gray-500 hover:text-gray-700">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="flex-1 h-1 bg-gray-200 rounded-full">
            <div className="h-1 bg-gray-400 rounded-full" style={{ width: '0%' }} />
          </div>
          <span className="text-[10px] text-gray-400 font-mono">{formatDuration(call.call_duration)}</span>
          <a href={call.recording_url} download className="text-gray-400 hover:text-gray-600">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
        </div>
      )}

      {/* Transcription expandable */}
      {call.ai_transcript && (
        <button onClick={() => setShowTranscript(!showTranscript)}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
          <svg className={`w-3 h-3 transition-transform ${showTranscript ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Show full transcription
          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-gray-100 text-gray-400 uppercase">Beta</span>
        </button>
      )}
      {showTranscript && call.ai_transcript && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 mb-2 whitespace-pre-wrap">
          {call.ai_transcript}
        </div>
      )}

      {/* AI Summary */}
      {call.ai_summary && call.ai_summary.length > 0 && (
        <div className="bg-emerald-50/50 rounded-lg p-3 mb-2">
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">AI Summary</p>
          <ul className="space-y-0.5">
            {call.ai_summary.map((s, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">-</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Note */}
      {call.note && (
        <p className="text-xs text-gray-500 italic">{call.note}</p>
      )}
    </div>
  )
}

// ── Modal ───────────────────────────────────────────────────────
export default function ProspectModal({
  prospect, callContext, callHistory, isInCall, isDisconnected,
  onCall, onClose, onSetDisposition, onSetNotes, onSetMeeting, onReset, onNextCall, providerReady,
}: Props) {
  const [activeTab, setActiveTab] = useState('activity')
  const [showConfetti, setShowConfetti] = useState(false)
  const tabs = ['Activity', 'Notes', 'Tasks', 'Call logs', 'SMS']

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

      <div className="fixed inset-0 bg-black/20 flex items-start justify-center pt-[6vh] z-40">
        <div className="bg-white rounded-2xl shadow-xl w-[860px] max-h-[82vh] flex overflow-hidden">

          {/* ── Gauche — Infos prospect (Minari exact) ── */}
          <div className="w-[280px] p-5 border-r border-gray-100 flex flex-col overflow-y-auto">
            {/* Nom + edit + copy */}
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-800 flex-1 truncate">{prospect.name}</h2>
              <button className="text-gray-300 hover:text-gray-500">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button onClick={() => navigator.clipboard.writeText(prospect.name)} className="text-gray-300 hover:text-gray-500">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </button>
            </div>

            {/* LinkedIn + Settings icons */}
            <div className="flex gap-1.5 mb-3 ml-9">
              {prospect.linkedin_url ? (
                <a href={prospect.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="w-5 h-5 rounded bg-blue-50 border border-blue-200 flex items-center justify-center text-[9px] font-bold text-blue-500 hover:bg-blue-100">in</a>
              ) : (
                <div className="w-5 h-5 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-[9px] text-gray-300">in</div>
              )}
              {prospect.website_url ? (
                <a href={prospect.website_url} target="_blank" rel="noopener noreferrer"
                  className="w-5 h-5 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                </a>
              ) : (
                <div className="w-5 h-5 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-300">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                </div>
              )}
            </div>

            {/* Title + Company */}
            <p className="text-sm text-gray-600 mb-0.5">{prospect.title || '—'}</p>
            <p className="text-sm text-gray-400 mb-4 flex items-center gap-1">
              <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              {prospect.company || '—'}
            </p>

            {/* Call button (teal, Minari exact) */}
            <button
              onClick={() => onCall(prospect)}
              disabled={!providerReady || isInCall}
              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 mb-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call {formatPhone(prospect.phone)}
              <span className="text-white/40 ml-1">&#9662;</span>
            </button>

            {/* Snooze badge */}
            {prospect.snoozed_until && new Date(prospect.snoozed_until) > new Date() && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-purple-50 border border-purple-100">
                <p className="text-xs text-purple-600 font-medium">Snoozed until {new Date(prospect.snoozed_until).toLocaleDateString('fr-FR')}</p>
                <button className="text-[10px] text-purple-400 hover:text-purple-600 mt-0.5">Remove snooze</button>
              </div>
            )}

            {/* Do not call badge */}
            {prospect.do_not_call && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                <p className="text-xs text-red-500 font-medium">Calls are disabled</p>
                <button className="text-[10px] text-emerald-500 hover:text-emerald-700 mt-0.5 font-medium">Enable calls</button>
              </div>
            )}

            {/* Fields */}
            <div className="space-y-3 text-sm flex-1">
              {/* Status CRM (dropdown) */}
              <div>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</span>
                <select
                  value={prospect.crm_status || 'new'}
                  onChange={() => {/* TODO: update CRM status */}}
                  className="w-full mt-0.5 px-2 py-1 rounded border border-gray-200 text-xs text-gray-700 outline-none"
                >
                  {CRM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Email */}
              <div>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Email</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-gray-700 text-xs truncate">{prospect.email || '—'}</p>
                  {prospect.email && (
                    <button onClick={() => navigator.clipboard.writeText(prospect.email!)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Phone (principal + extras) */}
              <div>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Phone Number</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-gray-700 text-xs font-mono">{formatPhone(prospect.phone)}</p>
                  <button onClick={() => navigator.clipboard.writeText(prospect.phone)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </button>
                </div>
                {prospect.phone2 && <p className="text-[11px] text-gray-400 font-mono mt-0.5">{prospect.phone2}</p>}
                {prospect.phone3 && <p className="text-[11px] text-gray-400 font-mono mt-0.5">{prospect.phone3}</p>}
              </div>
            </div>
          </div>

          {/* ── Droite — Activité ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Transcription live (bulle verte Minari) */}
            {isInCall && (
              <div className="px-5 py-3 bg-emerald-50/80 border-b border-emerald-100">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 animate-pulse flex-shrink-0" />
                  <p className="text-sm text-gray-600 italic">Transcription en cours...</p>
                </div>
              </div>
            )}

            {/* Tabs (Minari exact) */}
            <div className="flex items-center justify-between px-5 pt-3">
              <div className="flex gap-4">
                {tabs.map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab.toLowerCase().replace(' ', '_'))}
                    className={`text-sm pb-2 transition-colors ${
                      activeTab === tab.toLowerCase().replace(' ', '_')
                        ? 'text-gray-800 font-semibold border-b-2 border-gray-800'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}>{tab}</button>
                ))}
                <button className="text-xs text-gray-400 hover:text-gray-600 pb-2">Expand all</button>
              </div>
              <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg leading-none">&times;</button>
            </div>
            <div className="h-px bg-gray-100 mx-5" />

            {/* Contenu */}
            <div className="flex-1 overflow-y-auto px-5 py-4">

              {/* ── Card appel en cours ── */}
              {isInCall && (
                <div className="border border-emerald-200 rounded-xl p-4 mb-3 bg-emerald-50/30">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span className="text-sm text-gray-700 font-medium">Call - Connected</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-600">En cours</span>
                    <span className="ml-auto text-[11px] text-gray-400">{new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <textarea
                    placeholder="Write a note..."
                    value={callContext?.notes || ''}
                    onChange={e => onSetNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 outline-none resize-none"
                  />
                </div>
              )}

              {/* ── Card post-call (disposition Minari frame_050) ── */}
              {isDisconnected && (
                <div className="border border-gray-200 rounded-xl p-4 mb-3">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span className="text-sm text-gray-700 font-medium">Outbound call</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      callContext?.meetingBooked ? 'bg-teal-100 text-teal-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {callContext?.meetingBooked ? 'Meeting booked' : 'Connected'}
                    </span>
                    <span className="ml-auto text-[11px] text-gray-400">{new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  {/* Outcome + Duration + Meeting booked (Minari exact) */}
                  <div className="flex items-start gap-5 mb-4">
                    <div>
                      <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wider block mb-1">Outcome</label>
                      <select
                        value={callContext?.disposition || 'connected'}
                        onChange={e => onSetDisposition(e.target.value as Disposition)}
                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 outline-none"
                      >
                        {DISPOSITIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wider block mb-1">Duration</label>
                      <p className="text-xs font-mono text-gray-700 mt-1">{formatDuration(callContext?.duration || 0)}</p>
                    </div>
                    <label className="flex items-center gap-2 mt-5 cursor-pointer">
                      <input type="checkbox" checked={callContext?.meetingBooked || false}
                        onChange={e => handleMeetingToggle(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-teal-600 accent-teal-600" />
                      <span className={`text-xs font-medium ${callContext?.meetingBooked ? 'text-teal-600' : 'text-gray-600'}`}>
                        Meeting booked
                      </span>
                    </label>
                  </div>

                  {/* Recording status */}
                  <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-600 text-xs flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    Recording not ready yet...
                  </div>

                  {/* Notes */}
                  <textarea
                    placeholder="Write a note..."
                    value={callContext?.notes || ''}
                    onChange={e => onSetNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 outline-none resize-none mb-4"
                  />

                  {/* Boutons Resume calling / Stop */}
                  <div className="flex gap-3">
                    <button onClick={() => { onReset(); onNextCall() }}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
                      Resume calling
                    </button>
                    <button onClick={() => { onReset(); onClose() }}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">
                      Stop
                    </button>
                  </div>
                </div>
              )}

              {/* ── Historique appels (Minari — liste des Outbound call) ── */}
              {callHistory.length > 0 && (
                <div>
                  {callHistory.map(c => <CallEntry key={c.id} call={c} />)}
                </div>
              )}

              {/* Vide */}
              {!isInCall && !isDisconnected && callHistory.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-10">No activity yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
