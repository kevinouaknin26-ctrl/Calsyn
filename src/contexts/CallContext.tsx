import { createContext, useContext, type ReactNode } from 'react'
import { useCallMachine } from '@/hooks/useCallMachine'

type CallMachine = ReturnType<typeof useCallMachine>

const CallContext = createContext<CallMachine | null>(null)

export function CallProvider({ children }: { children: ReactNode }) {
  // Une seule instance de la state machine + du provider Twilio pour toute l'app.
  const cm = useCallMachine()
  return <CallContext.Provider value={cm}>{children}</CallContext.Provider>
}

export function useCall(): CallMachine {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used within a <CallProvider>')
  return ctx
}
