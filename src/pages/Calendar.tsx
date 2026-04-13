/**
 * Calendar — Page calendrier avec RDV des prospects.
 * Affiche les RDV de la semaine depuis la DB (rdv_date sur prospects).
 * Vue jour par défaut avec navigation semaine.
 */

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Prospect } from '@/types/prospect'

function getDayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function getDayEnd(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) }
function getWeekDays(base: Date): Date[] {
  const day = base.getDay()
  const monday = new Date(base)
  monday.setDate(base.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return getDayStart(d)
  })
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 8h → 19h

export default function Calendar() {
  const { organisation } = useAuth()
  const queryClient = useQueryClient()
  const [currentDate, setCurrentDate] = useState(getDayStart(new Date()))
  const [view, setView] = useState<'day' | 'week'>('week')

  const weekDays = getWeekDays(currentDate)
  const weekStart = weekDays[0]
  const weekEnd = new Date(weekDays[6].getTime() + 86400000)

  const { data: rdvProspects } = useQuery({
    queryKey: ['rdv-calendar', weekStart.toISOString(), organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data, error } = await supabase
        .from('prospects')
        .select('id, list_id, name, phone, email, company, title, crm_status, last_call_outcome, rdv_date, meeting_booked, call_count')
        .eq('organisation_id', organisation.id)
        .gte('rdv_date', weekStart.toISOString())
        .lt('rdv_date', weekEnd.toISOString())
        .order('rdv_date', { ascending: true })
      if (error) throw error
      return (data || []) as Prospect[]
    },
    enabled: !!organisation?.id,
  })

  const today = getDayStart(new Date())
  const isToday = (d: Date) => d.getTime() === today.getTime()

  // Grouper par jour
  const byDay: Record<string, Prospect[]> = {}
  for (const p of (rdvProspects || [])) {
    if (!p.rdv_date) continue
    const dayKey = getDayStart(new Date(p.rdv_date)).toISOString()
    if (!byDay[dayKey]) byDay[dayKey] = []
    byDay[dayKey].push(p)
  }

  const prevWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(getDayStart(d)) }
  const nextWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(getDayStart(d)) }
  const goToday = () => setCurrentDate(getDayStart(new Date()))

  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  return (
    <div className="h-screen bg-[#f5f3ff] p-4 pl-2 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[20px] font-bold text-gray-800">Calendrier</h1>
          <span className="text-[13px] text-gray-400">
            {weekDays[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} — {weekDays[6].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday}
            className="text-[12px] text-indigo-600 font-medium px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors">
            Aujourd'hui
          </button>
          <div className="flex items-center gap-1">
            <button onClick={prevWeek} className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={nextWeek} className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Grille semaine */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        {/* Header jours */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {weekDays.map((day, i) => {
            const dayRdvs = byDay[day.toISOString()] || []
            return (
              <div key={i} className={`py-3 text-center border-r border-gray-100 last:border-r-0 ${isToday(day) ? 'bg-violet-50' : ''}`}>
                <p className="text-[10px] text-gray-400 uppercase">{dayNames[i]}</p>
                <p className={`text-[16px] font-bold ${isToday(day) ? 'text-violet-600' : 'text-gray-700'}`}>
                  {day.getDate()}
                </p>
                {dayRdvs.length > 0 && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isToday(day) ? 'bg-violet-200 text-violet-700' : 'bg-gray-100 text-gray-500'}`}>
                    {dayRdvs.length} RDV
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Grille horaires */}
        <div className="flex-1 overflow-y-auto">
          <div className="relative">
            {HOURS.map(hour => (
              <div key={hour} className="grid grid-cols-7 border-b border-gray-50" style={{ height: 60 }}>
                {weekDays.map((day, di) => {
                  const dayKey = day.toISOString()
                  const dayRdvs = (byDay[dayKey] || []).filter(p => {
                    if (!p.rdv_date) return false
                    const h = new Date(p.rdv_date).getHours()
                    return h === hour
                  })
                  return (
                    <div key={di} className={`border-r border-gray-50 last:border-r-0 relative ${isToday(day) ? 'bg-violet-50/30' : ''}`}>
                      {di === 0 && (
                        <span className="absolute -left-0 -top-2 text-[9px] text-gray-300 font-mono bg-white px-1">{hour}:00</span>
                      )}
                      {dayRdvs.map(p => {
                        const time = new Date(p.rdv_date!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                        const isPast = new Date(p.rdv_date!) < new Date()
                        const statusColor = p.crm_status === 'rdv_fait' ? '#059669'
                          : p.crm_status === 'signe' || p.crm_status === 'paye' ? '#10b981'
                          : isPast ? '#f59e0b'
                          : '#0d9488'
                        return (
                          <div key={p.id}
                            className="absolute inset-x-1 rounded-lg px-2 py-1 cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
                            style={{ background: statusColor + '18', borderLeft: `3px solid ${statusColor}`, top: `${(new Date(p.rdv_date!).getMinutes() / 60) * 100}%` }}>
                            <p className="text-[10px] font-bold truncate" style={{ color: statusColor }}>{time}</p>
                            <p className="text-[11px] font-medium text-gray-700 truncate">{p.name}</p>
                            {p.company && <p className="text-[9px] text-gray-400 truncate">{p.company}</p>}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RDV du jour — résumé en bas */}
      {(byDay[today.toISOString()] || []).length > 0 && (
        <div className="mt-3 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl border border-teal-100 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="text-[13px] font-semibold text-teal-700">RDV aujourd'hui</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {(byDay[today.toISOString()] || []).map(p => {
              const time = p.rdv_date ? new Date(p.rdv_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
              const isPast = p.rdv_date && new Date(p.rdv_date) < new Date()
              return (
                <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-white flex-shrink-0 ${isPast ? 'border-amber-200' : 'border-teal-200'}`}>
                  <span className={`text-[12px] font-mono font-bold ${isPast ? 'text-amber-600' : 'text-teal-600'}`}>{time}</span>
                  <span className="text-[12px] text-gray-700 font-medium">{p.name}</span>
                  <span className="text-[11px] text-gray-400">{p.phone}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
