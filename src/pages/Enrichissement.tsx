/**
 * Enrichissement — Page pour identifier et enrichir les contacts incomplets.
 *
 * Liste les prospects avec champs manquants (email/phone/company/linkedin)
 * regroupés par "ce qui manque". Permet :
 *  - Recherche manuelle web (Google/LinkedIn) en 1 clic via boutons
 *  - Édition inline des champs trouvés
 *  - Stats globales sur la complétude de la base
 *
 * Pas d'API d'enrichissement automatique pour l'instant (Hunter/Apollo/Clearbit
 * peut être plug ici plus tard via une edge function `enrich`).
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'

interface ProspectLite {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  company: string | null
  title: string | null
  linkedin_url: string | null
  website_url: string | null
}

type MissingFilter = 'all' | 'no_email' | 'no_phone' | 'no_company' | 'no_linkedin'

export default function Enrichissement() {
  const { organisation } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<MissingFilter>('no_email')
  const [search, setSearch] = useState('')

  const { data: prospects = [], isLoading } = useQuery({
    queryKey: ['enrich-prospects', organisation?.id],
    queryFn: async (): Promise<ProspectLite[]> => {
      if (!organisation?.id) return []
      const { data } = await supabase
        .from('prospects')
        .select('id, name, email, phone, company, title, linkedin_url, website_url')
        .eq('organisation_id', organisation.id)
        .is('deleted_at', null)
        .limit(2000)
      return (data || []) as ProspectLite[]
    },
    enabled: !!organisation?.id,
  })

  // Stats complétude
  const stats = useMemo(() => {
    const total = prospects.length
    return {
      total,
      noEmail: prospects.filter(p => !p.email).length,
      noPhone: prospects.filter(p => !p.phone).length,
      noCompany: prospects.filter(p => !p.company).length,
      noLinkedin: prospects.filter(p => !p.linkedin_url).length,
      complete: prospects.filter(p => p.email && p.phone && p.company && p.linkedin_url).length,
    }
  }, [prospects])

  const filtered = useMemo(() => {
    let list = prospects
    if (filter === 'no_email') list = list.filter(p => !p.email)
    if (filter === 'no_phone') list = list.filter(p => !p.phone)
    if (filter === 'no_company') list = list.filter(p => !p.company)
    if (filter === 'no_linkedin') list = list.filter(p => !p.linkedin_url)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.company || '').toLowerCase().includes(q)
      )
    }
    return list.slice(0, 200)  // cap UI
  }, [prospects, filter, search])

  const completePct = stats.total > 0 ? Math.round((stats.complete / stats.total) * 100) : 0

  return (
    <div className="h-full bg-[#f8f9fa] dark:bg-[#e8e0f0] overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 pb-12">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Enrichissement</h1>
            <p className="text-[12px] text-gray-500 mt-0.5">Complète les infos manquantes de tes contacts</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold text-emerald-600 tabular-nums">{completePct}%</div>
            <div className="text-[10px] text-gray-400">contacts complets</div>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <StatChip label="Total" value={stats.total} color="#6366f1" filter="all" current={filter} onClick={setFilter} />
          <StatChip label="Sans email" value={stats.noEmail} color="#0ea5e9" filter="no_email" current={filter} onClick={setFilter} />
          <StatChip label="Sans téléphone" value={stats.noPhone} color="#f59e0b" filter="no_phone" current={filter} onClick={setFilter} />
          <StatChip label="Sans entreprise" value={stats.noCompany} color="#ec4899" filter="no_company" current={filter} onClick={setFilter} />
          <StatChip label="Sans LinkedIn" value={stats.noLinkedin} color="#0a66c2" filter="no_linkedin" current={filter} onClick={setFilter} />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un contact..."
            className="flex-1 max-w-md px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[12px] outline-none focus:border-indigo-300"
          />
          <span className="text-[11px] text-gray-500 tabular-nums">
            {filtered.length === 200 ? '200+' : filtered.length} résultat{filtered.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Liste */}
        <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] overflow-hidden">
          {isLoading ? (
            <div className="text-center py-12 text-[12px] text-gray-400">Chargement...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-3xl mb-2">✨</p>
              <p className="text-[13px] font-semibold text-gray-700">Tout est complet</p>
              <p className="text-[11px] text-gray-400 mt-1">Aucun contact à enrichir avec ce filtre</p>
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-bold">Contact</th>
                  <th className="text-left px-2 py-2 font-bold">Email</th>
                  <th className="text-left px-2 py-2 font-bold">Téléphone</th>
                  <th className="text-left px-2 py-2 font-bold">Entreprise</th>
                  <th className="text-left px-2 py-2 font-bold">LinkedIn</th>
                  <th className="text-left px-4 py-2 font-bold">Recherche</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <ProspectRow
                    key={p.id}
                    prospect={p}
                    onSaved={() => queryClient.invalidateQueries({ queryKey: ['enrich-prospects'] })}
                    onOpen={() => navigate(`/app/contacts?prospect=${p.id}`)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-[10px] text-gray-400 text-center mt-4">
          Les boutons 🔍 ouvrent une recherche Google/LinkedIn dans un nouvel onglet.
          Édite directement les champs ci-dessus pour sauvegarder.
        </p>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────

function StatChip({ label, value, color, filter, current, onClick }: {
  label: string; value: number; color: string; filter: MissingFilter; current: MissingFilter; onClick: (f: MissingFilter) => void
}) {
  const active = current === filter
  return (
    <button onClick={() => onClick(filter)}
      className={`bg-white dark:bg-[#f0eaf5] rounded-xl border p-3 text-left transition-all ${active ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-200 dark:border-[#d4cade] hover:border-gray-300'}`}>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-extrabold tabular-nums" style={{ color }}>{value}</p>
    </button>
  )
}

function ProspectRow({ prospect, onSaved, onOpen }: {
  prospect: ProspectLite; onSaved: () => void; onOpen: () => void
}) {
  const [draft, setDraft] = useState<Partial<ProspectLite>>({})
  const [saving, setSaving] = useState(false)

  const merged = { ...prospect, ...draft }

  async function saveField(field: keyof ProspectLite, value: string | null) {
    if (saving) return
    setSaving(true)
    try {
      await supabase.from('prospects').update({ [field]: value || null }).eq('id', prospect.id)
      setDraft(d => ({ ...d, [field]: value }))
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  function searchUrl(kind: 'google' | 'linkedin') {
    const name = prospect.name || ''
    const company = prospect.company || ''
    const q = encodeURIComponent([name, company].filter(Boolean).join(' '))
    return kind === 'linkedin'
      ? `https://www.google.com/search?q=${q}+site%3Alinkedin.com%2Fin`
      : `https://www.google.com/search?q=${q}+email+telephone`
  }

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50">
      <td className="px-4 py-2.5">
        <button onClick={onOpen} className="text-left hover:text-indigo-600 transition-colors">
          <div className="font-semibold text-gray-800 truncate max-w-[180px]">{prospect.name || '(sans nom)'}</div>
          {prospect.title && <div className="text-[10px] text-gray-400 truncate max-w-[180px]">{prospect.title}</div>}
        </button>
      </td>
      <EditCell value={merged.email} onSave={v => saveField('email', v)} placeholder="email@..." type="email" />
      <EditCell value={merged.phone} onSave={v => saveField('phone', v)} placeholder="+33..." type="tel" />
      <EditCell value={merged.company} onSave={v => saveField('company', v)} placeholder="Entreprise" />
      <EditCell value={merged.linkedin_url} onSave={v => saveField('linkedin_url', v)} placeholder="https://linkedin.com/in/..." />
      <td className="px-4 py-2.5 whitespace-nowrap">
        <a href={searchUrl('google')} target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-gray-500 hover:text-indigo-600 mr-2"
          title="Recherche Google">🔍 Google</a>
        <a href={searchUrl('linkedin')} target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-gray-500 hover:text-blue-700"
          title="Recherche LinkedIn">in LinkedIn</a>
      </td>
    </tr>
  )
}

function EditCell({ value, onSave, placeholder, type = 'text' }: {
  value: string | null; onSave: (v: string | null) => void; placeholder: string; type?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  if (editing) {
    return (
      <td className="px-2 py-1.5">
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { setEditing(false); if (draft !== (value || '')) onSave(draft.trim() || null) }}
          onKeyDown={e => {
            if (e.key === 'Enter') { setEditing(false); if (draft !== (value || '')) onSave(draft.trim() || null) }
            if (e.key === 'Escape') { setEditing(false); setDraft(value || '') }
          }}
          placeholder={placeholder}
          className="w-full px-2 py-1 rounded border border-indigo-300 text-[11px] outline-none"
        />
      </td>
    )
  }

  return (
    <td className="px-2 py-2.5">
      <button onClick={() => { setDraft(value || ''); setEditing(true) }}
        className={`w-full text-left text-[11px] truncate max-w-[160px] hover:text-indigo-600 transition-colors ${value ? 'text-gray-700' : 'text-gray-300 italic'}`}
        title={value || `Cliquer pour ajouter ${placeholder}`}>
        {value || `+ ${placeholder}`}
      </button>
    </td>
  )
}
