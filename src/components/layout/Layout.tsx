import { useState, createContext, useContext, type ReactNode } from 'react'
import Sidebar from './Sidebar'

const SidebarContext = createContext({ expanded: false, setExpanded: (_: boolean) => {} })
export const useSidebar = () => useContext(SidebarContext)

export default function Layout({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <SidebarContext.Provider value={{ expanded, setExpanded }}>
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-page)' }}>
        <Sidebar />
        <main className={`${expanded ? 'ml-[200px]' : 'ml-[48px]'} flex-1 h-screen overflow-hidden transition-all duration-200 relative`}>{children}</main>
      </div>
    </SidebarContext.Provider>
  )
}
