import { useState, useEffect, type ReactNode } from 'react'
import Sidebar from './Sidebar'
import StagingBanner from './StagingBanner'
import CallBar from '@/components/call/CallBar'
import ChatDock from '@/components/messagerie/ChatDock'
import MessagingDockBar from '@/components/messagerie/MessagingDockBar'
import MessagingNotifier from '@/components/messagerie/MessagingNotifier'
import { ChatDockProvider } from '@/contexts/ChatDockContext'
import { CallBarVisibilityContext } from './CallBarVisibilityContext'
import { SidebarContext } from './SidebarContext'

export default function Layout({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const [hideGlobal, setHideGlobal] = useState(false)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const isStaging = import.meta.env.VITE_APP_ENV === 'staging'
  const bannerOffset = isStaging ? 24 : 0

  // Marge gauche du main : 0 sur mobile (sidebar overlay), sinon 200/48 selon expanded
  const mainMargin = isMobile ? 'ml-0' : (expanded ? 'ml-[200px]' : 'ml-[48px]')

  return (
    <SidebarContext.Provider value={{ expanded, setExpanded }}>
      <CallBarVisibilityContext.Provider value={{ hideGlobal, setHideGlobal }}>
        <ChatDockProvider>
          <StagingBanner />

          {/* Burger button mobile (visible uniquement < 768px) */}
          {isMobile && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              aria-label="Ouvrir le menu"
              className="md:hidden fixed top-3 left-3 z-30 w-10 h-10 rounded-lg bg-white shadow-md border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-50"
              style={{ marginTop: bannerOffset }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          <div
            className="flex h-screen overflow-hidden"
            style={{ background: 'var(--bg-page)', paddingTop: bannerOffset }}
          >
            <Sidebar />
            <main className={`${mainMargin} flex-1 h-full overflow-hidden transition-all duration-200 relative`}>
              {children}
            </main>
          </div>
          <CallBar hidden={hideGlobal} />
          <ChatDock />
          <MessagingDockBar />
          <MessagingNotifier />
        </ChatDockProvider>
      </CallBarVisibilityContext.Provider>
    </SidebarContext.Provider>
  )
}
