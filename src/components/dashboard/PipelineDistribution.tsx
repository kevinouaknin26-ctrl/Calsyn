/**
 * PipelineDistribution — Distribution des prospects par crm_status (donut+légende).
 */

import { useMemo, useEffect, useState } from 'react'
import { useCrmStatuses } from '@/hooks/useProperties'
import { useInView } from '@/hooks/useInView'

interface ProspectLite { crm_status?: string | null }

const FALLBACK_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

export default function PipelineDistribution({ prospects }: { prospects: ProspectLite[] }) {
  const { data: crmStatuses } = useCrmStatuses()

  const segments = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of prospects) {
      const k = p.crm_status || 'unknown'
      m.set(k, (m.get(k) || 0) + 1)
    }
    const entries = Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, count], i) => {
        const def = (crmStatuses || []).find(s => s.key === key)
        return {
          key,
          label: def?.label || (key === 'unknown' ? 'Sans statut' : key),
          color: def?.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
          count,
        }
      })
    const total = entries.reduce((s, e) => s + e.count, 0)
    return { entries, total }
  }, [prospects, crmStatuses])

  if (segments.total === 0) {
    return (
      <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-6 text-center text-[12px] text-gray-400">
        Aucun prospect
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] overflow-hidden h-full flex flex-col">
      <div className="px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
        <h3 className="text-[12px] font-bold text-gray-700">Pipeline — répartition contacts</h3>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center flex-1">
        <div className="flex justify-center">
          <Donut entries={segments.entries} total={segments.total} />
        </div>
        <div className="space-y-1">
          {segments.entries.slice(0, 8).map(e => {
            const pct = Math.round((e.count / segments.total) * 100)
            return (
              <div key={e.key} className="flex items-center gap-2 text-[11px]">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: e.color }} />
                <span className="text-gray-700 truncate flex-1">{e.label}</span>
                <span className="font-bold text-gray-800 tabular-nums">{e.count}</span>
                <span className="text-gray-400 tabular-nums w-8 text-right">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────

function Donut({ entries, total }: { entries: Array<{ key: string; color: string; count: number }>; total: number }) {
  const size = 160
  const cx = size / 2
  const cy = size / 2
  const r = 60
  const stroke = 22
  const circumference = 2 * Math.PI * r

  const [wrapRef, inView] = useInView<HTMLDivElement>({ threshold: 0.4, once: true })
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!inView) return
    const start = performance.now()
    const dur = 1200
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      setProgress(1 - Math.pow(1 - t, 3))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, total])

  let offset = 0
  return (
   <div ref={wrapRef}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="hover:scale-105 transition-transform duration-300">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      {entries.map(e => {
        const frac = e.count / total
        const fullDash = frac * circumference
        const animatedDash = fullDash * progress  // se remplit avec progress
        const seg = (
          <circle
            key={e.key}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={e.color}
            strokeWidth={stroke}
            strokeDasharray={`${animatedDash} ${circumference - animatedDash}`}
            strokeDashoffset={-offset * progress}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'none' }}
          />
        )
        offset += fullDash
        return seg
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle" className="text-2xl font-extrabold fill-gray-800">
        {total.toLocaleString('fr-FR')}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle" className="text-[9px] fill-gray-400 uppercase tracking-wider">
        Contacts
      </text>
    </svg>
   </div>
  )
}
