import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import Layout from '@/components/layout/Layout'
import Login from '@/pages/Login'
import AcceptInvite from '@/pages/AcceptInvite'
import Dialer from '@/pages/Dialer'
import History from '@/pages/History'
import CRMGlobal from '@/pages/CRMGlobal'
import Dashboard from '@/pages/Dashboard'
import Team from '@/pages/Team'
import Settings from '@/pages/Settings'
import Calendar from '@/pages/Calendar'
import SuperAdmin from '@/pages/SuperAdmin'
import type { ReactNode } from 'react'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2 } },
})

function Protected({ children, admin, superAdmin }: { children: ReactNode; admin?: boolean; superAdmin?: boolean }) {
  const { user, loading, isAdmin, isSuperAdmin } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
      <img src="/favicon.svg" alt="Calsyn" className="w-12 h-12" />
    </div>
  )

  if (!user) return <Navigate to="/login" replace />
  if (superAdmin && !isSuperAdmin) return <Navigate to="/app/dialer" replace />
  if (admin && !isAdmin) return <Navigate to="/app/dialer" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/app/super-admin" element={<Protected superAdmin><Layout><SuperAdmin /></Layout></Protected>} />
      <Route path="/app/dialer" element={<Protected><Layout><Dialer /></Layout></Protected>} />
      <Route path="/app/contacts" element={<Protected><Layout><CRMGlobal /></Layout></Protected>} />
      <Route path="/app/history" element={<Protected><Layout><History /></Layout></Protected>} />
      <Route path="/app/dashboard" element={<Protected admin><Layout><Dashboard /></Layout></Protected>} />
      <Route path="/app/team" element={<Protected admin><Layout><Team /></Layout></Protected>} />
      <Route path="/app/calendar" element={<Protected><Layout><Calendar /></Layout></Protected>} />
      <Route path="/app/settings" element={<Protected><Layout><Settings /></Layout></Protected>} />
      <Route path="*" element={<Navigate to="/app/dialer" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
