/**
 * useProperties — Hooks pour le modèle unifié de propriétés.
 * Fusionne system + custom en une seule liste.
 * Charge les custom values en batch pour le tableau.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { SYSTEM_PROPERTIES, PROPERTY_GROUPS, type PropertyDefinition } from '@/config/properties'

// ── Types CRM Statuses ──────────────────────────────────────────
export interface CrmStatusDef {
  id: string
  organisation_id: string
  key: string
  label: string
  color: string
  priority: number
  is_system: boolean
}

// ── Hook : statuts CRM depuis la DB ─────────────────────────────
export function useCrmStatuses() {
  const { organisation } = useAuth()
  const orgId = organisation?.id

  return useQuery({
    queryKey: ['crm-statuses', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('crm_statuses')
        .select('*')
        .eq('organisation_id', orgId)
        .order('priority')
      if (error) throw error
      return (data || []) as CrmStatusDef[]
    },
    enabled: !!orgId,
  })
}

export function useCreateCrmStatus() {
  const queryClient = useQueryClient()
  const { organisation } = useAuth()

  return useMutation({
    mutationFn: async ({ key, label, color, priority }: { key: string; label: string; color?: string; priority?: number }) => {
      if (!organisation?.id) throw new Error('No organisation')
      const { data, error } = await supabase
        .from('crm_statuses')
        .insert({
          organisation_id: organisation.id,
          key,
          label,
          color: color || '#6b7280',
          priority: priority ?? 50,
          is_system: false,
        })
        .select()
        .single()
      if (error) throw error
      return data as CrmStatusDef
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-statuses'] })
    },
  })
}

export function useDeleteCrmStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Soft-delete (archive) : trigger DB refuse hard DELETE
      const { error } = await supabase.from('crm_statuses').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('is_system', false)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-statuses'] })
    },
  })
}

// ── Hook principal : toutes les propriétés disponibles ───────────

export function usePropertyDefinitions(): { properties: PropertyDefinition[]; isLoading: boolean } {
  const { organisation } = useAuth()

  const { data: customFields, isLoading } = useQuery({
    queryKey: ['prospect-fields', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data, error } = await supabase
        .from('prospect_fields')
        .select('*')
        .eq('organisation_id', organisation.id)
        .order('created_at')
      if (error) throw error
      return data || []
    },
    enabled: !!organisation?.id,
  })

  // Charger les statuts CRM custom depuis la DB
  const { data: crmStatuses } = useCrmStatuses()

  // Fusionner system + custom
  const customProperties: PropertyDefinition[] = (customFields || []).map(f => ({
    id: f.id,
    key: f.key,
    name: f.name,
    type: 'custom' as const,
    fieldType: (f.field_type || 'text') as PropertyDefinition['fieldType'],
    group: 'custom',
    groupLabel: 'Champs personnalisés',
  }))

  // Injecter les options CRM depuis la DB dans le system property crm_status
  const systemProps = SYSTEM_PROPERTIES.map(p => {
    if (p.key === 'crm_status' && crmStatuses && crmStatuses.length > 0) {
      return { ...p, options: crmStatuses.map(s => s.key) }
    }
    return p
  })

  return {
    properties: [...systemProps, ...customProperties],
    isLoading,
  }
}

// ── Hook : custom values en batch pour une liste de prospects ────

export function useCustomFieldValues(prospectIds: string[], enabled = true) {
  return useQuery({
    queryKey: ['custom-field-values', prospectIds.length, prospectIds[0]],
    queryFn: async () => {
      if (!prospectIds.length) return {}
      // Batch par chunks de 100 UUIDs : un `IN (...)` avec 500+ UUIDs
      // depasse la limite URL de PostgREST (~8 KB) et renvoie 400.
      const CHUNK = 100
      const chunks: string[][] = []
      for (let i = 0; i < prospectIds.length; i += CHUNK) {
        chunks.push(prospectIds.slice(i, i + CHUNK))
      }
      const results = await Promise.all(
        chunks.map((chunk) =>
          supabase
            .from('prospect_field_values')
            .select('prospect_id, field_id, value')
            .in('prospect_id', chunk)
        )
      )
      // Grouper : { prospectId: { fieldId: value } }
      const map: Record<string, Record<string, string>> = {}
      for (const { data } of results) {
        for (const row of (data || [])) {
          if (!map[row.prospect_id]) map[row.prospect_id] = {}
          map[row.prospect_id][row.field_id] = row.value
        }
      }
      return map
    },
    enabled: enabled && prospectIds.length > 0,
  })
}

// ── Hook : custom values pour UN prospect (fiche) ────────────────

export function useProspectCustomValues(prospectId: string | null) {
  return useQuery({
    queryKey: ['prospect-custom-values', prospectId],
    queryFn: async () => {
      if (!prospectId) return {}
      const { data } = await supabase
        .from('prospect_field_values')
        .select('field_id, value')
        .eq('prospect_id', prospectId)
      const map: Record<string, string> = {}
      for (const row of (data || [])) map[row.field_id] = row.value
      return map
    },
    enabled: !!prospectId,
  })
}

// ── Helper : grouper les propriétés par groupe ───────────────────

export function groupProperties(properties: PropertyDefinition[]): Array<{ key: string; label: string; properties: PropertyDefinition[] }> {
  const groups: Array<{ key: string; label: string; properties: PropertyDefinition[] }> = []

  for (const g of PROPERTY_GROUPS) {
    const props = properties.filter(p => p.group === g.key)
    if (props.length > 0) {
      groups.push({ key: g.key, label: g.label, properties: props })
    }
  }

  return groups
}

// ── Helper : update une valeur (system ou custom) ────────────────

export async function updatePropertyValue(
  prospectId: string,
  prop: PropertyDefinition,
  value: string,
): Promise<void> {
  if (prop.type === 'system') {
    // Update direct sur la table prospects
    const updateData: Record<string, unknown> = { [prop.key]: value || null }

    // Workflows auto post-RDV
    if (prop.key === 'crm_status') {
      if (value === 'en_attente_signature') {
        // Rappel J+7 pour relance signature
        const rappel = new Date(); rappel.setDate(rappel.getDate() + 7)
        updateData.snoozed_until = rappel.toISOString()
      } else if (value === 'en_attente_paiement') {
        // Rappel J+7 pour relance paiement
        const rappel = new Date(); rappel.setDate(rappel.getDate() + 7)
        updateData.snoozed_until = rappel.toISOString()
      } else if (value === 'signe' || value === 'paye') {
        // Deal fermé → supprimer le rappel
        updateData.snoozed_until = null
      }
    }

    const { error } = await supabase
      .from('prospects')
      .update(updateData)
      .eq('id', prospectId)
    if (error) throw error
  } else {
    // Upsert dans prospect_field_values
    const { error } = await supabase
      .from('prospect_field_values')
      .upsert({
        prospect_id: prospectId,
        field_id: prop.id,
        value: value || null,
      }, { onConflict: 'prospect_id,field_id' })
    if (error) throw error
  }
}
