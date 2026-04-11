/**
 * Sidebar — Copie Minari exact (frame 001/002).
 * ~48px, fond gris fonce, icones outline fines.
 * Active = fond plus clair. Telephone vert quand actif.
 */

import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'

export default function Sidebar() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()

  return (
    <aside className="fixed left-0 top-0 w-[48px] h-screen bg-[#3a3a3a] flex flex-col items-center py-4 z-50">
      {/* Grid icon (dashboard) */}
      <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 mb-6">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      </button>

      {/* Nav */}
      <nav className="flex-1 flex flex-col items-center gap-1">
        {/* Search */}
        <NavLink to="/app/history" title="Search" className={({ isActive }) =>
          `w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isActive ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </NavLink>

        {/* Phone (dialer) — vert quand actif */}
        <NavLink to="/app/dialer" title="Dialer" className={({ isActive }) =>
          `w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isActive ? 'bg-emerald-600/20 text-emerald-400' : 'text-white/40 hover:text-white/70'}`}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </NavLink>

        {/* Calendar */}
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70">
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>

        {/* Contacts / list */}
        <NavLink to="/app/dashboard" title="Dashboard" className={({ isActive }) =>
          `w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isActive ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </NavLink>

        {/* Users */}
        {isAdmin && (
          <NavLink to="/app/team" title="Team" className={({ isActive }) =>
            `w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isActive ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}>
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
            </svg>
          </NavLink>
        )}

        {/* Settings */}
        <NavLink to="/app/settings" title="Settings" className={({ isActive }) =>
          `w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isActive ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </NavLink>

        {/* Notifications */}
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70">
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        {/* Help */}
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70">
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </nav>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-white/10 text-white/60 flex items-center justify-center text-[10px] font-bold">
          {(profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase()}
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); navigate('/login') }}
          title="Deconnexion" className="text-white/20 hover:text-red-400 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
