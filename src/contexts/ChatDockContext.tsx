/**
 * ChatDockContext — état global des chats ouverts dans le dock flottant.
 * Persisté en localStorage. Accessible via useChatDock() depuis n'importe quel
 * composant (ProspectModal, CRMGlobal, notif click, etc.).
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

const MAX_OPEN = 4
const STORAGE_KEY = 'chat-dock-open-v1'

interface DockChat {
  prospectId: string
  minimized: boolean
}

interface ChatDockState {
  chats: DockChat[]
  openChat: (prospectId: string) => void
  closeChat: (prospectId: string) => void
  toggleMinimize: (prospectId: string) => void
}

const ChatDockContext = createContext<ChatDockState>({
  chats: [],
  openChat: () => {},
  closeChat: () => {},
  toggleMinimize: () => {},
})

export function ChatDockProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<DockChat[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)) } catch { /* */ }
  }, [chats])

  const openChat = useCallback((prospectId: string) => {
    setChats(prev => {
      // Si déjà ouvert : restore (un-minimize) et ramène devant
      const existing = prev.find(c => c.prospectId === prospectId)
      if (existing) {
        return [{ prospectId, minimized: false }, ...prev.filter(c => c.prospectId !== prospectId)]
      }
      // Sinon ajoute en tête, drop le plus ancien si > MAX_OPEN
      const next = [{ prospectId, minimized: false }, ...prev]
      return next.slice(0, MAX_OPEN)
    })
  }, [])

  const closeChat = useCallback((prospectId: string) => {
    setChats(prev => prev.filter(c => c.prospectId !== prospectId))
  }, [])

  const toggleMinimize = useCallback((prospectId: string) => {
    setChats(prev => prev.map(c => c.prospectId === prospectId ? { ...c, minimized: !c.minimized } : c))
  }, [])

  return (
    <ChatDockContext.Provider value={{ chats, openChat, closeChat, toggleMinimize }}>
      {children}
    </ChatDockContext.Provider>
  )
}

export const useChatDock = () => useContext(ChatDockContext)
