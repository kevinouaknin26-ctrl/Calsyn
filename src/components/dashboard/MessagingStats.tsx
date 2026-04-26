/**
 * MessagingStats — Stats messagerie : envoyés/reçus/non-lus par canal.
 */

import { useMemo } from 'react'

interface Msg { channel: string; direction: string; is_read?: boolean | null }

const CHANNEL_META: Record<string, { label: string; icon: string; color: string }> = {
  email:    { label: 'Email',    icon: '✉️',  color: '#6366f1' },
  sms:      { label: 'SMS',      icon: '💬', color: '#f59e0b' },
  whatsapp: { label: 'WhatsApp', icon: '📱', color: '#25d366' },
}

export default function MessagingStats({ messages }: { messages: Msg[] }) {
  const stats = useMemo(() => {
    const channels = ['email', 'sms', 'whatsapp']
    return channels.map(c => {
      const all = messages.filter(m => m.channel === c)
      const sent = all.filter(m => m.direction === 'out').length
      const received = all.filter(m => m.direction === 'in').length
      const unread = all.filter(m => m.direction === 'in' && !m.is_read).length
      return { channel: c, sent, received, unread, total: all.length }
    }).filter(s => s.total > 0)
  }, [messages])

  if (stats.length === 0) {
    return (
      <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-6 text-center">
        <p className="text-2xl mb-2">💬</p>
        <p className="text-[12px] font-semibold text-gray-700">Messagerie</p>
        <p className="text-[11px] text-gray-400 mt-1">Aucun message sur la période</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <h3 className="text-[12px] font-bold text-gray-700">💬 Messagerie multi-canal</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {stats.map(s => {
          const meta = CHANNEL_META[s.channel] || { label: s.channel, icon: '?', color: '#6b7280' }
          const responseRate = s.sent > 0 ? Math.round((s.received / s.sent) * 100) : 0
          return (
            <div key={s.channel} className="px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[15px] flex-shrink-0"
                style={{ background: `${meta.color}18`, color: meta.color }}>
                {meta.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[12px] font-bold text-gray-800">{meta.label}</span>
                  <span className="text-[10px] text-gray-400">{s.total} total</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-[9px] uppercase text-gray-400 tracking-wider">Envoyés</div>
                    <div className="font-bold tabular-nums" style={{ color: meta.color }}>{s.sent}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-gray-400 tracking-wider">Reçus</div>
                    <div className="font-bold tabular-nums text-emerald-600">
                      {s.received}
                      {s.sent > 0 && <span className="text-[9px] text-gray-400 ml-1 font-normal">({responseRate}%)</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-gray-400 tracking-wider">Non lus</div>
                    <div className={`font-bold tabular-nums ${s.unread > 0 ? 'text-red-500' : 'text-gray-400'}`}>{s.unread}</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
