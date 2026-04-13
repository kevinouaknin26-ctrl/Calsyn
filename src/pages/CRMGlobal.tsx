/**
 * CRM Global — Vue unifiée de tous les contacts de l'organisation.
 * Déduplique par téléphone, affiche les listes d'appartenance en badges.
 * Réutilise le modèle PropertyDefinition pour les colonnes.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePropertyDefinitions, useCustomFieldValues, useCrmStatuses, updatePropertyValue } from '@/hooks/useProperties'
import { SYSTEM_PROPERTIES, DEFAULT_VISIBLE_COLUMNS, getPropertyValue, matchesSearch, CRM_STATUS_LABELS, type PropertyDefinition } from '@/config/properties'
import { useProspectLists } from '@/hooks/useProspects'
import SocialLinks from '@/components/call/SocialLinks'
import ProspectModal from '@/components/call/ProspectModal'
import type { Prospect } from '@/types/prospect'

// ── Merged prospect = prospect + list names ─────────────────────
interface MergedProspect extends Prospect {
  listNames: string[]
  listIds: string[]
}

export default function CRMGlobal() {
  const { organisation } = useAuth()
  const orgId = organisation?.id
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedProspect, setSelectedProspect] = useState<MergedProspect | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [listFilter, setListFilter] = useState<string>('all')

  // Properties
  const { properties: allProperties } = usePropertyDefinitions()
  const { data: crmStatuses } = useCrmStatuses()
  const { data: lists } = useProspectLists()

  // CRM labels from DB statuses
  const crmLabels = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of (crmStatuses || [])) m[s.key] = s.label
    return m
  }, [crmStatuses])

  // CRM colors from DB
  const crmColors = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of (crmStatuses || [])) m[s.key] = s.color
    return m
  }, [crmStatuses])

  // Visible columns — simplified: always show a fixed set
  const visibleColumnIds = DEFAULT_VISIBLE_COLUMNS
  const activeColumns = useMemo(
    () => visibleColumnIds.map(id => allProperties.find(p => p.id === id)).filter(Boolean) as PropertyDefinition[],
    [allProperties, visibleColumnIds],
  )

  // ── Query ALL prospects for this org ──
  const { data: allProspects, isLoading } = useQuery({
    queryKey: ['all-prospects', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('prospects')
        .select('id, list_id, organisation_id, name, phone, phone2, phone3, phone4, phone5, email, company, title, sector, linkedin_url, website_url, status, crm_status, call_count, last_call_at, last_call_outcome, snoozed_until, rdv_date, do_not_call, meeting_booked, address, city, postal_code, country, created_at')
        .eq('organisation_id', orgId)
        .order('name')
      if (error) throw error
      return data as Prospect[]
    },
    enabled: !!orgId,
  })

  // Build list name map
  const listNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const l of (lists || [])) m[l.id] = l.name
    return m
  }, [lists])

  // ── Deduplicate by phone, merge list info ──
  const mergedProspects = useMemo(() => {
    if (!allProspects) return []
    const byPhone = new Map<string, MergedProspect>()

    for (const p of allProspects) {
      const phone = p.phone?.trim()
      if (!phone) continue

      const existing = byPhone.get(phone)
      if (!existing) {
        byPhone.set(phone, {
          ...p,
          listNames: [listNameMap[p.list_id] || 'Liste inconnue'],
          listIds: [p.list_id],
        })
      } else {
        // Merge: keep the one with more data (more fields filled)
        const existingScore = [existing.email, existing.company, existing.title, existing.sector, existing.linkedin_url].filter(Boolean).length
        const newScore = [p.email, p.company, p.title, p.sector, p.linkedin_url].filter(Boolean).length

        if (newScore > existingScore) {
          // Replace with richer record but keep merged list info
          const merged: MergedProspect = {
            ...p,
            listNames: [...existing.listNames, listNameMap[p.list_id] || 'Liste inconnue'],
            listIds: [...existing.listIds, p.list_id],
          }
          byPhone.set(phone, merged)
        } else {
          existing.listNames.push(listNameMap[p.list_id] || 'Liste inconnue')
          existing.listIds.push(p.list_id)
        }
      }
    }

    return Array.from(byPhone.values())
  }, [allProspects, listNameMap])

  // Custom field values
  const prospectIds = useMemo(() => mergedProspects.map(p => p.id), [mergedProspects])
  const { data: allCustomValues } = useCustomFieldValues(prospectIds)

  // ── Filter + sort ──
  const filtered = useMemo(() => {
    let result = mergedProspects

    // Text search
    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(p =>
        p.name?.toLowerCase().includes(lower) ||
        p.phone?.toLowerCase().includes(lower) ||
        p.email?.toLowerCase().includes(lower) ||
        p.company?.toLowerCase().includes(lower) ||
        p.title?.toLowerCase().includes(lower) ||
        p.listNames.some(n => n.toLowerCase().includes(lower)),
      )
    }

    // CRM status filter
    if (statusFilter !== 'all') {
      result = result.filter(p => p.crm_status === statusFilter)
    }

    // List filter
    if (listFilter !== 'all') {
      result = result.filter(p => p.listIds.includes(listFilter))
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') cmp = (a.name || '').localeCompare(b.name || '')
      else if (sortBy === 'company') cmp = (a.company || '').localeCompare(b.company || '')
      else if (sortBy === 'crm_status') cmp = (a.crm_status || '').localeCompare(b.crm_status || '')
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
  }, [mergedProspects, search, statusFilter, listFilter, sortBy, sortDir, allProperties, allCustomValues])

  // ── Unique CRM statuses from data ──
  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>()
    for (const p of mergedProspects) {
      if (p.crm_status) set.add(p.crm_status)
    }
    return Array.from(set).sort()
  }, [mergedProspects])

  // Sort toggle
  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const SortIcon = ({ col }: { col: string }) => (
    <button onClick={() => toggleSort(col)}
      className={`flex-shrink-0 transition-opacity ${sortBy === col ? 'opacity-100 text-indigo-500' : 'opacity-0 group-hover/th:opacity-60 text-gray-400'}`}>
      {sortBy === col && sortDir === 'desc'
        ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>}
    </button>
  )

  // Render cell value
  const renderCell = (prospect: MergedProspect, col: PropertyDefinition) => {
    if (col.key === 'socials') {
      return <SocialLinks prospectId={prospect.id} compact />
    }

    const value = getPropertyValue(prospect, allCustomValues?.[prospect.id], col)

    if (col.key === 'crm_status' && value) {
      const label = crmLabels[value] || CRM_STATUS_LABELS[value] || value
      const color = crmColors[value] || '#6b7280'
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
          style={{ background: color + '18', color }}>
          {label}
        </span>
      )
    }

    if (col.key === 'meeting_booked' || col.key === 'do_not_call') {
      return value === 'Oui'
        ? <span className="text-emerald-500 font-bold text-[11px]">Oui</span>
        : <span className="text-gray-300 text-[11px]">Non</span>
    }

    return <span className="text-[12px] text-gray-600 truncate">{value}</span>
  }

  return (
    <div className="h-screen bg-[#f5f3ff] dark:bg-[#e8e0f0] p-4 pl-2 overflow-hidden">
      <div className="bg-white dark:bg-[#f0eaf5] rounded-2xl shadow-sm border border-gray-200/50 dark:border-[#d4cade]/50 h-full flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-bold text-gray-800">Tous les contacts</h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {filtered.length} contact{filtered.length > 1 ? 's' : ''}
              {mergedProspects.length !== (allProspects?.length || 0) && (
                <span className="ml-1 text-violet-400">
                  ({allProspects?.length} enregistrements, {mergedProspects.length} uniques)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="px-5 py-2.5 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white flex-1 max-w-md">
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Rechercher un contact (nom, tel, email, societe, liste...)"
              value={search} onChange={e => setSearch(e.target.value)}
              className="text-[13px] bg-transparent outline-none text-gray-700 placeholder:text-gray-400 w-full" />
            {search && (
              <button onClick={() => setSearch('')} className="text-gray-300 hover:text-gray-500">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* CRM Status filter */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-[12px] px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 outline-none cursor-pointer">
            <option value="all">Tous les statuts</option>
            {uniqueStatuses.map(s => (
              <option key={s} value={s}>{crmLabels[s] || CRM_STATUS_LABELS[s] || s}</option>
            ))}
          </select>

          {/* List filter */}
          <select value={listFilter} onChange={e => setListFilter(e.target.value)}
            className="text-[12px] px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 outline-none cursor-pointer">
            <option value="all">Toutes les listes</option>
            {(lists || []).map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          {/* Sort */}
          <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            <span>Tri :</span>
            <button onClick={() => toggleSort('name')}
              className={`px-1.5 py-0.5 rounded ${sortBy === 'name' ? 'text-indigo-600 font-medium' : 'hover:text-gray-700'}`}>
              Nom
            </button>
            <button onClick={() => toggleSort('company')}
              className={`px-1.5 py-0.5 rounded ${sortBy === 'company' ? 'text-indigo-600 font-medium' : 'hover:text-gray-700'}`}>
              Societe
            </button>
            <button onClick={() => toggleSort('last_call_at')}
              className={`px-1.5 py-0.5 rounded ${sortBy === 'last_call_at' ? 'text-indigo-600 font-medium' : 'hover:text-gray-700'}`}>
              Dernier appel
            </button>
          </div>
        </div>

        {/* ── Loading ── */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400">Chargement des contacts...</p>
          </div>
        )}

        {/* ── Empty ── */}
        {!isLoading && filtered.length === 0 && (
          <div className="flex-1 flex items-center justify-center flex-col gap-2">
            <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm font-medium text-gray-500">Aucun contact trouve</p>
            <p className="text-xs text-gray-400">
              {search ? 'Essayez une autre recherche' : 'Importez des prospects depuis le Dialer'}
            </p>
          </div>
        )}

        {/* ── Table ── */}
        {!isLoading && filtered.length > 0 && (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="min-w-full border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="border-b border-gray-100 bg-gray-50/90">
                  {/* Name (sticky) */}
                  <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] border-r border-gray-100 sticky left-0 z-30 bg-violet-100/70 group/th"
                    style={{ width: 220, minWidth: 220, boxShadow: '4px 0 8px -4px rgba(0,0,0,0.08)' }}>
                    <div className="flex items-center gap-1">
                      <span className="flex-1">Nom</span>
                      <SortIcon col="name" />
                    </div>
                  </th>
                  {/* Lists */}
                  <th className="py-3 px-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] border-r border-gray-100"
                    style={{ width: 160, minWidth: 160 }}>
                    Listes
                  </th>
                  {/* Dynamic columns */}
                  {activeColumns.map(col => (
                    <th key={col.id}
                      className="py-3 px-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] border-r border-gray-100 group/th whitespace-nowrap"
                      style={{ minWidth: col.key === 'email' ? 180 : col.key === 'phone' ? 140 : 120 }}>
                      <div className="flex items-center gap-1">
                        <span className="flex-1">{col.name}</span>
                        <SortIcon col={col.id} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}
                    onClick={() => setSelectedProspect(p)}
                    className="border-b border-gray-50 hover:bg-violet-50/30 cursor-pointer transition-colors">
                    {/* Name (sticky) */}
                    <td className="py-2.5 px-4 sticky left-0 z-10 bg-white hover:bg-violet-50/30 border-r border-gray-100"
                      style={{ width: 220, minWidth: 220, boxShadow: '4px 0 8px -4px rgba(0,0,0,0.04)' }}>
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
                    {/* List badges */}
                    <td className="py-2.5 px-3 border-r border-gray-100">
                      <div className="flex flex-wrap gap-1">
                        {p.listNames.map((name, i) => (
                          <span key={i}
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 whitespace-nowrap">
                            {name}
                          </span>
                        ))}
                      </div>
                    </td>
                    {/* Dynamic columns */}
                    {activeColumns.map(col => (
                      <td key={col.id} className="py-2.5 px-3 border-r border-gray-100">
                        {renderCell(p, col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── ProspectModal ── */}
      {selectedProspect && (
        <ProspectModal
          prospect={selectedProspect}
          callContext={{
            prospect: null,
            callSid: null,
            conferenceSid: null,
            startedAt: null,
            duration: null,
            disposition: null,
            notes: '',
            meetingBooked: false,
            wasAnswered: false,
            error: null,
          }}
          callHistory={[]}
          isInCall={false}
          isDisconnected={true}
          onCall={() => {}}
          onClose={() => setSelectedProspect(null)}
          onSetDisposition={() => {}}
          onSetNotes={() => {}}
          onSetMeeting={() => {}}
          onReset={() => {}}
          onNextCall={() => {}}
          providerReady={false}
        />
      )}
    </div>
  )
}
