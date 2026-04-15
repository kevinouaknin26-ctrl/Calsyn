/**
 * useCalls — TanStack Query hook pour l'historique d'appels.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Call } from '@/types/call'

export function useCalls(limit = 200) {
  const { profile, organisation, isManager } = useAuth()

  return useQuery({
    queryKey: ['calls', organisation?.id, profile?.id, limit],
    queryFn: async () => {
      if (!profile) return []

      let query = supabase
        .from('calls')
        .select('id, organisation_id, sdr_id, prospect_id, prospect_name, prospect_phone, call_sid, conference_sid, call_outcome, call_duration, note, meeting_booked, recording_url, provider, ai_analysis_status, ai_score_global, ai_score_accroche, ai_score_objection, ai_score_closing, ai_summary, ai_transcript, ai_points_forts, ai_points_amelioration, ai_intention_prospect, ai_prochaine_etape, from_number, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

      // Admin voit tous les calls (y compris ceux sans org_id — webhook)
      // SDR voit seulement ses propres calls
      if (!isManager) {
        query = query.eq('sdr_id', profile.id)
      }

      const { data, error } = await query
      if (error) throw error
      return data as Call[]
    },
    enabled: !!profile,
  })
}

export function useCallsByProspect(prospectId: string | null, phone?: string | null) {
  return useQuery({
    queryKey: ['calls-by-prospect', prospectId, phone],
    queryFn: async () => {
      if (!prospectId && !phone) return []
      // Chercher par téléphone (cross-listes) puis fallback par prospect_id
      if (phone) {
        const { data, error } = await supabase
          .from('calls')
          .select('*')
          .eq('prospect_phone', phone)
          .order('created_at', { ascending: false })
          .limit(50)
        if (!error && data && data.length > 0) return data as Call[]
      }
      if (prospectId) {
        const { data, error } = await supabase
          .from('calls')
          .select('*')
          .eq('prospect_id', prospectId)
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) throw error
        return data as Call[]
      }
      return []
    },
    enabled: !!(prospectId || phone),
  })
}

export function useCallsByProspectPhone(phone: string | null) {
  const { organisation } = useAuth()

  return useQuery({
    queryKey: ['calls-by-phone', phone],
    queryFn: async () => {
      if (!phone || !organisation?.id) return []
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('prospect_phone', phone)
        .eq('organisation_id', organisation.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as Call[]
    },
    enabled: !!phone && !!organisation?.id,
  })
}
