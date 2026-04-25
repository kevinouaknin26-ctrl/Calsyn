/**
 * Calendar — Page calendrier avec RDV des prospects.
 * Affiche les RDV de la semaine depuis la DB (rdv_date sur prospects).
 * Vue jour par défaut avec navigation semaine.
 */

import { useState, useEffect, useCallback, useMemo, Component, type ReactNode } from 'react'
import { normalizePhone } from '@/utils/phone'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useCall } from '@/contexts/CallContext'
import { useCallsByProspect } from '@/hooks/useCalls'
import { useProspectLists } from '@/hooks/useProspects'
import ProspectModal from '@/components/call/ProspectModal'
import UpcomingRdvBar from '@/components/ui/UpcomingRdvBar'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import type { Prospect } from '@/types/prospect'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

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

const HOURS = Array.from({ length: 24 }, (_, i) => i) // 0h -> 23h

// ── GCal event type ─────────────────────────────────────────────
type GCalEvent = {
  id: string
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string }
  end: { dateTime?: string }
}

// ── Parsing helpers for Google Calendar events ──────────────────

function isMurmuseEvent(summary: string): boolean {
  const lower = (summary || '').toLowerCase()
  return lower.includes('presentation murmuse') ||
    lower.includes('présentation murmuse') ||
    lower.includes('rdv murmuse')
}

function extractPhone(text: string): string | null {
  if (!text) return null
  const patterns = [
    /(\+33\s*[1-9](?:\s*\d{2}){4})/,
    /(\+33[1-9]\d{8})/,
    /(0[1-9](?:\s*\d{2}){4})/,
    /(0[1-9]\d{8})/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[1].replace(/\s+/g, '')
  }
  return null
}

function extractEmail(text: string): string | null {
  if (!text) return null
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)
  return m ? m[0] : null
}

function extractNameFromSummary(summary: string): string {
  if (!summary) return ''
  const dashMatch = summary.match(/(?:murmuse|Murmuse)\s*[-–]\s*(.+)/)
  if (dashMatch) return dashMatch[1].trim()
  const parenMatch = summary.match(/\(([^)]+)\)/)
  if (parenMatch) return parenMatch[1].trim()
  const avecMatch = summary.match(/avec\s+(.+)/i)
  if (avecMatch) return avecMatch[1].trim()
  return ''
}

interface ParsedEventData {
  name: string
  phone: string | null
  email: string | null
  isMurmuse: boolean
  startTime: string | null
}

function parseGCalEvent(ev: GCalEvent): ParsedEventData {
  const allText = [ev.summary, ev.description, ev.location].filter(Boolean).join(' ')
  return {
    name: extractNameFromSummary(ev.summary || '') || ev.summary || '',
    phone: extractPhone(allText),
    email: extractEmail(ev.description || '') || extractEmail(ev.location || ''),
    isMurmuse: isMurmuseEvent(ev.summary || ''),
    startTime: ev.start?.dateTime || null,
  }
}

// Error boundary pour voir le crash au lieu d'une page blanche
class CalendarErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="h-screen bg-[#f5f3ff] flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-lg border border-red-200 p-8 max-w-lg">
            <h2 className="text-[16px] font-bold text-red-600 mb-2">Erreur Calendar</h2>
            <p className="text-[13px] text-gray-600 mb-3">{this.state.error.message}</p>
            <pre className="text-[10px] text-gray-400 bg-gray-50 rounded-lg p-3 overflow-auto max-h-40">{this.state.error.stack}</pre>
            <button onClick={() => { this.setState({ error: null }); window.location.reload() }}
              className="mt-4 px-4 py-2 bg-violet-500 text-white rounded-lg text-[13px] font-medium">Recharger</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function NowLine({ weekDays }: { weekDays: Date[] }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60000) // update every minute
    return () => clearInterval(iv)
  }, [])

  const todayIdx = weekDays.findIndex(d =>
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  )
  if (todayIdx === -1) return null // today not in this week

  const hour = now.getHours()
  const minutes = now.getMinutes()
  const firstHour = HOURS[0]
  const lastHour = HOURS[HOURS.length - 1] + 1
  if (hour < firstHour || hour >= lastHour) return null

  const top = (hour - firstHour) * 80 + (minutes / 60) * 80
  const colCount = weekDays.length || 7
  const left = `calc(56px + ${(todayIdx / colCount)} * (100% - 56px))`
  const width = `calc((100% - 56px) / ${colCount})`

  return (
    <div className="absolute z-20 pointer-events-none" style={{ top, left, width }}>
      <div className="flex items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 shadow-sm shadow-red-200" />
        <div className="flex-1 h-[2px] bg-red-500 shadow-sm shadow-red-200" />
      </div>
    </div>
  )
}

function CalendarInner() {
  const { organisation, profile } = useAuth()
  const queryClient = useQueryClient()
  const gcal = useGoogleCalendar()
  const cm = useCall()
  const [currentDate, setCurrentDate] = useState(getDayStart(new Date()))
  const [view, setView] = useState<'day' | 'week' | 'month'>('week')
  const [showWeekends, setShowWeekends] = useState<boolean>(() => {
    try { return localStorage.getItem('cal-show-weekends') !== '0' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('cal-show-weekends', showWeekends ? '1' : '0') } catch { /* */ }
  }, [showWeekends])
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const { data: callHistory } = useCallsByProspect(selectedProspect?.id || null, selectedProspect?.phone)

  // Event popup state (for unmatched GCal events)
  const [clickedEvent, setClickedEvent] = useState<GCalEvent | null>(null)
  const [showEventPopup, setShowEventPopup] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  const { data: lists } = useProspectLists()

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
      // Dédupliquer par téléphone (même prospect dans plusieurs listes)
      const seen = new Set<string>()
      const unique = (data || []).filter(p => {
        const key = normalizePhone(p.phone) || p.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      return unique as Prospect[]
    },
    enabled: !!organisation?.id,
  })

  // Rappels de la semaine (snoozed_until)
  const { data: weekReminders } = useQuery({
    queryKey: ['reminders-calendar', weekStart.toISOString(), organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data } = await supabase
        .from('prospects')
        .select('id, list_id, name, phone, email, company, title, crm_status, last_call_outcome, rdv_date, snoozed_until, meeting_booked, call_count')
        .eq('organisation_id', organisation.id)
        .gte('snoozed_until', weekStart.toISOString())
        .lt('snoozed_until', weekEnd.toISOString())
        .order('snoozed_until', { ascending: true })
      return (data || []) as Prospect[]
    },
    enabled: !!organisation?.id,
  })

  // All prospects for phone matching (sync feature)
  const { data: allOrgProspects } = useQuery({
    queryKey: ['all-prospects-phones', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data, error } = await supabase
        .from('prospects')
        .select('id, list_id, organisation_id, name, phone, phone2, phone3, phone4, phone5, email, company, title, sector, linkedin_url, website_url, status, crm_status, call_count, last_call_at, last_call_outcome, snoozed_until, rdv_date, do_not_call, meeting_booked, address, city, postal_code, country, created_at')
        .eq('organisation_id', organisation.id)
      if (error) throw error
      return (data || []) as Prospect[]
    },
    enabled: !!organisation?.id,
  })

  // Phone -> prospect map (normalisé E.164, inclut phone2-5)
  const phoneMap = useMemo(() => {
    const m = new Map<string, Prospect>()
    for (const p of (allOrgProspects || [])) {
      for (const ph of [p.phone, p.phone2, p.phone3, p.phone4, p.phone5]) {
        const norm = normalizePhone(ph)
        if (norm && !m.has(norm)) m.set(norm, p)
      }
    }
    return m
  }, [allOrgProspects])

  // Google Calendar events
  const { data: gcalEvents } = useQuery({
    queryKey: ['gcal-events', weekStart.toISOString(), gcal.connected],
    queryFn: async () => {
      if (!gcal.connected) return []
      const data = await gcal.listEvents(weekStart.toISOString(), weekEnd.toISOString())
      return (data?.items || []) as GCalEvent[]
    },
    enabled: gcal.connected,
  })

  // Tous les RDV + rappels à venir pour la barre du bas
  const { data: allUpcomingRdvs } = useQuery({
    queryKey: ['rdv-upcoming', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const now = new Date().toISOString()
      // RDV à venir
      const { data: rdvData } = await supabase
        .from('prospects')
        .select('id, list_id, name, phone, email, company, title, crm_status, last_call_outcome, rdv_date, snoozed_until, meeting_booked, call_count')
        .eq('organisation_id', organisation.id)
        .gte('rdv_date', now)
        .order('rdv_date', { ascending: true })
        .limit(50)
      // Rappels à venir (snoozed_until)
      const { data: reminderData } = await supabase
        .from('prospects')
        .select('id, list_id, name, phone, email, company, title, crm_status, last_call_outcome, rdv_date, snoozed_until, meeting_booked, call_count')
        .eq('organisation_id', organisation.id)
        .is('rdv_date', null)
        .gte('snoozed_until', now)
        .order('snoozed_until', { ascending: true })
        .limit(30)
      // Fusionner et trier par date effective (rdv_date ou snoozed_until)
      const all = [...(rdvData || []), ...(reminderData || [])]
      all.sort((a, b) => {
        const dateA = new Date(a.rdv_date || a.snoozed_until || 0).getTime()
        const dateB = new Date(b.rdv_date || b.snoozed_until || 0).getTime()
        return dateA - dateB
      })
      // Dédupliquer
      const seen = new Set<string>()
      return all.filter(p => {
        const key = normalizePhone(p.phone) || p.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }) as Prospect[]
    },
    enabled: !!organisation?.id,
  })

  const today = getDayStart(new Date())
  const isToday = (d: Date) => d.getTime() === today.getTime()

  // Auto-scroll pile sur la ligne rouge (heure actuelle centrée)
  useEffect(() => {
    const el = document.getElementById('calendar-grid')
    if (el) {
      const now = new Date()
      const pos = now.getHours() * 80 + (now.getMinutes() / 60) * 80
      el.scrollTop = Math.max(0, pos - el.clientHeight / 3) // ligne rouge dans le premier tiers
    }
  }, [])

  // Grouper par jour — prospects DB
  const byDay: Record<string, Prospect[]> = {}
  for (const p of (rdvProspects || [])) {
    if (!p.rdv_date) continue
    const dayKey = getDayStart(new Date(p.rdv_date)).toISOString()
    if (!byDay[dayKey]) byDay[dayKey] = []
    byDay[dayKey].push(p)
  }

  const prev = () => {
    const d = new Date(currentDate)
    if (view === 'day') d.setDate(d.getDate() - 1)
    else if (view === 'month') d.setMonth(d.getMonth() - 1)
    else d.setDate(d.getDate() - 7)
    setCurrentDate(getDayStart(d))
  }
  const next = () => {
    const d = new Date(currentDate)
    if (view === 'day') d.setDate(d.getDate() + 1)
    else if (view === 'month') d.setMonth(d.getMonth() + 1)
    else d.setDate(d.getDate() + 7)
    setCurrentDate(getDayStart(d))
  }
  const goToday = () => setCurrentDate(getDayStart(new Date()))
  const prevWeek = prev
  const nextWeek = next

  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  // ── Auto-sync mutation ──
  const syncMutation = useMutation({
    mutationFn: async (events: GCalEvent[]) => {
      if (!organisation?.id || !profile?.id) return { created: 0 }
      let agendaList = lists?.find(l => l.name === 'Agenda')
      if (!agendaList) {
        const { data, error } = await supabase
          .from('prospect_lists')
          .insert({ name: 'Agenda', organisation_id: organisation.id, created_by: profile.id })
          .select('id, name, assigned_to, created_by, created_at')
          .single()
        if (error) throw error
        agendaList = data
        queryClient.invalidateQueries({ queryKey: ['prospect-lists'] })
      }
      if (!agendaList) throw new Error('Cannot create Agenda list')
      let created = 0
      for (const ev of events) {
        const parsed = parseGCalEvent(ev)
        if (!parsed.isMurmuse || !parsed.phone) continue
        const cleanPhone = normalizePhone(parsed.phone)
        if (phoneMap.has(cleanPhone)) continue
        const { error } = await supabase.from('prospects').insert({
          list_id: agendaList.id, organisation_id: organisation.id,
          name: parsed.name || 'Contact Agenda', phone: cleanPhone,
          email: parsed.email || null, crm_status: 'rdv_pris',
          rdv_date: parsed.startTime, meeting_booked: true,
        })
        if (!error) created++
      }
      return { created }
    },
    onSuccess: (result) => {
      if (result && result.created > 0) {
        setSyncStatus(`${result.created} contact${result.created > 1 ? 's' : ''} cree${result.created > 1 ? 's' : ''} depuis l'agenda`)
        queryClient.invalidateQueries({ queryKey: ['all-prospects-phones'] })
        queryClient.invalidateQueries({ queryKey: ['rdv-calendar'] })
        queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
        queryClient.invalidateQueries({ queryKey: ['prospect-lists'] })
        setTimeout(() => setSyncStatus(null), 4000)
      } else {
        setSyncStatus('Aucun nouveau contact a creer')
        setTimeout(() => setSyncStatus(null), 3000)
      }
    },
  })

  // ── GCal event click handler — auto-crée la fiche si pas trouvée ──
  // ── Create contact from event ──
  const createFromEvent = useCallback(async (ev: GCalEvent) => {
    if (!organisation?.id || !profile?.id) return
    const parsed = parseGCalEvent(ev)
    if (!parsed.phone) return
    let agendaList = lists?.find(l => l.name === 'Agenda')
    if (!agendaList) {
      const { data, error } = await supabase
        .from('prospect_lists')
        .insert({ name: 'Agenda', organisation_id: organisation.id, created_by: profile.id })
        .select('id, name, assigned_to, created_by, created_at')
        .single()
      if (error) return
      agendaList = data
      queryClient.invalidateQueries({ queryKey: ['prospect-lists'] })
    }
    if (!agendaList) return
    const { data, error } = await supabase.from('prospects').insert({
      list_id: agendaList.id, organisation_id: organisation.id,
      name: parsed.name || 'Contact Agenda', phone: parsed.phone.replace(/\s+/g, ''),
      email: parsed.email || null, crm_status: 'rdv_pris',
      rdv_date: parsed.startTime, meeting_booked: true,
    }).select().single()
    if (!error && data) {
      queryClient.invalidateQueries({ queryKey: ['all-prospects-phones'] })
      queryClient.invalidateQueries({ queryKey: ['rdv-calendar'] })
      queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
      setShowEventPopup(false)
      setClickedEvent(null)
      setSelectedProspect(data as Prospect)
    }
  }, [organisation?.id, profile?.id, lists, queryClient])

  // ── GCal event click handler ──
  const handleGCalEventClick = useCallback(async (ev: GCalEvent) => {
    const parsed = parseGCalEvent(ev)
    if (parsed.phone) {
      const prospect = phoneMap.get(normalizePhone(parsed.phone))
      if (prospect) { setSelectedProspect(prospect); return }
    }
    if (rdvProspects) {
      const name = extractNameFromSummary(ev.summary || '').toLowerCase()
      if (name) {
        const match = rdvProspects.find(p => p.name.toLowerCase().includes(name) || name.includes(p.name.toLowerCase()))
        if (match) { setSelectedProspect(match as Prospect); return }
      }
    }
    if (parsed.phone) {
      await createFromEvent(ev)
    }
  }, [phoneMap, rdvProspects, createFromEvent])

  // Count syncable Murmuse events
  const syncableCount = useMemo(() => {
    if (!gcalEvents) return 0
    return gcalEvents.filter(ev => {
      const parsed = parseGCalEvent(ev)
      if (!parsed.isMurmuse || !parsed.phone) return false
      return !phoneMap.has(normalizePhone(parsed.phone))
    }).length
  }, [gcalEvents, phoneMap])

  return (
    <div className="h-screen bg-[#f5f3ff] p-4 pl-2 overflow-hidden flex flex-col">
      {/* Bandeau RDV à venir — en haut (partagé Dialer/CRM/Calendar) */}
      <div className="mb-3 -mx-2 px-2">
        <UpcomingRdvBar onProspectClick={p => setSelectedProspect(p)} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[20px] font-bold text-gray-800">Calendrier</h1>
          <span className="text-[13px] text-gray-400">
            {weekDays[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} — {weekDays[6].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Sync status toast */}
          {syncStatus && (
            <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-700 font-medium">
              {syncStatus}
            </div>
          )}
          {/* Sync button */}
          {gcal.connected && syncableCount > 0 && (
            <button onClick={() => gcalEvents && syncMutation.mutate(gcalEvents)}
              disabled={syncMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors text-[12px] text-teal-700 font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncMutation.isPending ? 'Sync...' : `Sync ${syncableCount} contact${syncableCount > 1 ? 's' : ''}`}
            </button>
          )}
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
          {/* Toggle Day / Week / Month */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView('day')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${view === 'day' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>Jour</button>
            <button onClick={() => setView('week')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${view === 'week' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>Semaine</button>
            <button onClick={() => setView('month')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${view === 'month' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>Mois</button>
          </div>
          {/* Toggle weekends */}
          {view !== 'day' && (
            <button onClick={() => setShowWeekends(v => !v)}
              title={showWeekends ? 'Masquer les week-ends' : 'Afficher les week-ends'}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${showWeekends ? 'bg-white text-gray-700 border-gray-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
              {showWeekends ? 'Week-ends' : 'Sem.'}
            </button>
          )}
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
        {view === 'month' && (() => {
          // Grille mois : 6 rangées x 7 colonnes (jours lundi..dimanche)
          const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
          const firstWeekOffset = (monthStart.getDay() + 6) % 7 // lundi = 0
          const gridStart = new Date(monthStart)
          gridStart.setDate(1 - firstWeekOffset)
          const gridDays: Date[] = []
          for (let i = 0; i < 42; i++) {
            const d = new Date(gridStart)
            d.setDate(gridStart.getDate() + i)
            gridDays.push(getDayStart(d))
          }
          // Map événements (rdvProspects + gcalEvents) par jour
          const byDayMonth: Record<string, Array<{ key: string; time: string; name: string; color: string; onClick: () => void }>> = {}
          for (const p of (rdvProspects || [])) {
            if (!p.rdv_date) continue
            const k = getDayStart(new Date(p.rdv_date)).toISOString()
            if (!byDayMonth[k]) byDayMonth[k] = []
            byDayMonth[k].push({
              key: 'p-' + p.id,
              time: new Date(p.rdv_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
              name: p.name,
              color: '#0d9488',
              onClick: () => setSelectedProspect(p),
            })
          }
          for (const ev of (gcalEvents || [])) {
            if (!ev.start?.dateTime) continue
            const evDate = getDayStart(new Date(ev.start.dateTime))
            const k = evDate.toISOString()
            // Skip si déjà dans byDayMonth (matched by phone/name avec un prospect)
            if (byDayMonth[k]?.some(x => x.name.toLowerCase() === extractNameFromSummary(ev.summary || '').toLowerCase().trim())) continue
            if (!byDayMonth[k]) byDayMonth[k] = []
            byDayMonth[k].push({
              key: 'g-' + ev.id,
              time: new Date(ev.start.dateTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
              name: ev.summary || '(sans titre)',
              color: '#3b82f6',
              onClick: () => { setClickedEvent(ev); setShowEventPopup(true) },
            })
          }
          for (const k in byDayMonth) byDayMonth[k].sort((a, b) => a.time.localeCompare(b.time))

          const isWeekendD = (d: Date) => { const x = d.getDay(); return x === 0 || x === 6 }
          const monthDayNames = showWeekends ? dayNames : dayNames.slice(0, 5)
          const visibleGridDays = showWeekends ? gridDays : gridDays.filter(d => !isWeekendD(d))
          const monthCols = showWeekends ? 'grid-cols-7' : 'grid-cols-5'

          return (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header jours */}
              <div className={`grid ${monthCols} border-b border-gray-100 bg-gray-50/50`}>
                {monthDayNames.map(n => (
                  <div key={n} className="py-2 text-center text-[10px] uppercase text-gray-400 font-bold tracking-wider border-r border-gray-100 last:border-r-0">{n}</div>
                ))}
              </div>
              {/* Grille 6 semaines */}
              <div className={`flex-1 grid ${monthCols} grid-rows-6 overflow-hidden`}>
                {visibleGridDays.map((d, i) => {
                  const inMonth = d.getMonth() === currentDate.getMonth()
                  const k = d.toISOString()
                  const events = byDayMonth[k] || []
                  return (
                    <div key={i}
                      onClick={() => { setView('day'); setCurrentDate(d) }}
                      className={`border-r border-b border-gray-100 last:border-r-0 p-1 overflow-hidden flex flex-col cursor-pointer hover:bg-violet-50/30 ${
                        !inMonth ? 'bg-gray-50/30' : isToday(d) ? 'bg-violet-50/40' : 'bg-white'
                      }`}>
                      <div className={`text-[11px] font-semibold ${
                        !inMonth ? 'text-gray-300' : isToday(d) ? 'text-violet-600' : 'text-gray-700'
                      }`}>{d.getDate()}{isToday(d) && <span className="ml-1 text-[8px] font-bold uppercase">aujourd'hui</span>}</div>
                      <div className="flex-1 mt-1 space-y-0.5 overflow-hidden">
                        {events.slice(0, 3).map(e => (
                          <button key={e.key} onClick={ev => { ev.stopPropagation(); e.onClick() }}
                            className="w-full text-left rounded px-1 py-0.5 text-[9px] truncate hover:opacity-80"
                            style={{ background: e.color + '18', color: e.color }}>
                            <span className="font-mono mr-1">{e.time}</span>{e.name}
                          </button>
                        ))}
                        {events.length > 3 && (
                          <button onClick={ev => { ev.stopPropagation(); setView('day'); setCurrentDate(d) }}
                            className="text-[9px] text-gray-400 hover:text-gray-600 px-1">
                            +{events.length - 3} autre{events.length - 3 > 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
        {view !== 'month' && (() => {
          // En mode 'day', on n'affiche que la date courante. En 'week', toute la semaine.
          // Optionnel : masquer Sam/Dim si showWeekends=false (vue semaine uniquement).
          const isWeekend = (d: Date) => { const x = d.getDay(); return x === 0 || x === 6 }
          const renderDays = view === 'day'
            ? [currentDate]
            : (showWeekends ? weekDays : weekDays.filter(d => !isWeekend(d)))
          const colCount = renderDays.length
          const cols = colCount === 1 ? 'grid-cols-1' : colCount === 5 ? 'grid-cols-5' : 'grid-cols-7'
          return (
          <>
        {/* Header jours */}
        <div className="flex border-b border-gray-100">
          <div className="w-14 flex-shrink-0" />
          <div className={`flex-1 grid ${cols}`}>
          {renderDays.map((day, i) => {
            const dayRdvs = byDay[day.toISOString()] || []
            const dayName = dayNames[(day.getDay() + 6) % 7]
            return (
              <div key={i} className={`py-3 text-center border-r border-gray-100 last:border-r-0 ${isToday(day) ? 'bg-violet-50' : ''}`}>
                <p className="text-[10px] text-gray-400 uppercase">{dayName}</p>
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
        </div>

        {/* Grille horaires — events en absolute positioning style Google Calendar */}
        <div className="flex-1 overflow-y-auto" id="calendar-grid">
          <div className="relative" style={{ height: HOURS.length * 80 }}>
            {/* Ligne rouge "maintenant" */}
            <NowLine weekDays={renderDays} />
            {/* Background grille horaires */}
            {HOURS.map((hour, hi) => (
              <div key={hour} className="flex border-b border-gray-50" style={{ height: 80, position: 'absolute', top: hi * 80, left: 0, right: 0 }}>
                <div className="w-14 flex-shrink-0 text-right pr-2 pt-1">
                  <span className="text-[10px] text-gray-300 font-mono">{hour}:00</span>
                </div>
                <div className={`flex-1 grid ${cols}`}>
                  {renderDays.map((day, di) => (
                    <div key={di} className={`border-r border-gray-50 last:border-r-0 ${isToday(day) ? 'bg-violet-50/20' : ''}`} />
                  ))}
                </div>
              </div>
            ))}
            {/* Layer events absolute */}
            <div className="absolute inset-0 pointer-events-none flex">
              <div className="w-14 flex-shrink-0" />
              <div className={`flex-1 grid ${cols} h-full`}>
                {renderDays.map((day, di) => {
                  const dayKey = day.toISOString()
                  type AbsEvent = { id: string; start: Date; end: Date; name: string; color: string; bg: string; onClick: () => void }
                  const events: AbsEvent[] = []

                  // RDV DB
                  for (const p of (byDay[dayKey] || [])) {
                    if (!p.rdv_date) continue
                    const start = new Date(p.rdv_date)
                    const end = new Date(start.getTime() + 30 * 60000) // 30 min default
                    const isPast = start < new Date()
                    const c = p.crm_status === 'rdv_fait' ? '#059669' : p.crm_status === 'signe' || p.crm_status === 'paye' ? '#10b981' : isPast ? '#f59e0b' : '#7c3aed'
                    events.push({
                      id: p.id, start, end,
                      name: p.name, color: c, bg: c + '15',
                      onClick: () => setSelectedProspect(p as Prospect),
                    })
                  }

                  // Rappels
                  for (const p of (weekReminders || [])) {
                    if (!p.snoozed_until) continue
                    const d = new Date(p.snoozed_until)
                    if (getDayStart(d).getTime() !== day.getTime()) continue
                    const isMidnight = d.getHours() === 0 && d.getMinutes() === 0
                    const start = new Date(d)
                    if (isMidnight) start.setHours(9, 0, 0, 0)
                    const end = new Date(start.getTime() + 30 * 60000)
                    events.push({
                      id: 'rem-' + p.id, start, end,
                      name: '🔔 ' + p.name, color: '#d97706', bg: '#fef3c720',
                      onClick: () => setSelectedProspect(p as Prospect),
                    })
                  }

                  // Events Google Calendar (sauf doublons matchés)
                  const dayRdvs = byDay[dayKey] || []
                  for (const ev of (gcalEvents || [])) {
                    if (!ev.start?.dateTime) continue
                    const start = new Date(ev.start.dateTime)
                    if (getDayStart(start).getTime() !== day.getTime()) continue
                    const end = ev.end?.dateTime ? new Date(ev.end.dateTime) : new Date(start.getTime() + 60 * 60000)
                    const parsed = parseGCalEvent(ev)
                    const evPhone = normalizePhone(parsed.phone)
                    const evName = extractNameFromSummary(ev.summary || '').toLowerCase().trim()
                    const matchByPhone = evPhone && dayRdvs.some(p => normalizePhone(p.phone) === evPhone)
                    const matchByName = evName.length > 2 && dayRdvs.some(p => {
                      const pName = p.name.toLowerCase().trim()
                      return pName === evName ||
                        pName.split(' ')[0] === evName.split(' ')[0] ||
                        pName.split(' ').pop() === evName.split(' ').pop()
                    })
                    if (matchByPhone || matchByName) continue
                    const hasMatch = evPhone ? phoneMap.has(evPhone) : false
                    const c = parsed.isMurmuse ? (hasMatch ? '#7c3aed' : '#f59e0b') : '#6366f1'
                    events.push({
                      id: ev.id, start, end,
                      name: ev.summary || 'Sans titre', color: c, bg: c + '12',
                      onClick: () => handleGCalEventClick(ev),
                    })
                  }

                  // Trier par début + détecter overlaps pour les afficher côte-à-côte
                  events.sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime())
                  // Algo simple : assigner colonne via greedy interval scheduling
                  const cols2: AbsEvent[][] = []
                  const eventCols = new Map<string, { col: number; total: number }>()
                  for (const ev of events) {
                    let placed = false
                    for (let c = 0; c < cols2.length; c++) {
                      const last = cols2[c][cols2[c].length - 1]
                      if (last.end.getTime() <= ev.start.getTime()) {
                        cols2[c].push(ev)
                        eventCols.set(ev.id, { col: c, total: 0 })
                        placed = true
                        break
                      }
                    }
                    if (!placed) {
                      cols2.push([ev])
                      eventCols.set(ev.id, { col: cols2.length - 1, total: 0 })
                    }
                  }
                  // Pour chaque event, calculer "total" = nombre de colonnes en chevauchement à ce moment
                  for (const ev of events) {
                    let overlapping = 0
                    for (const c of cols2) {
                      if (c.some(other => other.start < ev.end && other.end > ev.start)) overlapping++
                    }
                    const cur = eventCols.get(ev.id)!
                    cur.total = Math.max(overlapping, 1)
                  }

                  const firstHour = HOURS[0]
                  const lastHour = HOURS[HOURS.length - 1] + 1

                  return (
                    <div key={di} className="relative">
                      {events.map(ev => {
                        const startHour = ev.start.getHours() + ev.start.getMinutes() / 60
                        const endHour = ev.end.getHours() + ev.end.getMinutes() / 60
                        if (endHour <= firstHour || startHour >= lastHour) return null
                        const visibleStart = Math.max(startHour, firstHour)
                        const visibleEnd = Math.min(endHour, lastHour)
                        const top = (visibleStart - firstHour) * 80
                        const height = Math.max((visibleEnd - visibleStart) * 80 - 2, 18)
                        const meta = eventCols.get(ev.id)!
                        const widthPct = 100 / meta.total
                        const leftPct = meta.col * widthPct
                        return (
                          <div key={ev.id} onClick={ev.onClick}
                            style={{
                              position: 'absolute',
                              top: `${top}px`,
                              height: `${height}px`,
                              left: `calc(${leftPct}% + 2px)`,
                              width: `calc(${widthPct}% - 4px)`,
                              background: ev.bg,
                              borderLeft: `3px solid ${ev.color}`,
                              pointerEvents: 'auto',
                            }}
                            className="rounded-md px-1.5 py-0.5 cursor-pointer hover:opacity-80 transition-all overflow-hidden">
                            <div className="flex items-center gap-1 leading-tight">
                              <span className="text-[9px] font-bold" style={{ color: ev.color }}>
                                {ev.start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="text-[10px] font-medium text-gray-700 truncate">{ev.name}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
          </>
          )
        })()}
      </div>

      {/* (RDV à venir : déplacé en haut via <UpcomingRdvBar /> au début du return) */}
      {/* ── Event Popup (for unmatched GCal events) ── */}
      {showEventPopup && clickedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => { setShowEventPopup(false); setClickedEvent(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[380px] p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-gray-800">Evenement Google Calendar</h3>
              <button onClick={() => { setShowEventPopup(false); setClickedEvent(null) }}
                className="text-gray-400 hover:text-red-400 text-lg">&#x2715;</button>
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">Titre</p>
                <p className="text-[13px] text-gray-800 font-medium">{clickedEvent.summary}</p>
              </div>
              {clickedEvent.start?.dateTime && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Date & heure</p>
                  <p className="text-[13px] text-gray-700">
                    {new Date(clickedEvent.start.dateTime).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {' a '}
                    {new Date(clickedEvent.start.dateTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              )}
              {clickedEvent.description && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Description</p>
                  <p className="text-[12px] text-gray-600 whitespace-pre-wrap max-h-20 overflow-y-auto">{clickedEvent.description}</p>
                </div>
              )}
              {clickedEvent.location && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Lieu</p>
                  <p className="text-[12px] text-gray-600">{clickedEvent.location}</p>
                </div>
              )}
              {/* Parsed data */}
              {(() => {
                const parsed = parseGCalEvent(clickedEvent)
                return (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Donnees extraites</p>
                    {parsed.name && <p className="text-[12px] text-gray-700"><span className="text-gray-400 mr-1">Nom :</span>{parsed.name}</p>}
                    {parsed.phone && <p className="text-[12px] text-gray-700"><span className="text-gray-400 mr-1">Tel :</span>{parsed.phone}</p>}
                    {parsed.email && <p className="text-[12px] text-gray-700"><span className="text-gray-400 mr-1">Email :</span>{parsed.email}</p>}
                    {!parsed.phone && (
                      <p className="text-[11px] text-amber-500 font-medium">Aucun telephone detecte -- creation impossible</p>
                    )}
                  </div>
                )
              })()}
            </div>
            {(() => {
              const parsed = parseGCalEvent(clickedEvent)
              return parsed.phone ? (
                <button onClick={() => createFromEvent(clickedEvent)}
                  className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[13px] font-semibold transition-colors">
                  Creer le contact
                </button>
              ) : (
                <button disabled
                  className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-400 text-[13px] font-semibold cursor-not-allowed">
                  Pas de telephone -- impossible de creer
                </button>
              )
            })()}
          </div>
        </div>
      )}

      {/* ProspectModal */}
      {selectedProspect && (
        <ProspectModal
          prospect={selectedProspect}
          callContext={cm.context}
          callHistory={callHistory || []}
          isInCall={cm.isConnected || cm.isDialing}
          isDisconnected={cm.isDisconnected}
          onCall={p => cm.call(p)}
          onClose={() => { if (cm.isDisconnected) cm.reset(); setSelectedProspect(null) }}
          onSetDisposition={cm.setDisposition}
          onSetNotes={cm.setNotes}
          onSetMeeting={cm.setMeeting}
          onReset={cm.reset}
          onNextCall={() => { cm.reset(); setSelectedProspect(null) }}
          providerReady={cm.providerReady}
        />
      )}
    </div>
  )
}

export default function Calendar() {
  return (
    <CalendarErrorBoundary>
      <CalendarInner />
    </CalendarErrorBoundary>
  )
}
