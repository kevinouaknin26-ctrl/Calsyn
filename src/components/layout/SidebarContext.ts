import { createContext, useContext } from 'react'

/**
 * Contexte d'état de la sidebar (collapsed / expanded). Vit dans un fichier
 * dédié pour éviter un import cycle (Layout → Sidebar, et Sidebar importait
 * `useSidebar` depuis Layout).
 */
export const SidebarContext = createContext({
  expanded: false,
  setExpanded: (_: boolean) => {},
})

export const useSidebar = () => useContext(SidebarContext)
