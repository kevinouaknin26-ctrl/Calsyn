/**
 * KpiCard — Card KPI avec valeur, trend %, sparkline.
 */

import Sparkline from './Sparkline'

interface Props {
  label: string
  value: string | number
  trendPct?: number  // -100..+∞
  sub?: string
  spark?: number[]
  color: string
  icon?: string
}

export default function KpiCard({ label, value, trendPct, sub, spark, color, icon }: Props) {
  const trendUp = trendPct !== undefined && trendPct >= 0
  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-3 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-1.5">
        {icon && (
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-[12px]" style={{ background: `${color}18`, color }}>
            {icon}
          </div>
        )}
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex-1">{label}</p>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-extrabold tabular-nums truncate" style={{ color }}>{value}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {trendPct !== undefined && (
              <span className={`text-[10px] font-bold tabular-nums flex items-center gap-0.5 ${trendUp ? 'text-emerald-600' : 'text-red-500'}`}>
                {trendUp ? '▲' : '▼'} {Math.abs(trendPct)}%
              </span>
            )}
            {sub && <span className="text-[10px] text-gray-400 truncate">{sub}</span>}
          </div>
        </div>
        {spark && spark.length > 1 && (
          <div className="flex-shrink-0">
            <Sparkline data={spark} color={color} width={64} height={24} />
          </div>
        )}
      </div>
    </div>
  )
}
