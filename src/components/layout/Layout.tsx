import { useState, useEffect, type ReactNode } from 'react'
import Sidebar from './Sidebar'
import StagingBanner from './StagingBanner'
import CallBar from '@/components/call/CallBar'
import ChatDock from '@/components/messagerie/ChatDock'
import MessagingDockBar from '@/components/messagerie/MessagingDockBar'
import MessagingNotifier from '@/components/messagerie/MessagingNotifier'
import MobileBottomNav from './MobileBottomNav'
import MobileHeader from './MobileHeader'
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

          {/* Header mobile (titre contextuel + avatar — remplace le burger) */}
          <MobileHeader />

          <div
            className="flex h-screen overflow-hidden"
            style={{ background: 'var(--bg-page)', paddingTop: bannerOffset }}
          >
            <Sidebar />
            <main
              className={`${mainMargin} flex-1 h-full overflow-hidden transition-all duration-200 relative`}
              style={isMobile ? {
                paddingTop: '48px',  // header height (h-12)
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 60px)',  // bottom nav + safe area
              } : undefined}
            >
              {children}
            </main>
          </div>

          {/* Bottom navigation mobile (style appli native) */}
          <MobileBottomNav />

          <CallBar hidden={hideGlobal} />
          <ChatDock />
          <MessagingDockBar />
          <MessagingNotifier />
        </ChatDockProvider>
      </CallBarVisibilityContext.Provider>
    </SidebarContext.Provider>
  )
}
