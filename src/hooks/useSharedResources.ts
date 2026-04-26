/**
 * useSharedResources — hub interne de partage docs + audios.
 *
 * Concepts :
 *  - Liste org-scoped via RLS (SELECT auto-filtré)
 *  - Upload : crée la row + upload fichier dans bucket 'shared-resources'
 *    Path convention : {org_id}/{resource_id}/{filename}
 *  - Partage d'un appel : copie le mp3 depuis bucket 'recordings' vers
 *    'shared-resources' pour garantir persistance (même si call supprimé)
 *  - Delete : supprime row + fichier storage (RLS gère qui peut delete)
 *  - Badge "nouveaux" : compare created_at vs profile.last_seen_resources_at
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'

const BUCKET = 'shared-resources'
const RECORDINGS_BUCKET = 'recordings'

export type ResourceKind = 'document' | 'audio' | 'call_recording' | 'link'
export type ResourceVisibility = 'all' | 'admins_only'

export interface SharedResource {
  id: string
  organisation_id: string
  kind: ResourceKind
  title: string
  description: string | null
  tags: string[]
  storage_path: string | null
  external_url: string | null
  source_call_id: string | null
  file_size_bytes: number | null
  mime_type: string | null
  duration_seconds: number | null
  created_by: string | null
  created_by_name: string | null
  created_by_email: string | null
  visibility: ResourceVisibility
  created_at: string
  updated_at: string
}

export function useSharedResources() {
  const { organisation } = useAuth()
  return useQuery({
    queryKey: ['shared-resources', organisation?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shared_resources')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as SharedResource[]
    },
    enabled: !!organisation?.id,
  })
}

/** Compte les resources créées depuis la dernière visite (badge "nouveaux"). */
export function useNewResourcesCount() {
  const { profile, organisation } = useAuth()
  return useQuery({
    queryKey: ['shared-resources-new-count', organisation?.id, profile?.last_seen_resources_at],
    queryFn: async () => {
      if (!profile?.last_seen_resources_at) return 0
      const { count, error } = await supabase
        .from('shared_resources')
        .select('id', { count: 'exact', head: true })
        .gt('created_at', profile.last_seen_resources_at)
        .neq('created_by', profile.id)  // ne compte pas mes propres uploads
      if (error) return 0
      return count || 0
    },
    enabled: !!organisation?.id && !!profile?.last_seen_resources_at,
    refetchInterval: 60_000,  // poll toutes les 60s
  })
}

/** Marque l'onglet Ressources comme vu (reset le badge). */
export function useTouchResourcesSeen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await supabase.rpc('touch_resources_seen')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-resources-new-count'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

/** Upload d'un fichier (doc ou audio libre). */
export function useUploadResource() {
  const queryClient = useQueryClient()
  const { profile, organisation } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      file: File
      title: string
      description?: string
      tags?: string[]
      kind?: 'document' | 'audio'
      visibility?: ResourceVisibility
    }) => {
      if (!organisation?.id || !profile?.id) throw new Error('Non authentifié')

      // Default 'document' : les SDR ne partagent pas d'audio direct,
      // les enregistrements passent par useShareCallRecording (kind='call_recording').
      const kind: ResourceKind = input.kind || 'document'
      const ext = input.file.name.split('.').pop() || 'bin'
      const resourceId = crypto.randomUUID()
      const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
      const storagePath = `${organisation.id}/${resourceId}/${safeName}`

      // 1. Upload fichier
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, input.file, {
          contentType: input.file.type || 'application/octet-stream',
          upsert: false,
        })
      if (upErr) throw upErr

      // 2. Insert row
      const { data, error: insErr } = await supabase
        .from('shared_resources')
        .insert({
          id: resourceId,
          organisation_id: organisation.id,
          kind,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          tags: input.tags || [],
          storage_path: storagePath,
          file_size_bytes: input.file.size,
          mime_type: input.file.type || null,
          created_by: profile.id,
          created_by_name: profile.full_name || profile.email,
          created_by_email: profile.email,
          visibility: input.visibility || 'all',
        })
        .select()
        .single()

      if (insErr) {
        // Rollback storage upload
        await supabase.storage.from(BUCKET).remove([storagePath])
        throw insErr
      }

      return data as SharedResource
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-resources'] })
    },
  })
}

/** Crée un lien externe (URL YouTube/Notion/etc.). */
export function useCreateLinkResource() {
  const queryClient = useQueryClient()
  const { profile, organisation } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      title: string
      url: string
      description?: string
      tags?: string[]
      visibility?: ResourceVisibility
    }) => {
      if (!organisation?.id || !profile?.id) throw new Error('Non authentifié')
      const { data, error } = await supabase
        .from('shared_resources')
        .insert({
          organisation_id: organisation.id,
          kind: 'link',
          title: input.title.trim(),
          description: input.description?.trim() || null,
          tags: input.tags || [],
          external_url: input.url.trim(),
          created_by: profile.id,
          created_by_name: profile.full_name || profile.email,
          created_by_email: profile.email,
          visibility: input.visibility || 'all',
        })
        .select()
        .single()
      if (error) throw error
      return data as SharedResource
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-resources'] })
    },
  })
}

/**
 * Partage un recording d'appel : copie le mp3 depuis bucket 'recordings'
 * vers 'shared-resources' pour garantir la persistance même si le call est
 * supprimé/archivé plus tard.
 */
export function useShareCallRecording() {
  const queryClient = useQueryClient()
  const { profile, organisation } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      callId: string
      recordingStoragePath: string  // path dans bucket 'recordings'
      title: string
      description?: string
      tags?: string[]
      durationSeconds?: number
      visibility?: ResourceVisibility
    }) => {
      if (!organisation?.id || !profile?.id) throw new Error('Non authentifié')

      const resourceId = crypto.randomUUID()
      const filename = input.recordingStoragePath.split('/').pop() || 'recording.mp3'
      const newPath = `${organisation.id}/${resourceId}/${filename}`

      // 1. Download depuis bucket 'recordings'
      const { data: blob, error: dlErr } = await supabase.storage
        .from(RECORDINGS_BUCKET)
        .download(input.recordingStoragePath)
      if (dlErr) throw new Error(`Download recording: ${dlErr.message}`)

      // 2. Upload vers bucket 'shared-resources'
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, blob, {
          contentType: 'audio/mpeg',
          upsert: false,
        })
      if (upErr) throw upErr

      // 3. Insert row
      const { data, error: insErr } = await supabase
        .from('shared_resources')
        .insert({
          id: resourceId,
          organisation_id: organisation.id,
          kind: 'call_recording',
          title: input.title.trim(),
          description: input.description?.trim() || null,
          tags: input.tags || [],
          storage_path: newPath,
          source_call_id: input.callId,
          file_size_bytes: blob.size,
          mime_type: 'audio/mpeg',
          duration_seconds: input.durationSeconds || null,
          created_by: profile.id,
          created_by_name: profile.full_name || profile.email,
          created_by_email: profile.email,
          visibility: input.visibility || 'all',
        })
        .select()
        .single()

      if (insErr) {
        await supabase.storage.from(BUCKET).remove([newPath])
        throw insErr
      }

      return data as SharedResource
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-resources'] })
    },
  })
}

export function useDeleteResource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (resource: SharedResource) => {
      // 1. Supprime fichier storage si présent
      if (resource.storage_path) {
        await supabase.storage.from(BUCKET).remove([resource.storage_path])
      }
      // 2. Supprime row (RLS gère qui peut delete)
      const { error } = await supabase.from('shared_resources').delete().eq('id', resource.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-resources'] })
    },
  })
}

/** Génère une signed URL pour télécharger/écouter une resource. */
export async function getResourceSignedUrl(
  storagePath: string,
  ttlSeconds = 600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, ttlSeconds)
  if (error) return null
  return data?.signedUrl || null
}
