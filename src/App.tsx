import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import Layout from '@/components/layout/Layout'
import Login from '@/pages/Login'
import Dialer from '@/pages/Dialer'
import History from '@/pages/History'
import Dashboard from '@/pages/Dashboard'
import Team from '@/pages/Team'
import Settings from '@/pages/Settings'
import type { ReactNode } from 'react'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2 } },
})

function Protected({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading, isAdmin } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white">
        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" /></svg>
      </div>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />
  if (admin && !isAdmin) return <Navigate to="/app/dialer" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/app/dialer" element={<Protected><Layout><Dialer /></Layout></Protected>} />
      <Route path="/app/history" element={<Protected><Layout><History /></Layout></Protected>} />
      <Route path="/app/dashboard" element={<Protected admin><Layout><Dashboard /></Layout></Protected>} />
      <Route path="/app/team" element={<Protected admin><Layout><Team /></Layout></Protected>} />
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
