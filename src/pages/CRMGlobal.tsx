/**
 * CRM Global — HubSpot-style contact management.
 * Vue unifiée de tous les contacts, dédupliqués par téléphone.
 * Features: vues sauvegardées, filtres avancés, colonnes config, bulk actions, appels.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useCall } from '@/contexts/CallContext'
import { useCallsByProspect } from '@/hooks/useCalls'
import { usePropertyDefinitions, useCustomFieldValues, useCrmStatuses, updatePropertyValue, groupProperties } from '@/hooks/useProperties'
import { SYSTEM_PROPERTIES, DEFAULT_VISIBLE_COLUMNS, getPropertyValue, matchesSearch, CRM_STATUS_LABELS, type PropertyDefinition } from '@/config/properties'
import { useProspectLists } from '@/hooks/useProspects'
import SocialLinks from '@/components/call/SocialLinks'
import ProspectModal from '@/components/call/ProspectModal'
import MultiSelectFilter from '@/components/ui/MultiSelectFilter'
import UpcomingRdvBar from '@/components/ui/UpcomingRdvBar'
import DuplicatesDetector from '@/components/crm/DuplicatesDetector'
import { InlineEditCell } from '@/pages/Dialer'
import type { Prospect } from '@/types/prospect'
import { normalizePhone } from '@/utils/phone'

// ══════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════

interface MergedProspect extends Prospect {
  listNames: string[]
  listIds: string[]
  // Versions string pour getPropertyValue (lecture system field via prospect[key])
  list_names: string
  assigned_sdrs: string
}

type FilterOp = 'eq' | 'neq' | 'contains' | 'not_contains' | 'starts' | 'empty' | 'not_empty' | 'gt' | 'lt' | 'in' | 'true' | 'false'
type Filter = { id: string; propertyId: string; op: FilterOp; value: string }
type SavedView = {
  id: string
  name: string
  columns: string[]
  filters: Filter[]
  sortBy: string
  sortDir: 'asc' | 'desc'
  // Filtres pipeline (optionnels — null/undefined = pas de filtre)
  hiddenStageKeys?: string[]
  listFilterId?: string | null  // legacy v1 (single)
  listFilterIds?: string[]  // v2 (multi)
  viewAsUserId?: string | null
}

// ══════════════════════════════════════════════════════════════════
// FILTER EVALUATION (reusable)
// ══════════════════════════════════════════════════════════════════

function evalFilter(p: Prospect, f: Filter, allProperties: PropertyDefinition[], customValues?: Record<string, string>): boolean {
  const prop = allProperties.find(pr => pr.id === f.propertyId)
  if (!prop) return true
  const val = getPropertyValue(p, customValues, prop)
  const lower = val.toLowerCase()
  const fLower = f.value.toLowerCase()

  switch (f.op) {
    case 'eq': return lower === fLower
    case 'neq': return lower !== fLower
    case 'contains': return lower.includes(fLower)
    case 'not_contains': return !lower.includes(fLower)
    case 'starts': return lower.startsWith(fLower)
    case 'empty': return !val || val === '—'
    case 'not_empty': return !!val && val !== '—'
    case 'gt': return Number(val) > Number(f.value)
    case 'lt': return Number(val) < Number(f.value)
    case 'in': return f.value.split(',').map(v => v.trim().toLowerCase()).includes(lower)
    case 'true': return val === 'true' || val === 'Oui'
    case 'false': return val === 'false' || val === 'Non' || !val
    default: return true
  }
}

// ══════════════════════════════════════════════════════════════════
// FILTER BUILDER COMPONENT
// ══════════════════════════════════════════════════════════════════

function FilterBuilder({ filters, setFilters, allProperties, crmStatuses }: {
  filters: Filter[]; setFilters: (f: Filter[]) => void; allProperties: PropertyDefinition[]
  crmStatuses: Array<{ key: string; label: string; color: string }>
}) {
  const [open, setOpen] = useState(false)

  const addFilter = () => {
    setFilters([...filters, { id: crypto.randomUUID(), propertyId: 'system:crm_status', op: 'eq', value: '' }])
    setOpen(true)
  }

  const updateFilter = (id: string, updates: Partial<Filter>) => {
    setFilters(filters.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  const removeFilter = (id: string) => setFilters(filters.filter(f => f.id !== id))

  const opsForType = (fieldType: string) => {
    switch (fieldType) {
      case 'number': return [{ v: 'eq', l: '=' }, { v: 'neq', l: '≠' }, { v: 'gt', l: '>' }, { v: 'lt', l: '<' }, { v: 'empty', l: 'Vide' }, { v: 'not_empty', l: 'Non vide' }]
      case 'date': return [{ v: 'eq', l: 'Est' }, { v: 'gt', l: 'Après' }, { v: 'lt', l: 'Avant' }, { v: 'empty', l: 'Vide' }, { v: 'not_empty', l: 'Non vide' }]
      case 'boolean': return [{ v: 'true', l: 'Oui' }, { v: 'false', l: 'Non' }]
      case 'enum': return [{ v: 'eq', l: 'Est' }, { v: 'neq', l: 'N\'est pas' }, { v: 'in', l: 'Est l\'un de' }, { v: 'empty', l: 'Vide' }, { v: 'not_empty', l: 'Non vide' }]
      default: return [{ v: 'eq', l: 'Est' }, { v: 'neq', l: 'N\'est pas' }, { v: 'contains', l: 'Contient' }, { v: 'not_contains', l: 'Ne contient pas' }, { v: 'starts', l: 'Commence par' }, { v: 'empty', l: 'Vide' }, { v: 'not_empty', l: 'Non vide' }]
    }
  }

  return (
    <div className="relative">
      <button onClick={() => filters.length > 0 ? setOpen(!open) : addFilter()}
        className={`flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border transition-colors ${
          filters.length > 0 ? 'text-indigo-600 font-medium border-indigo-200 bg-indigo-50' : 'text-gray-500 hover:text-gray-700 border-gray-200 bg-white'
        }`}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
        Filtrer{filters.length > 0 && <span className="text-[10px] bg-indigo-500 text-white w-4 h-4 rounded-full flex items-center justify-center">{filters.length}</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-10 left-0 bg-white rounded-xl shadow-lg border border-gray-200 z-50 w-[500px] p-4 animate-slide-down">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-gray-700">Filtres avancés</p>
              <button onClick={() => { setFilters([]); setOpen(false) }} className="text-[11px] text-gray-400 hover:text-red-500">Tout effacer</button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {filters.map(f => {
                const prop = allProperties.find(p => p.id === f.propertyId)
                const ops = opsForType(prop?.fieldType || 'text')
                const needsValue = !['empty', 'not_empty', 'true', 'false'].includes(f.op)
                const isEnum = prop?.fieldType === 'enum'
                const enumOptions = isEnum
                  ? (prop?.key === 'crm_status' ? crmStatuses.map(s => ({ value: s.key, label: s.label })) : (prop?.options || []).map(o => ({ value: o, label: o })))
                  : []

                return (
                  <div key={f.id} className="flex items-center gap-1.5 bg-gray-50 rounded-lg p-2">
                    {/* Property */}
                    <select value={f.propertyId} onChange={e => updateFilter(f.id, { propertyId: e.target.value, value: '' })}
                      className="text-[11px] border border-gray-200 rounded px-1.5 py-1 outline-none flex-1 min-w-0">
                      {allProperties.filter(p => !p.isReadOnly || p.key === 'crm_status' || p.key === 'last_call_outcome').map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {/* Operator */}
                    <select value={f.op} onChange={e => updateFilter(f.id, { op: e.target.value as FilterOp })}
                      className="text-[11px] border border-gray-200 rounded px-1.5 py-1 outline-none w-24">
                      {ops.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                    {/* Value */}
                    {needsValue && (
                      isEnum ? (
                        <select value={f.value} onChange={e => updateFilter(f.id, { value: e.target.value })}
                          className="text-[11px] border border-gray-200 rounded px-1.5 py-1 outline-none flex-1 min-w-0">
                          <option value="">Choisir...</option>
                          {enumOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <input value={f.value} onChange={e => updateFilter(f.id, { value: e.target.value })}
                          placeholder="Valeur..."
                          className="text-[11px] border border-gray-200 rounded px-1.5 py-1 outline-none flex-1 min-w-0" />
                      )
                    )}
                    <button onClick={() => removeFilter(f.id)} className="text-gray-300 hover:text-red-500 text-[10px] flex-shrink-0">✕</button>
                  </div>
                )
              })}
            </div>

            <button onClick={addFilter}
              className="mt-2 text-[12px] text-indigo-500 hover:text-indigo-700 font-medium flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Ajouter un filtre
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// COLUMN PICKER (simplified)
// ══════════════════════════════════════════════════════════════════

function CrmColumnPicker({ visible, setVisible, allProperties, open, onToggle }: {
  visible: string[]; setVisible: (v: string[]) => void; allProperties: PropertyDefinition[]; open: boolean; onToggle: () => void
}) {
  const [search, setSearch] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  const editableProps = allProperties.filter(p => p.id !== 'system:name')
  const visibleProps = visible
    .map(id => editableProps.find(p => p.id === id))
    .filter(Boolean) as PropertyDefinition[]
  const availableProps = editableProps.filter(p => !visible.includes(p.id))

  const lower = search.trim().toLowerCase()
  const matches = (p: PropertyDefinition) => !lower || p.name.toLowerCase().includes(lower)

  const visibleFiltered = visibleProps.filter(matches)
  const availableGrouped = groupProperties(availableProps.filter(matches))

  const toggle = (id: string) => {
    setVisible(visible.includes(id) ? visible.filter(c => c !== id) : [...visible, id])
  }

  const resetDefaults = () => setVisible([...DEFAULT_VISIBLE_COLUMNS, 'system:call_count'])

  const reorder = (fromId: string, toId: string) => {
    const from = visible.indexOf(fromId)
    const to = visible.indexOf(toId)
    if (from === -1 || to === -1 || from === to) return
    const next = [...visible]
    next.splice(from, 1)
    next.splice(to, 0, fromId)
    setVisible(next)
  }

  return (
    <div className="relative">
      <button onClick={onToggle}
        className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" /></svg>
        Colonnes{visible.length > 0 && <span className="text-[10px] text-indigo-500 font-bold">{visible.length}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute right-0 top-10 w-[340px] bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-[500px] flex flex-col animate-slide-down">
            {/* Search + reset */}
            <div className="p-3 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
              <div className="flex-1 relative">
                <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input type="text" autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher une colonne..."
                  className="w-full text-[12px] pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-indigo-300" />
              </div>
              <button onClick={resetDefaults}
                title="Réinitialiser aux colonnes par défaut"
                className="text-[10px] text-gray-400 hover:text-indigo-600 px-2 py-1 rounded hover:bg-indigo-50 transition-colors flex-shrink-0">
                Défaut
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Colonnes visibles (avec ordre + drag) */}
              {visibleFiltered.length > 0 && (
                <div className="border-b border-gray-100">
                  <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50/50">
                    Visibles ({visibleFiltered.length})
                  </p>
                  {visibleFiltered.map(prop => (
                    <div key={prop.id}
                      draggable
                      onDragStart={() => setDragId(prop.id)}
                      onDragOver={e => { e.preventDefault() }}
                      onDrop={() => { if (dragId && dragId !== prop.id) reorder(dragId, prop.id); setDragId(null) }}
                      onDragEnd={() => setDragId(null)}
                      className={`flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-grab active:cursor-grabbing select-none ${dragId === prop.id ? 'opacity-40' : ''}`}>
                      <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                      <span className={`text-[12px] flex-1 truncate ${prop.type === 'custom' ? 'text-violet-700' : 'text-gray-700'}`}>{prop.name}</span>
                      <button onClick={() => toggle(prop.id)}
                        title="Masquer"
                        className="text-gray-300 hover:text-red-500 text-[14px] flex-shrink-0 leading-none">×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Colonnes disponibles, par groupe */}
              {availableGrouped.map(group => group.properties.length === 0 ? null : (
                <div key={group.key}>
                  <p className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-gray-50/50 ${group.key === 'custom' ? 'text-violet-400' : 'text-gray-400'}`}>{group.label}</p>
                  {group.properties.map(prop => (
                    <button key={prop.id} onClick={() => toggle(prop.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-indigo-50/40 transition-colors text-left">
                      <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      <span className={`text-[12px] flex-1 truncate ${prop.type === 'custom' ? 'text-violet-700' : 'text-gray-600'}`}>{prop.name}</span>
                    </button>
                  ))}
                </div>
              ))}

              {visibleFiltered.length === 0 && availableGrouped.every(g => g.properties.length === 0) && (
                <div className="px-3 py-6 text-[12px] text-gray-400 text-center italic">Aucune colonne ne correspond</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export default function CRMGlobal() {
  const { organisation, profile } = useAuth()
  const perms = usePermissions()
  const orgId = organisation?.id
  const queryClient = useQueryClient()
  const cm = useCall()

  // State
  const [viewMode, setViewMode] = useState<'table' | 'board'>(() => {
    const saved = localStorage.getItem('calsyn_crm_view_mode')
    return saved === 'table' || saved === 'board' ? saved : 'board'
  })
  useEffect(() => { localStorage.setItem('calsyn_crm_view_mode', viewMode) }, [viewMode])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedProspect, setSelectedProspect] = useState<MergedProspect | null>(null)
  const [showDuplicates, setShowDuplicates] = useState(false)

  // Call history — DOIT être après selectedProspect
  const { data: callHistory } = useCallsByProspect(selectedProspect?.id || null, selectedProspect?.phone)
  const [filters, setFilters] = useState<Filter[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [dragColId, setDragColId] = useState<string | null>(null)
  const [dragStageKey, setDragStageKey] = useState<string | null>(null)
  const [stageOrder, setStageOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('calsyn_crm_stage_order') || '[]') } catch { return [] }
  })
  useEffect(() => { localStorage.setItem('calsyn_crm_stage_order', JSON.stringify(stageOrder)) }, [stageOrder])

  // Stages masqués (par key, persist localStorage)
  const [hiddenStageKeys, setHiddenStageKeys] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('calsyn_crm_hidden_stages') || '[]') } catch { return [] }
  })
  useEffect(() => { localStorage.setItem('calsyn_crm_hidden_stages', JSON.stringify(hiddenStageKeys)) }, [hiddenStageKeys])
  const [showStageVisibilityMenu, setShowStageVisibilityMenu] = useState(false)
  const [quickAdd, setQuickAdd] = useState<{ stageKey: string; stageLabel: string; name: string; phone: string; listId: string } | null>(null)
  const [quickAddSaving, setQuickAddSaving] = useState(false)
  // viewAsUserId : null = tous les contacts (toute l'org), 'me' = mes contacts, sinon = user_id d'un SDR (admin only)
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(() => {
    return localStorage.getItem('calsyn_crm_view_as') || null
  })
  useEffect(() => {
    if (viewAsUserId) localStorage.setItem('calsyn_crm_view_as', viewAsUserId)
    else localStorage.removeItem('calsyn_crm_view_as')
  }, [viewAsUserId])
  const [showViewAsMenu, setShowViewAsMenu] = useState(false)
  // Filtre par listes pour le pipeline (vide = toutes listes, multi-sélection)
  const [listFilterIds, setListFilterIds] = useState<string[]>(() => {
    try {
      const v2 = localStorage.getItem('calsyn_crm_list_filter_v2')
      if (v2) return JSON.parse(v2)
      // Migration v1 (single id) → v2 (array)
      const v1 = localStorage.getItem('calsyn_crm_list_filter')
      return v1 ? [v1] : []
    } catch { return [] }
  })
  useEffect(() => {
    localStorage.setItem('calsyn_crm_list_filter_v2', JSON.stringify(listFilterIds))
  }, [listFilterIds])
  const [showListMenu, setShowListMenu] = useState(false)

  // Saved views (localStorage)
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    try { return JSON.parse(localStorage.getItem('calsyn_crm_views') || '[]') } catch { return [] }
  })
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [savingView, setSavingView] = useState(false)
  const [newViewName, setNewViewName] = useState('')

  // Visible columns
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('calsyn_crm_columns')
      return saved ? JSON.parse(saved) : [...DEFAULT_VISIBLE_COLUMNS, 'system:call_count']
    } catch { return [...DEFAULT_VISIBLE_COLUMNS, 'system:call_count'] }
  })
  useEffect(() => { localStorage.setItem('calsyn_crm_columns', JSON.stringify(visibleColumnIds)) }, [visibleColumnIds])

  // Auto-scroll horizontal du board Kanban pendant drag près des bords
  const boardRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)
  const scrollDirRef = useRef<number>(0)
  const stopAutoScroll = useCallback(() => {
    if (scrollRafRef.current !== null) { cancelAnimationFrame(scrollRafRef.current); scrollRafRef.current = null }
    scrollDirRef.current = 0
  }, [])
  const startAutoScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return
    const step = () => {
      const el = boardRef.current
      if (!el || scrollDirRef.current === 0) { scrollRafRef.current = null; return }
      el.scrollLeft += scrollDirRef.current * 14
      scrollRafRef.current = requestAnimationFrame(step)
    }
    scrollRafRef.current = requestAnimationFrame(step)
  }, [])
  const handleBoardDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const el = boardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const edge = 100
    const x = e.clientX
    if (x < rect.left + edge) scrollDirRef.current = -1
    else if (x > rect.right - edge) scrollDirRef.current = 1
    else scrollDirRef.current = 0
    if (scrollDirRef.current !== 0) startAutoScroll()
    else stopAutoScroll()
  }, [startAutoScroll, stopAutoScroll])
  useEffect(() => () => stopAutoScroll(), [stopAutoScroll])

  const persistViews = (views: SavedView[]) => { setSavedViews(views); localStorage.setItem('calsyn_crm_views', JSON.stringify(views)) }

  // Properties
  const { properties: allProperties } = usePropertyDefinitions()
  const { data: crmStatuses } = useCrmStatuses()

  // Fallback : si l'org n'a pas de crm_statuses configurés, dériver depuis les options enum
  // de system:crm_status (sinon le Kanban est vide même avec des prospects).
  const effectiveStatuses = useMemo(() => {
    // Source de vérité = crmStatuses en DB (les rows soft-deleted sont déjà
    // filtrées par useCrmStatuses). Si l'org n'a aucun stage (cas seul d'une
    // org pas encore seedée), fallback sur les défauts du code.
    const defaultKeys = (SYSTEM_PROPERTIES.find(p => p.key === 'crm_status')?.options) || []
    const colorByKey: Record<string, string> = {
      new: '#9ca3af', attempted_to_contact: '#f59e0b', connected: '#10b981',
      in_progress: '#6366f1', callback: '#a78bfa', not_interested: '#6b7280',
      mail_sent: '#3b82f6', rdv_pris: '#0d9488', rdv_fait: '#06b6d4',
      en_attente_signature: '#f59e0b', signe: '#10b981',
      en_attente_paiement: '#f59e0b', paye: '#22c55e',
    }
    let stages
    if (crmStatuses && crmStatuses.length > 0) {
      stages = crmStatuses
    } else {
      stages = defaultKeys.map((key, i) => ({
        key,
        label: CRM_STATUS_LABELS[key] || key,
        color: colorByKey[key] || '#6b7280',
        priority: i,
      }))
    }
    // Applique l'ordre custom localStorage si défini, sinon ordre naturel
    if (stageOrder.length === 0) return stages
    const byKey = new Map(stages.map(s => [s.key, s]))
    const ordered: typeof stages = []
    // 1) stages dans stageOrder (et qui existent encore)
    for (const k of stageOrder) {
      const s = byKey.get(k)
      if (s) { ordered.push(s); byKey.delete(k) }
    }
    // 2) nouveaux stages pas encore ordonnés
    for (const s of byKey.values()) ordered.push(s)
    return ordered
  }, [crmStatuses, stageOrder])
  const { data: lists } = useProspectLists()

  const crmLabels = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of (crmStatuses || [])) m[s.key] = s.label
    return m
  }, [crmStatuses])

  const crmColors = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of (crmStatuses || [])) m[s.key] = s.color
    return m
  }, [crmStatuses])

  const activeColumns = useMemo(() => {
    if (allProperties.length === 0) return []
    const cols = visibleColumnIds.map(id => allProperties.find(p => p.id === id)).filter(Boolean) as PropertyDefinition[]
    // Migration auto : si localStorage contient des IDs invalides (version antérieure), réinitialiser au défaut
    if (cols.length === 0 && visibleColumnIds.length > 0) {
      const defaults = [...DEFAULT_VISIBLE_COLUMNS, 'system:call_count']
      return defaults.map(id => allProperties.find(p => p.id === id)).filter(Boolean) as PropertyDefinition[]
    }
    return cols
  }, [allProperties, visibleColumnIds])

  // Si activeColumns a été auto-récupéré via défaut, resynchroniser visibleColumnIds
  useEffect(() => {
    if (allProperties.length > 0 && visibleColumnIds.length > 0) {
      const valid = visibleColumnIds.filter(id => allProperties.some(p => p.id === id))
      if (valid.length === 0) {
        setVisibleColumnIds([...DEFAULT_VISIBLE_COLUMNS, 'system:call_count'])
      } else if (valid.length !== visibleColumnIds.length) {
        setVisibleColumnIds(valid)
      } else {
        // Migration auto : injecter list_names + assigned_sdrs en tête s'ils manquent
        // (clients qui avaient une config sauvegardée avant l'ajout de ces 2 system fields)
        const missing: string[] = []
        if (!valid.includes('system:list_names')) missing.push('system:list_names')
        if (!valid.includes('system:assigned_sdrs')) missing.push('system:assigned_sdrs')
        if (missing.length > 0) setVisibleColumnIds([...missing, ...valid])
      }
    }
  }, [allProperties, visibleColumnIds])

  // Build list name map
  const listNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const l of (lists || [])) m[l.id] = l.name
    return m
  }, [lists])

  // Build map listId → SDR user_ids (assigned_to)
  const listSdrsMap = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const l of (lists || [])) m[l.id] = (l.assigned_to as string[] | null | undefined) || []
    return m
  }, [lists])

  // Charger les membres de l'org pour avoir nom + role
  const { data: orgMembers } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('organisation_id', orgId)
        .is('deactivated_at', null)
      return data || []
    },
    enabled: !!orgId,
  })

  const memberNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const u of orgMembers || []) m[u.id] = u.full_name || (u.email ? u.email.split('@')[0] : 'SDR')
    return m
  }, [orgMembers])

  // ── Query ALL prospects ──
  const { data: allProspects, isLoading } = useQuery({
    queryKey: ['all-prospects', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('prospects')
        .select('id, list_id, organisation_id, name, phone, phone2, phone3, phone4, phone5, email, email2, email3, company, title, sector, linkedin_url, website_url, status, crm_status, call_count, last_call_at, last_call_outcome, snoozed_until, rdv_date, do_not_call, meeting_booked, address, city, postal_code, country, created_at')
        .eq('organisation_id', orgId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Prospect[]
    },
    enabled: !!orgId,
  })

  // ── Memberships : 1 prospect peut être sur plusieurs listes ──
  const { data: allMemberships } = useQuery({
    queryKey: ['prospect-list-memberships', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('prospect_list_memberships')
        .select('prospect_id, list_id')
        .eq('organisation_id', orgId)
      if (error) throw error
      return data as Array<{ prospect_id: string; list_id: string }>
    },
    enabled: !!orgId,
  })

  const membershipsByProspect = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const r of allMemberships || []) {
      const arr = m.get(r.prospect_id) || []
      arr.push(r.list_id)
      m.set(r.prospect_id, arr)
    }
    return m
  }, [allMemberships])

  // ── Deduplicate by normalized phone ──
  const mergedProspects = useMemo(() => {
    if (!allProspects) return []
    const byPhone = new Map<string, MergedProspect>()

    // Récupère listIds pour 1 prospect en cumulant memberships + list_id legacy
    const getListIds = (p: Prospect): string[] => {
      const ms = membershipsByProspect.get(p.id) || []
      if (ms.length > 0) return ms
      return p.list_id ? [p.list_id] : []
    }
    const namesFor = (ids: string[]) => ids.map(id => listNameMap[id] || '?')

    for (const p of allProspects) {
      // Dedupe key : phone normalisé en priorité, fallback email lowercase, fallback id
      // Comme ça les prospects email-only (créés depuis Gmail) restent visibles.
      const phone = normalizePhone(p.phone)
      const dedupeKey = phone || (p.email ? `email:${p.email.trim().toLowerCase()}` : `id:${p.id}`)

      const pListIds = getListIds(p)
      const existing = byPhone.get(dedupeKey)
      if (!existing) {
        byPhone.set(dedupeKey, { ...p, listNames: namesFor(pListIds), listIds: pListIds, list_names: '', assigned_sdrs: '' })
      } else {
        const existingScore = [existing.email, existing.company, existing.title, existing.sector, existing.linkedin_url].filter(Boolean).length
        const newScore = [p.email, p.company, p.title, p.sector, p.linkedin_url].filter(Boolean).length
        const mergedListIds = Array.from(new Set([...existing.listIds, ...pListIds]))
        if (newScore > existingScore) {
          byPhone.set(dedupeKey, { ...p, listNames: namesFor(mergedListIds), listIds: mergedListIds, list_names: '', assigned_sdrs: '' })
        } else {
          existing.listIds = mergedListIds
          existing.listNames = namesFor(mergedListIds)
        }
      }
    }
    // Post-process : calculer list_names et assigned_sdrs (string) pour getPropertyValue + filtre/tri.
    return Array.from(byPhone.values()).map(mp => ({
      ...mp,
      list_names: mp.listNames.join(', '),
      assigned_sdrs: Array.from(new Set(mp.listIds.flatMap(lid => listSdrsMap[lid] || [])))
        .map(uid => memberNameMap[uid] || 'SDR')
        .join(', '),
    }))
  }, [allProspects, listNameMap, listSdrsMap, memberNameMap, membershipsByProspect])

  // ── Auto-open ProspectModal depuis un appel entrant ──────────────
  // Quand useIncomingCall.accept() navigue ici avec state.openProspectId,
  // on ouvre automatiquement la fiche du prospect identifie.
  const location = useLocation()
  const navigate = useNavigate()
  const autoOpenId = (location.state as { openProspectId?: string } | null)?.openProspectId
  useEffect(() => {
    if (!autoOpenId) return
    const target = mergedProspects.find(p => p.id === autoOpenId)
    if (target) {
      setSelectedProspect(target)
      // Nettoie le state pour eviter de rouvrir au prochain refresh/back
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [autoOpenId, mergedProspects, navigate, location.pathname])

  // ── Sync selectedProspect apres un refetch ────────────────────────
  // Quand une action dans le modal (rappel, snooze, note, etc.) invalide
  // la query prospects, mergedProspects se met a jour. Mais selectedProspect
  // garde l'ancienne reference figee → l'UI du modal affiche l'ancien
  // state. Ce useEffect resync selectedProspect sur la nouvelle version
  // du prospect dans mergedProspects.
  useEffect(() => {
    if (!selectedProspect) return
    const fresh = mergedProspects.find(p => p.id === selectedProspect.id)
    if (fresh && fresh !== selectedProspect) {
      setSelectedProspect(fresh)
    }
  }, [mergedProspects, selectedProspect])

  // Custom field values
  const prospectIds = useMemo(() => mergedProspects.map(p => p.id), [mergedProspects])
  const { data: allCustomValues } = useCustomFieldValues(prospectIds)

  // Valeurs distinctes par colonne (pour MultiSelectFilter sur les headers).
  // Limit 50 valeurs uniques par colonne pour ne pas saturer le menu.
  const columnDistinctValues = useMemo(() => {
    const m: Record<string, string[]> = {}
    if (!mergedProspects.length) return m
    for (const col of allProperties) {
      // Skip les colonnes sans sens en filtre catégoriel (texte libre, urls, dates pures).
      if (col.fieldType === 'date' || col.fieldType === 'url' || col.key === 'socials') continue
      if (col.key === 'email' || col.key === 'phone' || col.key === 'phone2') continue
      const set = new Set<string>()
      for (const p of mergedProspects) {
        const v = getPropertyValue(p, allCustomValues?.[p.id], col)
        if (v && v !== '—') set.add(v)
        if (set.size >= 50) break
      }
      if (set.size > 0) m[col.id] = Array.from(set).sort()
    }
    return m
  }, [mergedProspects, allProperties, allCustomValues])

  // ── Filter + Sort ──
  const filtered = useMemo(() => {
    let result = mergedProspects

    // Filtre par utilisateur visible : "me" = soi-même, sinon user_id d'un SDR (admin can see SDR's view)
    const targetUserId = viewAsUserId === 'me' ? profile?.id : viewAsUserId
    if (targetUserId) {
      result = result.filter(p => p.listIds.some(lid => (listSdrsMap[lid] || []).includes(targetUserId)))
    }

    // Filtre par liste (pipeline + table) — null = toutes
    if (listFilterIds.length > 0) {
      // Match si le prospect appartient à AU MOINS une des listes cochées
      result = result.filter(p => p.listIds.some(lid => listFilterIds.includes(lid)))
    }

    // Text search
    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(p =>
        p.name?.toLowerCase().includes(lower) ||
        p.phone?.includes(lower) ||
        p.email?.toLowerCase().includes(lower) ||
        p.company?.toLowerCase().includes(lower) ||
        p.title?.toLowerCase().includes(lower) ||
        p.listNames.some(n => n.toLowerCase().includes(lower)),
      )
    }

    // Advanced filters
    for (const f of filters) {
      result = result.filter(p => evalFilter(p, f, allProperties, allCustomValues?.[p.id]))
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'created_at') cmp = (a.created_at || '').localeCompare(b.created_at || '')
      else if (sortBy === 'name') cmp = (a.name || '').localeCompare(b.name || '')
      else if (sortBy === 'company') cmp = (a.company || '').localeCompare(b.company || '')
      else if (sortBy === 'last_call_at') cmp = (a.last_call_at || '').localeCompare(b.last_call_at || '')
      else if (sortBy === 'call_count') cmp = (a.call_count || 0) - (b.call_count || 0)
      else {
        const col = allProperties.find(p => p.id === sortBy)
        if (col) {
          const va = getPropertyValue(a, allCustomValues?.[a.id], col)
          const vb = getPropertyValue(b, allCustomValues?.[b.id], col)
          cmp = va.localeCompare(vb)
        }
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return result
  }, [mergedProspects, search, filters, sortBy, sortDir, allProperties, allCustomValues, viewAsUserId, profile?.id, listSdrsMap, listFilterIds])

  // Stats
  const stats = useMemo(() => ({
    total: mergedProspects.length,
    called: mergedProspects.filter(p => p.call_count > 0).length,
    rdv: mergedProspects.filter(p => p.crm_status === 'rdv_pris' || p.crm_status === 'rdv_fait' || p.meeting_booked).length,
    connected: mergedProspects.filter(p => p.last_call_outcome === 'connected').length,
  }), [mergedProspects])

  // Sort toggle
  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  // Selection
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }
  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(p => p.id)))
  }

  // Bulk actions
  const bulkUpdateStatus = async (status: string) => {
    const ids = Array.from(selectedIds)
    await supabase.from('prospects').update({ crm_status: status }).in('id', ids)
    queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
    setSelectedIds(new Set())
  }

  const bulkDelete = async () => {
    if (!perms.canDeleteContacts) return
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const msg = `Archiver ${ids.length} contact${ids.length > 1 ? 's' : ''} ? Les données restent récupérables.`
    if (!confirm(msg)) return
    console.log('[crm-bulk-delete] requesting', ids.length, 'ids')
    const { data, error } = await supabase
      .from('prospects')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .select('id')
    console.log('[crm-bulk-delete] result', { error, returned: data?.length, requested: ids.length })
    if (error) { alert(`Erreur archivage : ${error.message}`); return }
    if ((data?.length || 0) === 0) {
      alert(`0 contact archivé sur ${ids.length} demandé(s) — RLS bloque (vérifie ton rôle/org).`)
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
    await queryClient.invalidateQueries({ queryKey: ['prospects'] })
    await queryClient.invalidateQueries({ queryKey: ['prospect-lists'] })
    setSelectedIds(new Set())
  }

  // Fusionne plusieurs prospects en un seul (canonical = 1er sélectionné = le plus ancien)
  const bulkMerge = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length < 2) { alert('Sélectionne au moins 2 contacts pour fusionner'); return }
    // Charge infos pour le prompt
    const selected = mergedProspects.filter(p => ids.includes(p.id))
    if (selected.length < 2) return
    // Trie par created_at asc → canonical = le plus ancien
    selected.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const canonical = selected[0]
    const dups = selected.slice(1)
    const msg = `Fusionner ${ids.length} contacts en 1 fiche ?\n\n` +
      `→ Canonique (gardé) : ${canonical.name} (${canonical.email || canonical.phone || '?'})\n` +
      `→ À fusionner :\n${dups.map(d => `  • ${d.name} (${d.email || d.phone || '?'})`).join('\n')}\n\n` +
      `Tous les emails, téléphones, appels, messages, RDV, listes seront regroupés sur la fiche canonique.\n` +
      `Les autres fiches sont archivées (récupérables).`
    if (!confirm(msg)) return
    const { data, error } = await supabase.rpc('merge_prospects', {
      p_canonical_id: canonical.id,
      p_dup_ids: dups.map(d => d.id),
    })
    if (error) { alert(`Erreur fusion : ${error.message}`); return }
    const merged = (data as Array<{ merged_count: number }>)?.[0]?.merged_count || 0
    await queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
    await queryClient.invalidateQueries({ queryKey: ['prospect-list-memberships'] })
    await queryClient.invalidateQueries({ queryKey: ['prospects'] })
    setSelectedIds(new Set())
    alert(`✅ ${merged} fiche${merged > 1 ? 's' : ''} fusionnée${merged > 1 ? 's' : ''} dans "${canonical.name}".`)
  }

  // Crée une nouvelle liste à partir des prospects sélectionnés
  const bulkCreateList = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0 || !orgId || !profile?.id) return
    const name = prompt(`Nom de la nouvelle liste (${ids.length} contact${ids.length > 1 ? 's' : ''}) ?`)?.trim()
    if (!name) return
    const { data: list, error } = await supabase.from('prospect_lists').insert({
      organisation_id: orgId,
      name,
      created_by: profile.id,
      assigned_to: [profile.id],
    }).select('id').single()
    if (error || !list) { alert(`Erreur création liste : ${error?.message || 'inconnue'}`); return }
    const memberships = ids.map(pid => ({ prospect_id: pid, list_id: list.id, organisation_id: orgId }))
    const { error: mErr } = await supabase.from('prospect_list_memberships').upsert(memberships, { onConflict: 'prospect_id,list_id', ignoreDuplicates: true })
    if (mErr) { alert(`Liste créée mais memberships partiels : ${mErr.message}`); }
    await queryClient.invalidateQueries({ queryKey: ['prospect-lists'] })
    await queryClient.invalidateQueries({ queryKey: ['prospect-list-memberships'] })
    await queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
    setSelectedIds(new Set())
    alert(`Liste "${name}" créée avec ${ids.length} contact${ids.length > 1 ? 's' : ''}.`)
  }

  // Views
  const saveCurrentView = (name: string) => {
    const view: SavedView = {
      id: crypto.randomUUID(),
      name,
      columns: visibleColumnIds,
      filters,
      sortBy,
      sortDir,
      hiddenStageKeys,
      listFilterIds,
      viewAsUserId,
    }
    persistViews([...savedViews, view])
    setActiveViewId(view.id)
    setSavingView(false)
    setNewViewName('')
  }

  const loadView = (view: SavedView) => {
    setVisibleColumnIds(view.columns)
    setFilters(view.filters || [])
    setSortBy(view.sortBy)
    setSortDir(view.sortDir)
    // Pipeline filters (avec défauts si vue ancienne sans ces champs)
    setHiddenStageKeys(view.hiddenStageKeys || [])
    // v2 multi OU fallback v1 single
    setListFilterIds(view.listFilterIds || (view.listFilterId ? [view.listFilterId] : []))
    setViewAsUserId(view.viewAsUserId ?? null)
    setActiveViewId(view.id)
  }

  const resetAllFilters = () => {
    setActiveViewId(null)
    setFilters([])
    setHiddenStageKeys([])
    setListFilterIds([])
    setViewAsUserId(null)
    setSearch('')
  }

  // Call from CRM
  const handleCall = useCallback((p: Prospect) => {
    if ((cm.isIdle || cm.isDisconnected) && cm.providerReady) {
      cm.call(p)
    }
  }, [cm])

  const isInCall = cm.isDialing || cm.isConnected

  // Render cell
  const renderCell = (prospect: MergedProspect, col: PropertyDefinition) => {
    if (col.key === 'socials') return <SocialLinks prospectId={prospect.id} compact />

    if (col.key === 'list_names') {
      if (prospect.listNames.length === 0) return <span className="text-[10px] text-gray-300">—</span>
      return (
        <div className="flex flex-wrap gap-0.5">
          {prospect.listNames.slice(0, 2).map((name, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 whitespace-nowrap truncate max-w-[80px]">{name}</span>
          ))}
          {prospect.listNames.length > 2 && <span className="text-[9px] text-gray-400">+{prospect.listNames.length - 2}</span>}
        </div>
      )
    }

    if (col.key === 'assigned_sdrs') {
      const sdrIds = Array.from(new Set(prospect.listIds.flatMap(lid => listSdrsMap[lid] || [])))
      if (sdrIds.length === 0) return <span className="text-[10px] text-gray-300">—</span>
      return (
        <div className="flex flex-wrap gap-0.5">
          {sdrIds.slice(0, 2).map(uid => (
            <span key={uid} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-100 whitespace-nowrap truncate max-w-[100px]" title={memberNameMap[uid] || 'SDR'}>
              {memberNameMap[uid] || 'SDR'}
            </span>
          ))}
          {sdrIds.length > 2 && <span className="text-[9px] text-gray-400">+{sdrIds.length - 2}</span>}
        </div>
      )
    }

    const value = getPropertyValue(prospect, allCustomValues?.[prospect.id], col)

    // Read-only colonnes calculées (pas de modification)
    if (col.key === 'last_call_at' || col.key === 'call_count' || col.key === 'last_call_outcome' || col.key === 'created_at') {
      if (col.fieldType === 'date' && value && value !== '—') {
        const d = new Date(value)
        if (!isNaN(d.getTime())) {
          return <span className="text-[12px] text-gray-600">{d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
        }
      }
      return <span className="text-[12px] text-gray-500">{value || '—'}</span>
    }

    // Édition inline (style Dialer / HubSpot) pour tout le reste
    return (
      <div className="group">
        <InlineEditCell
          prospectId={prospect.id}
          col={col}
          value={value}
          customValues={allCustomValues?.[prospect.id]}
          enumLabels={col.key === 'crm_status' ? crmLabels : undefined}
          distinctValues={columnDistinctValues[col.id]}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
            queryClient.invalidateQueries({ queryKey: ['custom-field-values'] })
          }}
        />
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#f5f3ff] p-4 pl-2 overflow-hidden flex flex-col">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 flex-1 flex flex-col overflow-hidden">

        {/* ── Header + Stats + Vues (1 seule ligne compacte) ── */}
        <div className="px-5 py-2.5 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="flex items-baseline gap-2">
            <h1 className="text-[16px] font-bold text-gray-800">Contacts</h1>
            <span className="text-[11px] text-gray-400">{filtered.length}/{stats.total}</span>
          </div>

          {/* Vues inline */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
            <button onClick={resetAllFilters}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                !activeViewId ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>Tous</button>
            {savedViews.map(v => (
              <button key={v.id} onClick={() => loadView(v)}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap group flex items-center gap-1 ${
                  activeViewId === v.id ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                {v.name}
                <button onClick={(e) => { e.stopPropagation(); persistViews(savedViews.filter(sv => sv.id !== v.id)); if (activeViewId === v.id) setActiveViewId(null) }}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-[9px]">✕</button>
              </button>
            ))}
            {savingView ? (
              <div className="flex items-center gap-1">
                <input value={newViewName} onChange={e => setNewViewName(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && newViewName.trim()) saveCurrentView(newViewName.trim()); if (e.key === 'Escape') setSavingView(false) }}
                  placeholder="Nom..." className="text-[11px] px-2 py-0.5 border border-indigo-200 rounded-md outline-none w-24" />
                <button onClick={() => { if (newViewName.trim()) saveCurrentView(newViewName.trim()) }}
                  className="text-[10px] text-indigo-500 font-medium">OK</button>
              </div>
            ) : (
              <button onClick={() => setSavingView(true)} className="text-[10px] text-gray-400 hover:text-indigo-500 px-1">+ Vue</button>
            )}
          </div>

          {/* Stats compactes */}
          <div className="flex items-center gap-2.5 text-[11px] flex-shrink-0">
            <span className="text-gray-400">Total <span className="font-bold text-gray-700">{stats.total}</span></span>
            <span className="text-gray-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-500" />Appelés <span className="font-bold text-violet-600">{stats.called}</span></span>
            <span className="text-gray-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Conn. <span className="font-bold text-emerald-600">{stats.connected}</span></span>
            <span className="text-gray-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-500" />RDV <span className="font-bold text-teal-600">{stats.rdv}</span></span>
          </div>

          {/* Toggle Table / Pipeline */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
            <button onClick={() => setViewMode('table')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${viewMode === 'table' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>Table</button>
            <button onClick={() => setViewMode('board')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${viewMode === 'board' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>Pipeline</button>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="px-5 py-2 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white flex-1 max-w-sm">
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
              className="text-[13px] bg-transparent outline-none text-gray-700 placeholder:text-gray-400 w-full" />
            {search && <button onClick={() => setSearch('')} className="text-gray-300 hover:text-gray-500 text-xs">✕</button>}
          </div>

          {/* Advanced filters + Column picker — table only */}
          {viewMode === 'table' && (
            <>
              <FilterBuilder filters={filters} setFilters={setFilters} allProperties={allProperties} crmStatuses={crmStatuses || []} />
              <CrmColumnPicker visible={visibleColumnIds} setVisible={setVisibleColumnIds} allProperties={allProperties} open={showColumnPicker} onToggle={() => setShowColumnPicker(!showColumnPicker)} />
            </>
          )}

          {/* Stages visibles (pipeline only) */}
          {viewMode === 'board' && (
            <div className="relative">
              <button onClick={() => setShowStageVisibilityMenu(v => !v)}
                title="Choisir les statuts à afficher dans le pipeline"
                className={`flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border transition-colors ${
                  hiddenStageKeys.length > 0 ? 'bg-violet-50 border-violet-200 text-violet-700 font-medium' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
                }`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Stages{hiddenStageKeys.length > 0 && <span className="text-[10px] text-violet-500 font-bold">−{hiddenStageKeys.length}</span>}
                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showStageVisibilityMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStageVisibilityMenu(false)} />
                  <div className="absolute right-0 top-10 w-[260px] bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-1 max-h-[400px] overflow-y-auto animate-slide-down">
                    <div className="px-3 py-1.5 flex items-center gap-2 border-b border-gray-100">
                      <button onClick={() => setHiddenStageKeys([])} className="text-[10px] text-indigo-600 hover:underline">Tout afficher</button>
                      <span className="text-gray-300 text-[10px]">·</span>
                      <button onClick={() => setHiddenStageKeys(effectiveStatuses.map(s => s.key))} className="text-[10px] text-gray-500 hover:underline">Tout masquer</button>
                      <span className="ml-auto text-[10px] text-gray-400">{effectiveStatuses.length - hiddenStageKeys.length}/{effectiveStatuses.length}</span>
                    </div>
                    {effectiveStatuses.map(s => {
                      const isHidden = hiddenStageKeys.includes(s.key)
                      return (
                        <label key={s.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={!isHidden}
                            onChange={() => setHiddenStageKeys(prev => isHidden ? prev.filter(k => k !== s.key) : [...prev, s.key])}
                            className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" />
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                          <span className={`text-[12px] truncate flex-1 ${isHidden ? 'text-gray-400' : 'text-gray-700 font-medium'}`}>{s.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Filtre par listes (multi-sélection à coches) */}
          <div className="relative">
            <button onClick={() => setShowListMenu(v => !v)}
              title="Filtrer le pipeline sur une ou plusieurs listes"
              className={`flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border transition-colors ${
                listFilterIds.length > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
              }`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10M4 18h6" /></svg>
              {listFilterIds.length === 0
                ? 'Toutes listes'
                : listFilterIds.length === 1
                  ? (lists?.find(l => l.id === listFilterIds[0])?.name || 'Liste')
                  : `${listFilterIds.length} listes`}
              <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showListMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowListMenu(false)} />
                <div className="absolute right-0 top-10 w-[280px] bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-1 max-h-[400px] overflow-y-auto animate-slide-down">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
                    <button onClick={() => setListFilterIds((lists || []).map(l => l.id))}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">Tout cocher</button>
                    <span className="text-[10px] text-gray-400">{listFilterIds.length}/{(lists || []).length}</span>
                    <button onClick={() => setListFilterIds([])}
                      className="text-[10px] text-gray-500 hover:text-gray-700 font-medium">Tout décocher</button>
                  </div>
                  {(lists || []).map(l => {
                    const checked = listFilterIds.includes(l.id)
                    return (
                      <label key={l.id}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            setListFilterIds(prev => checked ? prev.filter(id => id !== l.id) : [...prev, l.id])
                          }}
                          className="w-3.5 h-3.5 accent-indigo-600" />
                        <span className={`truncate flex-1 ${checked ? 'font-semibold text-indigo-700' : 'text-gray-700'}`}>{l.name}</span>
                      </label>
                    )
                  })}
                  {(!lists || lists.length === 0) && <p className="px-3 py-2 text-[11px] text-gray-400 italic">Aucune liste</p>}
                </div>
              </>
            )}
          </div>

          {/* Voir comme… (dropdown admin / toggle SDR) */}
          {perms.isAdmin ? (
            <div className="relative">
              <button onClick={() => setShowViewAsMenu(v => !v)}
                title="Voir comme un commercial"
                className={`flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border transition-colors ${
                  viewAsUserId ? 'bg-amber-50 border-amber-200 text-amber-700 font-medium' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
                }`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {viewAsUserId === 'me'
                  ? 'Mes contacts'
                  : viewAsUserId
                    ? memberNameMap[viewAsUserId] || 'SDR'
                    : 'Voir comme'}
                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showViewAsMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowViewAsMenu(false)} />
                  <div className="absolute right-0 top-10 w-[220px] bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-1 max-h-[300px] overflow-y-auto animate-slide-down">
                    <button onClick={() => { setViewAsUserId(null); setShowViewAsMenu(false) }}
                      className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 transition-colors ${!viewAsUserId ? 'font-semibold text-indigo-600' : 'text-gray-600'}`}>
                      Toute l'équipe
                    </button>
                    <button onClick={() => { setViewAsUserId('me'); setShowViewAsMenu(false) }}
                      className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 transition-colors ${viewAsUserId === 'me' ? 'font-semibold text-indigo-600' : 'text-gray-600'}`}>
                      Mes contacts
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Commerciaux</p>
                    {(orgMembers || []).filter(u => u.id !== profile?.id).map(u => (
                      <button key={u.id} onClick={() => { setViewAsUserId(u.id); setShowViewAsMenu(false) }}
                        className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 transition-colors truncate ${viewAsUserId === u.id ? 'font-semibold text-indigo-600' : 'text-gray-600'}`}>
                        {u.full_name || u.email.split('@')[0]} <span className="text-gray-300 text-[10px]">{u.role === 'super_admin' ? 'admin' : u.role}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <button onClick={() => setViewAsUserId(viewAsUserId === 'me' ? null : 'me')}
              title={viewAsUserId === 'me' ? 'Afficher tous les contacts' : 'Filtrer sur mes contacts'}
              className={`flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border transition-colors ${
                viewAsUserId === 'me' ? 'bg-amber-50 border-amber-200 text-amber-700 font-medium' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
              }`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Mes contacts
            </button>
          )}

          {/* Détecteur doublons — toujours visible */}
          <button onClick={() => setShowDuplicates(true)} title="Détecter les fiches en doublon"
            className="text-[11px] text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1">
            🔍 Doublons
          </button>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
              <span className="text-[11px] text-indigo-600 font-medium">{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
              <select onChange={e => { if (e.target.value) bulkUpdateStatus(e.target.value); e.target.value = '' }}
                className="text-[11px] border border-gray-200 rounded px-1.5 py-1 outline-none">
                <option value="">Changer statut...</option>
                {(crmStatuses || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <button onClick={bulkCreateList} title="Créer une liste avec ces contacts"
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium">+ Liste</button>
              {selectedIds.size >= 2 && (
                <button onClick={bulkMerge} title="Fusionner ces contacts en 1 seule fiche (le plus ancien gardé)"
                  className="text-[11px] text-violet-600 hover:text-violet-800 font-medium">⚭ Fusionner</button>
              )}
              {perms.canDeleteContacts && (
                <button onClick={bulkDelete} className="text-[11px] text-red-500 hover:text-red-700 font-medium">Supprimer</button>
              )}
              {perms.canExportData && (
                <button className="text-[11px] text-gray-500 hover:text-gray-700">Exporter</button>
              )}
            </div>
          )}
        </div>

        {/* ── Bandeau RDV à venir (composant partagé) ── */}
        <UpcomingRdvBar onProspectClick={p => {
          const matched = mergedProspects.find(mp => mp.id === p.id) as MergedProspect | undefined
          setSelectedProspect(matched || (p as MergedProspect))
        }} />

        {/* ── Filtres actifs (chips ambrés, style Dialer) ── */}
        {filters.length > 0 && (
          <div className="px-5 py-1.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-amber-600 font-medium">Filtres :</span>
            {filters.map(f => {
              const prop = allProperties.find(p => p.id === f.propertyId)
              const opLabel: Record<string, string> = { eq: '=', neq: '≠', contains: '∋', not_contains: '∌', starts: '→', empty: 'vide', not_empty: '≠ vide', gt: '>', lt: '<', in: '∈', true: 'Oui', false: 'Non' }
              const dv = columnDistinctValues[f.propertyId]
              const enumOpts = (prop?.fieldType === 'enum' && prop.options) ? prop.options : null
              return (
                <div key={f.id} className="flex items-center gap-1 bg-white rounded-lg border border-amber-200 px-2 py-0.5">
                  <span className="text-[11px] text-gray-600 font-medium">{prop?.name || '?'}</span>
                  <span className="text-[10px] text-amber-500">{opLabel[f.op] || f.op}</span>
                  {!['empty', 'not_empty', 'true', 'false'].includes(f.op) && (
                    (dv || enumOpts) ? (
                      <MultiSelectFilter
                        options={(dv || enumOpts || []) as string[]}
                        value={f.op === 'in' ? f.value : (f.value || '')}
                        labelize={(v) => crmLabels[v] || CRM_STATUS_LABELS[v] || v}
                        onChange={(newVal) => setFilters(prev => prev.map(pf => pf.id === f.id ? { ...pf, op: 'in', value: newVal } : pf))}
                      />
                    ) : (
                      <input value={f.value} onChange={e => setFilters(prev => prev.map(pf => pf.id === f.id ? { ...pf, value: e.target.value } : pf))}
                        placeholder="..." className="text-[11px] bg-transparent border-0 outline-none text-gray-700 font-medium w-24" />
                    )
                  )}
                  <button onClick={() => setFilters(prev => prev.filter(pf => pf.id !== f.id))}
                    className="text-amber-400 hover:text-red-500 ml-0.5">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )
            })}
            <button onClick={() => setFilters([])}
              className="text-[10px] text-amber-500 hover:text-red-500 ml-1">Effacer filtres</button>
          </div>
        )}

        {/* ── Board (Pipeline Kanban) ── */}
        {viewMode === 'board' && !isLoading && (
          <div ref={boardRef}
            onDragOver={handleBoardDragOver}
            onDragLeave={stopAutoScroll}
            onDrop={stopAutoScroll}
            className="flex-1 min-h-0 overflow-x-auto p-4">
            <div className="flex gap-3 h-full">
              {(() => {
                // Si recherche active, on n'affiche que les colonnes avec au moins un résultat
                // 1) Cacher les stages explicitement masqués via le menu Visibilité
                let visibleStages = effectiveStatuses.filter(s => !hiddenStageKeys.includes(s.key))
                // 2) En mode recherche, masquer aussi les colonnes sans match
                if (search.trim()) {
                  visibleStages = visibleStages.filter(s => filtered.some(p => (p.crm_status || 'new') === s.key))
                }
                return visibleStages
              })().map(stage => {
                // Tri intelligent SDR : à appeler en haut (jamais appelé, snooze expiré),
                // puis déjà appelés (par dernier appel le plus ancien), puis snoozés futurs, puis DNC en bas.
                const callPriority = (p: MergedProspect): number => {
                  if (p.do_not_call) return 4
                  const isSnoozedNow = !!p.snoozed_until && new Date(p.snoozed_until) > new Date()
                  if (isSnoozedNow) return 3
                  if (!p.last_call_at) return 0
                  return 2
                }
                const stageProspects = filtered
                  .filter(p => (p.crm_status || 'new') === stage.key)
                  .sort((a, b) => {
                    const pa = callPriority(a), pb = callPriority(b)
                    if (pa !== pb) return pa - pb
                    // Plus ancien dernier appel en haut (plus urgent à rappeler)
                    const ta = a.last_call_at ? new Date(a.last_call_at).getTime() : 0
                    const tb = b.last_call_at ? new Date(b.last_call_at).getTime() : 0
                    if (ta !== tb) return ta - tb
                    return (a.name || '').localeCompare(b.name || '')
                  })
                const rdvCount = stageProspects.filter(p => p.meeting_booked).length
                const totalCalls = stageProspects.reduce((s, p) => s + (p.call_count || 0), 0)
                return (
                  <div key={stage.key}
                    onDragOver={e => {
                      // Réordonnage de stage : on accepte le drop si on traîne une autre stage
                      if (dragStageKey && dragStageKey !== stage.key) { e.preventDefault() }
                    }}
                    onDrop={e => {
                      if (dragStageKey && dragStageKey !== stage.key) {
                        e.preventDefault(); e.stopPropagation()
                        const order = effectiveStatuses.map(s => s.key)
                        const from = order.indexOf(dragStageKey)
                        const to = order.indexOf(stage.key)
                        if (from !== -1 && to !== -1) {
                          const next = [...order]
                          next.splice(from, 1)
                          next.splice(to, 0, dragStageKey)
                          setStageOrder(next)
                        }
                        setDragStageKey(null)
                      }
                    }}
                    className={`w-[280px] min-w-[280px] flex flex-col bg-gray-50/80 rounded-xl border border-gray-100 h-full transition-opacity ${dragStageKey === stage.key ? 'opacity-40' : ''}`}>
                    {/* Column header — coloré par stage + drag handle (handle = tout le header) */}
                    <div className="px-3 py-2.5 border-b-2 flex flex-col gap-1.5 flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
                      draggable
                      onDragStart={e => { setDragStageKey(stage.key); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => setDragStageKey(null)}
                      style={{ borderColor: stage.color + '40' }}>
                      <div className="flex items-center gap-2">
                        <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: stage.color }} />
                        <span className="text-[12px] font-semibold text-gray-700 flex-1 truncate">{stage.label}</span>
                        <button onClick={e => {
                          e.stopPropagation()
                          // Préremplit la liste avec celle filtrée si elle existe, sinon la première dispo
                          setQuickAdd({ stageKey: stage.key, stageLabel: stage.label, name: '', phone: '', listId: listFilterIds[0] || lists?.[0]?.id || '' })
                        }} title={`Ajouter un contact dans "${stage.label}"`}
                          className="w-5 h-5 rounded-md text-gray-300 hover:text-violet-600 hover:bg-violet-100 flex items-center justify-center transition-colors flex-shrink-0">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                        </button>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: stage.color + '20', color: stage.color }}>
                          {stageProspects.length}
                        </span>
                      </div>
                      {/* Métriques compactes */}
                      {stageProspects.length > 0 && (
                        <div className="flex items-center gap-2 text-[9px] text-gray-400 pl-4">
                          {rdvCount > 0 && <span className="text-teal-500 font-medium">{rdvCount} RDV</span>}
                          {totalCalls > 0 && <span>{totalCalls} appel{totalCalls > 1 ? 's' : ''}</span>}
                        </div>
                      )}
                    </div>
                    {/* Cards container — drop zone (scroll vertical des cards uniquement) */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5 transition-colors rounded-b-xl min-h-0"
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('bg-violet-100/40', 'ring-2', 'ring-violet-300', 'ring-inset') }}
                      onDragLeave={e => { e.currentTarget.classList.remove('bg-violet-100/40', 'ring-2', 'ring-violet-300', 'ring-inset') }}
                      onDrop={async e => {
                        e.currentTarget.classList.remove('bg-violet-100/40', 'ring-2', 'ring-violet-300', 'ring-inset')
                        const prospectId = e.dataTransfer.getData('prospectId')
                        if (!prospectId) return
                        await supabase.from('prospects').update({ crm_status: stage.key }).eq('id', prospectId)
                        queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
                      }}>
                      {stageProspects.map(p => {
                        const sdrIds = Array.from(new Set(p.listIds.flatMap(lid => listSdrsMap[lid] || [])))
                        const isSnoozed = !!p.snoozed_until && new Date(p.snoozed_until) > new Date()
                        const lastCallDate = p.last_call_at ? new Date(p.last_call_at) : null
                        const daysSinceCall = lastCallDate ? Math.floor((Date.now() - lastCallDate.getTime()) / 86400000) : null
                        return (
                          <div key={p.id} draggable
                            onDragStart={e => e.dataTransfer.setData('prospectId', p.id)}
                            onClick={() => setSelectedProspect(p)}
                            className="bg-white rounded-lg border border-gray-200 p-2.5 cursor-pointer hover:shadow-md hover:border-violet-300 transition-all active:scale-[0.98] group">
                            {/* Header card : avatar + nom + actions */}
                            <div className="flex items-start gap-2 mb-1.5">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                {(p.name || '?')[0].toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-semibold text-gray-800 truncate">{p.name}</p>
                                {p.company && <p className="text-[10px] text-gray-400 truncate">{p.company}</p>}
                              </div>
                              {/* Quick action : Appeler — visible au hover */}
                              {p.phone && !p.do_not_call && (
                                <button onClick={e => { e.stopPropagation(); cm.startOutbound(p, [p]) }}
                                  title={`Appeler ${p.phone}`}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full bg-violet-500 text-white flex items-center justify-center hover:bg-violet-600 flex-shrink-0">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                </button>
                              )}
                            </div>

                            {/* Listes (badges) */}
                            {p.listNames.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mb-1">
                                {p.listNames.slice(0, 2).map((name, i) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 truncate max-w-[80px]">{name}</span>
                                ))}
                                {p.listNames.length > 2 && <span className="text-[9px] text-gray-400">+{p.listNames.length - 2}</span>}
                              </div>
                            )}

                            {/* SDR assignés (badges ambrés) */}
                            {sdrIds.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mb-1">
                                {sdrIds.slice(0, 2).map(uid => (
                                  <span key={uid} className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-amber-50 text-amber-700 border border-amber-100 truncate max-w-[80px]" title={memberNameMap[uid] || 'SDR'}>
                                    {memberNameMap[uid] || 'SDR'}
                                  </span>
                                ))}
                                {sdrIds.length > 2 && <span className="text-[9px] text-gray-400">+{sdrIds.length - 2}</span>}
                              </div>
                            )}

                            {/* Footer : indicateurs d'état */}
                            <div className="flex items-center gap-1.5 text-[9px] text-gray-400 flex-wrap">
                              {p.meeting_booked && <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 font-semibold">RDV</span>}
                              {p.do_not_call && <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-semibold">DNC</span>}
                              {isSnoozed && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-semibold" title={`Rappel le ${new Date(p.snoozed_until!).toLocaleDateString('fr-FR')}`}>Snooze</span>}
                              {p.call_count > 0 && (
                                <span title={`${p.call_count} appel${p.call_count > 1 ? 's' : ''} passé${p.call_count > 1 ? 's' : ''}`}>
                                  📞 {p.call_count}
                                </span>
                              )}
                              {daysSinceCall !== null && daysSinceCall <= 30 && (
                                <span className={daysSinceCall <= 7 ? 'text-emerald-500' : 'text-gray-400'} title={`Dernier appel il y a ${daysSinceCall} jour${daysSinceCall > 1 ? 's' : ''}`}>
                                  {daysSinceCall === 0 ? "aujourd'hui" : daysSinceCall === 1 ? 'hier' : `il y a ${daysSinceCall}j`}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {stageProspects.length === 0 && (
                        <p className="text-[11px] text-gray-300 text-center py-4 italic">Glissez un contact ici</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Table ── */}
        {viewMode === 'table' && (isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Chargement...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-2">
            <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm font-medium text-gray-500">Aucun contact</p>
            <p className="text-xs text-gray-400">{search || filters.length ? 'Modifiez vos filtres' : 'Importez des prospects depuis le Dialer'}</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="border-collapse" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
              <thead className="sticky top-0 z-20">
                <tr className="border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">
                  {/* Checkbox */}
                  <th className="py-2.5 px-3" style={{ width: 40 }}>
                    <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={selectAll} className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" />
                  </th>
                  {/* Name (sticky) */}
                  <th className="py-2.5 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider border-r border-gray-100 sticky left-0 z-30 bg-violet-50/90 cursor-pointer"
                    style={{ width: 220, minWidth: 220, boxShadow: '4px 0 8px -4px rgba(0,0,0,0.06)' }}
                    onClick={() => toggleSort('name')}>
                    <div className="flex items-center gap-1">Nom {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}</div>
                  </th>
                  {/* Listes + Commerciaux sont désormais des colonnes dynamiques (system:list_names, system:assigned_sdrs) */}
                  {/* Dynamic columns — drag, tri, filtre, masquer (style Dialer) */}
                  {activeColumns.map(col => {
                    const isSorted = sortBy === col.id
                    const isFiltered = filters.some(f => f.propertyId === col.id)
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
                              setVisibleColumnIds(next)
                            }
                          }
                          setDragColId(null)
                        }}
                        onDragEnd={() => setDragColId(null)}
                        className={`py-2.5 px-3 text-left text-[10px] font-bold uppercase tracking-wider border-r border-gray-100 whitespace-nowrap select-none cursor-grab active:cursor-grabbing group/th relative ${
                          dragColId === col.id ? 'opacity-40' : ''
                        } ${col.type === 'custom' ? 'text-violet-400' : 'text-gray-400'}`}
                        style={{ minWidth: col.key === 'email' ? 170 : 130 }}>
                        <div className="flex items-center gap-1">
                          <span className="flex-1 truncate">{col.name}</span>
                          <button onClick={e => { e.stopPropagation(); toggleSort(col.id) }} title="Trier"
                            className={`flex-shrink-0 transition-opacity ${isSorted ? 'opacity-100 text-indigo-500' : 'opacity-0 group-hover/th:opacity-60 text-gray-400 hover:text-gray-600'}`}>
                            {isSorted && sortDir === 'desc'
                              ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                            }
                          </button>
                          <button onClick={e => {
                            e.stopPropagation()
                            const existing = filters.find(f => f.propertyId === col.id)
                            if (existing) {
                              setFilters(prev => prev.filter(f => f.propertyId !== col.id))
                            } else {
                              const dv = columnDistinctValues[col.id]
                              const op: FilterOp = col.fieldType === 'boolean' ? 'true' : (col.fieldType === 'enum' || dv) ? 'in' : 'contains'
                              setFilters(prev => [...prev, { id: crypto.randomUUID(), propertyId: col.id, op, value: '' }])
                            }
                          }} title="Filtrer cette colonne"
                            className={`flex-shrink-0 transition-opacity ${isFiltered ? 'opacity-100 text-indigo-500' : 'opacity-0 group-hover/th:opacity-60 text-gray-400 hover:text-gray-600'}`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                          </button>
                          <button onClick={e => { e.stopPropagation(); setVisibleColumnIds(visibleColumnIds.filter(c => c !== col.id)) }}
                            title="Masquer cette colonne"
                            className="flex-shrink-0 opacity-0 group-hover/th:opacity-60 text-gray-400 hover:text-red-500 transition-opacity">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className={`group/row border-b border-gray-50 hover:bg-violet-50/30 transition-colors ${selectedIds.has(p.id) ? 'bg-indigo-50/40' : ''}`}>
                    <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" />
                    </td>
                    <td className="py-2 px-4 sticky left-0 z-10 bg-white group-hover/row:bg-violet-100 hover:bg-violet-200 border-r border-gray-100 cursor-pointer transition-colors"
                      style={{ width: 220, minWidth: 220, boxShadow: '4px 0 8px -4px rgba(0,0,0,0.03)' }}
                      onClick={() => setSelectedProspect(p)}>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {(p.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-gray-800 truncate">{p.name}</p>
                          {p.company && <p className="text-[10px] text-gray-400 truncate">{p.company}</p>}
                        </div>
                      </div>
                    </td>
                    {/* Listes + Commerciaux sont rendus via renderCell (system:list_names + system:assigned_sdrs) */}
                    {activeColumns.map(col => (
                      <td key={col.id} className="py-2 px-3 border-r border-gray-100 cursor-pointer" onClick={() => setSelectedProspect(p)}>
                        {renderCell(p, col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* ── Quick-add popup depuis Kanban (header colonne +) ── */}
      {quickAdd && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => !quickAddSaving && setQuickAdd(null)}>
          <div onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl w-[420px] p-5 animate-fade-in-scale">
            <h3 className="text-[15px] font-bold text-gray-800 mb-1">Ajouter un contact</h3>
            <p className="text-[11px] text-gray-400 mb-4">Stage : <span className="font-semibold text-gray-600">{quickAdd.stageLabel}</span></p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase">Liste *</label>
                <select value={quickAdd.listId} onChange={e => setQuickAdd(q => q ? { ...q, listId: e.target.value } : null)}
                  className="w-full mt-1 text-[13px] px-2.5 py-2 border border-gray-200 rounded-lg outline-none focus:border-indigo-300">
                  {(lists || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  {(!lists || lists.length === 0) && <option value="">Aucune liste accessible</option>}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase">Nom *</label>
                <input autoFocus type="text" value={quickAdd.name}
                  onChange={e => setQuickAdd(q => q ? { ...q, name: e.target.value } : null)}
                  className="w-full mt-1 text-[13px] px-2.5 py-2 border border-gray-200 rounded-lg outline-none focus:border-indigo-300" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase">Téléphone *</label>
                <input type="tel" value={quickAdd.phone}
                  onChange={e => setQuickAdd(q => q ? { ...q, phone: e.target.value } : null)}
                  placeholder="+33 6 12 34 56 78"
                  className="w-full mt-1 text-[13px] px-2.5 py-2 border border-gray-200 rounded-lg outline-none focus:border-indigo-300 font-mono" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setQuickAdd(null)} disabled={quickAddSaving}
                className="flex-1 px-4 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                Annuler
              </button>
              <button onClick={async () => {
                if (!quickAdd.name.trim() || !quickAdd.phone.trim() || !quickAdd.listId || !orgId) {
                  alert('Nom, téléphone et liste sont requis')
                  return
                }
                setQuickAddSaving(true)
                const { error } = await supabase.from('prospects').insert({
                  list_id: quickAdd.listId,
                  organisation_id: orgId,
                  name: quickAdd.name.trim(),
                  phone: quickAdd.phone.trim(),
                  crm_status: quickAdd.stageKey,
                })
                setQuickAddSaving(false)
                if (error) { alert(`Erreur : ${error.message}`); return }
                await queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
                setQuickAdd(null)
              }} disabled={quickAddSaving || !quickAdd.name.trim() || !quickAdd.phone.trim()}
                className="flex-1 px-4 py-2 text-[13px] font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-xl transition-colors">
                {quickAddSaving ? 'Ajout...' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Détecteur de doublons ── */}
      {showDuplicates && (
        <DuplicatesDetector
          prospects={mergedProspects}
          onClose={() => setShowDuplicates(false)}
        />
      )}

      {/* ── ProspectModal (interactif — peut appeler) ── */}
      {selectedProspect && (
        <ProspectModal
          prospect={selectedProspect}
          callContext={cm.context}
          callHistory={callHistory || []}
          isInCall={isInCall}
          isDisconnected={cm.isDisconnected}
          onCall={handleCall}
          onClose={() => { if (cm.isDisconnected) cm.reset(); setSelectedProspect(null) }}
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
