/**
 * useAnnouncements — fil d'annonces internes (admin → équipe).
 *
 * - SELECT : tout membre de l'org (RLS)
 * - INSERT/UPDATE/DELETE : auteur OU admin/manager (RLS)
 * - Realtime : nouvelles annonces poussées sans refresh
 * - Badge "nouveaux" : compare created_at vs profiles.last_seen_announcements_at
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface Announcement {
  id: string
  organisation_id: string
  body: string
  pinned: boolean
  created_by: string | null
  created_by_name: string | null
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export function useAnnouncements() {
  const queryClient = useQueryClient()
  const { organisation } = useAuth()

  // Realtime subscribe
  useEffect(() => {
    if (!organisation?.id) return
    const channel = supabase
      .channel(`announcements:${organisation.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements', filter: `organisation_id=eq.${organisation.id}` },
        () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [organisation?.id, queryClient])

  return useQuery({
    queryKey: ['announcements', organisation?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as Announcement[]
    },
    enabled: !!organisation?.id,
  })
}

export function useNewAnnouncementsCount() {
  const { profile, organisation } = useAuth()
  return useQuery({
    queryKey: ['announcements-new-count', organisation?.id, profile?.last_seen_announcements_at],
    queryFn: async () => {
      if (!profile?.last_seen_announcements_at) return 0
      const { count, error } = await supabase
        .from('announcements')
        .select('id', { count: 'exact', head: true })
        .gt('created_at', profile.last_seen_announcements_at)
        .neq('created_by', profile.id)
      if (error) return 0
      return count || 0
    },
    enabled: !!organisation?.id && !!profile?.last_seen_announcements_at,
    refetchInterval: 60_000,
  })
}

export function useTouchAnnouncementsSeen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => { await supabase.rpc('touch_announcements_seen') },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements-new-count'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient()
  const { profile, organisation } = useAuth()
  return useMutation({
    mutationFn: async (input: { body: string; pinned?: boolean }) => {
      if (!organisation?.id || !profile?.id) throw new Error('Non authentifié')
      const { data, error } = await supabase
        .from('announcements')
        .insert({
          organisation_id: organisation.id,
          body: input.body.trim(),
          pinned: input.pinned || false,
          created_by: profile.id,
          created_by_name: profile.full_name || profile.email,
          created_by_email: profile.email,
        })
        .select()
        .single()
      if (error) throw error
      return data as Announcement
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
  })
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; body?: string; pinned?: boolean }) => {
      const updates: Record<string, unknown> = {}
      if (input.body !== undefined) updates.body = input.body.trim()
      if (input.pinned !== undefined) updates.pinned = input.pinned
      const { error } = await supabase.from('announcements').update(updates).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
  })
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('announcements').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
  })
}
