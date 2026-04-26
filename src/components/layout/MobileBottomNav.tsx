/**
 * MobileBottomNav — Navigation par tabs en bas de l'écran (style iOS/Android).
 *
 * Affiché uniquement sur mobile (<768px). Remplace la sidebar latérale.
 * 5 tabs principaux + un onglet "Plus" qui ouvre la sidebar overlay pour
 * les pages secondaires (Settings, Team, Enrichissement, Notifications).
 *
 * Respecte la safe-area-inset-bottom (notch + home indicator iPhone).
 */

import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useSidebar } from './SidebarContext'
import { useTotalUnread } from '@/hooks/useMessaging'

interface TabConfig {
  to: string
  label: string
  icon: JSX.Element
  unreadHook?: () => number  // Hook pour afficher un badge unread
}

const TABS: TabConfig[] = [
  {
    to: '/app/dialer',
    label: 'Dialer',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
  {
    to: '/app/contacts',
    label: 'Contacts',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    to: '/app/messagerie',
    label: 'Messages',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    unreadHook: useTotalUnread,
  },
  {
    to: '/app/calendar',
    label: 'Agenda',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
]

export default function MobileBottomNav() {
  const { profile } = useAuth()
  const { setExpanded } = useSidebar()
  const location = useLocation()

  // Sur les pages d'auth (login, reset-password, accept-invite), pas de bottom nav
  if (!profile || !location.pathname.startsWith('/app/')) return null

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-[#f0eaf5] border-t border-gray-200 flex items-stretch justify-around"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -2px 12px -4px rgba(0,0,0,0.08)',
      }}
    >
      {TABS.map(tab => (
        <TabItem key={tab.to} tab={tab} />
      ))}

      {/* "Plus" → ouvre la sidebar overlay pour les pages secondaires */}
      <button
        onClick={() => setExpanded(true)}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-gray-500 hover:text-indigo-600 active:bg-gray-50 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
        <span className="text-[10px] font-medium">Plus</span>
      </button>
    </nav>
  )
}

function TabItem({ tab }: { tab: TabConfig }) {
  const unread = tab.unreadHook?.() || 0
  return (
    <NavLink
      to={tab.to}
      className={({ isActive }) =>
        `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-all relative active:bg-gray-50 ${
          isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* Indicateur actif (barre violette en haut) */}
          {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-indigo-600" />}
          <div className="relative">
            <div className={isActive ? 'scale-110 transition-transform' : ''}>{tab.icon}</div>
            {unread > 0 && (
              <span className="absolute -top-1 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
          <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
        </>
      )}
    </NavLink>
  )
}
