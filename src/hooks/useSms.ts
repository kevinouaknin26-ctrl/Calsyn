/**
 * useSms — gestion des SMS prospect (lecture + envoi via edge function).
 */

import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export interface SmsMessage {
  id: string
  organisation_id: string
  prospect_id: string | null
  user_id: string | null
  twilio_sid: string | null
  from_number: string
  to_number: string
  body: string
  direction: 'inbound' | 'outbound'
  status: string | null
  created_at: string
}

/** Liste tous les SMS d'un prospect (par phone numbers, lookup côté DB). */
export function useSmsForProspect(prospectId: string | null, phoneNumbers: string[]) {
  const queryClient = useQueryClient()

  // Realtime : écoute les INSERT sur sms_messages et invalide la query courante.
  // Permet d'afficher les SMS reçus en direct (style WhatsApp / Messenger).
  useEffect(() => {
    if (!prospectId && phoneNumbers.filter(Boolean).length === 0) return
    const channel = supabase
      .channel(`sms-prospect-${prospectId || phoneNumbers[0]}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_messages' }, payload => {
        const row = (payload.new || payload.old) as { prospect_id?: string; from_number?: string; to_number?: string }
        const matches =
          (prospectId && row.prospect_id === prospectId) ||
          phoneNumbers.some(p => p && (row.from_number === p || row.to_number === p))
        if (matches) {
          queryClient.invalidateQueries({ queryKey: ['sms-prospect'] })
        }
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectId, phoneNumbers.join(','), queryClient])

  return useQuery({
    queryKey: ['sms-prospect', prospectId, phoneNumbers.join(',')],
    queryFn: async () => {
      if (!prospectId && phoneNumbers.length === 0) return []
      const phones = phoneNumbers.filter(Boolean)
      // 5 .eq() en parallèle (évite l'encoding bug du .or() avec '+' E.164)
      const queries: Promise<{ data: SmsMessage[] | null }>[] = []
      if (prospectId) {
        queries.push(supabase.from('sms_messages').select('*').eq('prospect_id', prospectId) as unknown as Promise<{ data: SmsMessage[] | null }>)
      }
      for (const phone of phones) {
        queries.push(supabase.from('sms_messages').select('*').eq('from_number', phone) as unknown as Promise<{ data: SmsMessage[] | null }>)
        queries.push(supabase.from('sms_messages').select('*').eq('to_number', phone) as unknown as Promise<{ data: SmsMessage[] | null }>)
      }
      const results = await Promise.all(queries)
      const merged = new Map<string, SmsMessage>()
      for (const r of results) {
        for (const m of (r.data || [])) merged.set(m.id, m)
      }
      return Array.from(merged.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    },
    enabled: !!prospectId || phoneNumbers.filter(Boolean).length > 0,
    refetchInterval: 15000,
  })
}

export function useSendSms() {
  const queryClient = useQueryClient()
  return useCallback(async (input: { to: string; body: string; prospectId?: string; fromNumber?: string; mediaUrl?: string }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'No session' }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/sms-send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = await res.json()
    if (data?.ok) {
      queryClient.invalidateQueries({ queryKey: ['sms-prospect'] })
    }
    return data as { ok?: boolean; sid?: string; status?: string; error?: string }
  }, [queryClient])
}
