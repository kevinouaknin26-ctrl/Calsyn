/**
 * Calendar — Page calendrier avec RDV des prospects.
 * Affiche les RDV de la semaine depuis la DB (rdv_date sur prospects).
 * Vue jour par défaut avec navigation semaine.
 */

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Prospect } from '@/types/prospect'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// Hook pour gérer la connexion Google Calendar
function useGoogleCalendar() {
  const { data: status, refetch } = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return { connected: false }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/google-auth?action=status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      return res.json()
    },
  })

  const connect = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`${SUPABASE_URL}/functions/v1/google-auth?action=authorize`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    if (data.url) {
      // Ouvrir dans un popup
      const popup = window.open(data.url, 'google-auth', 'width=500,height=600,left=200,top=100')
      // Écouter le message de retour
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'google-calendar-connected') {
          refetch()
          window.removeEventListener('message', handler)
        }
      }
      window.addEventListener('message', handler)
    }
  }, [refetch])

  const disconnect = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`${SUPABASE_URL}/functions/v1/google-auth?action=disconnect`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    refetch()
  }, [refetch])

  const listEvents = useCallback(async (timeMin: string, timeMax: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const params = new URLSearchParams({ action: 'list', timeMin, timeMax })
    const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) return null
    return res.json()
  }, [])

  const createEvent = useCallback(async (event: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar?action=create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    })
    if (!res.ok) return null
    return res.json()
  }, [])

  return { connected: status?.connected || false, connect, disconnect, listEvents, createEvent }
}

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
  const gcal = useGoogleCalendar()
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

  // Google Calendar events
  type GCalEvent = { id: string; summary: string; description?: string; start: { dateTime?: string }; end: { dateTime?: string } }
  const { data: gcalEvents } = useQuery({
    queryKey: ['gcal-events', weekStart.toISOString(), gcal.connected],
    queryFn: async () => {
      if (!gcal.connected) return []
      const data = await gcal.listEvents(weekStart.toISOString(), weekEnd.toISOString())
      return (data?.items || []) as GCalEvent[]
    },
    enabled: gcal.connected,
  })

  const today = getDayStart(new Date())
  const isToday = (d: Date) => d.getTime() === today.getTime()

  // Grouper par jour — prospects DB
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
          {/* Google Calendar connexion */}
          {gcal.connected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
              <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
              <span className="text-[12px] text-emerald-700 font-medium">Google Calendar connecté</span>
              <button onClick={gcal.disconnect} className="text-[10px] text-emerald-500 hover:text-red-500 ml-1">Déconnecter</button>
            </div>
          ) : (
            <button onClick={gcal.connect}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              <span className="text-[12px] text-gray-600 font-medium">Connecter Google Calendar</span>
            </button>
          )}
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
                      {/* RDV Callio (DB) */}
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
                      {/* Google Calendar events */}
                      {(gcalEvents || []).filter(ev => {
                        if (!ev.start?.dateTime) return false
                        const evDate = getDayStart(new Date(ev.start.dateTime))
                        return evDate.getTime() === day.getTime() && new Date(ev.start.dateTime).getHours() === hour
                      }).map(ev => {
                        const evTime = new Date(ev.start.dateTime!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                        return (
                          <div key={ev.id}
                            className="absolute inset-x-1 rounded-lg px-2 py-1 cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
                            style={{ background: '#4285F418', borderLeft: '3px solid #4285F4', top: `${(new Date(ev.start.dateTime!).getMinutes() / 60) * 100}%` }}>
                            <p className="text-[10px] font-bold truncate text-blue-600">{evTime}</p>
                            <p className="text-[11px] font-medium text-gray-700 truncate">{ev.summary}</p>
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
