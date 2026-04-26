/**
 * SharedResources — onglet "Ressources" du Dashboard.
 *
 * Hub interne de partage :
 *  - Documents (brochures, playbooks, supports)
 *  - Audios (uploads libres ou recordings d'appels partagés)
 *  - Liens externes
 *
 * Permissions :
 *  - Tous les membres : voir + uploader
 *  - Visibility 'admins_only' : seul admin/manager voient
 *  - Suppression : créateur OU admin
 */

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  useSharedResources,
  useUploadResource,
  useCreateLinkResource,
  useDeleteResource,
  useTouchResourcesSeen,
  getResourceSignedUrl,
  type SharedResource,
  type ResourceKind,
  type ResourceVisibility,
} from '@/hooks/useSharedResources'

const KIND_ICONS: Record<ResourceKind, string> = {
  document: '📄',
  audio: '🎙️',
  call_recording: '📞',
  link: '🔗',
}

const KIND_LABELS: Record<ResourceKind, string> = {
  document: 'Document',
  audio: 'Audio',
  call_recording: 'Appel',
  link: 'Lien',
}

function formatBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}

function formatDuration(s: number | null): string {
  if (!s) return ''
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}min${sec > 0 ? ` ${sec}s` : ''}`
}

function relativeDate(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export default function SharedResources() {
  const { profile, isManager } = useAuth()
  const { data: resources = [], isLoading } = useSharedResources()
  const touchSeen = useTouchResourcesSeen()

  const [showUpload, setShowUpload] = useState(false)
  const [filter, setFilter] = useState<'all' | ResourceKind>('all')
  const [search, setSearch] = useState('')

  // Marque l'onglet comme vu au mount (reset le badge)
  useEffect(() => {
    if (resources.length > 0) {
      touchSeen.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources.length === 0])

  const filtered = useMemo(() => {
    let list = resources
    if (filter !== 'all') list = list.filter(r => r.kind === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        r.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [resources, filter, search])

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: resources.length }
    for (const r of resources) m[r.kind] = (m[r.kind] || 0) + 1
    return m
  }, [resources])

  return (
    <section className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-bold text-gray-800 flex items-center gap-2">
            📚 Ressources partagées
            {resources.length > 0 && (
              <span className="text-[11px] font-normal text-gray-400">{resources.length}</span>
            )}
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Brochures, playbooks, audios d'appels — partagés entre l'équipe
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[12px] font-semibold hover:bg-violet-700 transition-colors"
        >
          + Ajouter
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="px-3 py-1.5 text-[12px] rounded-lg border border-gray-200 bg-gray-50 outline-none focus:border-indigo-300 focus:bg-white w-48"
        />
        <div className="flex gap-1">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label="Tous" count={counts.all} />
          <FilterPill active={filter === 'document'} onClick={() => setFilter('document')} label="📄 Docs" count={counts.document || 0} />
          <FilterPill active={filter === 'audio'} onClick={() => setFilter('audio')} label="🎙️ Audios" count={counts.audio || 0} />
          <FilterPill active={filter === 'call_recording'} onClick={() => setFilter('call_recording')} label="📞 Appels" count={counts.call_recording || 0} />
          <FilterPill active={filter === 'link'} onClick={() => setFilter('link')} label="🔗 Liens" count={counts.link || 0} />
        </div>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="text-center py-12 text-[12px] text-gray-400">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-3xl mb-2">📚</p>
          <p className="text-[13px] font-semibold text-gray-700">
            {resources.length === 0 ? 'Aucune ressource partagée pour le moment' : 'Aucun résultat'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {resources.length === 0 ? 'Clique sur Ajouter pour partager un doc ou un audio' : 'Essaie un autre filtre'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(r => (
            <ResourceCard
              key={r.id}
              resource={r}
              canDelete={!!(r.created_by === profile?.id || isManager)}
            />
          ))}
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </section>
  )
}

function FilterPill({ active, onClick, label, count }: {
  active: boolean; onClick: () => void; label: string; count: number
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
        active ? 'bg-violet-100 text-violet-700' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      <span>{label}</span>
      <span className={`text-[9px] tabular-nums px-1 rounded ${active ? 'bg-violet-200' : 'bg-gray-100 text-gray-400'}`}>
        {count}
      </span>
    </button>
  )
}

function ResourceCard({ resource, canDelete }: { resource: SharedResource; canDelete: boolean }) {
  const del = useDeleteResource()
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loadingAudio, setLoadingAudio] = useState(false)

  const isAudio = resource.kind === 'audio' || resource.kind === 'call_recording'

  async function handleOpen() {
    if (resource.external_url) {
      window.open(resource.external_url, '_blank', 'noopener,noreferrer')
      return
    }
    if (!resource.storage_path) return
    const url = await getResourceSignedUrl(resource.storage_path, 3600)
    if (url) {
      if (isAudio) {
        setAudioUrl(url)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    }
  }

  async function handlePlay() {
    if (audioUrl) return  // déjà chargé
    if (!resource.storage_path) return
    setLoadingAudio(true)
    const url = await getResourceSignedUrl(resource.storage_path, 3600)
    setLoadingAudio(false)
    if (url) setAudioUrl(url)
  }

  async function handleDelete() {
    if (!confirm(`Supprimer "${resource.title}" ?`)) return
    try {
      await del.mutateAsync(resource)
    } catch (e) {
      alert(`Erreur : ${(e as Error).message}`)
    }
  }

  return (
    <div className="bg-gray-50 dark:bg-[#ede6f3] border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-shadow flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <span className="text-2xl flex-shrink-0">{KIND_ICONS[resource.kind]}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-bold text-gray-800 truncate">{resource.title}</h3>
          {resource.description && (
            <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">{resource.description}</p>
          )}
        </div>
        {canDelete && (
          <button
            onClick={handleDelete}
            className="text-gray-300 hover:text-red-500 transition-colors text-[14px]"
            title="Supprimer"
          >
            ✕
          </button>
        )}
      </div>

      {resource.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {resource.tags.map(t => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-medium">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-gray-400 mt-auto pt-1">
        <span className="truncate">
          {KIND_LABELS[resource.kind]}
          {resource.file_size_bytes ? ` • ${formatBytes(resource.file_size_bytes)}` : ''}
          {resource.duration_seconds ? ` • ${formatDuration(resource.duration_seconds)}` : ''}
        </span>
        <span>{relativeDate(resource.created_at)}</span>
      </div>

      <div className="text-[10px] text-gray-500 truncate">
        Par {resource.created_by_name || resource.created_by_email || 'inconnu'}
      </div>

      {/* Actions */}
      {isAudio && resource.storage_path ? (
        audioUrl ? (
          <audio controls preload="none" src={audioUrl} className="w-full h-9" />
        ) : (
          <button
            onClick={handlePlay}
            disabled={loadingAudio}
            className="w-full px-2 py-1.5 rounded text-[11px] font-semibold bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors disabled:opacity-50"
          >
            {loadingAudio ? 'Chargement...' : '▶ Écouter'}
          </button>
        )
      ) : (
        <button
          onClick={handleOpen}
          className="w-full px-2 py-1.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
        >
          {resource.kind === 'link' ? '↗ Ouvrir le lien' : '↗ Ouvrir / Télécharger'}
        </button>
      )}
    </div>
  )
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const upload = useUploadResource()
  const createLink = useCreateLinkResource()
  const { isManager } = useAuth()

  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [url, setUrl] = useState('')
  const [visibility, setVisibility] = useState<ResourceVisibility>('all')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Titre requis'); return }
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
    setBusy(true)
    try {
      if (mode === 'file') {
        if (!file) { setError('Choisis un fichier'); setBusy(false); return }
        if (file.size > 50 * 1024 * 1024) { setError('Fichier max 50 Mo'); setBusy(false); return }
        await upload.mutateAsync({
          file, title, description, tags, visibility,
        })
      } else {
        if (!url.trim() || !/^https?:\/\//.test(url.trim())) {
          setError('URL valide requise (http:// ou https://)'); setBusy(false); return
        }
        await createLink.mutateAsync({
          title, url, description, tags, visibility,
        })
      }
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-gray-800">Partager une ressource</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('file')}
              className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors ${
                mode === 'file' ? 'bg-violet-100 text-violet-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              📎 Fichier
            </button>
            <button
              type="button"
              onClick={() => setMode('link')}
              className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors ${
                mode === 'link' ? 'bg-violet-100 text-violet-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              🔗 Lien externe
            </button>
          </div>

          {mode === 'file' ? (
            <div>
              <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">Fichier (max 50 Mo)</label>
              <input
                type="file"
                onChange={e => setFile(e.target.files?.[0] || null)}
                accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.mp3,.m4a,.wav,.mp4"
                className="w-full text-[12px] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-violet-50 file:text-violet-700 file:font-semibold hover:file:bg-violet-100"
              />
              {file && (
                <p className="text-[10px] text-gray-400 mt-1">{file.name} • {formatBytes(file.size)}</p>
              )}
            </div>
          ) : (
            <div>
              <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">URL</label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-violet-400"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">Titre *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Brochure offre 2026"
              className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-violet-400"
              required
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optionnel"
              rows={2}
              className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-violet-400 resize-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">Tags (séparés par virgule)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="objection, closing, brochure"
              className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-violet-400"
            />
          </div>

          {isManager && (
            <div>
              <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">Visibilité</label>
              <select
                value={visibility}
                onChange={e => setVisibility(e.target.value as ResourceVisibility)}
                className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-violet-400"
              >
                <option value="all">Toute l'équipe</option>
                <option value="admins_only">Admins uniquement</option>
              </select>
            </div>
          )}

          {error && <div className="text-[11px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-[12px] font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 py-2 rounded-lg text-[12px] font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? 'Envoi...' : 'Partager'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
