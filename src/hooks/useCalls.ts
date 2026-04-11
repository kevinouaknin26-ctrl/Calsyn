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
        .select('id, organisation_id, sdr_id, prospect_id, prospect_name, prospect_phone, call_sid, conference_sid, call_outcome, call_duration, note, meeting_booked, recording_url, provider, ai_analysis_status, ai_score_global, ai_summary, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (isManager && organisation?.id) {
        query = query.eq('organisation_id', organisation.id)
      } else {
        query = query.eq('sdr_id', profile.id)
      }

      const { data, error } = await query
      if (error) throw error
      return data as Call[]
    },
    enabled: !!profile,
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
