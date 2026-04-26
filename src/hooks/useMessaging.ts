/**
 * useMessaging — hooks pour la messagerie unifiée.
 *
 * - useConversations()   : liste des conversations groupées par prospect
 *                          (last message + unread count + last channel)
 * - useConversation(id)  : timeline complet (tous canaux mélangés) + send()
 *
 * Source de vérité : table `messages` (channel-agnostic, voir migration 020).
 * Realtime via Supabase pour push instantané.
 */

import { useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { getChannel } from '@/services/channels'
import type { ChannelId, UnifiedMessage, SendInput } from '@/services/channels'

export type { UnifiedMessage, ChannelId } from '@/services/channels'

// ────────────────────────────────────────────────────────────
// useConversations : 1 row par prospect avec dernier message
// ────────────────────────────────────────────────────────────

export interface ConversationSummary {
  prospect_id: string
  prospect_name: string | null
  prospect_phone: string | null
  prospect_email: string | null
  last_message: UnifiedMessage
  last_channel: ChannelId
  unread_count: number
  total_count: number
}

export function useConversations() {
  const { organisation, user } = useAuth()
  const orgId = organisation?.id
  const userId = user?.id

  return useQuery({
    queryKey: ['conversations', orgId, userId],
    queryFn: async (): Promise<ConversationSummary[]> => {
      if (!orgId) return []

      // 1. Pull les messages récents de l'org (300 derniers)
      // STRICT : chacun voit UNIQUEMENT ses propres messages (chacun son mail/num).
      // Les admins voient les messages de leur équipe via impersonation, pas via la messagerie.
      let q = supabase
        .from('messages')
        .select('*')
        .eq('organisation_id', orgId)
        .order('sent_at', { ascending: false })
        .limit(300)
      if (userId) q = q.eq('user_id', userId)
      const { data: msgs, error } = await q
      if (error) throw error

      // 2. Group by prospect_id (unread = is_read=false sur message_reads obsolète)
      const byProspect = new Map<string, UnifiedMessage[]>()
      for (const m of (msgs || []) as UnifiedMessage[]) {
        if (!m.prospect_id) continue
        const arr = byProspect.get(m.prospect_id) || []
        arr.push(m)
        byProspect.set(m.prospect_id, arr)
      }
      if (byProspect.size === 0) return []

      // 3. Fetch prospect info en bulk
      const pids = Array.from(byProspect.keys())
      const { data: prospects } = await supabase
        .from('prospects')
        .select('id, name, phone, email')
        .in('id', pids)
      const pInfo = new Map((prospects || []).map(p => [p.id, p]))

      // 4. Composer les summaries — unread = direction='in' AND is_read=false
      // (sync avec Gmail labels pour les emails, manuel pour SMS/WA)
      const summaries: ConversationSummary[] = []
      for (const [pid, list] of byProspect) {
        const last = list[0] // déjà trié desc
        const unread_count = list.filter(m => m.direction === 'in' && !(m as any).is_read).length
        const p = pInfo.get(pid) || { id: pid, name: null, phone: null, email: null }
        summaries.push({
          prospect_id: pid,
          prospect_name: p.name,
          prospect_phone: p.phone,
          prospect_email: p.email,
          last_message: last,
          last_channel: last.channel,
          unread_count,
          total_count: list.length,
        })
      }
      summaries.sort((a, b) => new Date(b.last_message.sent_at).getTime() - new Date(a.last_message.sent_at).getTime())
      return summaries
    },
    enabled: !!orgId,
    refetchInterval: 60000, // 1 min poll fallback
  })
}

// ────────────────────────────────────────────────────────────
// useConversation : timeline complet d'un prospect (tous canaux)
// ────────────────────────────────────────────────────────────

export function useConversation(prospectId: string | null) {
  const queryClient = useQueryClient()
  const { user, organisation } = useAuth()

  const messagesQuery = useQuery({
    queryKey: ['conversation', prospectId, user?.id],
    queryFn: async (): Promise<UnifiedMessage[]> => {
      if (!prospectId) return []
      // STRICT : un user ne voit que ses propres conversations (son mail/num).
      let q = supabase
        .from('messages')
        .select('*')
        .eq('prospect_id', prospectId)
        .order('sent_at', { ascending: true })
        .limit(500)
      if (user?.id) q = q.eq('user_id', user.id)
      const { data, error } = await q
      if (error) throw error
      return (data || []) as UnifiedMessage[]
    },
    enabled: !!prospectId,
  })

  // Realtime subscription
  useEffect(() => {
    if (!prospectId) return
    const ch = supabase
      .channel(`conversation:${prospectId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `prospect_id=eq.${prospectId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversation', prospectId] })
          queryClient.invalidateQueries({ queryKey: ['conversations'] })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [prospectId, queryClient])

  const sendMutation = useMutation({
    mutationFn: async ({ channel, ...input }: { channel: ChannelId } & SendInput) => {
      const c = getChannel(channel)
      const result = await c.send(input)
      return { channel, result }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', prospectId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const markAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!prospectId) return
      // 1. Marque tous les messages inbound de cette conv comme lus en local
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('prospect_id', prospectId)
        .eq('direction', 'in')
        .eq('is_read', false)

      // 2. Sync vers Gmail : retire le label UNREAD des messages email concernés
      const hasUnreadEmail = (messagesQuery.data || []).some(m => m.channel === 'email' && m.direction === 'in' && !(m as any).is_read)
      if (hasUnreadEmail) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
            await fetch(`${SUPABASE_URL}/functions/v1/gmail?action=mark-read`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ prospect_id: prospectId }),
            })
          }
        } catch (e) {
          console.warn('[markAsRead] gmail sync failed:', e)
        }
      }

      // 3. Update aussi le legacy message_reads pour compat
      if (user?.id && organisation?.id) {
        await supabase.from('message_reads').upsert({
          user_id: user.id, prospect_id: prospectId, organisation_id: organisation.id,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'user_id,prospect_id' })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', prospectId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  // Détermine le canal de réponse par défaut : celui du dernier message reçu
  const defaultReplyChannel = useMemo<ChannelId>(() => {
    const msgs = messagesQuery.data || []
    const lastIn = [...msgs].reverse().find(m => m.direction === 'in')
    return (lastIn?.channel || msgs[msgs.length - 1]?.channel || 'sms') as ChannelId
  }, [messagesQuery.data])

  return {
    messages: messagesQuery.data || [],
    isLoading: messagesQuery.isLoading,
    error: messagesQuery.error,
    send: sendMutation.mutateAsync,
    sending: sendMutation.isPending,
    markAsRead: markAsReadMutation.mutate,
    defaultReplyChannel,
  }
}

// ────────────────────────────────────────────────────────────
// useTotalUnread : badge global pour la sidebar
// ────────────────────────────────────────────────────────────

export function useTotalUnread() {
  const { data: conversations } = useConversations()
  return useMemo(() =>
    (conversations || []).reduce((sum, c) => sum + c.unread_count, 0),
    [conversations]
  )
}
