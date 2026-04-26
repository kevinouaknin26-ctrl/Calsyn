/**
 * UpcomingRdv — Prochains RDV (rdv_date >= now), triés par proximité.
 * Exploite la RLS prospects pour le scope :
 *  - SDR : ne voit que les RDV des prospects qui sont dans ses listes
 *  - Admin/Manager : voit tous les RDV de l'org
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInView } from '@/hooks/useInView'

interface ProspectLite {
  id: string
  name: string | null
  phone?: string | null
  email?: string | null
  rdv_date?: string | null
  company?: string | null
}

function formatRelative(iso: string): { label: string; urgent: boolean } {
  const d = new Date(iso)
  const sec = (d.getTime() - Date.now()) / 1000
  if (sec < 0) return { label: 'En retard', urgent: true }
  if (sec < 3600) return { label: `dans ${Math.max(1, Math.round(sec / 60))} min`, urgent: true }
  if (sec < 86400) return { label: `dans ${Math.round(sec / 3600)} h`, urgent: true }
  if (sec < 86400 * 2) return { label: 'demain', urgent: false }
  if (sec < 86400 * 7) return { label: `dans ${Math.round(sec / 86400)} j`, urgent: false }
  return { label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }), urgent: false }
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function UpcomingRdv({ prospects }: { prospects: ProspectLite[] }) {
  const navigate = useNavigate()
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.15, once: true })

  const upcoming = useMemo(() => {
    const now = Date.now()
    const cutoff = now - 30 * 60 * 1000  // garde aussi les RDV en retard depuis -30min
    return prospects
      .filter(p => p.rdv_date && new Date(p.rdv_date).getTime() >= cutoff)
      .sort((a, b) => new Date(a.rdv_date!).getTime() - new Date(b.rdv_date!).getTime())
      .slice(0, 10)
  }, [prospects])

  return (
    <div ref={ref} className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-baseline justify-between">
        <h3 className="text-[12px] font-bold text-gray-700 flex items-center gap-2">
          📅 Prochains RDV
        </h3>
        <span className="text-[10px] text-gray-400">{upcoming.length} à venir</span>
      </div>

      {upcoming.length === 0 ? (
        <div className="text-center py-12 px-4">
          <p className="text-3xl mb-2">🎯</p>
          <p className="text-[12px] font-semibold text-gray-700">Aucun RDV planifié</p>
          <p className="text-[11px] text-gray-400 mt-1">Tes prochains RDV apparaîtront ici</p>
        </div>
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          {upcoming.map((p, idx) => {
            const rel = formatRelative(p.rdv_date!)
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/app/contacts?prospect=${p.id}`)}
                className="w-full text-left px-4 py-2.5 border-b border-gray-50 hover:bg-violet-50/40 hover:translate-x-0.5 transition-all flex items-start gap-3 last:border-0"
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateX(0)' : 'translateX(-12px)',
                  transition: `opacity 400ms ease ${idx * 50}ms, transform 400ms cubic-bezier(0.16, 1, 0.3, 1) ${idx * 50}ms, background-color 0.15s, translate 0.15s`,
                }}
              >
                {/* Date pill */}
                <div className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg flex-shrink-0 ${
                  rel.urgent ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'
                }`}>
                  <span className="text-[10px] font-bold uppercase leading-none">
                    {new Date(p.rdv_date!).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}
                  </span>
                  <span className="text-[18px] font-extrabold leading-tight">
                    {new Date(p.rdv_date!).getDate()}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12px] font-bold text-gray-800 truncate">
                      {p.name || 'Inconnu'}
                    </span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${
                      rel.urgent ? 'bg-amber-50 text-amber-700' : 'bg-violet-50 text-violet-700'
                    }`}>
                      {rel.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">
                    🕐 {formatAbsolute(p.rdv_date!)}
                  </div>
                  {(p.company || p.phone) && (
                    <div className="text-[10px] text-gray-400 truncate mt-0.5">
                      {p.company && <span>{p.company}</span>}
                      {p.company && p.phone && <span> · </span>}
                      {p.phone && <span>{p.phone}</span>}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
