/**
 * Equipe — Gestion membres : liste, inviter, changer role.
 */

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/config/supabase'
import type { Profile, Role } from '@/types/user'

const ROLE_LABELS: Record<Role, string> = { super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager', sdr: 'SDR' }
const ROLE_COLORS: Record<Role, string> = { super_admin: '#ef4444', admin: '#0ea5e9', manager: '#8b5cf6', sdr: '#059669' }

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

type InviteRole = 'admin' | 'manager' | 'sdr'

export default function Team() {
  const { organisation, profile: me } = useAuth()
  const queryClient = useQueryClient()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('sdr')
  const [inviting, setInviting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

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

  const canInvite = me?.role === 'super_admin' || me?.role === 'admin' || me?.role === 'manager'

  const handleInvite = async () => {
    setFeedback(null)
    const email = inviteEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFeedback({ type: 'err', msg: 'Email invalide' })
      return
    }
    setInviting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setFeedback({ type: 'err', msg: 'Session expirée' }); return }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email, role: inviteRole }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setFeedback({ type: 'err', msg: body?.error || `Erreur ${res.status}` })
        return
      }
      setFeedback({ type: 'ok', msg: `Invitation envoyée à ${email} (${ROLE_LABELS[inviteRole]})` })
      setInviteEmail('')
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
    } catch (e) {
      setFeedback({ type: 'err', msg: (e as Error).message })
    } finally {
      setInviting(false)
      setTimeout(() => setFeedback(null), 6000)
    }
  }

  const handleRoleChange = async (userId: string, newRole: Role) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (!error) queryClient.invalidateQueries({ queryKey: ['team-members'] })
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#e8e0f0] p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Équipe</h1>
        <span className="text-sm text-gray-400">{members?.length || 0} membre{(members?.length || 0) > 1 ? 's' : ''}</span>
      </div>

      {canInvite && (
        <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-4 mb-2 flex gap-3 items-center flex-wrap">
          <input type="email" placeholder="Email du nouveau membre..."
            value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !inviting) handleInvite() }}
            disabled={inviting}
            className="flex-1 min-w-[240px] px-4 py-2.5 rounded-lg bg-gray-50 text-sm text-gray-700 outline-none border border-gray-200 disabled:opacity-50" />
          <select value={inviteRole} onChange={e => setInviteRole(e.target.value as InviteRole)}
            disabled={inviting}
            className="px-3 py-2.5 rounded-lg bg-gray-50 text-sm text-gray-700 outline-none border border-gray-200 disabled:opacity-50">
            <option value="sdr">SDR</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {inviting ? 'Envoi...' : 'Inviter'}
          </button>
        </div>
      )}

      {feedback && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${feedback.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {feedback.msg}
        </div>
      )}

      {isLoading ? <p className="text-sm text-gray-400">Chargement...</p> : (
        <div className="space-y-2">
          {members?.map(m => {
            const color = ROLE_COLORS[m.role]
            const canEditRole = me?.role === 'super_admin' || (me?.role === 'admin' && m.id !== me.id && m.role !== 'super_admin')
            return (
              <div key={m.id} className="flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-200 bg-white">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold"
                  style={{ background: color + '18', color }}>{(m.full_name || m.email).charAt(0).toUpperCase()}</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{m.full_name || m.email}</p>
                  <p className="text-[11px] text-gray-400">{m.email}</p>
                </div>
                {canEditRole ? (
                  <select value={m.role} onChange={e => handleRoleChange(m.id, e.target.value as Role)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer border" style={{ background: color + '18', color, borderColor: color + '40' }}>
                    {me?.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="sdr">SDR</option>
                  </select>
                ) : (
                  <div className="px-2.5 py-1 rounded-lg text-[10px] font-bold" style={{ background: color + '18', color }}>{ROLE_LABELS[m.role]}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
