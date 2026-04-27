/**
 * MobileBottomNav — Navigation horizontale scrollable en bas (style appli native).
 *
 * Tous les onglets accessibles en swipant horizontalement. Snap CSS pour que
 * chaque tab se cale au scroll. Scroll-bar masquée. Indicateur actif visuel.
 *
 * Inspiré du tab bar Instagram / Discord / WhatsApp en mode "channels".
 */

import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTotalUnread } from '@/hooks/useMessaging'
import type { JSX } from 'react'

interface TabConfig {
  to: string
  label: string
  icon: JSX.Element
  unreadHook?: () => number
  adminOnly?: boolean
}

const ICON = (path: string) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
)

function buildTabs(unreadHook: () => number): TabConfig[] {
  return [
    {
      to: '/app/dialer',
      label: 'Dialer',
      icon: ICON('M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z'),
    },
    {
      to: '/app/contacts',
      label: 'Contacts',
      icon: ICON('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'),
    },
    {
      to: '/app/messagerie',
      label: 'Messages',
      icon: ICON('M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'),
      unreadHook,
    },
    {
      to: '/app/calendar',
      label: 'Agenda',
      icon: ICON('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'),
    },
    {
      to: '/app/dashboard',
      label: 'Dashboard',
      icon: ICON('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'),
    },
    {
      to: '/app/notifications',
      label: 'Notifs',
      icon: ICON('M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9'),
    },
    {
      to: '/app/history',
      label: 'Historique',
      icon: ICON('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'),
    },
    {
      to: '/app/enrichissement',
      label: 'Enrich',
      icon: ICON('M13 10V3L4 14h7v7l9-11h-7z'),
    },
    {
      to: '/app/team',
      label: 'Équipe',
      icon: ICON('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197'),
      adminOnly: true,
    },
    {
      to: '/app/settings',
      label: 'Réglages',
      icon: ICON('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'),
    },
  ]
}

export default function MobileBottomNav() {
  const { profile, isAdmin, isSuperAdmin } = useAuth()
  const unread = useTotalUnread()
  const location = useLocation()

  if (!profile || !location.pathname.startsWith('/app/')) return null

  const allTabs = buildTabs(() => unread)
  const tabs = allTabs.filter(t => !t.adminOnly || isAdmin || isSuperAdmin)

  return (
    <nav
      className="md:hidden fixed left-3 right-3 z-50 bg-white dark:bg-[#f0eaf5] border border-gray-200 dark:border-[#d4cade] rounded-2xl"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        boxShadow: '0 8px 24px -8px rgba(0,0,0,0.18), 0 2px 6px -2px rgba(0,0,0,0.08)',
      }}
    >
      <div
        className="flex items-stretch overflow-x-auto scrollbar-hide rounded-2xl"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tabs.map(tab => (
          <TabItem key={tab.to} tab={tab} />
        ))}
      </div>
    </nav>
  )
}

function TabItem({ tab }: { tab: TabConfig }) {
  const unread = tab.unreadHook?.() || 0
  return (
    <NavLink
      to={tab.to}
      className={({ isActive }) =>
        `flex-shrink-0 flex flex-col items-center justify-center gap-0.5 py-2 px-4 min-w-[72px] transition-all relative active:bg-gray-50 ${
          isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
        }`
      }
      style={{ scrollSnapAlign: 'center' }}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-indigo-600" />}
          <div className="relative">
            <div className={isActive ? 'scale-110 transition-transform' : ''}>{tab.icon}</div>
            {unread > 0 && (
              <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
          <span className={`text-[10px] whitespace-nowrap ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
        </>
      )}
    </NavLink>
  )
}
