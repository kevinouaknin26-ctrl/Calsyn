/**
 * Dashboard — Stats equipe, style Minari, francais.
 */

import { useCalls } from '@/hooks/useCalls'
import { useRealtimeCalls } from '@/hooks/useRealtime'

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-3xl font-extrabold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { data: calls, isLoading } = useCalls(500)
  useRealtimeCalls()

  const total = calls?.length || 0
  const connected = calls?.filter(c => c.call_outcome === 'connected' || c.call_outcome === 'rdv').length || 0
  const rdv = calls?.filter(c => c.call_outcome === 'rdv' || c.meeting_booked).length || 0
  const avgScore = calls?.filter(c => c.ai_score_global).reduce((sum, c) => sum + (c.ai_score_global || 0), 0) || 0
  const scoredCount = calls?.filter(c => c.ai_score_global).length || 0
  const avgScoreDisplay = scoredCount > 0 ? Math.round(avgScore / scoredCount) : '—'
  const connectRate = total > 0 ? Math.round((connected / total) * 100) : 0

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Tableau de bord</h1>

      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement...</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-8">
            <StatCard label="Total appels" value={total} color="#0ea5e9" />
            <StatCard label="Connectes" value={connected} sub={`${connectRate}% taux`} color="#059669" />
            <StatCard label="RDV pris" value={rdv} color="#8b5cf6" />
            <StatCard label="Score IA moyen" value={avgScoreDisplay} sub={scoredCount > 0 ? `sur ${scoredCount} appels` : undefined} color="#f59e0b" />
          </div>

          {total === 0 && (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
              <p className="text-4xl mb-4">📊</p>
              <p className="text-sm font-semibold text-gray-700">Pas encore de donnees</p>
              <p className="text-xs text-gray-400 mt-1">Les stats apparaitront apres les premiers appels</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
