/**
 * Dashboard — Tableau de bord équipe : stats, funnel, top SDRs, activité 30j.
 *
 * Pour admin/manager : vue agrégée de l'org (tous les SDRs).
 * Pour SDR : vue de ses propres appels (RLS gère naturellement).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useCalls } from '@/hooks/useCalls'
import { useAuth } from '@/hooks/useAuth'
import { useRealtimeCalls } from '@/hooks/useRealtime'
import type { Call } from '@/types/call'

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon?: string
}) {
  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-[14px]">{icon}</span>}
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function FunnelStep({ label, value, total, color }: {
  label: string; value: number; total: number; color: string
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  const widthPct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-gray-700">{label}</span>
        <span className="text-[12px] tabular-nums">
          <span className="font-bold text-gray-800">{value}</span>
          <span className="text-gray-400 ml-1.5">{pct}%</span>
        </span>
      </div>
      <div className="h-6 bg-gray-100 rounded-md overflow-hidden">
        <div className="h-full rounded-md transition-all" style={{ width: `${widthPct}%`, background: color }} />
      </div>
    </div>
  )
}

interface DailyBucket { date: string; label: string; calls: number; connected: number; rdv: number }

function ActivityChart({ buckets }: { buckets: DailyBucket[] }) {
  const max = Math.max(1, ...buckets.map(b => b.calls))
  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-bold text-gray-700">Activité (30 derniers jours)</h3>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-300" />Appels</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" />Connectés</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-600" />RDV</span>
        </div>
      </div>
      <div className="flex items-end gap-0.5 h-32">
        {buckets.map(b => {
          const callsH = (b.calls / max) * 100
          const connectedH = (b.connected / max) * 100
          const rdvH = (b.rdv / max) * 100
          return (
            <div key={b.date} className="flex-1 flex flex-col items-center justify-end group relative" title={`${b.label} : ${b.calls} appels, ${b.connected} connectés, ${b.rdv} RDV`}>
              <div className="w-full flex items-end gap-px h-full">
                <div className="flex-1 bg-indigo-300 rounded-t-sm hover:bg-indigo-400 transition-colors" style={{ height: `${callsH}%` }} />
                <div className="flex-1 bg-emerald-500 rounded-t-sm hover:bg-emerald-600 transition-colors" style={{ height: `${connectedH}%` }} />
                <div className="flex-1 bg-violet-600 rounded-t-sm hover:bg-violet-700 transition-colors" style={{ height: `${rdvH}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-[9px] text-gray-400">
        <span>{buckets[0]?.label}</span>
        <span>{buckets[Math.floor(buckets.length / 2)]?.label}</span>
        <span>{buckets[buckets.length - 1]?.label}</span>
      </div>
    </div>
  )
}

interface SdrRow { id: string; name: string; calls: number; connected: number; rdv: number; avgScore: number | null; talkSec: number }

function TopSdrsTable({ rows }: { rows: SdrRow[] }) {
  if (rows.length === 0) {
    return <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-6 text-center text-[12px] text-gray-400">Aucun SDR actif</div>
  }
  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <h3 className="text-[12px] font-bold text-gray-700">Performance par commercial</h3>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
            <th className="text-left px-4 py-2 font-bold">Commercial</th>
            <th className="text-right px-2 py-2 font-bold">Appels</th>
            <th className="text-right px-2 py-2 font-bold">Connectés</th>
            <th className="text-right px-2 py-2 font-bold">Taux</th>
            <th className="text-right px-2 py-2 font-bold">RDV</th>
            <th className="text-right px-2 py-2 font-bold">Temps parlé</th>
            <th className="text-right px-4 py-2 font-bold">Score IA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const rate = r.calls > 0 ? Math.round((r.connected / r.calls) * 100) : 0
            const talkM = Math.round(r.talkSec / 60)
            return (
              <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50 ${idx === 0 ? 'bg-amber-50/30' : ''}`}>
                <td className="px-4 py-2.5 flex items-center gap-2">
                  {idx === 0 && <span className="text-[12px]">🏆</span>}
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {r.name[0].toUpperCase()}
                  </div>
                  <span className="font-semibold text-gray-700 truncate">{r.name}</span>
                </td>
                <td className="text-right px-2 py-2.5 tabular-nums text-gray-700">{r.calls}</td>
                <td className="text-right px-2 py-2.5 tabular-nums text-emerald-700 font-semibold">{r.connected}</td>
                <td className="text-right px-2 py-2.5 tabular-nums text-gray-500">{rate}%</td>
                <td className="text-right px-2 py-2.5 tabular-nums text-violet-600 font-semibold">{r.rdv}</td>
                <td className="text-right px-2 py-2.5 tabular-nums text-gray-500">{talkM > 0 ? `${talkM} min` : '—'}</td>
                <td className="text-right px-4 py-2.5 tabular-nums">
                  {r.avgScore !== null ? (
                    <span className={`font-bold ${r.avgScore >= 70 ? 'text-emerald-600' : r.avgScore >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{r.avgScore}</span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HeatMap({ calls }: { calls: Call[] }) {
  // 7 jours × 24 heures, intensité = nombre d'appels
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0))
    for (const c of calls) {
      const d = new Date(c.created_at)
      const dow = (d.getDay() + 6) % 7 // lundi=0
      const hour = d.getHours()
      g[dow][hour]++
    }
    return g
  }, [calls])
  const max = Math.max(1, ...grid.flat())
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-4">
      <h3 className="text-[12px] font-bold text-gray-700 mb-3">Heures les plus actives</h3>
      <div className="overflow-x-auto">
        <table className="text-[9px]">
          <thead>
            <tr>
              <td className="w-8" />
              {Array.from({ length: 24 }, (_, h) => (
                <td key={h} className="text-center text-gray-400 px-px">{h % 2 === 0 ? h : ''}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, dowIdx) => (
              <tr key={dowIdx}>
                <td className="text-gray-500 font-semibold pr-2 text-right">{days[dowIdx]}</td>
                {row.map((count, h) => {
                  const intensity = count / max
                  const bg = count === 0 ? '#f3f4f6' : `rgba(124, 58, 237, ${0.15 + intensity * 0.85})`
                  return (
                    <td key={h} className="p-px">
                      <div className="w-4 h-4 rounded-sm" style={{ background: bg }} title={`${days[dowIdx]} ${h}h : ${count} appels`} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { isManager, organisation } = useAuth()
  const { data: calls, isLoading } = useCalls(2000)
  useRealtimeCalls()

  // Profiles pour la table top SDRs (admin only)
  const { data: profiles } = useQuery({
    queryKey: ['org-profiles', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data } = await supabase
        .from('profiles').select('id, full_name, email')
        .eq('organisation_id', organisation.id)
      return data || []
    },
    enabled: isManager && !!organisation?.id,
  })

  // ── Stats globales ──
  const stats = useMemo(() => {
    const all = calls || []
    const connected = all.filter(c => c.call_outcome === 'connected' || c.call_outcome === 'connected_incoming')
    const voicemails = all.filter(c => c.call_outcome === 'voicemail')
    const rdv = all.filter(c => c.meeting_booked)
    const scored = all.filter(c => c.ai_score_global)
    const avgScore = scored.length > 0
      ? Math.round(scored.reduce((s, c) => s + (c.ai_score_global || 0), 0) / scored.length)
      : null
    const talkTotalSec = connected.reduce((s, c) => s + (c.call_duration || 0), 0)
    return {
      total: all.length,
      connected: connected.length,
      voicemails: voicemails.length,
      rdv: rdv.length,
      avgScore,
      scoredCount: scored.length,
      talkTotalSec,
      connectRate: all.length > 0 ? Math.round((connected.length / all.length) * 100) : 0,
      rdvRate: connected.length > 0 ? Math.round((rdv.length / connected.length) * 100) : 0,
    }
  }, [calls])

  // ── Buckets activité 30j ──
  const buckets = useMemo<DailyBucket[]>(() => {
    const out: DailyBucket[] = []
    const now = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      const dayCalls = (calls || []).filter(c => {
        const t = new Date(c.created_at).getTime()
        return t >= d.getTime() && t < next.getTime()
      })
      out.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        calls: dayCalls.length,
        connected: dayCalls.filter(c => c.call_outcome === 'connected' || c.call_outcome === 'connected_incoming').length,
        rdv: dayCalls.filter(c => c.meeting_booked).length,
      })
    }
    return out
  }, [calls])

  // ── Top SDRs (admin only) ──
  const sdrRows = useMemo<SdrRow[]>(() => {
    if (!isManager || !calls || !profiles) return []
    const map = new Map<string, SdrRow>()
    for (const p of profiles) {
      map.set(p.id, { id: p.id, name: p.full_name || p.email || 'Sans nom', calls: 0, connected: 0, rdv: 0, avgScore: null, talkSec: 0 })
    }
    const scoreSum = new Map<string, { sum: number; count: number }>()
    for (const c of calls) {
      if (!c.sdr_id) continue
      const row = map.get(c.sdr_id)
      if (!row) continue
      row.calls++
      if (c.call_outcome === 'connected' || c.call_outcome === 'connected_incoming') {
        row.connected++
        row.talkSec += c.call_duration || 0
      }
      if (c.meeting_booked) row.rdv++
      if (c.ai_score_global) {
        const s = scoreSum.get(c.sdr_id) || { sum: 0, count: 0 }
        s.sum += c.ai_score_global
        s.count++
        scoreSum.set(c.sdr_id, s)
      }
    }
    for (const [id, s] of scoreSum) {
      const row = map.get(id)
      if (row && s.count > 0) row.avgScore = Math.round(s.sum / s.count)
    }
    return Array.from(map.values())
      .filter(r => r.calls > 0)
      .sort((a, b) => b.rdv - a.rdv || b.connected - a.connected || b.calls - a.calls)
  }, [calls, profiles, isManager])

  const formatHM = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.round((sec % 3600) / 60)
    return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m} min`
  }

  return (
    <div className="h-full bg-[#f8f9fa] dark:bg-[#e8e0f0] overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6 pb-12">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-800">Tableau de bord</h1>
          <span className="text-[11px] text-gray-400">{isManager ? 'Vue équipe' : 'Mes performances'}</span>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : stats.total === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade]">
            <p className="text-4xl mb-4">📊</p>
            <p className="text-sm font-semibold text-gray-700">Pas encore de données</p>
            <p className="text-xs text-gray-400 mt-1">Les stats apparaîtront après les premiers appels</p>
          </div>
        ) : (
          <>
            {/* ─── Stats principales ─── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <StatCard label="Total appels" value={stats.total} icon="📞" color="#0ea5e9" />
              <StatCard label="Connectés" value={stats.connected} sub={`${stats.connectRate}% taux`} icon="✅" color="#059669" />
              <StatCard label="Messageries" value={stats.voicemails} icon="📨" color="#f59e0b" />
              <StatCard label="RDV pris" value={stats.rdv} sub={`${stats.rdvRate}% / connectés`} icon="🎯" color="#8b5cf6" />
              <StatCard label="Score IA moyen" value={stats.avgScore ?? '—'} sub={stats.scoredCount > 0 ? `sur ${stats.scoredCount} appels` : undefined} icon="🤖" color="#ec4899" />
            </div>

            {/* ─── Funnel ─── */}
            <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-4 mb-6">
              <h3 className="text-[12px] font-bold text-gray-700 mb-3">Tunnel de conversion</h3>
              <div className="space-y-2.5">
                <FunnelStep label="Appels lancés" value={stats.total} total={stats.total} color="#a5b4fc" />
                <FunnelStep label="Connectés à un humain" value={stats.connected} total={stats.total} color="#10b981" />
                <FunnelStep label="RDV pris" value={stats.rdv} total={stats.total} color="#8b5cf6" />
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                Temps total parlé : <span className="font-bold text-gray-700">{formatHM(stats.talkTotalSec)}</span>
              </div>
            </div>

            {/* ─── Activité 30j ─── */}
            <div className="mb-6">
              <ActivityChart buckets={buckets} />
            </div>

            {/* ─── Top SDRs (admin) + HeatMap ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {isManager && (
                <div className="lg:col-span-2">
                  <TopSdrsTable rows={sdrRows} />
                </div>
              )}
              <div className={isManager ? '' : 'lg:col-span-3'}>
                <HeatMap calls={calls || []} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
