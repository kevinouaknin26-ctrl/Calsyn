/**
 * ProspectModal — Copie Minari pixel-perfect.
 * Sources : Jonathan DIAS (WhatsApp), frame 040 (John Doe post-call), frame 020 (pendant appel).
 *
 * Colonne gauche : infos prospect, bouton Call/Enable, champs éditables
 * Colonne droite : tabs, fiches appels accordéon (réduit/agrandi), player, transcription, AI summary
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

function formatDuration(s: number) {
  if (!s) return '0sec'
  if (s < 60) return `${s}sec`
  return `${Math.floor(s / 60)}min${(s % 60).toString().padStart(2, '0')}sec`
}

function formatDurationShort(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const DISPOSITIONS: Array<{ value: Disposition; label: string }> = [
  { value: 'connected', label: 'Connecté' }, { value: 'rdv', label: 'RDV pris' },
  { value: 'callback', label: 'Rappel' }, { value: 'not_interested', label: 'Pas intéressé' },
  { value: 'no_answer', label: 'Pas de réponse' }, { value: 'voicemail', label: 'Messagerie' },
  { value: 'busy', label: 'Occupé' }, { value: 'wrong_number', label: 'Mauvais numéro' },
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
    </div>
  )
}

// ── Badge outcome ───────────────────────────────────────────────
function OutcomeBadge({ outcome, meeting }: { outcome: string | null; meeting: boolean }) {
  if (meeting) return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-600">RDV pris</span>
  const map: Record<string, string> = {
    connected: 'bg-emerald-100 text-emerald-600', rdv: 'bg-teal-100 text-teal-600',
    voicemail: 'bg-orange-100 text-orange-500', cancelled: 'bg-gray-100 text-gray-500',
    no_answer: 'bg-gray-100 text-gray-500', failed: 'bg-red-100 text-red-500',
    meeting_booked: 'bg-teal-100 text-teal-600',
  }
  const label = DISPOSITIONS.find(d => d.value === outcome)?.label || outcome || 'Connecté'
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${map[outcome || ''] || 'bg-emerald-100 text-emerald-600'}`}>{label}</span>
}

// ── Fiche appel accordéon (Minari exact) ────────────────────────
function CallCard({ call, defaultOpen }: { call: Call; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [showTranscript, setShowTranscript] = useState(false)

  return (
    <div className={`border border-gray-100 rounded-xl mb-2 overflow-hidden transition-all ${open ? 'bg-white' : 'bg-gray-50/50'}`}>
      {/* Header — toujours visible */}
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center gap-2 text-left">
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <span className="text-[13px] text-gray-600">Appel sortant</span>
        <OutcomeBadge outcome={call.call_outcome} meeting={call.meeting_booked} />
        <span className="ml-auto text-[12px] text-gray-400">{formatDate(call.created_at)}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Contenu — visible quand ouvert */}
      {open && (
        <div className="px-4 pb-4 animate-fade-in">
          {/* From → To */}
          <p className="text-[12px] text-gray-400 mb-3">{call.from_number || ''} (vous) → {call.prospect_phone || ''}</p>

          {/* Outcome + Meeting booked + Duration (Minari exact — même ligne) */}
          <div className="flex items-center gap-6 mb-3">
            <div>
              <p className="text-[11px] text-gray-400 mb-1">Résultat</p>
              <span className="text-[13px] text-gray-700">{DISPOSITIONS.find(d => d.value === call.call_outcome)?.label || call.call_outcome || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-gray-600">RDV pris</span>
              <span className={`text-[13px] ${call.meeting_booked ? 'text-teal-600 font-semibold' : 'text-gray-400'}`}>{call.meeting_booked ? '✓' : '—'}</span>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 mb-1">Durée</p>
              <span className="text-[13px] text-gray-700">{formatDuration(call.call_duration)}</span>
            </div>
          </div>

          {/* Player audio (Minari exact — ▶ barre + durée + download + vitesse) */}
          {call.recording_url && (
            <div className="flex items-center gap-2 mb-3 bg-gray-50 rounded-lg px-3 py-2">
              <button className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
              </button>
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full"><div className="h-1.5 bg-gray-400 rounded-full" style={{ width: '0%' }} /></div>
              <span className="text-[12px] text-gray-400 font-mono">{formatDurationShort(call.call_duration)}</span>
              <a href={call.recording_url} download className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </a>
              <span className="text-[11px] text-gray-400 font-mono">x1</span>
            </div>
          )}

          {/* Show full transcription + BETA badge */}
          {call.ai_transcript && (
            <>
              <button onClick={() => setShowTranscript(!showTranscript)}
                className="text-[12px] text-gray-500 hover:text-gray-700 flex items-center gap-1.5 mb-2 underline decoration-dotted">
                Voir la transcription complète
                <svg className={`w-3 h-3 transition-transform ${showTranscript ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-100 text-emerald-600 uppercase no-underline">Beta</span>
              </button>
              {showTranscript && (
                <div className="text-[12px] text-gray-600 bg-gray-50 rounded-lg p-3 mb-2 whitespace-pre-wrap animate-fade-in">{call.ai_transcript}</div>
              )}
            </>
          )}

          {/* AI Summary (Minari exact) */}
          {call.ai_summary && call.ai_summary.length > 0 && (
            <div className="mt-2 mb-2">
              <p className="text-[12px] text-gray-400 mb-1">Résumé IA Callio :</p>
              {call.ai_summary.map((s, i) => (
                <p key={i} className="text-[12px] text-gray-600 leading-relaxed">- {s}</p>
              ))}
            </div>
          )}

          {/* Note */}
          {call.note && <p className="text-[12px] text-gray-500 italic mt-2 bg-gray-50 rounded-lg p-2">{call.note}</p>}
        </div>
      )}
    </div>
  )
}

// ── Modal ────────────────────────────────────────────────────────
export default function ProspectModal({
  prospect, callContext, callHistory, isInCall, isDisconnected,
  onCall, onClose, onSetDisposition, onSetNotes, onSetMeeting, onReset, onNextCall, providerReady,
}: Props) {
  const [activeTab, setActiveTab] = useState('activite')
  const [showConfetti, setShowConfetti] = useState(false)
  const tabs = ['Activité', 'Notes', 'Tâches', 'Emails', 'Appels', 'SMS']

  const handleMeetingToggle = (checked: boolean) => {
    onSetMeeting(checked)
    if (checked) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 2500) }
  }

  const callsDisabled = prospect.do_not_call

  return (
    <>
      {showConfetti && <Confetti />}

      <div className="fixed inset-0 bg-black/15 flex items-start justify-center pt-[5vh] z-40"
        onClick={e => { if (e.target === e.currentTarget && !isInCall) onClose() }}>
        <div className="bg-white rounded-2xl shadow-xl w-[880px] max-h-[85vh] flex overflow-hidden animate-fade-in-scale">

          {/* ── GAUCHE — Infos prospect ── */}
          <div className="w-[300px] p-5 border-r border-gray-100 flex flex-col overflow-y-auto">

            {/* Nom + copier */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded bg-gray-200 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <h2 className="text-[15px] font-bold text-gray-800 flex-1 truncate">{prospect.name}</h2>
              <button onClick={() => navigator.clipboard.writeText(prospect.name)} className="text-gray-300 hover:text-gray-500">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
            </div>

            {/* 2 petites icones sous le nom (Minari exact — frame 025) */}
            <div className="flex gap-1 ml-9 mb-3">
              <div className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold ${prospect.linkedin_url ? 'bg-blue-50 text-blue-500' : 'bg-gray-50 text-gray-300'} cursor-pointer`}>in</div>
              <div className="w-5 h-5 rounded flex items-center justify-center bg-gray-50 text-gray-300 cursor-pointer">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3" /></svg>
              </div>
            </div>

            {/* Titre + Entreprise */}
            {prospect.title && (
              <div className="flex items-center gap-1.5 mb-0.5">
                <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <span className="text-[13px] text-gray-600">{prospect.title}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 mb-4">
              <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              <span className="text-[13px] text-gray-600">{prospect.company || '-'}</span>
            </div>

            {/* Calls disabled badge + Enable calls (Minari Jonathan DIAS) */}
            {callsDisabled && (
              <div className="mb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  <span className="text-[13px] font-semibold text-red-500">Appels désactivés</span>
                </div>
                <button className="w-full py-2.5 rounded-xl text-[13px] font-semibold bg-teal-700 text-white hover:bg-teal-800 flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  Activer les appels
                </button>
              </div>
            )}

            {/* Bouton Call compact (Minari exact) + snooze + DNC */}
            {!callsDisabled && (
              <div className="flex items-center gap-1.5 mb-4">
                {isInCall ? (
                  <div className="flex-1 py-2 rounded-lg text-[12px] font-medium bg-gray-100 text-gray-400 flex items-center justify-center gap-1.5 border border-gray-200">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    Appel en cours
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                ) : (
                  <button onClick={() => onCall(prospect)} disabled={!providerReady}
                    className="flex-1 py-2 rounded-lg text-[12px] font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    Call {formatPhone(prospect.phone)}
                    <span className="text-white/40 text-[10px]">▾</span>
                  </button>
                )}
                {/* Snooze (horloge) */}
                <button title="Mettre en pause" className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:text-purple-500 hover:bg-purple-50 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
                {/* Ne plus appeler (X) */}
                <button title="Ne plus appeler" className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                </button>
              </div>
            )}

            {/* Snooze badge */}
            {prospect.snoozed_until && new Date(prospect.snoozed_until) > new Date() && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-purple-50 border border-purple-100">
                <p className="text-[12px] text-purple-600 font-medium">En pause jusqu'au {new Date(prospect.snoozed_until).toLocaleDateString('fr-FR')}</p>
                <button className="text-[11px] text-purple-400 hover:text-purple-600 mt-0.5">Retirer la pause</button>
              </div>
            )}

            {/* Champs (Minari exact — UPPERCASE labels, champs éditables avec bordure) */}
            <div className="space-y-3 flex-1">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Email</span>
                <div className="flex items-center mt-1 border-b border-gray-200 pb-1">
                  <p className="text-[13px] text-gray-600 flex-1 truncate">{prospect.email || ''}</p>
                  {prospect.email && <button onClick={() => navigator.clipboard.writeText(prospect.email!)} className="text-gray-300 hover:text-gray-500"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></button>}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Statut</span>
                <select value={prospect.crm_status || 'new'} onChange={() => {}}
                  className="block mt-1 text-[13px] text-gray-600 bg-transparent outline-none cursor-pointer border-b border-gray-200 pb-1 w-full">
                  {CRM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Téléphone</span>
                <div className="flex items-center mt-1 border-b border-gray-200 pb-1">
                  <p className="text-[13px] text-gray-600 font-mono flex-1">{formatPhone(prospect.phone)}</p>
                  <button onClick={() => navigator.clipboard.writeText(prospect.phone)} className="text-gray-300 hover:text-gray-500"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></button>
                </div>
              </div>
              {/* Phone 2-5 (champs avec bordure — Minari exact) */}
              {[2, 3, 4, 5].map(n => (
                <div key={n}>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Téléphone {n}</span>
                  <div className="mt-1 border-b border-gray-200 pb-1">
                    <p className="text-[13px] text-gray-400 font-mono">{(prospect as unknown as Record<string, string>)[`phone${n}`] || ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── DROITE — Activité ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Transcription live */}
            {isInCall && (
              <div className="px-5 py-3 bg-emerald-50/80 border-b border-emerald-100">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 animate-pulse flex-shrink-0" />
                  <p className="text-[13px] text-gray-600 italic">Transcription en cours...</p>
                </div>
              </div>
            )}

            {/* Tabs + Expand all toggle + X */}
            <div className="flex items-center justify-between px-5 pt-3">
              <div className="flex gap-4">
                {tabs.map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab.toLowerCase().replace('é', 'e').replace('â', 'a'))}
                    className={`text-[13px] pb-2 transition-colors ${
                      activeTab === tab.toLowerCase().replace('é', 'e').replace('â', 'a')
                        ? 'text-gray-800 font-semibold border-b-2 border-gray-800'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}>{tab}</button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-gray-400">Tout développer</span>
                <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg">&times;</button>
              </div>
            </div>
            <div className="h-px bg-gray-100 mx-5" />

            {/* Contenu */}
            <div className="flex-1 overflow-y-auto px-5 py-3">

              {/* Card appel EN COURS */}
              {isInCall && (
                <div className="border border-emerald-200 rounded-xl p-4 mb-2 bg-emerald-50/30">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    <span className="text-[13px] text-gray-600">Connecté</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-600 animate-pulse-soft">En cours</span>
                  </div>
                  <textarea placeholder="Écrire une note..." value={callContext?.notes || ''} onChange={e => onSetNotes(e.target.value)}
                    rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none resize-none placeholder:text-gray-400" />
                </div>
              )}

              {/* Card POST-CALL */}
              {isDisconnected && (
                <div className="border border-gray-200 rounded-xl p-4 mb-2">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    <span className="text-[13px] text-gray-600">Appel sortant</span>
                    <OutcomeBadge outcome={callContext?.disposition || 'connected'} meeting={callContext?.meetingBooked || false} />
                    <span className="ml-auto text-[12px] text-gray-400">{new Date().toLocaleDateString('fr-FR')} {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>

                  {/* Outcome + Meeting booked + Duration */}
                  <div className="flex items-center gap-6 mb-4">
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1">Résultat</p>
                      <select value={callContext?.disposition || 'connected'} onChange={e => onSetDisposition(e.target.value as Disposition)}
                        className="text-[13px] text-gray-700 border-b border-gray-200 pb-0.5 outline-none bg-transparent cursor-pointer">
                        {DISPOSITIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={callContext?.meetingBooked || false}
                        onChange={e => handleMeetingToggle(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 accent-teal-600" />
                      <span className={`text-[13px] ${callContext?.meetingBooked ? 'text-teal-600 font-semibold' : 'text-gray-600'}`}>RDV pris</span>
                    </label>
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1">Durée</p>
                      <p className="text-[13px] text-gray-700">{formatDuration(callContext?.duration || 0)}</p>
                    </div>
                  </div>

                  {/* Recording status */}
                  <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-600 text-[12px] flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    Enregistrement pas encore disponible...
                  </div>

                  {/* Note */}
                  <textarea placeholder="Écrire une note..." value={callContext?.notes || ''} onChange={e => onSetNotes(e.target.value)}
                    rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none resize-none placeholder:text-gray-400 mb-4" />

                  {/* Resume / Stop */}
                  <div className="flex gap-3">
                    <button onClick={() => { onReset(); onNextCall() }}
                      className="flex-1 py-2 rounded-lg text-[13px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                      Reprendre les appels
                    </button>
                    <button onClick={() => { onReset(); onClose() }}
                      className="px-4 py-2 rounded-lg text-[13px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                      Arrêter
                    </button>
                  </div>
                </div>
              )}

              {/* Historique — fiches accordéon (Minari exact) */}
              {callHistory.map((c, i) => (
                <CallCard key={c.id} call={c} defaultOpen={i === 0 && !isInCall && !isDisconnected} />
              ))}

              {/* Vide */}
              {!isInCall && !isDisconnected && callHistory.length === 0 && (
                <p className="text-[13px] text-gray-400 text-center py-10">Aucune activité</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
