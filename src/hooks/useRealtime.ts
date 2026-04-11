/**
 * useRealtime — Supabase Realtime subscriptions.
 * Met a jour le cache TanStack Query en push (pas de polling).
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'

export function useRealtimeCalls() {
  const queryClient = useQueryClient()
  const { profile, organisation } = useAuth()

  useEffect(() => {
    if (!profile || !organisation) return

    const channel = supabase
      .channel('calls-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'calls',
        filter: `organisation_id=eq.${organisation.id}`,
      }, () => {
        // Invalider le cache pour forcer un refetch
        queryClient.invalidateQueries({ queryKey: ['calls'] })
        queryClient.invalidateQueries({ queryKey: ['calls-by-phone'] })
        queryClient.invalidateQueries({ queryKey: ['calls-by-prospect'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, organisation?.id, queryClient])
}

export function useRealtimeProspects() {
  const queryClient = useQueryClient()
  const { organisation } = useAuth()

  useEffect(() => {
    if (!organisation) return

    const channel = supabase
      .channel('prospects-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'prospects',
        filter: `organisation_id=eq.${organisation.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['prospects'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [organisation?.id, queryClient])
}
