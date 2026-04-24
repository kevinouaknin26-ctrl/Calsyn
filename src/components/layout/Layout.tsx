import { useState, type ReactNode } from 'react'
import Sidebar from './Sidebar'
import CallBar from '@/components/call/CallBar'
import { CallBarVisibilityContext } from './CallBarVisibilityContext'
import { SidebarContext } from './SidebarContext'

export default function Layout({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const [hideGlobal, setHideGlobal] = useState(false)
  return (
    <SidebarContext.Provider value={{ expanded, setExpanded }}>
      <CallBarVisibilityContext.Provider value={{ hideGlobal, setHideGlobal }}>
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-page)' }}>
          <Sidebar />
          <main className={`${expanded ? 'ml-[200px]' : 'ml-[48px]'} flex-1 h-screen overflow-hidden transition-all duration-200 relative`}>{children}</main>
        </div>
        <CallBar hidden={hideGlobal} />
      </CallBarVisibilityContext.Provider>
    </SidebarContext.Provider>
  )
}
