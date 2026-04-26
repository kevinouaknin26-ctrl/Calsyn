/**
 * AIInsights — Insights extraits des analyses IA :
 *  - Radar chart 4 compétences (accroche, objection, closing, global)
 *  - Distribution intentions prospect (donut)
 *  - Top objections rencontrées (extraites des points_amelioration)
 */

import { useMemo } from 'react'
import type { Call } from '@/types/call'

interface Props {
  calls: Call[]
}

export default function AIInsights({ calls }: Props) {
  const analyzed = calls.filter(c => c.ai_score_global !== null)

  // ── Radar : moyennes des 4 scores ──
  const radar = useMemo(() => {
    if (analyzed.length === 0) return null
    const sum = { global: 0, accroche: 0, objection: 0, closing: 0 }
    let count = 0
    for (const c of analyzed) {
      if (c.ai_score_global) { sum.global += c.ai_score_global; count++ }
      sum.accroche += c.ai_score_accroche || 0
      sum.objection += c.ai_score_objection || 0
      sum.closing += c.ai_score_closing || 0
    }
    return {
      global: Math.round(sum.global / Math.max(1, count)),
      accroche: Math.round(sum.accroche / Math.max(1, count)),
      objection: Math.round(sum.objection / Math.max(1, count)),
      closing: Math.round(sum.closing / Math.max(1, count)),
    }
  }, [analyzed])

  // ── Distribution intentions ──
  const intentions = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of analyzed) {
      if (!c.ai_intention_prospect) continue
      const key = c.ai_intention_prospect.toLowerCase().trim()
      m.set(key, (m.get(key) || 0) + 1)
    }
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }))
  }, [analyzed])

  // ── Top objections (mots fréquents dans points_amelioration) ──
  const topImprovements = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of analyzed) {
      for (const pt of c.ai_points_amelioration || []) {
        // Trim + dédoublonne par tronquage premier 60 chars
        const key = pt.trim().slice(0, 80).toLowerCase()
        if (key.length < 8) continue
        m.set(key, (m.get(key) || 0) + 1)
      }
    }
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }))
  }, [analyzed])

  if (analyzed.length === 0) {
    return (
      <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-6 text-center">
        <p className="text-2xl mb-2">🤖</p>
        <p className="text-[12px] font-semibold text-gray-700">Insights IA</p>
        <p className="text-[11px] text-gray-400 mt-1">Aucun appel analysé sur la période</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <h3 className="text-[12px] font-bold text-gray-700">🤖 Insights IA — {analyzed.length} appel{analyzed.length > 1 ? 's' : ''} analysé{analyzed.length > 1 ? 's' : ''}</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {/* Radar */}
        <div className="p-4 flex flex-col items-center">
          <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2">Compétences</h4>
          {radar && <RadarChart values={radar} />}
        </div>

        {/* Intentions */}
        <div className="p-4">
          <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2">Intention prospects</h4>
          <div className="space-y-1.5">
            {intentions.slice(0, 6).map(i => {
              const pct = Math.round((i.count / analyzed.length) * 100)
              const color = i.label.includes('intéressé') && !i.label.includes('pas') ? '#10b981'
                         : i.label.includes('pas') ? '#ef4444'
                         : i.label.includes('rappeler') ? '#f59e0b'
                         : i.label.includes('messag') ? '#a855f7'
                         : '#6366f1'
              return (
                <div key={i.label} className="space-y-0.5 animate-dash-up stagger-item" style={{ ['--i' as any]: intentions.indexOf(i) }}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-gray-700 capitalize truncate flex-1">{i.label}</span>
                    <span className="font-semibold text-gray-700 tabular-nums ml-2">{i.count} <span className="text-gray-400">{pct}%</span></span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full animate-dash-width" style={{ width: `${pct}%`, background: color, animationDelay: `${100 + intentions.indexOf(i) * 80}ms` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top points d'amélioration */}
        <div className="p-4">
          <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2">À travailler (récurrent)</h4>
          {topImprovements.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic">Aucune récurrence détectée</p>
          ) : (
            <ul className="space-y-1.5">
              {topImprovements.map((it, i) => (
                <li key={i} className="text-[11px] text-gray-700 flex items-start gap-1.5 animate-dash-up stagger-item" style={{ ['--i' as any]: i }}>
                  <span className="text-amber-500 flex-shrink-0">▸</span>
                  <span className="line-clamp-2 leading-snug">{it.label}</span>
                  {it.count > 1 && <span className="ml-auto text-[10px] text-gray-400 font-bold flex-shrink-0">×{it.count}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────

function RadarChart({ values }: { values: { global: number; accroche: number; objection: number; closing: number } }) {
  const size = 160
  const cx = size / 2
  const cy = size / 2
  const radius = 60
  const axes = [
    { label: 'Accroche', value: values.accroche, angle: -Math.PI / 2 },
    { label: 'Objection', value: values.objection, angle: 0 },
    { label: 'Closing', value: values.closing, angle: Math.PI / 2 },
    { label: 'Global', value: values.global, angle: Math.PI },
  ]

  const points = axes.map(a => {
    const r = (a.value / 100) * radius
    return [cx + Math.cos(a.angle) * r, cy + Math.sin(a.angle) * r]
  })
  const polygon = points.map(p => p.join(',')).join(' ')

  const gridLevels = [0.25, 0.5, 0.75, 1]

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid */}
      {gridLevels.map(lvl => {
        const pts = axes.map(a => {
          const r = lvl * radius
          return `${cx + Math.cos(a.angle) * r},${cy + Math.sin(a.angle) * r}`
        }).join(' ')
        return <polygon key={lvl} points={pts} fill="none" stroke="#e5e7eb" strokeWidth={0.5} />
      })}
      {/* Axes */}
      {axes.map(a => (
        <line key={a.label} x1={cx} y1={cy}
          x2={cx + Math.cos(a.angle) * radius}
          y2={cy + Math.sin(a.angle) * radius}
          stroke="#e5e7eb" strokeWidth={0.5} />
      ))}
      {/* Data polygon */}
      <polygon
        points={polygon}
        fill="#8b5cf6"
        fillOpacity={0.25}
        stroke="#8b5cf6"
        strokeWidth={2}
        style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'dashGrowRadar 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) backwards' }}
      />
      {/* Points + labels */}
      {axes.map((a, i) => {
        const [x, y] = points[i]
        const lblR = radius + 14
        const lx = cx + Math.cos(a.angle) * lblR
        const ly = cy + Math.sin(a.angle) * lblR
        return (
          <g key={a.label}>
            <circle cx={x} cy={y} r={3} fill="#8b5cf6" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
              className="text-[9px] font-bold fill-gray-600">{a.label}</text>
            <text x={lx} y={ly + 9} textAnchor="middle" dominantBaseline="middle"
              className="text-[9px] fill-violet-600 font-bold">{a.value}</text>
          </g>
        )
      })}
    </svg>
  )
}
