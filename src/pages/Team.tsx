/**
 * Équipe — Gestion complète membres : invite, rôles, licences (parallel/power),
 * numéros Twilio multi-attribués, heures de travail, quotas appels, suspension, suppression.
 * Inspiré Minari Users page : compteurs licences, search, filter, table riche, actions.
 */

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/config/supabase'
import type { Profile, Role, CallLicense } from '@/types/user'
import { ROLE_LABELS, ROLE_COLORS, LICENSE_LABELS, LICENSE_COLORS } from '@/types/user'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

type FilterMode = 'all' | 'active' | 'pending' | 'suspended'

interface TwilioNumber { sid: string; phone: string; friendlyName: string }

export default function Team() {
  const { organisation, profile: me } = useAuth()
  const queryClient = useQueryClient()

  // ── Filtres / recherche ──
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')

  // ── Invite modal ──
  const [showInvite, setShowInvite] = useState(false)

  // ── Feedback toast ──
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const pushFeedback = (f: typeof feedback) => { setFeedback(f); setTimeout(() => setFeedback(null), 6000) }

  // ── Liste des membres ──
  const { data: members, isLoading } = useQuery({
    queryKey: ['team-members', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data, error } = await supabase.from('profiles')
        .select('id, email, full_name, role, is_active, assigned_phone, assigned_phones, call_license, deactivated_at, work_hours_start, work_hours_end, max_calls_per_day, last_seen_at, invite_expires_at, created_at, organisation_id')
        .eq('organisation_id', organisation.id).order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as Profile[]
    },
    enabled: !!organisation?.id,
  })

  // ── Email confirmation status (pour détecter Invitation pending) ──
  const { data: authStatuses } = useQuery({
    queryKey: ['team-auth-status', organisation?.id, members?.length],
    queryFn: async () => {
      if (!members?.length) return {} as Record<string, boolean>
      // Détection pending : on regarde last_seen_at. Si null + créé il y a > 0s → probable pending.
      // Note: l'info email_confirmed_at n'est pas accessible côté anon, on l'estime via last_seen_at.
      const map: Record<string, boolean> = {}
      for (const m of members) map[m.id] = m.last_seen_at !== null
      return map
    },
    enabled: !!members?.length,
  })

  // ── Numéros Twilio dispo org ──
  const { data: twilioNumbers } = useQuery({
    queryKey: ['team-twilio-numbers'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return []
      const res = await fetch(`${SUPABASE_URL}/functions/v1/twilio-numbers?action=list`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.numbers || []) as TwilioNumber[]
    },
    staleTime: 300_000,
  })

  // ── Droits ──
  const canInvite = me?.role === 'super_admin' || me?.role === 'admin' || me?.role === 'manager'
  const canManage = (target: Profile) => {
    if (!me) return false
    if (target.id === me.id) return false
    if (target.role === 'super_admin' && me.role !== 'super_admin') return false
    return ['super_admin', 'admin'].includes(me.role) || (me.role === 'manager' && target.role === 'sdr')
  }

  // ── Compteurs licences ──
  const licenseStats = useMemo(() => {
    const counts = { parallel: 0, power: 0, none: 0 }
    for (const m of (members || [])) {
      if (!m.deactivated_at) counts[m.call_license] = (counts[m.call_license] || 0) + 1
    }
    return {
      parallel: { used: counts.parallel, max: organisation?.max_parallel_seats || 0 },
      power: { used: counts.power, max: organisation?.max_power_seats || 0 },
    }
  }, [members, organisation])

  // ── Filtrage ──
  const filteredMembers = useMemo(() => {
    if (!members) return []
    return members.filter(m => {
      if (search) {
        const q = search.toLowerCase()
        if (!(m.email.toLowerCase().includes(q) || (m.full_name || '').toLowerCase().includes(q))) return false
      }
      const confirmed = authStatuses?.[m.id]
      if (filter === 'active' && (m.deactivated_at || confirmed === false)) return false
      if (filter === 'pending' && confirmed !== false) return false
      if (filter === 'suspended' && !m.deactivated_at) return false
      return true
    })
  }, [members, search, filter, authStatuses])

  // ── Mutations ──
  const callTeamAction = async (action: string, user_id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'Session expirée' }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/team-manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, user_id }),
    })
    const body = await res.json().catch(() => ({ error: 'Réponse invalide' }))
    if (!res.ok) return { error: body?.error || `Erreur ${res.status}` }
    return body
  }

  const updateProfile = async (userId: string, patch: Partial<Profile>) => {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) { pushFeedback({ type: 'err', msg: error.message }); return false }
    queryClient.invalidateQueries({ queryKey: ['team-members'] })
    return true
  }

  const handleResend = async (u: Profile) => {
    const r = await callTeamAction('resend_invite', u.id)
    if (r.error) pushFeedback({ type: 'err', msg: r.error })
    else pushFeedback({ type: 'ok', msg: `Invitation renvoyée à ${u.email}` })
  }
  const handleCancelInvite = async (u: Profile) => {
    if (!confirm(`Annuler l'invitation de ${u.email} ?`)) return
    const r = await callTeamAction('cancel_invite', u.id)
    if (r.error) pushFeedback({ type: 'err', msg: r.error })
    else {
      pushFeedback({ type: 'ok', msg: 'Invitation annulée' })
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
    }
  }
  const handleToggleStatus = async (u: Profile) => {
    const r = await callTeamAction('toggle_status', u.id)
    if (r.error) pushFeedback({ type: 'err', msg: r.error })
    else {
      pushFeedback({ type: 'ok', msg: r.deactivated ? 'Utilisateur suspendu' : 'Utilisateur réactivé' })
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
    }
  }
  const handleRevokeLink = async (u: Profile) => {
    if (!confirm(`Révoquer le lien d'invitation de ${u.email} ? Le lien déjà envoyé ne fonctionnera plus. Vous pourrez toujours renvoyer une nouvelle invitation ensuite.`)) return
    // On expire immédiatement le lien en mettant invite_expires_at dans le passé
    const { error } = await supabase.from('profiles')
      .update({ invite_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', u.id)
    if (error) pushFeedback({ type: 'err', msg: error.message })
    else {
      pushFeedback({ type: 'ok', msg: `Lien révoqué pour ${u.email}` })
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
    }
  }
  const handleDelete = async (u: Profile) => {
    if (!confirm(`Supprimer définitivement ${u.email} ? Cette action est irréversible.`)) return
    const r = await callTeamAction('delete_user', u.id)
    if (r.error) pushFeedback({ type: 'err', msg: r.error })
    else {
      pushFeedback({ type: 'ok', msg: 'Utilisateur supprimé' })
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#e8e0f0] p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Équipe</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {members?.length || 0} membre{(members?.length || 0) > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <LicenseCounter label="Parallel dialer" used={licenseStats.parallel.used} max={licenseStats.parallel.max} color="#8b5cf6" />
          <LicenseCounter label="Power dialer" used={licenseStats.power.used} max={licenseStats.power.max} color="#0ea5e9" />
          {canInvite && (
            <button onClick={() => setShowInvite(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
              + Inviter
            </button>
          )}
        </div>
      </div>

      {/* ── Filtres + Search ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center bg-white rounded-lg border border-gray-200 px-3 py-2 flex-1 min-w-[240px] max-w-[400px]">
          <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom ou email..."
            className="flex-1 text-sm outline-none bg-transparent" />
        </div>
        <div className="flex items-center bg-white rounded-lg border border-gray-200 overflow-hidden">
          {(['all', 'active', 'pending', 'suspended'] as FilterMode[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-2 text-[12px] font-medium transition-colors ${filter === f ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feedback ── */}
      {feedback && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${feedback.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {feedback.msg}
        </div>
      )}

      {/* ── Table membres ── */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement...</p>
      ) : filteredMembers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          Aucun membre ne correspond à ces filtres.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th>Membre</Th>
                <Th>Statut</Th>
                <Th>Rôle</Th>
                <Th>Licence</Th>
                <Th>Numéros assignés</Th>
                <Th>Horaires</Th>
                <Th>Quota</Th>
                <Th>Dernière activité</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map(m => {
                // Numéros pris par les AUTRES users de l'org → exclus du dropdown "+ Numéro" de ce user
                const phonesUsedByOthers = new Set(
                  (members || [])
                    .filter(other => other.id !== m.id)
                    .flatMap(other => other.assigned_phones || [])
                )
                return (
                  <MemberRow key={m.id} m={m}
                    isMe={m.id === me?.id}
                    canManage={canManage(m)}
                    twilioNumbers={twilioNumbers || []}
                    phonesUsedByOthers={phonesUsedByOthers}
                    confirmed={authStatuses?.[m.id] ?? true}
                    meRole={me?.role || 'sdr'}
                    onResend={() => handleResend(m)}
                    onCancelInvite={() => handleCancelInvite(m)}
                    onRevokeLink={() => handleRevokeLink(m)}
                    onToggleStatus={() => handleToggleStatus(m)}
                    onDelete={() => handleDelete(m)}
                    onPatch={(patch) => updateProfile(m.id, patch)}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Matrice permissions (read-only) ── */}
      <PermissionMatrix />

      {/* ── Modal Invite ── */}
      {showInvite && (
        <InviteModal
          twilioNumbers={twilioNumbers || []}
          phonesUsedByOthers={new Set((members || []).flatMap(m => m.assigned_phones || []))}
          meRole={me?.role || 'sdr'}
          onClose={() => setShowInvite(false)}
          onInvited={(email, role) => {
            pushFeedback({ type: 'ok', msg: `Invitation envoyée à ${email} (${ROLE_LABELS[role]})` })
            setShowInvite(false)
            queryClient.invalidateQueries({ queryKey: ['team-members'] })
          }}
          onError={(msg) => pushFeedback({ type: 'err', msg })}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Composants internes
// ──────────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'Tous',
  active: 'Actifs',
  pending: 'En attente',
  suspended: 'Suspendus',
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{children}</th>
}

function LicenseCounter({ label, used, max, color }: { label: string; used: number; max: number; color: string }) {
  const display = max > 0 ? `${used}/${max}` : `${used}`
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-[12px] text-gray-500">{label}</span>
      <span className="text-[13px] font-bold" style={{ color }}>{display}</span>
    </div>
  )
}

function MemberRow({ m, isMe, canManage, twilioNumbers, phonesUsedByOthers, confirmed, meRole, onResend, onCancelInvite, onRevokeLink, onToggleStatus, onDelete, onPatch }: {
  m: Profile
  isMe: boolean
  canManage: boolean
  twilioNumbers: TwilioNumber[]
  phonesUsedByOthers: Set<string>
  confirmed: boolean
  meRole: Role
  onResend: () => void
  onCancelInvite: () => void
  onRevokeLink: () => void
  onToggleStatus: () => void
  onDelete: () => void
  onPatch: (patch: Partial<Profile>) => Promise<boolean>
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [addPhoneOpen, setAddPhoneOpen] = useState(false)

  const status: 'active' | 'pending' | 'suspended' = m.deactivated_at ? 'suspended' : (confirmed ? 'active' : 'pending')

  // Exclut les numéros déjà sur CE user + ceux pris par d'autres users de l'org
  const availablePhones = twilioNumbers.filter(tn =>
    !(m.assigned_phones || []).includes(tn.phone) &&
    !phonesUsedByOthers.has(tn.phone)
  )

  const handleAssignPhone = async (phone: string) => {
    const newPhones = [...(m.assigned_phones || []), phone]
    await onPatch({ assigned_phones: newPhones })
    setAddPhoneOpen(false)
  }
  const handleRemovePhone = async (phone: string) => {
    const newPhones = (m.assigned_phones || []).filter(p => p !== phone)
    await onPatch({ assigned_phones: newPhones })
  }

  const color = ROLE_COLORS[m.role]
  const licColor = LICENSE_COLORS[m.call_license]

  return (
    <tr className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors ${m.deactivated_at ? 'opacity-60' : ''}`}>
      {/* Avatar + Nom */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0"
            style={{ background: color + '18', color }}>
            {(m.full_name || m.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">
              {m.full_name || m.email.split('@')[0]}
              {isMe && <span className="ml-2 text-[10px] font-normal text-gray-400">(vous)</span>}
            </p>
            <p className="text-[11px] text-gray-400 truncate">{m.email}</p>
          </div>
        </div>
      </td>

      {/* Statut */}
      <td className="px-3 py-3">
        <StatusBadge status={status} />
      </td>

      {/* Rôle */}
      <td className="px-3 py-3">
        {canManage ? (
          <select value={m.role} onChange={e => onPatch({ role: e.target.value as Role })}
            className="px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer border bg-white" style={{ color, borderColor: color + '40' }}>
            {meRole === 'super_admin' && <option value="super_admin">Super Admin</option>}
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="sdr">SDR</option>
          </select>
        ) : (
          <span className="px-2 py-1 rounded-md text-[11px] font-bold" style={{ background: color + '18', color }}>
            {ROLE_LABELS[m.role]}
          </span>
        )}
      </td>

      {/* Licence d'appel */}
      <td className="px-3 py-3">
        {canManage ? (
          <select value={m.call_license} onChange={e => onPatch({ call_license: e.target.value as CallLicense })}
            className="px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer border bg-white"
            style={{ color: licColor, borderColor: licColor + '40' }}
            title="Parallel inclut Power (le SDR bascule à volonté). Power = mono-line uniquement.">
            <option value="parallel">Parallel (+ Power)</option>
            <option value="power">Power seul</option>
            <option value="none">Aucune</option>
          </select>
        ) : (
          <span className="px-2 py-1 rounded-md text-[11px] font-semibold" style={{ background: licColor + '18', color: licColor }}>
            {LICENSE_LABELS[m.call_license]}
          </span>
        )}
      </td>

      {/* Numéros assignés (chips + add) */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1 flex-wrap max-w-[280px]">
          {(m.assigned_phones || []).map(p => (
            <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
              {p}
              {canManage && (
                <button onClick={() => handleRemovePhone(p)} className="text-indigo-400 hover:text-red-500" title="Retirer">×</button>
              )}
            </span>
          ))}
          {canManage && availablePhones.length > 0 && (
            <div className="relative">
              <button onClick={() => setAddPhoneOpen(v => !v)}
                className="px-2 py-0.5 rounded-full text-[10px] text-gray-400 hover:text-indigo-600 border border-dashed border-gray-300 hover:border-indigo-300">
                + Numéro
              </button>
              {addPhoneOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAddPhoneOpen(false)} />
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg border border-gray-200 shadow-lg py-1 min-w-[180px] max-h-[200px] overflow-auto">
                    {availablePhones.map(tn => (
                      <button key={tn.sid} onClick={() => handleAssignPhone(tn.phone)}
                        className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 hover:bg-indigo-50">
                        {tn.phone}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {!canManage && (m.assigned_phones || []).length === 0 && (
            <span className="text-[11px] text-gray-300">—</span>
          )}
        </div>
      </td>

      {/* Horaires */}
      <td className="px-3 py-3">
        {canManage ? (
          <div className="flex items-center gap-1">
            <input type="time" value={m.work_hours_start?.slice(0, 5) || '09:00'}
              onChange={e => onPatch({ work_hours_start: e.target.value + ':00' })}
              className="text-[11px] border border-gray-200 rounded px-1 py-0.5 w-[72px]" />
            <span className="text-[10px] text-gray-400">→</span>
            <input type="time" value={m.work_hours_end?.slice(0, 5) || '18:00'}
              onChange={e => onPatch({ work_hours_end: e.target.value + ':00' })}
              className="text-[11px] border border-gray-200 rounded px-1 py-0.5 w-[72px]" />
          </div>
        ) : (
          <span className="text-[12px] text-gray-500">
            {m.work_hours_start?.slice(0, 5) || '09:00'} – {m.work_hours_end?.slice(0, 5) || '18:00'}
          </span>
        )}
      </td>

      {/* Quota appels/jour */}
      <td className="px-3 py-3">
        {canManage ? (
          <input type="number" min="0" value={m.max_calls_per_day || 0}
            onChange={e => onPatch({ max_calls_per_day: parseInt(e.target.value) || 0 })}
            className="text-[12px] border border-gray-200 rounded px-2 py-0.5 w-[64px]"
            title="0 = illimité" />
        ) : (
          <span className="text-[12px] text-gray-500">{m.max_calls_per_day || '∞'}</span>
        )}
      </td>

      {/* Dernière activité OU expiration invitation */}
      <td className="px-3 py-3">
        {status === 'pending' && m.invite_expires_at ? (
          <InviteExpiryBadge iso={m.invite_expires_at} />
        ) : (
          <span className="text-[11px] text-gray-400">
            {m.last_seen_at ? formatRelativeTime(m.last_seen_at) : 'Jamais'}
          </span>
        )}
      </td>

      {/* Menu actions */}
      <td className="px-3 py-3 text-right">
        {canManage && (
          <div className="relative">
            <button onClick={() => setMenuOpen(v => !v)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" /></svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg border border-gray-200 shadow-lg py-1 min-w-[200px]">
                  {status === 'pending' && (
                    <>
                      <MenuItem onClick={() => { setMenuOpen(false); onResend() }}>Renvoyer l'invitation</MenuItem>
                      <MenuItem onClick={() => { setMenuOpen(false); onRevokeLink() }}>Révoquer le lien</MenuItem>
                      <MenuItem danger onClick={() => { setMenuOpen(false); onCancelInvite() }}>Annuler l'invitation</MenuItem>
                    </>
                  )}
                  {status !== 'pending' && (
                    <MenuItem onClick={() => { setMenuOpen(false); onToggleStatus() }}>
                      {m.deactivated_at ? 'Réactiver' : 'Suspendre'}
                    </MenuItem>
                  )}
                  <MenuItem danger onClick={() => { setMenuOpen(false); onDelete() }}>Supprimer définitivement</MenuItem>
                </div>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50 ${danger ? 'text-red-600 hover:text-red-700' : 'text-gray-700 hover:text-gray-900'}`}>
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: 'active' | 'pending' | 'suspended' }) {
  const config = {
    active: { label: 'Actif', bg: '#d1fae5', color: '#065f46' },
    pending: { label: 'Invitation', bg: '#fed7aa', color: '#9a3412' },
    suspended: { label: 'Suspendu', bg: '#fee2e2', color: '#991b1b' },
  }[status]
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: config.bg, color: config.color }}>
      {config.label}
    </span>
  )
}

function InviteExpiryBadge({ iso }: { iso: string }) {
  const msLeft = new Date(iso).getTime() - Date.now()
  const expired = msLeft <= 0
  if (expired) {
    return <span className="inline-flex items-center gap-1 text-[11px] text-red-600 font-medium" title="Lien expiré — cliquer sur Renvoyer l'invitation"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Lien expiré</span>
  }
  const hours = Math.floor(msLeft / 3600_000)
  const mins = Math.floor((msLeft % 3600_000) / 60_000)
  const label = hours >= 1 ? `Expire dans ${hours}h${mins > 0 ? `${String(mins).padStart(2, '0')}` : ''}` : `Expire dans ${mins} min`
  return <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{label}</span>
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'À l’instant'
  if (sec < 3600) return `Il y a ${Math.floor(sec / 60)} min`
  if (sec < 86400) return `Il y a ${Math.floor(sec / 3600)} h`
  if (sec < 604800) return `Il y a ${Math.floor(sec / 86400)} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ── InviteModal ──
function InviteModal({ twilioNumbers, phonesUsedByOthers, meRole, onClose, onInvited, onError }: {
  twilioNumbers: TwilioNumber[]
  phonesUsedByOthers: Set<string>
  meRole: Role
  onClose: () => void
  onInvited: (email: string, role: Role) => void
  onError: (msg: string) => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<Role, 'super_admin'>>('sdr')
  const [license, setLicense] = useState<CallLicense>('power')
  const [phones, setPhones] = useState<string[]>([])
  const [workStart, setWorkStart] = useState('09:00')
  const [workEnd, setWorkEnd] = useState('18:00')
  const [maxCalls, setMaxCalls] = useState(0)
  const [expiresInHours, setExpiresInHours] = useState(24)
  const [inviting, setInviting] = useState(false)

  const togglePhone = (p: string) => setPhones(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { onError('Email invalide'); return }
    setInviting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { onError('Session expirée'); return }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          role,
          call_license: license,
          assigned_phones: phones,
          work_hours_start: workStart,
          work_hours_end: workEnd,
          max_calls_per_day: maxCalls,
          expires_in_hours: expiresInHours,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { onError(body?.error || `Erreur ${res.status}`); return }
      onInvited(email.trim().toLowerCase(), role)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Inviter un membre</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="space-y-4">
          <Field label="Email">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="membre@entreprise.com"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rôle">
              <select value={role} onChange={e => setRole(e.target.value as Exclude<Role, 'super_admin'>)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                <option value="sdr">SDR</option>
                <option value="manager">Manager</option>
                {(meRole === 'super_admin' || meRole === 'admin') && <option value="admin">Admin</option>}
              </select>
            </Field>
            <Field label="Licence d'appel">
              <select value={license} onChange={e => setLicense(e.target.value as CallLicense)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                <option value="parallel">Parallel (+ Power)</option>
                <option value="power">Power seul</option>
                <option value="none">Aucune</option>
              </select>
              <p className="mt-1 text-[11px] text-gray-400">Parallel inclut Power : le SDR bascule entre les deux selon son intensité.</p>
            </Field>
          </div>

          <Field label={`Numéros assignés (${phones.length})`}>
            {twilioNumbers.length === 0 ? (
              <p className="text-[12px] text-gray-400">Aucun numéro Twilio dispo. Ajoute d'abord des numéros dans Paramètres.</p>
            ) : (
              <>
                <div className="flex items-center gap-1 flex-wrap">
                  {twilioNumbers.map(tn => {
                    const selected = phones.includes(tn.phone)
                    const takenByOther = phonesUsedByOthers.has(tn.phone)
                    return (
                      <button key={tn.sid} type="button"
                        onClick={() => { if (!takenByOther) togglePhone(tn.phone) }}
                        disabled={takenByOther}
                        title={takenByOther ? 'Déjà attribué à un autre membre' : ''}
                        className={`px-2 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                          takenByOther ? 'bg-gray-100 text-gray-300 border-gray-200 line-through cursor-not-allowed' :
                          selected ? 'bg-indigo-50 text-indigo-700 border-indigo-300' :
                          'bg-gray-50 text-gray-500 border-gray-200 hover:border-indigo-200'
                        }`}>
                        {tn.phone}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1 text-[11px] text-gray-400">1 numéro = 1 personne. Les numéros barrés sont déjà attribués.</p>
              </>
            )}
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Début">
              <input type="time" value={workStart} onChange={e => setWorkStart(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </Field>
            <Field label="Fin">
              <input type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </Field>
            <Field label="Quota/jour">
              <input type="number" min="0" value={maxCalls} onChange={e => setMaxCalls(parseInt(e.target.value) || 0)}
                title="0 = illimité"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </Field>
          </div>

          <Field label="Validité du lien d'invitation">
            <select value={expiresInHours} onChange={e => setExpiresInHours(parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
              <option value={1}>1 heure (urgence)</option>
              <option value={6}>6 heures</option>
              <option value={12}>12 heures</option>
              <option value={24}>24 heures (par défaut)</option>
              <option value={72}>3 jours</option>
              <option value={168}>1 semaine</option>
              <option value={720}>1 mois</option>
              <option value={0}>Pas de délai (illimité)</option>
            </select>
            <p className="mt-1 text-[11px] text-gray-400">Le lien du mail est techniquement valide 24h ; au-delà l'utilisateur reçoit un nouveau lien automatiquement tant que le délai ci-dessus n'est pas dépassé.</p>
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button onClick={onClose} disabled={inviting} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Annuler</button>
          <button onClick={submit} disabled={inviting || !email.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
            {inviting ? 'Envoi...' : 'Envoyer l\'invitation'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  )
}

// ── Permission matrix ──
function PermissionMatrix() {
  const [open, setOpen] = useState(false)
  const rows: Array<{ label: string; superAdmin: string; admin: string; manager: string; sdr: string }> = [
    { label: 'Import / Export / Supprimer contacts', superAdmin: '✓', admin: '✓', manager: '✓', sdr: '—' },
    { label: 'Créer / Supprimer listes', superAdmin: '✓', admin: '✓', manager: '✓', sdr: '—' },
    { label: 'Configurer pipeline / statuts / champs', superAdmin: '✓', admin: '✓', manager: '✓', sdr: 'Utiliser' },
    { label: 'Acheter numéros Twilio', superAdmin: '✓', admin: '—', manager: '—', sdr: '—' },
    { label: 'Assigner numéros aux users', superAdmin: '✓', admin: '✓', manager: '—', sdr: '—' },
    { label: 'Inviter / Suspendre / Supprimer users', superAdmin: '✓', admin: '✓', manager: 'SDR only', sdr: '—' },
    { label: 'Changer rôles', superAdmin: '✓', admin: '✓ (sauf Super)', manager: '—', sdr: '—' },
    { label: 'Billing', superAdmin: '✓', admin: '—', manager: '—', sdr: '—' },
    { label: 'Intégrations (Gmail, GCal, HubSpot)', superAdmin: '✓', admin: '✓', manager: '—', sdr: '—' },
    { label: 'Voir tous les appels / analytics org', superAdmin: '✓', admin: '✓', manager: '✓', sdr: 'Les siens' },
  ]
  return (
    <div className="mt-8 bg-white rounded-xl border border-gray-200">
      <button onClick={() => setOpen(v => !v)} className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50 rounded-t-xl">
        <span className="text-sm font-semibold text-gray-700">Matrice des permissions</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-gray-200 overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <Th>Permission</Th>
                <Th>Super Admin</Th>
                <Th>Admin</Th>
                <Th>Manager</Th>
                <Th>SDR</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-2.5 text-[12px] text-gray-700">{r.label}</td>
                  <td className="px-3 py-2.5 text-[12px]">{r.superAdmin}</td>
                  <td className="px-3 py-2.5 text-[12px]">{r.admin}</td>
                  <td className="px-3 py-2.5 text-[12px]">{r.manager}</td>
                  <td className="px-3 py-2.5 text-[12px]">{r.sdr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
