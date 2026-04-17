/**
 * Settings — Page admin complète Minari + HubSpot.
 * Layout 2 colonnes : nav sections (gauche) + contenu (droite).
 * Chaque section = composant interne.
 */

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useCrmStatuses, useCreateCrmStatus, useDeleteCrmStatus } from '@/hooks/useProperties'
import { supabase } from '@/config/supabase'
import { SYSTEM_PROPERTIES } from '@/config/properties'
import { usePermissions } from '@/hooks/usePermissions'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// ══════════════════════════════════════════════════════════════════
// SECTIONS
// ══════════════════════════════════════════════════════════════════

type Section = { id: string; label: string; icon: string; adminOnly?: boolean; superAdminOnly?: boolean; group?: string }

const SECTIONS: Section[] = [
  { id: 'call-settings', label: 'Appels', icon: '📞', group: 'Dialer' },
  { id: 'phone-numbers', label: 'Numéros de téléphone', icon: '📱', group: 'Dialer' },
  { id: 'phone-fields', label: 'Champs téléphone', icon: '📳', group: 'Dialer' },
  { id: 'incoming-calls', label: 'Appels entrants', icon: '📲', group: 'Dialer' },
  { id: 'lead-statuses', label: 'Statuts prospect', icon: '🏷', group: 'CRM' },
  { id: 'contact-fields', label: 'Champs contact', icon: '📋', group: 'CRM' },
  { id: 'dispositions', label: 'Dispositions appel', icon: '✅', group: 'CRM' },
  { id: 'field-mapping', label: 'Mapping champs', icon: '🔀', group: 'CRM' },
  { id: 'ai-summary', label: 'Résumé IA', icon: '🤖', group: 'IA' },
  { id: 'integrations', label: 'Intégrations', icon: '🔗', group: 'Connexions' },
  { id: 'crm-connections', label: 'Connexions CRM', icon: '⚡', group: 'Connexions' },
  { id: 'webhooks', label: 'Webhooks', icon: '🪝', group: 'Connexions' },
  { id: 'users', label: 'Utilisateurs', icon: '👥', group: 'Admin', adminOnly: true },
  { id: 'permissions', label: 'Permissions', icon: '🔒', group: 'Admin', adminOnly: true },
  { id: 'billing', label: 'Facturation', icon: '💳', group: 'Admin', superAdminOnly: true },
  { id: 'organisation', label: 'Organisation', icon: '🏢', group: 'Admin', adminOnly: true },
  { id: 'account', label: 'Mon compte', icon: '🔐', group: 'Compte' },
]

// ══════════════════════════════════════════════════════════════════
// HOOKS
// ══════════════════════════════════════════════════════════════════

type TwilioNumber = { sid: string; phone: string; friendlyName: string; capabilities: Record<string, boolean> }

function usePhoneNumbers() {
  return useQuery({
    queryKey: ['twilio-numbers'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Non connecté')
      const res = await fetch(`${SUPABASE_URL}/functions/v1/twilio-numbers?action=list`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const text = await res.text()
        console.error('[twilio-numbers] Error:', res.status, text)
        throw new Error(`Erreur Twilio (${res.status})`)
      }
      const data = await res.json()
      console.log('[twilio-numbers] Loaded:', data.numbers?.length, 'numbers')
      return (data.numbers || []) as TwilioNumber[]
    },
    staleTime: 60_000,
    retry: 1,
  })
}

function useOrgUpdate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orgId, updates }: { orgId: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase.from('organisations').update(updates).eq('id', orgId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organisation'] })
    },
  })
}

function useGoogleCalendarStatus() {
  return useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return { connected: false }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/google-auth?action=status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      return res.json()
    },
  })
}

function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase.from('profiles').select('*').eq('organisation_id', orgId).order('created_at')
      return data || []
    },
    enabled: !!orgId,
  })
}

function useCustomFields(orgId: string | undefined) {
  return useQuery({
    queryKey: ['prospect-fields-settings', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase.from('prospect_fields').select('*').eq('organisation_id', orgId).order('created_at')
      return data || []
    },
    enabled: !!orgId,
  })
}

// ══════════════════════════════════════════════════════════════════
// TOGGLE component
// ══════════════════════════════════════════════════════════════════
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full transition-all duration-200 relative flex-shrink-0 ${value ? 'bg-violet-500 shadow-violet-200 shadow-sm' : 'bg-gray-300'}`}>
      <div className={`w-5 h-5 bg-white rounded-full shadow-md absolute top-0.5 transition-all duration-200 ${value ? 'translate-x-5 scale-105' : 'translate-x-0.5'}`} />
    </button>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION 1 : APPELS
// ══════════════════════════════════════════════════════════════════
function CallSettings({ org, save }: { org: any; save: (u: Record<string, unknown>) => void }) {
  const [parallelCalls, setParallelCalls] = useState(org?.parallel_calls || 1)
  const [autoRotate, setAutoRotate] = useState(org?.auto_rotate_numbers ?? true)
  const [maxAttempts, setMaxAttempts] = useState(org?.max_call_attempts || 'unlimited')
  const [attemptPeriod, setAttemptPeriod] = useState(org?.attempt_period || 'per_day')
  const [voicemailDrop, setVoicemailDrop] = useState(org?.voicemail_drop ?? false)
  const [conversationThreshold, setConversationThreshold] = useState(org?.conversation_threshold || 30)

  return (
    <div className="space-y-6">
      <h2 className="text-[15px] font-bold text-gray-800">Paramètres d'appel</h2>

      {/* Appels parallèles */}
      <div className={parallelCalls <= 1 ? 'opacity-50' : ''}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-600">Appels parallèles</label>
          {parallelCalls <= 1 && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-400">MODE POWER DIALER — 1 appel à la fois</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => { setParallelCalls(n); save({ parallel_calls: n }) }}
              className={`w-10 h-10 rounded-lg text-sm font-semibold transition-all duration-150 ${
                parallelCalls === n ? 'bg-gray-800 text-white shadow-md scale-105' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>{n}</button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          {parallelCalls <= 1
            ? 'Power dialer : vous parlez à chaque prospect un par un'
            : `Parallel dialer : ${parallelCalls} appels simultanés, vous parlez au premier qui décroche`}
        </p>
      </div>

      {/* Auto rotate */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-semibold text-gray-600 block">Rotation auto des numéros</label>
          <p className="text-[11px] text-gray-400 mt-0.5">Alterne entre les numéros assignés</p>
        </div>
        <Toggle value={autoRotate} onChange={v => { setAutoRotate(v); save({ auto_rotate_numbers: v }) }} />
      </div>

      {/* Max attempts */}
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-2">Tentatives max par contact</label>
        <div className="flex items-center gap-2">
          <select value={maxAttempts} onChange={e => { setMaxAttempts(e.target.value); save({ max_call_attempts: e.target.value }) }}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 outline-none">
            <option value="unlimited">Illimité</option>
            {[1, 2, 3, 5, 10].map(n => <option key={n} value={String(n)}>{n}</option>)}
          </select>
          <select value={attemptPeriod} onChange={e => { setAttemptPeriod(e.target.value); save({ attempt_period: e.target.value }) }}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 outline-none">
            <option value="per_day">par jour</option>
            <option value="per_week">par semaine</option>
            <option value="total">total</option>
          </select>
        </div>
      </div>

      {/* Voicemail drop */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-semibold text-gray-600 block">Dépôt messagerie vocale</label>
          <p className="text-[11px] text-gray-400 mt-0.5">Message pré-enregistré auto sur les répondeurs</p>
        </div>
        <Toggle value={voicemailDrop} onChange={v => { setVoicemailDrop(v); save({ voicemail_drop: v }) }} />
      </div>

      {/* Conversation threshold */}
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-2">Seuil de conversation</label>
        <select value={conversationThreshold} onChange={e => { const v = Number(e.target.value); setConversationThreshold(v); save({ conversation_threshold: v }) }}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 outline-none">
          <option value={0}>0 seconde</option>
          <option value={30}>30 secondes</option>
          <option value={60}>60 secondes</option>
        </select>
        <p className="text-[11px] text-gray-400 mt-1.5">Durée minimum pour compter comme "Conversation" dans les analytics</p>
      </div>

      {/* Microphone test */}
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-2">Microphone</label>
        <MicrophoneTest />
      </div>
    </div>
  )
}

function MicrophoneTest() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selected, setSelected] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(all => {
      const mics = all.filter(d => d.kind === 'audioinput')
      setDevices(mics)
      if (mics.length > 0 && !selected) setSelected(mics[0].deviceId)
    }).catch(() => {})
  }, [])

  const testMic = async () => {
    setTesting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: selected ? { exact: selected } : undefined } })
      setTimeout(() => { stream.getTracks().forEach(t => t.stop()); setTesting(false) }, 2000)
    } catch { setTesting(false) }
  }

  return (
    <div className="flex items-center gap-2">
      <select value={selected} onChange={e => setSelected(e.target.value)}
        className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 outline-none truncate">
        {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
        {devices.length === 0 && <option>Aucun micro détecté</option>}
      </select>
      <button onClick={testMic} disabled={testing}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${testing ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
        {testing ? '🎙 Écoute...' : 'Tester'}
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION 2 : NUMÉROS
// ══════════════════════════════════════════════════════════════════
function PhoneNumbers({ org, save }: { org: any; save: (u: Record<string, unknown>) => void }) {
  const queryClient = useQueryClient()
  const { data: phoneNumbers, isLoading, isFetching, error: fetchError } = usePhoneNumbers()
  const [defaultNum, setDefaultNum] = useState(org?.from_number || '+33757905591')
  const [showBuy, setShowBuy] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [searchCountry, setSearchCountry] = useState('FR')
  const [searchType, setSearchType] = useState('mobile')
  const [buying, setBuying] = useState<string | null>(null)
  const [releasing, setReleasing] = useState<string | null>(null)
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apiCall = async (action: string, params?: Record<string, string>, body?: Record<string, string>) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const qs = new URLSearchParams({ action, ...params }).toString()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/twilio-numbers?${qs}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return res.json()
  }

  const handleSearch = async () => {
    setSearching(true); setError(null)
    const data = await apiCall('search', { country: searchCountry, type: searchType, limit: '10' })
    setSearchResults(data?.numbers || [])
    if (data?.error) setError(data.error)
    setSearching(false)
  }

  const handleBuy = async (phone: string) => {
    setBuying(phone); setError(null)
    const data = await apiCall('buy', {}, { phoneNumber: phone })
    if (data?.ok) {
      setSearchResults(prev => prev.filter(n => n.phone !== phone))
      queryClient.invalidateQueries({ queryKey: ['twilio-numbers'] })
    } else {
      setError(data?.error || 'Erreur lors de l\'achat')
    }
    setBuying(null)
  }

  const handleRelease = async (sid: string) => {
    setReleasing(sid); setError(null)
    const data = await apiCall('release', {}, { sid })
    if (data?.ok) {
      queryClient.invalidateQueries({ queryKey: ['twilio-numbers'] })
      setConfirmRelease(null)
    } else {
      setError(data?.error || 'Erreur lors de la suppression')
    }
    setReleasing(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-gray-800">Numéros de téléphone</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['twilio-numbers'] })}
            className={`text-[11px] text-gray-400 hover:text-gray-600 transition-transform ${isFetching ? 'animate-spin' : ''}`}>↻ {isFetching ? '' : 'Rafraîchir'}</button>
          <button onClick={() => setShowBuy(!showBuy)}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-violet-500 text-white hover:bg-violet-600">
            {showBuy ? 'Fermer' : '+ Acheter un numéro'}
          </button>
        </div>
      </div>

      {(error || fetchError) && (
        <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-600">
          {error || (fetchError as Error)?.message || 'Erreur de chargement'}
        </div>
      )}

      {/* Mes numéros */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-4">
          <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-400">Chargement des numéros Twilio...</p>
        </div>
      ) : !phoneNumbers || phoneNumbers.length === 0 ? (
        <p className="text-xs text-gray-400">Aucun numéro sur le compte</p>
      ) : (
        <div className="space-y-2">
          {phoneNumbers.map(num => {
            const isDefault = defaultNum === num.phone
            return (
              <div key={num.sid} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                isDefault ? 'border-violet-300 bg-violet-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
                {/* Radio pour défaut */}
                <div onClick={() => { setDefaultNum(num.phone); save({ from_number: num.phone }) }}
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 cursor-pointer ${isDefault ? 'border-violet-500' : 'border-gray-300'}`}>
                  {isDefault && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setDefaultNum(num.phone); save({ from_number: num.phone }) }}>
                  <p className={`text-[13px] font-mono font-semibold ${isDefault ? 'text-violet-700' : 'text-gray-700'}`}>{num.phone}</p>
                  <p className="text-[11px] text-gray-400">{num.friendlyName}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {num.capabilities?.voice && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">VOIX</span>}
                  {num.capabilities?.sms && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">SMS</span>}
                  {isDefault && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 border border-violet-200">PAR DÉFAUT</span>}
                  {/* Supprimer */}
                  {confirmRelease === num.sid ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleRelease(num.sid)} disabled={releasing === num.sid}
                        className="text-[10px] font-bold px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600">
                        {releasing === num.sid ? '...' : 'Confirmer'}
                      </button>
                      <button onClick={() => setConfirmRelease(null)} className="text-[10px] text-gray-400">Annuler</button>
                    </div>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); setConfirmRelease(num.sid) }}
                      className="text-[10px] text-gray-300 hover:text-red-500" title="Supprimer ce numéro">✕</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-400">Cliquez pour définir le numéro par défaut. Le ✕ libère le numéro (résiliation).</p>

      {/* Acheter un numéro */}
      {showBuy && (
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-[13px] font-semibold text-gray-700">Chercher un numéro disponible</p>
          <div className="flex items-center gap-2">
            <select value={searchCountry} onChange={e => setSearchCountry(e.target.value)}
              className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none">
              <option value="FR">France (+33)</option>
              <option value="US">USA (+1)</option>
              <option value="GB">UK (+44)</option>
              <option value="BE">Belgique (+32)</option>
              <option value="CH">Suisse (+41)</option>
              <option value="CA">Canada (+1)</option>
            </select>
            <select value={searchType} onChange={e => setSearchType(e.target.value)}
              className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none">
              <option value="mobile">Mobile</option>
              <option value="local">Fixe</option>
              <option value="tollFree">Numéro vert</option>
            </select>
            <button onClick={handleSearch} disabled={searching}
              className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-[12px] font-medium hover:bg-gray-900 disabled:opacity-50">
              {searching ? 'Recherche...' : 'Chercher'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {searchResults.map(num => (
                <div key={num.phone} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 hover:border-gray-300">
                  <div className="flex-1">
                    <p className="text-[13px] font-mono font-semibold text-gray-700">{num.phone}</p>
                    <p className="text-[11px] text-gray-400">{num.locality || num.region || num.friendlyName}</p>
                  </div>
                  {num.capabilities?.voice && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">VOIX</span>}
                  <button onClick={() => handleBuy(num.phone)} disabled={buying === num.phone}
                    className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[11px] font-medium hover:bg-emerald-600 disabled:opacity-50">
                    {buying === num.phone ? 'Achat...' : 'Acheter'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {searchResults.length === 0 && !searching && (
            <p className="text-[11px] text-gray-400">Lancez une recherche pour voir les numéros disponibles.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION 3 : STATUTS CRM
// ══════════════════════════════════════════════════════════════════
function LeadStatuses() {
  const { data: statuses } = useCrmStatuses()
  const createStatus = useCreateCrmStatus()
  const deleteStatus = useDeleteCrmStatus()
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')

  const handleCreate = async () => {
    if (!newLabel.trim()) return
    const key = newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
    await createStatus.mutateAsync({ key, label: newLabel.trim(), color: newColor })
    setNewLabel('')
  }

  const PROTECTED_KEYS = ['new', 'attempted_to_contact', 'connected', 'callback', 'not_interested', 'rdv_pris', 'rdv_fait', 'signe', 'paye']

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Statuts CRM (Pipeline)</h2>
      <p className="text-[11px] text-gray-400">Définissez les étapes de votre pipeline commercial. Les statuts système ne peuvent pas être supprimés.</p>

      <div className="space-y-1.5">
        {(statuses || []).map(s => (
          <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-gray-200">
            <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-[13px] text-gray-700 flex-1">{s.label}</span>
            <span className="text-[10px] text-gray-300 font-mono">{s.key}</span>
            {!PROTECTED_KEYS.includes(s.key) && (
              <button onClick={() => deleteStatus.mutate(s.id)} className="text-[10px] text-gray-300 hover:text-red-500">✕</button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-8 h-8 rounded border-0 cursor-pointer" />
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Nouveau statut..."
          className="flex-1 text-[13px] border border-gray-200 rounded-lg px-3 py-1.5 outline-none"
          onKeyDown={e => e.key === 'Enter' && handleCreate()} />
        <button onClick={handleCreate} disabled={!newLabel.trim()}
          className="px-3 py-1.5 bg-violet-500 text-white rounded-lg text-[12px] font-medium hover:bg-violet-600 disabled:opacity-40">
          Ajouter
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION 4 : CHAMPS CONTACT
// ══════════════════════════════════════════════════════════════════
function ContactFields({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const { data: customFields } = useCustomFields(orgId)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('text')

  const systemProps = SYSTEM_PROPERTIES.filter(p => !p.isReadOnly)

  const handleCreate = async () => {
    if (!newName.trim()) return
    await supabase.from('prospect_fields').insert({
      organisation_id: orgId,
      name: newName.trim(),
      field_type: newType,
    })
    queryClient.invalidateQueries({ queryKey: ['prospect-fields-settings'] })
    queryClient.invalidateQueries({ queryKey: ['prospect-fields'] })
    setNewName('')
  }

  const handleDelete = async (id: string) => {
    // Soft-delete (archive) : trigger DB refuse hard DELETE. Les field_values existants
    // restent en base mais ne sont plus lus (filtre deleted_at IS NULL côté front).
    await supabase.from('prospect_fields').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['prospect-fields-settings'] })
    queryClient.invalidateQueries({ queryKey: ['prospect-fields'] })
  }

  return (
    <div className="space-y-5">
      <h2 className="text-[15px] font-bold text-gray-800">Champs contact</h2>

      {/* System fields */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Champs système</p>
        <div className="grid grid-cols-2 gap-1.5">
          {systemProps.map(p => (
            <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50">
              <span className="text-[12px] text-gray-600">{p.name}</span>
              <span className="text-[9px] text-gray-300 ml-auto">{p.fieldType}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom fields */}
      <div>
        <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-2">Champs personnalisés</p>
        {customFields && customFields.length > 0 ? (
          <div className="space-y-1.5">
            {customFields.map((f: any) => (
              <div key={f.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-violet-50 border border-violet-100">
                <span className="text-[12px] text-violet-700">{f.name}</span>
                <span className="text-[9px] text-violet-300 ml-auto">{f.field_type}</span>
                <button onClick={() => handleDelete(f.id)} className="text-[10px] text-violet-300 hover:text-red-500">✕</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">Aucun champ personnalisé</p>
        )}
      </div>

      {/* Create */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom du champ..."
          className="flex-1 text-[13px] border border-gray-200 rounded-lg px-3 py-1.5 outline-none"
          onKeyDown={e => e.key === 'Enter' && handleCreate()} />
        <select value={newType} onChange={e => setNewType(e.target.value)}
          className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none">
          <option value="text">Texte</option>
          <option value="number">Nombre</option>
          <option value="date">Date</option>
          <option value="enum">Liste</option>
          <option value="boolean">Oui/Non</option>
          <option value="url">URL</option>
          <option value="email">Email</option>
        </select>
        <button onClick={handleCreate} disabled={!newName.trim()}
          className="px-3 py-1.5 bg-violet-500 text-white rounded-lg text-[12px] font-medium hover:bg-violet-600 disabled:opacity-40">
          Ajouter
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION 5 : DISPOSITIONS
// ══════════════════════════════════════════════════════════════════
function Dispositions() {
  const dispositions = [
    { key: 'connected', label: 'Connecté', color: '#059669', terminal: false },
    { key: 'callback', label: 'Rappel', color: '#7c3aed', terminal: false },
    { key: 'not_interested', label: 'Pas intéressé', color: '#6b7280', terminal: true },
    { key: 'no_answer', label: 'Pas de réponse', color: '#9ca3af', terminal: false },
    { key: 'voicemail', label: 'Messagerie', color: '#9ca3af', terminal: false },
    { key: 'busy', label: 'Occupé', color: '#d97706', terminal: false },
    { key: 'wrong_number', label: 'Mauvais numéro', color: '#dc2626', terminal: true },
    { key: 'dnc', label: 'Ne pas appeler', color: '#dc2626', terminal: true },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Dispositions d'appel</h2>
      <p className="text-[11px] text-gray-400">Les dispositions déterminent le résultat de chaque appel. Les dispositions "terminales" excluent le contact des prochains appels.</p>

      <div className="space-y-1.5">
        {dispositions.map(d => (
          <div key={d.key} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="text-[13px] text-gray-700 flex-1">{d.label}</span>
            {d.terminal ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500 border border-red-200">TERMINAL</span>
            ) : (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-500 border border-emerald-200">RELANCER</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION 6 : APPELS ENTRANTS
// ══════════════════════════════════════════════════════════════════
function IncomingCalls({ org, save }: { org: any; save: (u: Record<string, unknown>) => void }) {
  const [mode, setMode] = useState(org?.callback_mode || 'calsyn_only')
  const [redirectNumber, setRedirectNumber] = useState(org?.callback_redirect_number || '')

  const modes = [
    { value: 'calsyn_only', label: 'Callback dans Calsyn uniquement', desc: 'Les appels sonnent si l\'onglet est ouvert' },
    { value: 'calsyn_redirect', label: 'Callback + Redirection', desc: 'Si Calsyn est fermé, redirige vers un numéro externe' },
    { value: 'redirect_only', label: 'Redirection forcée', desc: 'Tous les callbacks redirigés vers un numéro externe' },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Appels entrants (Callback)</h2>
      <div className="space-y-2">
        {modes.map(m => (
          <label key={m.value} onClick={() => { setMode(m.value); save({ callback_mode: m.value }) }}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              mode === m.value ? 'border-violet-300 bg-violet-50' : 'border-gray-200 hover:bg-gray-50'
            }`}>
            <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
              mode === m.value ? 'border-violet-500' : 'border-gray-300'
            }`}>
              {mode === m.value && <div className="w-2 h-2 rounded-full bg-violet-500" />}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700">{m.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{m.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {mode !== 'calsyn_only' && (
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1.5">Numéro de redirection</label>
          <input value={redirectNumber} onChange={e => setRedirectNumber(e.target.value)}
            onBlur={() => save({ callback_redirect_number: redirectNumber })}
            placeholder="+33612345678"
            className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 outline-none font-mono" />
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION 7 : RÉSUMÉ IA
// ══════════════════════════════════════════════════════════════════
function AiSummary() {
  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Résumé IA</h2>
      <p className="text-[11px] text-gray-400">Les transcriptions sont générées pour les appels de 20 secondes minimum. Langues auto-détectées : FR, EN, DE, IT, ES.</p>

      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Prompt standard (actif)</p>
        <p className="text-[12px] text-gray-600">Résumé de l'appel, points clés, signaux d'intérêt, scores accroche/objection/closing, intention prospect, prochaine étape.</p>
      </div>

      <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
        <p className="text-[10px] font-bold text-violet-400 uppercase mb-1">Moteur</p>
        <div className="flex items-center gap-4 text-[12px]">
          <span className="text-violet-700 font-medium">Transcription : Deepgram Nova-3</span>
          <span className="text-violet-700 font-medium">Analyse : Claude Sonnet</span>
        </div>
      </div>

      <button className="text-xs text-violet-600 hover:text-violet-700 font-medium">+ Nouveau prompt personnalisé</button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION 8 : INTÉGRATIONS
// ══════════════════════════════════════════════════════════════════
function IntegrationsSection() {
  const { data: gcalStatus } = useGoogleCalendarStatus()

  const integrations = [
    {
      name: 'Google Calendar',
      icon: <svg className="w-6 h-6" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>,
      connected: gcalStatus?.connected,
      description: 'Synchronise vos RDV et événements',
    },
    { name: 'HubSpot', icon: <span className="text-[20px]">🟠</span>, connected: false, description: 'Sync bidirectionnelle contacts & deals', soon: true },
    { name: 'Salesforce', icon: <span className="text-[20px]">☁️</span>, connected: false, description: 'Sync contacts, opportunités, activités', soon: true },
    { name: 'Slack', icon: <span className="text-[20px]">💬</span>, connected: false, description: 'Notifications d\'appels et RDV', soon: true },
    { name: 'Lemlist', icon: <span className="text-[20px]">📧</span>, connected: false, description: 'Import listes de prospection', soon: true },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Intégrations</h2>
      <div className="space-y-2">
        {integrations.map(integ => (
          <div key={integ.name} className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">{integ.icon}</div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-gray-800">{integ.name}</p>
              <p className="text-[11px] text-gray-400">{integ.description}</p>
            </div>
            {integ.soon ? (
              <span className="text-[10px] font-bold px-2 py-1 rounded bg-gray-100 text-gray-400">BIENTÔT</span>
            ) : integ.connected ? (
              <span className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">CONNECTÉ</span>
            ) : (
              <button className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-violet-50 text-violet-600 border border-violet-200 hover:bg-violet-100">
                Connecter
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION 9 : UTILISATEURS (admin)
// ══════════════════════════════════════════════════════════════════
function UsersSection({ orgId, phoneNumbers }: { orgId: string; phoneNumbers?: TwilioNumber[] }) {
  const { data: members } = useOrgMembers(orgId)
  const queryClient = useQueryClient()
  const perms = usePermissions()

  // 3 rôles effectifs — super_admin visible uniquement pour les super_admin
  const roles = perms.isSuperAdmin
    ? [
        { value: 'super_admin', label: 'Super Admin', color: '#dc2626' },
        { value: 'admin', label: 'Admin', color: '#7c3aed' },
        { value: 'sdr', label: 'Commercial', color: '#059669' },
      ]
    : [
        { value: 'admin', label: 'Admin', color: '#7c3aed' },
        { value: 'sdr', label: 'Commercial', color: '#059669' },
      ]

  const changeRole = async (profileId: string, role: string) => {
    if (!perms.canChangeRoles && role !== 'sdr') return // Admin ne peut créer que des SDRs
    await supabase.from('profiles').update({ role }).eq('id', profileId)
    queryClient.invalidateQueries({ queryKey: ['org-members'] })
  }

  const assignPhone = async (profileId: string, phone: string) => {
    await supabase.from('profiles').update({ assigned_phone: phone || null }).eq('id', profileId)
    queryClient.invalidateQueries({ queryKey: ['org-members'] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-gray-800">Utilisateurs</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[11px] text-gray-400">Parallel dialer: <strong className="text-gray-600">{members?.length || 0}/{5}</strong></span>
            <span className="text-[11px] text-gray-400">Power dialer: <strong className="text-gray-600">0/0</strong></span>
          </div>
        </div>
        <button className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-violet-500 text-white hover:bg-violet-600">
          + Inviter
        </button>
      </div>

      {/* Table header */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 gap-0 bg-gray-50 border-b border-gray-200 px-3 py-2">
          <span className="col-span-3 text-[10px] font-bold text-gray-400 uppercase">Utilisateur</span>
          <span className="col-span-2 text-[10px] font-bold text-gray-400 uppercase">Type</span>
          <span className="col-span-2 text-[10px] font-bold text-gray-400 uppercase">Rôle</span>
          <span className="col-span-2 text-[10px] font-bold text-gray-400 uppercase">Licence</span>
          <span className="col-span-3 text-[10px] font-bold text-gray-400 uppercase">Numéro assigné</span>
        </div>
        {(members || []).map((m: any) => {
          const roleInfo = roles.find(r => r.value === m.role)
          return (
            <div key={m.id} className="grid grid-cols-12 gap-0 px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 items-center">
              {/* Name + email */}
              <div className="col-span-3 flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-[11px] flex-shrink-0">
                  {(m.full_name || m.email || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-gray-800 truncate">{m.full_name || 'Sans nom'}</p>
                  <p className="text-[10px] text-gray-400 truncate">{m.email}</p>
                </div>
              </div>
              {/* Type badge */}
              <div className="col-span-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">User</span>
              </div>
              {/* Role */}
              <div className="col-span-2">
                <select value={m.role} onChange={e => changeRole(m.id, e.target.value)}
                  className="text-[11px] font-bold px-2 py-1 rounded-lg border outline-none w-full"
                  style={{ color: roleInfo?.color, borderColor: roleInfo?.color + '40', background: roleInfo?.color + '10' }}>
                  {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {/* License */}
              <div className="col-span-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-200">Parallel</span>
              </div>
              {/* Phone number */}
              <div className="col-span-3">
                <select value={m.assigned_phone || ''} onChange={e => assignPhone(m.id, e.target.value)}
                  disabled={!perms.canAssignPhoneNumbers}
                  className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 outline-none w-full text-gray-600">
                  <option value="">Numéro par défaut org</option>
                  {(phoneNumbers || []).map(n => (
                    <option key={n.sid} value={n.phone}>{n.phone}</option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION 10 : FACTURATION (admin)
// ══════════════════════════════════════════════════════════════════
function BillingSection({ org }: { org: any }) {
  const plans: Record<string, { label: string; price: string; color: string }> = {
    starter: { label: 'Starter', price: '0€/mois', color: '#6b7280' },
    growth: { label: 'Growth', price: '79€/mois', color: '#7c3aed' },
    scale: { label: 'Scale', price: '199€/mois', color: '#059669' },
  }
  const plan = plans[org?.plan || 'starter'] || plans.starter

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Facturation</h2>

      <div className="p-4 rounded-lg border-2 border-dashed" style={{ borderColor: plan.color + '60' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: plan.color }}>Plan actuel</p>
            <p className="text-[18px] font-bold text-gray-800 mt-1">{plan.label}</p>
          </div>
          <p className="text-[20px] font-bold" style={{ color: plan.color }}>{plan.price}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
          <p className="text-[10px] font-bold text-gray-400 uppercase">Crédit VoIP</p>
          <p className="text-[16px] font-bold text-gray-800 mt-1">{org?.credit_balance?.toFixed(2) || '0.00'} €</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
          <p className="text-[10px] font-bold text-gray-400 uppercase">Postes max</p>
          <p className="text-[16px] font-bold text-gray-800 mt-1">{org?.max_sdrs || 5}</p>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION 11 : ORGANISATION
// ══════════════════════════════════════════════════════════════════
function AccountSection() {
  const { profile } = useAuth()
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const submit = async () => {
    setMsg(null)
    if (pwd.length < 8) { setMsg({ type: 'err', text: 'Minimum 8 caractères.' }); return }
    if (pwd !== confirm) { setMsg({ type: 'err', text: 'Les deux mots de passe ne correspondent pas.' }); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pwd })
    setBusy(false)
    if (error) { setMsg({ type: 'err', text: error.message }); return }
    setPwd(''); setConfirm('')
    setMsg({ type: 'ok', text: 'Mot de passe changé. Toutes les autres sessions (autres appareils, autres navigateurs) sont invalidées — la prochaine personne qui tentera une action devra se reconnecter.' })
  }

  return (
    <div className="space-y-4 max-w-xl">
      <h2 className="text-[15px] font-bold text-gray-800">Mon compte</h2>
      <p className="text-[12px] text-gray-400">Connecté en tant que <span className="font-semibold text-gray-600">{profile?.email}</span></p>

      <div className="space-y-3 pt-2 border-t border-gray-100">
        <h3 className="text-[13px] font-semibold text-gray-700">Changer le mot de passe</h3>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1.5">Nouveau mot de passe</label>
          <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="new-password"
            className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1.5">Confirmer</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password"
            className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400" />
        </div>
        <button onClick={submit} disabled={busy || !pwd || !confirm}
          className="px-4 py-2 rounded-lg bg-violet-600 text-white text-[13px] font-semibold hover:bg-violet-700 disabled:opacity-40">
          {busy ? 'Changement…' : 'Changer le mot de passe'}
        </button>
        {msg && (
          <p className={`text-[12px] mt-2 ${msg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
function OrganisationSection({ org, save }: { org: any; save: (u: Record<string, unknown>) => void }) {
  const [name, setName] = useState(org?.name || '')

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Organisation</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1.5">Nom</label>
          <input value={name} onChange={e => setName(e.target.value)} onBlur={() => save({ name })}
            className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">Slug</label>
            <p className="text-[13px] text-gray-600 mt-1">{org?.slug || '—'}</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">Fournisseur VoIP</label>
            <p className="text-[13px] text-gray-600 mt-1">{org?.voice_provider || 'twilio'}</p>
          </div>
        </div>
      </div>

      {/* Config VoIP (read-only) */}
      <div className="pt-4 border-t border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Secrets VoIP (serveur)</p>
        <div className="space-y-1.5">
          {['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_TWIML_APP_SID'].map(key => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-gray-400 w-48">{key}</span>
              <span className="text-[11px] text-violet-500 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Configuré
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION : CHAMPS TÉLÉPHONE (Minari Phone Fields)
// ══════════════════════════════════════════════════════════════════
function PhoneFieldsSection({ org, save }: { org: any; save: (u: Record<string, unknown>) => void }) {
  const phoneFields = [
    { key: 'phone', label: 'Téléphone principal', desc: 'Champ par défaut utilisé pour appeler' },
    { key: 'phone2', label: 'Téléphone 2', desc: 'Numéro secondaire' },
    { key: 'phone3', label: 'Téléphone 3', desc: 'Numéro tertiaire' },
    { key: 'phone4', label: 'Téléphone 4', desc: 'Numéro alternatif' },
    { key: 'phone5', label: 'Téléphone 5', desc: 'Dernier recours' },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Champs téléphone</h2>
      <p className="text-[11px] text-gray-400">Configurez l'ordre dans lequel le dialer utilise les champs téléphone de chaque prospect. Jusqu'à 5 numéros par contact.</p>

      <div className="space-y-2">
        {phoneFields.map((f, i) => (
          <div key={f.key} className={`flex items-center gap-3 p-3 rounded-lg border ${i === 0 ? 'border-violet-200 bg-violet-50' : 'border-gray-200'}`}>
            <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-bold text-gray-500">{i + 1}</span>
            <div className="flex-1">
              <p className={`text-[13px] font-medium ${i === 0 ? 'text-violet-700' : 'text-gray-700'}`}>{f.label}</p>
              <p className="text-[11px] text-gray-400">{f.desc}</p>
            </div>
            {i === 0 && <span className="text-[9px] font-bold px-2 py-1 rounded bg-violet-100 text-violet-600">PRIORITAIRE</span>}
          </div>
        ))}
      </div>

      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
        <p className="text-[11px] text-gray-500">Le dialer appelle d'abord le champ "Téléphone principal". Si pas de réponse et qu'un téléphone 2 existe, il basculera automatiquement au prochain numéro disponible.</p>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION : FIELD MAPPING
// ══════════════════════════════════════════════════════════════════
function FieldMappingSection() {
  const mappings = [
    { calsyn: 'name', crm: 'firstname + lastname', synced: true },
    { calsyn: 'email', crm: 'email', synced: true },
    { calsyn: 'phone', crm: 'phone', synced: true },
    { calsyn: 'company', crm: 'company', synced: true },
    { calsyn: 'title', crm: 'jobtitle', synced: true },
    { calsyn: 'crm_status', crm: 'lifecyclestage', synced: false },
    { calsyn: 'meeting_booked', crm: 'calsyn_meeting_booked', synced: false },
    { calsyn: 'last_call_outcome', crm: 'calsyn_last_outcome', synced: false },
    { calsyn: 'snoozed_until', crm: 'calsyn_snooze_until', synced: false },
    { calsyn: 'do_not_call', crm: 'calsyn_do_not_call', synced: false },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Mapping des champs</h2>
      <p className="text-[11px] text-gray-400">Correspondance entre les champs Calsyn et votre CRM externe. La sync bidirectionnelle met à jour les deux côtés en temps réel.</p>

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-3 gap-0 bg-gray-50 border-b border-gray-200 px-3 py-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase">Champ Calsyn</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase">Champ CRM</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase text-right">Sync</span>
        </div>
        {mappings.map(m => (
          <div key={m.calsyn} className="grid grid-cols-3 gap-0 px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50">
            <span className="text-[12px] font-mono text-violet-600">{m.calsyn}</span>
            <span className="text-[12px] font-mono text-gray-600">{m.crm}</span>
            <div className="text-right">
              {m.synced ? (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">ACTIF</span>
              ) : (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">INACTIF</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400">Le mapping sera actif une fois votre CRM connecté dans la section Connexions CRM.</p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION : CRM CONNECTIONS
// ══════════════════════════════════════════════════════════════════
function CrmConnectionsSection() {
  const crms = [
    { name: 'HubSpot', icon: '🟠', desc: 'Contacts, Companies, Deals, Activities', features: ['Sync bidirectionnelle', 'Import listes', 'Champs custom', 'Activités d\'appel'], soon: true },
    { name: 'Salesforce', icon: '☁️', desc: 'Contacts, Leads, Opportunities, Tasks', features: ['Sync contacts', 'Log appels auto', 'Mise à jour statuts'], soon: true },
    { name: 'Pipedrive', icon: '🟢', desc: 'Contacts, Deals, Activities', features: ['Sync contacts', 'Création deals auto', 'Notes d\'appel'], soon: true },
    { name: 'Lemlist', icon: '📧', desc: 'Import de campagnes et séquences', features: ['Import listes', 'Sync statuts', 'Enrichissement'], soon: true },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Connexions CRM</h2>
      <p className="text-[11px] text-gray-400">Connectez votre CRM pour synchroniser les contacts, les activités d'appel et les statuts en temps réel.</p>

      <div className="space-y-3">
        {crms.map(crm => (
          <div key={crm.name} className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[24px]">{crm.icon}</span>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-gray-800">{crm.name}</p>
                <p className="text-[11px] text-gray-400">{crm.desc}</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded bg-gray-100 text-gray-400">BIENTÔT</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {crm.features.map(f => (
                <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-100">{f}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION : WEBHOOKS
// ══════════════════════════════════════════════════════════════════
function WebhooksSection({ org }: { org: any }) {
  const [webhookUrl, setWebhookUrl] = useState('')
  const events = [
    { key: 'call.completed', label: 'Appel terminé', desc: 'Déclenché quand un appel se termine (tous les outcomes)' },
    { key: 'call.connected', label: 'Appel connecté', desc: 'Déclenché quand un prospect décroche (durée > 8s)' },
    { key: 'meeting.booked', label: 'RDV pris', desc: 'Déclenché quand un RDV est marqué dans la fiche' },
    { key: 'prospect.updated', label: 'Prospect modifié', desc: 'Déclenché quand un champ prospect change' },
    { key: 'analysis.completed', label: 'Analyse IA terminée', desc: 'Déclenché quand la transcription + résumé IA sont prêts' },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Webhooks</h2>
      <p className="text-[11px] text-gray-400">Envoyez des événements en temps réel vers vos outils (n8n, Make, Zapier). Payload JSON signé avec HMAC-SHA256.</p>

      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1.5">URL de destination</label>
        <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.zapier.com/... ou https://n8n.example.com/webhook/..."
          className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 outline-none font-mono" />
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-2">Événements</label>
        <div className="space-y-1.5">
          {events.map(ev => (
            <label key={ev.key} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-violet-600 w-3.5 h-3.5" />
              <div>
                <p className="text-[12px] font-medium text-gray-700">{ev.label}</p>
                <p className="text-[10px] text-gray-400">{ev.desc}</p>
                <p className="text-[10px] font-mono text-violet-400 mt-0.5">{ev.key}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
        <p className="text-[10px] font-bold text-violet-400 uppercase mb-1">Payload exemple</p>
        <pre className="text-[10px] text-violet-600 font-mono whitespace-pre-wrap">{`{
  "event": "call.completed",
  "call_sid": "CA...",
  "prospect": { "name": "...", "phone": "..." },
  "outcome": "connected",
  "duration": 245,
  "recording_url": "https://...",
  "timestamp": "2026-04-13T18:00:00Z"
}`}</pre>
      </div>

      <button disabled className="px-4 py-2 bg-violet-500 text-white rounded-lg text-[12px] font-medium opacity-50 cursor-not-allowed">
        Sauvegarder (bientôt)
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SECTION : PERMISSIONS CRM (par rôle)
// ══════════════════════════════════════════════════════════════════
function PermissionsSection() {
  const roles = ['Super Admin', 'Admin', 'Manager', 'SDR']
  const permissions = [
    { key: 'view_all_contacts', label: 'Voir tous les contacts', desc: 'Accès à toutes les listes de l\'organisation', admin: true, manager: true, sdr: false },
    { key: 'edit_contacts', label: 'Modifier les contacts', desc: 'Éditer les champs des fiches prospect', admin: true, manager: true, sdr: true },
    { key: 'delete_contacts', label: 'Supprimer des contacts', desc: 'Supprimer définitivement des prospects', admin: true, manager: false, sdr: false },
    { key: 'import_csv', label: 'Importer des CSV', desc: 'Créer des listes et importer des fichiers', admin: true, manager: true, sdr: false },
    { key: 'manage_lists', label: 'Gérer les listes', desc: 'Créer, renommer, supprimer des listes', admin: true, manager: true, sdr: false },
    { key: 'view_recordings', label: 'Écouter les enregistrements', desc: 'Accès aux recordings de tous les agents', admin: true, manager: true, sdr: false },
    { key: 'view_own_recordings', label: 'Écouter ses enregistrements', desc: 'Accès uniquement à ses propres recordings', admin: true, manager: true, sdr: true },
    { key: 'change_crm_status', label: 'Modifier statut CRM', desc: 'Changer le statut pipeline des prospects', admin: true, manager: true, sdr: true },
    { key: 'change_disposition', label: 'Modifier disposition', desc: 'Changer le résultat d\'appel', admin: true, manager: true, sdr: true },
    { key: 'book_meetings', label: 'Programmer des RDV', desc: 'Marquer meeting booked et fixer des dates', admin: true, manager: true, sdr: true },
    { key: 'view_analytics', label: 'Voir les analytics', desc: 'Accès au dashboard de performance', admin: true, manager: true, sdr: false },
    { key: 'manage_users', label: 'Gérer les utilisateurs', desc: 'Inviter, modifier les rôles, désactiver', admin: true, manager: false, sdr: false },
    { key: 'manage_settings', label: 'Accès aux réglages', desc: 'Modifier les paramètres de l\'organisation', admin: true, manager: false, sdr: false },
    { key: 'manage_integrations', label: 'Gérer les intégrations', desc: 'Connecter/déconnecter des services externes', admin: true, manager: false, sdr: false },
    { key: 'manage_billing', label: 'Gérer la facturation', desc: 'Voir et modifier le plan, les licences', admin: true, manager: false, sdr: false },
    { key: 'export_data', label: 'Exporter les données', desc: 'Export CSV des contacts et appels', admin: true, manager: true, sdr: false },
    { key: 'do_not_call', label: 'Marquer "Ne pas appeler"', desc: 'Bloquer un prospect des futures sessions', admin: true, manager: true, sdr: true },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-bold text-gray-800">Permissions par rôle</h2>
      <p className="text-[11px] text-gray-400">Définissez ce que chaque rôle peut faire dans Calsyn. Les Super Admins ont tous les droits.</p>

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-0 bg-gray-50 border-b border-gray-200 px-3 py-2.5">
          <span className="col-span-5 text-[10px] font-bold text-gray-400 uppercase">Permission</span>
          {roles.map(r => (
            <span key={r} className="col-span-1 text-[10px] font-bold text-gray-400 uppercase text-center">{r.split(' ').pop()}</span>
          ))}
        </div>

        {/* Rows */}
        {permissions.map(p => (
          <div key={p.key} className="grid grid-cols-12 gap-0 px-3 py-2 border-b border-gray-50 hover:bg-gray-50 items-center">
            <div className="col-span-5">
              <p className="text-[12px] text-gray-700 font-medium">{p.label}</p>
              <p className="text-[10px] text-gray-400">{p.desc}</p>
            </div>
            {/* Super Admin — always all */}
            <div className="col-span-1 flex justify-center">
              <div className="w-4 h-4 rounded bg-emerald-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              </div>
            </div>
            {/* Admin */}
            <div className="col-span-1 flex justify-center">
              <div className={`w-4 h-4 rounded flex items-center justify-center ${p.admin ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                {p.admin && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
            </div>
            {/* Manager */}
            <div className="col-span-1 flex justify-center">
              <div className={`w-4 h-4 rounded flex items-center justify-center ${p.manager ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                {p.manager && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
            </div>
            {/* SDR */}
            <div className="col-span-1 flex justify-center">
              <div className={`w-4 h-4 rounded flex items-center justify-center ${p.sdr ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                {p.sdr && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400">Les permissions sont appliquées automatiquement selon le rôle de l'utilisateur défini dans la section Utilisateurs.</p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════
export default function Settings() {
  const { organisation, profile, isAdmin, refreshOrganisation } = useAuth()
  const perms = usePermissions()
  const [activeSection, setActiveSection] = useState('call-settings')
  const orgUpdate = useOrgUpdate()

  const save = useCallback((updates: Record<string, unknown>) => {
    if (organisation?.id) orgUpdate.mutate({ orgId: organisation.id, updates }, { onSuccess: () => refreshOrganisation() })
  }, [organisation?.id, orgUpdate, refreshOrganisation])

  const { data: phoneNumbersForUsers } = usePhoneNumbers()
  const visibleSections = SECTIONS.filter(s => {
    if (s.superAdminOnly && !perms.isSuperAdmin) return false
    if (s.adminOnly && !perms.isAdmin) return false
    if (perms.isSdr && !['call-settings', 'phone-fields'].includes(s.id)) return false
    return true
  })
  const groups = [...new Set(visibleSections.map(s => s.group))]

  const renderSection = () => {
    switch (activeSection) {
      case 'call-settings': return <CallSettings org={organisation} save={save} />
      case 'phone-numbers': return <PhoneNumbers org={organisation} save={save} />
      case 'phone-fields': return <PhoneFieldsSection org={organisation} save={save} />
      case 'incoming-calls': return <IncomingCalls org={organisation} save={save} />
      case 'lead-statuses': return <LeadStatuses />
      case 'contact-fields': return organisation?.id ? <ContactFields orgId={organisation.id} /> : null
      case 'dispositions': return <Dispositions />
      case 'field-mapping': return <FieldMappingSection />
      case 'ai-summary': return <AiSummary />
      case 'integrations': return <IntegrationsSection />
      case 'crm-connections': return <CrmConnectionsSection />
      case 'webhooks': return <WebhooksSection org={organisation} />
      case 'users': return organisation?.id ? <UsersSection orgId={organisation.id} phoneNumbers={phoneNumbersForUsers} /> : null
      case 'permissions': return <PermissionsSection />
      case 'billing': return <BillingSection org={organisation} />
      case 'organisation': return <OrganisationSection org={organisation} save={save} />
      case 'account': return <AccountSection />
      default: return null
    }
  }

  // Animation fade pour le contenu
  const [fadeKey, setFadeKey] = useState(activeSection)
  useEffect(() => { setFadeKey(activeSection) }, [activeSection])

  return (
    <div className="h-screen bg-gradient-to-br from-[#f5f3ff] to-[#ede9fe] flex flex-col overflow-hidden">
      {/* Header avec gradient subtil */}
      <div className="px-6 py-4 border-b border-violet-100 bg-white/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-gray-800">Paramètres</h1>
            <p className="text-[12px] text-gray-400">
              {profile?.full_name || profile?.email} · {isAdmin ? 'Administrateur' : 'Utilisateur'}
            </p>
          </div>
        </div>
      </div>

      {/* 2-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Nav gauche — style Minari */}
        <nav className="w-[220px] border-r border-violet-100/60 bg-white/70 backdrop-blur-sm overflow-y-auto py-4 flex-shrink-0">
          {groups.map((group, gi) => (
            <div key={group} className={gi > 0 ? 'mt-2 pt-2 border-t border-gray-100 mx-3' : ''}>
              <p className="px-4 py-1.5 text-[9px] font-bold text-violet-400/60 uppercase tracking-[0.15em]">{group}</p>
              {visibleSections.filter(s => s.group === group).map(s => (
                <button key={s.id} onClick={() => setActiveSection(s.id)}
                  className={`w-full text-left px-4 py-2 text-[13px] transition-all duration-150 flex items-center gap-2.5 rounded-r-none ${
                    activeSection === s.id
                      ? 'text-violet-700 bg-gradient-to-r from-violet-50 to-violet-100/50 font-semibold border-r-[3px] border-violet-500 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.1)]'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-violet-50/40 hover:translate-x-0.5'
                  }`}>
                  <span className={`text-[13px] transition-transform duration-150 ${activeSection === s.id ? 'scale-110' : ''}`}>{s.icon}</span>
                  <span className="truncate">{s.label}</span>
                  {s.adminOnly && (
                    <svg className="w-3 h-3 text-amber-400 ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Contenu — card blanche avec animation */}
        <div className="flex-1 overflow-y-auto p-6">
          <div key={fadeKey} className="max-w-2xl bg-white rounded-2xl border border-violet-100/60 shadow-lg shadow-violet-100/20 p-6 animate-[fadeIn_0.15s_ease-out]">
            {renderSection()}
          </div>
        </div>
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
