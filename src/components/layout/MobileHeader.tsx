/**
 * MobileHeader — Header mobile avec titre contextuel + avatar.
 *
 * Affiché uniquement sur mobile (<768px). Donne du contexte à l'user
 * (sur quelle page il est) et un accès rapide au profil/menu via tap.
 *
 * Respecte la safe-area-inset-top (notch iPhone).
 */

import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useSidebar } from './SidebarContext'

const PAGE_TITLES: Record<string, string> = {
  '/app/dialer': 'Dialer',
  '/app/contacts': 'Contacts',
  '/app/messagerie': 'Messagerie',
  '/app/calendar': 'Agenda',
  '/app/dashboard': 'Tableau de bord',
  '/app/notifications': 'Notifications',
  '/app/enrichissement': 'Enrichissement',
  '/app/team': 'Équipe',
  '/app/settings': 'Paramètres',
  '/app/super-admin': 'Clients Calsyn',
  '/app/history': 'Historique',
}

function getPageTitle(pathname: string): string {
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(path)) return title
  }
  return 'Calsyn'
}

export default function MobileHeader() {
  const { profile } = useAuth()
  const { setExpanded } = useSidebar()
  const location = useLocation()
  const navigate = useNavigate()

  if (!profile || !location.pathname.startsWith('/app/')) return null

  const title = getPageTitle(location.pathname)
  const initial = (profile.full_name || profile.email || '?')[0].toUpperCase()

  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white/90 dark:bg-[#f0eaf5]/90 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-3"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        paddingBottom: 8,
      }}
    >
      {/* Logo + titre */}
      <button
        onClick={() => navigate('/app/dialer')}
        className="flex items-center gap-2 active:scale-95 transition-transform"
      >
        <img src="/favicon.svg" alt="Calsyn" className="w-7 h-7" />
        <span className="text-[15px] font-bold text-gray-800">{title}</span>
      </button>

      {/* Avatar → ouvre sidebar (Plus) */}
      <button
        onClick={() => setExpanded(true)}
        aria-label="Menu"
        className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-white text-[13px] font-bold flex items-center justify-center shadow-sm active:scale-95 transition-transform"
      >
        {initial}
      </button>
    </header>
  )
}
