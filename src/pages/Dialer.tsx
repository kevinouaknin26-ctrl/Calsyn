/**
 * Dialer — Copie pixel-perfect de Minari (frames 001, 002, 012).
 * Fond vert menthe, table dans cadre blanc arrondi, tabs chips,
 * Call Settings dropdown, badges pill, icones LinkedIn/copier dans rows.
 */

import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useCallMachine } from '@/hooks/useCallMachine'
import { useProspectLists, useProspects, useAddProspect } from '@/hooks/useProspects'
import { useCallsByProspect } from '@/hooks/useCalls'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/config/supabase'
import CSVImport from '@/components/import/CSVImport'
import { PlatformIcon } from '@/components/call/SocialLinks'
import SelectListPage from '@/components/dialer/SelectListPage'
import ProspectModal from '@/components/call/ProspectModal'
import { useRealtimeProspects } from '@/hooks/useRealtime'
import { useDialingSession } from '@/hooks/useDialingSession'
import type { Prospect } from '@/types/prospect'

// ── Call status badges (Minari exact) ──────────────────────────────
// CALL STATUS = statut de l'appel dans la SESSION. Set restreint :
// Pending, Connected, Attempted, Voicemail, Meeting booked
// + etats live pendant session : In-progress, Ringing
const CALL_STATUS_BADGE: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  // Avant l'appel
  pending:          { bg: '#f3f4f6', text: '#6b7280', label: 'En attente', icon: 'group' },
  // Contact decroche
  connected:        { bg: '#d1fae5', text: '#059669', label: 'Connecté', icon: 'phone' },
  meeting_booked:   { bg: '#ccfbf1', text: '#0d9488', label: 'RDV pris', icon: 'phone' },
  // Contact ne repond pas
  no_answer:        { bg: '#f3f4f6', text: '#6b7280', label: 'Pas de reponse', icon: 'phone' },
  voicemail:        { bg: '#f3f4f6', text: '#6b7280', label: 'Messagerie', icon: 'voicemail' },
  voicemail_left:   { bg: '#e0e7ff', text: '#4f46e5', label: 'Message depose', icon: 'voicemail' },
  // Lies a l'appel
  cancelled:        { bg: '#f3f4f6', text: '#6b7280', label: 'Annulé', icon: 'phone' },
  failed:           { bg: '#fecaca', text: '#dc2626', label: 'Échoué', icon: 'phone' },
  missed:           { bg: '#fef3c7', text: '#d97706', label: 'Manqué', icon: 'phone' },
  // Lies au numero
  wrong_number:     { bg: '#fecaca', text: '#dc2626', label: 'Mauvais numéro', icon: 'phone' },
  invalid_number:   { bg: '#fecaca', text: '#dc2626', label: 'Numéro invalide', icon: 'phone' },
  country_mismatch: { bg: '#fecaca', text: '#dc2626', label: 'Indicatif incompatible', icon: 'phone' },
  ios_filter:       { bg: '#fed7aa', text: '#ea580c', label: 'Filtre iOS', icon: 'phone' },
  // Gestion contacts
  snoozed:          { bg: '#e9d5ff', text: '#7c3aed', label: 'En pause', icon: 'group' },
  disabled:         { bg: '#fecaca', text: '#dc2626', label: 'Désactivé', icon: 'group' },
  max_call:         { bg: '#f3f4f6', text: '#6b7280', label: 'Max atteint', icon: 'phone' },
  // Live pendant session
  initiated:        { bg: '#fed7aa', text: '#ea580c', label: 'Initié', icon: 'phone' },
  ringing:          { bg: '#fef3c7', text: '#d97706', label: 'En sonnerie', icon: 'phone' },
  'in-progress':    { bg: '#d1fae5', text: '#059669', label: 'En cours', icon: 'phone' },
}

/** Mappe le last_call_outcome vers un badge CALL STATUS Minari */
function getCallStatusKey(prospect: Prospect): string {
  if (prospect.snoozed_until && new Date(prospect.snoozed_until) > new Date()) return 'snoozed'
  if (prospect.do_not_call) return 'disabled'
  if (prospect.call_count === 0) return 'pending'
  const o = prospect.last_call_outcome
  if (!o) return 'no_answer'
  // Mapping direct si le statut existe dans nos badges
  if (o in CALL_STATUS_BADGE) return o
  // Aliases
  if (o === 'rdv') return 'meeting_booked'
  if (o === 'busy') return 'no_answer'
  if (o === 'not_interested') return 'connected'
  if (o === 'callback') return 'connected'
  if (o === 'dnc') return 'disabled'
  return 'no_answer'
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
  if (mins < 1) return 'a l\'instant'
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  return `il y a ${days}j`
}

// ── Call Settings Dropdown (Minari frame 012 exact) ───────────────
/** Helper pour persister les call settings */
function useCallSetting<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const s = localStorage.getItem(`callio_cs_${key}`); return s ? JSON.parse(s) : defaultValue } catch { return defaultValue }
  })
  const set = (v: T) => { setVal(v); localStorage.setItem(`callio_cs_${key}`, JSON.stringify(v)) }
  return [val, set]
}

function CallSettingsDropdown({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [parallel, setParallel] = useCallSetting('parallel', 1)
  const [autoRotate, setAutoRotate] = useCallSetting('auto_rotate', true)
  const [voicemail, setVoicemail] = useCallSetting('voicemail', false)
  const [completeTask, setCompleteTask] = useCallSetting('complete_task', false)
  const [maxAttempts, setMaxAttempts] = useCallSetting('max_attempts', 'Illimité')
  const [attemptPeriod, setAttemptPeriod] = useCallSetting('attempt_period', 'jour')
  const [phoneField, setPhoneField] = useCallSetting('phone_field', 'phone')

  // From phone numbers (multi-numéros avec compteur)
  const [fromNumbers] = useState([
    { number: '+33 1 59 58 01 89', calls: 0 },
  ])
  const [selectedFromNumber, setSelectedFromNumber] = useCallSetting('from_number', '+33 1 59 58 01 89')

  // Voicemail drop — enregistrement message
  const [vmType, setVmType] = useCallSetting('vm_type', 'type1')
  const [vmRecording, setVmRecording] = useState(false)
  const [vmAudioUrl, setVmAudioUrl] = useState<string | null>(null)
  const vmRecorderRef = useRef<MediaRecorder | null>(null)
  const vmChunksRef = useRef<Blob[]>([])

  // Microphone — vrais périphériques audio
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedMic, setSelectedMic] = useCallSetting('mic_device', '')
  const [micTesting, setMicTesting] = useState(false)
  const [micAudioUrl, setMicAudioUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Charger les périphériques au mount
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      const mics = devices.filter(d => d.kind === 'audioinput')
      setMicDevices(mics)
      if (!selectedMic && mics.length > 0) setSelectedMic(mics[0].deviceId)
    }).catch(() => {})
  }, [open])

  // Toggle helper
  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!value)}
      className={`w-10 h-5 rounded-full relative transition-colors ${value ? 'bg-indigo-500' : 'bg-gray-300'}`}>
      <div className={`w-4 h-4 bg-white rounded-full shadow absolute top-0.5 transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )

  return (
    <div className="relative">
      <button onClick={onToggle} className="flex items-center gap-1.5 text-[13px] text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
        Paramètres d'appel
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-[440px] bg-white dark:bg-[#ede6f3] rounded-xl shadow-lg border border-gray-200 dark:border-[#d4cade] z-50 p-5 space-y-4 animate-slide-down">

          {/* Microphone (connecté — vrais périphériques + Test/Play) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] text-gray-700">Microphone</span>
              <select value={selectedMic} onChange={e => setSelectedMic(e.target.value)}
                className="text-[12px] text-gray-500 bg-transparent border border-gray-200 rounded-lg px-2 py-1 outline-none max-w-[200px] truncate">
                {micDevices.length > 0 ? micDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 8)}`}</option>
                )) : <option>Aucun microphone détecté</option>}
              </select>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={async () => {
                if (micTesting) {
                  mediaRecorderRef.current?.stop()
                  setMicTesting(false)
                  return
                }
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedMic ? { exact: selectedMic } : undefined } })
                  chunksRef.current = []
                  const recorder = new MediaRecorder(stream)
                  recorder.ondataavailable = e => chunksRef.current.push(e.data)
                  recorder.onstop = () => {
                    stream.getTracks().forEach(t => t.stop())
                    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
                    setMicAudioUrl(URL.createObjectURL(blob))
                  }
                  mediaRecorderRef.current = recorder
                  recorder.start()
                  setMicTesting(true)
                  setTimeout(() => { if (recorder.state === 'recording') { recorder.stop(); setMicTesting(false) } }, 5000)
                } catch { alert('Impossible d\'accéder au microphone') }
              }} className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${micTesting ? 'border-red-300 text-red-500 bg-red-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {micTesting ? '⏹ Arrêter' : '🎤 Test'}
              </button>
              <button onClick={() => { if (micAudioUrl) new Audio(micAudioUrl).play() }}
                disabled={!micAudioUrl}
                className="px-2.5 py-1 rounded-lg border border-gray-200 text-[11px] text-gray-500 hover:bg-gray-50 disabled:opacity-30">
                ▶ Play
              </button>
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Parallel calls (Minari exact — sélecteur avec checkmark) */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">Appels parallèles</span>
            <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setParallel(n)}
                  className={`w-7 h-6 text-[11px] font-medium border-r border-gray-200 last:border-r-0 flex items-center justify-center ${
                    parallel === n ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-500 hover:bg-gray-50'
                  }`}>
                  {n}{parallel === n ? ' ✓' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* From phone number (Minari — dropdown multi-numéros + compteur appels) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] text-gray-700">Numéro appelant</span>
              <select value={selectedFromNumber} onChange={e => setSelectedFromNumber(e.target.value)}
                className="text-[12px] text-gray-600 bg-transparent border border-gray-200 rounded-lg px-2 py-1 outline-none">
                {fromNumbers.map((num, i) => (
                  <option key={i} value={num.number}>{num.number} ({num.calls} appels)</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1 justify-end">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              <span className="text-[11px] text-gray-400">Actif</span>
            </div>
          </div>

          {/* Voicemail drop (Minari — message pré-enregistré + toggle) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] text-gray-700">Messagerie vocale</span>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                <Toggle value={voicemail} onChange={setVoicemail} />
              </div>
            </div>
            {voicemail && (
              <div className="bg-gray-50 rounded-lg p-2.5 space-y-2">
                <select value={vmType} onChange={e => setVmType(e.target.value)}
                  className="w-full text-[12px] text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1.5 outline-none">
                  <option value="type1">Message type 1</option>
                  <option value="type2">Message type 2</option>
                  <option value="custom">Message personnalisé</option>
                </select>
                <div className="flex items-center gap-2">
                  <button onClick={async () => {
                    if (vmRecording) {
                      vmRecorderRef.current?.stop()
                      setVmRecording(false)
                      return
                    }
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                      vmChunksRef.current = []
                      const recorder = new MediaRecorder(stream)
                      recorder.ondataavailable = e => vmChunksRef.current.push(e.data)
                      recorder.onstop = () => {
                        stream.getTracks().forEach(t => t.stop())
                        const blob = new Blob(vmChunksRef.current, { type: 'audio/webm' })
                        setVmAudioUrl(URL.createObjectURL(blob))
                      }
                      vmRecorderRef.current = recorder
                      recorder.start()
                      setVmRecording(true)
                      setTimeout(() => { if (recorder.state === 'recording') { recorder.stop(); setVmRecording(false) } }, 30000)
                    } catch { alert('Impossible d\'accéder au microphone') }
                  }} className={`px-2 py-1 rounded-lg border text-[11px] ${vmRecording ? 'border-red-300 text-red-500 bg-red-50' : 'border-gray-200 text-gray-500 hover:bg-white'}`}>
                    {vmRecording ? '⏹ Arrêter' : '🎤 Enregistrer'}
                  </button>
                  <button onClick={() => { if (vmAudioUrl) new Audio(vmAudioUrl).play() }}
                    disabled={!vmAudioUrl}
                    className="px-2 py-1 rounded-lg border border-gray-200 text-[11px] text-gray-500 hover:bg-white disabled:opacity-30">
                    ▶ Écouter
                  </button>
                  {vmAudioUrl && <span className="text-[10px] text-violet-500">✓ Enregistré</span>}
                </div>
              </div>
            )}
          </div>

          {/* Contact phone number field */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">Champ téléphone</span>
            <select value={phoneField} onChange={e => setPhoneField(e.target.value)}
              className="text-[12px] text-gray-600 bg-transparent border border-gray-200 rounded-lg px-2 py-1 outline-none">
              <option value="phone">Téléphone</option>
              <option value="phone2">Téléphone 2</option>
              <option value="phone3">Téléphone 3</option>
            </select>
          </div>

          {/* Complete task when contact dialed */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">Terminer la tâche au composé</span>
            <Toggle value={completeTask} onChange={setCompleteTask} />
          </div>

          {/* Auto-rotate */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">Rotation auto des numéros</span>
            <Toggle value={autoRotate} onChange={setAutoRotate} />
          </div>

          {/* Max call attempts */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-700">Tentatives d'appel max<br/><span className="text-gray-400">par contact</span></span>
            <div className="flex items-center gap-1.5">
              <select value={maxAttempts} onChange={e => setMaxAttempts(e.target.value)}
                className="text-[13px] text-gray-600 bg-transparent border border-gray-200 rounded-lg px-2 py-1 outline-none">
                <option>Illimité</option><option>1</option><option>2</option><option>3</option><option>5</option><option>10</option>
              </select>
              <span className="text-[13px] text-gray-400">par</span>
              <select value={attemptPeriod} onChange={e => setAttemptPeriod(e.target.value)}
                className="text-[13px] text-gray-600 bg-transparent border border-gray-200 rounded-lg px-2 py-1 outline-none">
                <option value="day">jour</option><option value="week">semaine</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Prospect Row (Minari exact : LinkedIn + contact icons) ────────
const ProspectRow = memo(function ProspectRow({ prospect, isActive, liveStatus, selected, socials, onToggleSelect, onSelect, onCall }: {
  prospect: Prospect; isActive: boolean; liveStatus?: string; selected: boolean; socials: Array<{ platform: string; url: string }>; onToggleSelect: (id: string) => void; onSelect: (p: Prospect) => void; onCall: (p: Prospect) => void
}) {
  // Pendant un appel actif, le badge montre le statut live (Initié/En sonnerie/En cours)
  const statusKey = liveStatus || getCallStatusKey(prospect)
  const st = CALL_STATUS_BADGE[statusKey] || CALL_STATUS_BADGE.pending

  // Fond de row pendant session d'appel (Minari : jaune/rouge pour initiated/ringing, vert pour in-progress)
  const rowBg = liveStatus === 'initiated' || liveStatus === 'ringing'
    ? 'bg-red-50/60'
    : liveStatus === 'in-progress'
      ? 'bg-violet-50/60'
      : isActive
        ? 'bg-violet-50/40'
        : 'hover:bg-gray-50/60'

  return (
    <tr className={`border-b border-gray-50 transition-all duration-300 ${rowBg}`}>
      {/* Checkbox */}
      <td className="py-3.5 pl-4 pr-1 w-8">
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(prospect.id)}
          className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" />
      </td>
      {/* CALL STATUS — pill badge with icon */}
      <td className="py-3.5 px-3">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all duration-300 ${liveStatus ? 'animate-pulse-soft' : ''}`}
          style={{ background: st.bg, color: st.text }}>
          {st.icon === 'group' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          {st.icon === 'phone' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
          {st.icon === 'voicemail' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
          {st.label}
        </span>
      </td>
      {/* CALLS */}
      <td className="py-3.5 px-3 text-[13px] text-gray-400 text-center">
        <span className="inline-flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
          {prospect.call_count || 0}
        </span>
      </td>
      {/* Actions rapides — appel + mail */}
      <td className="py-3.5 px-1">
        <div className="flex items-center justify-center gap-1">
          <button onClick={e => { e.stopPropagation(); onCall(prospect) }}
            title="Appeler"
            className="w-7 h-7 rounded-full flex items-center justify-center text-violet-400 hover:text-white hover:bg-violet-500 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
          </button>
          {prospect.email && (
            <a href={`mailto:${prospect.email}`} onClick={e => e.stopPropagation()}
              title="Envoyer un email"
              className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-white hover:bg-indigo-500 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </a>
          )}
        </div>
      </td>
      {/* NAME — chip cliquable (Minari exact) + icones après */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-2">
          {/* Nom dans bulle cliquable */}
          <button onClick={() => onSelect(prospect)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200/60">
            <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="text-[13px] font-medium text-gray-800">{prospect.name}</span>
          </button>
        </div>
      </td>
      {/* Colonne réseaux sociaux */}
      <td className="py-3.5 px-1">
        {socials.length > 0 && (
          <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${Math.min(socials.length, 3)}, 1.25rem)` }}>
            {socials.map((s, i) => (
              <a key={i} href={s.url.startsWith('http') ? s.url : `https://${s.url}`} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}>
                <PlatformIcon platform={s.platform} size="sm" />
              </a>
            ))}
          </div>
        )}
      </td>
      {/* TITLE */}
      <td className="py-3.5 px-4 text-[13px] text-gray-500 truncate max-w-[180px]">{prospect.title || '-'}</td>
      {/* COMPANY */}
      <td className="py-3.5 px-4 text-[13px] text-gray-500 truncate max-w-[160px]">{prospect.company || '-'}</td>
      {/* LAST CALL */}
      <td className="py-3.5 px-4 text-[13px] text-gray-400">{timeAgo(prospect.last_call_at)}</td>
      {/* STATUS (CRM) */}
      <td className="py-3.5 px-4 text-[13px] text-gray-500">{prospect.crm_status === 'new' ? 'Nouveau' : prospect.crm_status === 'open' ? 'Ouvert' : prospect.crm_status === 'in_progress' ? 'En cours' : prospect.crm_status === 'open_deal' ? 'Affaire ouverte' : prospect.crm_status === 'attempted_to_contact' ? 'Tenté de contacter' : prospect.crm_status === 'not_interested' ? 'Pas intéressé' : prospect.crm_status === 'callback' ? 'Rappel' : prospect.crm_status === 'rdv' ? 'RDV' : prospect.crm_status === 'mail_sent' ? 'Mail envoyé' : prospect.crm_status}</td>
      {/* PHONE NUMBER */}
      <td className="py-3.5 px-4 text-[13px] text-gray-400 font-mono">{prospect.phone}</td>
    </tr>
  )
})

// ── Page ────────────────────────────────────────────────────────────
export default function Dialer() {
  const { isAdmin, isManager } = useAuth()
  const cm = useCallMachine()
  const { data: lists } = useProspectLists()
  const [activeListId, setActiveListId] = useState<string | null>(() => {
    try { return localStorage.getItem('callio_active_list') } catch { return null }
  })
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'last_call' | 'name' | 'status' | 'call_status' | 'calls' | 'company' | 'title'>('last_call')
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [showSelectList, setShowSelectList] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [renamingList, setRenamingList] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showAddProspect, setShowAddProspect] = useState(false)
  const [showDTMF, setShowDTMF] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [newProspect, setNewProspect] = useState({ name: '', phone: '', email: '', company: '', title: '' })
  const addProspect = useAddProspect()

  // Statut live de l'appel pour animer la row (Minari: Initié → En sonnerie → En cours)
  function getLiveCallStatus(prospectId: string): string | undefined {
    if (cm.context.prospect?.id !== prospectId) return undefined
    if (cm.isConnected) return 'in-progress'
    if (cm.isDialing) return cm.context.callSid ? 'ringing' : 'initiated'
    return undefined
  }
  const [openTabIds, setOpenTabIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('callio_open_tabs') || '[]') } catch { return [] }
  })
  const [showCallSettings, setShowCallSettings] = useState(false)
  const { data: prospects } = useProspects(activeListId)
  const { data: callHistory } = useCallsByProspect(selectedProspect?.id ?? null)

  // Socials de tous les prospects (pour afficher les logos dans la table)
  const prospectIds = prospects?.map(p => p.id) || []
  const { data: allSocials } = useQuery({
    queryKey: ['all-socials', activeListId],
    queryFn: async () => {
      if (!prospectIds.length) return []
      const { data } = await supabase.from('prospect_socials').select('prospect_id, platform, url').in('prospect_id', prospectIds)
      return data || []
    },
    enabled: prospectIds.length > 0,
  })
  const socialsByProspect = new Map<string, Array<{ platform: string; url: string }>>()
  allSocials?.forEach((s: { prospect_id: string; platform: string; url: string }) => {
    if (!socialsByProspect.has(s.prospect_id)) socialsByProspect.set(s.prospect_id, [])
    socialsByProspect.get(s.prospect_id)!.push(s)
  })
  const queryClient = useQueryClient()
  const dialSession = useDialingSession()
  const duration = useTimer(cm.context.startedAt)
  useRealtimeProspects()

  useEffect(() => {
    // Première visite : pas de clé callio_open_tabs → ouvrir toutes les listes
    if (lists?.length && localStorage.getItem('callio_open_tabs') === null) {
      const ids = lists.map(l => l.id)
      setOpenTabIds(ids)
      setActiveListId(ids[0])
      localStorage.setItem('callio_open_tabs', JSON.stringify(ids))
      localStorage.setItem('callio_active_list', ids[0])
      return
    }
    // Si des tabs sont ouverts mais pas d'activeListId → prendre le premier tab
    if (openTabIds.length > 0 && !activeListId) {
      setActiveListId(openTabIds[0])
      localStorage.setItem('callio_active_list', openTabIds[0])
    }
    // Si activeListId pointe sur un tab qui n'est plus ouvert → reset
    if (activeListId && openTabIds.length > 0 && !openTabIds.includes(activeListId)) {
      setActiveListId(openTabIds[0])
      localStorage.setItem('callio_active_list', openTabIds[0])
    }
  }, [lists, activeListId, openTabIds])

  // Persister les tabs ouverts + nettoyer activeListId si plus de tabs
  useEffect(() => {
    localStorage.setItem('callio_open_tabs', JSON.stringify(openTabIds))
    if (openTabIds.length === 0) {
      setActiveListId(null)
      localStorage.removeItem('callio_active_list')
    }
  }, [openTabIds])

  const handleCall = useCallback((p: Prospect) => {
    if ((cm.isIdle || cm.isDisconnected) && cm.providerReady) {
      // NE PAS ouvrir le modal ici — il s'ouvrira quand le prospect décroche
      cm.call(p)
    }
  }, [cm])

  // Ouvrir le modal automatiquement quand le prospect DECROCHE (Minari exact)
  useEffect(() => {
    if (cm.isConnected && cm.context.prospect && !selectedProspect) {
      setSelectedProspect(cm.context.prospect)
    }
  }, [cm.isConnected, cm.context.prospect, selectedProspect])

  const isInCall = cm.isDialing || cm.isConnected
  const connected = prospects?.filter(p => p.last_call_outcome === 'connected' || p.last_call_outcome === 'rdv').length || 0
  const attempted = prospects?.filter(p => p.call_count > 0).length || 0
  const pending = prospects?.filter(p => p.call_count === 0).length || 0
  const meetings = prospects?.filter(p => p.last_call_outcome === 'meeting_booked' || p.last_call_outcome === 'rdv').length || 0
  const activeList = lists?.find(l => l.id === activeListId)

  const filtered = prospects
    ?.filter(p => {
      // Filtre recherche
      if (search && !(
        p.name.toLowerCase().includes(search.toLowerCase())
        || p.phone.includes(search)
        || (p.company || '').toLowerCase().includes(search.toLowerCase())
        || (p.title || '').toLowerCase().includes(search.toLowerCase())
        || (p.email || '').toLowerCase().includes(search.toLowerCase())
      )) return false
      // Filtre par call status
      if (filterStatus) {
        const key = getCallStatusKey(p)
        if (key !== filterStatus) return false
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'last_call') return (b.last_call_at || '').localeCompare(a.last_call_at || '')
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'status') return (a.crm_status || '').localeCompare(b.crm_status || '')
      if (sortBy === 'call_status') return getCallStatusKey(a).localeCompare(getCallStatusKey(b))
      if (sortBy === 'calls') return (b.call_count || 0) - (a.call_count || 0)
      if (sortBy === 'company') return (a.company || '').localeCompare(b.company || '')
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '')
      return 0
    })

  // Page "Choisir une liste" (Minari frame 005)
  // Si aucun tab ouvert → page de sélection
  if (showSelectList || (openTabIds.length === 0 && !activeListId)) {
    return <SelectListPage
      onSelect={(id) => {
        setActiveListId(id)
        setOpenTabIds(prev => prev.includes(id) ? prev : [...prev, id])
        setShowSelectList(false)
      }}
      onClose={() => { setShowSelectList(false); if (openTabIds.length > 0) setActiveListId(openTabIds[0]) }}
    />
  }

  return (
    <div className="min-h-screen bg-[#f5f3ff] dark:bg-[#e8e0f0] p-4 pl-2">
      {/* ── UN SEUL conteneur blanc arrondi (Minari exact) ── */}
      <div className="bg-white dark:bg-[#f0eaf5] rounded-2xl shadow-sm border border-gray-200/50 dark:border-[#d4cade]/50 min-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">

      {/* ── Tabs listes ── */}
      <div className="border-b border-gray-100 flex items-center overflow-x-auto px-3">
        <button onClick={() => setShowSelectList(true)}
          className="flex items-center gap-1 px-3 py-2.5 text-[12px] font-medium text-violet-600 hover:text-violet-700 whitespace-nowrap flex-shrink-0">
          <span className="w-3.5 h-3.5 rounded-full bg-violet-500 text-white flex items-center justify-center text-[9px] font-bold leading-none">+</span>
          Nouvelle liste
        </button>
        {lists?.filter(l => openTabIds.includes(l.id)).map(l => (
          <button key={l.id} onClick={() => { setActiveListId(l.id); localStorage.setItem('callio_active_list', l.id) }}
            className={`flex items-center gap-2 px-3 py-2 text-[12px] whitespace-nowrap flex-shrink-0 transition-colors rounded-t-lg ${
              activeListId === l.id
                ? 'text-gray-800 font-semibold bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.08)] border border-gray-200 border-b-white -mb-px relative z-10'
                : 'text-gray-400 hover:text-gray-600'
            }`}>
            {l.name}
            <button onClick={e => {
              e.stopPropagation()
              const remaining = openTabIds.filter(id => id !== l.id)
              setOpenTabIds(remaining)
              if (activeListId === l.id) {
                const next = remaining.length > 0 ? remaining[remaining.length - 1] : null
                setActiveListId(next)
                if (next) localStorage.setItem('callio_active_list', next)
                else localStorage.removeItem('callio_active_list')
              }
            }} className="text-gray-300 hover:text-gray-500 ml-0.5">&times;</button>
          </button>
        ))}
        {(lists?.length || 0) > 8 && (
          <span className="px-2 py-2.5 text-[12px] text-gray-400 whitespace-nowrap flex-shrink-0">+{(lists?.length || 0) - 8} ▾</span>
        )}
      </div>

      {/* ── List header ── */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {renamingList && (isAdmin || isManager) ? (
              <input autoFocus type="text" value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && renameValue.trim() && activeListId) {
                    await supabase.from('prospect_lists').update({ name: renameValue.trim() }).eq('id', activeListId)
                    queryClient.invalidateQueries({ queryKey: ['prospect-lists'] })
                    setRenamingList(false)
                  }
                  if (e.key === 'Escape') setRenamingList(false)
                }}
                onBlur={async () => {
                  if (renameValue.trim() && activeListId && renameValue !== activeList?.name) {
                    await supabase.from('prospect_lists').update({ name: renameValue.trim() }).eq('id', activeListId)
                    queryClient.invalidateQueries({ queryKey: ['prospect-lists'] })
                  }
                  setRenamingList(false)
                }}
                className="text-[17px] font-bold text-gray-800 outline-none border-b-2 border-indigo-400 bg-transparent" />
            ) : (
              <h1 onClick={() => { if (isAdmin || isManager) { setRenameValue(activeList?.name || ''); setRenamingList(true) } }}
                className={`text-[17px] font-bold text-gray-800 ${(isAdmin || isManager) ? 'cursor-pointer hover:text-indigo-700' : ''} transition-colors`}>{activeList?.name || 'Prospects'}</h1>
            )}
            <span className="text-[13px] text-gray-400">{prospects?.length || 0} contacts</span>
            <button onClick={() => setShowAddProspect(true)} className="text-[13px] text-gray-400 hover:text-indigo-600 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Contact
            </button>
            <button onClick={() => {
              setRefreshing(true)
              queryClient.invalidateQueries({ queryKey: ['prospects', activeListId] })
              queryClient.invalidateQueries({ queryKey: ['prospect-lists'] })
              setTimeout(() => setRefreshing(false), 800)
            }} className="text-[13px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <svg className={`w-3.5 h-3.5 transition-transform ${refreshing ? 'animate-spin-fast' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {refreshing ? 'Chargement...' : 'Actualiser'}
            </button>
            {/* Export CSV (admin/manager only) */}
            {(isAdmin || isManager) && (
              <button onClick={() => {
                if (!prospects?.length) return
                const headers = ['Nom', 'Téléphone', 'Email', 'Entreprise', 'Poste', 'Statut appel', 'Statut CRM', 'Nb appels', 'Dernier appel']
                const rows = prospects.map(p => [
                  p.name, p.phone, p.email || '', p.company || '', p.title || '',
                  p.last_call_outcome || 'pending', p.crm_status || 'new',
                  String(p.call_count || 0), p.last_call_at || ''
                ])
                const csv = [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
                const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `${activeList?.name || 'export'}.csv`; a.click()
                URL.revokeObjectURL(url)
              }} className="text-[13px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Exporter
              </button>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-4 text-[13px]">
              <span className="text-violet-600 font-semibold flex items-center gap-1">
                <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="inline-block w-2 h-2 rounded-full bg-violet-500 mr-0.5" />{meetings} RDV
              </span>
              <span className="text-gray-500"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Connectés {connected}</span>
              <span className="text-gray-500"><span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1" />Tentatives {attempted}</span>
              <span className="text-gray-400">En attente {pending}</span>
            </div>
            {/* Barre de progression unique (Minari exact) */}
            {(prospects?.length || 0) > 0 && (
              <div className="h-[3px] rounded-full overflow-hidden flex w-full">
                <div className="h-full bg-violet-500" style={{ width: `${(meetings / (prospects?.length || 1)) * 100}%` }} />
                <div className="h-full bg-emerald-500" style={{ width: `${((connected - meetings) / (prospects?.length || 1)) * 100}%` }} />
                <div className="h-full bg-orange-400" style={{ width: `${((attempted - connected) / (prospects?.length || 1)) * 100}%` }} />
                <div className="h-full bg-gray-200 flex-1" />
              </div>
            )}
          </div>
        </div>
      </div>


      {/* ── Toolbar (Minari exact layout) ── */}
      <div className="px-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Resume calling / Cancel calls */}
          {isInCall ? (
            <button onClick={() => { cm.hangup(); setTimeout(() => cm.reset(), 500); dialSession.endSession() }}
              className="px-4 py-2 rounded-full text-[13px] font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors">
              Annuler les appels
            </button>
          ) : (
            <button onClick={async () => {
              if (dialSession.isActive) {
                // Session en cours — appeler le prospect courant
                const pid = dialSession.currentProspectId
                const p = (filtered || prospects)?.find(pr => pr.id === pid)
                if (p) handleCall(p)
              } else {
                // Nouvelle session — snapshot la liste FILTRÉE dans l'ordre affiché
                const visibleList = filtered?.length ? filtered : prospects
                if (visibleList?.length) {
                  const s = await dialSession.startSession(visibleList, activeListId)
                  if (s && s.prospects.length > 0) {
                    const p = visibleList.find(pr => pr.id === s.prospects[0])
                    if (p) handleCall(p)
                  }
                }
              }
            }}
              disabled={!cm.providerReady || !(cm.isIdle || cm.isDisconnected)}
              className="px-4 py-2 rounded-full text-[13px] font-semibold bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-40 transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
              {cm.providerReady ? (dialSession.isActive ? `Reprendre (${dialSession.currentIndex + 1}/${dialSession.totalProspects})` : 'Démarrer les appels') : 'Connexion...'}
            </button>
          )}


          {/* Sorted by */}
          <div className="flex items-center gap-1.5 text-[13px] text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
            Trié par
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="text-[13px] text-gray-700 font-medium bg-transparent outline-none cursor-pointer">
              <option value="last_call">Dernier appel</option>
              <option value="name">Nom</option>
              <option value="call_status">Statut appel</option>
              <option value="status">Statut CRM</option>
              <option value="calls">Nombre d'appels</option>
              <option value="company">Société</option>
              <option value="title">Poste</option>
            </select>
          </div>

          {/* Filter */}
          <div className="relative">
            <button onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 text-[13px] px-3 py-1.5 rounded-lg border transition-colors ${filterStatus ? 'text-indigo-600 font-medium border-indigo-200 bg-indigo-50' : 'text-gray-500 hover:text-gray-700 border-gray-200 bg-white'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              Filtrer{filterStatus ? ' 1' : ''}
            </button>
            {showFilters && (
              <div className="absolute top-8 left-0 bg-white dark:bg-[#ede6f3] rounded-xl shadow-lg border border-gray-200 dark:border-[#d4cade] z-50 py-2 w-48 animate-slide-down">
                <button onClick={() => { setFilterStatus(null); setShowFilters(false) }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 ${!filterStatus ? 'text-indigo-600 font-medium' : 'text-gray-600'}`}>Tous les statuts</button>
                {['pending', 'connected', 'meeting_booked', 'no_answer', 'voicemail', 'cancelled', 'failed', 'snoozed', 'disabled'].map(s => {
                  const badge = CALL_STATUS_BADGE[s]
                  if (!badge) return null
                  return (
                    <button key={s} onClick={() => { setFilterStatus(s); setShowFilters(false) }}
                      className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 flex items-center gap-2 ${filterStatus === s ? 'text-indigo-600 font-medium' : 'text-gray-600'}`}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: badge.text }} />
                      {badge.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" placeholder="Rechercher des contacts..." value={search} onChange={e => setSearch(e.target.value)}
              className="text-[13px] bg-transparent outline-none text-gray-700 placeholder:text-gray-400 w-44" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Call settings dropdown (Minari exact position) */}
          <CallSettingsDropdown open={showCallSettings} onToggle={() => setShowCallSettings(!showCallSettings)} />
        </div>
      </div>

      {/* ── Barre actions groupées (quand sélection active) ── */}
      {selectedIds.size > 0 && (
        <div className="px-5 py-2 bg-indigo-50 border-y border-indigo-100 flex items-center gap-3 animate-fade-in">
          <span className="text-[13px] font-semibold text-indigo-700">{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
          <div className="h-4 w-px bg-indigo-200" />

          {/* Supprimer */}
          <button onClick={async () => {
            if (!confirm(`Supprimer ${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''} ?`)) return
            await supabase.from('prospects').delete().in('id', Array.from(selectedIds))
            setSelectedIds(new Set())
            queryClient.invalidateQueries({ queryKey: ['prospects', activeListId] })
          }} className="text-[12px] text-red-500 hover:text-red-700 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Supprimer
          </button>

          {/* Ne plus appeler */}
          <button onClick={async () => {
            await supabase.from('prospects').update({ do_not_call: true }).in('id', Array.from(selectedIds))
            setSelectedIds(new Set())
            queryClient.invalidateQueries({ queryKey: ['prospects', activeListId] })
          }} className="text-[12px] text-gray-600 hover:text-gray-800 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            Ne plus appeler
          </button>

          {/* Exporter la sélection */}
          {(isAdmin || isManager) && (
            <button onClick={() => {
              const selected = prospects?.filter(p => selectedIds.has(p.id))
              if (!selected?.length) return
              const headers = ['Nom', 'Téléphone', 'Email', 'Entreprise', 'Poste', 'Statut appel', 'Statut CRM']
              const rows = selected.map(p => [p.name, p.phone, p.email || '', p.company || '', p.title || '', p.last_call_outcome || '', p.crm_status || ''])
              const csv = [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
              const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'selection.csv'; a.click()
              URL.revokeObjectURL(url)
            }} className="text-[12px] text-gray-600 hover:text-gray-800 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Exporter
            </button>
          )}

          {/* Désélectionner */}
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-[12px] text-gray-400 hover:text-gray-600">
            Désélectionner
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 dark:bg-gray-800/50">
                <th className="py-3 pl-4 pr-1 w-8"><input type="checkbox"
                  checked={filtered ? filtered.length > 0 && selectedIds.size === filtered.length : false}
                  onChange={e => {
                    if (e.target.checked && filtered) setSelectedIds(new Set(filtered.map(p => p.id)))
                    else setSelectedIds(new Set())
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" /></th>
                <th className="py-3 px-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Statut appel</th>
                <th className="py-3 px-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Appels</th>
                <th className="py-3 px-1 text-center text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] w-16">Actions</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Nom</th>
                <th className="py-3 px-1 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Liens</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Poste</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Societe</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Dernier appel</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Statut</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Telephone</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map(p => (
                <ProspectRow
                  key={p.id}
                  prospect={p}
                  isActive={selectedProspect?.id === p.id && isInCall}
                  liveStatus={getLiveCallStatus(p.id)}
                  selected={selectedIds.has(p.id)}
                  socials={socialsByProspect.get(p.id) || []}
                  onToggleSelect={id => setSelectedIds(prev => {
                    const next = new Set(prev)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })}
                  onSelect={(p) => { if (cm.isDisconnected) cm.reset(); setSelectedProspect(p) }}
                  onCall={handleCall}
                />
              ))}
            </tbody>
          </table>
          {!prospects?.length && (
            <div className="text-center py-20">
              <p className="text-[13px] text-gray-400">Aucun contact dans cette liste</p>
              <button onClick={() => setShowCSVImport(true)} className="text-[13px] text-violet-600 hover:text-violet-700 mt-2 font-medium">Importer depuis un CSV</button>
            </div>
          )}
      </div>

      </div>{/* fin conteneur blanc global */}

      {/* ── Modal Ajouter un contact ── */}
      {showAddProspect && activeListId && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) { setShowAddProspect(false); setNewProspect({ name: '', phone: '', email: '', company: '', title: '' }) } }}>
          <div className="bg-white rounded-2xl shadow-xl w-[440px] p-6 animate-fade-in-scale">
            <h3 className="text-[15px] font-bold text-gray-800 mb-4">Ajouter un contact</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase">Nom *</label>
                <input autoFocus type="text" value={newProspect.name} onChange={e => setNewProspect({ ...newProspect, name: e.target.value })}
                  placeholder="Nom complet" className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase">Téléphone *</label>
                <input type="tel" value={newProspect.phone} onChange={e => setNewProspect({ ...newProspect, phone: e.target.value })}
                  placeholder="+33 6 12 34 56 78" className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase">Email</label>
                <input type="email" value={newProspect.email} onChange={e => setNewProspect({ ...newProspect, email: e.target.value })}
                  placeholder="email@exemple.fr" className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-indigo-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase">Entreprise</label>
                  <input type="text" value={newProspect.company} onChange={e => setNewProspect({ ...newProspect, company: e.target.value })}
                    placeholder="Société" className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase">Poste</label>
                  <input type="text" value={newProspect.title} onChange={e => setNewProspect({ ...newProspect, title: e.target.value })}
                    placeholder="Fonction" className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-indigo-400" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowAddProspect(false); setNewProspect({ name: '', phone: '', email: '', company: '', title: '' }) }}
                className="px-4 py-2 rounded-lg text-[13px] text-gray-500 hover:bg-gray-100">Annuler</button>
              <button onClick={async () => {
                if (newProspect.name.trim() && newProspect.phone.trim()) {
                  let phone = newProspect.phone.replace(/[\s\-\.\(\)]/g, '')
                  if (phone.startsWith('0') && phone.length === 10) phone = '+33' + phone.substring(1)
                  await addProspect.mutateAsync({
                    listId: activeListId,
                    name: newProspect.name.trim(),
                    phone,
                    email: newProspect.email.trim() || undefined,
                    company: newProspect.company.trim() || undefined,
                    sector: newProspect.title.trim() || undefined,
                  })
                  setShowAddProspect(false)
                  setNewProspect({ name: '', phone: '', email: '', company: '', title: '' })
                }
              }} disabled={!newProspect.name.trim() || !newProspect.phone.trim()}
                className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">Ajouter</button>
            </div>
          </div>
        </div>
      )}

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
          onCall={handleCall} onClose={() => { if (!isInCall) { if (cm.isDisconnected) cm.reset(); setSelectedProspect(null) } }}
          onSetDisposition={cm.setDisposition} onSetNotes={cm.setNotes} onSetMeeting={cm.setMeeting}
          onReset={cm.reset}
          onNextCall={async () => {
            cm.reset()
            setSelectedProspect(null)
            queryClient.invalidateQueries({ queryKey: ['prospects', activeListId] })

            if (dialSession.isActive) {
              // Avancer dans la session
              const nextId = await dialSession.nextProspect()
              if (nextId) {
                const p = prospects?.find(pr => pr.id === nextId)
                if (p) setTimeout(() => handleCall(p), 500)
              }
              // Si null → fin de liste (session terminée)
            } else {
              // Pas de session → ancien comportement
              const next = prospects?.find(p =>
                p.call_count === 0 && p.id !== selectedProspect?.id &&
                !p.do_not_call && !(p.snoozed_until && new Date(p.snoozed_until) > new Date())
              )
              if (next) setTimeout(() => handleCall(next), 500)
            }
          }}
          providerReady={cm.providerReady}
        />
      )}

      {/* ── Barre d'appel noire flottante (Minari exact — frame 025) ── */}
      {isInCall && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1c1c1c] text-white pl-6 pr-4 py-3.5 rounded-2xl flex items-center gap-6 z-50 shadow-2xl min-w-[480px] animate-slide-up">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[14px] truncate">{cm.context.prospect?.name}</p>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-white/40">● {cm.context.prospect?.phone}</span>
              <span className="text-[12px] text-white/60 font-mono">{formatTimer(duration)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Mute */}
            <button onClick={cm.isOnHold ? cm.unmute : cm.mute} title={cm.isOnHold ? 'Réactiver le micro' : 'Couper le micro'}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border ${
                cm.isOnHold ? 'bg-orange-500/30 text-orange-300 border-orange-500/40' : 'bg-white/10 text-white/50 hover:bg-white/20 border-white/20'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {cm.isOnHold ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                )}
              </svg>
            </button>
            {/* DTMF — pavé numérique */}
            <div className="relative">
              <button onClick={() => setShowDTMF(!showDTMF)} title="Pavé numérique"
                className="w-10 h-10 rounded-full bg-white/10 text-white/50 hover:bg-white/20 border border-white/20 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              {showDTMF && (
                <>
                <div className="fixed inset-0 z-[59]" onClick={() => setShowDTMF(false)} />
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-[#2a2a2a] rounded-xl shadow-xl border border-white/10 p-3 z-[60] animate-slide-up">
                  <div className="grid grid-cols-3 gap-1.5">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(d => (
                      <button key={d} onClick={() => cm.sendDTMF(d)}
                        className="w-10 h-10 rounded-lg bg-white/10 text-white text-[15px] font-semibold hover:bg-white/20 active:bg-white/30 transition-colors border border-white/10">
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                </>
              )}
            </div>
            {/* Raccrocher ROUGE = arrêter l'appel ET la session */}
            <button onClick={() => { cm.hangup(); setTimeout(() => cm.reset(), 500); setSelectedProspect(null); dialSession.endSession() }} title="Raccrocher et arrêter"
              className="w-11 h-11 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors border border-red-400/50">
              <svg className="w-5 h-5 rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
            {/* Raccrocher BLEU >> = raccrocher et passer au suivant (Minari exact) */}
            <button onClick={async () => {
              cm.hangup()
              setTimeout(async () => {
                cm.reset()
                setSelectedProspect(null)
                queryClient.invalidateQueries({ queryKey: ['prospects', activeListId] })
                if (dialSession.isActive) {
                  const nextId = await dialSession.nextProspect()
                  if (nextId) {
                    const p = prospects?.find(pr => pr.id === nextId)
                    if (p) setTimeout(() => handleCall(p), 300)
                  }
                }
              }, 500)
            }} title="Raccrocher et continuer"
              className="w-12 h-11 rounded-full bg-blue-500 text-white flex items-center justify-center gap-0.5 hover:bg-blue-600 transition-colors border border-blue-400/50">
              <svg className="w-4 h-4 rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Close dropdowns when clicking outside */}
      {(showCallSettings || showFilters) && <div className="fixed inset-0 z-40" onClick={() => { setShowCallSettings(false); setShowFilters(false) }} />}
    </div>
  )
}
