/**
 * ProspectModal — Copie Minari pixel-perfect.
 * Sources : Jonathan DIAS (WhatsApp), frame 040 (John Doe post-call), frame 020 (pendant appel).
 *
 * Colonne gauche : infos prospect, bouton Call/Enable, champs éditables
 * Colonne droite : tabs, fiches appels accordéon (réduit/agrandi), player, transcription, AI summary
 */

import { useState, useRef, useEffect } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { usePropertyDefinitions, useProspectCustomValues, groupProperties, updatePropertyValue, useCrmStatuses } from '@/hooks/useProperties'
import { getPropertyValue } from '@/config/properties'
import SocialLinks, { PlatformIcon } from './SocialLinks'
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
  // meeting_booked + connected = "RDV pris" (teal, Minari exact)
  if (meeting && (outcome === 'connected' || outcome === 'meeting_booked' || outcome === 'rdv_pris' || !outcome)) {
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
  }
  const label = DISPOSITIONS.find(d => d.value === outcome)?.label || outcome || 'Pas de réponse'
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${map[outcome || ''] || 'bg-gray-100 text-gray-500'}`}>{label}</span>
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
        {/* Barre de progression cliquable — zone élargie pour le clic */}
        <div className="flex-1 py-2 cursor-pointer"
          onClick={e => {
            if (!audioRef.current || !duration) return
            const bar = e.currentTarget.firstElementChild as HTMLElement
            if (!bar) return
            const rect = bar.getBoundingClientRect()
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            audioRef.current.currentTime = pct * duration
          }}>
          <div className="h-2 bg-gray-200 rounded-full relative overflow-hidden">
            <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} />
          </div>
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
              <MiniDropdown value={call.call_outcome || 'no_answer'} options={DISPOSITIONS}
                onChange={async newOutcome => {
                  await supabase.from('calls').update({ call_outcome: newOutcome }).eq('id', call.id)
                  if (call.prospect_id) {
                    const { data: allCalls } = await supabase.from('calls').select('call_outcome').eq('prospect_id', call.prospect_id)
                    const priority: Record<string, number> = { connected: 100, callback: 60, not_interested: 50, voicemail: 40, busy: 35, no_answer: 30, cancelled: 20, failed: 10, wrong_number: 5 }
                    let best = newOutcome, bestP = priority[newOutcome] || 0
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
                  if (checked && call.call_outcome !== 'connected') {
                    updates.call_outcome = 'connected' // meeting implique connected
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
          {call.recording_url && <AudioPlayer url={proxyRecordingUrl(call.recording_url!)} date={call.created_at} prospectName={call.prospect_name || undefined} />}

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
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-violet-100 text-violet-600 uppercase">Callio+</span>
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

  // Téléphones supplémentaires : afficher seulement si remplis ou si l'utilisateur clique "Ajouter"
  const nextEmptyPhone = !prospect.phone2 ? 2 : !prospect.phone3 ? 3 : !prospect.phone4 ? 4 : !prospect.phone5 ? 5 : 6
  const [showExtraPhone, setShowExtraPhone] = useState(0)

  const callsDisabled = localDoNotCall
  const isSnoozed = localSnoozedUntil && new Date(localSnoozedUntil) > new Date()

  // Liste(s) du prospect
  const { data: prospectLists } = useQuery({
    queryKey: ['prospect-lists-for', prospect.id, prospect.phone],
    queryFn: async () => {
      // Chercher toutes les listes qui contiennent ce prospect (par phone pour cross-listes)
      const { data: allMatches } = await supabase
        .from('prospects')
        .select('list_id')
        .eq('phone', prospect.phone)
      if (!allMatches?.length) return []
      const listIds = [...new Set(allMatches.map(m => m.list_id))]
      const { data: lists } = await supabase
        .from('prospect_lists')
        .select('id, name')
        .in('id', listIds)
      return lists || []
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

            {/* Badges listes */}
            {prospectLists && prospectLists.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {prospectLists.map((l: { id: string; name: string }) => (
                  <span key={l.id} className="text-[9px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium truncate max-w-[140px]">
                    {l.name}
                  </span>
                ))}
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

            {/* Champs éditables — sections avec fond violet doux */}
            <div className="space-y-3 flex-1">
              {/* ── Contact ── */}
              <div className="bg-violet-50/50 rounded-xl p-3 space-y-2">
                <EditableField label="Email" value={prospect.email || ''} prospectId={prospect.id} field="email" copyable />
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Statut appel</span>
                  <div className="mt-1">
                    <MiniDropdown value={localCallOutcome} options={CALL_STATUS_OPTIONS}
                      onChange={async v => {
                        setLocalCallOutcome(v)
                        await supabase.from('prospects').update({ last_call_outcome: v }).eq('id', prospect.id)
                        queryClient.invalidateQueries({ queryKey: ['prospects'] })
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
                <CallCard key={c.id} call={c} defaultOpen={i === 0 && !isInCall && !isDisconnected} onUpdate={() => { queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] }); queryClient.invalidateQueries({ queryKey: ['prospects'] }) }} onCelebrate={() => { setShowCelebration(true); setTimeout(() => setShowCelebration(false), 2500) }} />
              ))}

              {/* Vide */}
              {!isInCall && !isDisconnected && callHistory.length === 0 && (
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
                    <CallCard key={c.id} call={c} defaultOpen={false} onUpdate={() => { queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] }); queryClient.invalidateQueries({ queryKey: ['prospects'] }) }} onCelebrate={() => { setShowCelebration(true); setTimeout(() => setShowCelebration(false), 2500) }} />
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

              {/* ── Onglet Historique ── */}
              {activeTab === 'historique' && (
                <div>
                  {activityLogs && activityLogs.length > 0 ? (
                    <div className="space-y-1">
                      {activityLogs.map((log: { id: string; action: string; details: string; created_at: string }) => (
                        <div key={log.id} className="flex items-start gap-2 text-[12px] py-2 border-b border-gray-50">
                          <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <div className="flex-1">
                            <p className="text-gray-600">{log.details}</p>
                            <p className="text-[10px] text-gray-300 mt-0.5">{formatDate(log.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-gray-400 text-center py-10">Aucune modification enregistrée</p>
                  )}
                </div>
              )}
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
  const { data: dbStatuses } = useCrmStatuses()
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
    queryClient.invalidateQueries({ queryKey: ['prospects'] })
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
    queryClient.invalidateQueries({ queryKey: ['prospects'] })
    queryClient.invalidateQueries({ queryKey: ['rdv-today'] })
    queryClient.invalidateQueries({ queryKey: ['activity-logs'] })
  }

  const setReminder = async () => {
    const d = new Date(); d.setDate(d.getDate() + parseInt(reminderDays))
    setLocalSnoozed(d.toISOString())
    await supabase.from('prospects').update({ snoozed_until: d.toISOString() }).eq('id', prospect.id)
    queryClient.invalidateQueries({ queryKey: ['prospects'] })
    setSettingReminder(false)
  }

  const clearReminder = async () => {
    setLocalSnoozed(null)
    await supabase.from('prospects').update({ snoozed_until: null }).eq('id', prospect.id)
    queryClient.invalidateQueries({ queryKey: ['prospects'] })
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
        <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5 mb-0.5">
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
        </div>
      )}

      {/* Rappel */}
      <div className="border-t border-gray-200 pt-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Rappel</p>
        {hasReminder ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-[12px] font-semibold text-amber-700">
                {reminderDate!.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <p className="text-[10px] text-amber-600 mb-1.5">
              Dans {Math.ceil((reminderDate!.getTime() - Date.now()) / 86400000)} jour(s)
            </p>
            <button onClick={clearReminder} className="text-[10px] text-amber-500 hover:text-amber-700 font-medium">
              Supprimer le rappel
            </button>
          </div>
        ) : settingReminder ? (
          <div className="flex items-center gap-2">
            <select value={reminderDays} onChange={e => setReminderDays(e.target.value)}
              className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none flex-1">
              <option value="1">Demain</option>
              <option value="3">Dans 3 jours</option>
              <option value="7">Dans 7 jours</option>
              <option value="14">Dans 14 jours</option>
              <option value="30">Dans 30 jours</option>
            </select>
            <button onClick={setReminder} className="px-2.5 py-1.5 bg-amber-500 text-white text-[11px] rounded-lg hover:bg-amber-600 font-medium">OK</button>
            <button onClick={() => setSettingReminder(false)} className="text-gray-400 hover:text-gray-600 text-[11px]">x</button>
          </div>
        ) : (
          <button onClick={() => setSettingReminder(true)}
            className="flex items-center gap-1.5 text-[12px] text-amber-500 hover:text-amber-700 font-medium">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Programmer un rappel
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
