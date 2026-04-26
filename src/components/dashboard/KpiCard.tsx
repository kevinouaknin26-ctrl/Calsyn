/**
 * KpiCard — Card KPI avec valeur (count-up animé), trend %, sparkline.
 */

import Sparkline from './Sparkline'
import { useCountUp } from '@/hooks/useCountUp'

interface Props {
  label: string
  value: string | number
  trendPct?: number
  sub?: string
  spark?: number[]
  color: string
  icon?: string
  index?: number  // Pour stagger animation
}

export default function KpiCard({ label, value, trendPct, sub, spark, color, icon, index = 0 }: Props) {
  const animated = useCountUp(value, 700 + index * 50)
  const trendUp = trendPct !== undefined && trendPct >= 0
  const display = typeof value === 'number' ? (animated as number).toLocaleString('fr-FR') : animated

  return (
    <div
      className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-3 dash-card-hover animate-dash-up stagger-item"
      style={{ ['--i' as any]: index }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        {icon && (
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-[12px] transition-transform hover:scale-110"
            style={{ background: `${color}18`, color }}>
            {icon}
          </div>
        )}
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex-1">{label}</p>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-extrabold tabular-nums truncate" style={{ color }}>{display}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {trendPct !== undefined && (
              <span className={`text-[10px] font-bold tabular-nums flex items-center gap-0.5 transition-colors ${trendUp ? 'text-emerald-600' : 'text-red-500'}`}>
                <span className={trendUp ? 'animate-bounce-y' : ''}>{trendUp ? '▲' : '▼'}</span>
                {Math.abs(trendPct)}%
              </span>
            )}
            {sub && <span className="text-[10px] text-gray-400 truncate">{sub}</span>}
          </div>
        </div>
        {spark && spark.length > 1 && (
          <div className="flex-shrink-0 opacity-0 animate-fade-in" style={{ animationDelay: `${300 + index * 50}ms`, animationFillMode: 'forwards' }}>
            <Sparkline data={spark} color={color} width={64} height={24} animate />
          </div>
        )}
      </div>
    </div>
  )
}
