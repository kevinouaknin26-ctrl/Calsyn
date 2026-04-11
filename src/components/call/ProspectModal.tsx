/**
 * ProspectModal — Copie Minari pixel-perfect.
 * Sources : Jonathan DIAS (WhatsApp), frame 040 (John Doe post-call), frame 020 (pendant appel).
 *
 * Colonne gauche : infos prospect, bouton Call/Enable, champs éditables
 * Colonne droite : tabs, fiches appels accordéon (réduit/agrandi), player, transcription, AI summary
 */

import { useState, useRef } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
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

/** Transforme une URL Twilio recording en URL proxy pour éviter l'auth browser */
function proxyRecordingUrl(url: string): string {
  if (!url || !url.includes('twilio.com')) return url
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recording-proxy?url=${encodeURIComponent(url)}`
}

function formatDuration(s: number) {
  if (!s) return '0sec'
  if (s < 60) return `${s}sec`
  return `${Math.floor(s / 60)}min${(s % 60).toString().padStart(2, '0')}sec`
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

// ── Celebration emojis 3D (montent du bas, tailles variées, perspective) ──
function Celebration() {
  const emojis = ['🔥', '🎉', '💪', '🚀', '⭐', '🏆', '💰', '✨', '🎯', '👏', '🥳', '💥', '🙌']
  const pieces = Array.from({ length: 35 }, (_, i) => {
    const layer = Math.random() // 0 = loin (petit), 1 = proche (gros)
    return {
      emoji: emojis[i % emojis.length],
      x: 2 + Math.random() * 96,
      delay: Math.random() * 1,
      duration: 1.2 + Math.random() * 1.5,
      size: layer < 0.3 ? 14 + Math.random() * 10 : layer < 0.7 ? 24 + Math.random() * 16 : 40 + Math.random() * 24,
      opacity: layer < 0.3 ? 0.4 : layer < 0.7 ? 0.7 : 1,
      blur: layer < 0.3 ? 2 : 0,
      wobbleX: -30 + Math.random() * 60,
      rotation: -40 + Math.random() * 80,
    }
  })
  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden" style={{ perspective: '600px' }}>
      {pieces.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${p.x}%`, bottom: -80,
          fontSize: p.size,
          opacity: 0,
          filter: p.blur ? `blur(${p.blur}px)` : undefined,
          animation: `emojiRise3D ${p.duration}s ${p.delay}s ease-out forwards`,
          '--wobbleX': `${p.wobbleX}px`,
          '--rotation': `${p.rotation}deg`,
          '--scaleEnd': `${0.8 + Math.random() * 0.6}`,
        } as React.CSSProperties}>{p.emoji}</div>
      ))}
      <style>{`
        @keyframes emojiRise3D {
          0% { transform: translateY(0) translateX(0) scale(0.3) rotate(0deg); opacity: 1; }
          20% { opacity: 1; transform: translateY(-20vh) translateX(calc(var(--wobbleX) * 0.3)) scale(1.2) rotate(calc(var(--rotation) * 0.3)); }
          50% { opacity: 1; transform: translateY(-50vh) translateX(var(--wobbleX)) scale(var(--scaleEnd)) rotate(calc(var(--rotation) * 0.7)); }
          80% { opacity: 0.7; }
          100% { transform: translateY(-115vh) translateX(calc(var(--wobbleX) * 1.2)) scale(0.5) rotate(var(--rotation)); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ── Badge outcome ───────────────────────────────────────────────
function OutcomeBadge({ outcome, meeting }: { outcome: string | null; meeting: boolean }) {
  if (meeting) return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-600">RDV pris</span>
  const map: Record<string, string> = {
    connected: 'bg-violet-100 text-violet-600', rdv: 'bg-indigo-100 text-indigo-600',
    voicemail: 'bg-orange-100 text-orange-500', cancelled: 'bg-gray-100 text-gray-500',
    no_answer: 'bg-gray-100 text-gray-500', failed: 'bg-red-100 text-red-500',
    meeting_booked: 'bg-indigo-100 text-indigo-600',
  }
  const label = DISPOSITIONS.find(d => d.value === outcome)?.label || outcome || 'Connecté'
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${map[outcome || ''] || 'bg-violet-100 text-violet-600'}`}>{label}</span>
}

// ── Player audio custom (Minari exact — ▶ barre + durée + download + vitesse) ──
function AudioPlayer({ url, date, prospectName }: { url: string; date?: string; prospectName?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="mb-3">
      <audio ref={audioRef} src={url} preload="auto"
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration) }}
        onTimeUpdate={() => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime) }}
        onEnded={() => setPlaying(false)} />
      <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
        {/* Play/Pause */}
        <button onClick={() => {
          if (!audioRef.current) return
          if (playing) { audioRef.current.pause(); setPlaying(false) }
          else { audioRef.current.play(); setPlaying(true) }
        }} className="text-gray-500 hover:text-gray-700 flex-shrink-0">
          {playing ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
          )}
        </button>
        {/* Barre de progression cliquable */}
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full cursor-pointer relative"
          onClick={e => {
            if (!audioRef.current || !duration) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            audioRef.current.currentTime = pct * duration
          }}>
          <div className="h-1.5 bg-violet-400 rounded-full transition-all" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} />
        </div>
        {/* Durée */}
        <span className="text-[11px] text-gray-400 font-mono flex-shrink-0">{fmt(currentTime)}/{fmt(duration)}</span>
        {/* Download — force téléchargement via XMLHttpRequest pour éviter redirect login */}
        <button onClick={() => {
          const xhr = new XMLHttpRequest()
          xhr.open('GET', url, true)
          xhr.responseType = 'blob'
          xhr.onload = () => {
            if (xhr.status === 200) {
              const blob = xhr.response
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              const d = date ? new Date(date) : new Date()
              const dateStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}_${d.getHours().toString().padStart(2,'0')}h${d.getMinutes().toString().padStart(2,'0')}`
              const name = (prospectName || 'inconnu').replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ -]/g, '').replace(/\s+/g, '_')
              a.download = `${name}_${dateStr}.mp3`
              a.click()
              URL.revokeObjectURL(a.href)
            }
          }
          xhr.send()
        }} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Télécharger">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        </button>
        {/* Vitesse */}
        <button onClick={() => {
          const speeds = [1, 1.5, 2, 0.5]
          const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length]
          setSpeed(next)
          if (audioRef.current) audioRef.current.playbackRate = next
        }} className="text-[11px] text-gray-400 hover:text-gray-600 font-mono flex-shrink-0 w-6 text-center" title="Vitesse">
          x{speed}
        </button>
      </div>
    </div>
  )
}

// ── Fiche appel accordéon (Minari exact) ────────────────────────
function CallCard({ call, defaultOpen, onUpdate, onCelebrate }: { call: Call; defaultOpen: boolean; onUpdate: () => void; onCelebrate: () => void }) {
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

          {/* Outcome dropdown + Meeting booked checkbox + Duration (Minari Jonathan DIAS exact) */}
          <div className="flex items-center gap-5 mb-3">
            <div>
              <p className="text-[11px] text-gray-400 mb-1">Résultat</p>
              <select value={call.call_outcome || 'connected'}
                onChange={async e => {
                  await supabase.from('calls').update({ call_outcome: e.target.value }).eq('id', call.id)
                  if (call.prospect_id) {
                    await supabase.from('prospects').update({ last_call_outcome: e.target.value }).eq('id', call.prospect_id)
                  }
                  onUpdate()
                }}
                className="text-[13px] text-gray-700 border border-gray-200 rounded-lg px-2 py-1 outline-none bg-white cursor-pointer">
                {DISPOSITIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer mt-4">
              <input type="checkbox" checked={call.meeting_booked}
                onChange={async e => {
                  const checked = e.target.checked
                  await supabase.from('calls').update({ meeting_booked: checked }).eq('id', call.id)
                  if (call.prospect_id) {
                    await supabase.from('prospects').update({ last_call_outcome: checked ? 'meeting_booked' : 'connected' }).eq('id', call.prospect_id)
                  }
                  if (checked) onCelebrate()
                  onUpdate()
                }}
                className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" />
              <span className={`text-[13px] ${call.meeting_booked ? 'text-indigo-600 font-semibold' : 'text-gray-600'}`}>RDV pris</span>
            </label>
            <div>
              <p className="text-[11px] text-gray-400 mb-1">Durée</p>
              <span className="text-[13px] text-gray-700">{formatDuration(call.call_duration)}</span>
            </div>
          </div>

          {/* Player audio (Minari exact — ▶ barre + durée + download + vitesse) */}
          {call.recording_url && <AudioPlayer url={proxyRecordingUrl(call.recording_url!)} date={call.created_at} prospectName={call.prospect_name || undefined} />}

          {/* Show full transcription + BETA badge */}
          {call.ai_transcript && (
            <>
              <button onClick={() => setShowTranscript(!showTranscript)}
                className="text-[12px] text-gray-500 hover:text-gray-700 flex items-center gap-1.5 mb-2 underline decoration-dotted">
                Voir la transcription complète
                <svg className={`w-3 h-3 transition-transform ${showTranscript ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-violet-100 text-violet-600 uppercase no-underline">Beta</span>
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

// ── Nom éditable (inline, clic pour modifier) ──
function NameEditor({ name, prospectId }: { name: string; prospectId: string }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)
  const qc = useQueryClient()

  async function save() {
    if (val.trim() && val !== name) {
      await supabase.from('prospects').update({ name: val.trim() }).eq('id', prospectId)
      await supabase.from('activity_logs').insert({
        prospect_id: prospectId, action: 'name_changed',
        details: `"${name}" → "${val.trim()}"`,
      })
      qc.invalidateQueries({ queryKey: ['prospects'] })
    }
    setEditing(false)
  }

  return editing ? (
    <input autoFocus type="text" value={val} onChange={e => setVal(e.target.value)}
      onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(name); setEditing(false) } }}
      className="text-[15px] font-bold text-gray-800 flex-1 outline-none border-b-2 border-violet-400 bg-transparent" />
  ) : (
    <h2 onClick={() => setEditing(true)}
      className="text-[15px] font-bold text-gray-800 flex-1 truncate cursor-pointer hover:text-violet-700 transition-colors">{name}</h2>
  )
}

// ── Champ éditable (clic pour modifier, blur pour sauvegarder) ──
function EditableField({ label, value, prospectId, field, copyable, mono }: {
  label: string; value: string; prospectId: string; field: string; copyable?: boolean; mono?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState(value)
  const [copied, setCopied] = useState(false)
  const qc = useQueryClient()

  async function save() {
    if (localVal !== value) {
      await supabase.from('prospects').update({ [field]: localVal || null }).eq('id', prospectId)
      // Log d'activité pour l'admin
      await supabase.from('activity_logs').insert({
        prospect_id: prospectId,
        action: 'field_updated',
        details: `${label} : "${value || ''}" → "${localVal || ''}"`,
      })
      qc.invalidateQueries({ queryKey: ['prospects'] })
      qc.invalidateQueries({ queryKey: ['activity-logs'] })
    }
    setEditing(false)
  }

  return (
    <div>
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      <div className="flex items-center mt-1 border-b border-gray-200 pb-1">
        {editing ? (
          <input autoFocus type="text" value={localVal} onChange={e => setLocalVal(e.target.value)}
            onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setLocalVal(value); setEditing(false) } }}
            className={`text-[13px] text-gray-600 flex-1 outline-none bg-transparent ${mono ? 'font-mono' : ''}`} />
        ) : (
          <p onClick={() => setEditing(true)}
            className={`text-[13px] flex-1 truncate cursor-text ${localVal ? 'text-gray-600' : 'text-gray-300 italic'} ${mono ? 'font-mono' : ''}`}>
            {localVal || 'Cliquer pour ajouter'}
          </p>
        )}
        {copyable && localVal && (
          <button onClick={() => { navigator.clipboard.writeText(localVal); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className={`ml-1 transition-colors ${copied ? 'text-violet-500' : 'text-gray-300 hover:text-gray-500'}`}>
            {copied ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Modal ────────────────────────────────────────────────────────
export default function ProspectModal({
  prospect, callContext, callHistory, isInCall, isDisconnected,
  onCall, onClose, onSetDisposition, onSetNotes, onSetMeeting, onReset, onNextCall, providerReady,
}: Props) {
  const [activeTab, setActiveTab] = useState('activite')
  const [showCelebration, setShowCelebration] = useState(false)
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
  const [editingUrl, setEditingUrl] = useState<'linkedin' | 'website' | null>(null)
  const [urlValue, setUrlValue] = useState('')
  const [localDoNotCall, setLocalDoNotCall] = useState(prospect.do_not_call)
  const [localSnoozedUntil, setLocalSnoozedUntil] = useState(prospect.snoozed_until)
  const queryClient = useQueryClient()
  const tabs = ['Activité', 'Notes', 'Tâches', 'Emails', 'Appels', 'SMS']

  const handleMeetingToggle = (checked: boolean) => {
    onSetMeeting(checked)
    if (checked) { setShowCelebration(true); setTimeout(() => setShowCelebration(false), 2500) }
  }

  async function handleSnooze(days: number) {
    const until = new Date()
    until.setDate(until.getDate() + days)
    await supabase.from('prospects').update({ snoozed_until: until.toISOString() }).eq('id', prospect.id)
    await supabase.from('activity_logs').insert({ prospect_id: prospect.id, action: 'snoozed', details: `En pause jusqu'au ${until.toLocaleDateString('fr-FR')}` })
    setLocalSnoozedUntil(until.toISOString())
    setShowSnoozeMenu(false)
    queryClient.invalidateQueries({ queryKey: ['prospects'] })
  }

  async function handleRemoveSnooze() {
    await supabase.from('prospects').update({ snoozed_until: null }).eq('id', prospect.id)
    await supabase.from('activity_logs').insert({ prospect_id: prospect.id, action: 'snooze_removed', details: 'Pause retirée' })
    setLocalSnoozedUntil(null)
    queryClient.invalidateQueries({ queryKey: ['prospects'] })
  }

  async function handleToggleDNC() {
    const newValue = !localDoNotCall
    await supabase.from('prospects').update({ do_not_call: newValue }).eq('id', prospect.id)
    await supabase.from('activity_logs').insert({ prospect_id: prospect.id, action: newValue ? 'calls_disabled' : 'calls_enabled', details: newValue ? 'Appels désactivés' : 'Appels réactivés' })
    setLocalDoNotCall(newValue)
    queryClient.invalidateQueries({ queryKey: ['prospects'] })
  }

  const callsDisabled = localDoNotCall
  const isSnoozed = localSnoozedUntil && new Date(localSnoozedUntil) > new Date()

  // Activity logs
  const { data: activityLogs } = useQuery({
    queryKey: ['activity-logs', prospect.id],
    queryFn: async () => {
      const { data } = await supabase.from('activity_logs').select('*').eq('prospect_id', prospect.id).order('created_at', { ascending: false }).limit(50)
      return data || []
    },
  })

  return (
    <>
      {showCelebration && <Celebration />}

      <div className="fixed inset-0 bg-black/15 flex items-start justify-center pt-[5vh] z-40"
        onClick={e => { if (e.target === e.currentTarget && !isInCall) onClose() }}>
        <div className="bg-white rounded-2xl shadow-xl w-[880px] max-h-[85vh] flex animate-fade-in-scale">

          {/* ── GAUCHE — Infos prospect ── */}
          <div className="w-[300px] p-5 border-r border-gray-100 flex flex-col overflow-y-auto">

            {/* Nom + copier */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded bg-gray-200 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <NameEditor name={prospect.name} prospectId={prospect.id} />
            </div>

            {/* Icones LinkedIn + globe — à gauche, avec popover inline pour ajouter */}
            <div className="flex gap-1 mb-3 relative">
              {prospect.linkedin_url ? (
                <a href={prospect.linkedin_url?.startsWith('http') ? prospect.linkedin_url : `https://${prospect.linkedin_url}`} target="_blank" rel="noopener noreferrer"
                  className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold bg-blue-50 text-blue-500 cursor-pointer hover:bg-blue-100">in</a>
              ) : (
                <button onClick={() => { setEditingUrl('linkedin'); setUrlValue('') }}
                  className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold bg-gray-50 text-gray-300 hover:text-blue-500 hover:bg-blue-50 cursor-pointer" title="Ajouter LinkedIn">in</button>
              )}
              {prospect.website_url ? (
                <a href={prospect.website_url?.startsWith('http') ? prospect.website_url : `https://${prospect.website_url}`} target="_blank" rel="noopener noreferrer"
                  className="w-5 h-5 rounded flex items-center justify-center bg-gray-50 text-gray-500 cursor-pointer hover:bg-gray-100">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>
                </a>
              ) : (
                <button onClick={() => { setEditingUrl('website'); setUrlValue('') }}
                  className="w-5 h-5 rounded flex items-center justify-center bg-gray-50 text-gray-300 hover:text-gray-500 hover:bg-gray-100 cursor-pointer" title="Ajouter site web">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>
                </button>
              )}
              {/* Popover inline pour ajouter URL */}
              {editingUrl && (
                <>
                <div className="fixed inset-0 z-[59]" onClick={() => setEditingUrl(null)} />
                <div className="fixed bg-white rounded-lg shadow-lg border border-gray-200 z-[60] p-2 w-56 animate-slide-down" style={{ marginTop: 4 }}>
                  <input autoFocus type="url" value={urlValue} onChange={e => setUrlValue(e.target.value)}
                    placeholder={editingUrl === 'linkedin' ? 'https://linkedin.com/in/...' : 'https://...'}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && urlValue.trim()) {
                        const field = editingUrl === 'linkedin' ? 'linkedin_url' : 'website_url'
                        await supabase.from('prospects').update({ [field]: urlValue.trim() }).eq('id', prospect.id)
                        queryClient.invalidateQueries({ queryKey: ['prospects'] })
                        setEditingUrl(null)
                      }
                      if (e.key === 'Escape') setEditingUrl(null)
                    }}
                    className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded outline-none focus:border-indigo-400" />
                  <div className="flex justify-end gap-1 mt-1.5">
                    <button onClick={() => setEditingUrl(null)} className="px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600">Annuler</button>
                    <button onClick={async () => {
                      if (urlValue.trim()) {
                        const field = editingUrl === 'linkedin' ? 'linkedin_url' : 'website_url'
                        await supabase.from('prospects').update({ [field]: urlValue.trim() }).eq('id', prospect.id)
                        queryClient.invalidateQueries({ queryKey: ['prospects'] })
                        setEditingUrl(null)
                      }
                    }} className="px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">Ajouter</button>
                  </div>
                </div>
                </>
              )}
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
                <button onClick={handleToggleDNC} className="w-full py-2.5 rounded-xl text-[13px] font-semibold bg-indigo-700 text-white hover:bg-teal-800 flex items-center justify-center gap-2">
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
                    <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                ) : (
                  <button onClick={() => onCall(prospect)} disabled={!providerReady}
                    className="flex-1 py-2 rounded-lg text-[12px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    Call {formatPhone(prospect.phone)}
                    <span className="text-white/40 text-[10px]">▾</span>
                  </button>
                )}
                {/* Snooze (horloge) — avec menu durée */}
                <div className="relative">
                  <button onClick={() => setShowSnoozeMenu(!showSnoozeMenu)} title="Mettre en pause"
                    className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:text-purple-500 hover:bg-purple-50 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                  {showSnoozeMenu && (
                    <>
                    <div className="fixed inset-0 z-[59]" onClick={() => setShowSnoozeMenu(false)} />
                    <div className="fixed bg-white rounded-xl shadow-lg border border-gray-200 z-[60] py-1.5 w-44 animate-slide-down" style={{ marginTop: 4 }}>
                      <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase">Mettre en pause</p>
                      {[{ days: 1, label: 'Demain' }, { days: 3, label: 'Dans 3 jours' }, { days: 7, label: 'Dans 1 semaine' }, { days: 14, label: 'Dans 2 semaines' }, { days: 30, label: 'Dans 1 mois' }].map(opt => (
                        <button key={opt.days} onClick={() => handleSnooze(opt.days)}
                          className="w-full text-left px-3 py-1.5 text-[12px] text-gray-600 hover:bg-purple-50 hover:text-purple-600">{opt.label}</button>
                      ))}
                      <div className="border-t border-gray-100 mt-1 pt-1 px-3 py-1.5 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[12px] text-gray-600">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          Date
                          <input type="date" className="ml-auto text-[11px] border border-gray-200 rounded px-1.5 py-0.5 outline-none"
                            onChange={async e => {
                              if (e.target.value) {
                                await supabase.from('prospects').update({ snoozed_until: new Date(e.target.value).toISOString() }).eq('id', prospect.id)
                                setLocalSnoozedUntil(new Date(e.target.value).toISOString())
                                setShowSnoozeMenu(false)
                                queryClient.invalidateQueries({ queryKey: ['prospects'] })
                              }
                            }} />
                        </div>
                        <div className="flex items-center gap-1.5 text-[12px] text-gray-600">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Heure
                          <input type="time" className="ml-auto text-[11px] border border-gray-200 rounded px-1.5 py-0.5 outline-none"
                            onChange={async e => {
                              if (e.target.value) {
                                const today = new Date()
                                const [h, m] = e.target.value.split(':')
                                today.setHours(parseInt(h), parseInt(m), 0, 0)
                                if (today < new Date()) today.setDate(today.getDate() + 1)
                                await supabase.from('prospects').update({ snoozed_until: today.toISOString() }).eq('id', prospect.id)
                                setLocalSnoozedUntil(today.toISOString())
                                setShowSnoozeMenu(false)
                                queryClient.invalidateQueries({ queryKey: ['prospects'] })
                              }
                            }} />
                        </div>
                      </div>
                    </div>
                    </>
                  )}
                </div>
                {/* Ne plus appeler — toggle DNC */}
                <button onClick={handleToggleDNC} title={callsDisabled ? 'Réactiver les appels' : 'Ne plus appeler'}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${callsDisabled ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                </button>
              </div>
            )}

            {/* Snooze badge (Minari : badge violet + "Remove snooze") */}
            {isSnoozed && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-purple-50 border border-purple-100">
                <p className="text-[12px] text-purple-600 font-medium">En pause jusqu'au {new Date(localSnoozedUntil!).toLocaleDateString('fr-FR')}</p>
                <button onClick={handleRemoveSnooze} className="text-[11px] text-purple-400 hover:text-purple-600 mt-0.5 underline">Retirer la pause</button>
              </div>
            )}

            {/* Champs (Minari exact — UPPERCASE labels, champs éditables avec bordure) */}
            <div className="space-y-3 flex-1">
              <EditableField label="Email" value={prospect.email || ''} prospectId={prospect.id} field="email" copyable />
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Statut</span>
                <select value={prospect.crm_status || 'new'} onChange={async e => {
                  await supabase.from('prospects').update({ crm_status: e.target.value }).eq('id', prospect.id)
                  queryClient.invalidateQueries({ queryKey: ['prospects'] })
                }} className="block mt-1 text-[13px] text-gray-600 bg-transparent outline-none cursor-pointer border-b border-gray-200 pb-1 w-full">
                  {CRM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <EditableField label="Téléphone" value={prospect.phone} prospectId={prospect.id} field="phone" copyable mono />
              <EditableField label="Téléphone 2" value={prospect.phone2 || ''} prospectId={prospect.id} field="phone2" copyable mono />
              <EditableField label="Téléphone 3" value={prospect.phone3 || ''} prospectId={prospect.id} field="phone3" mono />
              <EditableField label="Téléphone 4" value={prospect.phone4 || ''} prospectId={prospect.id} field="phone4" mono />
              <EditableField label="Téléphone 5" value={prospect.phone5 || ''} prospectId={prospect.id} field="phone5" mono />
            </div>
          </div>

          {/* ── DROITE — Activité ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Transcription live */}
            {isInCall && (
              <div className="px-5 py-3 bg-violet-50/80 border-b border-violet-100">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-violet-400 mt-1.5 animate-pulse flex-shrink-0" />
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
              <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg">&times;</button>
            </div>
            <div className="h-px bg-gray-100 mx-5" />

            {/* Contenu */}
            <div className="flex-1 overflow-y-auto px-5 py-3">

              {/* ── Onglet Activité ── */}
              {(activeTab === 'activite' || isInCall || isDisconnected) && (
              <>
              {/* Card appel EN COURS */}
              {isInCall && (
                <div className="border border-violet-200 rounded-xl p-4 mb-2 bg-violet-50/30">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    <span className="text-[13px] text-gray-600">Connecté</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-600 animate-pulse-soft">En cours</span>
                  </div>
                  <textarea placeholder="Écrire une note..." value={callContext?.notes || ''} onChange={e => onSetNotes(e.target.value)}
                    rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none resize-none placeholder:text-gray-400" />
                </div>
              )}

              {/* Card POST-CALL — seulement si c'est LE prospect qu'on vient d'appeler */}
              {isDisconnected && callContext?.prospect?.id === prospect.id && (
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
                        className="text-[13px] text-gray-700 border border-gray-200 rounded-lg px-2 py-1 outline-none bg-white cursor-pointer">
                        {DISPOSITIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={callContext?.meetingBooked || false}
                        onChange={e => handleMeetingToggle(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 accent-indigo-600" />
                      <span className={`text-[13px] ${callContext?.meetingBooked ? 'text-indigo-600 font-semibold' : 'text-gray-600'}`}>RDV pris</span>
                    </label>
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1">Durée</p>
                      <p className="text-[13px] text-gray-700">{formatDuration(callContext?.duration || 0)}</p>
                    </div>
                  </div>

                  {/* Recording status */}
                  <div className="mb-3 px-3 py-2 rounded-lg bg-violet-50 text-violet-600 text-[12px] flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                    Enregistrement pas encore disponible...
                  </div>

                  {/* Note */}
                  <textarea placeholder="Écrire une note..." value={callContext?.notes || ''} onChange={e => onSetNotes(e.target.value)}
                    rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none resize-none placeholder:text-gray-400 mb-4" />

                  {/* Resume / Stop */}
                  <div className="flex gap-3">
                    <button onClick={() => { onReset(); onNextCall() }}
                      className="flex-1 py-2 rounded-lg text-[13px] font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors">
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
                <CallCard key={c.id} call={c} defaultOpen={i === 0 && !isInCall && !isDisconnected} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] })} onCelebrate={() => { setShowCelebration(true); setTimeout(() => setShowCelebration(false), 2500) }} />
              ))}

              {/* Logs d'activité (modifications de champs, snooze, DNC) */}
              {activityLogs && activityLogs.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Historique des modifications</p>
                  {activityLogs.map((log: { id: string; action: string; details: string; created_at: string }) => (
                    <div key={log.id} className="flex items-center gap-2 text-[11px] text-gray-400 py-1 border-b border-gray-50">
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="flex-1">{log.details}</span>
                      <span className="text-[10px] text-gray-300">{formatDate(log.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Vide */}
              {!isInCall && !isDisconnected && callHistory.length === 0 && (!activityLogs || activityLogs.length === 0) && (
                <p className="text-[13px] text-gray-400 text-center py-10">Aucune activité</p>
              )}
              </>
              )}

              {/* ── Onglet Notes ── */}
              {activeTab === 'notes' && (
                <div>
                  {/* Notes de tous les appels */}
                  {callHistory.filter(c => c.note).length > 0 ? (
                    <div className="space-y-2 mb-4">
                      {callHistory.filter(c => c.note).map(c => (
                        <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                            <span className="text-[11px] text-gray-400">{formatDate(c.created_at)}</span>
                          </div>
                          <p className="text-[13px] text-gray-600">{c.note}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-gray-400 mb-4">Aucune note pour ce prospect</p>
                  )}
                  {/* Ajouter une note libre */}
                  <textarea placeholder="Ajouter une note..."
                    onBlur={async e => {
                      if (e.target.value.trim()) {
                        await supabase.from('calls').insert({
                          prospect_id: prospect.id, prospect_name: prospect.name, prospect_phone: prospect.phone,
                          note: e.target.value.trim(), call_outcome: 'connected', call_duration: 0, provider: 'manual',
                        })
                        queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] })
                        e.target.value = ''
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none resize-none placeholder:text-gray-400" rows={3} />
                </div>
              )}

              {/* ── Onglet Tâches ── */}
              {activeTab === 'taches' && (
                <div className="text-center py-10">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                  <p className="text-[13px] text-gray-400">Aucune tâche</p>
                  <p className="text-[11px] text-gray-300 mt-1">Les tâches seront disponibles prochainement</p>
                </div>
              )}

              {/* ── Onglet Emails ── */}
              {activeTab === 'emails' && (
                <div className="text-center py-10">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  <p className="text-[13px] text-gray-400">Aucun email</p>
                  <p className="text-[11px] text-gray-300 mt-1">Connectez votre CRM pour voir les emails</p>
                </div>
              )}

              {/* ── Onglet Appels (Call logs) ── */}
              {activeTab === 'appels' && (
                <div>
                  {callHistory.length > 0 ? callHistory.map(c => (
                    <CallCard key={c.id} call={c} defaultOpen={false} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] })} onCelebrate={() => { setShowCelebration(true); setTimeout(() => setShowCelebration(false), 2500) }} />
                  )) : (
                    <p className="text-[13px] text-gray-400 text-center py-10">Aucun appel enregistré</p>
                  )}
                </div>
              )}

              {/* ── Onglet SMS ── */}
              {activeTab === 'sms' && (
                <div className="text-center py-10">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  <p className="text-[13px] text-gray-400">Aucun SMS</p>
                  <p className="text-[11px] text-gray-300 mt-1">L'envoi de SMS sera disponible prochainement</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
