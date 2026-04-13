/**
 * Dialer — Copie pixel-perfect de Minari (frames 001, 002, 012).
 * Fond vert menthe, table dans cadre blanc arrondi, tabs chips,
 * Call Settings dropdown, badges pill, icones LinkedIn/copier dans rows.
 */

import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useCallMachine } from '@/hooks/useCallMachine'
import { useProspectLists, useProspects, useAddProspect, useCreateProspectField, useRdvToday } from '@/hooks/useProspects'
import { usePropertyDefinitions, useCustomFieldValues, groupProperties, updatePropertyValue, useCrmStatuses, type CrmStatusDef } from '@/hooks/useProperties'
import { SYSTEM_PROPERTIES, DEFAULT_VISIBLE_COLUMNS, getPropertyValue, matchesSearch, CRM_STATUS_LABELS, type PropertyDefinition } from '@/config/properties'
import { useCallsByProspect } from '@/hooks/useCalls'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/config/supabase'
import CSVImport from '@/components/import/CSVImport'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { PlatformIcon } from '@/components/call/SocialLinks'
import SelectListPage from '@/components/dialer/SelectListPage'
import ProspectModal from '@/components/call/ProspectModal'
import { exportListWithAudios, type ExportProgress } from '@/services/exportList'
import { usePermissions } from '@/hooks/usePermissions'
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
  // Contact décroché
  connected:        { bg: '#d1fae5', text: '#059669', label: 'Connecté', icon: 'phone' },
  meeting_booked:   { bg: '#ccfbf1', text: '#0d9488', label: 'RDV pris', icon: 'phone' },
  // Suivi commercial
  callback:         { bg: '#e9d5ff', text: '#7c3aed', label: 'Rappel', icon: 'phone' },
  not_interested:   { bg: '#f3f4f6', text: '#6b7280', label: 'Pas intéressé', icon: 'phone' },
  // Contact ne répond pas
  no_answer:        { bg: '#f3f4f6', text: '#6b7280', label: 'Pas de reponse', icon: 'phone' },
  voicemail:        { bg: '#f3f4f6', text: '#6b7280', label: 'Messagerie', icon: 'voicemail' },
  busy:             { bg: '#fef3c7', text: '#d97706', label: 'Occupé', icon: 'phone' },
  voicemail_left:   { bg: '#e0e7ff', text: '#4f46e5', label: 'Message déposé', icon: 'voicemail' },
  // Liés à l'appel
  cancelled:        { bg: '#f3f4f6', text: '#6b7280', label: 'Annulé', icon: 'phone' },
  failed:           { bg: '#fecaca', text: '#dc2626', label: 'Échoué', icon: 'phone' },
  missed:           { bg: '#fef3c7', text: '#d97706', label: 'Manqué', icon: 'phone' },
  // Liés au numéro
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

/** Mappe le prospect vers un badge CALL STATUS — priorité Minari-exact */
function getCallStatusKey(prospect: Prospect): string {
  if (prospect.snoozed_until && new Date(prospect.snoozed_until) > new Date()) return 'snoozed'
  if (prospect.do_not_call) return 'disabled'
  if (prospect.call_count === 0) return 'pending'
  // meeting_booked = modificateur sur connected
  if (prospect.meeting_booked && (prospect.last_call_outcome === 'connected' || !prospect.last_call_outcome)) return 'meeting_booked'
  const o = prospect.last_call_outcome
  if (!o) return 'no_answer'
  // Mapping direct — plus d'alias lossy
  if (o in CALL_STATUS_BADGE) return o
  // Legacy migration
  if (o === 'rdv_pris' || o === 'rdv') return 'meeting_booked'
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

// ── Column Picker (HubSpot-style, groupé, drag & drop) ──────────
function ColumnPicker({ visible, setVisible, allProperties, open, onToggle, onCreateField }: {
  visible: string[]; setVisible: (v: string[]) => void; allProperties: PropertyDefinition[]; open: boolean; onToggle: () => void; onCreateField: (name: string) => Promise<string | null>
}) {
  const pickable = allProperties.filter(p => p.id !== 'system:name')
  const grouped = groupProperties(pickable)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const q = search.toLowerCase()

  const handleDragStart = (idx: number) => (e: React.DragEvent) => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver = (idx: number) => (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverIdx(idx) }
  const handleDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return }
    const next = [...visible]; const [moved] = next.splice(dragIdx, 1); next.splice(idx, 0, moved); setVisible(next); setDragIdx(null); setOverIdx(null)
  }
  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null) }

  const handleCreateFromSearch = async () => {
    if (!search.trim()) return
    const fieldId = await onCreateField(search.trim())
    if (fieldId) setVisible([...visible, fieldId])
    setSearch('')
  }

  // Filtrer les colonnes par recherche
  const filteredGroups = grouped.map(g => ({
    ...g,
    properties: g.properties.filter(p => !q || p.name.toLowerCase().includes(q)),
  })).filter(g => g.properties.length > 0)

  const hasSearchResults = filteredGroups.some(g => g.properties.length > 0)

  return (
    <div className="relative">
      <button onClick={onToggle} className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" /></svg>
        Colonnes
        {visible.length > 0 && <span className="text-[10px] text-indigo-500 font-bold">{visible.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-[320px] bg-white rounded-xl shadow-lg border border-gray-200 z-50 flex flex-col animate-slide-down" style={{ maxHeight: '500px' }}>
          {/* Colonnes actives sont cochées dans la liste en dessous — pas de section fixe */}
          {/* Toutes les colonnes — groupées, filtrées */}
          <div className="flex-1 overflow-y-auto py-2">
            {filteredGroups.map(group => (
              <div key={group.key}>
                <p className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${group.key === 'custom' ? 'text-violet-400' : 'text-gray-400'}`}>{group.label}</p>
                {group.properties.map(prop => (
                  <label key={prop.id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={visible.includes(prop.id)}
                      onChange={() => setVisible(visible.includes(prop.id) ? visible.filter(c => c !== prop.id) : [...visible, prop.id])}
                      className={`w-3.5 h-3.5 rounded border-gray-300 ${prop.type === 'custom' ? 'accent-violet-600' : 'accent-indigo-600'}`} />
                    <span className={`text-[12px] ${prop.type === 'custom' ? 'text-violet-700' : 'text-gray-700'}`}>{prop.name}</span>
                    {prop.isReadOnly && <span className="text-[9px] text-gray-300 ml-auto">auto</span>}
                  </label>
                ))}
                <div className="h-px bg-gray-100 my-0.5" />
              </div>
            ))}
            {q && !hasSearchResults && (
              <p className="px-3 py-3 text-[12px] text-gray-400 text-center">Aucune colonne trouvée</p>
            )}
          </div>
          {/* Barre de recherche fixe en bas + créer */}
          <div className="border-t border-gray-100 px-3 py-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus-within:border-indigo-300 focus-within:ring-1 focus-within:ring-indigo-200">
                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && q && !hasSearchResults) handleCreateFromSearch() }}
                  placeholder="Rechercher ou créer..."
                  className="text-[12px] bg-transparent outline-none flex-1 min-w-0 placeholder:text-gray-400" />
              </div>
              {q && !hasSearchResults && (
                <button onClick={handleCreateFromSearch}
                  className="px-2.5 py-1.5 text-[11px] font-medium text-white bg-violet-500 hover:bg-violet-600 rounded-lg transition-colors whitespace-nowrap flex-shrink-0">
                  + Créer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Call Settings Dropdown (Minari frame 012 exact) ───────────────
/** Helper pour persister les call settings */
// ── Export complet (CSV + audios + fiches coaching) ──
function ExportButton({ listId, listName, prospects }: { listId: string | null; listName: string; prospects: Prospect[] }) {
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)

  const handleExport = async () => {
    if (!listId || !prospects.length || exporting) return
    setExporting(true)
    try {
      await exportListWithAudios(listId, listName, prospects, setProgress)
    } catch (err) {
      console.error('[Export] Failed:', err)
    }
    setExporting(false)
    setProgress(null)
  }

  return (
    <div className="relative">
      <button onClick={handleExport} disabled={exporting || !prospects.length}
        className={`text-[13px] flex items-center gap-1 transition-colors ${
          exporting ? 'text-violet-500' : 'text-gray-400 hover:text-gray-600'
        }`}>
        {exporting ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <span className="max-w-[160px] truncate">{progress?.step || 'Export...'}</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Exporter
          </>
        )}
      </button>
    </div>
  )
}

function useCallSetting<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const s = localStorage.getItem(`callio_cs_${key}`); return s ? JSON.parse(s) : defaultValue } catch { return defaultValue }
  })
  const set = (v: T) => { setVal(v); localStorage.setItem(`callio_cs_${key}`, JSON.stringify(v)) }
  return [val, set]
}

interface CallSettingsProps {
  open: boolean; onToggle: () => void
  parallel: number; setParallel: (v: number) => void
  autoRotate: boolean; setAutoRotate: (v: boolean) => void
  voicemail: boolean; setVoicemail: (v: boolean) => void
  completeTask: boolean; setCompleteTask: (v: boolean) => void
  maxAttempts: string; setMaxAttempts: (v: string) => void
  attemptPeriod: string; setAttemptPeriod: (v: string) => void
  phoneField: string; setPhoneField: (v: string) => void
  selectedFromNumber: string; setSelectedFromNumber: (v: string) => void
}

function CallSettingsDropdown({ open, onToggle, parallel, setParallel, autoRotate, setAutoRotate, voicemail, setVoicemail, completeTask, setCompleteTask, maxAttempts, setMaxAttempts, attemptPeriod, setAttemptPeriod, phoneField, setPhoneField, selectedFromNumber, setSelectedFromNumber }: CallSettingsProps) {
  // From phone numbers (multi-numéros avec compteur)
  const [fromNumbers] = useState([
    { number: '+33 1 59 58 01 89', calls: 0 },
  ])

  // Voicemail drop — messages enregistrés persistés en localStorage
  const [vmMessages, setVmMessages] = useCallSetting<Array<{ id: string; name: string; url: string; created: string }>>('vm_messages', [])
  const [vmSelectedId, setVmSelectedId] = useCallSetting('vm_selected', '')
  const [vmRecording, setVmRecording] = useState(false)
  const [vmNewName, setVmNewName] = useState('')
  const vmRecorderRef = useRef<MediaRecorder | null>(null)
  const vmChunksRef = useRef<Blob[]>([])

  // Microphone — vrais périphériques audio
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedMic, setSelectedMic] = useCallSetting('mic_device', '')
  const [micTesting, setMicTesting] = useState(false)
  const [micAudioUrl, setMicAudioUrl] = useState<string | null>(null)
  const [micError, setMicError] = useState(false)
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
                } catch { setMicError(true); setTimeout(() => setMicError(false), 3000) }
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

          {/* Voicemail drop (Minari — messages pré-enregistrés + toggle) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] text-gray-700">Messagerie vocale</span>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                <Toggle value={voicemail} onChange={setVoicemail} />
              </div>
            </div>
            {voicemail && (
              <div className="bg-gray-50 rounded-lg p-2.5 space-y-2.5">
                {/* Liste des messages enregistrés */}
                {vmMessages.length > 0 && (
                  <div className="space-y-1.5">
                    {vmMessages.map(msg => (
                      <div key={msg.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                        vmSelectedId === msg.id ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`} onClick={() => setVmSelectedId(msg.id)}>
                        <input type="radio" checked={vmSelectedId === msg.id} onChange={() => setVmSelectedId(msg.id)}
                          className="w-3 h-3 accent-violet-500" />
                        <span className="text-[12px] text-gray-700 flex-1 truncate">{msg.name}</span>
                        <button onClick={e => { e.stopPropagation(); new Audio(msg.url).play() }}
                          className="text-[10px] text-gray-400 hover:text-violet-500">▶</button>
                        <button onClick={e => {
                          e.stopPropagation()
                          setVmMessages(vmMessages.filter(m => m.id !== msg.id))
                          if (vmSelectedId === msg.id) setVmSelectedId('')
                        }} className="text-[10px] text-gray-300 hover:text-red-500">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {vmMessages.length === 0 && <p className="text-[11px] text-gray-400 italic">Aucun message enregistré</p>}

                {/* Enregistrer un nouveau message */}
                <div className="flex items-center gap-2">
                  <input type="text" placeholder="Nom du message..." value={vmNewName} onChange={e => setVmNewName(e.target.value)}
                    className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1 outline-none bg-white" />
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
                        const url = URL.createObjectURL(blob)
                        const name = vmNewName.trim() || `Message ${vmMessages.length + 1}`
                        const newMsg = { id: crypto.randomUUID(), name, url, created: new Date().toISOString() }
                        setVmMessages([...vmMessages, newMsg])
                        setVmSelectedId(newMsg.id)
                        setVmNewName('')
                      }
                      vmRecorderRef.current = recorder
                      recorder.start()
                      setVmRecording(true)
                      setTimeout(() => { if (recorder.state === 'recording') { recorder.stop(); setVmRecording(false) } }, 60000)
                    } catch { setMicError(true); setTimeout(() => setMicError(false), 3000) }
                  }} className={`px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap ${vmRecording ? 'border-red-300 text-red-500 bg-red-50 animate-pulse' : 'border-gray-200 text-gray-500 hover:bg-white'}`}>
                    {vmRecording ? '⏹ Stop' : '🎤 Enregistrer'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Séquence numéros (Minari : Contact phone number field) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-[13px] text-gray-700">Séquence d'appel</span>
                <p className="text-[10px] text-gray-400">Ordre des numéros testés si pas de réponse</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {['phone', 'phone2', 'phone3', 'phone4', 'phone5'].map((f, i) => {
                const labels: Record<string, string> = { phone: 'Tél. principal', phone2: 'Mobile', phone3: 'Tél. 3', phone4: 'Tél. 4', phone5: 'Tél. 5' }
                const isFirst = phoneField === f
                return (
                  <button key={f} onClick={() => setPhoneField(f)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                      isFirst ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    {i + 1}. {labels[f]}
                  </button>
                )
              })}
            </div>
            <p className="text-[9px] text-gray-400 mt-1">Le dialer commence par le numéro sélectionné, puis essaie les suivants</p>
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

      {/* Toast erreur micro */}
      {micError && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] bg-red-500 text-white px-5 py-3 rounded-xl shadow-lg text-[13px] font-medium flex items-center gap-2 animate-fade-in">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          Impossible d'accéder au microphone
        </div>
      )}
    </div>
  )
}

// ── Textarea portal (sort du overflow:hidden du tableau) ────
function TextareaPortal({ draft, setDraft, save, cancel }: {
  draft: string; setDraft: (v: string) => void; save: () => void; cancel: () => void
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.top, left: rect.left })
    }
  }, [])

  useEffect(() => {
    if (pos) textareaRef.current?.focus()
  }, [pos])

  return (
    <>
      <div ref={anchorRef} className="w-0 h-0" />
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={save} />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') cancel() }}
            rows={Math.min(8, Math.max(3, draft.split('\n').length + 1))}
            className="fixed z-[9999] text-[13px] bg-white border-2 border-indigo-400 rounded-lg px-2.5 py-2 outline-none shadow-2xl resize-none focus:ring-2 focus:ring-indigo-200"
            style={{ top: pos.top, left: pos.left, minWidth: '320px', maxWidth: '480px' }}
          />
        </>,
        document.body
      )}
    </>
  )
}

// ── Cellule éditable inline (HubSpot-style) ────────────────
function InlineEditCell({ prospectId, col, value, customValues, enumLabels, distinctValues, onSaved }: {
  prospectId: string; col: PropertyDefinition; value: string; customValues?: Record<string, string>; enumLabels?: Record<string, string>; distinctValues?: string[]; onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null)

  // Smart type detection pour custom fields (qui sont tous fieldType='text')
  const isDateValue = /^\d{2}\/\d{2}\/\d{4}$/.test(value) || /^\d{4}-\d{2}-\d{2}/.test(value)
  const isTimeValue = /^\d{1,2}:\d{2}$/.test(value) || /^\d{1,2}h\d{2}$/.test(value)
  const isLongText = (value.length > 80 || value.includes('\n')) && !isDateValue && !isTimeValue
  const looksLikeDate = col.fieldType === 'date' || (col.type === 'custom' && isDateValue)

  const save = async () => {
    setEditing(false)
    if (draft === value) return
    let saveVal = draft
    if (col.fieldType === 'boolean') saveVal = draft === 'Oui' ? 'true' : 'false'
    try {
      await updatePropertyValue(prospectId, col, saveVal)
      onSaved()
    } catch { /* silently fail */ }
  }

  if (col.isReadOnly && col.key !== 'crm_status' && col.key !== 'meeting_booked' && col.key !== 'do_not_call') {
    return <span className="text-gray-400">{value || '-'}</span>
  }

  // Enum → select DIRECT (1 clic, pas 2)
  if (col.fieldType === 'enum' && col.options) {
    return (
      <select value={value} onClick={e => e.stopPropagation()}
        onChange={async e => {
          const newVal = e.target.value
          try {
            await updatePropertyValue(prospectId, col, newVal)
            onSaved()
          } catch { /* silently fail */ }
        }}
        className="text-[13px] bg-transparent border-0 outline-none cursor-pointer text-gray-700 hover:text-indigo-700 w-full -mx-1 px-1 py-0 rounded hover:bg-indigo-50 transition-colors">
        <option value="">—</option>
        {col.options.map(o => <option key={o} value={o}>{enumLabels?.[o] || CRM_STATUS_LABELS[o] || o}</option>)}
      </select>
    )
  }

  // Boolean → select DIRECT (1 clic)
  if (col.fieldType === 'boolean') {
    const boolVal = value === 'Oui' ? 'true' : 'false'
    return (
      <select value={boolVal} onClick={e => e.stopPropagation()}
        onChange={async e => {
          try {
            await updatePropertyValue(prospectId, col, e.target.value)
            onSaved()
          } catch { /* silently fail */ }
        }}
        className={`text-[13px] bg-transparent border-0 outline-none cursor-pointer w-full -mx-1 px-1 py-0 rounded hover:bg-indigo-50 transition-colors ${value === 'Oui' ? 'text-emerald-600' : 'text-gray-400'}`}>
        <option value="false">Non</option>
        <option value="true">Oui</option>
      </select>
    )
  }

  // Custom field avec peu de valeurs distinctes → select direct (comme Source, Confirmation RDV)
  if (distinctValues && distinctValues.length > 0 && distinctValues.length <= 15 && !isDateValue && !isTimeValue && !isLongText) {
    return (
      <select value={value} onClick={e => e.stopPropagation()}
        onChange={async e => {
          try {
            await updatePropertyValue(prospectId, col, e.target.value)
            onSaved()
          } catch { /* silently fail */ }
        }}
        className="text-[13px] bg-transparent border-0 outline-none cursor-pointer text-gray-700 hover:text-indigo-700 w-full -mx-1 px-1 py-0 rounded hover:bg-indigo-50 transition-colors">
        <option value="">—</option>
        {distinctValues.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    )
  }

  if (editing) {
    // Date → input type="date"
    if (looksLikeDate) {
      let dateVal = ''
      if (draft) {
        try {
          // Gérer DD/MM/YYYY
          const ddmm = draft.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
          if (ddmm) dateVal = `${ddmm[3]}-${ddmm[2]}-${ddmm[1]}`
          else dateVal = new Date(draft).toISOString().split('T')[0]
        } catch { dateVal = '' }
      }
      return (
        <input type="date" ref={inputRef as React.RefObject<HTMLInputElement>} autoFocus value={dateVal}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
          className="text-[13px] bg-white border border-indigo-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-indigo-200"
        />
      )
    }
    // Time → input type="time"
    if (isTimeValue) {
      const timeVal = draft.replace('h', ':').replace(/^(\d):/, '0$1:')
      return (
        <input type="time" ref={inputRef as React.RefObject<HTMLInputElement>} autoFocus value={timeVal}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
          className="text-[13px] bg-white border border-indigo-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-indigo-200"
        />
      )
    }
    // Long text → textarea flottante via portal
    if (isLongText) {
      return (
        <TextareaPortal draft={draft} setDraft={setDraft} save={save} cancel={() => { setDraft(value); setEditing(false) }} />
      )
    }
    // Short text/number/phone/email/url → input
    return (
      <input ref={inputRef as React.RefObject<HTMLInputElement>} autoFocus value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        className="text-[13px] bg-white border border-indigo-300 rounded px-1.5 py-0.5 outline-none w-full focus:ring-1 focus:ring-indigo-200"
      />
    )
  }

  // Mode lecture — clic = édition
  const isUrl = col.fieldType === 'url' || (value.startsWith('http://') || value.startsWith('https://'))
  const isPhone = col.fieldType === 'phone'
  const isEmail = col.fieldType === 'email'
  const isBool = col.fieldType === 'boolean'
  const isCopyable = (isPhone || isEmail) && value

  const copyBtn = isCopyable && (
    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(value) }}
      title="Copier"
      className="text-gray-300 hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
    </button>
  )

  if (isUrl && value) {
    return (
      <span className="flex items-center gap-1">
        <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-indigo-500 hover:text-indigo-700 underline truncate">{value.replace(/^https?:\/\/(www\.)?/, '').slice(0, 25)}</a>
        <button onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true) }}
          className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
        </button>
      </span>
    )
  }

  if (isCopyable) {
    return (
      <span className="flex items-center gap-1">
        <span onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true) }}
          className={`cursor-text hover:bg-indigo-50 hover:text-indigo-700 rounded px-1 -mx-1 transition-colors truncate ${
            isPhone ? 'text-gray-400 font-mono' : 'text-gray-500'
          }`}>
          {value}
        </span>
        {copyBtn}
      </span>
    )
  }

  // Formater les dates en JJ/MM/AAAA pour l'affichage
  let displayValue = value
  if (looksLikeDate && value) {
    try {
      const d = /^\d{2}\/\d{2}\/\d{4}/.test(value) ? value : new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      displayValue = d
    } catch { /* keep raw */ }
  }

  return (
    <span onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true) }}
      className={`cursor-text hover:bg-indigo-50 hover:text-indigo-700 rounded px-1 -mx-1 transition-colors block truncate ${
        isPhone ? 'text-gray-400 font-mono' : 'text-gray-500'
      }`}>
      {displayValue || <span className="text-gray-300">-</span>}
    </span>
  )
}

// Largeurs fixes pour colonnes sticky (px)
const STICKY_W = { checkbox: 44, status: 140, actions: 64, name: 180 }
const STICKY_LEFT = {
  checkbox: 0,
  status: STICKY_W.checkbox,
  actions: STICKY_W.checkbox + STICKY_W.status,
  name: STICKY_W.checkbox + STICKY_W.status + STICKY_W.actions,
}
const STICKY_TOTAL = STICKY_LEFT.name + STICKY_W.name

// ── Prospect Row (colonnes dynamiques HubSpot-style) ────────
const ProspectRow = memo(function ProspectRow({ prospect, isActive, liveStatus, selected, socials, columns, customValues, colWidths, crmLabels, columnDistinctValues, onToggleSelect, onSelect, onCall, onSaved }: {
  prospect: Prospect; isActive: boolean; liveStatus?: string; selected: boolean; socials: Array<{ platform: string; url: string }>; columns: PropertyDefinition[]; customValues?: Record<string, string>; colWidths?: Record<string, number>; crmLabels?: Record<string, string>; columnDistinctValues?: Record<string, string[]>; onToggleSelect: (id: string) => void; onSelect: (p: Prospect) => void; onCall: (p: Prospect) => void; onSaved: () => void
}) {
  const statusKey = liveStatus || getCallStatusKey(prospect)
  const st = CALL_STATUS_BADGE[statusKey] || CALL_STATUS_BADGE.pending

  const rowBg = liveStatus === 'initiated' || liveStatus === 'ringing'
    ? 'bg-red-50/60'
    : liveStatus === 'in-progress'
      ? 'bg-violet-50/60'
      : isActive
        ? 'bg-violet-50/40'
        : 'hover:bg-gray-50/60'

  return (
    <tr className={`border-b border-gray-50 transition-all duration-300 ${rowBg}`}>
      {/* Checkbox — sticky */}
      <td className="py-3.5 pl-4 pr-1 border-r border-gray-100 sticky left-0 z-10 bg-violet-50/60"
        style={{ width: STICKY_W.checkbox, minWidth: STICKY_W.checkbox }}>
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(prospect.id)}
          className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" />
      </td>
      {/* CALL STATUS — sticky */}
      <td className="py-3.5 px-3 border-r border-gray-100 sticky z-10 bg-violet-50/60"
        style={{ left: STICKY_LEFT.status, width: STICKY_W.status, minWidth: STICKY_W.status }}>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all duration-300 ${liveStatus ? 'animate-pulse-soft' : ''}`}
          style={{ background: st.bg, color: st.text }}>
          {st.icon === 'group' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          {st.icon === 'phone' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
          {st.icon === 'voicemail' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
          {st.label}
        </span>
      </td>
      {/* Actions — sticky */}
      <td className="py-3.5 px-1 border-r border-gray-100 sticky z-10 bg-violet-50/60"
        style={{ left: STICKY_LEFT.actions, width: STICKY_W.actions, minWidth: STICKY_W.actions }}>
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
      {/* NAME — sticky + shadow de séparation */}
      <td className="py-3.5 px-4 border-r border-gray-100 sticky z-10 bg-violet-50/60"
        style={{ left: STICKY_LEFT.name, width: STICKY_W.name, minWidth: STICKY_W.name, boxShadow: '4px 0 8px -4px rgba(0,0,0,0.08)' }}>
        <button onClick={() => onSelect(prospect)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200/60">
          <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          <span className="text-[13px] font-medium text-gray-800 truncate max-w-[150px] block">{prospect.name}</span>
        </button>
      </td>
      {/* COLONNES DYNAMIQUES — scrollables, éditables inline */}
      {columns.map(col => {
        if (col.id === 'system:socials') {
          return (
            <td key={col.id} className="py-3.5 px-2 border-r border-gray-100 group overflow-hidden"
              style={colWidths?.[col.id] ? { width: colWidths[col.id], minWidth: colWidths[col.id], maxWidth: colWidths[col.id] } : undefined}>
              {socials.length > 0 ? (
                <div className="flex gap-1">
                  {socials.map((s, i) => (
                    <a key={i} href={s.url.startsWith('http') ? s.url : `https://${s.url}`} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}>
                      <PlatformIcon platform={s.platform} size="sm" />
                    </a>
                  ))}
                </div>
              ) : <span className="text-gray-300">-</span>}
            </td>
          )
        }

        const value = getPropertyValue(prospect, customValues, col)
        return (
          <td key={col.id} className="py-3.5 px-4 text-[13px] border-r border-gray-100 group overflow-hidden" title={value}
            style={colWidths?.[col.id] ? { width: colWidths[col.id], minWidth: colWidths[col.id], maxWidth: colWidths[col.id] } : { maxWidth: 200 }}>
            <InlineEditCell prospectId={prospect.id} col={col} value={value} customValues={customValues} enumLabels={col.key === 'crm_status' ? crmLabels : undefined} distinctValues={columnDistinctValues?.[col.id]} onSaved={onSaved} />
          </td>
        )
      })}
    </tr>
  )
})

// ── Page ────────────────────────────────────────────────────────────
export default function Dialer() {
  const { isAdmin, isManager, organisation } = useAuth()
  const perms = usePermissions()
  const cm = useCallMachine()
  const { data: lists } = useProspectLists()

  // ── Call Settings (montés ici pour être accessibles au call flow) ──
  // Call settings — source unique : DB (organisation) via React Query
  // Les deux sens (Dialer ↔ Settings) passent par la même table organisations
  const org = organisation
  const qc = useQueryClient()
  const updateOrg = useCallback(async (updates: Record<string, unknown>) => {
    if (!org?.id) return
    await supabase.from('organisations').update(updates).eq('id', org.id)
    qc.invalidateQueries({ queryKey: ['organisation'] })
  }, [org?.id, qc])

  const parallel = org?.parallel_calls || 1
  const setParallel = (v: number) => updateOrg({ parallel_calls: v })
  const autoRotate = org?.auto_rotate_numbers ?? true
  const setAutoRotate = (v: boolean) => updateOrg({ auto_rotate_numbers: v })
  const voicemail = org?.voicemail_drop ?? false
  const setVoicemail = (v: boolean) => updateOrg({ voicemail_drop: v })
  const [completeTask, setCompleteTask] = useCallSetting('complete_task', false)
  const maxAttempts = org?.max_call_attempts || 'unlimited'
  const setMaxAttempts = (v: string) => updateOrg({ max_call_attempts: v })
  const attemptPeriod = org?.attempt_period || 'per_day'
  const setAttemptPeriod = (v: string) => updateOrg({ attempt_period: v })
  const [phoneField, setPhoneField] = useCallSetting('phone_field', 'phone')
  const [localFromNumber, setLocalFromNumber] = useState(org?.from_number || '+33757905591')
  useEffect(() => { if (org?.from_number) setLocalFromNumber(org.from_number) }, [org?.from_number])
  const selectedFromNumber = localFromNumber
  const setSelectedFromNumber = (v: string) => { setLocalFromNumber(v); updateOrg({ from_number: v }) }

  // ── Propriétés CRM (HubSpot-style) ──
  const { properties: allProperties } = usePropertyDefinitions()
  const { data: rdvToday } = useRdvToday()

  // Numéros Twilio pour la rotation auto
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  const { data: orgPhoneNumbers } = useQuery({
    queryKey: ['twilio-numbers-dialer'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return []
      const res = await fetch(`${SUPABASE_URL}/functions/v1/twilio-numbers?action=list`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.numbers || []) as Array<{ sid: string; phone: string; friendlyName: string; capabilities: Record<string, boolean> }>
    },
    staleTime: 300_000, // 5 min cache — les numéros changent rarement
  })
  const { data: crmStatuses } = useCrmStatuses()
  const crmLabels: Record<string, string> = {}
  crmStatuses?.forEach(s => { crmLabels[s.key] = s.label })

  const [activeListId, setActiveListId] = useState<string | null>(() => {
    try { return localStorage.getItem('callio_active_list') } catch { return null }
  })
  // Colonnes visibles par liste
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(DEFAULT_VISIBLE_COLUMNS)
  useEffect(() => {
    if (!activeListId) { setVisibleColumnIds(DEFAULT_VISIBLE_COLUMNS); return }
    const key = `callio_cs_visible_columns_${activeListId}`
    try {
      const s = localStorage.getItem(key)
      const parsed = s ? JSON.parse(s) : null
      if (Array.isArray(parsed) && parsed.length > 0) {
        setVisibleColumnIds(parsed)
      } else {
        setVisibleColumnIds(DEFAULT_VISIBLE_COLUMNS)
      }
    } catch {
      setVisibleColumnIds(DEFAULT_VISIBLE_COLUMNS)
    }
  }, [activeListId])
  const saveVisibleColumns = useCallback((cols: string[]) => {
    setVisibleColumnIds(cols)
    if (activeListId) {
      localStorage.setItem(`callio_cs_visible_columns_${activeListId}`, JSON.stringify(cols))
    }
  }, [activeListId])
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [dragColId, setDragColId] = useState<string | null>(null)
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const resizeRef = useRef<{ colId: string; startX: number; startW: number } | null>(null)
  const activeColumns: PropertyDefinition[] = visibleColumnIds
    .map(id => allProperties.find(p => p.id === id))
    .filter(Boolean) as PropertyDefinition[]

  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string>('none')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // ── Filtres multi-propriétés (HubSpot-style) ──
  type FilterOp = 'eq' | 'neq' | 'contains' | 'not_contains' | 'starts' | 'empty' | 'not_empty' | 'gt' | 'lt' | 'in' | 'true' | 'false'
  type Filter = { id: string; propertyId: string; op: FilterOp; value: string }
  const [filters, setFilters] = useState<Filter[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [showViews, setShowViews] = useState(false)
  const [savingView, setSavingView] = useState(false)
  const [newViewName, setNewViewName] = useState('')
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const newViewInputRef = useRef<HTMLInputElement>(null)

  // ── Saved Views (localStorage per list) ──
  type SavedView = { id: string; name: string; columns: string[]; sortBy: string; filters: Filter[] }
  const viewsKey = activeListId ? `callio_views_${activeListId}` : null
  const [savedViews, setSavedViews] = useState<SavedView[]>([])

  useEffect(() => {
    if (!viewsKey) { setSavedViews([]); setActiveViewId(null); return }
    try {
      const s = localStorage.getItem(viewsKey)
      setSavedViews(s ? JSON.parse(s) : [])
    } catch { setSavedViews([]) }
    setActiveViewId(null)
  }, [viewsKey])

  const persistViews = (views: SavedView[]) => {
    setSavedViews(views)
    if (viewsKey) localStorage.setItem(viewsKey, JSON.stringify(views))
  }

  const saveCurrentView = (name: string) => {
    const view: SavedView = {
      id: crypto.randomUUID(),
      name,
      columns: visibleColumnIds,
      sortBy,
      filters,
    }
    persistViews([...savedViews, view])
    setActiveViewId(view.id)
    setSavingView(false)
    setNewViewName('')
  }

  const loadView = (view: SavedView) => {
    saveVisibleColumns(view.columns)
    setSortBy(view.sortBy as typeof sortBy)
    setFilters(view.filters || [])
    setActiveViewId(view.id)
    setShowViews(false)
  }

  const deleteView = (id: string) => {
    persistViews(savedViews.filter(v => v.id !== id))
    if (activeViewId === id) setActiveViewId(null)
  }

  const updateCurrentView = () => {
    if (!activeViewId) return
    persistViews(savedViews.map(v => v.id === activeViewId ? { ...v, columns: visibleColumnIds, sortBy, filters } : v))
  }

  const [showCSVImport, setShowCSVImport] = useState(false)
  const [showSelectList, setShowSelectList] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [renamingList, setRenamingList] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showAddProspect, setShowAddProspect] = useState(false)
  const [showDTMF, setShowDTMF] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteProspects, setConfirmDeleteProspects] = useState(false)
  const [newProspect, setNewProspect] = useState({ name: '', phone: '', email: '', company: '', title: '' })
  const addProspect = useAddProspect()
  const createField = useCreateProspectField()

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
  const { data: callHistory } = useCallsByProspect(selectedProspect?.id ?? null, selectedProspect?.phone)

  // Custom field values en batch
  const prospectIds = prospects?.map(p => p.id) || []
  const hasCustomColumns = activeColumns.some(c => c.type === 'custom')
  const { data: allCustomValues } = useCustomFieldValues(prospectIds, hasCustomColumns)

  // Socials de tous les prospects (pour afficher les logos dans la table)
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
      // ── Max Attempts : bloquer si le prospect a déjà atteint le max ──
      if (maxAttempts !== 'Illimité') {
        const max = parseInt(maxAttempts, 10)
        if (!isNaN(max) && p.call_count >= max) {
          console.log(`[Dialer] Skipping ${p.name}: ${p.call_count} calls >= max ${max}`)
          return
        }
      }

      // ── Phone Sequence : essayer les numéros dans l'ordre à partir du champ sélectionné ──
      const phoneFields = ['phone', 'phone2', 'phone3', 'phone4', 'phone5']
      const startIdx = phoneFields.indexOf(phoneField)
      // Construire la séquence : à partir du champ sélectionné, puis les suivants, puis reboucler
      const sequence = [...phoneFields.slice(startIdx), ...phoneFields.slice(0, startIdx)]
      // Le call_count détermine quel numéro dans la séquence (rotation)
      const seqIdx = p.call_count % sequence.length
      let phoneNumber: string | null = null
      // Essayer chaque numéro de la séquence à partir de l'index courant
      for (let i = 0; i < sequence.length; i++) {
        const field = sequence[(seqIdx + i) % sequence.length]
        const num = (p as Record<string, unknown>)[field] as string | null
        if (num && num.length >= 8) { phoneNumber = num; break }
      }
      if (!phoneNumber) {
        console.warn(`[Dialer] No phone number for ${p.name}`)
        return
      }

      // ── From Number : rotation auto ou numéro fixe ──
      let fromNumber = selectedFromNumber
      if (autoRotate && orgPhoneNumbers && orgPhoneNumbers.length > 1) {
        // Rotation : chaque appel utilise le numéro suivant dans la liste
        const voiceNums = orgPhoneNumbers.filter(n => n.capabilities?.voice).map(n => n.phone)
        if (voiceNums.length > 1) {
          const rotateIdx = (p.call_count || 0) % voiceNums.length
          fromNumber = voiceNums[rotateIdx]
        }
      }

      const prospectWithPhone = phoneNumber !== p.phone
        ? { ...p, phone: phoneNumber }
        : p

      cm.call(prospectWithPhone, fromNumber)
    }
  }, [cm, maxAttempts, phoneField, selectedFromNumber, autoRotate, orgPhoneNumbers])

  // Ouvrir le modal automatiquement quand le prospect DÉCROCHE (Minari exact)
  useEffect(() => {
    if (cm.isConnected && cm.context.prospect && !selectedProspect) {
      setSelectedProspect(cm.context.prospect)
    }
  }, [cm.isConnected, cm.context.prospect, selectedProspect])

  const isInCall = cm.isDialing || cm.isConnected
  const meetings = prospects?.filter(p => p.meeting_booked || p.crm_status === 'rdv_pris' || p.crm_status === 'rdv_fait').length || 0
  const connected = prospects?.filter(p => p.last_call_outcome === 'connected' && !p.meeting_booked && p.crm_status !== 'rdv_pris' && p.crm_status !== 'rdv_fait').length || 0
  const attempted = prospects?.filter(p => p.call_count > 0).length || 0
  const pending = prospects?.filter(p => p.call_count === 0).length || 0
  // Seuil conversation : org.conversation_threshold (défaut 30s)
  // Utilisé dans le status-callback pour la classification et dans les futures analytics
  const conversationThreshold = org?.conversation_threshold || 30
  const activeList = lists?.find(l => l.id === activeListId)

  // Calculer les valeurs distinctes par colonne custom (pour les rendre en select)
  const columnDistinctValues = useRef<Record<string, string[]>>({})
  if (prospects && allCustomValues && activeColumns.length > 0) {
    const dvs: Record<string, string[]> = {}
    for (const col of activeColumns) {
      if (col.type !== 'custom') continue
      const vals = new Set<string>()
      for (const p of prospects) {
        const cv = allCustomValues[p.id]
        const v = cv?.[col.id]?.trim()
        if (v) vals.add(v)
      }
      // Seulement si <= 15 valeurs distinctes et chaque valeur est courte
      if (vals.size > 0 && vals.size <= 15 && [...vals].every(v => v.length < 40)) {
        dvs[col.id] = [...vals].sort()
      }
    }
    columnDistinctValues.current = dvs
  }

  // ── Évaluer un filtre sur un prospect ──
  const evalFilter = useCallback((p: Prospect, f: Filter): boolean => {
    // Propriété spéciale "call_status" (dérivée)
    if (f.propertyId === '_call_status') {
      const v = getCallStatusKey(p)
      if (f.op === 'eq') return v === f.value
      if (f.op === 'neq') return v !== f.value
      if (f.op === 'in') return f.value.split(',').includes(v)
      return true
    }
    // Trouver la propriété
    const prop = allProperties.find(pr => pr.id === f.propertyId)
    if (!prop) return true
    const val = getPropertyValue(p, allCustomValues?.[p.id], prop)
    const v = val.toLowerCase()
    const fv = f.value.toLowerCase()

    switch (f.op) {
      case 'eq': return v === fv
      case 'neq': return v !== fv
      case 'contains': return v.includes(fv)
      case 'not_contains': return !v.includes(fv)
      case 'starts': return v.startsWith(fv)
      case 'empty': return !val
      case 'not_empty': return !!val
      case 'gt': return parseFloat(val) > parseFloat(f.value)
      case 'lt': return parseFloat(val) < parseFloat(f.value)
      case 'in': return f.value.split(',').map(s => s.trim().toLowerCase()).includes(v)
      case 'true': return val === 'Oui' || val === 'true' || val === '1'
      case 'false': return val === 'Non' || val === 'false' || val === '0' || !val
      default: return true
    }
  }, [allProperties, allCustomValues])

  const filtered = prospects
    ?.filter(p => {
      if (search && !matchesSearch(p, allCustomValues?.[p.id], activeColumns, search)) return false
      // Filtres multi-propriétés (AND)
      for (const f of filters) {
        if (!evalFilter(p, f)) return false
      }
      return true
    })
    .sort((a, b) => {
      // Aucun tri = ordre d'insertion DB (created_at ASC, stable)
      if (sortBy === 'none') return (a.created_at || '').localeCompare(b.created_at || '')
      let cmp = 0
      if (sortBy === 'last_call') cmp = (a.last_call_at || '').localeCompare(b.last_call_at || '')
      else if (sortBy === 'created') cmp = (a.created_at || '').localeCompare(b.created_at || '')
      else if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortBy === 'status') cmp = (a.crm_status || '').localeCompare(b.crm_status || '')
      else if (sortBy === 'call_status') cmp = getCallStatusKey(a).localeCompare(getCallStatusKey(b))
      else if (sortBy === 'calls') cmp = (a.call_count || 0) - (b.call_count || 0)
      else if (sortBy === 'company') cmp = (a.company || '').localeCompare(b.company || '')
      else if (sortBy === 'title') cmp = (a.title || '').localeCompare(b.title || '')
      else {
        // Tri dynamique par property id (system:xxx ou custom field)
        const col = allProperties.find(p => p.id === sortBy)
        if (col) {
          const va = getPropertyValue(a, allCustomValues?.[a.id], col)
          const vb = getPropertyValue(b, allCustomValues?.[b.id], col)
          cmp = va.localeCompare(vb)
        }
      }
      return sortDir === 'desc' ? -cmp : cmp
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
    <div className="h-screen bg-[#f5f3ff] dark:bg-[#e8e0f0] p-4 pl-2 overflow-hidden">
      {/* ── UN SEUL conteneur blanc arrondi (Minari exact) ── */}
      <div className="bg-white dark:bg-[#f0eaf5] rounded-2xl shadow-sm border border-gray-200/50 dark:border-[#d4cade]/50 h-full flex flex-col overflow-hidden">

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
            {renamingList && (perms.isAdmin) ? (
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
              <h1 onClick={() => { if (perms.isAdmin) { setRenameValue(activeList?.name || ''); setRenamingList(true) } }}
                className={`text-[17px] font-bold text-gray-800 ${(perms.isAdmin) ? 'cursor-pointer hover:text-indigo-700' : ''} transition-colors`}>{activeList?.name || 'Prospects'}</h1>
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
            {/* Export complet (admin/manager only) */}
            {(perms.isAdmin) && (
              <ExportButton
                listId={activeListId}
                listName={activeList?.name || 'export'}
                prospects={prospects || []}
              />
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


          {/* Vues sauvegardées */}
          <div className="relative">
            <button onClick={() => setShowViews(!showViews)}
              className={`flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border transition-colors ${activeViewId ? 'text-indigo-600 font-medium border-indigo-200 bg-indigo-50' : 'text-gray-500 hover:text-gray-700 border-gray-200 bg-white'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
              {activeViewId ? savedViews.find(v => v.id === activeViewId)?.name || 'Vue' : 'Vues'}
            </button>
            {showViews && (
              <div className="absolute top-10 left-0 bg-white rounded-xl shadow-lg border border-gray-200 z-50 w-64 animate-slide-down">
                {/* Liste des vues */}
                {savedViews.length > 0 && (
                  <div className="py-2 border-b border-gray-100">
                    <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Vues enregistrées</p>
                    {savedViews.map(v => (
                      <div key={v.id} className={`flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 group ${activeViewId === v.id ? 'bg-indigo-50' : ''}`}>
                        <button onClick={() => loadView(v)} className="flex-1 text-left text-[12px] text-gray-700 truncate">
                          {v.name}
                        </button>
                        <span className="text-[9px] text-gray-300">{v.columns.length} col</span>
                        <button onClick={() => deleteView(v.id)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Sauvegarder vue courante */}
                <div className="p-2">
                  {savingView ? (
                    <div className="flex items-center gap-2">
                      <input ref={newViewInputRef} value={newViewName} onChange={e => setNewViewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newViewName.trim()) saveCurrentView(newViewName.trim()); if (e.key === 'Escape') { setSavingView(false); setNewViewName('') } }}
                        placeholder="Nom de la vue..."
                        autoFocus
                        className="flex-1 text-[12px] px-2.5 py-1.5 rounded-lg border border-indigo-200 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200" />
                      <button onClick={() => { if (newViewName.trim()) saveCurrentView(newViewName.trim()) }}
                        className="px-2.5 py-1.5 text-[11px] font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors whitespace-nowrap">
                        Sauver
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <button onClick={() => { setSavingView(true); setTimeout(() => newViewInputRef.current?.focus(), 50) }}
                        className="flex items-center gap-1.5 text-[12px] text-indigo-500 hover:text-indigo-700 font-medium w-full py-1 px-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Enregistrer la vue actuelle
                      </button>
                      {activeViewId && (
                        <button onClick={() => { updateCurrentView(); setShowViews(false) }}
                          className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-700 font-medium w-full py-1 px-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          Mettre à jour "{savedViews.find(v => v.id === activeViewId)?.name}"
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sorted by (robot d'appel uniquement) */}
          <div className="relative">
            <button onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
              <span className="text-gray-700 font-medium">{sortBy === 'none' ? 'Ordre par défaut' : sortBy === 'created' ? 'Dernier créé' : 'Dernier appel'}</span>
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showSortDropdown && (
              <div className="absolute top-10 left-0 bg-white rounded-xl shadow-lg border border-gray-200 z-50 py-1 w-44 animate-slide-down">
                <button onClick={() => { setSortBy('none'); setShowSortDropdown(false) }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 ${sortBy === 'none' ? 'text-indigo-600 font-medium' : 'text-gray-600'}`}>
                  Ordre par défaut
                </button>
                <button onClick={() => { setSortBy('last_call'); setSortDir('desc'); setShowSortDropdown(false) }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 ${sortBy === 'last_call' ? 'text-indigo-600 font-medium' : 'text-gray-600'}`}>
                  Dernier appel
                </button>
                <button onClick={() => { setSortBy('created'); setSortDir('desc'); setShowSortDropdown(false) }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 ${sortBy === 'created' ? 'text-indigo-600 font-medium' : 'text-gray-600'}`}>
                  Dernier créé
                </button>
              </div>
            )}
          </div>

          {/* Filter statut appel (robot d'appel — Minari) */}
          <div className="relative">
            <button onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors ${filters.some(f => f.propertyId === '_call_status') ? 'text-indigo-600 font-medium border-indigo-200 bg-indigo-50' : 'text-gray-500 hover:text-gray-700 border-gray-200 bg-white'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              Filtrer
            </button>
            {showFilters && (
              <div className="absolute top-8 left-0 bg-white rounded-xl shadow-lg border border-gray-200 z-50 py-2 w-52 animate-slide-down">
                {/* Filtre par statut d'appel (robot — Minari) */}
                <button onClick={() => { setFilters([]); setShowFilters(false) }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 ${filters.length === 0 ? 'text-indigo-600 font-medium' : 'text-gray-600'}`}>Tous les statuts</button>
                {['pending', 'connected', 'meeting_booked', 'callback', 'not_interested', 'no_answer', 'voicemail', 'busy', 'cancelled', 'failed', 'snoozed', 'disabled'].map(s => {
                  const badge = CALL_STATUS_BADGE[s]
                  if (!badge) return null
                  const isActive = filters.some(f => f.propertyId === '_call_status' && f.value === s)
                  return (
                    <button key={s} onClick={() => {
                      setFilters([{ id: 'call_filter', propertyId: '_call_status', op: 'eq', value: s }])
                      setShowFilters(false)
                    }}
                      className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 flex items-center gap-2 ${isActive ? 'text-indigo-600 font-medium' : 'text-gray-600'}`}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: badge.text }} />
                      {badge.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Colonnes */}
          <ColumnPicker visible={visibleColumnIds} setVisible={saveVisibleColumns}
            allProperties={allProperties} open={showColumnPicker} onToggle={() => setShowColumnPicker(!showColumnPicker)}
            onCreateField={async (name) => {
              const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
              try {
                const field = await createField.mutateAsync({ name, key })
                return field.id
              } catch { return null }
            }} />

          {/* Search */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" placeholder="Rechercher des contacts..." value={search} onChange={e => setSearch(e.target.value)}
              className="text-[13px] bg-transparent outline-none text-gray-700 placeholder:text-gray-400 w-44" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Call settings dropdown (Minari exact position) */}
          <CallSettingsDropdown open={showCallSettings} onToggle={() => setShowCallSettings(!showCallSettings)}
            parallel={parallel} setParallel={setParallel}
            autoRotate={autoRotate} setAutoRotate={setAutoRotate}
            voicemail={voicemail} setVoicemail={setVoicemail}
            completeTask={completeTask} setCompleteTask={setCompleteTask}
            maxAttempts={maxAttempts} setMaxAttempts={setMaxAttempts}
            attemptPeriod={attemptPeriod} setAttemptPeriod={setAttemptPeriod}
            phoneField={phoneField} setPhoneField={setPhoneField}
            selectedFromNumber={selectedFromNumber} setSelectedFromNumber={setSelectedFromNumber} />
        </div>
      </div>

      {/* ── Bandeau RDV du jour — auto-scroll vers le prochain ── */}
      {rdvToday && rdvToday.length > 0 && (() => {
        const now = new Date()
        const nextIdx = rdvToday.findIndex(r => r.rdv_date && new Date(r.rdv_date) > now)
        return (
        <div className="px-5 py-2 bg-gradient-to-r from-teal-50 to-emerald-50 border-b border-teal-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span className="text-[13px] font-semibold text-teal-700">RDV du jour</span>
              <span className="text-[11px] text-teal-500 bg-teal-100 px-1.5 py-0.5 rounded-full font-bold">{rdvToday.length}</span>
            </div>
            <div className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              ref={el => {
                // Auto-scroll vers le prochain RDV
                if (el && nextIdx >= 0) {
                  const target = el.children[nextIdx] as HTMLElement
                  if (target) el.scrollLeft = target.offsetLeft - 20
                }
              }}>
              {rdvToday.map((rdv, idx) => {
                const time = rdv.rdv_date ? new Date(rdv.rdv_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
                const isPast = rdv.rdv_date && new Date(rdv.rdv_date) < now
                const isNext = idx === nextIdx
                return (
                  <button key={rdv.id} onClick={() => {
                    if (rdv.list_id) {
                      setActiveListId(rdv.list_id)
                      setOpenTabIds(prev => prev.includes(rdv.list_id) ? prev : [...prev, rdv.list_id])
                    }
                    const p = prospects?.find(pr => pr.id === rdv.id) || rdv as unknown as Prospect
                    if (cm.isDisconnected) cm.reset()
                    setSelectedProspect(p)
                  }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all flex-shrink-0 ${
                      isNext
                        ? 'bg-teal-100 border-teal-400 shadow-md ring-2 ring-teal-200'
                        : isPast && rdv.last_call_outcome
                        ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400 shadow-sm'
                        : isPast
                        ? 'bg-white border-amber-200 hover:border-amber-400 shadow-sm opacity-60'
                        : 'bg-white border-teal-200 hover:border-teal-400 shadow-sm'
                    }`}>
                    {isNext && <span className="text-[9px] text-white font-bold bg-teal-500 px-1.5 py-0.5 rounded animate-pulse">PROCHAIN</span>}
                    <span className={`text-[12px] font-mono font-bold ${isNext ? 'text-teal-700' : isPast ? 'text-amber-600' : 'text-teal-600'}`}>{time}</span>
                    <span className={`text-[12px] font-medium ${isNext ? 'text-teal-800' : 'text-gray-700'}`}>{rdv.name}</span>
                    {!isNext && isPast && !rdv.last_call_outcome && (
                      <span className="text-[9px] text-amber-500 font-bold bg-amber-50 px-1.5 py-0.5 rounded">EN RETARD</span>
                    )}
                    {!isNext && isPast && rdv.last_call_outcome && (
                      <span className="text-[9px] text-emerald-500 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">FAIT</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        )
      })()}

      {/* ── Filtres CRM actifs (colonnes) ── */}
      {filters.filter(f => f.propertyId !== '_call_status').length > 0 && (
        <div className="px-5 py-1.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-amber-600 font-medium">Filtres :</span>
          {filters.filter(f => f.propertyId !== '_call_status').map(f => {
            const prop = allProperties.find(p => p.id === f.propertyId)
            const opLabel: Record<string, string> = { eq: '=', neq: '≠', contains: '∋', starts: '→', empty: 'vide', not_empty: '≠ vide', gt: '>', lt: '<', in: '∈', true: 'Oui', false: 'Non' }
            const dv = columnDistinctValues.current[f.propertyId]
            return (
              <div key={f.id} className="flex items-center gap-1 bg-white rounded-lg border border-amber-200 px-2 py-0.5">
                <span className="text-[11px] text-gray-600 font-medium">{prop?.name || '?'}</span>
                <span className="text-[10px] text-amber-500">{opLabel[f.op] || f.op}</span>
                {!['empty', 'not_empty', 'true', 'false'].includes(f.op) && (
                  (dv || (prop?.fieldType === 'enum' && (prop as PropertyDefinition).options)) ? (
                    <select value={f.value} onChange={e => setFilters(prev => prev.map(pf => pf.id === f.id ? { ...pf, value: e.target.value } : pf))}
                      className="text-[11px] bg-transparent border-0 outline-none text-gray-700 font-medium cursor-pointer">
                      <option value="">tout</option>
                      {(dv || (prop as PropertyDefinition).options || []).map(v => (
                        <option key={v} value={v}>{crmLabels[v] || CRM_STATUS_LABELS[v] || v}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={f.value} onChange={e => setFilters(prev => prev.map(pf => pf.id === f.id ? { ...pf, value: e.target.value } : pf))}
                      placeholder="..." className="text-[11px] bg-transparent border-0 outline-none text-gray-700 font-medium w-20" />
                  )
                )}
                <button onClick={() => setFilters(prev => prev.filter(pf => pf.id !== f.id))}
                  className="text-amber-400 hover:text-red-500 ml-0.5">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )
          })}
          <button onClick={() => setFilters(prev => prev.filter(f => f.propertyId === '_call_status'))}
            className="text-[10px] text-amber-500 hover:text-red-500 ml-1">Effacer filtres</button>
        </div>
      )}

      {/* ── Barre actions groupées (quand sélection active) ── */}
      {selectedIds.size > 0 && (
        <div className="px-5 py-2 bg-indigo-50 border-y border-indigo-100 flex items-center gap-3 animate-fade-in">
          <span className="text-[13px] font-semibold text-indigo-700">{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
          <div className="h-4 w-px bg-indigo-200" />

          {/* Supprimer */}
          <button onClick={() => setConfirmDeleteProspects(true)} className="text-[12px] text-red-500 hover:text-red-700 flex items-center gap-1">
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
          {(perms.isAdmin) && (
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

      {/* ── Table (scroll horizontal contenu dans le cadre blanc) ── */}
      <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full border-collapse" style={{ width: 'max-content' }}>
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-gray-100 bg-gray-50/80">
                {/* Sticky headers */}
                <th className="py-3 pl-4 pr-1 border-r border-gray-100 sticky left-0 z-30 bg-violet-100/70"
                  style={{ width: STICKY_W.checkbox, minWidth: STICKY_W.checkbox }}>
                  <input type="checkbox"
                    checked={filtered ? filtered.length > 0 && selectedIds.size === filtered.length : false}
                    onChange={e => {
                      if (e.target.checked && filtered) setSelectedIds(new Set(filtered.map(p => p.id)))
                      else setSelectedIds(new Set())
                    }}
                    className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" />
                </th>
                <th className="py-3 px-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] border-r border-gray-100 sticky z-30 bg-violet-100/70 group/th"
                  style={{ left: STICKY_LEFT.status, width: STICKY_W.status, minWidth: STICKY_W.status }}>
                  <div className="flex items-center gap-1">
                    <span className="flex-1">Statut appel</span>
                    <button onClick={() => { if (sortBy === 'call_status') setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy('call_status'); setSortDir('asc') } }}
                      className={`flex-shrink-0 transition-opacity ${sortBy === 'call_status' ? 'opacity-100 text-indigo-500' : 'opacity-0 group-hover/th:opacity-60 text-gray-400'}`}>
                      {sortBy === 'call_status' && sortDir === 'desc'
                        ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>}
                    </button>
                  </div>
                </th>
                <th className="py-3 px-1 text-center text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] border-r border-gray-100 sticky z-30 bg-violet-100/70"
                  style={{ left: STICKY_LEFT.actions, width: STICKY_W.actions, minWidth: STICKY_W.actions }}>Actions</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] border-r border-gray-100 sticky z-30 bg-violet-100/70 group/th"
                  style={{ left: STICKY_LEFT.name, width: STICKY_W.name, minWidth: STICKY_W.name, boxShadow: '4px 0 8px -4px rgba(0,0,0,0.08)' }}>
                  <div className="flex items-center gap-1">
                    <span className="flex-1">Nom</span>
                    <button onClick={() => { if (sortBy === 'name') setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy('name'); setSortDir('asc') } }}
                      className={`flex-shrink-0 transition-opacity ${sortBy === 'name' ? 'opacity-100 text-indigo-500' : 'opacity-0 group-hover/th:opacity-60 text-gray-400'}`}>
                      {sortBy === 'name' && sortDir === 'desc'
                        ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>}
                    </button>
                  </div>
                </th>
                {activeColumns.map(col => {
                  const isSorted = sortBy === col.id
                  const w = colWidths[col.id]
                  return (
                    <th key={col.id}
                      draggable
                      onDragStart={() => setDragColId(col.id)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => {
                        if (dragColId && dragColId !== col.id) {
                          const from = visibleColumnIds.indexOf(dragColId)
                          const to = visibleColumnIds.indexOf(col.id)
                          if (from !== -1 && to !== -1) {
                            const next = [...visibleColumnIds]
                            next.splice(from, 1)
                            next.splice(to, 0, dragColId)
                            saveVisibleColumns(next)
                          }
                        }
                        setDragColId(null)
                      }}
                      onDragEnd={() => setDragColId(null)}
                      className={`py-3 px-3 text-left text-[10px] font-bold uppercase tracking-[0.08em] cursor-grab active:cursor-grabbing select-none whitespace-nowrap border-r border-gray-100 group/th relative ${
                        dragColId === col.id ? 'opacity-40' : ''
                      } ${col.type === 'custom' ? 'text-violet-400' : 'text-gray-400'}`}
                      style={w ? { width: w, minWidth: w } : undefined}>
                      <div className="flex items-center gap-1">
                        <span className="flex-1 truncate">{col.name}</span>
                        <button onClick={e => { e.stopPropagation(); if (isSorted) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(col.id); setSortDir('asc') } }}
                          title="Trier"
                          className={`flex-shrink-0 transition-opacity ${isSorted ? 'opacity-100 text-indigo-500' : 'opacity-0 group-hover/th:opacity-60 text-gray-400 hover:text-gray-600'}`}>
                          {isSorted && sortDir === 'desc'
                            ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          }
                        </button>
                        {/* Filtre colonne (HubSpot) */}
                        <button onClick={e => {
                          e.stopPropagation()
                          const existing = filters.find(f => f.propertyId === col.id)
                          if (existing) {
                            setFilters(prev => prev.filter(f => f.propertyId !== col.id))
                          } else {
                            const dv = columnDistinctValues.current[col.id]
                            const op: FilterOp = (col.fieldType === 'boolean') ? 'true' : (col.fieldType === 'enum' || dv) ? 'eq' : 'contains'
                            setFilters(prev => [...prev, { id: crypto.randomUUID(), propertyId: col.id, op, value: '' }])
                            setShowFilters(true)
                          }
                        }}
                          title="Filtrer"
                          className={`flex-shrink-0 transition-opacity ${filters.some(f => f.propertyId === col.id) ? 'opacity-100 text-indigo-500' : 'opacity-0 group-hover/th:opacity-60 text-gray-400 hover:text-gray-600'}`}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                        </button>
                        <button onClick={e => { e.stopPropagation(); saveVisibleColumns(visibleColumnIds.filter(c => c !== col.id)) }}
                          title="Masquer la colonne"
                          className="flex-shrink-0 opacity-0 group-hover/th:opacity-60 text-gray-400 hover:text-red-500 transition-opacity">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      {/* Resize handle */}
                      <div
                        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-400 active:bg-indigo-500 transition-colors z-10"
                        onMouseDown={e => {
                          e.preventDefault()
                          e.stopPropagation()
                          const th = (e.target as HTMLElement).parentElement!
                          const startW = th.offsetWidth
                          const startX = e.clientX
                          resizeRef.current = { colId: col.id, startX, startW }

                          const onMove = (ev: MouseEvent) => {
                            if (!resizeRef.current) return
                            const diff = ev.clientX - resizeRef.current.startX
                            const newW = Math.max(60, resizeRef.current.startW + diff)
                            setColWidths(prev => ({ ...prev, [resizeRef.current!.colId]: newW }))
                          }
                          const onUp = () => {
                            resizeRef.current = null
                            document.removeEventListener('mousemove', onMove)
                            document.removeEventListener('mouseup', onUp)
                          }
                          document.addEventListener('mousemove', onMove)
                          document.addEventListener('mouseup', onUp)
                        }}
                      />
                    </th>
                  )
                })}
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
                  columns={activeColumns}
                  customValues={allCustomValues?.[p.id]}
                  onToggleSelect={id => setSelectedIds(prev => {
                    const next = new Set(prev)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })}
                  onSelect={(p) => { if (cm.isDisconnected) cm.reset(); setSelectedProspect(p) }}
                  onCall={handleCall}
                  colWidths={colWidths}
                  crmLabels={crmLabels}
                  columnDistinctValues={columnDistinctValues.current}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ['prospects', activeListId] })}
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
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#2a2a2a] rounded-xl shadow-xl border border-white/10 p-4 z-[60] animate-slide-up">
                  <div className="grid grid-cols-3 gap-1.5">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(d => (
                      <button key={d} onClick={() => cm.sendDTMF(d)}
                        className="w-12 h-12 rounded-lg bg-white/10 text-white text-[17px] font-semibold hover:bg-white/20 active:bg-white/30 transition-colors border border-white/10">
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
      {(showCallSettings || showFilters || showColumnPicker || showViews || showSortDropdown) && <div className="fixed inset-0 z-40" onClick={() => { setShowCallSettings(false); setShowFilters(false); setShowColumnPicker(false); setShowViews(false); setSavingView(false); setShowSortDropdown(false) }} />}

      {/* Modal confirmation suppression prospects */}
      <ConfirmModal
        open={confirmDeleteProspects}
        title="Supprimer les contacts"
        message={`Supprimer ${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''} ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        onCancel={() => setConfirmDeleteProspects(false)}
        onConfirm={async () => {
          await supabase.from('prospects').delete().in('id', Array.from(selectedIds))
          setSelectedIds(new Set())
          setConfirmDeleteProspects(false)
          queryClient.invalidateQueries({ queryKey: ['prospects', activeListId] })
        }}
      />
    </div>
  )
}
