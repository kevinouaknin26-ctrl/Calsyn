/**
 * useDashboardData — Agrège toutes les sources nécessaires au Dashboard.
 *
 * Single source of truth pour le tableau de bord :
 *  - calls de la période sélectionnée
 *  - prospects de l'org (pour pipeline + count par status)
 *  - profiles de l'org (pour leaderboard SDR)
 *  - messages (pour stats messagerie)
 *
 * Le filtre SDR est appliqué côté client (data déjà chargée pour 1 admin).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Call } from '@/types/call'

export type TimeRange = '7d' | '30d' | '90d' | '365d'

export function rangeToDays(r: TimeRange): number {
  return ({ '7d': 7, '30d': 30, '90d': 90, '365d': 365 } as const)[r]
}

export function rangeLabel(r: TimeRange): string {
  return ({ '7d': '7 jours', '30d': '30 jours', '90d': '90 jours', '365d': '1 an' } as const)[r]
}

export interface SdrPerf {
  id: string
  name: string
  email: string
  calls: number
  connected: number
  rdv: number
  avgScore: number | null
  talkSec: number
  // Trend daily counts (pour mini sparkline) — N derniers jours
  dailyCalls: number[]
  dailyRdv: number[]
}

export function useDashboardData(range: TimeRange) {
  const { profile, organisation, isManager } = useAuth()
  const orgId = organisation?.id
  const days = rangeToDays(range)
  const sinceISO = useMemo(() => new Date(Date.now() - days * 86400 * 1000).toISOString(), [days])

  // ── Calls (filtré par période, RLS auto pour SDR) ──
  const callsQ = useQuery({
    queryKey: ['dash-calls', orgId, profile?.id, isManager, range],
    queryFn: async () => {
      if (!profile) return []
      let q = supabase
        .from('calls')
        .select('id, sdr_id, prospect_id, prospect_name, call_outcome, call_duration, meeting_booked, recording_url, ai_analysis_status, ai_score_global, ai_score_accroche, ai_score_objection, ai_score_closing, ai_summary, ai_intention_prospect, ai_prochaine_etape, ai_points_amelioration, from_number, created_at')
        .gte('created_at', sinceISO)
        .order('created_at', { ascending: false })
        .limit(5000)
      if (!isManager) q = q.eq('sdr_id', profile.id)
      const { data } = await q
      return (data || []) as Call[]
    },
    enabled: !!profile,
    staleTime: 30_000,
  })

  // ── Profiles de l'org (pour leaderboard) ──
  const profilesQ = useQuery({
    queryKey: ['dash-profiles', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase.from('profiles').select('id, full_name, email, role').eq('organisation_id', orgId)
      return data || []
    },
    enabled: isManager && !!orgId,
    staleTime: 5 * 60_000,
  })

  // ── Prospects (pour pipeline + RDV à venir) ──
  const prospectsQ = useQuery({
    queryKey: ['dash-prospects', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from('prospects')
        .select('id, name, crm_status, last_call_outcome, rdv_date, snoozed_until, meeting_booked, sector, company')
        .eq('organisation_id', orgId)
        .is('deleted_at', null)
        .limit(5000)
      return data || []
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // ── Messages (pour stats messagerie) ──
  const messagesQ = useQuery({
    queryKey: ['dash-messages', orgId, profile?.id, isManager, range],
    queryFn: async () => {
      if (!orgId) return []
      let q = supabase
        .from('messages')
        .select('id, channel, direction, status, sent_at, is_read, user_id')
        .eq('organisation_id', orgId)
        .gte('sent_at', sinceISO)
        .order('sent_at', { ascending: false })
        .limit(5000)
      if (!isManager && profile?.id) q = q.eq('user_id', profile.id)
      const { data } = await q
      return data || []
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  return {
    calls: callsQ.data || [],
    profiles: profilesQ.data || [],
    prospects: prospectsQ.data || [],
    messages: messagesQ.data || [],
    isLoading: callsQ.isLoading || prospectsQ.isLoading,
    days,
  }
}

// ────────────────────────────────────────────────────────────────────
// Aggregations (pure functions, testables)
// ────────────────────────────────────────────────────────────────────

export function isConnected(c: Pick<Call, 'call_outcome'>): boolean {
  return c.call_outcome === 'connected' || c.call_outcome === 'connected_incoming'
}

export interface DailyBucket { date: string; label: string; calls: number; connected: number; rdv: number; talkSec: number }

export function buildDailyBuckets(calls: Call[], days: number): DailyBucket[] {
  const out: DailyBucket[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    const dayCalls = calls.filter(c => {
      const t = new Date(c.created_at).getTime()
      return t >= d.getTime() && t < next.getTime()
    })
    const conn = dayCalls.filter(isConnected)
    out.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      calls: dayCalls.length,
      connected: conn.length,
      rdv: dayCalls.filter(c => c.meeting_booked).length,
      talkSec: conn.reduce((s, c) => s + (c.call_duration || 0), 0),
    })
  }
  return out
}

export interface KpiTrend { current: number; previous: number; pct: number }

export function buildKpiTrend(calls: Call[], days: number, predicate: (c: Call) => boolean): KpiTrend {
  const now = Date.now()
  const cutoffCurrent = now - days * 86400 * 1000
  const cutoffPrev = now - 2 * days * 86400 * 1000
  const current = calls.filter(c => {
    const t = new Date(c.created_at).getTime()
    return t >= cutoffCurrent && predicate(c)
  }).length
  const previous = calls.filter(c => {
    const t = new Date(c.created_at).getTime()
    return t >= cutoffPrev && t < cutoffCurrent && predicate(c)
  }).length
  const pct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : (current > 0 ? 100 : 0)
  return { current, previous, pct }
}
