/**
 * Equipe — Gestion membres, style Minari, francais.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/config/supabase'
import type { Profile, Role } from '@/types/user'

const ROLE_LABELS: Record<Role, string> = { super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager', sdr: 'SDR' }
const ROLE_COLORS: Record<Role, string> = { super_admin: '#ef4444', admin: '#0ea5e9', manager: '#8b5cf6', sdr: '#059669' }

export default function Team() {
  const { organisation } = useAuth()
  const [inviteEmail, setInviteEmail] = useState('')

  const { data: members, isLoading } = useQuery({
    queryKey: ['team-members', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data, error } = await supabase.from('profiles')
        .select('id, email, full_name, role, is_active, created_at')
        .eq('organisation_id', organisation.id).order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as Profile[]
    },
    enabled: !!organisation?.id,
  })

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Equipe</h1>
        <span className="text-sm text-gray-400">{members?.length || 0} membres</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex gap-3">
        <input type="email" placeholder="Email du nouveau membre..."
          value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-lg bg-gray-50 text-sm text-gray-700 outline-none border border-gray-200" />
        <button className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Inviter</button>
      </div>

      {isLoading ? <p className="text-sm text-gray-400">Chargement...</p> : (
        <div className="space-y-2">
          {members?.map(m => {
            const color = ROLE_COLORS[m.role]
            return (
              <div key={m.id} className="flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-200 bg-white">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold"
                  style={{ background: color + '18', color }}>{(m.full_name || m.email).charAt(0).toUpperCase()}</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{m.full_name || m.email}</p>
                  <p className="text-[11px] text-gray-400">{m.email}</p>
                </div>
                <div className="px-2.5 py-1 rounded-lg text-[10px] font-bold" style={{ background: color + '18', color }}>{ROLE_LABELS[m.role]}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
