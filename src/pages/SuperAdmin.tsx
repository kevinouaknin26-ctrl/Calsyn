/**
 * Super Admin — vue hiérarchique des organisations clients.
 * Couche 2 : shell basique + liste des orgs. Arbre détaillé en Couche 3.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/config/supabase'

export default function SuperAdmin() {
  const { isSuperAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: orgs, isLoading } = useQuery({
    queryKey: ['super-admin-orgs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organisations')
        .select('id, name, slug, plan, is_active, from_number, max_parallel_seats, max_power_seats, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: isSuperAdmin,
  })

  const { data: memberCounts } = useQuery({
    queryKey: ['super-admin-member-counts', orgs?.length],
    queryFn: async () => {
      if (!orgs?.length) return {} as Record<string, { total: number; admin: number; manager: number; sdr: number }>
      const { data } = await supabase.from('profiles').select('organisation_id, role')
      const map: Record<string, { total: number; admin: number; manager: number; sdr: number }> = {}
      for (const org of orgs) map[org.id] = { total: 0, admin: 0, manager: 0, sdr: 0 }
      for (const p of (data || [])) {
        if (p.organisation_id && map[p.organisation_id]) {
          map[p.organisation_id].total++
          if (p.role === 'admin') map[p.organisation_id].admin++
          else if (p.role === 'manager') map[p.organisation_id].manager++
          else if (p.role === 'sdr') map[p.organisation_id].sdr++
        }
      }
      return map
    },
    enabled: !!orgs?.length,
  })

  if (!isSuperAdmin) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Accès réservé au Super Admin.</div>
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#e8e0f0] p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Super Admin — Clients Callio</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">{orgs?.length || 0} organisation{(orgs?.length || 0) > 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
          + Nouvelle organisation
        </button>
      </div>

      {isLoading ? <p className="text-sm text-gray-400">Chargement...</p> : !orgs?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          Aucune organisation cliente pour le moment.
        </div>
      ) : (
        <div className="space-y-3">
          {orgs.map(org => {
            const c = memberCounts?.[org.id] || { total: 0, admin: 0, manager: 0, sdr: 0 }
            return (
              <div key={org.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-800">{org.name}</h2>
                    <p className="text-[11px] text-gray-400 mt-0.5">Plan {org.plan} · {org.from_number || 'Aucun numéro par défaut'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${org.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                      {org.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-3 pt-3 border-t border-gray-100">
                  <Stat label="Membres" value={c.total} />
                  <Stat label="Admins" value={c.admin} color="#0ea5e9" />
                  <Stat label="Managers" value={c.manager} color="#8b5cf6" />
                  <Stat label="SDRs" value={c.sdr} color="#059669" />
                  <Stat label="Seats parallel/power" value={`${org.max_parallel_seats || 0}/${org.max_power_seats || 0}`} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)} onCreated={() => {
        queryClient.invalidateQueries({ queryKey: ['super-admin-orgs'] })
        setShowCreate(false)
      }} />}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-extrabold" style={{ color: color || '#0f172a' }}>{value}</p>
    </div>
  )
}

function CreateOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [plan, setPlan] = useState<'starter' | 'growth' | 'scale'>('growth')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) { setErr('Nom requis'); return }
    setSaving(true)
    try {
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const { error } = await supabase.from('organisations').insert({ name: name.trim(), slug, plan, is_active: true })
      if (error) throw new Error(error.message)
      onCreated()
    } catch (e) {
      setErr((e as Error).message)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Nouvelle organisation cliente</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Nom</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Cabinet Dupont & Associés" autoFocus
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Plan</label>
            <select value={plan} onChange={e => setPlan(e.target.value as 'starter' | 'growth' | 'scale')}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
              <option value="starter">Starter (49€/user/mois)</option>
              <option value="growth">Growth (99€/user/mois)</option>
              <option value="scale">Scale (199€/user/mois)</option>
            </select>
          </div>
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{err}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Annuler</button>
          <button onClick={submit} disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
            {saving ? 'Création...' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}
