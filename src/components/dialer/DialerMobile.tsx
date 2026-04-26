/**
 * DialerMobile — Vue mobile dédiée du Dialer (cards verticales, gros boutons).
 *
 * UX pensée pour l'usage : SDR appelle d'une main, doit voir le prospect
 * et déclencher l'appel en 1 tap. Aucune table, aucun scroll horizontal.
 *
 *  ┌─────────────────────────────────┐
 *  │ Liste : "Liste Mai" (48 prospects) │  ← header avec switch liste
 *  │  [ Démarrer auto ▶ ]               │
 *  ├─────────────────────────────────┤
 *  │ ┌─────────────────────────────┐ │
 *  │ │ J  Jean-Michel Durand        │ │  ← card prospect
 *  │ │    +33 6 12 34 56 78  •  En attente │
 *  │ │  ┌──────┐ ┌──────┐ ┌──────┐  │ │
 *  │ │  │ 📞 Appeler │ │ 💬 SMS │ │ ✉ Email │
 *  │ └─────────────────────────────┘ │
 *  │ ...                              │
 *  └─────────────────────────────────┘
 */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProspectLists, useProspects } from '@/hooks/useProspects'
import { useCall } from '@/contexts/CallContext'
import { useCrmStatuses } from '@/hooks/useProperties'
import { CRM_STATUS_LABELS } from '@/config/properties'
import type { Prospect } from '@/types/prospect'

const STATUS_COLOR: Record<string, string> = {
  new: '#94a3b8',
  attempted_to_contact: '#f59e0b',
  connected: '#10b981',
  in_progress: '#3b82f6',
  callback: '#f59e0b',
  not_interested: '#ef4444',
  mail_sent: '#a855f7',
  rdv_pris: '#10b981',
  rdv_fait: '#059669',
  signe: '#16a34a',
}

export default function DialerMobile() {
  const navigate = useNavigate()
  const { data: lists } = useProspectLists()
  const { data: crmStatuses } = useCrmStatuses()
  const cm = useCall()

  // Sélection de liste : récupère depuis localStorage la dernière utilisée
  const [activeListId, setActiveListId] = useState<string | null>(() => {
    try { return localStorage.getItem('calsyn_active_list') || null } catch { return null }
  })

  // Si pas de liste sélectionnée, prendre la première
  const effectiveListId = activeListId || lists?.[0]?.id || null
  const { data: prospects = [] } = useProspects(effectiveListId)

  const [search, setSearch] = useState('')
  const [showListPicker, setShowListPicker] = useState(false)

  const activeList = useMemo(() => lists?.find(l => l.id === effectiveListId), [lists, effectiveListId])

  const filtered = useMemo(() => {
    if (!search.trim()) return prospects
    const q = search.toLowerCase()
    return prospects.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.phone || '').includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.company || '').toLowerCase().includes(q)
    )
  }, [prospects, search])

  const crmLabels: Record<string, string> = { ...CRM_STATUS_LABELS }
  crmStatuses?.forEach(s => { crmLabels[s.key] = s.label })

  function handleCall(p: Prospect) {
    if (!p.phone) {
      alert('Pas de téléphone pour ce contact')
      return
    }
    cm.start(p)
  }

  if (!lists || lists.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-[14px] font-semibold text-gray-700">Aucune liste de prospects</p>
        <p className="text-[12px] text-gray-400 mt-1">Crée une liste depuis l'app desktop pour commencer</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[#f8f9fa] overflow-hidden">
      {/* Header sticky : switch liste + count */}
      <div className="bg-white border-b border-gray-200 px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setShowListPicker(true)}
          className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-gray-800 truncate">{activeList?.name || 'Choisir une liste'}</div>
            <div className="text-[10px] text-gray-500">{prospects.length} contact{prospects.length > 1 ? 's' : ''}</div>
          </div>
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white border-b border-gray-100 px-3 py-2 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un contact..."
            className="w-full pl-9 pr-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-indigo-300 outline-none"
          />
        </div>
      </div>

      {/* Liste prospects en cards */}
      <div className="flex-1 overflow-y-auto pb-4">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-[13px] font-semibold text-gray-700">Aucun contact</p>
            <p className="text-[11px] text-gray-400 mt-1">{search ? 'Essaie une autre recherche' : 'Cette liste est vide'}</p>
          </div>
        ) : (
          <div className="px-2 pt-2 space-y-2">
            {filtered.slice(0, 100).map(p => (
              <ProspectCard
                key={p.id}
                prospect={p}
                statusLabel={crmLabels[p.crm_status || ''] || p.crm_status || ''}
                onCall={() => handleCall(p)}
                onOpen={() => navigate(`/app/contacts?prospect=${p.id}`)}
              />
            ))}
            {filtered.length > 100 && (
              <p className="text-center text-[10px] text-gray-400 py-2">100 premiers sur {filtered.length}</p>
            )}
          </div>
        )}
      </div>

      {/* Modal switch liste */}
      {showListPicker && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setShowListPicker(false)}>
          <div className="w-full bg-white rounded-t-2xl max-h-[70vh] flex flex-col animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-gray-800">Choisir une liste</h3>
              <button onClick={() => setShowListPicker(false)} className="text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pb-safe">
              {lists.map(l => (
                <button
                  key={l.id}
                  onClick={() => {
                    setActiveListId(l.id)
                    try { localStorage.setItem('calsyn_active_list', l.id) } catch { /* */ }
                    setShowListPicker(false)
                  }}
                  className={`w-full px-4 py-3 text-left border-b border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center gap-3 ${effectiveListId === l.id ? 'bg-indigo-50' : ''}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0">
                    {l.name[0].toUpperCase()}
                  </div>
                  <span className="flex-1 text-[13px] font-semibold text-gray-800 truncate">{l.name}</span>
                  {effectiveListId === l.id && (
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProspectCard({ prospect, statusLabel, onCall, onOpen }: {
  prospect: Prospect
  statusLabel: string
  onCall: () => void
  onOpen: () => void
}) {
  const initial = (prospect.name || '?')[0].toUpperCase()
  const statusColor = STATUS_COLOR[prospect.crm_status || 'new'] || '#94a3b8'
  const meetingDone = prospect.meeting_booked

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header card : avatar + nom + statut */}
      <button onClick={onOpen} className="w-full px-3 py-3 flex items-center gap-3 active:bg-gray-50 transition-colors text-left">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-white text-[14px] font-bold flex items-center justify-center flex-shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-gray-800 truncate flex items-center gap-1.5">
            {prospect.name || '(sans nom)'}
            {meetingDone && <span className="text-[10px]">🎯</span>}
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            {prospect.company || prospect.phone || prospect.email || '—'}
          </div>
        </div>
        {statusLabel && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white flex-shrink-0" style={{ background: statusColor }}>
            {statusLabel}
          </span>
        )}
      </button>

      {/* Actions row */}
      <div className="grid grid-cols-3 gap-px bg-gray-100">
        <ActionButton
          label="Appeler"
          icon="📞"
          color="#10b981"
          disabled={!prospect.phone}
          onClick={onCall}
        />
        <ActionButton
          label="SMS"
          icon="💬"
          color="#f59e0b"
          disabled={!prospect.phone}
          onClick={() => onOpen()}  // ouvre fiche → composer SMS
        />
        <ActionButton
          label="Email"
          icon="✉️"
          color="#6366f1"
          disabled={!prospect.email}
          onClick={() => onOpen()}
        />
      </div>
    </div>
  )
}

function ActionButton({ label, icon, color, onClick, disabled }: {
  label: string; icon: string; color: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`bg-white py-2.5 flex flex-col items-center gap-0.5 transition-colors active:bg-gray-50 ${disabled ? 'opacity-30' : ''}`}
      style={{ color: disabled ? '#9ca3af' : color }}
    >
      <span className="text-[14px]">{icon}</span>
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  )
}
