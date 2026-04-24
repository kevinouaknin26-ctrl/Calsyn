/**
 * CRM Global — HubSpot-style contact management.
 * Vue unifiée de tous les contacts, dédupliqués par téléphone.
 * Features: vues sauvegardées, filtres avancés, colonnes config, bulk actions, appels.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
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
import type { Prospect } from '@/types/prospect'
import { normalizePhone } from '@/utils/phone'

// ══════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════

interface MergedProspect extends Prospect {
  listNames: string[]
  listIds: string[]
}

type FilterOp = 'eq' | 'neq' | 'contains' | 'not_contains' | 'starts' | 'empty' | 'not_empty' | 'gt' | 'lt' | 'in' | 'true' | 'false'
type Filter = { id: string; propertyId: string; op: FilterOp; value: string }
type SavedView = { id: string; name: string; columns: string[]; filters: Filter[]; sortBy: string; sortDir: 'asc' | 'desc' }

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
  const grouped = groupProperties(allProperties.filter(p => p.id !== 'system:name'))

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
          <div className="absolute right-0 top-10 w-[280px] bg-white rounded-xl shadow-lg border border-gray-200 z-50 py-2 max-h-[400px] overflow-y-auto animate-slide-down">
            {grouped.map(group => (
              <div key={group.key}>
                <p className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${group.key === 'custom' ? 'text-violet-400' : 'text-gray-400'}`}>{group.label}</p>
                {group.properties.map(prop => (
                  <label key={prop.id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={visible.includes(prop.id)}
                      onChange={() => setVisible(visible.includes(prop.id) ? visible.filter(c => c !== prop.id) : [...visible, prop.id])}
                      className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" />
                    <span className={`text-[12px] ${prop.type === 'custom' ? 'text-violet-700' : 'text-gray-700'}`}>{prop.name}</span>
                  </label>
                ))}
              </div>
            ))}
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
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedProspect, setSelectedProspect] = useState<MergedProspect | null>(null)

  // Call history — DOIT être après selectedProspect
  const { data: callHistory } = useCallsByProspect(selectedProspect?.id || null, selectedProspect?.phone)
  const [filters, setFilters] = useState<Filter[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showColumnPicker, setShowColumnPicker] = useState(false)

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
      }
    }
  }, [allProperties, visibleColumnIds])

  // Build list name map
  const listNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const l of (lists || [])) m[l.id] = l.name
    return m
  }, [lists])

  // ── Query ALL prospects ──
  const { data: allProspects, isLoading } = useQuery({
    queryKey: ['all-prospects', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('prospects')
        .select('id, list_id, organisation_id, name, phone, phone2, phone3, phone4, phone5, email, company, title, sector, linkedin_url, website_url, status, crm_status, call_count, last_call_at, last_call_outcome, snoozed_until, rdv_date, do_not_call, meeting_booked, address, city, postal_code, country, created_at')
        .eq('organisation_id', orgId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Prospect[]
    },
    enabled: !!orgId,
  })

  // ── Deduplicate by normalized phone ──
  const mergedProspects = useMemo(() => {
    if (!allProspects) return []
    const byPhone = new Map<string, MergedProspect>()

    for (const p of allProspects) {
      const phone = normalizePhone(p.phone)
      if (!phone) continue

      const existing = byPhone.get(phone)
      if (!existing) {
        byPhone.set(phone, { ...p, listNames: [listNameMap[p.list_id] || '?'], listIds: [p.list_id] })
      } else {
        const existingScore = [existing.email, existing.company, existing.title, existing.sector, existing.linkedin_url].filter(Boolean).length
        const newScore = [p.email, p.company, p.title, p.sector, p.linkedin_url].filter(Boolean).length
        if (newScore > existingScore) {
          byPhone.set(phone, { ...p, listNames: [...existing.listNames, listNameMap[p.list_id] || '?'], listIds: [...existing.listIds, p.list_id] })
        } else {
          existing.listNames.push(listNameMap[p.list_id] || '?')
          existing.listIds.push(p.list_id)
        }
      }
    }
    return Array.from(byPhone.values())
  }, [allProspects, listNameMap])

  // Custom field values
  const prospectIds = useMemo(() => mergedProspects.map(p => p.id), [mergedProspects])
  const { data: allCustomValues } = useCustomFieldValues(prospectIds)

  // ── Filter + Sort ──
  const filtered = useMemo(() => {
    let result = mergedProspects

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
  }, [mergedProspects, search, filters, sortBy, sortDir, allProperties, allCustomValues])

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
    const { error } = await supabase.rpc('archive_prospects', { p_ids: ids })
    if (error) { alert(`Erreur archivage : ${error.message}`); return }
    queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
    setSelectedIds(new Set())
  }

  // Views
  const saveCurrentView = (name: string) => {
    const view: SavedView = { id: crypto.randomUUID(), name, columns: visibleColumnIds, filters, sortBy, sortDir }
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
    setActiveViewId(view.id)
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

    const value = getPropertyValue(prospect, allCustomValues?.[prospect.id], col)

    if (col.key === 'crm_status' && value) {
      const label = crmLabels[value] || CRM_STATUS_LABELS[value] || value
      const color = crmColors[value] || '#6b7280'
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ background: color + '18', color }}>{label}</span>
    }

    if (col.key === 'meeting_booked' || col.key === 'do_not_call') {
      return value === 'Oui' ? <span className="text-emerald-500 font-bold text-[11px]">Oui</span> : <span className="text-gray-300 text-[11px]">Non</span>
    }

    if (col.fieldType === 'date' && value && value !== '—') {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        return <span className="text-[12px] text-gray-600">{d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
      }
      return <span className="text-[12px] text-gray-300">—</span>
    }

    return <span className="text-[12px] text-gray-600 truncate block max-w-[160px]">{value}</span>
  }

  return (
    <div className="h-screen bg-[#f5f3ff] p-4 pl-2 overflow-hidden flex flex-col">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 flex-1 flex flex-col overflow-hidden">

        {/* ── Header + Stats ── */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <div>
              <h1 className="text-[18px] font-bold text-gray-800">Contacts</h1>
              <p className="text-[12px] text-gray-400 mt-0.5">{filtered.length} contact{filtered.length > 1 ? 's' : ''} sur {stats.total}</p>
            </div>
            <div className="flex items-center gap-3 md:gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-gray-400">Total</span><span className="font-bold text-gray-700">{stats.total}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /><span className="text-gray-400">Appelés</span><span className="font-bold text-violet-600">{stats.called}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-gray-400">Connectés</span><span className="font-bold text-emerald-600">{stats.connected}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /><span className="text-gray-400">RDV</span><span className="font-bold text-teal-600">{stats.rdv}</span>
              </div>
              {/* Toggle Table / Board */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 ml-2">
                <button onClick={() => setViewMode('table')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${viewMode === 'table' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>
                  <svg className="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                  Table
                </button>
                <button onClick={() => setViewMode('board')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${viewMode === 'board' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>
                  <svg className="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" /></svg>
                  Pipeline
                </button>
              </div>
            </div>
          </div>

          {/* View tabs */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
            <button onClick={() => { setActiveViewId(null); setFilters([]) }}
              className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                !activeViewId ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>Tous</button>
            {savedViews.map(v => (
              <button key={v.id} onClick={() => loadView(v)}
                className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap group flex items-center gap-1 ${
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
                  placeholder="Nom de la vue..." className="text-[12px] px-2 py-1 border border-indigo-200 rounded-lg outline-none w-32" />
                <button onClick={() => { if (newViewName.trim()) saveCurrentView(newViewName.trim()) }}
                  className="text-[11px] text-indigo-500 font-medium">Sauver</button>
              </div>
            ) : (
              <button onClick={() => setSavingView(true)} className="text-[11px] text-gray-400 hover:text-indigo-500">+ Vue</button>
            )}
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

          {/* Advanced filters */}
          <FilterBuilder filters={filters} setFilters={setFilters} allProperties={allProperties} crmStatuses={crmStatuses || []} />

          {/* Column picker */}
          <CrmColumnPicker visible={visibleColumnIds} setVisible={setVisibleColumnIds} allProperties={allProperties} open={showColumnPicker} onToggle={() => setShowColumnPicker(!showColumnPicker)} />

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
              <span className="text-[11px] text-indigo-600 font-medium">{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
              <select onChange={e => { if (e.target.value) bulkUpdateStatus(e.target.value); e.target.value = '' }}
                className="text-[11px] border border-gray-200 rounded px-1.5 py-1 outline-none">
                <option value="">Changer statut...</option>
                {(crmStatuses || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {perms.canDeleteContacts && (
                <button onClick={bulkDelete} className="text-[11px] text-red-500 hover:text-red-700 font-medium">Supprimer</button>
              )}
              {perms.canExportData && (
                <button className="text-[11px] text-gray-500 hover:text-gray-700">Exporter</button>
              )}
            </div>
          )}
        </div>

        {/* ── Board (Pipeline Kanban) ── */}
        {viewMode === 'board' && !isLoading && (
          <div ref={boardRef}
            onDragOver={handleBoardDragOver}
            onDragLeave={stopAutoScroll}
            onDrop={stopAutoScroll}
            className="flex-1 min-h-0 overflow-x-auto p-4">
            <div className="flex gap-3 h-full">
              {(crmStatuses || []).map(stage => {
                const stageProspects = filtered.filter(p => (p.crm_status || 'new') === stage.key)
                return (
                  <div key={stage.key} className="w-[260px] min-w-[260px] flex flex-col bg-gray-50/80 rounded-xl border border-gray-100">
                    {/* Column header */}
                    <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: stage.color }} />
                      <span className="text-[12px] font-semibold text-gray-700 flex-1 truncate">{stage.label}</span>
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-200/60 px-1.5 py-0.5 rounded-full">{stageProspects.length}</span>
                    </div>
                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5"
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('bg-violet-50/50') }}
                      onDragLeave={e => { e.currentTarget.classList.remove('bg-violet-50/50') }}
                      onDrop={async e => {
                        e.currentTarget.classList.remove('bg-violet-50/50')
                        const prospectId = e.dataTransfer.getData('prospectId')
                        if (prospectId) {
                          await supabase.from('prospects').update({ crm_status: stage.key }).eq('id', prospectId)
                          queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
                        }
                      }}>
                      {stageProspects.map(p => (
                        <div key={p.id} draggable
                          onDragStart={e => e.dataTransfer.setData('prospectId', p.id)}
                          onClick={() => setSelectedProspect(p)}
                          className="bg-white rounded-lg border border-gray-200 p-2.5 cursor-pointer hover:shadow-md hover:border-violet-200 transition-all active:scale-[0.98]">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                              {(p.name || '?')[0].toUpperCase()}
                            </div>
                            <p className="text-[12px] font-medium text-gray-800 truncate flex-1">{p.name}</p>
                          </div>
                          {p.company && <p className="text-[10px] text-gray-400 truncate mb-1">{p.company}</p>}
                          <div className="flex items-center gap-2 text-[10px] text-gray-400">
                            {p.phone && <span className="font-mono">{p.phone.slice(-4)}</span>}
                            {p.call_count > 0 && <span>{p.call_count} appel{p.call_count > 1 ? 's' : ''}</span>}
                            {p.rdv_date && <span className="text-teal-500">RDV</span>}
                          </div>
                        </div>
                      ))}
                      {stageProspects.length === 0 && (
                        <p className="text-[11px] text-gray-300 text-center py-4 italic">Aucun contact</p>
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
            <table className="border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
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
                  {/* Lists */}
                  <th className="py-2.5 px-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider border-r border-gray-100" style={{ width: 140 }}>Listes</th>
                  {/* Dynamic columns */}
                  {activeColumns.map(col => (
                    <th key={col.id} onClick={() => toggleSort(col.id)}
                      className="py-2.5 px-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider border-r border-gray-100 cursor-pointer hover:text-gray-600 whitespace-nowrap"
                      style={{ minWidth: col.key === 'email' ? 170 : 110 }}>
                      <div className="flex items-center gap-1">{col.name} {sortBy === col.id && (sortDir === 'asc' ? '↑' : '↓')}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className={`border-b border-gray-50 hover:bg-violet-50/30 transition-colors ${selectedIds.has(p.id) ? 'bg-indigo-50/40' : ''}`}>
                    <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" />
                    </td>
                    <td className="py-2 px-4 sticky left-0 z-10 bg-white hover:bg-violet-50/30 border-r border-gray-100 cursor-pointer"
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
                    <td className="py-2 px-3 border-r border-gray-100" onClick={() => setSelectedProspect(p)}>
                      <div className="flex flex-wrap gap-0.5">
                        {p.listNames.slice(0, 2).map((name, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 whitespace-nowrap truncate max-w-[60px]">{name}</span>
                        ))}
                        {p.listNames.length > 2 && <span className="text-[9px] text-gray-400">+{p.listNames.length - 2}</span>}
                      </div>
                    </td>
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
