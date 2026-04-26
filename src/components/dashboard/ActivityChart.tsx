/**
 * ActivityChart — Graphique en barres empilées de l'activité quotidienne.
 * Affiche calls (gris), connectés (vert), RDV (violet) sur la période.
 */

import type { DailyBucket } from '@/hooks/useDashboardData'

export default function ActivityChart({ buckets }: { buckets: DailyBucket[] }) {
  const max = Math.max(1, ...buckets.map(b => b.calls))

  // Affiche au max 30 labels — pour 90j on saute des étiquettes
  const labelStep = Math.ceil(buckets.length / 12)

  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-bold text-gray-700">📈 Activité quotidienne</h3>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-300" />Appels</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" />Connectés</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-600" />RDV</span>
        </div>
      </div>
      <div className="relative">
        {/* Y axis ticks */}
        <div className="absolute left-0 top-0 bottom-6 w-8 flex flex-col justify-between text-[9px] text-gray-400 pr-1">
          <span>{max}</span>
          <span>{Math.round(max * 0.5)}</span>
          <span>0</span>
        </div>
        {/* Bars */}
        <div className="ml-8 h-32 flex items-end gap-px relative">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            <div className="border-b border-gray-100 border-dashed h-px" />
            <div className="border-b border-gray-100 border-dashed h-px" />
            <div className="border-b border-gray-200 h-px" />
          </div>
          {buckets.map((b, i) => {
            const callsH = (b.calls / max) * 100
            const connectedH = (b.connected / max) * 100
            const rdvH = (b.rdv / max) * 100
            // Delay max ~600ms total — répartition selon nb de buckets
            const delay = (i / buckets.length) * 600
            return (
              <div key={b.date} className="flex-1 flex flex-col items-center justify-end group relative h-full hover:bg-violet-50/30 transition-colors rounded-sm"
                title={`${b.label} : ${b.calls} appels • ${b.connected} connectés • ${b.rdv} RDV`}>
                <div className="w-full flex items-end gap-px h-full">
                  <div className="flex-1 bg-indigo-300 hover:bg-indigo-500 transition-colors rounded-t-sm animate-dash-bar" style={{ height: `${callsH}%`, animationDelay: `${delay}ms` }} />
                  <div className="flex-1 bg-emerald-500 hover:bg-emerald-600 transition-colors rounded-t-sm animate-dash-bar" style={{ height: `${connectedH}%`, animationDelay: `${delay + 60}ms` }} />
                  <div className="flex-1 bg-violet-600 hover:bg-violet-700 transition-colors rounded-t-sm animate-dash-bar" style={{ height: `${rdvH}%`, animationDelay: `${delay + 120}ms` }} />
                </div>
              </div>
            )
          })}
        </div>
        <div className="ml-8 mt-1 flex justify-between text-[9px] text-gray-400">
          {buckets.filter((_, i) => i % labelStep === 0).map(b => <span key={b.date}>{b.label}</span>)}
        </div>
      </div>
    </div>
  )
}
