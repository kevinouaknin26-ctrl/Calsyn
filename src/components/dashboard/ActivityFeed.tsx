/**
 * ActivityFeed — Flux temps réel des derniers événements (calls + messages + RDV).
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Call } from '@/types/call'

interface Msg {
  id: string
  channel: string
  direction: string
  sent_at: string
  is_read?: boolean | null
}

interface FeedItem {
  id: string
  ts: string
  kind: 'call' | 'message' | 'rdv'
  title: string
  detail: string
  color: string
  icon: string
  href?: string
  prospectId?: string | null
}

function timeAgo(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000
  if (sec < 60) return 'à l\'instant'
  if (sec < 3600) return `${Math.round(sec / 60)} min`
  if (sec < 86400) return `${Math.round(sec / 3600)} h`
  return `${Math.round(sec / 86400)} j`
}

export default function ActivityFeed({ calls, messages }: { calls: Call[]; messages: Msg[] }) {
  const navigate = useNavigate()

  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = []
    for (const c of calls.slice(0, 50)) {
      const isConn = c.call_outcome === 'connected' || c.call_outcome === 'connected_incoming'
      const dur = c.call_duration ? `${Math.floor(c.call_duration / 60)}m${(c.call_duration % 60).toString().padStart(2, '0')}` : ''
      const score = c.ai_score_global ? ` • Score ${c.ai_score_global}` : ''
      out.push({
        id: `call:${c.id}`,
        ts: c.created_at,
        kind: c.meeting_booked ? 'rdv' : 'call',
        title: c.meeting_booked
          ? `RDV pris avec ${c.prospect_name || 'inconnu'}`
          : `${isConn ? 'Appel connecté' : c.call_outcome === 'voicemail' ? 'Messagerie' : 'Appel'} avec ${c.prospect_name || 'inconnu'}`,
        detail: `${dur}${score}`,
        color: c.meeting_booked ? '#8b5cf6' : isConn ? '#10b981' : '#94a3b8',
        icon: c.meeting_booked ? '🎯' : isConn ? '✅' : c.call_outcome === 'voicemail' ? '📨' : '📞',
        prospectId: c.prospect_id,
      })
    }
    for (const m of messages.slice(0, 30)) {
      if (m.direction !== 'in') continue
      const meta = m.channel === 'email' ? { label: 'Email', icon: '✉️' } : m.channel === 'sms' ? { label: 'SMS', icon: '💬' } : { label: m.channel, icon: '📱' }
      out.push({
        id: `msg:${m.id}`,
        ts: m.sent_at,
        kind: 'message',
        title: `${meta.label} reçu`,
        detail: m.is_read ? 'lu' : '⬤ non lu',
        color: '#6366f1',
        icon: meta.icon,
      })
    }
    return out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 25)
  }, [calls, messages])

  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-baseline justify-between">
        <h3 className="text-[12px] font-bold text-gray-700 flex items-center gap-2">
          <span className="live-dot" />
          ⚡ Activité récente
        </h3>
        <span className="text-[10px] text-gray-400">{items.length} évén.</span>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-center py-12 text-[12px] text-gray-400">Aucune activité récente</div>
        ) : (
          items.map((it, idx) => (
            <button
              key={it.id}
              onClick={() => it.prospectId && navigate(`/app/contacts?prospect=${it.prospectId}`)}
              className="w-full text-left px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 hover:translate-x-1 transition-all flex items-start gap-2.5 last:border-0 animate-slide-in stagger-item"
              style={{ ['--i' as any]: Math.min(idx, 12) }}
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] flex-shrink-0"
                style={{ background: `${it.color}18`, color: it.color }}>
                {it.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-gray-800 truncate">{it.title}</div>
                <div className="text-[10px] text-gray-500 truncate">{it.detail}</div>
              </div>
              <div className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">{timeAgo(it.ts)}</div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
