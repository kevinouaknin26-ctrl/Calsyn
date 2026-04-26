import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/global.css'
import App from './App'
import { initSentry } from '@/lib/sentry'

declare const __BUILD_SHA__: string
declare const __BUILD_TIME__: string
console.log(
  `%c🚀 Calsyn build %c${__BUILD_SHA__}%c — ${__BUILD_TIME__}`,
  'color:#7c3aed;font-weight:bold',
  'color:#16a34a;font-weight:bold',
  'color:#6b7280',
)

// Init Sentry AVANT le render React (pour capturer les erreurs au mount)
initSentry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
