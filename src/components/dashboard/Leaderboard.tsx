/**
 * Leaderboard — Classement SDRs avec sparklines de tendance.
 */

import Sparkline from './Sparkline'
import type { SdrPerf } from '@/hooks/useDashboardData'
import { useInView } from '@/hooks/useInView'

const RANK_BG = ['bg-amber-50/50', 'bg-gray-50/50', 'bg-orange-50/50']
const RANK_EMOJI = ['🏆', '🥈', '🥉']

export default function Leaderboard({ rows }: { rows: SdrPerf[] }) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.15, once: true })
  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-6 text-center text-[12px] text-gray-400">
        Aucun SDR actif sur la période
      </div>
    )
  }
  return (
    <div ref={ref} className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-baseline justify-between">
        <h3 className="text-[12px] font-bold text-gray-700">Classement commerciaux</h3>
        <span className="text-[10px] text-gray-400">Trié par RDV pris</span>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
            <th className="text-left px-4 py-2 font-bold">#</th>
            <th className="text-left px-2 py-2 font-bold">Commercial</th>
            <th className="text-right px-2 py-2 font-bold">Appels</th>
            <th className="text-right px-2 py-2 font-bold">Conn.</th>
            <th className="text-right px-2 py-2 font-bold">RDV</th>
            <th className="text-right px-2 py-2 font-bold">Score</th>
            <th className="text-right px-2 py-2 font-bold">Temps</th>
            <th className="text-left px-3 py-2 font-bold">Tendance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const rate = r.calls > 0 ? Math.round((r.connected / r.calls) * 100) : 0
            const talkM = Math.round(r.talkSec / 60)
            return (
              <tr
                key={r.id}
                className={`border-b border-gray-50 hover:bg-gray-50/80 ${idx < 3 ? RANK_BG[idx] : ''}`}
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateX(0)' : 'translateX(-12px)',
                  transition: `opacity 500ms ease ${idx * 60}ms, transform 500ms cubic-bezier(0.16, 1, 0.3, 1) ${idx * 60}ms, background-color 0.15s`,
                }}
              >
                <td className="px-4 py-2 tabular-nums text-gray-500 font-bold">
                  {idx < 3 ? <span className="text-[14px]">{RANK_EMOJI[idx]}</span> : `${idx + 1}`}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                      {r.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 truncate">{r.name}</div>
                      <div className="text-[10px] text-gray-400 truncate">{r.email}</div>
                    </div>
                  </div>
                </td>
                <td className="text-right px-2 py-2 tabular-nums text-gray-700">{r.calls}</td>
                <td className="text-right px-2 py-2 tabular-nums">
                  <span className="text-emerald-700 font-semibold">{r.connected}</span>
                  <span className="text-gray-400 text-[10px] ml-1">{rate}%</span>
                </td>
                <td className="text-right px-2 py-2 tabular-nums text-violet-600 font-bold">{r.rdv}</td>
                <td className="text-right px-2 py-2 tabular-nums">
                  {r.avgScore !== null ? (
                    <span className={`font-bold ${r.avgScore >= 70 ? 'text-emerald-600' : r.avgScore >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{r.avgScore}</span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="text-right px-2 py-2 tabular-nums text-gray-500 text-[11px]">{talkM > 0 ? `${talkM}m` : '—'}</td>
                <td className="px-3 py-2">
                  <Sparkline data={r.dailyRdv.length > 1 ? r.dailyRdv : r.dailyCalls} color="#8b5cf6" width={70} height={20} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
