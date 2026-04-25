import { useState, type ReactNode } from 'react'
import Sidebar from './Sidebar'
import StagingBanner from './StagingBanner'
import CallBar from '@/components/call/CallBar'
import ChatDock from '@/components/messagerie/ChatDock'
import MessagingNotifier from '@/components/messagerie/MessagingNotifier'
import { ChatDockProvider } from '@/contexts/ChatDockContext'
import { CallBarVisibilityContext } from './CallBarVisibilityContext'
import { SidebarContext } from './SidebarContext'

export default function Layout({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const [hideGlobal, setHideGlobal] = useState(false)
  const isStaging = import.meta.env.VITE_APP_ENV === 'staging'
  const bannerOffset = isStaging ? 24 : 0
  return (
    <SidebarContext.Provider value={{ expanded, setExpanded }}>
      <CallBarVisibilityContext.Provider value={{ hideGlobal, setHideGlobal }}>
        <ChatDockProvider>
          <StagingBanner />
          <div
            className="flex h-screen overflow-hidden"
            style={{ background: 'var(--bg-page)', paddingTop: bannerOffset }}
          >
            <Sidebar />
            <main className={`${expanded ? 'ml-[200px]' : 'ml-[48px]'} flex-1 h-full overflow-hidden transition-all duration-200 relative`}>{children}</main>
          </div>
          <CallBar hidden={hideGlobal} />
          <ChatDock />
          <MessagingNotifier />
        </ChatDockProvider>
      </CallBarVisibilityContext.Provider>
    </SidebarContext.Provider>
  )
}
