/**
 * CRMMobile — Vue mobile dédiée du CRM (Contacts).
 *
 * Layout : recherche + filtres pills + cards prospects verticales.
 * Tap card → fiche prospect plein écran (modal full-screen mobile).
 */

import { useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useCrmStatuses } from '@/hooks/useProperties'
import { CRM_STATUS_LABELS } from '@/config/properties'
import ProspectModal from '@/components/call/ProspectModal'
import { useCall } from '@/contexts/CallContext'
import { useCallsByProspect } from '@/hooks/useCalls'
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

export default function CRMMobile() {
  const { organisation } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const cm = useCall()
  const { data: crmStatuses } = useCrmStatuses()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | 'all'>('all')
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)

  // Auto-open prospect via query param
  const autoOpenId = new URLSearchParams(location.search).get('prospect')

  const { data: prospects = [], isLoading } = useQuery({
    queryKey: ['crm-mobile-prospects', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data } = await supabase
        .from('prospects')
        .select('*')
        .eq('organisation_id', organisation.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500)
      return (data || []) as Prospect[]
    },
    enabled: !!organisation?.id,
  })

  // Auto-open quand on arrive avec ?prospect=xxx
  useMemo(() => {
    if (autoOpenId && prospects.length > 0 && !selectedProspect) {
      const p = prospects.find(x => x.id === autoOpenId)
      if (p) setSelectedProspect(p)
    }
  }, [autoOpenId, prospects, selectedProspect])

  const { data: callHistory } = useCallsByProspect(selectedProspect?.id || null, selectedProspect?.phone)

  const crmLabels: Record<string, string> = { ...CRM_STATUS_LABELS }
  crmStatuses?.forEach(s => { crmLabels[s.key] = s.label })

  // Stats par status (pour pills filtres)
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: prospects.length }
    for (const p of prospects) {
      const k = p.crm_status || 'new'
      m[k] = (m[k] || 0) + 1
    }
    return m
  }, [prospects])

  const filtered = useMemo(() => {
    let list = prospects
    if (statusFilter !== 'all') list = list.filter(p => (p.crm_status || 'new') === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.phone || '').includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.company || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [prospects, statusFilter, search])

  const isInCall = cm.isDialing || cm.isConnected

  return (
    <div className="h-full flex flex-col bg-[#f8f9fa] overflow-hidden">
      {/* Search sticky */}
      <div className="bg-white border-b border-gray-100 px-3 py-2 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher contact..."
            className="w-full pl-9 pr-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-indigo-300 outline-none"
          />
        </div>
      </div>

      {/* Filtres pills scroll horizontal */}
      <div className="bg-white border-b border-gray-100 px-2 py-2 overflow-x-auto scrollbar-hide flex-shrink-0">
        <div className="flex gap-1.5 px-1">
          <FilterPill active={statusFilter === 'all'} count={counts.all} onClick={() => setStatusFilter('all')} label="Tous" color="#6366f1" />
          {(crmStatuses || []).map(s => (
            <FilterPill
              key={s.key}
              active={statusFilter === s.key}
              count={counts[s.key] || 0}
              onClick={() => setStatusFilter(s.key)}
              label={s.label}
              color={s.color || STATUS_COLOR[s.key] || '#6b7280'}
            />
          ))}
        </div>
      </div>

      {/* Liste cards */}
      <div className="flex-1 overflow-y-auto pb-4">
        {isLoading ? (
          <div className="text-center py-12 text-[12px] text-gray-400">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-[13px] font-semibold text-gray-700">Aucun contact</p>
            <p className="text-[11px] text-gray-400 mt-1">{search ? 'Essaie une autre recherche' : 'Crée ton premier contact'}</p>
          </div>
        ) : (
          <div className="px-2 pt-2 space-y-2">
            <div className="text-[10px] text-gray-400 px-2 mb-1 tabular-nums">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</div>
            {filtered.slice(0, 100).map(p => (
              <ContactCard
                key={p.id}
                prospect={p}
                statusLabel={crmLabels[p.crm_status || 'new'] || ''}
                onOpen={() => setSelectedProspect(p)}
              />
            ))}
            {filtered.length > 100 && (
              <p className="text-center text-[10px] text-gray-400 py-2">100 premiers sur {filtered.length}</p>
            )}
          </div>
        )}
      </div>

      {/* ProspectModal plein écran sur mobile (déjà responsive) */}
      {selectedProspect && (
        <ProspectModal
          prospect={selectedProspect as any}
          callContext={cm.context}
          callHistory={callHistory || []}
          isInCall={isInCall}
          isDisconnected={cm.isDisconnected}
          onCall={(p) => cm.start(p)}
          onClose={() => {
            if (cm.isDisconnected) cm.reset()
            setSelectedProspect(null)
            // Clean ?prospect= de l'URL
            if (autoOpenId) navigate('/app/contacts', { replace: true })
          }}
          onSetDisposition={cm.setDisposition}
          onSetNotes={cm.setNotes}
          onSetMeeting={cm.setMeeting}
          onReset={cm.reset}
          onNextCall={() => { cm.reset(); setSelectedProspect(null) }}
          providerReady={cm.providerReady}
        />
      )}
    </div>
  )
}

function FilterPill({ active, count, onClick, label, color }: {
  active: boolean; count: number; onClick: () => void; label: string; color: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
        active ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
      style={active ? { background: color } : undefined}
    >
      <span>{label}</span>
      <span className={`text-[9px] tabular-nums px-1 rounded ${active ? 'bg-white/25' : 'bg-white text-gray-500'}`}>{count}</span>
    </button>
  )
}

function ContactCard({ prospect, statusLabel, onOpen }: {
  prospect: Prospect; statusLabel: string; onOpen: () => void
}) {
  const initial = (prospect.name || '?')[0].toUpperCase()
  const statusColor = STATUS_COLOR[prospect.crm_status || 'new'] || '#94a3b8'

  return (
    <button
      onClick={onOpen}
      className="w-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden active:bg-gray-50 transition-colors text-left"
    >
      <div className="px-3 py-3 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-white text-[15px] font-bold flex items-center justify-center flex-shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-gray-800 truncate flex items-center gap-1.5">
            {prospect.name || '(sans nom)'}
            {prospect.meeting_booked && <span className="text-[10px]">🎯</span>}
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            {prospect.company && <span>{prospect.company}</span>}
            {prospect.company && (prospect.phone || prospect.email) && <span> • </span>}
            {prospect.phone || prospect.email}
          </div>
          {prospect.last_call_at && (
            <div className="text-[10px] text-gray-400 mt-0.5">
              Dernier appel : {new Date(prospect.last_call_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
            </div>
          )}
        </div>
        {statusLabel && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white flex-shrink-0" style={{ background: statusColor }}>
            {statusLabel}
          </span>
        )}
      </div>
    </button>
  )
}
