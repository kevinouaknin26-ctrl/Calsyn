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
import { useCallMachine } from '@/hooks/useCallMachine'
import { useCallsByProspect } from '@/hooks/useCalls'
import { useProspectLists } from '@/hooks/useProspects'
import ProspectModal from '@/components/call/ProspectModal'
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
  const left = `calc(56px + ${(todayIdx / 7)} * (100% - 56px))`
  const width = `calc((100% - 56px) / 7)`

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
  const cm = useCallMachine()
  const [currentDate, setCurrentDate] = useState(getDayStart(new Date()))
  const [view, setView] = useState<'day' | 'week'>('week')
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

  const prevWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(getDayStart(d)) }
  const nextWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(getDayStart(d)) }
  const goToday = () => setCurrentDate(getDayStart(new Date()))

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
        <div className="flex border-b border-gray-100">
          <div className="w-14 flex-shrink-0" />
          <div className="flex-1 grid grid-cols-7">
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
        </div>

        {/* Grille horaires */}
        <div className="flex-1 overflow-y-auto" id="calendar-grid">
          <div className="relative">
            {/* Ligne rouge "maintenant" */}
            <NowLine weekDays={weekDays} />
            {HOURS.map(hour => (
              <div key={hour} className="flex border-b border-gray-50" style={{ height: 80 }}>
                {/* Heure à gauche */}
                <div className="w-14 flex-shrink-0 text-right pr-2 pt-1">
                  <span className="text-[10px] text-gray-300 font-mono">{hour}:00</span>
                </div>
                {/* Colonnes jours */}
                <div className="flex-1 grid grid-cols-7">
                {weekDays.map((day, di) => {
                  const dayKey = day.toISOString()
                  // Combiner TOUS les events de cette heure (DB + Google) en une seule liste
                  type CalEvent = { id: string; time: string; name: string; subtitle?: string; color: string; bg: string; onClick: () => void; minutes: number }
                  const cellEvents: CalEvent[] = []

                  // Events DB (RDV)
                  const dayRdvs = (byDay[dayKey] || []).filter(p => p.rdv_date && new Date(p.rdv_date).getHours() === hour)
                  for (const p of dayRdvs) {
                    const isPast = new Date(p.rdv_date!) < new Date()
                    const c = p.crm_status === 'rdv_fait' ? '#059669' : p.crm_status === 'signe' || p.crm_status === 'paye' ? '#10b981' : isPast ? '#f59e0b' : '#7c3aed'
                    cellEvents.push({
                      id: p.id, minutes: new Date(p.rdv_date!).getMinutes(),
                      time: new Date(p.rdv_date!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                      name: p.name, subtitle: p.company || undefined, color: c, bg: c + '15',
                      onClick: () => setSelectedProspect(p as Prospect),
                    })
                  }

                  // Rappels (snoozed_until) — affichés à 9h par défaut
                  if (hour === 9 && weekReminders) {
                    const dayReminders = weekReminders.filter(p => {
                      if (!p.snoozed_until) return false
                      return getDayStart(new Date(p.snoozed_until)).getTime() === day.getTime()
                    })
                    for (const p of dayReminders) {
                      cellEvents.push({
                        id: 'rem-' + p.id, minutes: 0,
                        time: '09:00',
                        name: '🔔 ' + p.name, color: '#d97706', bg: '#fef3c720',
                        onClick: () => setSelectedProspect(p as Prospect),
                      })
                    }
                  }

                  // Events Google (seulement ceux PAS déjà dans DB par matching)
                  const gcalForHour = (gcalEvents || []).filter(ev => {
                    if (!ev.start?.dateTime) return false
                    const evDate = getDayStart(new Date(ev.start.dateTime))
                    return evDate.getTime() === day.getTime() && new Date(ev.start.dateTime).getHours() === hour
                  })
                  for (const ev of gcalForHour) {
                    const parsed = parseGCalEvent(ev)
                    // Skip si déjà dans DB — match par PHONE (prioritaire) puis par NOM
                    const evPhone = normalizePhone(parsed.phone)
                    const evName = extractNameFromSummary(ev.summary || '').toLowerCase().trim()
                    const matchByPhone = evPhone && dayRdvs.some(p => normalizePhone(p.phone) === evPhone)
                    const matchByName = evName.length > 2 && dayRdvs.some(p => {
                      const pName = p.name.toLowerCase().trim()
                      // Match exact ou premier/dernier mot en commun (pas substring aveugle)
                      return pName === evName ||
                        pName.split(' ')[0] === evName.split(' ')[0] ||
                        pName.split(' ').pop() === evName.split(' ').pop()
                    })
                    if (matchByPhone || matchByName) continue

                    const hasMatch = evPhone ? phoneMap.has(evPhone) : false
                    const c = parsed.isMurmuse ? (hasMatch ? '#7c3aed' : '#f59e0b') : '#6366f1'
                    cellEvents.push({
                      id: ev.id, minutes: new Date(ev.start.dateTime!).getMinutes(),
                      time: new Date(ev.start.dateTime!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                      name: ev.summary || 'Sans titre', color: c, bg: c + '12',
                      onClick: () => handleGCalEventClick(ev),
                    })
                  }

                  cellEvents.sort((a, b) => a.minutes - b.minutes)

                  return (
                    <div key={di} className={`border-r border-gray-50 last:border-r-0 p-0.5 ${isToday(day) ? 'bg-violet-50/20' : ''}`}>
                      {di === 0 && (
                        <span className="absolute -left-0 -top-2 text-[9px] text-gray-300 font-mono bg-white px-1">{hour}:00</span>
                      )}
                      <div className="flex flex-col gap-0.5 h-full">
                        {cellEvents.map(ev => (
                          <div key={ev.id} onClick={ev.onClick}
                            className="rounded-md px-1.5 py-0.5 cursor-pointer hover:opacity-80 transition-all overflow-hidden flex-shrink-0"
                            style={{ background: ev.bg, borderLeft: `3px solid ${ev.color}` }}>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-bold" style={{ color: ev.color }}>{ev.time}</span>
                              <span className="text-[10px] font-medium text-gray-700 truncate">{ev.name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RDV à venir */}
      {allUpcomingRdvs && allUpcomingRdvs.length > 0 && (() => {
        const allRdvs = allUpcomingRdvs
        return (
          <div className="mt-2 bg-white rounded-xl border border-teal-100 px-4 py-2.5 flex-shrink-0">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div className="flex items-center gap-1.5 flex-shrink-0 pr-2 border-r border-teal-100">
                <svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-[11px] font-semibold text-teal-600">{allRdvs.length}</span>
              </div>
              {allRdvs.map((p, i) => {
                const isReminder = !p.rdv_date && p.snoozed_until
                const effectiveDate = new Date(p.rdv_date || p.snoozed_until || 0)
                const time = effectiveDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                const day = effectiveDate.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
                const isFirst = i === 0
                return (
                  <div key={p.id} onClick={() => setSelectedProspect(p as Prospect)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border flex-shrink-0 cursor-pointer hover:shadow-sm transition-all ${
                      isFirst ? 'border-teal-300 bg-teal-50' :
                      isReminder ? 'border-amber-200 bg-amber-50/50 hover:border-amber-300' :
                      'border-gray-200 bg-white hover:border-teal-200'
                    }`}>
                    {isReminder && <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    <span className={`text-[9px] font-bold uppercase ${isReminder ? 'text-amber-400' : 'text-teal-400'}`}>{day}</span>
                    <span className={`text-[11px] font-mono font-bold ${isFirst ? 'text-teal-700' : isReminder ? 'text-amber-600' : 'text-teal-600'}`}>{time}</span>
                    <span className="text-[11px] font-medium text-gray-700 max-w-[120px] truncate">{p.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
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
