/**
 * Super Admin — vue hiérarchique "arbre généalogique" des clients Calsyn.
 * Chaque card organisation déroule (expand) ses membres groupés par rôle :
 * Admins → Managers → SDRs. Le Super Admin peut inviter le premier admin
 * d'une nouvelle org, et gérer les rôles/statuts sans voir son propre compte.
 */
import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/config/supabase'
import type { Role } from '@/types/user'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

interface OrgRow {
  id: string; name: string; slug: string; plan: string; is_active: boolean
  from_number: string | null; max_parallel_seats: number; max_power_seats: number
  created_at: string
}

interface MemberRow {
  id: string; email: string; full_name: string | null
  role: Role; organisation_id: string | null
  deactivated_at: string | null; last_seen_at: string | null
  invite_expires_at: string | null
}

export default function SuperAdmin() {
  const { isSuperAdmin, profile: me } = useAuth()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const pushFeedback = (f: typeof feedback) => { setFeedback(f); setTimeout(() => setFeedback(null), 5000) }
  const [inviteAdminFor, setInviteAdminFor] = useState<OrgRow | null>(null)

  const [deleteOrgTarget, setDeleteOrgTarget] = useState<OrgRow | null>(null)

  const { data: orgs, isLoading } = useQuery({
    queryKey: ['super-admin-orgs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organisations')
        .select('id, name, slug, plan, is_active, from_number, max_parallel_seats, max_power_seats, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as OrgRow[]
    },
    enabled: isSuperAdmin,
  })

  const { data: allMembers } = useQuery({
    queryKey: ['super-admin-all-members'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('id, email, full_name, role, organisation_id, deactivated_at, last_seen_at, invite_expires_at')
        .neq('role', 'super_admin')
      if (error) throw error
      return (data || []) as MemberRow[]
    },
    enabled: isSuperAdmin,
  })

  // Group members par org
  const membersByOrg = useMemo(() => {
    const map: Record<string, MemberRow[]> = {}
    for (const m of (allMembers || [])) {
      if (!m.organisation_id) continue
      if (!map[m.organisation_id]) map[m.organisation_id] = []
      map[m.organisation_id].push(m)
    }
    return map
  }, [allMembers])

  const toggleExpand = (id: string) => {
    const next = new Set(expandedOrgs)
    if (next.has(id)) next.delete(id); else next.add(id)
    setExpandedOrgs(next)
  }

  const handleRoleChange = async (userId: string, newRole: Role) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (error) pushFeedback({ type: 'err', msg: error.message })
    else {
      pushFeedback({ type: 'ok', msg: 'Rôle mis à jour' })
      queryClient.invalidateQueries({ queryKey: ['super-admin-all-members'] })
    }
  }

  const handleTeamAction = async (userId: string, action: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`${SUPABASE_URL}/functions/v1/team-manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, user_id: userId }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) pushFeedback({ type: 'err', msg: body?.error || `Erreur ${res.status}` })
    else {
      pushFeedback({ type: 'ok', msg: 'Action effectuée' })
      queryClient.invalidateQueries({ queryKey: ['super-admin-all-members'] })
    }
  }

  const handleToggleOrgActive = async (org: OrgRow) => {
    const { error } = await supabase.from('organisations').update({ is_active: !org.is_active }).eq('id', org.id)
    if (error) pushFeedback({ type: 'err', msg: error.message })
    else {
      pushFeedback({ type: 'ok', msg: org.is_active ? `Organisation ${org.name} désactivée` : `Organisation ${org.name} réactivée` })
      queryClient.invalidateQueries({ queryKey: ['super-admin-orgs'] })
    }
  }

  const handleDeleteOrg = (org: OrgRow) => setDeleteOrgTarget(org)

  if (!isSuperAdmin) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Accès réservé au Super Admin.</div>
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#e8e0f0] p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Super Admin — Clients Calsyn</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {orgs?.length || 0} organisation{(orgs?.length || 0) > 1 ? 's' : ''} · {(allMembers || []).length} membres totaux
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
          + Nouvelle organisation
        </button>
      </div>

      {feedback && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${feedback.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {feedback.msg}
        </div>
      )}

      {isLoading ? <p className="text-sm text-gray-400">Chargement...</p> : !orgs?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          Aucune organisation cliente pour le moment. Créez-en une pour commencer.
        </div>
      ) : (
        <div className="space-y-3">
          {orgs.map(org => (
            <OrgCard key={org.id} org={org}
              members={membersByOrg[org.id] || []}
              expanded={expandedOrgs.has(org.id)}
              onToggle={() => toggleExpand(org.id)}
              onInviteAdmin={() => setInviteAdminFor(org)}
              onToggleActive={() => handleToggleOrgActive(org)}
              onDeleteOrg={() => handleDeleteOrg(org)}
              onRoleChange={handleRoleChange}
              onTeamAction={handleTeamAction}
              meId={me?.id || ''}
            />
          ))}
        </div>
      )}

      {/* Pool global des numéros Twilio Calsyn + allocation par org */}
      <PhoneInventoryPanel orgs={orgs || []} onChange={msg => pushFeedback({ type: 'ok', msg })} onError={msg => pushFeedback({ type: 'err', msg })} />

      {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)} onCreated={() => {
        queryClient.invalidateQueries({ queryKey: ['super-admin-orgs'] })
        setShowCreate(false)
        pushFeedback({ type: 'ok', msg: 'Organisation créée. Invitez maintenant son premier admin.' })
      }} />}

      {inviteAdminFor && (
        <InviteAdminModal org={inviteAdminFor}
          onClose={() => setInviteAdminFor(null)}
          onInvited={email => {
            pushFeedback({ type: 'ok', msg: `Invitation admin envoyée à ${email}` })
            setInviteAdminFor(null)
            queryClient.invalidateQueries({ queryKey: ['super-admin-all-members'] })
          }}
          onError={msg => pushFeedback({ type: 'err', msg })}
        />
      )}

      {deleteOrgTarget && (
        <DeleteOrgModal org={deleteOrgTarget}
          isOwnOrg={me?.organisation_id === deleteOrgTarget.id}
          onClose={() => setDeleteOrgTarget(null)}
          onDeleted={() => {
            pushFeedback({ type: 'ok', msg: `Organisation "${deleteOrgTarget.name}" supprimée (soft-delete, récupérable).` })
            setDeleteOrgTarget(null)
            queryClient.invalidateQueries({ queryKey: ['super-admin-orgs'] })
            queryClient.invalidateQueries({ queryKey: ['super-admin-all-members'] })
          }}
          onError={msg => pushFeedback({ type: 'err', msg })}
        />
      )}
    </div>
  )
}

// ── PhoneInventoryPanel ──────────────────────────────────────────────
// Niveau 1 de la hiérarchie téléphone : le super_admin voit/gère l'inventaire
// global des numéros Twilio Calsyn, et alloue chaque numéro à une org cliente
// (ou le retire du pool). L'admin de l'org distribue ensuite aux SDR depuis
// son pool via Team page.
interface PhoneRow {
  phone_number: string
  label: string | null
  organisation_id: string | null
  allocated_at: string | null
  monthly_cost_cents: number
}

function PhoneInventoryPanel({ orgs, onChange, onError }: {
  orgs: OrgRow[]
  onChange: (msg: string) => void
  onError: (msg: string) => void
}) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const { data: phones } = useQuery({
    queryKey: ['phone-inventory'],
    queryFn: async () => {
      const { data, error } = await supabase.from('phone_inventory')
        .select('phone_number, label, organisation_id, allocated_at, monthly_cost_cents')
        .is('deleted_at', null)
        .order('phone_number')
      if (error) throw error
      return (data || []) as PhoneRow[]
    },
  })

  const addPhone = async () => {
    if (!newPhone.trim()) return
    setAdding(true)
    const { error } = await supabase.rpc('phone_inventory_add', {
      p_phone: newPhone.trim(),
      p_label: newLabel.trim() || null,
    })
    setAdding(false)
    if (error) { onError(error.message); return }
    setNewPhone(''); setNewLabel('')
    onChange(`Numéro ${newPhone.trim()} ajouté au pool.`)
    queryClient.invalidateQueries({ queryKey: ['phone-inventory'] })
  }

  const allocate = async (phone: string, orgId: string | null) => {
    const { error } = await supabase.rpc('phone_allocate', { p_phone: phone, p_org_id: orgId })
    if (error) { onError(error.message); return }
    onChange(orgId ? `Numéro ${phone} alloué.` : `Numéro ${phone} remis dans le pool global.`)
    queryClient.invalidateQueries({ queryKey: ['phone-inventory'] })
  }

  const unallocated = (phones || []).filter(p => !p.organisation_id).length
  const allocated = (phones || []).filter(p => p.organisation_id).length

  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 text-left">
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex-1">
          <h2 className="text-base font-bold text-gray-800">Inventaire des numéros Twilio</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {phones?.length || 0} numéro{(phones?.length || 0) > 1 ? 's' : ''} · {allocated} alloué{allocated > 1 ? 's' : ''} · {unallocated} libre{unallocated > 1 ? 's' : ''}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          {/* Ajout */}
          <div className="flex items-center gap-2 flex-wrap">
            <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
              placeholder="+33159580189" autoComplete="off"
              className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="Label (ex : Paris 15)" autoComplete="off"
              className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            <button onClick={addPhone} disabled={adding || !newPhone.trim()}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
              {adding ? '…' : '+ Ajouter'}
            </button>
          </div>

          {/* Liste */}
          {phones && phones.length > 0 ? (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Numéro</th>
                    <th className="px-3 py-2 text-left font-semibold">Label</th>
                    <th className="px-3 py-2 text-left font-semibold">Organisation allouée</th>
                    <th className="px-3 py-2 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {phones.map(p => (
                    <tr key={p.phone_number} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono text-[13px] text-gray-700">{p.phone_number}</td>
                      <td className="px-3 py-2 text-[12px] text-gray-500">{p.label || '—'}</td>
                      <td className="px-3 py-2">
                        <select value={p.organisation_id || ''} onChange={e => allocate(p.phone_number, e.target.value || null)}
                          className="px-2 py-1 rounded border border-gray-200 text-[12px] bg-white">
                          <option value="">— Pool global (libre)</option>
                          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.organisation_id && (
                          <button onClick={() => allocate(p.phone_number, null)} className="text-[11px] text-gray-400 hover:text-red-500">
                            Désallouer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[12px] text-gray-400 text-center py-6">
              Aucun numéro dans l'inventaire. Ajoutez vos numéros Twilio pour commencer à les allouer aux orgs clientes.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── DeleteOrgModal ───────────────────────────────────────────────────
// Protocole de sécurité maximum contre les suppressions accidentelles :
// 1. Pré-check via RPC count_org_resources (users/prospects/lists/calls)
// 2. Saisie obligatoire du nom EXACT de l'organisation
// 3. Blocage si c'est la propre org du super_admin
// 4. Appel RPC soft_delete_organisation (jamais de DELETE hard)
function DeleteOrgModal({ org, isOwnOrg, onClose, onDeleted, onError }: {
  org: OrgRow
  isOwnOrg: boolean
  onClose: () => void
  onDeleted: () => void
  onError: (msg: string) => void
}) {
  const [confirmName, setConfirmName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [counts, setCounts] = useState<{ users: number; prospects: number; lists: number; calls: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('count_org_resources', { p_org_id: org.id }).then(({ data, error }) => {
      if (cancelled) return
      if (error) { onError(error.message); return }
      const row = Array.isArray(data) ? data[0] : data
      if (row) setCounts({
        users: Number(row.users_count) || 0,
        prospects: Number(row.prospects_count) || 0,
        lists: Number(row.lists_count) || 0,
        calls: Number(row.calls_count) || 0,
      })
    })
    return () => { cancelled = true }
  }, [org.id, onError])

  const nameMatch = confirmName.trim() === org.name
  const canSubmit = !isOwnOrg && nameMatch && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    const { error } = await supabase.rpc('soft_delete_organisation', { p_org_id: org.id, p_confirm_name: confirmName.trim() })
    setSubmitting(false)
    if (error) { onError(error.message); return }
    onDeleted()
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-5 border-b border-red-100 bg-red-50/60">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-base font-bold text-amber-700">Archiver l'organisation</h2>
          </div>
          <p className="text-[12px] text-amber-700/90 mt-1">L'organisation disparaît de l'UI. Les données restent en base (récupération possible à tout moment par un admin technique).</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {isOwnOrg && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-700">
              ⚠️ Vous ne pouvez pas supprimer votre propre organisation. Détachez-vous d'abord (organisation_id = NULL) ou changez-en.
            </div>
          )}

          <div className="text-[13px] text-gray-700">
            <p>Vous allez archiver <strong className="font-semibold">{org.name}</strong>.</p>
            {counts ? (
              <ul className="mt-2 space-y-1 text-[12px] text-gray-600">
                <li>→ <strong>{counts.users}</strong> utilisateur{counts.users > 1 ? 's' : ''}</li>
                <li>→ <strong>{counts.prospects}</strong> prospect{counts.prospects > 1 ? 's' : ''}</li>
                <li>→ <strong>{counts.lists}</strong> liste{counts.lists > 1 ? 's' : ''} de prospects</li>
                <li>→ <strong>{counts.calls}</strong> appel{counts.calls > 1 ? 's' : ''} enregistré{counts.calls > 1 ? 's' : ''}</li>
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-gray-400">Chargement des ressources liées…</p>
            )}
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
              Pour confirmer, tapez exactement <code className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-800">{org.name}</code>
            </label>
            <input type="text" value={confirmName} onChange={e => setConfirmName(e.target.value)}
              disabled={isOwnOrg}
              placeholder={org.name}
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors ${
                nameMatch ? 'border-emerald-300 focus:ring-emerald-200' : 'border-gray-300 focus:ring-indigo-200'
              } ${isOwnOrg ? 'opacity-50 cursor-not-allowed' : ''}`}
              autoComplete="off" />
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={submitting}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50">
            Annuler
          </button>
          <button onClick={submit} disabled={!canSubmit}
            className={`px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors ${
              canSubmit ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-300 cursor-not-allowed'
            }`}>
            {submitting ? 'Archivage…' : 'Archiver l\'organisation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── OrgCard ──────────────────────────────────────────────────────
function OrgCard({ org, members, expanded, onToggle, onInviteAdmin, onToggleActive, onDeleteOrg, onRoleChange, onTeamAction, meId }: {
  org: OrgRow
  members: MemberRow[]
  expanded: boolean
  onToggle: () => void
  onInviteAdmin: () => void
  onToggleActive: () => void
  onDeleteOrg: () => void
  onRoleChange: (userId: string, newRole: Role) => void
  onTeamAction: (userId: string, action: string) => void
  meId: string
}) {
  const admins = members.filter(m => m.role === 'admin')
  const managers = members.filter(m => m.role === 'manager')
  const sdrs = members.filter(m => m.role === 'sdr')

  return (
    <div className={`bg-white rounded-xl border transition-all ${expanded ? 'border-indigo-200 shadow-md' : 'border-gray-200'}`}>
      <button onClick={onToggle} className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50/60 rounded-t-xl">
        <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-800">{org.name}</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Plan {org.plan} · {org.from_number || 'Aucun numéro par défaut'} · créé le {new Date(org.created_at).toLocaleDateString('fr-FR')}</p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <StatInline label="Admins" value={admins.length} color="#0ea5e9" />
          <StatInline label="Managers" value={managers.length} color="#8b5cf6" />
          <StatInline label="SDRs" value={sdrs.length} color="#059669" />
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${org.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
            {org.is_active ? 'Actif' : 'Inactif'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={onInviteAdmin}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700">
              + Inviter un admin
            </button>
            <button onClick={onToggleActive}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border ${org.is_active ? 'border-amber-200 text-amber-600 hover:bg-amber-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
              {org.is_active ? 'Désactiver l\'organisation' : 'Réactiver l\'organisation'}
            </button>
            <button onClick={onDeleteOrg}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-amber-200 text-amber-700 hover:bg-amber-50">
              Archiver l'organisation
            </button>
          </div>

          {members.length === 0 ? (
            <p className="text-[12px] text-gray-400 py-4 text-center">Aucun membre. Commencez par inviter le premier admin.</p>
          ) : (
            <div className="space-y-3">
              <RoleGroup label="Administrateurs" color="#0ea5e9" members={admins} meId={meId} onRoleChange={onRoleChange} onTeamAction={onTeamAction} />
              <RoleGroup label="Managers" color="#8b5cf6" members={managers} meId={meId} onRoleChange={onRoleChange} onTeamAction={onTeamAction} />
              <RoleGroup label="SDRs" color="#059669" members={sdrs} meId={meId} onRoleChange={onRoleChange} onTeamAction={onTeamAction} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RoleGroup({ label, color, members, meId, onRoleChange, onTeamAction }: {
  label: string; color: string
  members: MemberRow[]; meId: string
  onRoleChange: (userId: string, newRole: Role) => void
  onTeamAction: (userId: string, action: string) => void
}) {
  if (members.length === 0) return null
  return (
    <div className="pl-5 border-l-2" style={{ borderColor: color + '40' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
        <span className="text-[11px] text-gray-400">· {members.length}</span>
      </div>
      <div className="space-y-1.5">
        {members.map(m => (
          <MemberLine key={m.id} m={m} color={color} isMe={m.id === meId}
            onRoleChange={onRoleChange} onTeamAction={onTeamAction} />
        ))}
      </div>
    </div>
  )
}

function MemberLine({ m, color, isMe, onRoleChange, onTeamAction }: {
  m: MemberRow; color: string; isMe: boolean
  onRoleChange: (userId: string, newRole: Role) => void
  onTeamAction: (userId: string, action: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const status = m.deactivated_at ? 'suspended' : (m.last_seen_at ? 'active' : 'pending')
  const statusColor = status === 'active' ? '#059669' : status === 'pending' ? '#f97316' : '#dc2626'
  const statusLabel = status === 'active' ? 'Actif' : status === 'pending' ? 'Invitation' : 'Suspendu'

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50/60 border border-gray-100 ${m.deactivated_at ? 'opacity-60' : ''}`}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
        style={{ background: color + '22', color }}>
        {(m.full_name || m.email).charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-gray-800 truncate">{m.full_name || m.email.split('@')[0]}{isMe && <span className="ml-2 text-[10px] text-gray-400">(vous)</span>}</p>
        <p className="text-[11px] text-gray-400 truncate">{m.email}</p>
      </div>
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0" style={{ background: statusColor + '18', color: statusColor }}>
        {statusLabel}
      </span>
      <select value={m.role} onChange={e => onRoleChange(m.id, e.target.value as Role)}
        disabled={isMe}
        className="px-2 py-1 rounded-md text-[11px] font-medium border bg-white cursor-pointer flex-shrink-0 disabled:opacity-50">
        <option value="admin">Admin</option>
        <option value="manager">Manager</option>
        <option value="sdr">SDR</option>
      </select>
      {!isMe && (
        <div className="relative flex-shrink-0">
          <button onClick={() => setMenuOpen(v => !v)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" /></svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg border border-gray-200 shadow-lg py-1 min-w-[180px]">
                {status === 'pending' && (
                  <>
                    <MenuItem onClick={() => { setMenuOpen(false); onTeamAction(m.id, 'resend_invite') }}>Renvoyer l'invitation</MenuItem>
                    <MenuItem danger onClick={() => { setMenuOpen(false); if (confirm(`Annuler l'invitation de ${m.email} ?`)) onTeamAction(m.id, 'cancel_invite') }}>Annuler l'invitation</MenuItem>
                  </>
                )}
                {status !== 'pending' && (
                  <MenuItem onClick={() => { setMenuOpen(false); onTeamAction(m.id, 'toggle_status') }}>
                    {m.deactivated_at ? 'Réactiver' : 'Suspendre'}
                  </MenuItem>
                )}
                <MenuItem danger onClick={() => { setMenuOpen(false); if (confirm(`Supprimer définitivement ${m.email} ?`)) onTeamAction(m.id, 'delete_user') }}>Supprimer</MenuItem>
              </div>
            </>
          )}
        </div>
      )}
    </div>
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

function StatInline({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-right">
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-base font-extrabold" style={{ color }}>{value}</p>
    </div>
  )
}

// ── CreateOrgModal ───────────────────────────────────────────────
function CreateOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { profile: me } = useAuth()
  const [name, setName] = useState('')
  const [plan, setPlan] = useState<'starter' | 'growth' | 'scale'>('growth')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) { setErr('Nom requis'); return }
    setSaving(true)
    try {
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const { data, error } = await supabase.from('organisations')
        .insert({ name: name.trim(), slug, plan, is_active: true })
        .select('id').single()
      if (error) throw new Error(error.message)
      // Le super_admin est opérationnel dans l'org qu'il crée : il garde son rôle
      // super_admin et devient aussi utilisateur actif de cette org (peut appeler, créer listes, CRM…).
      if (me?.id && data?.id && !me.organisation_id) {
        const { error: attachErr } = await supabase.from('profiles')
          .update({ organisation_id: data.id }).eq('id', me.id)
        if (attachErr) throw new Error('Org créée mais activation compte échouée : ' + attachErr.message)
      }
      onCreated()
    } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
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
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Cabinet Dupont & Associés" autoFocus
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
            {saving ? 'Création...' : 'Créer l\'organisation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── InviteAdminModal (Super Admin invite le 1er admin d'une org) ──
function InviteAdminModal({ org, onClose, onInvited, onError }: {
  org: OrgRow
  onClose: () => void
  onInvited: (email: string) => void
  onError: (msg: string) => void
}) {
  const [email, setEmail] = useState('')
  const [expiresInHours, setExpiresInHours] = useState(72)
  const [inviting, setInviting] = useState(false)

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
          role: 'admin',
          call_license: 'none',
          assigned_phones: [],
          work_hours_start: '09:00',
          work_hours_end: '18:00',
          max_calls_per_day: 0,
          expires_in_hours: expiresInHours,
          target_organisation_id: org.id,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { onError(body?.error || `Erreur ${res.status}`); return }
      onInvited(email.trim().toLowerCase())
    } catch (e) { onError((e as Error).message) } finally { setInviting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Inviter un admin</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">pour {org.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@exemple.fr" autoFocus
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Validité du lien</label>
            <select value={expiresInHours} onChange={e => setExpiresInHours(parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
              <option value={1}>1 heure (urgence)</option>
              <option value={6}>6 heures</option>
              <option value={12}>12 heures</option>
              <option value={24}>24 heures</option>
              <option value={72}>3 jours (par défaut)</option>
              <option value={168}>1 semaine</option>
              <option value={720}>1 mois</option>
              <option value={0}>Pas de délai (illimité)</option>
            </select>
          </div>
          <p className="text-[11px] text-gray-400">L'admin pourra ensuite inviter sa propre équipe une fois connecté.</p>
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={inviting} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Annuler</button>
          <button onClick={submit} disabled={inviting || !email.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
            {inviting ? 'Envoi...' : 'Envoyer l\'invitation'}
          </button>
        </div>
      </div>
    </div>
  )
}
