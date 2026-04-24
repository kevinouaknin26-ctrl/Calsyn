import { createContext, useContext } from 'react'

/**
 * Contexte global d'affichage de `CallBar`. Le Dialer le cache pendant une
 * session power active (sa barre locale prend le relais).
 *
 * ⚠ Ce contexte VIT dans un fichier dédié et pas dans `Layout.tsx` pour
 * éviter un import cycle (Layout importe CallBar, et Dialer rendered
 * ‹children› de Layout importait `useCallBarVisibility` depuis `Layout`).
 * Le cycle provoquait un `ReferenceError: Cannot access 'X' before
 * initialization` quand la state machine d'appel déclenchait un re-render
 * juste après `.connect()` Twilio → crash React → page blanche.
 */
export const CallBarVisibilityContext = createContext<{
  hideGlobal: boolean
  setHideGlobal: (v: boolean) => void
}>({
  hideGlobal: false,
  setHideGlobal: () => {},
})

export const useCallBarVisibility = () => useContext(CallBarVisibilityContext)
