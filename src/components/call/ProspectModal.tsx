/**
 * ProspectModal — Copie Minari pixel-perfect.
 * Sources : Jonathan DIAS (WhatsApp), frame 040 (John Doe post-call), frame 020 (pendant appel).
 *
 * Colonne gauche : infos prospect, bouton Call/Enable, champs éditables
 * Colonne droite : tabs, fiches appels accordéon (réduit/agrandi), player, transcription, AI summary
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { usePropertyDefinitions, useProspectCustomValues, groupProperties, updatePropertyValue, useCrmStatuses } from '@/hooks/useProperties'
import { getPropertyValue } from '@/config/properties'
import SocialLinks, { PlatformIcon } from './SocialLinks'
import { supabase } from '@/config/supabase'
import { useRecordingSignedUrl } from '@/hooks/useRecordingSignedUrl'
import { useAuth } from '@/hooks/useAuth'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useGmail, type GmailThread, type GmailMessage } from '@/hooks/useGmail'
import { useSmsForProspect, useSendSms } from '@/hooks/useSms'
import { useEmailTemplates, useSaveEmailTemplate, useDeleteEmailTemplate } from '@/hooks/useEmailTemplates'
import { CallDirectionBadge, getCallDirection } from '@/pages/History'
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const DISPOSITIONS: Array<{ value: Disposition; label: string }> = [
  { value: 'connected', label: 'Connecté' },
  { value: 'callback', label: 'Rappel' }, { value: 'not_interested', label: 'Pas intéressé' },
  { value: 'no_answer', label: 'Pas de réponse' }, { value: 'voicemail', label: 'Messagerie' },
  { value: 'busy', label: 'Occupé' }, { value: 'wrong_number', label: 'Mauvais numéro' },
  { value: 'dnc', label: 'Ne pas appeler' },
]

// Statuts d'appel pour le sidebar gauche (Minari — s'arrête à RDV pris)
const CALL_STATUS_OPTIONS: Array<{ value: string; label: string; bg: string; text: string }> = [
  { value: '', label: 'Pas encore appelé', bg: '#f3f4f6', text: '#9ca3af' },
  { value: 'no_answer', label: 'Pas de réponse', bg: '#f3f4f6', text: '#6b7280' },
  { value: 'voicemail', label: 'Messagerie', bg: '#f3f4f6', text: '#6b7280' },
  { value: 'busy', label: 'Occupé', bg: '#fef3c7', text: '#d97706' },
  { value: 'connected', label: 'Connecté', bg: '#d1fae5', text: '#059669' },
  { value: 'callback', label: 'Rappel', bg: '#e9d5ff', text: '#7c3aed' },
  { value: 'not_interested', label: 'Pas intéressé', bg: '#f3f4f6', text: '#6b7280' },
  { value: 'wrong_number', label: 'Mauvais numéro', bg: '#fecaca', text: '#dc2626' },
  { value: 'rdv_pris', label: 'RDV pris', bg: '#ccfbf1', text: '#0d9488' },
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
  // Normaliser : connected_incoming → connected, missed_incoming/rejected_incoming → conservé
  const baseOutcome = (outcome || '').replace(/_incoming$/, '') || outcome
  // meeting_booked + connected = "RDV pris" (teal, Minari exact)
  if (meeting && (baseOutcome === 'connected' || baseOutcome === 'meeting_booked' || baseOutcome === 'rdv_pris' || !outcome)) {
    return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-600">RDV pris</span>
  }
  const map: Record<string, string> = {
    connected: 'bg-emerald-100 text-emerald-600',
    callback: 'bg-violet-100 text-violet-600',
    not_interested: 'bg-gray-100 text-gray-500',
    voicemail: 'bg-orange-100 text-orange-500',
    busy: 'bg-yellow-100 text-yellow-600',
    no_answer: 'bg-gray-100 text-gray-500',
    cancelled: 'bg-gray-100 text-gray-500',
    failed: 'bg-red-100 text-red-500',
    wrong_number: 'bg-red-100 text-red-500',
    missed_incoming: 'bg-red-100 text-red-500',
    rejected_incoming: 'bg-gray-100 text-gray-500',
  }
  const incomingLabels: Record<string, string> = {
    missed_incoming: 'Manqué',
    rejected_incoming: 'Rejeté',
  }
  const label = incomingLabels[outcome || ''] || DISPOSITIONS.find(d => d.value === baseOutcome)?.label || outcome || 'Pas de réponse'
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${map[outcome || ''] || map[baseOutcome] || 'bg-gray-100 text-gray-500'}`}>{label}</span>
}

// ── Player audio custom (Minari exact — ▶ barre + durée + download + vitesse) ──
function AudioPlayer({ url, date, prospectName }: { url: string; date?: string; prospectName?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  const readDuration = () => {
    const a = audioRef.current
    if (!a) return
    const d = a.duration
    if (Number.isFinite(d) && d > 0) setDuration(d)
  }

  return (
    <div className="mb-3">
      <audio ref={audioRef} src={url} preload="metadata" crossOrigin="anonymous"
        onLoadedMetadata={readDuration}
        onDurationChange={readDuration}
        onCanPlay={() => { setReady(true); setLoadError(null); readDuration() }}
        onError={() => setLoadError('Impossible de charger l\'enregistrement')}
        onTimeUpdate={() => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime) }}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)} />
      <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
        {/* Play/Pause */}
        <button onClick={async () => {
          const a = audioRef.current
          if (!a) return
          if (playing) { a.pause(); return }
          try {
            await a.play()
          } catch (err) {
            setLoadError(err instanceof Error ? err.message : 'Lecture impossible')
            setPlaying(false)
          }
        }} disabled={!!loadError} className="text-gray-500 hover:text-gray-700 flex-shrink-0 disabled:opacity-40">
          {playing ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
          )}
        </button>
        {/* Barre de progression cliquable — zone élargie pour le clic */}
        <div className="flex-1 py-2 cursor-pointer"
          onClick={e => {
            const a = audioRef.current
            if (!a || !Number.isFinite(a.duration) || a.duration <= 0) return
            const bar = e.currentTarget.firstElementChild as HTMLElement
            if (!bar) return
            const rect = bar.getBoundingClientRect()
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            const target = pct * a.duration
            try { a.currentTime = target; setCurrentTime(target) } catch { /* seek refusé (stream non-seekable) */ }
          }}>
          <div className="h-2 bg-gray-200 rounded-full relative overflow-hidden">
            <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} />
          </div>
        </div>
        {/* Durée */}
        <span className="text-[11px] text-gray-400 font-mono flex-shrink-0">
          {loadError ? <span className="text-red-500" title={loadError}>erreur</span> : (!ready && !duration ? '...' : `${fmt(currentTime)}/${fmt(duration)}`)}
        </span>
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
  const signedAudioUrl = useRecordingSignedUrl(open ? call.recording_url : null)

  return (
    <div className={`border border-gray-100 rounded-xl mb-2 overflow-hidden transition-all ${open ? 'bg-white' : 'bg-gray-50/50'}`}>
      {/* Header — toujours visible */}
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center gap-2 text-left">
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <span className="text-[13px] text-gray-600">
          {getCallDirection(call.call_outcome) === 'incoming' ? 'Appel entrant'
            : getCallDirection(call.call_outcome) === 'missed' ? 'Appel manqué'
            : 'Appel sortant'}
        </span>
        <CallDirectionBadge outcome={call.call_outcome} />
        <OutcomeBadge outcome={call.call_outcome} meeting={call.meeting_booked} />
        <span className="ml-auto text-[12px] text-gray-400">{formatDate(call.created_at)}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Contenu — visible quand ouvert */}
      {open && (
        <div className="px-4 pb-4 animate-fade-in">
          {/* From → To (sens d'appel : entrant inverse l'affichage) */}
          <p className="text-[12px] text-gray-400 mb-3">
            {getCallDirection(call.call_outcome) === 'incoming' || getCallDirection(call.call_outcome) === 'missed'
              ? <>{call.prospect_phone || ''} (prospect) → {call.from_number || ''} (vous)</>
              : <>{call.from_number || ''} (vous) → {call.prospect_phone || ''}</>}
          </p>

          {/* Outcome dropdown + Meeting booked checkbox + Duration (Minari Jonathan DIAS exact) */}
          <div className="flex items-center gap-5 mb-3">
            <div>
              <p className="text-[11px] text-gray-400 mb-1">Résultat</p>
              <MiniDropdown
                // Le dropdown ne connaît que les variantes sortantes (DISPOSITIONS).
                // Pour un entrant (connected_incoming), on strip le suffixe afin que le label "Connecté" s'affiche.
                value={((call.call_outcome || 'no_answer').replace(/_incoming$/, '')) || 'no_answer'}
                options={DISPOSITIONS}
                onChange={async newOutcome => {
                  // Préserver la direction entrante : si l'appel était _incoming, append le suffixe
                  // à la nouvelle valeur pour conserver le badge Entrant quel que soit l'outcome choisi.
                  const wasIncoming = (call.call_outcome || '').endsWith('_incoming')
                  const finalOutcome = wasIncoming && !newOutcome.endsWith('_incoming') ? `${newOutcome}_incoming` : newOutcome
                  await supabase.from('calls').update({ call_outcome: finalOutcome }).eq('id', call.id)
                  if (call.prospect_id) {
                    const { data: allCalls } = await supabase.from('calls').select('call_outcome').eq('prospect_id', call.prospect_id)
                    const priority: Record<string, number> = { connected: 100, connected_incoming: 100, callback: 60, not_interested: 50, voicemail: 40, busy: 35, no_answer: 30, missed_incoming: 25, rejected_incoming: 20, cancelled: 20, failed: 10, wrong_number: 5 }
                    let best = finalOutcome, bestP = priority[finalOutcome] || 0
                    for (const c of (allCalls || [])) { const p = priority[c.call_outcome || ''] || 0; if (p > bestP) { bestP = p; best = c.call_outcome || newOutcome } }
                    await supabase.from('prospects').update({ last_call_outcome: best }).eq('id', call.prospect_id)
                  }
                  onUpdate()
                }} />
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer mt-4">
              <input type="checkbox" checked={call.meeting_booked}
                onChange={async e => {
                  const checked = e.target.checked
                  // meeting_booked est un boolean séparé — ne change PAS le call_outcome
                  const updates: Record<string, unknown> = { meeting_booked: checked }
                  // Cocher RDV implique "connecté" — mais préserver la direction entrante (connected_incoming).
                  if (checked) {
                    const o = call.call_outcome || ''
                    if (o.endsWith('_incoming')) {
                      if (o !== 'connected_incoming') updates.call_outcome = 'connected_incoming'
                    } else if (o !== 'connected') {
                      updates.call_outcome = 'connected'
                    }
                  }
                  await supabase.from('calls').update(updates).eq('id', call.id)
                  if (call.prospect_id) {
                    await supabase.from('prospects').update({ meeting_booked: checked }).eq('id', call.prospect_id)
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
          {call.recording_url && signedAudioUrl && <AudioPlayer url={signedAudioUrl} date={call.created_at} prospectName={call.prospect_name || undefined} />}

          {/* ── Bulle Notes & Résumé (toujours ouverte) ── */}
          <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
            {/* Notes personnelles du commercial */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Vos notes</p>
              <textarea
                defaultValue={call.note || ''}
                placeholder="Ajoutez vos notes ici..."
                onBlur={async e => {
                  const val = e.target.value.trim()
                  if (val !== (call.note || '')) {
                    await supabase.from('calls').update({ note: val || null }).eq('id', call.id)
                    onUpdate()
                  }
                }}
                className="w-full text-[12px] text-gray-700 bg-white/70 border border-indigo-100 rounded-lg p-2.5 resize-none outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-all placeholder:text-gray-300"
                rows={2}
              />
            </div>

            {/* Séparateur */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-indigo-200/60" />
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Résumé IA</span>
                {call.ai_analysis_status === 'pending' && <span className="text-[10px] text-gray-400 ml-1">· En attente</span>}
                {call.ai_analysis_status === 'processing' && (
                  <span className="flex items-center gap-1 text-[10px] text-indigo-500 ml-1">
                    · <span className="w-2.5 h-2.5 border-[1.5px] border-indigo-400 border-t-transparent rounded-full animate-spin" /> En cours
                  </span>
                )}
                {call.ai_analysis_status === 'error' && <span className="text-[10px] text-red-400 ml-1">· Erreur</span>}
              </div>
              <div className="flex-1 h-px bg-indigo-200/60" />
            </div>

            {/* Résumé IA */}
            {call.ai_summary && call.ai_summary.length > 0 ? (
              <div className="space-y-1">
                {call.ai_summary.map((s, i) => (
                  <p key={i} className="text-[12px] text-gray-700 leading-relaxed flex gap-2"><span className="text-indigo-400">—</span>{s}</p>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 italic">
                {call.ai_analysis_status === 'pending' || call.ai_analysis_status === 'processing' ? 'Le résumé apparaîtra ici automatiquement...' : 'Aucun résumé disponible.'}
              </p>
            )}

            {/* Transcription expandable + download */}
            {call.ai_transcript && (
              <>
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowTranscript(!showTranscript)}
                    className="text-[12px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1.5">
                    {showTranscript ? 'Masquer' : 'Voir'} la transcription
                    <svg className={`w-3 h-3 transition-transform ${showTranscript ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <button onClick={() => {
                    const blob = new Blob([call.ai_transcript!], { type: 'text/plain;charset=utf-8' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    const d = call.created_at ? new Date(call.created_at) : new Date()
                    const dateStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}_${d.getHours().toString().padStart(2,'0')}h${d.getMinutes().toString().padStart(2,'0')}`
                    const name = (call.prospect_name || 'inconnu').replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ -]/g, '').replace(/\s+/g, '_')
                    a.download = `transcription_${name}_${dateStr}.txt`
                    a.click()
                    URL.revokeObjectURL(a.href)
                  }} className="text-[11px] text-gray-400 hover:text-indigo-500 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Télécharger
                  </button>
                </div>
                {showTranscript && (
                  <div className="max-h-48 overflow-y-auto text-[12px] leading-relaxed p-3 rounded-lg bg-white/60 border border-indigo-100 animate-fade-in">
                    {call.ai_transcript.split('\n').map((line, i) => (
                      <p key={i} className={`mb-1 ${line.startsWith('Speaker 0') ? 'text-indigo-600 font-medium' : 'text-gray-500'}`}>{line}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Bulle 2 : Analyse & Coaching IA ── */}
          {call.recording_url && (
            <div className="mt-2 rounded-xl border border-violet-100 bg-violet-50/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                <span className="text-[13px] font-semibold text-violet-700">Analyse & Coaching</span>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-violet-100 text-violet-600 uppercase">Calsyn+</span>
                {call.ai_score_global && (
                  <span className="ml-auto px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[12px] font-bold">{call.ai_score_global}/100</span>
                )}
                {!call.ai_score_global && call.ai_analysis_status === 'pending' && <span className="ml-auto text-[11px] text-gray-400">En attente...</span>}
                {!call.ai_score_global && call.ai_analysis_status === 'processing' && (
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-violet-500">
                    <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                    Analyse en cours...
                  </span>
                )}
              </div>

              {/* Barres de score */}
              {(call.ai_score_accroche != null || call.ai_score_objection != null || call.ai_score_closing != null) && (
                <div className="space-y-2">
                  {call.ai_score_accroche != null && (
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-20">Accroche</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${call.ai_score_accroche}%` }} /></div>
                      <span className="text-xs font-bold w-8 text-right text-emerald-600">{call.ai_score_accroche}</span>
                    </div>
                  )}
                  {call.ai_score_objection != null && (
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-20">Objection</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-100"><div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${call.ai_score_objection}%` }} /></div>
                      <span className="text-xs font-bold w-8 text-right text-amber-600">{call.ai_score_objection}</span>
                    </div>
                  )}
                  {call.ai_score_closing != null && (
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-20">Closing</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-100"><div className="h-full rounded-full bg-sky-500 transition-all duration-500" style={{ width: `${call.ai_score_closing}%` }} /></div>
                      <span className="text-xs font-bold w-8 text-right text-sky-600">{call.ai_score_closing}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Points forts */}
              {call.ai_points_forts?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">✓ Points forts</p>
                  <ul className="space-y-0.5">
                    {call.ai_points_forts.map((p: string, i: number) => (
                      <li key={i} className="text-[11px] text-gray-600 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-1.5 before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-400">{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Points d'amélioration */}
              {call.ai_points_amelioration?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">△ À améliorer</p>
                  <ul className="space-y-0.5">
                    {call.ai_points_amelioration.map((p: string, i: number) => (
                      <li key={i} className="text-[11px] text-gray-600 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-1.5 before:w-1.5 before:h-1.5 before:rounded-full before:bg-amber-400">{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Intention prospect + Prochaine étape */}
              {(call.ai_intention_prospect || call.ai_prochaine_etape) && (
                <div className="border-t border-violet-100 pt-2 space-y-1">
                  {call.ai_intention_prospect && (
                    <p className="text-[11px] text-gray-500"><span className="font-semibold text-violet-600">Intention :</span> {call.ai_intention_prospect}</p>
                  )}
                  {call.ai_prochaine_etape && (
                    <p className="text-[11px] text-gray-500"><span className="font-semibold text-violet-600">Prochaine étape :</span> {call.ai_prochaine_etape}</p>
                  )}
                </div>
              )}

              {/* État vide — pas encore de scores */}
              {call.ai_score_global == null && call.ai_analysis_status !== 'pending' && call.ai_analysis_status !== 'processing' && (
                <p className="text-[11px] text-gray-400 italic">Analyse non disponible (appel trop court ou sans enregistrement).</p>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ── Logos réseaux en barre (en haut de la fiche, petits, cliquables) ──
function SocialIconsBar({ prospectId }: { prospectId: string }) {
  const { data: socials } = useQuery({
    queryKey: ['prospect-socials', prospectId],
    queryFn: async () => {
      const { data } = await supabase.from('prospect_socials').select('*').eq('prospect_id', prospectId).order('created_at')
      return data || []
    },
  })

  if (!socials || socials.length === 0) return <div className="mb-2" />

  return (
    <div className="flex gap-1 mb-2">
      {socials.map((s: { id: string; platform: string; url: string }) => (
        <a key={s.id} href={s.url.startsWith('http') ? s.url : `https://${s.url}`} target="_blank" rel="noopener noreferrer">
          <PlatformIcon platform={s.platform} />
        </a>
      ))}
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
      qc.invalidateQueries({ queryKey: ['prospects'] }); qc.invalidateQueries({ queryKey: ['all-prospects'] })
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
      qc.invalidateQueries({ queryKey: ['prospects'] }); qc.invalidateQueries({ queryKey: ['all-prospects'] })
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

// ── Mini Dropdown custom (remplace les select natifs) ──────────
function MiniDropdown({ value, options, onChange, className }: {
  value: string; options: Array<{ value: string; label: string; bg?: string; text?: string }>; onChange: (v: string) => void; className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)
  const hasColors = options.some(o => o.bg)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className={`relative ${className || ''}`} ref={ref}>
      <button onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-[13px] rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer w-full text-left ${
          hasColors && selected?.bg
            ? 'border font-semibold text-[12px]'
            : 'bg-white border border-gray-200 text-gray-700 hover:border-indigo-300'
        }`}
        style={hasColors && selected?.bg ? { background: selected.bg, color: selected.text, borderColor: selected.text + '30' } : undefined}>
        <span className="flex-1 truncate">{selected?.label || value || '—'}</span>
        <svg className="w-3 h-3 flex-shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 z-[70] py-1 min-w-full max-w-[220px] max-h-[200px] overflow-y-auto animate-slide-down">
          {options.map(o => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 transition-colors flex items-center gap-2 ${o.value === value ? 'font-medium' : 'text-gray-600'}`}>
              {o.bg && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: o.text }} />}
              <span style={o.value === value && o.text ? { color: o.text } : undefined}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Onglet Notes : zone pour ajouter + liste des notes (appels + IA) ─
// ── Onglet Tâches (RDV + rappels avec actions) ──────────────────────
function TasksTab({ prospect, onUpdate }: { prospect: Prospect; onUpdate: () => void }) {
  const { connected: gcalConnected, getEvent: gcalGetEvent, deleteEvent: gcalDeleteEvent, listEvents: gcalListEvents } = useGoogleCalendar()
  const motifLabels: Record<string, string> = {
    rappel: 'Rappel',
    retour_demande: 'Retour sur demande',
    rdv: 'RDV',
    rdv_2: 'RDV n°2',
    rdv_3: 'RDV n°3',
  }

  const hasRdv = !!prospect.rdv_date
  const hasReminder = !!prospect.snoozed_until && new Date(prospect.snoozed_until) > new Date()
  const eventId = (prospect as Prospect & { next_action_gcal_event_id?: string }).next_action_gcal_event_id
  const wasInvited = (prospect as Prospect & { next_action_invited_client?: boolean }).next_action_invited_client
  const motif = (prospect as Prospect & { next_action_type?: string }).next_action_type

  // Fetch l'event Google pour récupérer le statut RSVP + Meet link
  const [eventDetails, setEventDetails] = useState<{ rsvp?: string; meetLink?: string } | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const allProspectEmails = [prospect.email, prospect.email2, prospect.email3].filter(Boolean).map(e => e!.toLowerCase())

  const fetchEvent = useCallback(async () => {
    if (!gcalConnected || !eventId || !hasRdv) { setEventDetails(null); return }
    const ev = await gcalGetEvent(eventId)
    if (!ev) {
      console.warn('[TasksTab] getEvent returned null (event_id:', eventId, ')')
      return
    }
    if (ev.error) {
      console.warn('[TasksTab] getEvent error:', ev.error)
      return
    }
    console.log('[TasksTab] event attendees:', ev.attendees, 'looking for emails:', allProspectEmails)
    const attendee = ev.attendees?.find((a: { email?: string; responseStatus?: string }) =>
      a.email && allProspectEmails.includes(a.email.toLowerCase())
    )
    const meetLink = ev.hangoutLink || ev.conferenceData?.entryPoints?.find((e: { entryPointType: string; uri: string }) => e.entryPointType === 'video')?.uri
    setEventDetails({ rsvp: attendee?.responseStatus, meetLink })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, gcalConnected, hasRdv, allProspectEmails.join(','), gcalGetEvent])

  // Fetch initial + refresh manuel via refreshTick
  useEffect(() => { fetchEvent() }, [fetchEvent, refreshTick])
  // Auto-refresh toutes les 30s pour récupérer les changements RSVP
  useEffect(() => {
    if (!eventId || !hasRdv) return
    const iv = setInterval(() => setRefreshTick(t => t + 1), 30000)
    return () => clearInterval(iv)
  }, [eventId, hasRdv])

  const rsvpLabel: Record<string, { text: string; color: string; bg: string }> = {
    accepted: { text: '✓ Accepté', color: 'text-emerald-700', bg: 'bg-emerald-100' },
    declined: { text: '✗ Décliné', color: 'text-red-700', bg: 'bg-red-100' },
    tentative: { text: '? Peut-être', color: 'text-amber-700', bg: 'bg-amber-100' },
    needsAction: { text: '⏳ En attente', color: 'text-gray-600', bg: 'bg-gray-100' },
  }

  // Si pas d'event_id stocké (RDV créé avant que Calsyn ne le track), on le retrouve
  // dans le calendar Google par date+nom du prospect.
  const findGcalEventByDate = async (datetime: Date): Promise<{ id: string; hasAttendees: boolean } | null> => {
    if (!gcalConnected) return null
    const timeMin = new Date(datetime.getTime() - 60 * 60 * 1000).toISOString()
    const timeMax = new Date(datetime.getTime() + 60 * 60 * 1000).toISOString()
    const list = await gcalListEvents(timeMin, timeMax)
    const events = list?.items || []
    const nameLower = (prospect.name || '').toLowerCase()
    const match = events.find((e: { id: string; summary?: string; attendees?: Array<{ email?: string }>; start?: { dateTime?: string } }) => {
      // Match par nom dans le summary OU email du prospect dans attendees
      if (nameLower && e.summary?.toLowerCase().includes(nameLower)) return true
      if (e.attendees?.some(a => a.email && allProspectEmails.includes(a.email.toLowerCase()))) return true
      return false
    })
    if (!match?.id) return null
    return { id: match.id, hasAttendees: !!match.attendees?.length }
  }

  const cancel = async (kind: 'rdv' | 'reminder') => {
    const msg = kind === 'rdv'
      ? `Annuler ce RDV ?${wasInvited ? ' L\'invitation Google sera supprimée et le client sera notifié.' : ''}`
      : 'Supprimer ce rappel ?'
    if (!confirm(msg)) return

    // Tentative de delete event Google
    if (gcalConnected) {
      let idToDelete = eventId
      let notifyClient = wasInvited
      // Fallback : si pas d'event_id stocké, retrouve par date + nom
      if (!idToDelete && kind === 'rdv' && prospect.rdv_date) {
        const found = await findGcalEventByDate(new Date(prospect.rdv_date))
        if (found) { idToDelete = found.id; notifyClient = found.hasAttendees }
      }
      if (idToDelete) {
        await gcalDeleteEvent(idToDelete, notifyClient ? 'all' : 'none').catch(err => console.warn('[TasksTab] GCal delete failed', err))
      }
    }
    const update: Record<string, unknown> = { next_action_type: null, next_action_gcal_event_id: null, next_action_invited_client: false }
    if (kind === 'rdv') { update.rdv_date = null; update.meeting_booked = false } else { update.snoozed_until = null }
    await supabase.from('prospects').update(update).eq('id', prospect.id)
    await supabase.from('activity_logs').insert({
      prospect_id: prospect.id,
      action: kind === 'rdv' ? 'rdv_cancelled' : 'snooze_removed',
      details: kind === 'rdv' ? `RDV annulé${wasInvited ? ' (notification client)' : ''}` : 'Rappel supprimé',
    })
    onUpdate()
  }

  if (!hasRdv && !hasReminder) {
    return (
      <div className="text-center py-10">
        <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        <p className="text-[13px] text-gray-400">Aucune tâche</p>
        <p className="text-[11px] text-gray-300 mt-1">Les RDV et rappels apparaîtront ici.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {hasRdv && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
          <div className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-teal-800">{motif && motifLabels[motif] ? motifLabels[motif] : 'RDV'}</p>
              <p className="text-[11px] text-teal-600 mt-0.5">
                {new Date(prospect.rdv_date!).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                {' à '}
                {new Date(prospect.rdv_date!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
              {wasInvited && (
                <div className="flex items-center gap-1.5 mt-1">
                  {eventDetails?.rsvp && rsvpLabel[eventDetails.rsvp] ? (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${rsvpLabel[eventDetails.rsvp].bg} ${rsvpLabel[eventDetails.rsvp].color}`}>
                      {rsvpLabel[eventDetails.rsvp].text}
                    </span>
                  ) : (
                    <span className="text-[10px] text-teal-500">✉ Client invité par email</span>
                  )}
                  <button onClick={() => setRefreshTick(t => t + 1)} title="Rafraîchir le statut"
                    className="text-gray-300 hover:text-teal-600">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
                </div>
              )}
              {!wasInvited && eventId && <p className="text-[10px] text-teal-500 mt-0.5">📌 Bloqué sur ton Google Calendar</p>}
              {eventDetails?.meetLink && (
                <a href={eventDetails.meetLink} target="_blank" rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-[11px] font-medium text-blue-700">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">
                    <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z" fill="#1a73e8"/>
                    <rect x="3" y="6" width="12" height="12" rx="2" fill="#1a73e8"/>
                  </svg>
                  Rejoindre Meet
                </a>
              )}
            </div>
            <button onClick={() => cancel('rdv')} title="Annuler le RDV"
              className="text-[11px] font-medium text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
              Annuler
            </button>
          </div>
        </div>
      )}
      {hasReminder && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-amber-800">{motif && motifLabels[motif] ? motifLabels[motif] : 'Rappel'}</p>
              <p className="text-[11px] text-amber-600 mt-0.5">
                {new Date(prospect.snoozed_until!).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                {' · dans '}
                {Math.ceil((new Date(prospect.snoozed_until!).getTime() - Date.now()) / 86400000)} jour(s)
              </p>
            </div>
            <button onClick={() => cancel('reminder')} title="Supprimer le rappel"
              className="text-[11px] font-medium text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Onglet SMS (Twilio intégré) ──────────────────────────────────────
function SmsTab({ prospect }: { prospect: Prospect }) {
  const phoneNumbers = [prospect.phone, prospect.phone2, prospect.phone3, prospect.phone4, prospect.phone5].filter(Boolean) as string[]
  const { data: messages, isLoading } = useSmsForProspect(prospect.id, phoneNumbers)
  const sendSms = useSendSms()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const targetPhone = prospect.phone || phoneNumbers[0] || ''

  const handleSend = async () => {
    if (!draft.trim() || !targetPhone) return
    setSending(true)
    setErr(null)
    const r = await sendSms({ to: targetPhone, body: draft.trim(), prospectId: prospect.id })
    setSending(false)
    if (r.error) { setErr(r.error); return }
    setDraft('')
  }

  if (!targetPhone) {
    return (
      <div className="text-center py-10">
        <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        <p className="text-[13px] text-gray-400">Pas de numéro pour ce prospect</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[480px]">
      {/* Liste messages (scroll) */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {isLoading && <p className="text-[12px] text-gray-400 text-center py-4">Chargement...</p>}
        {!isLoading && (!messages || messages.length === 0) && (
          <div className="text-center py-10">
            <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <p className="text-[13px] text-gray-400">Aucun SMS échangé</p>
            <p className="text-[11px] text-gray-300 mt-1">Envoie le premier message ci-dessous</p>
          </div>
        )}
        {messages && messages.map(m => {
          const isOutbound = m.direction === 'outbound'
          return (
            <div key={m.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                isOutbound ? 'bg-violet-500 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}>
                <p className="text-[13px] whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-[9px] mt-1 ${isOutbound ? 'text-violet-100' : 'text-gray-400'}`}>
                  {new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {isOutbound && m.status && m.status !== 'delivered' && m.status !== 'sent' ? ` · ${m.status}` : ''}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-100 pt-3 mt-2">
        {err && (
          <p className="text-[11px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-2 py-1 mb-2">{err}</p>
        )}
        <p className="text-[10px] text-gray-400 mb-1">Vers <span className="font-mono text-gray-600">{targetPhone}</span></p>

        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend() } }}
            rows={2}
            placeholder="Tape ton message..."
            className="flex-1 text-[13px] px-3 py-2 border border-gray-200 rounded-xl outline-none focus:border-violet-400 resize-none" />
          <button onClick={handleSend} disabled={sending || !draft.trim()}
            title="Envoyer (Cmd/Ctrl + Entrée)"
            className="px-4 py-2 text-[13px] font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 rounded-xl">
            {sending ? '...' : 'Envoyer'}
          </button>
        </div>
        <p className="text-[10px] text-gray-300 mt-1">Cmd+Entrée pour envoyer · {draft.length} caractères</p>
      </div>
    </div>
  )
}

// ── Onglet Emails (Gmail intégré) ────────────────────────────────────
function EmailsTab({ prospect }: { prospect: Prospect }) {
  const { user, profile } = useAuth()
  const myEmail = (user?.email || '').toLowerCase()
  const signature = profile?.email_signature || ''
  const signatureImageUrl = profile?.email_signature_image_url || ''
  const { listThreads, getThread, sendEmail } = useGmail()
  const [threads, setThreads] = useState<GmailThread[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [openThread, setOpenThread] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<GmailMessage[] | null>(null)
  const [composing, setComposing] = useState(false)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [sending, setSending] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [attachments, setAttachments] = useState<Array<{ filename: string; mimeType: string; base64: string; sizeKB: number }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showTemplatesMenu, setShowTemplatesMenu] = useState(false)
  const { data: templates } = useEmailTemplates()
  const saveTemplate = useSaveEmailTemplate()
  const deleteTemplate = useDeleteEmailTemplate()

  const suggestReply = async () => {
    if (!threadMessages || threadMessages.length === 0) return
    setSuggesting(true)
    try {
      const context = threadMessages
        .slice(-6) // dernières 6 messages max pour limiter le contexte
        .map(m => `[${m.from}] ${new Date(m.date).toLocaleString('fr-FR')}\n${m.body || m.snippet}`)
        .join('\n\n')
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-suggest-reply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, prospectName: prospect.name, lang: 'fr' }),
      })
      const data = await res.json()
      if (data.error) {
        alert(`Suggestion : ${data.error}`)
      } else if (data.suggestion) {
        // Pré-pend la suggestion (avant la signature si déjà présente)
        const sigStart = signature ? '\n\n' + signature : ''
        setDraftBody(data.suggestion + sigStart)
      }
    } catch (e) {
      alert(`Erreur : ${(e as Error).message}`)
    } finally {
      setSuggesting(false)
    }
  }

  const addAttachment = async (file: File) => {
    if (file.size > 20_000_000) { alert('Pièce jointe trop lourde (max 20 Mo)'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // result = "data:mime;base64,xxxx"
      const base64 = result.split(',')[1] || ''
      setAttachments(prev => [...prev, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64,
        sizeKB: Math.round(file.size / 1024),
      }])
    }
    reader.readAsDataURL(file)
  }

  const allEmails = [prospect.email, prospect.email2, prospect.email3].filter(Boolean) as string[]
  const refresh = useCallback(async () => {
    if (allEmails.length === 0) {
      setError('Aucun email pour ce prospect')
      return
    }
    setLoading(true)
    setError(null)
    // Inclut envois (sent), reçus (inbox), cc/bcc, et tous les dossiers (in:anywhere) y compris archivés/spam.
    const orClause = allEmails
      .flatMap(e => [`from:${e}`, `to:${e}`, `cc:${e}`, `bcc:${e}`])
      .join(' OR ')
    const q = `(${orClause}) in:anywhere`
    const r = await listThreads(q)
    setLoading(false)
    if (r.error) setError(r.error)
    else setThreads(r.threads || [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEmails.join(','), listThreads])

  useEffect(() => { refresh() }, [refresh])

  const openThreadDetails = async (id: string) => {
    setOpenThread(id)
    setThreadMessages(null)
    const r = await getThread(id)
    if (r.error) setError(r.error)
    else setThreadMessages(r.messages || [])
  }

  const handleSend = async () => {
    const targetEmail = draftTo || allEmails[0]
    if (!targetEmail || !draftSubject.trim() || !draftBody.trim()) return
    setSending(true)
    // Append signature texte si configurée et pas déjà incluse dans le body
    const finalBody = signature && !draftBody.includes(signature.trim().slice(0, 30))
      ? `${draftBody}\n\n${signature}`
      : draftBody
    const r = await sendEmail({
      to: targetEmail,
      subject: draftSubject,
      body: finalBody,
      signatureImageUrl,
      attachments: attachments.length > 0 ? attachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, base64: a.base64 })) : undefined,
    })
    setSending(false)
    if (r.error) {
      alert(`Erreur envoi : ${r.error}`)
      return
    }
    setComposing(false)
    setDraftSubject('')
    setDraftBody('')
    setAttachments([])
    refresh()
  }

  if (allEmails.length === 0) {
    return (
      <div className="text-center py-10">
        <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        <p className="text-[13px] text-gray-400">Pas d'email pour ce prospect</p>
        <p className="text-[11px] text-gray-300 mt-1">Ajoutez une adresse email dans la fiche</p>
      </div>
    )
  }

  if (composing) {
    return (
      <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-gray-700">Nouveau message</h3>
          <div className="flex items-center gap-2">
            {/* Modèles dropdown */}
            <div className="relative">
              <button onClick={() => setShowTemplatesMenu(v => !v)}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Modèles
                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showTemplatesMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowTemplatesMenu(false)} />
                  <div className="absolute right-0 top-6 w-[280px] bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-1 max-h-[320px] overflow-y-auto">
                    {(templates || []).length === 0 && (
                      <p className="px-3 py-3 text-[11px] text-gray-400 italic text-center">Aucun modèle enregistré</p>
                    )}
                    {(templates || []).map(t => (
                      <div key={t.id} className="flex items-center gap-1 px-2 hover:bg-gray-50">
                        <button onClick={() => {
                          if (t.subject) setDraftSubject(t.subject)
                          setDraftBody((t.body || '') + (signature ? '\n\n' + signature : ''))
                          setShowTemplatesMenu(false)
                        }} className="flex-1 text-left py-1.5 text-[12px] text-gray-700">
                          <p className="font-medium truncate">{t.name}</p>
                          {t.subject && <p className="text-[10px] text-gray-400 truncate">{t.subject}</p>}
                        </button>
                        <button onClick={async () => {
                          if (confirm(`Supprimer le modèle "${t.name}" ?`)) await deleteTemplate.mutateAsync(t.id)
                        }} title="Supprimer"
                          className="text-gray-300 hover:text-red-500 px-1">×</button>
                      </div>
                    ))}
                    <div className="border-t border-gray-100 mt-1">
                      <button onClick={async () => {
                        const name = prompt('Nom du modèle (ex: Premier contact)')
                        if (!name?.trim()) return
                        const sigStripped = signature ? draftBody.replace('\n\n' + signature, '') : draftBody
                        try {
                          await saveTemplate.mutateAsync({ name: name.trim(), subject: draftSubject, body: sigStripped })
                          setShowTemplatesMenu(false)
                        } catch (e) {
                          alert(`Erreur : ${(e as Error).message}`)
                        }
                      }} className="w-full text-left px-3 py-2 text-[11px] font-medium text-violet-600 hover:bg-violet-50">
                        + Enregistrer le mail courant comme modèle
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setComposing(false)} className="text-gray-400 hover:text-red-500 text-[13px]">×</button>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">À</label>
          {allEmails.length > 1 ? (
            <select value={draftTo} onChange={e => setDraftTo(e.target.value)}
              className="w-full mt-1 text-[13px] px-2.5 py-2 border border-gray-200 rounded-lg outline-none focus:border-indigo-300 bg-white">
              {allEmails.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          ) : (
            <p className="text-[13px] text-gray-700 mt-0.5">{allEmails[0]}</p>
          )}
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">Objet</label>
          <input type="text" value={draftSubject} onChange={e => setDraftSubject(e.target.value)}
            className="w-full mt-1 text-[13px] px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-indigo-300" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Message</label>
            {threadMessages && threadMessages.length > 0 && (
              <button onClick={suggestReply} disabled={suggesting}
                title="Génère une réponse basée sur le thread (Claude)"
                className="text-[11px] font-medium text-violet-600 hover:text-violet-700 flex items-center gap-1 disabled:opacity-50">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                {suggesting ? 'Réflexion...' : 'Suggérer une réponse'}
              </button>
            )}
          </div>
          <textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} rows={10}
            className="w-full mt-1 text-[13px] px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-indigo-300 resize-none" />
        </div>

        {/* Pièces jointes */}
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">Pièces jointes</label>
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={async e => {
              const files = Array.from(e.target.files || [])
              for (const f of files) await addAttachment(f)
              if (e.target) e.target.value = ''
            }} />
          {attachments.length > 0 && (
            <div className="mt-1 space-y-1">
              {attachments.map((a, i) => (
                <div key={i} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  <span className="text-[11px] text-gray-700 flex-1 truncate">{a.filename}</span>
                  <span className="text-[10px] text-gray-400">{a.sizeKB} Ko</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="text-gray-300 hover:text-red-500 text-[14px] leading-none">×</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => fileInputRef.current?.click()}
            className="mt-1 text-[11px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Ajouter un fichier
          </button>
        </div>

        {/* Aperçu signature image (sera ajoutée auto en HTML au send) */}
        {signatureImageUrl && (
          <div className="border-t border-indigo-100 pt-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Signature (ajoutée automatiquement)</p>
            <img src={signatureImageUrl} alt="signature" className="max-h-20 max-w-full rounded border border-gray-200 bg-white" />
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handleSend} disabled={sending || !draftSubject.trim() || !draftBody.trim()}
            className="flex-1 px-4 py-2 text-[13px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl">
            {sending ? 'Envoi...' : 'Envoyer'}
          </button>
          <button onClick={() => setComposing(false)} disabled={sending}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl">
            Annuler
          </button>
        </div>
      </div>
    )
  }

  if (openThread && threadMessages) {
    return (
      <div className="space-y-3">
        <button onClick={() => { setOpenThread(null); setThreadMessages(null) }}
          className="text-[12px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
          ← Retour à la liste
        </button>
        {threadMessages.map(m => {
          const fromLower = (m.from || '').toLowerCase()
          // Heuristique : si le from contient l'un des emails du prospect, c'est le prospect.
          // Sinon (autre adresse), c'est forcément l'utilisateur (le thread est filtré sur le prospect).
          // Marche même quand le compte Gmail connecté ≠ l'email Supabase auth.
          const isFromProspect = allEmails.some(e => fromLower.includes(e.toLowerCase()))
          const isMine = !isFromProspect
          return (
            <div key={m.id}
              className={`rounded-xl border p-4 ${isMine ? 'bg-violet-50/70 border-violet-200' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center justify-between mb-2 text-[11px] text-gray-400">
                <span className={`font-medium truncate ${isMine ? 'text-violet-700' : 'text-gray-600'}`}>
                  {isMine ? 'Vous' : m.from}
                </span>
                <span className="flex-shrink-0 ml-2">{new Date(m.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {m.subject && <p className="text-[13px] font-semibold text-gray-800 mb-2">{m.subject}</p>}
              <pre className="text-[12px] text-gray-700 whitespace-pre-wrap font-sans">{m.body || m.snippet}</pre>
            </div>
          )
        })}
        <button onClick={() => {
          setComposing(true)
          setDraftSubject('Re: ' + (threadMessages[0]?.subject || ''))
          setDraftBody(signature ? '\n\n' + signature : '')
          // En répondant : prend le 1er email du prospect qui apparaît dans le thread (sender ou recipient)
          const involvedEmail = threadMessages?.find(m => allEmails.some(e => (m.from || '').toLowerCase().includes(e.toLowerCase())))?.from
          const matched = involvedEmail ? allEmails.find(e => involvedEmail.toLowerCase().includes(e.toLowerCase())) : null
          setDraftTo(matched || allEmails[0] || '')
        }}
          className="w-full px-3 py-2 text-[13px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl">
          Répondre
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-gray-500">Conversations avec <span className="font-medium">{allEmails.join(', ')}</span></p>
        <div className="flex gap-1.5">
          <button onClick={refresh} title="Rafraîchir"
            className="text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <button onClick={() => { setComposing(true); setDraftBody(signature ? '\n\n' + signature : ''); setDraftTo(allEmails[0] || '') }}
            className="px-2.5 py-1 text-[11px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
            + Composer
          </button>
        </div>
      </div>
      {error && (
        <div className="text-[12px] text-red-500 bg-red-50 border border-red-100 rounded-lg p-2">
          {error.includes('not connected') || error.includes('No session')
            ? 'Connectez votre Gmail dans Paramètres → Google Calendar (Reconnecter pour accorder Gmail).'
            : error}
        </div>
      )}
      {loading && <p className="text-[12px] text-gray-400 text-center py-4">Chargement...</p>}
      {!loading && threads && threads.length === 0 && !error && (
        <p className="text-[12px] text-gray-400 text-center py-6">Aucune conversation avec ce prospect</p>
      )}
      {threads && threads.map(t => {
        const fromLower = (t.from || '').toLowerCase()
        const isFromProspect = allEmails.some(e => fromLower.includes(e.toLowerCase()))
        const isMine = !isFromProspect
        return (
          <button key={t.id} onClick={() => openThreadDetails(t.id)}
            className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors border ${
              isMine
                ? 'bg-violet-50/70 border-violet-200 hover:border-violet-300 hover:bg-violet-100/60'
                : 'bg-white border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30'
            }`}>
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className={`text-[13px] truncate flex-1 ${t.unread ? 'font-semibold text-gray-800' : 'text-gray-700'}`}>
                {isMine && <span className="text-[9px] font-bold text-violet-600 mr-1 uppercase">Vous</span>}
                {t.subject || '(sans objet)'}
              </p>
              <span className="text-[10px] text-gray-400 flex-shrink-0">{new Date(t.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
            </div>
            <p className="text-[11px] text-gray-400 truncate">{t.snippet}</p>
            {t.messageCount > 1 && <span className={`text-[9px] font-bold mt-0.5 inline-block ${isMine ? 'text-violet-500' : 'text-indigo-500'}`}>{t.messageCount} msgs</span>}
          </button>
        )
      })}
    </div>
  )
}

function NotesTab({ prospect, callHistory, queryClient }: {
  prospect: Prospect
  callHistory: Call[]
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [addNote, setAddNote] = useState('')
  const [savingAdd, setSavingAdd] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const saveAddNote = async () => {
    const val = addNote.trim()
    if (!val) return
    setSavingAdd(true)
    try {
      const { error: insertErr } = await supabase.from('calls').insert({
        prospect_id: prospect.id,
        prospect_name: prospect.name,
        prospect_phone: prospect.phone,
        note: val,
        call_outcome: 'connected',
        call_duration: 0,
        provider: 'manual',
      })
      if (insertErr) throw insertErr
      setAddNote('')
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
      queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] })
    } catch (e) {
      console.error('saveAddNote failed', e)
      alert('Impossible d\'ajouter la note : ' + ((e as Error)?.message || 'erreur inconnue'))
    } finally {
      setSavingAdd(false)
    }
  }

  // Notes = calls avec `note` manuelle OU ai_summary (resume IA)
  const notesCalls = callHistory.filter(c => c.note || c.ai_summary)

  return (
    <div>
      {/* Zone pour ajouter une note */}
      <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Ajouter une note</p>
          {justSaved && <span className="text-[10px] text-emerald-600 font-medium">Enregistré ✓</span>}
        </div>
        <textarea
          value={addNote}
          onChange={e => setAddNote(e.target.value)}
          placeholder="Note à ajouter (s'affichera dans l'historique du prospect)…"
          rows={3}
          className="w-full text-[13px] text-gray-700 bg-white border border-indigo-100 rounded-lg p-2.5 resize-none outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 placeholder:text-gray-400" />
        <div className="flex items-center justify-end gap-2 mt-2">
          <button onClick={saveAddNote} disabled={!addNote.trim() || savingAdd}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all ${addNote.trim() && !savingAdd ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
            {savingAdd ? 'Enregistrement…' : 'Enregistrer la note'}
          </button>
        </div>
      </div>

      {/* Notes existantes : appels avec note + résumés IA */}
      {notesCalls.length > 0 ? (
        <div className="space-y-2">
          {notesCalls.map(c => (
            <div key={c.id} className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                <span className="text-[11px] text-gray-400">{formatDate(c.created_at)}</span>
                {c.ai_summary && <span className="text-[9px] font-bold text-violet-500 uppercase tracking-wider bg-violet-100 px-1.5 py-0.5 rounded">IA</span>}
              </div>
              {c.note && <p className="text-[13px] text-gray-600">{c.note}</p>}
              {c.ai_summary && (
                <p className="text-[12px] text-violet-700 italic mt-1.5 border-l-2 border-violet-200 pl-2">
                  {typeof c.ai_summary === 'string' ? c.ai_summary : (c.ai_summary as { summary?: string })?.summary || JSON.stringify(c.ai_summary)}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-gray-400 text-center py-6">Aucune note pour ce prospect</p>
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
  const [showCelebration, setShowCelebration] = useState(false)
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
  const [showPhoneMenu, setShowPhoneMenu] = useState(false)
  const [localDoNotCall, setLocalDoNotCall] = useState(prospect.do_not_call)
  const [localSnoozedUntil, setLocalSnoozedUntil] = useState(prospect.snoozed_until)
  const [localCallOutcome, setLocalCallOutcome] = useState(prospect.last_call_outcome || '')
  useEffect(() => { setLocalCallOutcome(prospect.last_call_outcome || '') }, [prospect.last_call_outcome])
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const tabs = ['Activité', 'Notes', 'Tâches', 'Emails', 'Appels', 'SMS', 'Historique']

  const handleMeetingToggle = (checked: boolean) => {
    onSetMeeting(checked)
    if (checked) {
      // Meeting implique connected
      onSetDisposition('connected')
      setShowCelebration(true)
      setTimeout(() => setShowCelebration(false), 2500)
    }
    // Décocher ne change PAS la disposition
  }

  const invalidateAfterSnooze = async () => {
    // refetchQueries (awaited) au lieu de invalidateQueries pour que l'UI
    // ne reste pas sur l'ancien state jusqu'au next cache refresh.
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['prospects'] }),
      queryClient.refetchQueries({ queryKey: ['all-prospects'] }),
      queryClient.refetchQueries({ queryKey: ['rdv-upcoming'] }),
      queryClient.refetchQueries({ queryKey: ['reminders-calendar'] }),
      queryClient.refetchQueries({ queryKey: ['rdv-today'] }),
    ])
  }

  async function handleSnooze(days: number) {
    const until = new Date()
    until.setDate(until.getDate() + days)
    await supabase.from('prospects').update({ snoozed_until: until.toISOString() }).eq('id', prospect.id)
    await supabase.from('activity_logs').insert({ prospect_id: prospect.id, action: 'snoozed', details: `En pause jusqu'au ${until.toLocaleDateString('fr-FR')}` })
    setLocalSnoozedUntil(until.toISOString())
    setShowSnoozeMenu(false)
    await invalidateAfterSnooze()
  }

  async function handleRemoveSnooze() {
    await supabase.from('prospects').update({ snoozed_until: null }).eq('id', prospect.id)
    await supabase.from('activity_logs').insert({ prospect_id: prospect.id, action: 'snooze_removed', details: 'Pause retirée' })
    setLocalSnoozedUntil(null)
    await invalidateAfterSnooze()
  }

  async function handleToggleDNC() {
    const newValue = !localDoNotCall
    await supabase.from('prospects').update({ do_not_call: newValue }).eq('id', prospect.id)
    await supabase.from('activity_logs').insert({ prospect_id: prospect.id, action: newValue ? 'calls_disabled' : 'calls_enabled', details: newValue ? 'Appels désactivés' : 'Appels réactivés' })
    setLocalDoNotCall(newValue)
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['prospects'] }),
      queryClient.refetchQueries({ queryKey: ['all-prospects'] }),
    ])
  }

  // Téléphones supplémentaires : afficher seulement si remplis ou si l'utilisateur clique "Ajouter"
  const nextEmptyPhone = !prospect.phone2 ? 2 : !prospect.phone3 ? 3 : !prospect.phone4 ? 4 : !prospect.phone5 ? 5 : 6
  const [showExtraPhone, setShowExtraPhone] = useState(0)
  const nextEmptyEmail = !prospect.email2 ? 2 : !prospect.email3 ? 3 : 4
  const [showExtraEmail, setShowExtraEmail] = useState(0)

  const callsDisabled = localDoNotCall
  const isSnoozed = localSnoozedUntil && new Date(localSnoozedUntil) > new Date()

  // Liste(s) du prospect + SDR assignés à ces listes
  const { data: prospectLists } = useQuery({
    queryKey: ['prospect-lists-for', prospect.id, prospect.phone],
    queryFn: async () => {
      // 1. Memberships du prospect canonique (source de vérité)
      const { data: directMemberships } = await supabase
        .from('prospect_list_memberships')
        .select('list_id')
        .eq('prospect_id', prospect.id)

      // 2. Fallback : autres prospects au même phone (avant merge des doublons)
      const { data: allMatches } = await supabase
        .from('prospects')
        .select('list_id')
        .eq('phone', prospect.phone)

      const listIds = [...new Set([
        ...(directMemberships || []).map(m => m.list_id as string),
        ...(allMatches || []).map(m => m.list_id as string).filter(Boolean),
      ])]
      if (listIds.length === 0) return []
      const { data: lists } = await supabase
        .from('prospect_lists')
        .select('id, name, assigned_to')
        .in('id', listIds)
      if (!lists?.length) return []

      // Résolution des user_ids → noms via profiles
      const allUserIds = [...new Set(lists.flatMap(l => l.assigned_to || []))].filter(Boolean) as string[]
      let userMap: Record<string, string> = {}
      if (allUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', allUserIds)
        userMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name || (p.email ? p.email.split('@')[0] : 'SDR')]))
      }
      return lists.map(l => ({
        id: l.id as string,
        name: l.name as string,
        sdrs: ((l.assigned_to || []) as string[])
          .map(uid => ({ id: uid, name: userMap[uid] || 'SDR' })),
      }))
    },
  })

  // Activity logs
  const { data: activityLogs } = useQuery({
    queryKey: ['activity-logs', prospect.id],
    queryFn: async () => {
      const { data } = await supabase.from('activity_logs').select('*').eq('prospect_id', prospect.id).order('created_at', { ascending: false }).limit(50)
      return data || []
    },
    refetchInterval: activeTab === 'historique' ? 5000 : false,
  })

  return (
    <>
      {showCelebration && <Celebration />}

      <div className="absolute inset-0 bg-black/15 flex items-start justify-center pt-[5vh] z-40"
        onClick={e => { if (e.target === e.currentTarget && !isInCall) onClose() }}>
        <div className="bg-white dark:bg-[#f0eaf5] rounded-2xl shadow-xl w-[95%] max-w-[1120px] max-h-[85vh] flex animate-fade-in-scale">

          {/* ── GAUCHE — Infos prospect ── */}
          <div className="w-[300px] p-5 border-r border-gray-100 dark:border-[#d4cade] flex flex-col overflow-y-auto bg-gradient-to-b from-violet-50/40 to-white">

            {/* ── EN HAUT : Nom + logos réseaux + poste/entreprise ── */}
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-white font-bold text-[14px]">{prospect.name.charAt(0).toUpperCase()}</span>
              </div>
              <NameEditor name={prospect.name} prospectId={prospect.id} />
            </div>

            {/* Logos réseaux en ligne (petits, cliquables — ouvrir le lien) */}
            <SocialIconsBar prospectId={prospect.id} />

            {/* Badges listes + SDR partagés */}
            {prospectLists && prospectLists.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {prospectLists.map(l => (
                  <span key={l.id} className="text-[9px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium truncate max-w-[140px]" title={`Liste : ${l.name}`}>
                    {l.name}
                  </span>
                ))}
                {(() => {
                  // Union des SDR assignés à toutes les listes (dédupliqué par user_id, exclut soi-même)
                  const myId = user?.id
                  const sharedSdrs = new Map<string, string>()
                  for (const l of prospectLists) {
                    for (const s of l.sdrs) {
                      if (s.id !== myId) sharedSdrs.set(s.id, s.name)
                    }
                  }
                  if (sharedSdrs.size === 0) return null
                  return Array.from(sharedSdrs.entries()).map(([id, name]) => (
                    <span key={`sdr-${id}`} className="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium truncate max-w-[140px] inline-flex items-center gap-1" title={`Partagé avec ${name}`}>
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      {name}
                    </span>
                  ))
                })()}
              </div>
            )}

            {/* Poste + Entreprise */}
            {prospect.title && (
              <div className="flex items-center gap-1.5 mb-0.5">
                <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <span className="text-[13px] text-gray-600">{prospect.title}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 mb-4">
              <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
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
                  <div className="flex-1 flex">
                    <button onClick={() => onCall(prospect)} disabled={!providerReady}
                      className={`flex-1 py-2 text-[12px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-1.5 ${prospect.phone2 || prospect.phone3 || prospect.phone4 || prospect.phone5 ? 'rounded-l-lg' : 'rounded-lg'}`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                      Call {formatPhone(prospect.phone)}
                    </button>
                    {/* Dropdown sélection numéro */}
                    {(prospect.phone2 || prospect.phone3 || prospect.phone4 || prospect.phone5) && (
                      <div className="relative">
                        <button onClick={() => setShowPhoneMenu(!showPhoneMenu)} disabled={!providerReady}
                          className="h-full px-2 bg-indigo-700 text-white rounded-r-lg hover:bg-indigo-800 disabled:opacity-40 border-l border-indigo-500">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {showPhoneMenu && (
                          <>
                            <div className="fixed inset-0 z-[59]" onClick={() => setShowPhoneMenu(false)} />
                            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 z-[60] py-1.5 w-56 animate-slide-down">
                              {[
                                { label: 'Principal', phone: prospect.phone },
                                prospect.phone2 ? { label: 'Téléphone 2', phone: prospect.phone2 } : null,
                                prospect.phone3 ? { label: 'Téléphone 3', phone: prospect.phone3 } : null,
                                prospect.phone4 ? { label: 'Téléphone 4', phone: prospect.phone4 } : null,
                                prospect.phone5 ? { label: 'Téléphone 5', phone: prospect.phone5 } : null,
                              ].filter(Boolean).map((item) => (
                                <button key={item!.phone} onClick={() => {
                                  setShowPhoneMenu(false)
                                  onCall({ ...prospect, phone: item!.phone })
                                }}
                                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
                                  <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                  <div>
                                    <p className="text-[12px] font-medium text-gray-700">{item!.label}</p>
                                    <p className="text-[11px] text-gray-400 font-mono">{formatPhone(item!.phone)}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
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
                                queryClient.invalidateQueries({ queryKey: ['prospects'] }); queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
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
                                queryClient.invalidateQueries({ queryKey: ['prospects'] }); queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
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

            {/* Champs éditables — sections avec fond violet doux */}
            <div className="space-y-3 flex-1">
              {/* ── Contact ── */}
              <div className="bg-violet-50/50 rounded-xl p-3 space-y-2">
                <EditableField label="Email" value={prospect.email || ''} prospectId={prospect.id} field="email" copyable />
                {(prospect.email2 || showExtraEmail >= 2) && <EditableField label="Email 2" value={prospect.email2 || ''} prospectId={prospect.id} field="email2" copyable />}
                {(prospect.email3 || showExtraEmail >= 3) && <EditableField label="Email 3" value={prospect.email3 || ''} prospectId={prospect.id} field="email3" copyable />}
                {nextEmptyEmail <= 3 && (
                  <button onClick={() => setShowExtraEmail(nextEmptyEmail)}
                    className="text-[11px] text-violet-400 hover:text-violet-600 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Ajouter un email
                  </button>
                )}
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Statut appel</span>
                  <div className="mt-1">
                    <MiniDropdown value={localCallOutcome} options={CALL_STATUS_OPTIONS}
                      onChange={async v => {
                        setLocalCallOutcome(v)
                        await supabase.from('prospects').update({ last_call_outcome: v }).eq('id', prospect.id)
                        queryClient.invalidateQueries({ queryKey: ['prospects'] }); queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
                      }} />
                  </div>
                </div>
              </div>

              {/* ── Téléphones ── */}
              <div className="bg-violet-50/50 rounded-xl p-3 space-y-2">
                <EditableField label="Téléphone" value={prospect.phone} prospectId={prospect.id} field="phone" copyable mono />
                {(prospect.phone2 || showExtraPhone >= 2) && <EditableField label="Téléphone 2" value={prospect.phone2 || ''} prospectId={prospect.id} field="phone2" copyable mono />}
                {(prospect.phone3 || showExtraPhone >= 3) && <EditableField label="Téléphone 3" value={prospect.phone3 || ''} prospectId={prospect.id} field="phone3" mono />}
                {(prospect.phone4 || showExtraPhone >= 4) && <EditableField label="Téléphone 4" value={prospect.phone4 || ''} prospectId={prospect.id} field="phone4" mono />}
                {(prospect.phone5 || showExtraPhone >= 5) && <EditableField label="Téléphone 5" value={prospect.phone5 || ''} prospectId={prospect.id} field="phone5" mono />}
                {nextEmptyPhone <= 5 && (
                  <button onClick={() => setShowExtraPhone(nextEmptyPhone)}
                    className="text-[11px] text-violet-400 hover:text-violet-600 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Ajouter un numéro
                  </button>
                )}
              </div>

              {/* ── Liens ── */}
              <div className="bg-violet-50/50 rounded-xl p-3">
                <SocialLinks prospectId={prospect.id} />
              </div>

              {/* ── Adresse ── */}
              <div className="bg-violet-50/50 rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">Adresse</p>
                <EditableField label="Adresse" value={prospect.address || ''} prospectId={prospect.id} field="address" />
                <EditableField label="Ville" value={prospect.city || ''} prospectId={prospect.id} field="city" />
                <EditableField label="Code postal" value={prospect.postal_code || ''} prospectId={prospect.id} field="postal_code" />
                <EditableField label="Pays" value={prospect.country || ''} prospectId={prospect.id} field="country" />
              </div>

              {/* ── Champs personnalisés ── */}
              <CustomFieldsSection prospectId={prospect.id} prospect={prospect} />
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
              {activeTab === 'activite' && (
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
                    <OutcomeBadge outcome={callContext?.disposition || (callContext?.wasAnswered ? ((callContext?.duration || 0) >= 8 ? 'connected' : 'voicemail') : 'no_answer')} meeting={callContext?.meetingBooked || false} />
                    <span className="ml-auto text-[12px] text-gray-400">{new Date().toLocaleDateString('fr-FR')} {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>

                  {/* Outcome + Meeting booked + Duration */}
                  <div className="flex items-center gap-6 mb-4">
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1">Résultat</p>
                      <MiniDropdown
                        value={callContext?.disposition || (callContext?.wasAnswered ? ((callContext?.duration || 0) >= 8 ? 'connected' : 'voicemail') : 'no_answer')}
                        options={DISPOSITIONS}
                        onChange={v => onSetDisposition(v as Disposition)}
                      />
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
                    rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none resize-none placeholder:text-gray-400" />
                </div>
              )}

              {/* Historique — fiches accordéon (Minari exact) */}
              {callHistory.map((c, i) => (
                <CallCard key={c.id} call={c} defaultOpen={i === 0 && !isInCall && !isDisconnected} onUpdate={() => { queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] }); queryClient.invalidateQueries({ queryKey: ['prospects'] }); queryClient.invalidateQueries({ queryKey: ['all-prospects'] }) }} onCelebrate={() => { setShowCelebration(true); setTimeout(() => setShowCelebration(false), 2500) }} />
              ))}

              {/* Vide */}
              {!isInCall && !isDisconnected && callHistory.length === 0 && (
                <p className="text-[13px] text-gray-400 text-center py-10">Aucune activité</p>
              )}
              </>
              )}

              {/* ── Onglet Notes ── */}
              {activeTab === 'notes' && (
                <NotesTab
                  prospect={prospect}
                  callHistory={callHistory}
                  queryClient={queryClient}
                />
              )}

              {/* ── Onglet Tâches : affiche RDV + rappels avec actions ── */}
              {activeTab === 'taches' && (
                <TasksTab prospect={prospect} onUpdate={() => { queryClient.invalidateQueries({ queryKey: ['prospects'] }); queryClient.invalidateQueries({ queryKey: ['all-prospects'] }); queryClient.invalidateQueries({ queryKey: ['rdv-upcoming-bar'] }); queryClient.invalidateQueries({ queryKey: ['rdv-calendar'] }) }} />
              )}

              {/* ── Onglet Emails (Gmail) ── */}
              {activeTab === 'emails' && (
                <EmailsTab prospect={prospect} />
              )}

              {/* ── Onglet Appels (Call logs) ── */}
              {activeTab === 'appels' && (
                <div>
                  {callHistory.length > 0 ? callHistory.map(c => (
                    <CallCard key={c.id} call={c} defaultOpen={false} onUpdate={() => { queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] }); queryClient.invalidateQueries({ queryKey: ['prospects'] }); queryClient.invalidateQueries({ queryKey: ['all-prospects'] }) }} onCelebrate={() => { setShowCelebration(true); setTimeout(() => setShowCelebration(false), 2500) }} />
                  )) : (
                    <p className="text-[13px] text-gray-400 text-center py-10">Aucun appel enregistré</p>
                  )}
                </div>
              )}

              {/* ── Onglet SMS (Twilio) ── */}
              {activeTab === 'sms' && (
                <SmsTab prospect={prospect} />
              )}

              {/* ── Onglet Historique : timeline unifiée (logs + calls + notes) ── */}
              {activeTab === 'historique' && (() => {
                type TimelineItem = {
                  id: string
                  kind: 'activity' | 'call'
                  created_at: string
                  icon_color: string
                  title: string
                  subtitle?: string
                }
                const items: TimelineItem[] = []
                if (activityLogs) {
                  for (const log of activityLogs as Array<{ id: string; action: string; details: string; created_at: string }>) {
                    items.push({
                      id: `log-${log.id}`,
                      kind: 'activity',
                      created_at: log.created_at,
                      icon_color: 'text-gray-300',
                      title: log.details,
                    })
                  }
                }
                for (const c of callHistory) {
                  const outcome = c.call_outcome || 'appel'
                  const hasNote = !!c.note
                  const hasAI = !!c.ai_summary
                  const duration = c.call_duration ? ` · ${formatDuration(c.call_duration)}` : ''
                  let title = `Appel ${outcome}${duration}`
                  if (c.provider === 'manual') title = 'Note ajoutée'
                  items.push({
                    id: `call-${c.id}`,
                    kind: 'call',
                    created_at: c.created_at,
                    icon_color: hasAI ? 'text-violet-400' : (hasNote ? 'text-indigo-400' : 'text-sky-400'),
                    title,
                    subtitle: c.note || (hasAI ? '[Résumé IA disponible]' : undefined),
                  })
                }
                items.sort((a, b) => b.created_at.localeCompare(a.created_at))

                if (items.length === 0) {
                  return <p className="text-[13px] text-gray-400 text-center py-10">Aucune activité enregistrée</p>
                }
                return (
                  <div className="space-y-1">
                    {items.map(item => (
                      <div key={item.id} className="flex items-start gap-2 text-[12px] py-2 border-b border-gray-50">
                        <svg className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${item.icon_color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {item.kind === 'call' ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          )}
                        </svg>
                        <div className="flex-1">
                          <p className="text-gray-600">{item.title}</p>
                          {item.subtitle && <p className="text-[11px] text-gray-500 mt-0.5 italic">{item.subtitle}</p>}
                          <p className="text-[10px] text-gray-300 mt-0.5">{formatDate(item.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* ── SIDEBAR DROITE — Pipeline, Rappels, Actions (HubSpot-style) ── */}
          <DealSidebar prospect={prospect} />
        </div>
      </div>
    </>
  )
}

// ── Deal Sidebar (HubSpot-style right panel) ──────────────────
const FALLBACK_STAGES: Array<{ key: string; label: string; color: string }> = [
  { key: 'new', label: 'Nouveau', color: '#94a3b8' },
  { key: 'attempted_to_contact', label: 'Tenté', color: '#a78bfa' },
  { key: 'connected', label: 'Connecté', color: '#60a5fa' },
  { key: 'callback', label: 'Rappel', color: '#fbbf24' },
  { key: 'not_interested', label: 'Pas intéressé', color: '#ef4444' },
  { key: 'mail_sent', label: 'Mail envoyé', color: '#8b5cf6' },
  { key: 'rdv_pris', label: 'RDV pris', color: '#34d399' },
  { key: 'rdv_fait', label: 'RDV fait', color: '#059669' },
  { key: 'en_attente_signature', label: 'En attente signature', color: '#f97316' },
  { key: 'signe', label: 'Signé', color: '#10b981' },
  { key: 'en_attente_paiement', label: 'En attente paiement', color: '#f59e0b' },
  { key: 'paye', label: 'Payé', color: '#10b981' },
]

function DealSidebar({ prospect }: { prospect: Prospect }) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { data: dbStatuses } = useCrmStatuses()
  const { connected: gcalConnected, createEvent: gcalCreateEvent, deleteEvent: gcalDeleteEvent, listEvents: gcalListEvents } = useGoogleCalendar()

  // Google Meet link — cherche dans les events Calendar autour du rdv_date
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  const { data: meetLink } = useQuery({
    queryKey: ['meet-link', prospect.id, prospect.rdv_date],
    queryFn: async () => {
      if (!prospect.rdv_date) return null
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null
      const rdvDate = new Date(prospect.rdv_date)
      const timeMin = new Date(rdvDate.getTime() - 30 * 60 * 1000).toISOString()
      const timeMax = new Date(rdvDate.getTime() + 30 * 60 * 1000).toISOString()
      const params = new URLSearchParams({ action: 'list', timeMin, timeMax })
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) return null
        const data = await res.json()
        const events = data.items || data.events || []
        const prospectName = (prospect.name || '').toLowerCase()
        for (const ev of events) {
          const link = ev.hangoutLink || ev.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri
          if (!link) continue
          const summary = (ev.summary || '').toLowerCase()
          if (prospectName && summary.includes(prospectName.split(' ')[0])) return link
          return link
        }
        return null
      } catch { return null }
    },
    enabled: !!prospect.rdv_date,
    staleTime: 60_000,
  })
  const stages = dbStatuses && dbStatuses.length > 0
    ? dbStatuses.map(s => ({ key: s.key, label: s.label, color: s.color }))
    : FALLBACK_STAGES
  const [localStatus, setLocalStatus] = useState(prospect.crm_status)
  const [localSnoozed, setLocalSnoozed] = useState(prospect.snoozed_until)
  // Sync quand le prop change (re-fetch)
  useEffect(() => { setLocalStatus(prospect.crm_status) }, [prospect.crm_status])
  useEffect(() => { setLocalSnoozed(prospect.snoozed_until) }, [prospect.snoozed_until])

  const currentStage = stages.findIndex(s => s.key === localStatus)
  const hasReminder = localSnoozed && new Date(localSnoozed) > new Date()
  const reminderDate = localSnoozed ? new Date(localSnoozed) : null
  const [settingReminder, setSettingReminder] = useState(false)
  const [reminderDays, setReminderDays] = useState('7')
  const [reminderMotif, setReminderMotif] = useState<'rappel' | 'retour_demande' | 'rdv' | 'rdv_2' | 'rdv_3'>('rappel')
  const [inviteClient, setInviteClient] = useState(false)
  const [addMeetLink, setAddMeetLink] = useState(false)
  const [customReminderDate, setCustomReminderDate] = useState('')
  const [conflictEvents, setConflictEvents] = useState<Array<{ summary: string; time: string }>>([])
  // Slots disponibles du jour sélectionné (pour le picker visuel)
  const [busySlots, setBusySlots] = useState<Array<{ start: number; end: number }>>([])
  const [showRdvPicker, setShowRdvPicker] = useState(false)
  const [rdvDate, setRdvDate] = useState('')
  const [rdvTime, setRdvTime] = useState('10:00')

  const updateStatus = async (status: string) => {
    // RDV pris → ouvrir le picker date/heure
    if (status === 'rdv_pris') {
      setShowRdvPicker(true)
      return
    }
    setLocalStatus(status as any)
    const updateData: Record<string, unknown> = { crm_status: status }
    if (status === 'en_attente_signature') {
      const d = new Date(); d.setDate(d.getDate() + 7)
      updateData.snoozed_until = d.toISOString()
      setLocalSnoozed(d.toISOString())
    }
    if (status === 'en_attente_paiement') {
      const d = new Date(); d.setDate(d.getDate() + 7)
      updateData.snoozed_until = d.toISOString()
      setLocalSnoozed(d.toISOString())
    }
    if (status === 'signe' || status === 'paye') {
      updateData.snoozed_until = null
      updateData.meeting_booked = true
      setLocalSnoozed(null)
    }
    await supabase.from('prospects').update(updateData).eq('id', prospect.id)
    queryClient.invalidateQueries({ queryKey: ['prospects'] }); queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
    queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] })
    queryClient.invalidateQueries({ queryKey: ['rdv-today'] })
  }

  const confirmRdvPris = async () => {
    if (!rdvDate) return
    const dateTime = new Date(`${rdvDate}T${rdvTime}:00`)
    setLocalStatus('rdv_pris' as any)
    setShowRdvPicker(false)
    await supabase.from('prospects').update({
      crm_status: 'rdv_pris',
      meeting_booked: true,
      rdv_date: dateTime.toISOString(),
    }).eq('id', prospect.id)
    queryClient.invalidateQueries({ queryKey: ['prospects'] }); queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
    queryClient.invalidateQueries({ queryKey: ['rdv-today'] })
    queryClient.invalidateQueries({ queryKey: ['activity-logs'] })
  }

  const invalidateSnooze = async () => {
    // On utilise refetchQueries (pas invalidateQueries) pour que l'UI
    // attende les donnees fraiches avant de rendre le nouveau state. Sans
    // ca, apres save, le prop `prospect` reste sur l'ancienne valeur le
    // temps du refetch → l'UI reste sur l'ancien state, obligeant l'user
    // a fermer/rouvrir le modal pour voir la mise a jour.
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['prospects'] }),
      queryClient.refetchQueries({ queryKey: ['all-prospects'] }),
      queryClient.refetchQueries({ queryKey: ['rdv-upcoming'] }),
      queryClient.refetchQueries({ queryKey: ['reminders-calendar'] }),
      queryClient.refetchQueries({ queryKey: ['rdv-today'] }),
    ])
  }

  // Fetch les events Google de la journée sélectionnée → busy slots + conflits
  useEffect(() => {
    const isRdvMotif = reminderMotif === 'rdv' || reminderMotif === 'rdv_2' || reminderMotif === 'rdv_3'
    if (!settingReminder || !isRdvMotif || !customReminderDate || !gcalConnected) {
      setConflictEvents([])
      setBusySlots([])
      return
    }
    let alive = true
    const dayStart = new Date(`${customReminderDate}T00:00:00`)
    const dayEnd = new Date(`${customReminderDate}T23:59:59`)
    const t = setTimeout(async () => {
      const list = await gcalListEvents(dayStart.toISOString(), dayEnd.toISOString())
      if (!alive) return
      const events = (list?.items || []) as Array<{ id?: string; summary?: string; start?: { dateTime?: string }; end?: { dateTime?: string }; transparency?: string }>
      const busy = events
        .filter(ev => ev.transparency !== 'transparent' && ev.start?.dateTime && ev.end?.dateTime)
        .map(ev => ({ start: new Date(ev.start!.dateTime!).getTime(), end: new Date(ev.end!.dateTime!).getTime() }))
      setBusySlots(busy)
      // Conflits = busy qui chevauche le slot choisi (rdvTime, +30min)
      const dt = new Date(`${customReminderDate}T${rdvTime}:00`)
      const slotEnd = new Date(dt.getTime() + 30 * 60 * 1000)
      const conflicts = events.filter(ev => {
        if (ev.transparency === 'transparent') return false
        if (!ev.start?.dateTime || !ev.end?.dateTime) return false
        const evStart = new Date(ev.start.dateTime).getTime()
        const evEnd = new Date(ev.end.dateTime).getTime()
        return evStart < slotEnd.getTime() && evEnd > dt.getTime()
      }).map(ev => ({
        summary: ev.summary || '(sans titre)',
        time: `${new Date(ev.start!.dateTime!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}–${new Date(ev.end!.dateTime!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
      }))
      setConflictEvents(conflicts)
    }, 400)
    return () => { alive = false; clearTimeout(t) }
  }, [settingReminder, reminderMotif, customReminderDate, rdvTime, gcalConnected, gcalListEvents])

  const motifLabel: Record<string, string> = {
    rappel: 'Rappel',
    retour_demande: 'Retour sur demande',
    rdv: 'RDV',
    rdv_2: 'RDV n°2',
    rdv_3: 'RDV n°3',
  }

  const saveTask = async () => {
    if (!customReminderDate) return
    const isRdv = reminderMotif === 'rdv' || reminderMotif === 'rdv_2' || reminderMotif === 'rdv_3'
    const datetime = isRdv ? new Date(`${customReminderDate}T${rdvTime}:00`) : new Date(customReminderDate)
    const update: Record<string, unknown> = { next_action_type: reminderMotif, next_action_invited_client: inviteClient }
    if (isRdv) {
      update.rdv_date = datetime.toISOString()
      update.meeting_booked = true
      update.crm_status = 'rdv_pris'
      update.snoozed_until = null
      setLocalStatus('rdv_pris' as any)
      setLocalSnoozed(null)
    } else {
      update.snoozed_until = datetime.toISOString()
      update.crm_status = 'callback'
      setLocalStatus('callback' as any)
      setLocalSnoozed(datetime.toISOString())
    }

    // Sync Google Calendar — créer l'event AVANT l'UPDATE pour stocker l'event_id
    let gcalEventId: string | null = null
    if (gcalConnected) {
      const endTime = new Date(datetime.getTime() + (isRdv ? 30 : 15) * 60 * 1000)
      const phoneInfo = prospect.phone ? `\nTéléphone : ${prospect.phone}` : ''
      const emailInfo = prospect.email ? `\nEmail : ${prospect.email}` : ''
      const companyInfo = prospect.company ? `\nSociété : ${prospect.company}` : ''
      const eventBody: Record<string, unknown> = {
        summary: `${motifLabel[reminderMotif]} — ${prospect.name}`,
        description: `${motifLabel[reminderMotif]} planifié depuis Calsyn.${phoneInfo}${emailInfo}${companyInfo}`,
        start: { dateTime: datetime.toISOString() },
        end: { dateTime: endTime.toISOString() },
        transparency: 'opaque',
        status: 'confirmed',
        colorId: isRdv ? '10' : '5',
      }
      if (inviteClient && prospect.email) {
        // Mode invitation : ajoute le prospect en attendee, Google envoie l'invite par email
        eventBody.attendees = [{ email: prospect.email, displayName: prospect.name }]
        eventBody.guestsCanModify = false
        eventBody.guestsCanInviteOthers = false
      }
      if (addMeetLink && isRdv) {
        // Génère un Google Meet automatiquement (requestId unique)
        eventBody.conferenceData = {
          createRequest: {
            requestId: `calsyn-${prospect.id}-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        }
      }
      try {
        const ev = await gcalCreateEvent(eventBody, inviteClient ? 'all' : 'none')
        if (ev?.id) gcalEventId = ev.id
      } catch (err) {
        console.warn('[saveTask] GCal create failed', err)
      }
    }
    if (gcalEventId) update.next_action_gcal_event_id = gcalEventId

    await supabase.from('prospects').update(update).eq('id', prospect.id)
    await supabase.from('activity_logs').insert({
      prospect_id: prospect.id,
      action: isRdv ? 'rdv_planned' : 'snoozed',
      details: `${motifLabel[reminderMotif]} programmé(e) le ${datetime.toLocaleDateString('fr-FR')}${isRdv ? ` à ${datetime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}${inviteClient ? ' (invitation envoyée au client)' : ''}`,
    })

    await invalidateSnooze()
    queryClient.invalidateQueries({ queryKey: ['rdv-upcoming-bar'] })
    queryClient.invalidateQueries({ queryKey: ['rdv-upcoming'] })
    queryClient.invalidateQueries({ queryKey: ['rdv-calendar'] })
    queryClient.invalidateQueries({ queryKey: ['gcal-events'] })
    setSettingReminder(false)
    setCustomReminderDate('')
    setReminderMotif('rappel')
    setInviteClient(false)
    setAddMeetLink(false)
  }

  const clearReminder = async () => {
    setLocalSnoozed(null)
    await supabase.from('prospects').update({ snoozed_until: null }).eq('id', prospect.id)
    await supabase.from('activity_logs').insert({ prospect_id: prospect.id, action: 'snooze_removed', details: 'Rappel supprimé' })
    await invalidateSnooze()
  }

  // Annule la tâche courante : supprime l'event Google + nettoie la fiche
  const cancelTask = async (kind: 'rdv' | 'reminder') => {
    if (!confirm(kind === 'rdv' ? 'Annuler ce RDV ? L\'invitation Google sera supprimée pour vous et le client.' : 'Supprimer ce rappel ?')) return
    const eventId = (prospect as Prospect & { next_action_gcal_event_id?: string }).next_action_gcal_event_id
    const wasInvited = (prospect as Prospect & { next_action_invited_client?: boolean }).next_action_invited_client
    // Delete Google event : utilise event_id stocké, sinon fallback recherche par date+nom
    if (gcalConnected) {
      let idToDelete = eventId
      let notifyClient = wasInvited
      if (!idToDelete && kind === 'rdv' && prospect.rdv_date) {
        const datetime = new Date(prospect.rdv_date)
        const timeMin = new Date(datetime.getTime() - 60 * 60 * 1000).toISOString()
        const timeMax = new Date(datetime.getTime() + 60 * 60 * 1000).toISOString()
        try {
          const list = await gcalListEvents(timeMin, timeMax)
          const events = list?.items || []
          const nameLower = (prospect.name || '').toLowerCase()
          const emails = [prospect.email, prospect.email2, prospect.email3].filter(Boolean).map(e => e!.toLowerCase())
          const match = events.find((e: { id: string; summary?: string; attendees?: Array<{ email?: string }> }) => {
            if (nameLower && e.summary?.toLowerCase().includes(nameLower)) return true
            if (e.attendees?.some(a => a.email && emails.includes(a.email.toLowerCase()))) return true
            return false
          })
          if (match?.id) {
            idToDelete = match.id
            notifyClient = !!match.attendees?.length
          }
        } catch (err) {
          console.warn('[cancelTask] GCal search fallback failed', err)
        }
      }
      if (idToDelete) {
        await gcalDeleteEvent(idToDelete, notifyClient ? 'all' : 'none').catch(err => console.warn('[cancelTask] GCal delete failed', err))
      }
    }
    const update: Record<string, unknown> = {
      next_action_type: null,
      next_action_gcal_event_id: null,
      next_action_invited_client: false,
    }
    if (kind === 'rdv') {
      update.rdv_date = null
      update.meeting_booked = false
    } else {
      update.snoozed_until = null
      setLocalSnoozed(null)
    }
    await supabase.from('prospects').update(update).eq('id', prospect.id)
    await supabase.from('activity_logs').insert({
      prospect_id: prospect.id,
      action: kind === 'rdv' ? 'rdv_cancelled' : 'snooze_removed',
      details: kind === 'rdv' ? `RDV annulé${wasInvited ? ' (notification envoyée au client)' : ''}` : 'Rappel supprimé',
    })
    await invalidateSnooze()
    queryClient.invalidateQueries({ queryKey: ['rdv-upcoming-bar'] })
    queryClient.invalidateQueries({ queryKey: ['rdv-upcoming'] })
    queryClient.invalidateQueries({ queryKey: ['rdv-calendar'] })
  }

  return (
    <div className="w-[240px] min-w-[200px] flex-shrink-0 border-l border-gray-100 dark:border-[#d4cade] p-4 flex flex-col gap-4 overflow-y-auto bg-gradient-to-b from-violet-50/60 to-gray-50/30">
      {/* Pipeline visuel */}
      <div className="bg-white/60 rounded-xl p-3">
        <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-2">Pipeline</p>
        <div className="space-y-1">
          {stages.map((stage, i) => {
            const isActive = stage.key === localStatus
            const isPast = i < currentStage
            return (
              <button key={stage.key} onClick={() => updateStatus(stage.key)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${
                  isActive ? 'bg-white shadow-sm border border-gray-200 font-semibold' : 'hover:bg-white/60'
                }`}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all ${isActive ? 'ring-2 ring-offset-1' : ''}`}
                  style={{ backgroundColor: stage.color, ringColor: stage.color }} />
                <span className={isPast || isActive ? 'text-gray-800' : 'text-gray-400'}>{stage.label}</span>
                {isActive && <span className="ml-auto text-[9px] text-indigo-500 font-bold">actif</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Modale RDV date/heure */}
      {showRdvPicker && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 animate-fade-in">
          <p className="text-[11px] font-bold text-teal-700 mb-2">Planifier le RDV</p>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-gray-500 uppercase">Date</label>
              <input type="date" value={rdvDate} onChange={e => setRdvDate(e.target.value)}
                className="block w-full mt-0.5 text-[12px] border border-teal-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400 bg-white" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase">Heure</label>
              <input type="time" value={rdvTime} onChange={e => setRdvTime(e.target.value)}
                className="block w-full mt-0.5 text-[12px] border border-teal-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400 bg-white" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={confirmRdvPris} disabled={!rdvDate}
                className="flex-1 py-1.5 text-[11px] font-semibold text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-40 rounded-lg transition-colors">
                Confirmer RDV
              </button>
              <button onClick={() => setShowRdvPicker(false)}
                className="px-3 py-1.5 text-[11px] text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RDV programmé */}
      {prospect.rdv_date && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 relative">
          <button onClick={() => cancelTask('rdv')} title="Annuler le RDV"
            className="absolute top-1 right-1 w-5 h-5 rounded text-teal-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="flex items-center gap-1.5 mb-0.5 pr-5">
            <svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="text-[12px] font-semibold text-teal-700">
              {new Date(prospect.rdv_date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
              {' à '}
              {new Date(prospect.rdv_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {new Date(prospect.rdv_date) < new Date() && localStatus !== 'rdv_fait' && (
            <p className="text-[10px] text-amber-600 font-medium mt-0.5">RDV passé — à statuer</p>
          )}
          {meetLink && (
            <a
              href={meetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z" fill="#1a73e8"/>
                <rect x="3" y="6" width="12" height="12" rx="2" fill="#1a73e8"/>
              </svg>
              <span className="text-[11px] font-semibold text-blue-700">Rejoindre le Meet</span>
            </a>
          )}
        </div>
      )}

      {/* Tâches — programmer un rappel / RDV / retour demande */}
      <div className="border-t border-gray-200 pt-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tâches</p>
        {hasReminder && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
            <div className="flex items-center gap-1.5 mb-1">
              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-[12px] font-semibold text-amber-700">
                {reminderDate!.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <p className="text-[10px] text-amber-600 mb-1.5">Dans {Math.ceil((reminderDate!.getTime() - Date.now()) / 86400000)} jour(s)</p>
            <button onClick={clearReminder} className="text-[10px] text-amber-500 hover:text-amber-700 font-medium">Supprimer le rappel</button>
          </div>
        )}
        {settingReminder ? (
          <div className="space-y-1.5 bg-amber-50/40 border border-amber-200 rounded-lg p-2 max-w-full overflow-hidden">
            <select value={reminderMotif} onChange={e => setReminderMotif(e.target.value as typeof reminderMotif)}
              className="w-full min-w-0 text-[12px] border border-amber-200 rounded-lg px-2 py-1.5 outline-none bg-white">
              <option value="rappel">📞 Rappel</option>
              <option value="retour_demande">🔄 Retour sur demande</option>
              <option value="rdv">📅 RDV</option>
              <option value="rdv_2">📅 RDV n°2</option>
              <option value="rdv_3">📅 RDV n°3</option>
            </select>
            <input type="date" value={customReminderDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setCustomReminderDate(e.target.value)}
              className="w-full min-w-0 text-[12px] border border-amber-200 rounded-lg px-2 py-1.5 outline-none bg-white" />
            {(reminderMotif === 'rdv' || reminderMotif === 'rdv_2' || reminderMotif === 'rdv_3') && (
              <>
                <input type="time" value={rdvTime} onChange={e => setRdvTime(e.target.value)}
                  className="w-full min-w-0 text-[12px] border border-amber-200 rounded-lg px-2 py-1.5 outline-none bg-white" />
                {/* Picker de créneaux dispo (config Settings : périodes par jour) */}
                {customReminderDate && gcalConnected && (() => {
                  const dur = profile?.slot_duration_min || 30
                  const buf = profile?.slot_buffer_min || 0
                  const step = dur + buf
                  const parseHM = (s: string) => {
                    const m = s.match(/^(\d{1,2}):(\d{2})/)
                    return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0
                  }
                  // Récupère les périodes du jour de la semaine sélectionné
                  const dayOfWeek = new Date(`${customReminderDate}T12:00:00`).getDay() // 0=dim..6=sam
                  const schedule = (profile?.availability_schedule as Record<string, Array<{ start: string; end: string }>> | null) || {}
                  let periods = schedule[String(dayOfWeek)]
                  // Fallback : si pas de schedule du tout, défaut Lun-Ven 9h-18h
                  if (!profile?.availability_schedule) {
                    if (dayOfWeek >= 1 && dayOfWeek <= 5) periods = [{ start: '09:00', end: '18:00' }]
                  }
                  const slots: Array<{ time: string; busy: boolean }> = []
                  for (const p of (periods || [])) {
                    const startMin = parseHM(p.start)
                    const endMin = parseHM(p.end)
                    for (let cur = startMin; cur + dur <= endMin; cur += step) {
                      const h = Math.floor(cur / 60), m = cur % 60
                      const slotStart = new Date(`${customReminderDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime()
                      const slotEnd = slotStart + dur * 60 * 1000
                      const busy = busySlots.some(b => b.start < slotEnd && b.end > slotStart)
                      slots.push({ time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, busy })
                    }
                  }
                  return (
                    <div className="bg-white border border-amber-200 rounded-lg p-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Créneaux du jour</p>
                      {slots.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic text-center py-2">Indisponible ce jour (cf. Settings → Disponibilités RDV)</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-4 gap-1 max-h-[160px] overflow-y-auto">
                            {slots.map(s => {
                              const selected = rdvTime === s.time
                              return (
                                <button key={s.time} type="button"
                                  disabled={s.busy}
                                  onClick={() => setRdvTime(s.time)}
                                  title={s.busy ? 'Occupé' : 'Disponible'}
                                  className={`text-[11px] font-mono py-1 rounded transition-colors ${
                                    selected ? 'bg-amber-500 text-white font-bold' :
                                    s.busy ? 'bg-gray-100 text-gray-300 line-through cursor-not-allowed' :
                                    'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                  }`}>
                                  {s.time}
                                </button>
                              )
                            })}
                          </div>
                          <p className="text-[9px] text-gray-400 mt-1">Vert = libre · Gris = occupé</p>
                        </>
                      )}
                    </div>
                  )
                })()}
                {/* Inviter le client : ajoute le prospect en attendee Google + envoie l'invite par email */}
                <label className={`flex items-start gap-2 px-2 py-1.5 text-[11px] rounded-lg border ${prospect.email ? 'border-amber-200 bg-white cursor-pointer' : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'}`}>
                  <input type="checkbox" checked={inviteClient && !!prospect.email}
                    disabled={!prospect.email}
                    onChange={e => setInviteClient(e.target.checked)}
                    className="w-3.5 h-3.5 mt-0.5 rounded border-gray-300 accent-amber-600" />
                  <span className="flex-1 leading-tight">
                    Inviter le client par email
                    {!prospect.email && <span className="block text-[10px] text-gray-400">(pas d'email)</span>}
                    {prospect.email && <span className="block text-[10px] text-gray-400 truncate">{prospect.email}</span>}
                  </span>
                </label>
                {/* Ajouter un lien Meet : génère un Google Meet auto attaché à l'event */}
                <label className="flex items-start gap-2 px-2 py-1.5 text-[11px] rounded-lg border border-amber-200 bg-white cursor-pointer">
                  <input type="checkbox" checked={addMeetLink}
                    onChange={e => setAddMeetLink(e.target.checked)}
                    className="w-3.5 h-3.5 mt-0.5 rounded border-gray-300 accent-amber-600" />
                  <span className="flex-1 leading-tight">
                    Ajouter un lien Meet
                    <span className="block text-[10px] text-gray-400">{addMeetLink ? 'Visio Google Meet' : 'Par téléphone'}</span>
                  </span>
                </label>
                {/* Warning conflit agenda */}
                {conflictEvents.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                    <p className="text-[11px] font-semibold text-red-700 flex items-center gap-1 mb-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                      Conflit agenda
                    </p>
                    <ul className="space-y-0.5 ml-1">
                      {conflictEvents.slice(0, 3).map((c, i) => (
                        <li key={i} className="text-[10px] text-red-600 truncate">
                          <span className="font-mono">{c.time}</span> · {c.summary}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-1.5">
              <button onClick={saveTask} disabled={!customReminderDate}
                className="flex-1 px-2.5 py-1.5 bg-amber-500 text-white text-[11px] rounded-lg hover:bg-amber-600 font-medium disabled:opacity-40">OK</button>
              <button onClick={() => { setSettingReminder(false); setCustomReminderDate('') }}
                className="px-2.5 py-1.5 text-gray-500 bg-gray-100 hover:bg-gray-200 text-[11px] rounded-lg">Annuler</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setSettingReminder(true)}
            className="flex items-center gap-1.5 text-[12px] text-amber-500 hover:text-amber-700 font-medium">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Programmer une tâche
          </button>
        )}
      </div>

      {/* Infos deal */}
      <div className="border-t border-gray-200 pt-3">
        <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-2">Résumé</p>
        <div className="space-y-2">
          <div className="flex justify-between text-[12px]">
            <span className="text-gray-400">Appels</span>
            <span className="text-gray-700 font-medium">{prospect.call_count}</span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-gray-400">Dernier appel</span>
            <span className="text-gray-700 font-medium">
              {prospect.last_call_at ? new Date(prospect.last_call_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '-'}
            </span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-gray-400">RDV pris</span>
            <span className={`font-medium ${prospect.meeting_booked ? 'text-emerald-600' : 'text-gray-400'}`}>
              {prospect.meeting_booked ? 'Oui' : 'Non'}
            </span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-gray-400">Ne pas appeler</span>
            <span className={`font-medium ${prospect.do_not_call ? 'text-red-500' : 'text-gray-400'}`}>
              {prospect.do_not_call ? 'Oui' : 'Non'}
            </span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-gray-400">Créé le</span>
            <span className="text-gray-700 font-medium">
              {new Date(prospect.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Automatisations (à venir) */}
      <div className="border-t border-gray-200 pt-3 mt-auto">
        <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-2">Automatisations</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-gray-300 rounded-lg">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Envoyer mail brochure
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-gray-300 rounded-lg">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Envoyer SMS confirmation
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-gray-300 rounded-lg">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Créer événement calendrier
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-gray-300 rounded-lg">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            Envoyer lien d'inscription
          </div>
          <p className="text-[9px] text-gray-300 text-center mt-1">Bientôt disponible</p>
        </div>
      </div>
    </div>
  )
}

// ── Champs personnalisés dans la fiche prospect (HubSpot-style) ──
function ExpandableText({ text, limit = 150 }: { text: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false)
  if (text.length <= limit) return <p className="text-[13px] text-gray-700 whitespace-pre-wrap">{text}</p>
  return (
    <div>
      <p className="text-[13px] text-gray-700 whitespace-pre-wrap">{expanded ? text : text.slice(0, limit) + '...'}</p>
      <button onClick={() => setExpanded(!expanded)}
        className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium mt-0.5">
        {expanded ? 'Voir moins' : 'Voir plus'}
      </button>
    </div>
  )
}

function CustomFieldsSection({ prospectId, prospect }: { prospectId: string; prospect: Prospect }) {
  const { properties } = usePropertyDefinitions()
  const { data: customValues } = useProspectCustomValues(prospectId)
  const queryClient = useQueryClient()

  const customProps = properties.filter(p => p.type === 'custom')
  const propsWithValues = customProps.filter(p => customValues?.[p.id])

  if (propsWithValues.length === 0) return null

  return (
    <div className="pt-3 border-t border-gray-100 mt-3">
      <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-2">Champs personnalisés</p>
      {propsWithValues.map(prop => {
        const val = getPropertyValue(prospect, customValues, prop)
        const isUrl = prop.fieldType === 'url' || val.startsWith('http://') || val.startsWith('https://')
        return (
          <div key={prop.id} className="mb-2.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{prop.name}</p>
            {isUrl && val ? (
              <a href={val.startsWith('http') ? val : `https://${val}`} target="_blank" rel="noopener noreferrer"
                className="text-[13px] text-indigo-500 hover:text-indigo-700 underline truncate block">{val.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>
            ) : (
              <ExpandableText text={val} />
            )}
          </div>
        )
      })}
    </div>
  )
}
