/**
 * Sidebar — Copie Minari exact avec sous-navigation Settings.
 */

import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useSidebar } from './Layout'

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
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { expanded, setExpanded } = useSidebar()
  const isSettingsActive = location.pathname.startsWith('/app/settings')

  const w = expanded ? 'w-[200px]' : 'w-[48px]'

  function NavItem({ to, icon, label, green }: { to: string; icon: JSX.Element; label: string; green?: boolean }) {
    return (
      <NavLink to={to} title={label} className={({ isActive }) =>
        `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${
          isActive ? (green ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-200/60 text-gray-800') : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        } ${expanded ? '' : 'w-9 justify-center'}`}>
        <span className="flex-shrink-0">{icon}</span>
        {expanded && <span className="text-[13px]">{label}</span>}
      </NavLink>
    )
  }

  return (
    <>
      <aside className={`fixed left-0 top-0 ${w} h-screen bg-[#fafafa] border-r border-gray-200 flex flex-col py-3 z-50 transition-all duration-200`}>

        {/* Top : expand + logo */}
        <div className={`flex items-center ${expanded ? 'justify-between px-3' : 'justify-center'} mb-4`}>
          <button onClick={() => setExpanded(!expanded)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className={`w-4 h-4 transition-transform ${expanded ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
            </svg>
          </button>
          {expanded && (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" /></svg>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className={`flex-1 flex flex-col ${expanded ? 'items-stretch px-2' : 'items-center'} gap-0.5`}>
          <NavItem to="/app/history" label="Recherche" icon={<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>} />
          <NavItem to="/app/dialer" label="Dialer" green icon={<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>} />
          <NavItem to="/app/dashboard" label="Analytics" icon={<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} />
          <NavItem to="/app/call-history" label="Historique appels" icon={<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />

          {/* SMS history */}
          <button className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            {expanded && <span className="text-[13px]">Historique SMS</span>}
          </button>

          {/* Enrich */}
          <button className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            {expanded && <span className="text-[13px]">Enrichissement</span>}
          </button>

          {/* Notifications */}
          <button className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            {expanded && <span className="text-[13px]">Notifications</span>}
          </button>

          <div className="flex-1" />

          {/* Role (Super admin / Admin) */}
          {isAdmin && (
            <NavLink to="/app/team" title="Equipe" className={({ isActive }) =>
              `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${isActive ? 'bg-gray-200/60 text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} ${expanded ? '' : 'w-9 justify-center'}`}>
              <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" /></svg>
              {expanded && <span className="text-[13px]">{profile?.role === 'super_admin' ? 'Super admin' : 'Admin'}</span>}
            </NavLink>
          )}

          {/* Settings */}
          <NavLink to="/app/settings" title="Parametres" className={({ isActive }) =>
            `${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 transition-all ${isActive ? 'bg-gray-200/60 text-gray-800 font-medium' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} ${expanded ? '' : 'w-9 justify-center'}`}>
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {expanded && <span className="text-[13px]">Parametres</span>}
          </NavLink>

          {/* Aide */}
          <button className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${expanded ? '' : 'w-9 justify-center'}`}>
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {expanded && <span className="text-[13px]">Aide</span>}
          </button>

          {/* Compte */}
          <div className={`${expanded ? 'px-3' : ''} h-9 rounded-lg flex items-center gap-3 text-gray-400 ${expanded ? '' : 'w-9 justify-center'}`}>
            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[8px] font-bold flex-shrink-0">
              {(profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase()}
            </div>
            {expanded && (
              <>
                <span className="text-[13px] text-gray-600 truncate">{profile?.full_name || 'Callio'}</span>
                <button onClick={async () => { await supabase.auth.signOut(); navigate('/login') }}
                  className="ml-auto text-gray-300 hover:text-red-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
              </>
            )}
          </div>
        </nav>
      </aside>

      {/* ── Sous-navigation Settings (Minari exact — deuxieme panneau) ── */}
      {isSettingsActive && expanded && (
        <div className="fixed left-[200px] top-0 w-[220px] h-screen bg-white border-r border-gray-200 py-5 px-4 z-40 overflow-y-auto">
          <h3 className="text-[15px] font-bold text-gray-800 mb-4">Parametres</h3>
          <div className="space-y-0.5">
            {SETTINGS_SUBNAV.map(item => (
              <NavLink key={item.path} to={item.path}
                className={({ isActive }) => `block px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  isActive ? 'bg-gray-100 text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>{item.label}</NavLink>
            ))}
          </div>
          <h4 className="text-[13px] font-bold text-gray-800 mt-6 mb-2">Parametres du compte</h4>
          <div className="space-y-0.5">
            {ACCOUNT_SUBNAV.map(item => (
              <NavLink key={item.path} to={item.path}
                className={({ isActive }) => `block px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  isActive ? 'bg-gray-100 text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>{item.label}</NavLink>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
