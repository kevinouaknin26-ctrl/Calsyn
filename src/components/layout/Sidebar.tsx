/**
 * Sidebar — Style Minari : icônes seulement, étroite (~60px), fond gris foncé.
 */

import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'

const NAV = [
  { to: '/app/dialer', icon: '☎️', label: 'Dialer' },
  { to: '/app/history', icon: '📋', label: 'Historique' },
  { to: '/app/dashboard', icon: '📊', label: 'Dashboard', admin: true },
  { to: '/app/team', icon: '👥', label: 'Equipe', admin: true },
  { to: '/app/settings', icon: '⚙️', label: 'Reglages' },
]

export default function Sidebar() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()

  return (
    <aside className="fixed left-0 top-0 w-[60px] h-screen bg-[#1a1a2e] flex flex-col items-center py-5 z-50">
      {/* Logo */}
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-extrabold mb-8">
        C
      </div>

      {/* Nav icons */}
      <nav className="flex-1 flex flex-col items-center gap-1">
        {NAV.filter(n => !n.admin || isAdmin).map(n => (
          <NavLink key={n.to} to={n.to} title={n.label} className={({ isActive }) =>
            `w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all
             ${isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`
          }>
            {n.icon}
          </NavLink>
        ))}
      </nav>

      {/* User avatar + logout */}
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
          {(profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase()}
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); navigate('/login') }}
          title="Deconnexion"
          className="text-white/30 hover:text-red-400 text-sm transition-colors"
        >
          ⏻
        </button>
      </div>
    </aside>
  )
}
