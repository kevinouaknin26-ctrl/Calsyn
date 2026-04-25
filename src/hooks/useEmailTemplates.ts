/**
 * useEmailTemplates — modèles de mails (CRUD).
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface EmailTemplate {
  id: string
  organisation_id: string
  user_id: string | null
  name: string
  subject: string | null
  body: string | null
  shared: boolean
  created_at: string
  updated_at: string
}

export function useEmailTemplates() {
  const { organisation } = useAuth()
  return useQuery({
    queryKey: ['email-templates', organisation?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as EmailTemplate[]
    },
    enabled: !!organisation?.id,
  })
}

export function useSaveEmailTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; subject?: string; body?: string; shared?: boolean }) => {
      if (input.id) {
        const { error } = await supabase.from('email_templates').update({
          name: input.name, subject: input.subject || null, body: input.body || null, shared: input.shared || false,
        }).eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('email_templates').insert({
          name: input.name, subject: input.subject || null, body: input.body || null, shared: input.shared || false,
        })
        if (error) throw error
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['email-templates'] }) },
  })
}

export function useDeleteEmailTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['email-templates'] }) },
  })
}
