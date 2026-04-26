/**
 * HeatMap — Volumétrie 7 jours × 24 heures avec intensité.
 */

import { useMemo } from 'react'
import type { Call } from '@/types/call'
import { useInView } from '@/hooks/useInView'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export default function HeatMap({ calls }: { calls: Call[] }) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2, once: true })
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0))
    for (const c of calls) {
      const d = new Date(c.created_at)
      const dow = (d.getDay() + 6) % 7  // lundi = 0
      g[dow][d.getHours()]++
    }
    return g
  }, [calls])
  const max = Math.max(1, ...grid.flat())

  // Best slot
  const best = useMemo(() => {
    let bd = 0, bh = 0, bv = 0
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (grid[d][h] > bv) { bv = grid[d][h]; bd = d; bh = h }
      }
    }
    return { day: DAYS[bd], hour: bh, count: bv }
  }, [grid])

  return (
    <div ref={ref} className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[12px] font-bold text-gray-700">🔥 Heures les plus actives</h3>
        {best.count > 0 && (
          <span className="text-[10px] text-gray-500">
            Pic : <span className="font-bold text-violet-600">{best.day} {best.hour}h</span> ({best.count})
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="text-[9px]">
          <thead>
            <tr>
              <td className="w-7" />
              {Array.from({ length: 24 }, (_, h) => (
                <td key={h} className="text-center text-gray-400 px-px font-bold">{h % 3 === 0 ? `${h}h` : ''}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, dowIdx) => (
              <tr key={dowIdx}>
                <td className="text-gray-500 font-bold pr-2 text-right">{DAYS[dowIdx]}</td>
                {row.map((count, h) => {
                  const intensity = count / max
                  const targetBg = count === 0 ? '#f3f4f6' : `rgba(124, 58, 237, ${0.15 + intensity * 0.85})`
                  // Stagger : (dow * 24 + h) * 5ms — apparition en vague depuis le coin
                  const delay = (dowIdx * 24 + h) * 5
                  return (
                    <td key={h} className="p-px">
                      <div
                        className="w-4 h-4 rounded-sm hover:ring-2 hover:ring-violet-400 hover:scale-125 hover:z-10 relative"
                        style={{
                          background: inView ? targetBg : '#f9fafb',
                          transform: inView ? 'scale(1)' : 'scale(0)',
                          opacity: inView ? 1 : 0,
                          transition: `transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms, opacity 300ms ease ${delay}ms, background 400ms ease ${delay}ms`,
                        }}
                        title={`${DAYS[dowIdx]} ${h}h : ${count} appel${count > 1 ? 's' : ''}`}
                      />
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
