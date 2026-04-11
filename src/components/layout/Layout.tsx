import { useState, createContext, useContext, type ReactNode } from 'react'
import Sidebar from './Sidebar'

const SidebarContext = createContext({ expanded: false, setExpanded: (_: boolean) => {} })
export const useSidebar = () => useContext(SidebarContext)

export default function Layout({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <SidebarContext.Provider value={{ expanded, setExpanded }}>
      <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
        <Sidebar />
        <main className={`${expanded ? 'ml-[200px]' : 'ml-[48px]'} flex-1 min-h-screen transition-all duration-200`}>{children}</main>
      </div>
    </SidebarContext.Provider>
  )
}
