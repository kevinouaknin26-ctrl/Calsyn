/**
 * Dashboard — Stats equipe (admin/manager only).
 */

import { useTheme } from '@/hooks/useTheme'
import { useCalls } from '@/hooks/useCalls'
import { useRealtimeCalls } from '@/hooks/useRealtime'

function StatCard({ label, value, sub, color, isDark }: {
  label: string; value: string | number; sub?: string; color: string; isDark: boolean
}) {
  const card = isDark ? 'bg-[#1c1c1e] border-white/[0.08]' : 'bg-white border-black/[0.06]'
  return (
    <div className={`rounded-2xl border p-5 ${card}`}>
      <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider mb-2">{label}</p>
      <p className="text-3xl font-extrabold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-[#86868b] mt-1">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { isDark } = useTheme()
  const { data: calls, isLoading } = useCalls(500)
  useRealtimeCalls()

  const bg = isDark ? 'bg-black' : 'bg-[#f5f5f7]'
  const text = isDark ? 'text-white' : 'text-gray-900'

  const total = calls?.length || 0
  const connected = calls?.filter(c => c.call_outcome === 'connected' || c.call_outcome === 'rdv').length || 0
  const rdv = calls?.filter(c => c.call_outcome === 'rdv' || c.meeting_booked).length || 0
  const avgScore = calls?.filter(c => c.ai_score_global).reduce((sum, c) => sum + (c.ai_score_global || 0), 0) || 0
  const scoredCount = calls?.filter(c => c.ai_score_global).length || 0
  const avgScoreDisplay = scoredCount > 0 ? Math.round(avgScore / scoredCount) : '—'
  const connectRate = total > 0 ? Math.round((connected / total) * 100) : 0

  return (
    <div className={`min-h-screen ${bg} p-6 transition-colors`}>
      <h1 className={`text-2xl font-extrabold tracking-tight mb-6 ${text}`}>Dashboard</h1>

      {isLoading ? (
        <p className="text-sm text-[#86868b]">Chargement...</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-8">
            <StatCard label="Appels" value={total} color="#2997ff" isDark={isDark} />
            <StatCard label="Connectes" value={connected} sub={`${connectRate}% taux`} color="#30d158" isDark={isDark} />
            <StatCard label="RDV" value={rdv} color="#bf5af2" isDark={isDark} />
            <StatCard label="Score IA moyen" value={avgScoreDisplay} sub={scoredCount > 0 ? `sur ${scoredCount} appels` : undefined} color="#ff9f0a" isDark={isDark} />
          </div>

          {total === 0 && (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">📊</p>
              <p className={`text-sm font-bold ${text}`}>Pas encore de donnees</p>
              <p className="text-xs text-[#86868b] mt-1">Les stats apparaitront apres les premiers appels</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
