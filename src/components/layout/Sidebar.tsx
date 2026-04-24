/**
 * Sidebar — Copie Minari exact avec sous-navigation Settings.
 */

import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useSidebar } from './SidebarContext'
import { useTheme } from '@/hooks/useTheme'

const SETTINGS_SUBNAV = [
  { label: 'Champs contact', path: '/app/settings/contact-fields' },
  { label: 'Dispositions appel', path: '/app/settings/dispositions' },
  { label: 'Champs telephone', path: '/app/settings/phone-fields' },
  { label: 'Mapping champs', path: '/app/settings/field-mapping' },
  { label: 'Appels entrants', path: '/app/settings/incoming-calls' },
  { label: 'Statuts prospect', path: '/app/settings/lead-statuses' },
  { label: 'Connexions CRM', path: '/app/settings/crm' },
  { label: 'Numeros de telephone', path: '/app/settings/phone-numbers' },
]

const ACCOUNT_SUBNAV = [
  { label: 'Utilisateurs', path: '/app/settings/users' },
  { label: 'Facturation', path: '/app/settings/billing' },
  { label: 'Integrations', path: '/app/settings/integrations' },
]

export default function Sidebar() {
  const { profile, isAdmin, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { expanded, setExpanded } = useSidebar()
  const { dark, toggle: toggleTheme } = useTheme()
  const isSettingsActive = location.pathname.startsWith('/app/settings')

  const w = expanded ? 'w-[200px]' : 'w-[48px]'

  function NavItem({ to, icon, label, green }: { to: string; icon: JSX.Element; label: string; green?: boolean }) {
    return (
      <NavLink to={to} title={label} className={({ isActive }) =>
        `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${
          isActive ? (green ? 'bg-violet-50 text-violet-600' : 'bg-gray-200/60 text-gray-800') : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        } ${expanded ? '' : 'w-9 justify-center'}`}>
        <span className="flex-shrink-0">{icon}</span>
        {expanded && <span className="text-[13px]">{label}</span>}
      </NavLink>
    )
  }

  return (
    <>
      <aside className={`fixed left-0 top-0 ${w} h-screen flex flex-col py-3 z-50 transition-all duration-200`} style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}>

        {/* Top : expand + logo */}
        <div className={`flex items-center ${expanded ? 'justify-between px-3' : 'justify-center'} mb-4`}>
          <button onClick={() => setExpanded(!expanded)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className={`w-4 h-4 transition-transform ${expanded ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
            </svg>
          </button>
          {expanded && (
            <img src="/favicon.svg" alt="Calsyn" className="w-7 h-7" />
          )}
        </div>

        {/* Nav — Super Admin voit tous les onglets + "Clients Calsyn" en plus */}
        <nav className={`flex-1 flex flex-col ${expanded ? 'items-stretch px-2' : 'items-center'} gap-0.5`}>
          {isSuperAdmin && (
            <NavItem to="/app/super-admin" label="Clients Calsyn" green icon={<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m-1 4h1m-1 4h1m4-8h1m-1 4h1m-1 4h1" /></svg>} />
          )}
          <NavItem to="/app/contacts" label="Contacts" icon={<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>} />
          <NavItem to="/app/dialer" label="Dialer" green={!isSuperAdmin} icon={<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>} />
          <NavItem to="/app/calendar" label="Calendrier" icon={<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
          <NavItem to="/app/dashboard" label="Analytics" icon={<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} />
          <NavItem to="/app/history" label="Historique appels" icon={<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />

          <button className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            {expanded && <span className="text-[13px]">Historique SMS</span>}
          </button>
          <button className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            {expanded && <span className="text-[13px]">Enrichissement</span>}
          </button>
          <button className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            {expanded && <span className="text-[13px]">Notifications</span>}
          </button>

          <div className="flex-1" />

          {/* Équipe : Admin/Manager/Super Admin (tous ont accès à leur org) */}
          {isAdmin && (
            <NavLink to="/app/team" title="Équipe" className={({ isActive }) =>
              `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${isActive ? 'bg-gray-200/60 text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} ${expanded ? '' : 'w-9 justify-center'}`}>
              <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" /></svg>
              {expanded && <span className="text-[13px]">Équipe</span>}
            </NavLink>
          )}

          {/* Settings */}
          <NavLink to="/app/settings" title="Parametres" className={({ isActive }) =>
            `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${isActive ? 'bg-gray-200/60 text-gray-800 font-medium' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} ${expanded ? '' : 'w-9 justify-center'}`}>
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {expanded && <span className="text-[13px]">Parametres</span>}
          </NavLink>

          {/* Mode clair/sombre */}
          <button onClick={toggleTheme} title={dark ? 'Mode clair' : 'Mode sombre'}
            className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
            {dark ? (
              <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            ) : (
              <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
            )}
            {expanded && <span className="text-[13px]">{dark ? 'Mode clair' : 'Mode sombre'}</span>}
          </button>

          {/* Aide */}
          <button className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {expanded && <span className="text-[13px]">Aide</span>}
          </button>

          {/* Compte : dropdown cliquable avec options (Minari-style) */}
          <AccountMenu expanded={expanded} />
        </nav>
      </aside>

      {/* Sous-nav Settings retirée — Settings.tsx a sa propre nav interne */}
    </>
  )
}

// ── AccountMenu : avatar cliquable → dropdown (déconnexion, paramètres, etc.) ──
function AccountMenu({ expanded }: { expanded: boolean }) {
  const { profile, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const initial = (profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase()
  const roleLabel = profile?.role === 'super_admin' ? 'Super Admin' : profile?.role === 'admin' ? 'Admin' : profile?.role === 'manager' ? 'Manager' : 'SDR'

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className={`${expanded ? 'px-3 w-full' : 'w-9 justify-center'} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors`}
        title={expanded ? '' : profile?.email || 'Compte'}>
        <div className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-[8px] font-bold flex-shrink-0">
          {initial}
        </div>
        {expanded && (
          <>
            <span className="text-[13px] text-gray-600 truncate flex-1 text-left">{profile?.full_name || profile?.email?.split('@')[0] || 'Compte'}</span>
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute z-50 bg-white rounded-xl border border-gray-200 shadow-xl py-1 min-w-[240px] ${expanded ? 'left-0 bottom-full mb-1' : 'left-full bottom-0 ml-2'}`}>
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[13px] font-semibold text-gray-800 truncate">{profile?.full_name || 'Utilisateur'}</p>
              <p className="text-[11px] text-gray-400 truncate">{profile?.email}</p>
              <p className="text-[10px] font-bold mt-1 uppercase tracking-wider" style={{ color: profile?.role === 'super_admin' ? '#ef4444' : profile?.role === 'admin' ? '#0ea5e9' : profile?.role === 'manager' ? '#8b5cf6' : '#059669' }}>
                {roleLabel}
              </p>
            </div>
            <AccountMenuItem onClick={() => { setOpen(false); navigate(isSuperAdmin ? '/app/super-admin' : '/app/dialer') }} icon="home">
              {isSuperAdmin ? 'Clients Calsyn' : 'Tableau de bord'}
            </AccountMenuItem>
            {!isSuperAdmin && (
              <AccountMenuItem onClick={() => { setOpen(false); navigate('/app/settings') }} icon="settings">
                Paramètres du compte
              </AccountMenuItem>
            )}
            <AccountMenuItem onClick={() => { setOpen(false); navigate('/app/settings') }} icon="cog">
              {isSuperAdmin ? 'Paramètres système' : 'Préférences'}
            </AccountMenuItem>
            <div className="border-t border-gray-100 my-1" />
            <AccountMenuItem onClick={handleSignOut} icon="logout" danger>
              Se déconnecter
            </AccountMenuItem>
          </div>
        </>
      )}
    </div>
  )
}

function AccountMenuItem({ children, onClick, icon, danger }: { children: React.ReactNode; onClick: () => void; icon: 'home' | 'settings' | 'cog' | 'logout'; danger?: boolean }) {
  const iconPath = {
    home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    cog: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
    logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  }[icon]
  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-2 text-[13px] flex items-center gap-3 hover:bg-gray-50 ${danger ? 'text-red-600 hover:text-red-700' : 'text-gray-700 hover:text-gray-900'}`}>
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={iconPath} />
      </svg>
      {children}
    </button>
  )
}
