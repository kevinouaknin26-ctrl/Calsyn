export default function StagingBanner() {
  if (import.meta.env.VITE_APP_ENV !== 'staging') return null
  return (
    <div
      className="fixed top-0 left-0 right-0 h-6 z-[9999] flex items-center justify-center bg-red-600 text-white text-[11px] font-bold tracking-[0.15em] uppercase select-none pointer-events-none"
      role="status"
      aria-live="polite"
    >
      STAGING — donnees de test, aucun impact production
    </div>
  )
}
