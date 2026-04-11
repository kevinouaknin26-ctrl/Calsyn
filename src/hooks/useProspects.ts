/**
 * useProspects — TanStack Query hook pour les prospects.
 * Toute la gestion des données prospects passe par ici.
 * Le cache TanStack Query est la source de vérité côté frontend.
 * Supabase Realtime met à jour le cache en push.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Prospect, ProspectList } from '@/types/prospect'

// ── Queries ────────────────────────────────────────────────────────

export function useProspectLists() {
  const { organisation } = useAuth()
  const orgId = organisation?.id

  return useQuery({
    queryKey: ['prospect-lists', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('prospect_lists')
        .select('id, name, assigned_to, created_by, created_at')
        .eq('organisation_id', orgId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ProspectList[]
    },
    enabled: !!orgId,
  })
}

export function useProspects(listId: string | null) {
  const { organisation } = useAuth()
  const orgId = organisation?.id

  return useQuery({
    queryKey: ['prospects', listId],
    queryFn: async () => {
      if (!listId || !orgId) return []
      const { data, error } = await supabase
        .from('prospects')
        .select('id, list_id, organisation_id, name, phone, phone2, phone3, phone4, phone5, email, company, title, sector, linkedin_url, website_url, status, crm_status, call_count, last_call_at, last_call_outcome, snoozed_until, do_not_call, created_at')
        .eq('list_id', listId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Prospect[]
    },
    enabled: !!listId && !!orgId,
  })
}

// ── Mutations ──────────────────────────────────────────────────────

export function useCreateList() {
  const queryClient = useQueryClient()
  const { organisation, profile } = useAuth()

  return useMutation({
    mutationFn: async (name: string) => {
      if (!organisation?.id) throw new Error('No organisation')
      const { data, error } = await supabase
        .from('prospect_lists')
        .insert({
          name,
          organisation_id: organisation.id,
          created_by: profile?.id,
        })
        .select('id, name, assigned_to, created_by, created_at')
        .single()
      if (error) throw error
      return data as ProspectList
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospect-lists'] })
    },
  })
}

export function useAddProspect() {
  const queryClient = useQueryClient()
  const { organisation } = useAuth()

  return useMutation({
    mutationFn: async (prospect: { listId: string; name: string; phone: string; email?: string; company?: string; sector?: string }) => {
      if (!organisation?.id) throw new Error('No organisation')
      const { data, error } = await supabase
        .from('prospects')
        .insert({
          list_id: prospect.listId,
          organisation_id: organisation.id,
          name: prospect.name,
          phone: prospect.phone,
          email: prospect.email || null,
          company: prospect.company || null,
          sector: prospect.sector || null,
        })
        .select()
        .single()
      if (error) throw error
      return data as Prospect
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prospects', variables.listId] })
    },
  })
}

export function useImportProspects() {
  const queryClient = useQueryClient()
  const { organisation } = useAuth()

  return useMutation({
    mutationFn: async ({ listId, prospects }: { listId: string; prospects: Array<{ name: string; phone: string; email?: string; company?: string; sector?: string }> }) => {
      if (!organisation?.id) throw new Error('No organisation')

      // Dédupliquer : récupérer les numéros déjà dans cette liste
      const { data: existing } = await supabase
        .from('prospects')
        .select('phone')
        .eq('list_id', listId)
      const existingPhones = new Set(existing?.map(p => p.phone) || [])

      // Dédupliquer aussi dans le CSV lui-même (garder le premier)
      const seen = new Set<string>()
      const unique = prospects.filter(p => {
        if (existingPhones.has(p.phone) || seen.has(p.phone)) return false
        seen.add(p.phone)
        return true
      })

      if (unique.length === 0) return

      const rows = unique.map(p => ({
        list_id: listId,
        organisation_id: organisation.id,
        name: p.name,
        phone: p.phone,
        email: p.email || null,
        company: p.company || null,
        sector: p.sector || null,
      }))
      const { error } = await supabase.from('prospects').insert(rows)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prospects', variables.listId] })
    },
  })
}
