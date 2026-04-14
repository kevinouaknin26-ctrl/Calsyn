import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '@/config/supabase'
import { SESSION_CHECK_INTERVAL_MS, TOKEN_REFRESH_BUFFER_MS } from '@/config/constants'
import type { Profile, Organisation, Role } from '@/types/user'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  profile: Profile | null
  organisation: Organisation | null
  loading: boolean
  role: Role | null
  isSuperAdmin: boolean
  isAdmin: boolean
  isManager: boolean
  refreshOrganisation: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null, profile: null, organisation: null,
  loading: true, role: null, isSuperAdmin: false, isAdmin: false, isManager: false,
  refreshOrganisation: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [organisation, setOrganisation] = useState<Organisation | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    const { data: p } = await supabase
      .from('profiles')
      .select('id, organisation_id, email, full_name, role, is_active, assigned_phone, assigned_phones, call_license, deactivated_at, work_hours_start, work_hours_end, max_calls_per_day, last_seen_at, created_at')
      .eq('id', userId)
      .single()

    if (!p) { setLoading(false); return }
    setProfile(p as Profile)
    // Met à jour last_seen_at (fire-and-forget, utile pour la page Équipe)
    supabase.rpc('touch_last_seen').then(() => {})

    if (p.organisation_id) {
      const { data: org } = await supabase
        .from('organisations')
        .select('*')
        .eq('id', p.organisation_id)
        .single()
      if (org) setOrganisation(org as Organisation)
    }
    setLoading(false)
  }

  useEffect(() => {
    // Session initiale
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setUser(session.user); loadProfile(session.user.id) }
      else setLoading(false)
    })

    // Ecouter les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) loadProfile(u.id)
      else { setProfile(null); setOrganisation(null); setLoading(false) }
    })

    // Refresh preemptif de la session (R28)
    const interval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.expires_at) {
        const remaining = (session.expires_at * 1000) - Date.now()
        if (remaining < TOKEN_REFRESH_BUFFER_MS) {
          await supabase.auth.refreshSession()
        }
      }
    }, SESSION_CHECK_INTERVAL_MS)

    return () => { subscription.unsubscribe(); clearInterval(interval) }
  }, [])

  const role = profile?.role ?? null

  const refreshOrganisation = useCallback(async () => {
    if (!profile?.organisation_id) return
    const { data: org } = await supabase
      .from('organisations')
      .select('*')
      .eq('id', profile.organisation_id)
      .single()
    if (org) setOrganisation(org as Organisation)
  }, [profile?.organisation_id])

  // Auto-refresh org toutes les 10s pour synchro Settings ↔ Dialer
  useEffect(() => {
    if (!profile?.organisation_id) return
    const iv = setInterval(refreshOrganisation, 10000)
    return () => clearInterval(iv)
  }, [profile?.organisation_id, refreshOrganisation])

  return (
    <AuthContext.Provider value={{
      user, profile, organisation, loading, role,
      isSuperAdmin: role === 'super_admin',
      isAdmin: role === 'super_admin' || role === 'admin',
      isManager: role === 'super_admin' || role === 'admin' || role === 'manager',
      refreshOrganisation,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
