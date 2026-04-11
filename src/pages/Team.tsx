/**
 * Team — Gestion des membres de l'equipe.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/config/supabase'
import type { Profile, Role } from '@/types/user'

const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  sdr: 'SDR',
}

const ROLE_COLORS: Record<Role, string> = {
  super_admin: '#ff453a',
  admin: '#0071e3',
  manager: '#bf5af2',
  sdr: '#30d158',
}

export default function Team() {
  const { isDark } = useTheme()
  const { organisation } = useAuth()
  const [inviteEmail, setInviteEmail] = useState('')

  const { data: members, isLoading } = useQuery({
    queryKey: ['team-members', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, is_active, created_at')
        .eq('organisation_id', organisation.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Profile[]
    },
    enabled: !!organisation?.id,
  })

  const bg = isDark ? 'bg-black' : 'bg-[#f5f5f7]'
  const card = isDark ? 'bg-[#1c1c1e] border-white/[0.08]' : 'bg-white border-black/[0.06]'
  const text = isDark ? 'text-white' : 'text-gray-900'

  return (
    <div className={`min-h-screen ${bg} p-6 transition-colors`}>
      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-2xl font-extrabold tracking-tight ${text}`}>Equipe</h1>
        <span className="text-sm text-[#86868b]">{members?.length || 0} membres</span>
      </div>

      {/* Invite */}
      <div className={`rounded-2xl border p-4 mb-6 flex gap-3 ${card}`}>
        <input
          type="email"
          placeholder="Email du nouveau membre..."
          value={inviteEmail}
          onChange={e => setInviteEmail(e.target.value)}
          className={`flex-1 px-4 py-2.5 rounded-xl text-sm outline-none ${isDark ? 'bg-[#2c2c2e] text-white' : 'bg-gray-50 text-gray-900'}`}
        />
        <button
          className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0071e3] text-white hover:bg-[#0077ed] transition-colors"
        >
          Inviter
        </button>
      </div>

      {/* Members */}
      {isLoading ? (
        <p className="text-sm text-[#86868b]">Chargement...</p>
      ) : (
        <div className="space-y-2">
          {members?.map(m => {
            const color = ROLE_COLORS[m.role]
            return (
              <div key={m.id} className={`flex items-center gap-4 px-4 py-3 rounded-xl border ${card}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold"
                  style={{ background: color + '22', color }}>
                  {(m.full_name || m.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${text}`}>{m.full_name || m.email}</p>
                  <p className="text-[11px] text-[#86868b]">{m.email}</p>
                </div>
                <div className="px-2.5 py-1 rounded-lg text-[10px] font-bold" style={{ background: color + '22', color }}>
                  {ROLE_LABELS[m.role]}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
