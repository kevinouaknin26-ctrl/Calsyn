/**
 * UpcomingRdvBar — bandeau RDV/rappels à venir, partagé entre Dialer/Calendar/CRMGlobal.
 *
 * Affiche les RDV (prospects.rdv_date >= now) + rappels (snoozed_until >= now)
 * triés par date effective. Au clic sur une carte, déclenche onProspectClick.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { normalizePhone } from '@/utils/phone'
import type { Prospect } from '@/types/prospect'

interface Props {
  onProspectClick: (p: Prospect) => void
}

export default function UpcomingRdvBar({ onProspectClick }: Props) {
  const { organisation } = useAuth()

  const { data: upcoming } = useQuery({
    queryKey: ['rdv-upcoming-bar', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const now = new Date().toISOString()
      const cols = 'id, list_id, name, phone, email, company, title, crm_status, last_call_outcome, rdv_date, snoozed_until, meeting_booked, call_count'
      const [{ data: rdvData }, { data: reminderData }] = await Promise.all([
        supabase.from('prospects').select(cols)
          .eq('organisation_id', organisation.id)
          .is('deleted_at', null)
          .gte('rdv_date', now)
          .order('rdv_date', { ascending: true }).limit(50),
        supabase.from('prospects').select(cols)
          .eq('organisation_id', organisation.id)
          .is('deleted_at', null)
          .is('rdv_date', null)
          .gte('snoozed_until', now)
          .order('snoozed_until', { ascending: true }).limit(30),
      ])
      const all = [...(rdvData || []), ...(reminderData || [])]
      all.sort((a, b) => {
        const da = new Date(a.rdv_date || a.snoozed_until || 0).getTime()
        const db = new Date(b.rdv_date || b.snoozed_until || 0).getTime()
        return da - db
      })
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

  if (!upcoming || upcoming.length === 0) return null

  return (
    <div className="px-5 py-2 bg-gradient-to-r from-teal-50 to-emerald-50 border-b border-teal-100 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-[13px] font-semibold text-teal-700">Prochains RDV</span>
          <span className="text-[11px] text-teal-500 bg-teal-100 px-1.5 py-0.5 rounded-full font-bold">{upcoming.length}</span>
        </div>
        <div className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {upcoming.map((p, i) => {
            const isReminder = !p.rdv_date && p.snoozed_until
            const eff = new Date(p.rdv_date || p.snoozed_until || 0)
            const time = eff.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            const day = eff.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
            const isFirst = i === 0
            return (
              <button key={p.id} onClick={() => onProspectClick(p)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border flex-shrink-0 cursor-pointer hover:shadow-sm transition-all ${
                  isFirst ? 'border-teal-400 bg-teal-100 ring-2 ring-teal-200 shadow-sm' :
                  isReminder ? 'border-amber-200 bg-amber-50/50 hover:border-amber-300' :
                  'border-teal-200 bg-white hover:border-teal-400'
                }`}>
                {isReminder && <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                <span className={`text-[9px] font-bold uppercase ${isReminder ? 'text-amber-400' : 'text-teal-400'}`}>{day}</span>
                <span className={`text-[11px] font-mono font-bold ${isFirst ? 'text-teal-700' : isReminder ? 'text-amber-600' : 'text-teal-600'}`}>{time}</span>
                <span className="text-[11px] font-medium text-gray-700 max-w-[140px] truncate">{p.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
