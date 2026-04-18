/**
 * useRealtime — Supabase Realtime subscriptions.
 * Met a jour le cache TanStack Query en push (pas de polling).
 */

import { useEffect, useState } from 'react'
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

/**
 * useAmdResult — Observe le résultat AMD (Answering Machine Detection) d'un call
 * en cours, mis à jour par amd-callback quand Twilio détecte machine/human.
 * Valeurs possibles : 'pending' | 'machine' | 'human' | 'unknown'.
 * Utilisé pour activer le bouton voicemail drop pile quand le bip est passé.
 */
export function useAmdResult(callSid: string | null): string | null {
  const [amdResult, setAmdResult] = useState<string | null>(null)

  useEffect(() => {
    if (!callSid) { setAmdResult(null); return }

    let cancelled = false
    // Fetch initial
    supabase
      .from('calls')
      .select('amd_result')
      .eq('call_sid', callSid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.amd_result) setAmdResult(data.amd_result)
      })

    // Subscribe aux updates de CE call
    const channel = supabase
      .channel(`call-amd-${callSid}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'calls',
        filter: `call_sid=eq.${callSid}`,
      }, (payload) => {
        const newAmd = (payload.new as { amd_result?: string })?.amd_result
        if (newAmd) setAmdResult(newAmd)
      })
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [callSid])

  return amdResult
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
