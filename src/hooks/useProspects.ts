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

const PROSPECT_COLS = 'id, list_id, organisation_id, name, phone, phone2, phone3, phone4, phone5, email, email2, email3, company, title, sector, linkedin_url, website_url, status, crm_status, call_count, last_call_at, last_call_outcome, snoozed_until, rdv_date, do_not_call, meeting_booked, address, city, postal_code, country, notes, next_action_type, next_action_gcal_event_id, next_action_invited_client, created_at'

export const SMART_LIST_IDS = [
  'smart:missed-calls',
  'smart:contacted-this-week',
  'smart:contacted-this-month',
  'smart:contacted-30-days',
] as const

export const SMART_LIST_LABELS: Record<string, string> = {
  'smart:missed-calls': '🔕 Appels manqués',
  'smart:contacted-this-week': '📞 Contactés cette semaine',
  'smart:contacted-this-month': '📅 Contactés ce mois',
  'smart:contacted-30-days': '🗓 Contactés les 30 derniers jours',
}

export function isSmartListId(id: string | null | undefined): id is typeof SMART_LIST_IDS[number] {
  return !!id && id.startsWith('smart:')
}

export function useProspects(listId: string | null) {
  const { organisation } = useAuth()
  const orgId = organisation?.id

  return useQuery({
    queryKey: ['prospects', listId, orgId],
    queryFn: async () => {
      if (!listId || !orgId) return []

      // ── Listes intelligentes : query cross-listes avec filtre dynamique ──
      if (isSmartListId(listId)) {
        let q = supabase.from('prospects').select(PROSPECT_COLS)
          .eq('organisation_id', orgId)
          .is('deleted_at', null)
          .order('last_call_at', { ascending: false, nullsFirst: false })
          .limit(500)

        const now = new Date()
        if (listId === 'smart:missed-calls') {
          // Prospect déjà tenté (call_count > 0) mais jamais connecté (pas connected/rdv_pris/signe/paye)
          q = q.gt('call_count', 0)
            .not('crm_status', 'in', '("connected","rdv_pris","rdv_fait","signe","paye","en_attente_signature","en_attente_paiement")')
        } else if (listId === 'smart:contacted-this-week') {
          const d = new Date(now); const day = d.getDay(); const diff = day === 0 ? 6 : day - 1
          d.setDate(d.getDate() - diff); d.setHours(0, 0, 0, 0)
          q = q.gte('last_call_at', d.toISOString())
        } else if (listId === 'smart:contacted-this-month') {
          const d = new Date(now.getFullYear(), now.getMonth(), 1)
          q = q.gte('last_call_at', d.toISOString())
        } else if (listId === 'smart:contacted-30-days') {
          const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          q = q.gte('last_call_at', d.toISOString())
        }

        const { data, error } = await q
        if (error) throw error
        return (data || []) as Prospect[]
      }

      // ── Liste classique ──
      // Source de vérité : prospect_list_memberships (un prospect peut être sur N listes).
      // On récupère d'abord les memberships, puis les prospects correspondants.
      const { data: memberships, error: mErr } = await supabase
        .from('prospect_list_memberships')
        .select('prospect_id')
        .eq('list_id', listId)
        .eq('organisation_id', orgId)
      if (mErr) throw mErr
      const ids = (memberships || []).map(m => m.prospect_id as string)
      if (ids.length === 0) return []

      const { data, error } = await supabase
        .from('prospects')
        .select(PROSPECT_COLS)
        .in('id', ids)
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
    mutationFn: async (prospect: { listId: string; name: string; phone?: string; email?: string; company?: string; sector?: string }) => {
      if (!organisation?.id) throw new Error('No organisation')
      const phone = (prospect.phone || '').trim() || null
      const email = (prospect.email || '').trim() || null
      if (!phone && !email) throw new Error('Au moins un téléphone ou un email requis')

      // 1. Cherche s'il existe déjà dans l'org (par phone OU email)
      let existing: { id: string; list_id: string | null } | null = null
      if (phone) {
        const { data } = await supabase.from('prospects')
          .select('id, list_id')
          .eq('organisation_id', organisation.id)
          .eq('phone', phone)
          .is('deleted_at', null)
          .limit(1).maybeSingle()
        if (data) existing = data
      }
      if (!existing && email) {
        const { data } = await supabase.from('prospects')
          .select('id, list_id')
          .eq('organisation_id', organisation.id)
          .eq('email', email)
          .is('deleted_at', null)
          .limit(1).maybeSingle()
        if (data) existing = data
      }

      // 2. Si déjà existe → ajoute juste au membership de la liste cible
      if (existing) {
        // Check si déjà dans cette liste via memberships
        const { data: memb } = await supabase
          .from('prospect_list_memberships')
          .select('prospect_id')
          .eq('prospect_id', existing.id).eq('list_id', prospect.listId).maybeSingle()
        if (memb) {
          throw new Error('Ce contact est déjà dans cette liste')
        }
        // Ajoute au membership
        await supabase.from('prospect_list_memberships').insert({
          prospect_id: existing.id, list_id: prospect.listId, organisation_id: organisation.id,
        })
        queryClient.invalidateQueries({ queryKey: ['prospects', prospect.listId] })
        queryClient.invalidateQueries({ queryKey: ['prospect-list-memberships'] })
        queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
        // Retourne le prospect existant
        const { data } = await supabase.from('prospects').select('*').eq('id', existing.id).single()
        return data as Prospect
      }

      // 3. Sinon création complète + membership
      const { data, error } = await supabase
        .from('prospects')
        .insert({
          list_id: prospect.listId,
          organisation_id: organisation.id,
          name: prospect.name,
          phone, email,
          company: prospect.company || null,
          sector: prospect.sector || null,
        })
        .select()
        .single()
      if (error) throw error
      // Add membership pour cohérence
      await supabase.from('prospect_list_memberships').insert({
        prospect_id: data.id, list_id: prospect.listId, organisation_id: organisation.id,
      }).then(() => {}, () => {})
      return data as Prospect
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prospects', variables.listId] })
      queryClient.invalidateQueries({ queryKey: ['prospect-list-memberships'] })
      queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
    },
  })
}

export function useImportProspects() {
  const queryClient = useQueryClient()
  const { organisation } = useAuth()

  return useMutation({
    mutationFn: async ({ listId, prospects }: { listId: string; prospects: Array<{ name: string; phone: string; phone2?: string; email?: string; company?: string; title?: string; sector?: string; address?: string; city?: string; postal_code?: string; country?: string; linkedin_url?: string; website_url?: string }> }): Promise<{ phoneToId: Map<string, string>; newCount: number; mergedCount: number }> => {
      if (!organisation?.id) throw new Error('No organisation')

      // Normaliser un numéro au format E.164 pour comparaison
      const normalizePhone = (p: string) => {
        let n = p.replace(/[\s.\-()]/g, '')
        if (n.startsWith('0') && n.length === 10) n = '+33' + n.slice(1)
        if (!n.startsWith('+') && n.length === 9) n = '+33' + n
        return n
      }

      // Dédupliquer intra-CSV (premier gagnant) et normaliser
      const seen = new Set<string>()
      const csvRows = [] as typeof prospects
      for (const p of prospects) {
        const np = normalizePhone(p.phone)
        if (!np || seen.has(np)) continue
        seen.add(np)
        csvRows.push({ ...p, phone: np })
      }
      if (csvRows.length === 0) return { phoneToId: new Map(), newCount: 0, mergedCount: 0 }

      // Dedupe cross-org : chercher tous les prospects actifs déjà dans l'org par phone
      const phones = csvRows.map(p => p.phone)
      const { data: existing } = await supabase
        .from('prospects')
        .select('id, phone, name, email, company, title, sector, address, city, postal_code, country, linkedin_url, website_url, phone2')
        .eq('organisation_id', organisation.id)
        .is('deleted_at', null)
        .in('phone', phones)

      const existingByPhone = new Map<string, { id: string } & Record<string, string | null>>()
      for (const e of existing || []) existingByPhone.set(e.phone as string, e as { id: string } & Record<string, string | null>)

      const phoneToId = new Map<string, string>()
      const updatesToMerge: Array<{ id: string; patch: Record<string, string> }> = []
      const newRows: Array<Record<string, string | null>> = []
      const newRowPhones: string[] = []

      for (const p of csvRows) {
        const e = existingByPhone.get(p.phone)
        if (e) {
          phoneToId.set(p.phone, e.id)
          // Merger les champs vides depuis le CSV
          const patch: Record<string, string> = {}
          const fillIfEmpty = (key: string, val?: string) => { if (!e[key] && val) patch[key] = val }
          fillIfEmpty('name', p.name)
          fillIfEmpty('email', p.email)
          fillIfEmpty('company', p.company)
          fillIfEmpty('title', p.title)
          fillIfEmpty('sector', p.sector)
          fillIfEmpty('address', p.address)
          fillIfEmpty('city', p.city)
          fillIfEmpty('postal_code', p.postal_code)
          fillIfEmpty('country', p.country)
          fillIfEmpty('linkedin_url', p.linkedin_url)
          fillIfEmpty('website_url', p.website_url)
          fillIfEmpty('phone2', p.phone2)
          if (Object.keys(patch).length > 0) updatesToMerge.push({ id: e.id, patch })
        } else {
          newRows.push({
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
          })
          newRowPhones.push(p.phone)
        }
      }

      // INSERT nouveaux prospects
      let inserted: Array<{ id: string; phone: string }> = []
      if (newRows.length > 0) {
        const { data, error } = await supabase.from('prospects').insert(newRows).select('id, phone')
        if (error) throw error
        inserted = (data || []) as Array<{ id: string; phone: string }>
        for (const ip of inserted) {
          if (ip.phone) phoneToId.set(ip.phone, ip.id)
        }
      }

      // UPDATE merges
      for (const u of updatesToMerge) {
        const { error } = await supabase.from('prospects').update(u.patch).eq('id', u.id)
        if (error) throw error
      }

      // Memberships : ajouter chaque prospect (existant ou nouveau) à la liste cible
      const memberships: Array<{ prospect_id: string; list_id: string; organisation_id: string }> = []
      for (const [, id] of phoneToId) {
        memberships.push({ prospect_id: id, list_id: listId, organisation_id: organisation.id })
      }
      if (memberships.length > 0) {
        const { error: errM } = await supabase
          .from('prospect_list_memberships')
          .upsert(memberships, { onConflict: 'prospect_id,list_id', ignoreDuplicates: true })
        if (errM) throw errM
      }

      // Sync socials uniquement pour les nouveaux prospects
      if (inserted.length > 0) {
        const socialRows: Array<{ prospect_id: string; platform: string; url: string }> = []
        const insertedByPhone = new Map<string, string>()
        for (const ip of inserted) insertedByPhone.set(ip.phone, ip.id)
        for (const p of csvRows) {
          const pid = insertedByPhone.get(p.phone)
          if (!pid) continue
          const urls: Array<{ value: string }> = []
          if (p.linkedin_url) urls.push({ value: p.linkedin_url })
          if (p.website_url) urls.push({ value: p.website_url })
          const socials = extractSocialsFromValues(urls)
          for (const s of socials) socialRows.push({ prospect_id: pid, platform: s.platform, url: s.url })
        }
        if (socialRows.length > 0) {
          const batchSize = 500
          for (let i = 0; i < socialRows.length; i += batchSize) {
            await supabase.from('prospect_socials').insert(socialRows.slice(i, i + batchSize))
          }
        }
      }

      return { phoneToId, newCount: newRows.length, mergedCount: updatesToMerge.length }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prospects', variables.listId] })
      queryClient.invalidateQueries({ queryKey: ['prospects'] })
      queryClient.invalidateQueries({ queryKey: ['prospect-list-memberships'] })
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
