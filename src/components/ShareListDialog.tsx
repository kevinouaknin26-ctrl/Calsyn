import { useEffect, useState } from 'react'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useQueryClient } from '@tanstack/react-query'
import { ROLE_LABELS } from '@/types/user'

type TeamMember = {
  id: string
  full_name: string | null
  email: string
  role: 'super_admin' | 'admin' | 'manager' | 'sdr'
}

type Props = {
  listId: string
  listName: string
  currentAssignedTo: string[]
  onClose: () => void
}

export default function ShareListDialog({ listId, listName, currentAssignedTo, onClose }: Props) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(currentAssignedTo))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      if (!profile?.organisation_id) return
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('organisation_id', profile.organisation_id)
        .is('deactivated_at', null)
        .order('role', { ascending: true })
        .order('full_name', { ascending: true })
      if (!alive) return
      if (!error && data) setMembers(data as TeamMember[])
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [profile?.organisation_id])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const save = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('prospect_lists')
      .update({ assigned_to: Array.from(selected) })
      .eq('id', listId)
    setSaving(false)
    if (error) {
      alert('Erreur : ' + error.message)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['prospect-lists'] })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-[16px] font-bold text-gray-800">Partager la liste</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fermer">&times;</button>
        </div>
        <p className="text-[13px] text-gray-500 mb-4 truncate">{listName}</p>

        {loading ? (
          <p className="text-[13px] text-gray-400 py-6 text-center">Chargement...</p>
        ) : members.length === 0 ? (
          <p className="text-[13px] text-gray-400 py-6 text-center">Aucun membre actif dans l'organisation.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
            {members.map(m => {
              const checked = selected.has(m.id)
              return (
                <label key={m.id} className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => toggle(m.id)}
                    className="w-4 h-4 rounded accent-indigo-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-800 truncate">{m.full_name || m.email}</div>
                    <div className="text-[11px] text-gray-400 truncate">{m.email}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {ROLE_LABELS[m.role]}
                  </span>
                </label>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-gray-600 hover:bg-gray-100">
            Annuler
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
