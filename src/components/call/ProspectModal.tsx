/**
 * ProspectModal — Copie Minari pixel-perfect.
 * Sources : frame 025 (appel), frame 050 (post-call), WhatsApp photos (Audrey NICOLAOU, Daniel SMADJA, Julien Dugué).
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
  if (phone.startsWith('+33') && phone.length === 12)
    return `+33 ${phone[3]} ${phone.slice(4, 6)} ${phone.slice(6, 8)} ${phone.slice(8, 10)} ${phone.slice(10, 12)}`
  return phone
}

function formatDurée(s: number) {
  if (!s) return '0sec'
  if (s < 60) return `${s}sec`
  return `${Math.floor(s / 60)}mn${(s % 60).toString().padStart(2, '0')}sec`
}

function formatDuréeShort(s: number) {
  if (!s) return '00:00'
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `il y a ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const DISPOSITIONS: Array<{ value: Disposition; label: string }> = [
  { value: 'connected', label: 'Connecté' },
  { value: 'rdv', label: 'RDV pris' },
  { value: 'callback', label: 'Rappel' },
  { value: 'not_interested', label: 'Pas intéressé' },
  { value: 'no_answer', label: 'Pas de reponse' },
  { value: 'voicemail', label: 'Messagerie' },
  { value: 'busy', label: 'Occupé' },
  { value: 'wrong_number', label: 'Mauvais numéro' },
  { value: 'dnc', label: 'Ne pas appeler' },
]

const CRM_OPTIONS: Array<{ value: CrmStatus; label: string }> = [
  { value: 'new', label: 'Nouveau' }, { value: 'open', label: 'Ouvert' }, { value: 'in_progress', label: 'En cours' },
  { value: 'open_deal', label: 'Affaire ouverte' }, { value: 'unqualified', label: 'Non qualifié' },
  { value: 'attempted_to_contact', label: 'Tenté de contacter' }, { value: 'connected', label: 'Connecté' },
  { value: 'bad_timing', label: 'Mauvais timing' }, { value: 'not_interested', label: 'Pas intéressé' },
  { value: 'callback', label: 'Rappel' }, { value: 'rdv', label: 'RDV' }, { value: 'mail_sent', label: 'Mail envoyé' },
]

// ── Confetti ────────────────────────────────────────────────────
function Confetti() {
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    x: Math.random() * 100, size: 5 + Math.random() * 8,
    color: ['#059669', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'][i % 6],
    delay: Math.random() * 0.6, rotation: Math.random() * 360,
  }))
  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {pieces.map((p, i) => (
        <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: -20, width: p.size, height: p.size,
          borderRadius: Math.random() > 0.5 ? '50%' : 2, background: p.color,
          animation: `confettiFall 2s ${p.delay}s ease-in forwards`, transform: `rotate(${p.rotation}deg)` }} />
      ))}
      <style>{`@keyframes confettiFall { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }`}</style>
    </div>
  )
}

// ── Résultat badge ───────────────────────────────────────────────
function RésultatBadge({ outcome, meeting }: { outcome: string | null; meeting: boolean }) {
  if (meeting) return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-600">RDV pris</span>
  const map: Record<string, string> = {
    connected: 'bg-emerald-100 text-emerald-600', rdv: 'bg-teal-100 text-teal-600',
    callback: 'bg-yellow-100 text-yellow-600', not_interested: 'bg-red-100 text-red-500',
    no_answer: 'bg-orange-100 text-orange-500', voicemail: 'bg-purple-100 text-purple-500',
    busy: 'bg-orange-100 text-orange-500', wrong_number: 'bg-red-100 text-red-500',
  }
  const cls = map[outcome || ''] || 'bg-emerald-100 text-emerald-600'
  const label = DISPOSITIONS.find(d => d.value === outcome)?.label || outcome || 'Connected'
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{label}</span>
}

// ── Call History Entry ──────────────────────────────────────────
function CallEntry({ call }: { call: Call }) {
  const [showTranscript, setShowTranscript] = useState(false)

  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      {/* Header: Appel sortant + badge + date */}
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <span className="text-[13px] text-gray-600">Appel sortant</span>
        <RésultatBadge outcome={call.call_outcome} meeting={call.meeting_booked} />
        <span className="ml-auto text-[12px] text-gray-400">{timeAgo(call.created_at)}</span>
        <button className="text-gray-300 hover:text-gray-500">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* From → To */}
      <p className="text-[12px] text-gray-400 mb-3">{call.from_number || ''} (vous) → {call.prospect_phone || ''}</p>

      {/* Player audio */}
      {call.recording_url && (
        <div className="flex items-center gap-2 mb-3">
          <button className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full"><div className="h-1.5 bg-gray-400 rounded-full" style={{ width: '0%' }} /></div>
          <span className="text-[12px] text-gray-400 font-mono">{formatDuréeShort(call.call_duration)}</span>
          <a href={call.recording_url} download className="text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
        </div>
      )}

      {/* Voir la transcription complete */}
      {call.ai_transcript && (
        <>
          <button onClick={() => setShowTranscript(!showTranscript)}
            className="text-[12px] text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
            Voir la transcription complete
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
          {showTranscript && (
            <div className="text-[12px] text-gray-600 bg-gray-50 rounded-lg p-3 mb-2 whitespace-pre-wrap">{call.ai_transcript}</div>
          )}
        </>
      )}

      {/* AI Summary */}
      {call.ai_summary && call.ai_summary.length > 0 && (
        <div className="mt-2">
          <p className="text-[12px] text-gray-400 mb-1">Résumé IA Callio :</p>
          {call.ai_summary.map((s, i) => (
            <p key={i} className="text-[12px] text-gray-500 italic ml-2">- {s}</p>
          ))}
        </div>
      )}

      {/* Note */}
      {call.note && <p className="text-[12px] text-gray-500 mt-2 italic">{call.note}</p>}
    </div>
  )
}

// ── Modal ────────────────────────────────────────────────────────
export default function ProspectModal({
  prospect, callContext, callHistory, isInCall, isDisconnected,
  onCall, onClose, onSetDisposition, onSetNotes, onSetMeeting, onReset, onNextCall, providerReady,
}: Props) {
  const [activeTab, setActiveTab] = useState('activity')
  const [showConfetti, setShowConfetti] = useState(false)
  const tabs = ['Activite', 'Notes', 'Taches', 'Emails', 'Appels', 'SMS']

  const handleMeetingToggle = (checked: boolean) => {
    onSetMeeting(checked)
    if (checked) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 2500) }
  }

  return (
    <>
      {showConfetti && <Confetti />}

      {/* Backdrop — ne ferme PAS au clic (seulement via bouton X) */}
      <div className="fixed inset-0 bg-black/15 flex items-start justify-center pt-[5vh] z-40"
        onClick={e => { if (e.target === e.currentTarget && !isInCall) onClose() }}>
        <div className="bg-white rounded-2xl shadow-xl w-[860px] max-h-[85vh] flex overflow-hidden">

          {/* ── GAUCHE — Infos prospect (Minari exact) ── */}
          <div className="w-[300px] p-5 border-r border-gray-100 flex flex-col overflow-y-auto">

            {/* Nom + edit + copy */}
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded bg-gray-200 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h2 className="text-[15px] font-bold text-gray-800 flex-1 truncate">{prospect.name}</h2>
              <button className="text-gray-300 hover:text-gray-500">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
              <button onClick={() => navigator.clipboard.writeText(prospect.name)} className="text-gray-300 hover:text-gray-500">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
            </div>

            {/* 4 icones sous le nom (frame 020 : tel, linkedin, clipboard, plus) */}
            <div className="flex gap-1.5 ml-9 mb-3">
              <div className="w-6 h-6 rounded flex items-center justify-center bg-gray-50 text-gray-400 border border-gray-200 hover:text-gray-600 cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              </div>
              <div className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold border ${prospect.linkedin_url ? 'bg-blue-50 text-blue-500 border-blue-200' : 'bg-gray-50 text-gray-300 border-gray-200'} cursor-pointer`}>in</div>
              <div className="w-6 h-6 rounded flex items-center justify-center bg-gray-50 text-gray-400 border border-gray-200 hover:text-gray-600 cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </div>
              <div className="w-6 h-6 rounded flex items-center justify-center bg-gray-50 text-gray-400 border border-gray-200 hover:text-gray-600 cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </div>
            </div>

            {/* Title + Company (Minari exact — avec icones) */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <span className="text-[13px] text-gray-600">{prospect.title || '-'}</span>
            </div>
            <div className="flex items-center gap-1.5 mb-4">
              <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              <span className="text-[13px] text-gray-600">{prospect.company || '-'}</span>
            </div>

            {/* Call button — teal quand idle, gris "Appel en cours" quand en appel (frame 020) */}
            <div className="flex items-center gap-2 mb-5">
              {isInCall ? (
                <div className="flex-1 py-2.5 rounded-full text-[13px] font-medium bg-gray-100 text-gray-400 flex items-center justify-center gap-2 border border-gray-200">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  Appel en cours
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
              ) : (
                <button onClick={() => onCall(prospect)} disabled={!providerReady}
                  className="flex-1 py-2.5 rounded-full text-[13px] font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  Call {formatPhone(prospect.phone)}
                  <span className="text-white/40 text-xs ml-1">▾</span>
                </button>
              )}
              <button className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
              <button className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
            </div>

            {/* Fields (Minari exact — UPPERCASE labels) */}
            <div className="space-y-4 flex-1">
              {/* EMAIL */}
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Email</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <p className="text-[13px] text-gray-600 truncate">{prospect.email || '-'}</p>
                  {prospect.email && <button onClick={() => navigator.clipboard.writeText(prospect.email!)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>}
                </div>
              </div>

              {/* STATUS (dropdown Minari) */}
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Statut</span>
                <select value={prospect.crm_status || 'new'} onChange={() => {}}
                  className="block mt-1 text-[13px] text-gray-600 bg-transparent outline-none cursor-pointer border-b border-gray-200 pb-0.5 w-full">
                  {CRM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* PHONE NUMBER */}
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Telephone</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <p className="text-[13px] text-gray-600 font-mono">{formatPhone(prospect.phone)}</p>
                  <button onClick={() => navigator.clipboard.writeText(prospect.phone)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                </div>
              </div>

              {/* PHONE NUMBER 2-5 (Minari shows all 5 slots) */}
              {['phone2', 'phone3', 'phone4', 'phone5'].map((key, i) => (
                <div key={key}>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Telephone {i + 2}</span>
                  <p className="text-[13px] text-gray-400 mt-1 font-mono">{(prospect as unknown as Record<string, string>)[key] || '-'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── DROITE — Activité ── */}
          <div className="flex-1 flex flex-col min-w-0">

            {/* Transcription live (bulle verte Minari — frame 025) */}
            {isInCall && (
              <div className="px-5 py-3 bg-emerald-50/80 border-b border-emerald-100">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 animate-pulse flex-shrink-0" />
                  <p className="text-[13px] text-gray-600 italic">Transcription en cours...</p>
                </div>
              </div>
            )}

            {/* Tabs (Minari exact) */}
            <div className="flex items-center justify-between px-5 pt-3">
              <div className="flex gap-5">
                {tabs.map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab.toLowerCase().replace(' ', '_'))}
                    className={`text-[13px] pb-2 transition-colors ${
                      activeTab === tab.toLowerCase().replace(' ', '_')
                        ? 'text-gray-800 font-semibold border-b-2 border-gray-800'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}>{tab}</button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button className="text-[12px] text-gray-400 hover:text-gray-600">Tout developper</button>
                <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg leading-none">&times;</button>
              </div>
            </div>
            <div className="h-px bg-gray-100 mx-5" />

            {/* Contenu activite */}
            <div className="flex-1 overflow-y-auto px-5 py-3">

              {/* Card appel EN COURS */}
              {isInCall && (
                <div className="py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    <span className="text-[13px] text-gray-600">Connected</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-600">En cours</span>
                  </div>
                  <textarea placeholder="Écrire une note..." value={callContext?.notes || ''} onChange={e => onSetNotes(e.target.value)}
                    rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none resize-none placeholder:text-gray-400" />
                </div>
              )}

              {/* Card POST-CALL (frame 050 exact) */}
              {isDisconnected && (
                <div className="py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    <span className="text-[13px] text-gray-600">Appel sortant</span>
                    <RésultatBadge outcome={callContext?.disposition || 'connected'} meeting={callContext?.meetingBooked || false} />
                    <span className="ml-auto text-[12px] text-gray-400">{new Date().toLocaleDateString('fr-FR')} {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <button className="text-gray-300 hover:text-gray-500"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>

                  {/* Résultat + Durée + Meeting booked (Minari exact layout) */}
                  <div className="flex items-start gap-8 mb-4">
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1">Résultat</p>
                      <select value={callContext?.disposition || 'connected'} onChange={e => onSetDisposition(e.target.value as Disposition)}
                        className="text-[13px] text-gray-700 border-b border-gray-200 pb-0.5 outline-none bg-transparent cursor-pointer">
                        {DISPOSITIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1">Durée</p>
                      <p className="text-[13px] text-gray-700">{formatDurée(callContext?.duration || 0)}</p>
                    </div>
                    <label className="flex items-center gap-2 mt-4 cursor-pointer">
                      <input type="checkbox" checked={callContext?.meetingBooked || false}
                        onChange={e => handleMeetingToggle(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 accent-teal-600" />
                      <span className={`text-[13px] font-medium ${callContext?.meetingBooked ? 'text-teal-600' : 'text-gray-600'}`}>RDV pris</span>
                    </label>
                  </div>

                  {/* Recording status (Minari green badge) */}
                  <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-600 text-[12px] flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    Enregistrement pas encore disponible...
                  </div>

                  {/* Write a note */}
                  <textarea placeholder="Écrire une note..." value={callContext?.notes || ''} onChange={e => onSetNotes(e.target.value)}
                    rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none resize-none placeholder:text-gray-400 mb-4" />

                  {/* Resume / Arreter */}
                  <div className="flex gap-3">
                    <button onClick={() => { onReset(); onNextCall() }}
                      className="flex-1 py-2 rounded-lg text-[13px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                      Reprendre les appels
                    </button>
                    <button onClick={() => { onReset(); onClose() }}
                      className="px-4 py-2 rounded-lg text-[13px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                      Arreter
                    </button>
                  </div>
                </div>
              )}

              {/* Call history (Minari — Appel sortant entries) */}
              {callHistory.map(c => <CallEntry key={c.id} call={c} />)}

              {/* Empty state */}
              {!isInCall && !isDisconnected && callHistory.length === 0 && (
                <p className="text-[13px] text-gray-400 text-center py-10">Aucune activite</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
