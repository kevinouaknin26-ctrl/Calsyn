/**
 * Dashboard — Tableau de bord pro 2026.
 *
 * Layout :
 *  ┌─────────────────────────────────────────────────────────────┐
 *  │ Header + filtres (période + SDR)                            │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │ KPIs (8 cards avec trend % vs période précédente + spark)   │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │ Funnel  │  Activity chart (barres empilées)                 │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │ AI Insights (radar + intentions + objections)               │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │ Leaderboard SDRs (admin)                                    │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │ Pipeline donut │ Messaging │ HeatMap │ Activity feed        │
 *  └─────────────────────────────────────────────────────────────┘
 */

import { useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRealtimeCalls } from '@/hooks/useRealtime'
import {
  useDashboardData,
  buildDailyBuckets,
  buildKpiTrend,
  isConnected,
  rangeLabel,
  type TimeRange,
  type SdrPerf,
} from '@/hooks/useDashboardData'

import KpiCard from '@/components/dashboard/KpiCard'
import Funnel from '@/components/dashboard/Funnel'
import ActivityChart from '@/components/dashboard/ActivityChart'
import Leaderboard from '@/components/dashboard/Leaderboard'
import AIInsights from '@/components/dashboard/AIInsights'
import PipelineDistribution from '@/components/dashboard/PipelineDistribution'
import MessagingStats from '@/components/dashboard/MessagingStats'
import ActivityFeed from '@/components/dashboard/ActivityFeed'
import HeatMap from '@/components/dashboard/HeatMap'
import UpcomingRdv from '@/components/dashboard/UpcomingRdv'
import Reveal from '@/components/dashboard/Reveal'
import SharedResources from '@/components/dashboard/SharedResources'

export default function Dashboard() {
  const { isManager, profile } = useAuth()
  const [range, setRange] = useState<TimeRange>('30d')
  const [sdrFilter, setSdrFilter] = useState<string | 'all'>('all')

  useRealtimeCalls()
  const { calls: rawCalls, profiles, prospects, messages, isLoading, days } = useDashboardData(range)

  // Filtre SDR appliqué côté client
  const calls = useMemo(() => {
    if (sdrFilter === 'all') return rawCalls
    return rawCalls.filter(c => c.sdr_id === sdrFilter)
  }, [rawCalls, sdrFilter])

  // ── Buckets quotidiens ──
  const buckets = useMemo(() => buildDailyBuckets(calls, days), [calls, days])

  // ── KPIs avec trend ──
  const kpiCalls = useMemo(() => buildKpiTrend(rawCalls, days, () => true), [rawCalls, days])
  const kpiConnected = useMemo(() => buildKpiTrend(rawCalls, days, isConnected), [rawCalls, days])
  const kpiRdv = useMemo(() => buildKpiTrend(rawCalls, days, c => !!c.meeting_booked), [rawCalls, days])
  const kpiVoicemails = useMemo(() => buildKpiTrend(rawCalls, days, c => c.call_outcome === 'voicemail'), [rawCalls, days])

  // Sparklines pour KPIs (last 14 days, 1 bar / day)
  const sparkBuckets = useMemo(() => buildDailyBuckets(rawCalls, Math.min(14, days)), [rawCalls, days])
  const sparkCalls = sparkBuckets.map(b => b.calls)
  const sparkConnected = sparkBuckets.map(b => b.connected)
  const sparkRdv = sparkBuckets.map(b => b.rdv)
  const sparkVm = useMemo(() => {
    return sparkBuckets.map(b => calls.filter(c => {
      const t = new Date(c.created_at)
      return t.toISOString().slice(0, 10) === b.date && c.call_outcome === 'voicemail'
    }).length)
  }, [sparkBuckets, calls])

  // ── Stats agrégées ──
  const stats = useMemo(() => {
    const conn = calls.filter(isConnected)
    const rdv = calls.filter(c => c.meeting_booked)
    const scored = calls.filter(c => c.ai_score_global)
    const avgScore = scored.length > 0
      ? Math.round(scored.reduce((s, c) => s + (c.ai_score_global || 0), 0) / scored.length)
      : null
    const talkSec = conn.reduce((s, c) => s + (c.call_duration || 0), 0)
    const longCalls = conn.filter(c => (c.call_duration || 0) >= 60).length  // > 1 min = vraie conversation
    return {
      total: calls.length,
      connected: conn.length,
      voicemails: calls.filter(c => c.call_outcome === 'voicemail').length,
      rdv: rdv.length,
      avgScore,
      scoredCount: scored.length,
      talkSec,
      longCalls,
      messages: messages.length,
      messagesIn: messages.filter(m => m.direction === 'in').length,
    }
  }, [calls, messages])

  // Sparkline pour score IA (moyenne quotidienne)
  const sparkScore = useMemo(() => {
    return sparkBuckets.map(b => {
      const dayScores = calls.filter(c => {
        const t = new Date(c.created_at).toISOString().slice(0, 10)
        return t === b.date && c.ai_score_global
      }).map(c => c.ai_score_global as number)
      return dayScores.length > 0 ? Math.round(dayScores.reduce((s, v) => s + v, 0) / dayScores.length) : 0
    })
  }, [sparkBuckets, calls])

  // Sparkline messagerie quotidienne
  const sparkMsg = useMemo(() => {
    return sparkBuckets.map(b => messages.filter(m => {
      const t = new Date(m.sent_at).toISOString().slice(0, 10)
      return t === b.date
    }).length)
  }, [sparkBuckets, messages])

  // ── Leaderboard data (admin) ──
  const sdrRows = useMemo<SdrPerf[]>(() => {
    if (!isManager || profiles.length === 0) return []
    const map = new Map<string, SdrPerf>()
    for (const p of profiles) {
      const id = p.id as string
      map.set(id, {
        id,
        name: (p as any).full_name || (p as any).email || 'Sans nom',
        email: (p as any).email || '',
        calls: 0, connected: 0, rdv: 0, avgScore: null, talkSec: 0,
        dailyCalls: Array(Math.min(14, days)).fill(0),
        dailyRdv: Array(Math.min(14, days)).fill(0),
      })
    }
    const sums = new Map<string, { sumScore: number; countScore: number }>()
    for (const c of rawCalls) {
      if (!c.sdr_id) continue
      const row = map.get(c.sdr_id)
      if (!row) continue
      row.calls++
      if (isConnected(c)) {
        row.connected++
        row.talkSec += c.call_duration || 0
      }
      if (c.meeting_booked) row.rdv++
      if (c.ai_score_global) {
        const s = sums.get(c.sdr_id) || { sumScore: 0, countScore: 0 }
        s.sumScore += c.ai_score_global
        s.countScore++
        sums.set(c.sdr_id, s)
      }
      // Daily buckets pour sparkline
      const dStr = new Date(c.created_at).toISOString().slice(0, 10)
      const idx = sparkBuckets.findIndex(b => b.date === dStr)
      if (idx >= 0) {
        row.dailyCalls[idx]++
        if (c.meeting_booked) row.dailyRdv[idx]++
      }
    }
    for (const [id, s] of sums) {
      const row = map.get(id)
      if (row && s.countScore > 0) row.avgScore = Math.round(s.sumScore / s.countScore)
    }
    return Array.from(map.values())
      .filter(r => r.calls > 0)
      .sort((a, b) => b.rdv - a.rdv || b.connected - a.connected || b.calls - a.calls)
  }, [rawCalls, profiles, isManager, sparkBuckets, days])

  // Format helpers
  const formatHM = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.round((sec % 3600) / 60)
    return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
  }

  const connectRate = stats.total > 0 ? Math.round((stats.connected / stats.total) * 100) : 0
  const rdvRate = stats.connected > 0 ? Math.round((stats.rdv / stats.connected) * 100) : 0

  return (
    <div className="h-full bg-[#f8f9fa] dark:bg-[#e8e0f0] overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6 pb-12 space-y-5">

        {/* ─── Header + filtres ─── */}
        <div className="flex flex-wrap items-baseline justify-between gap-3 animate-dash-up">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-800 flex items-center gap-2.5">
              Statistiques
              <span className="live-dot" title="Live" />
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5 flex items-center gap-1.5">
              {isManager ? 'Vue équipe' : 'Mes performances'} • {rangeLabel(range)} •
              <span className="text-emerald-600 font-semibold">Live</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filtre SDR (admin only) */}
            {isManager && profiles.length > 0 && (
              <select
                value={sdrFilter}
                onChange={e => setSdrFilter(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-[12px] outline-none focus:border-indigo-300"
              >
                <option value="all">Toute l'équipe</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{(p as any).full_name || (p as any).email}</option>
                ))}
              </select>
            )}
            {/* Range selector */}
            <div className="inline-flex bg-white border border-gray-200 rounded-lg p-0.5">
              {(['7d', '30d', '90d', '365d'] as TimeRange[]).map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    range === r ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {r === '7d' ? '7j' : r === '30d' ? '30j' : r === '90d' ? '90j' : '1an'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-[12px] text-gray-400">Chargement des données...</div>
        ) : stats.total === 0 && stats.messages === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm font-semibold text-gray-700">Pas encore de données sur cette période</p>
            <p className="text-xs text-gray-400 mt-1">Élargis la période ou commence à appeler</p>
          </div>
        ) : (
          <>
            {/* ─── KPIs ─── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard index={0} label="Appels" value={stats.total} trendPct={kpiCalls.pct} spark={sparkCalls} color="#0ea5e9" icon="📞" />
              <KpiCard index={1} label="Connectés" value={stats.connected} trendPct={kpiConnected.pct} sub={`${connectRate}% taux`} spark={sparkConnected} color="#10b981" icon="✅" />
              <KpiCard index={2} label="RDV pris" value={stats.rdv} trendPct={kpiRdv.pct} sub={`${rdvRate}% / connectés`} spark={sparkRdv} color="#8b5cf6" icon="🎯" />
              <KpiCard index={3} label="Score IA moyen" value={stats.avgScore ?? '—'} sub={stats.scoredCount > 0 ? `${stats.scoredCount} appels` : 'pas de données'} spark={sparkScore} color="#ec4899" icon="🤖" />
              <KpiCard index={4} label="Conversations 1min+" value={stats.longCalls} sub={`sur ${stats.connected} connectés`} color="#f97316" icon="💬" />
              <KpiCard index={5} label="Temps parlé" value={formatHM(stats.talkSec)} sub={stats.connected > 0 ? `~${Math.round(stats.talkSec / stats.connected / 60)}min/appel` : ''} color="#6366f1" icon="⏱️" />
              <KpiCard index={6} label="Messageries vocales" value={stats.voicemails} trendPct={kpiVoicemails.pct} spark={sparkVm} color="#f59e0b" icon="📨" />
              <KpiCard index={7} label="Messages échangés" value={stats.messages} sub={`${stats.messagesIn} reçus`} spark={sparkMsg} color="#06b6d4" icon="💌" />
            </div>

            {/* ─── Prochains RDV + Funnel + Ressources (3 cards de taille égale) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              <Reveal direction="left" className="lg:col-span-1 h-full">
                <UpcomingRdv prospects={prospects} />
              </Reveal>
              <Reveal direction="up" delay={80} className="lg:col-span-1 h-full">
                <Funnel steps={[
                  { label: 'Appels lancés', value: stats.total, color: '#a5b4fc' },
                  { label: 'Connectés à un humain', value: stats.connected, color: '#10b981' },
                  { label: 'Conversations 1min+', value: stats.longCalls, color: '#f97316' },
                  { label: 'RDV pris', value: stats.rdv, color: '#8b5cf6' },
                ]} />
              </Reveal>
              <Reveal direction="right" delay={160} className="lg:col-span-1 h-full">
                <SharedResources />
              </Reveal>
            </div>

            {/* ─── Activity chart full width ─── */}
            <Reveal direction="up">
              <ActivityChart buckets={buckets} />
            </Reveal>

            {/* ─── AI Insights (full width) ─── */}
            <Reveal direction="up" duration={700}>
              <AIInsights calls={calls} />
            </Reveal>

            {/* ─── Leaderboard (admin) ─── */}
            {isManager && (
              <Reveal direction="up" duration={650}>
                <Leaderboard rows={sdrRows} />
              </Reveal>
            )}

            {/* ─── Pipeline + Messagerie ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Reveal direction="left">
                <PipelineDistribution prospects={prospects} />
              </Reveal>
              <Reveal direction="right" delay={150}>
                <MessagingStats messages={messages} />
              </Reveal>
            </div>

            {/* ─── HeatMap + Activity feed ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Reveal direction="scale">
                <HeatMap calls={calls} />
              </Reveal>
              <Reveal direction="right" delay={120}>
                <ActivityFeed calls={calls} messages={messages as any} />
              </Reveal>
            </div>

            <p className="text-center text-[10px] text-gray-400 pt-2">
              {isManager ? `Données agrégées de ${profiles.length} membres` : `Connecté en tant que ${profile?.full_name || profile?.email}`}
              {' • '}Période : {rangeLabel(range)}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
