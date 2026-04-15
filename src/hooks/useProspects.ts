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
import { extractSocialsFromValues } from '@/components/call/SocialLinks'

// ── Types Custom Fields ──────────────────────────────────────────
export interface ProspectField {
  id: string
  organisation_id: string
  name: string
  key: string
  field_type: string
  is_system: boolean
}

// Champs système (colonnes natives de la table prospects)
export const SYSTEM_FIELDS: Array<{ key: string; name: string }> = [
  { key: 'name', name: 'Nom complet' },
  { key: 'first_name', name: 'Prénom' },
  { key: 'last_name', name: 'Nom de famille' },
  { key: 'phone', name: 'Téléphone principal' },
  { key: 'phone2', name: 'Téléphone 2' },
  { key: 'email', name: 'Email' },
  { key: 'company', name: 'Entreprise' },
  { key: 'title', name: 'Poste / Fonction' },
  { key: 'sector', name: 'Secteur' },
  { key: 'address', name: 'Adresse' },
  { key: 'city', name: 'Ville' },
  { key: 'postal_code', name: 'Code postal' },
  { key: 'country', name: 'Pays' },
  { key: 'linkedin_url', name: 'LinkedIn (→ Liens)' },
  { key: 'website_url', name: 'Site web (→ Liens)' },
]

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
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ProspectList[]
    },
    enabled: !!orgId,
  })
}

/** RDV du jour — tous les prospects avec rdv_date aujourd'hui (cross-listes) */
export function useRdvToday() {
  const { organisation } = useAuth()
  const orgId = organisation?.id

  return useQuery({
    queryKey: ['rdv-today', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()
      const { data, error } = await supabase
        .from('prospects')
        .select('id, list_id, name, phone, email, company, title, crm_status, last_call_outcome, rdv_date, meeting_booked')
        .eq('organisation_id', orgId)
        .is('deleted_at', null)
        .gte('rdv_date', start)
        .lt('rdv_date', end)
        .order('rdv_date', { ascending: true })
      if (error) throw error
      // Dédupliquer par téléphone normalisé E.164
      const seen = new Set<string>()
      return (data || []).filter(p => {
        let ph = (p.phone || '').replace(/[\s.\-()]/g, '')
        if (ph.startsWith('0') && ph.length === 10) ph = '+33' + ph.slice(1)
        const key = ph || p.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    },
    enabled: !!orgId,
    refetchInterval: 60000,
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
        .select('id, list_id, organisation_id, name, phone, phone2, phone3, phone4, phone5, email, company, title, sector, linkedin_url, website_url, status, crm_status, call_count, last_call_at, last_call_outcome, snoozed_until, rdv_date, do_not_call, meeting_booked, address, city, postal_code, country, created_at')
        .eq('list_id', listId)
        .is('deleted_at', null)
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
      // Vérifier doublon dans la même liste
      const { data: existing } = await supabase
        .from('prospects')
        .select('id')
        .eq('list_id', prospect.listId)
        .eq('phone', prospect.phone)
        .limit(1)
      if (existing && existing.length > 0) throw new Error('Ce numéro existe déjà dans cette liste')

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
    mutationFn: async ({ listId, prospects }: { listId: string; prospects: Array<{ name: string; phone: string; phone2?: string; email?: string; company?: string; title?: string; sector?: string; address?: string; city?: string; postal_code?: string; country?: string; linkedin_url?: string; website_url?: string }> }) => {
      if (!organisation?.id) throw new Error('No organisation')

      // Normaliser un numéro au format E.164 pour comparaison
      const normalizePhone = (p: string) => {
        let n = p.replace(/[\s.\-()]/g, '')
        if (n.startsWith('0') && n.length === 10) n = '+33' + n.slice(1)
        if (!n.startsWith('+') && n.length === 9) n = '+33' + n
        return n
      }

      // Dédupliquer cross-listes : récupérer TOUS les numéros de l'org
      const { data: existing } = await supabase
        .from('prospects')
        .select('phone')
        .eq('organisation_id', organisation.id)
      const existingPhones = new Set((existing || []).map(p => normalizePhone(p.phone || '')).filter(Boolean))

      // Dédupliquer dans le CSV (garder le premier) + contre l'existant
      const seen = new Set<string>()
      const unique = prospects.filter(p => {
        const norm = normalizePhone(p.phone)
        if (!norm || existingPhones.has(norm) || seen.has(norm)) return false
        seen.add(norm)
        return true
      })

      // Normaliser les numéros avant insertion
      unique.forEach(p => { p.phone = normalizePhone(p.phone) })

      if (unique.length === 0) return

      const rows = unique.map(p => ({
        list_id: listId,
        organisation_id: organisation.id,
        name: p.name,
        phone: p.phone,
        phone2: p.phone2 || null,
        email: p.email || null,
        company: p.company || null,
        title: p.title || null,
        sector: p.sector || null,
        address: p.address || null,
        city: p.city || null,
        postal_code: p.postal_code || null,
        country: p.country || null,
        linkedin_url: p.linkedin_url || null,
        website_url: p.website_url || null,
      }))
      const { data: inserted, error } = await supabase.from('prospects').insert(rows).select('id')
      if (error) throw error
      const insertedIds = inserted?.map(r => r.id) || []

      // ── Sync socials : détecter les URLs dans linkedin_url, website_url ──
      if (insertedIds.length > 0) {
        const socialRows: Array<{ prospect_id: string; platform: string; url: string }> = []
        unique.forEach((p, i) => {
          const pid = insertedIds[i]
          if (!pid) return
          const urls: Array<{ value: string }> = []
          if (p.linkedin_url) urls.push({ value: p.linkedin_url })
          if (p.website_url) urls.push({ value: p.website_url })
          const socials = extractSocialsFromValues(urls)
          for (const s of socials) {
            socialRows.push({ prospect_id: pid, platform: s.platform, url: s.url })
          }
        })
        if (socialRows.length > 0) {
          // Batch insert socials (ignore duplicates)
          const batchSize = 500
          for (let i = 0; i < socialRows.length; i += batchSize) {
            await supabase.from('prospect_socials').insert(socialRows.slice(i, i + batchSize))
          }
        }
      }

      return insertedIds
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prospects', variables.listId] })
    },
  })
}

// ── Custom Fields ────────────────────────────────────────────────

export function useProspectFields() {
  const { organisation } = useAuth()
  return useQuery({
    queryKey: ['prospect-fields', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data, error } = await supabase
        .from('prospect_fields')
        .select('*')
        .eq('organisation_id', organisation.id)
        .order('created_at')
      if (error) throw error
      return data as ProspectField[]
    },
    enabled: !!organisation?.id,
  })
}

export function useCreateProspectField() {
  const queryClient = useQueryClient()
  const { organisation } = useAuth()

  return useMutation({
    mutationFn: async ({ name, key, fieldType }: { name: string; key: string; fieldType?: string }) => {
      if (!organisation?.id) throw new Error('No organisation')
      const { data, error } = await supabase
        .from('prospect_fields')
        .upsert({
          organisation_id: organisation.id,
          name,
          key,
          field_type: fieldType || 'text',
          is_system: false,
        }, { onConflict: 'organisation_id,key' })
        .select()
        .single()
      if (error) throw error
      return data as ProspectField
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospect-fields'] })
    },
  })
}

/** Sauvegarde des valeurs custom pour un batch de prospects */
export async function saveCustomFieldValues(
  prospectIds: string[],
  customData: Array<Record<string, string>>,
  fieldMapping: Array<{ fieldId: string; customKey: string }>,
) {
  if (fieldMapping.length === 0 || prospectIds.length === 0) return

  const rows: Array<{ prospect_id: string; field_id: string; value: string }> = []
  prospectIds.forEach((pid, i) => {
    for (const fm of fieldMapping) {
      const val = customData[i]?.[fm.customKey]?.trim()
      if (val) {
        rows.push({ prospect_id: pid, field_id: fm.fieldId, value: val })
      }
    }
  })

  if (rows.length === 0) return

  const batchSize = 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    await supabase.from('prospect_field_values').upsert(batch, {
      onConflict: 'prospect_id,field_id',
    })
  }
}
