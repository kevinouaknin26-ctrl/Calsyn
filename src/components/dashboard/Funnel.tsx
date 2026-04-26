/**
 * Funnel — Tunnel de conversion multi-étapes avec drop-off entre paliers.
 */

interface Step {
  label: string
  value: number
  color: string
  hint?: string
}

export default function Funnel({ steps }: { steps: Step[] }) {
  const max = Math.max(1, ...steps.map(s => s.value))
  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-bold text-gray-700">Tunnel de conversion</h3>
        <span className="text-[10px] text-gray-400">% du palier précédent</span>
      </div>
      <div className="space-y-2.5">
        {steps.map((s, idx) => {
          const widthPct = (s.value / max) * 100
          const prev = idx > 0 ? steps[idx - 1] : null
          const dropPct = prev && prev.value > 0 ? Math.round((s.value / prev.value) * 100) : 100
          return (
            <div key={s.label} className="space-y-0.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-semibold text-gray-700">{s.label}</span>
                <span className="text-[12px] tabular-nums">
                  <span className="font-bold text-gray-800">{s.value.toLocaleString('fr-FR')}</span>
                  {idx > 0 && (
                    <span className={`ml-1.5 text-[10px] font-bold ${dropPct >= 50 ? 'text-emerald-600' : dropPct >= 25 ? 'text-amber-600' : 'text-red-500'}`}>
                      {dropPct}%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-7 bg-gray-100 rounded-md overflow-hidden relative">
                <div className="h-full rounded-md transition-all duration-500" style={{ width: `${widthPct}%`, background: s.color }} />
                {s.hint && (
                  <span className="absolute inset-0 flex items-center px-3 text-[10px] text-white font-semibold drop-shadow">
                    {s.hint}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
