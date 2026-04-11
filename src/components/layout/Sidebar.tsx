/**
 * Sidebar — Copie Minari exact.
 * Bouton expand/collapse en haut (fleche).
 * Collapsed = 48px icones only. Expanded = 200px avec labels.
 */

import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useSidebar } from './Layout'

export default function Sidebar() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const { expanded, setExpanded } = useSidebar()

  const w = expanded ? 'w-[200px]' : 'w-[48px]'

  return (
    <aside className={`fixed left-0 top-0 ${w} h-screen bg-[#fafafa] border-r border-gray-200 flex flex-col items-center py-3 z-50 transition-all duration-200`}>

      {/* Bouton expand/collapse (Minari exact — fleche) */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 mb-4 self-center">
        <svg className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>

      {/* Nav */}
      <nav className={`flex-1 flex flex-col ${expanded ? 'items-stretch px-2' : 'items-center'} gap-0.5`}>

        {/* Recherche */}
        <NavLink to="/app/history" title="Recherche" className={({ isActive }) =>
          `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${isActive ? 'bg-gray-200/80 text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} ${expanded ? '' : 'w-9 justify-center'}`}>
          <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {expanded && <span className="text-[13px]">Recherche</span>}
        </NavLink>

        {/* Dialer (vert quand actif) */}
        <NavLink to="/app/dialer" title="Dialer" className={({ isActive }) =>
          `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${isActive ? 'bg-emerald-50 text-emerald-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} ${expanded ? '' : 'w-9 justify-center'}`}>
          <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          {expanded && <span className="text-[13px]">Dialer</span>}
        </NavLink>

        {/* Historique appels */}
        <NavLink to="/app/history" title="Historique" className={({ isActive }) =>
          `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${isActive ? 'bg-gray-200/80 text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} ${expanded ? '' : 'w-9 justify-center'}`}>
          <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {expanded && <span className="text-[13px]">Historique</span>}
        </NavLink>

        {/* Analytics */}
        <NavLink to="/app/dashboard" title="Tableau de bord" className={({ isActive }) =>
          `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${isActive ? 'bg-gray-200/80 text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} ${expanded ? '' : 'w-9 justify-center'}`}>
          <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          {expanded && <span className="text-[13px]">Analytics</span>}
        </NavLink>

        {/* Messages */}
        <button className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
          <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {expanded && <span className="text-[13px]">Messages</span>}
        </button>

        {/* Notifications */}
        <button className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
          <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {expanded && <span className="text-[13px]">Notifications</span>}
        </button>

        <div className="flex-1" />

        {/* Equipe */}
        {isAdmin && (
          <NavLink to="/app/team" title="Equipe" className={({ isActive }) =>
            `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${isActive ? 'bg-gray-200/80 text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} ${expanded ? '' : 'w-9 justify-center'}`}>
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
            </svg>
            {expanded && <span className="text-[13px]">Equipe</span>}
          </NavLink>
        )}

        {/* Parametres */}
        <NavLink to="/app/settings" title="Parametres" className={({ isActive }) =>
          `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${isActive ? 'bg-gray-200/80 text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} ${expanded ? '' : 'w-9 justify-center'}`}>
          <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {expanded && <span className="text-[13px]">Parametres</span>}
        </NavLink>

        {/* Aide */}
        <button className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
          <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {expanded && <span className="text-[13px]">Aide</span>}
        </button>
      </nav>

      {/* Avatar */}
      <div className={`flex ${expanded ? 'flex-row items-center gap-2 px-3 w-full' : 'flex-col items-center gap-2'} mt-2`}>
        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
          {(profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase()}
        </div>
        {expanded && <span className="text-[12px] text-gray-600 truncate">{profile?.full_name || profile?.email}</span>}
        <button onClick={async () => { await supabase.auth.signOut(); navigate('/login') }}
          title="Deconnexion" className={`text-gray-300 hover:text-red-400 transition-colors ${expanded ? 'ml-auto' : ''}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
