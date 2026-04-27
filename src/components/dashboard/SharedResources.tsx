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
import { createPortal } from 'react-dom'
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
  const [initialFile, setInitialFile] = useState<File | null>(null)
  const [filter, setFilter] = useState<'all' | 'document' | 'call' | 'link'>('all')
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // Marque l'onglet comme vu au mount (reset le badge)
  useEffect(() => {
    if (resources.length > 0) {
      touchSeen.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources.length === 0])

  const filtered = useMemo(() => {
    let list = resources
    if (filter !== 'all') {
      // 'call' agrège les anciens 'audio' (libres) et les 'call_recording' partagés
      const matchKind = (k: ResourceKind) =>
        filter === 'document' ? k === 'document'
        : filter === 'call' ? (k === 'call_recording' || k === 'audio')
        : filter === 'link' ? k === 'link'
        : true
      list = list.filter(r => matchKind(r.kind))
    }
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
    const docs = resources.filter(r => r.kind === 'document').length
    const calls = resources.filter(r => r.kind === 'call_recording' || r.kind === 'audio').length
    const links = resources.filter(r => r.kind === 'link').length
    return { all: resources.length, document: docs, call: calls, link: links }
  }, [resources])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    setInitialFile(file)
    setShowUpload(true)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (!dragOver) setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    if (e.currentTarget === e.target) setDragOver(false)
  }

  function openUpload() {
    setInitialFile(null)
    setShowUpload(true)
  }

  function closeUpload() {
    setShowUpload(false)
    setInitialFile(null)
  }

  return (
    <div
      className={`bg-white dark:bg-[#f0eaf5] rounded-xl border overflow-hidden flex flex-col h-full relative transition-colors ${
        dragOver
          ? 'border-violet-400 border-2 ring-4 ring-violet-100'
          : 'border-gray-200 dark:border-[#d4cade]'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Overlay drag visuel */}
      {dragOver && (
        <div className="absolute inset-0 bg-violet-50/95 z-10 flex flex-col items-center justify-center pointer-events-none rounded-xl">
          <p className="text-3xl mb-2">📥</p>
          <p className="text-[13px] font-bold text-violet-700">Déposez le fichier ici</p>
          <p className="text-[11px] text-violet-500 mt-0.5">Sera ajouté comme document</p>
        </div>
      )}

      {/* Header (matche style UpcomingRdv) */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <h3 className="text-[12px] font-bold text-gray-700 flex items-center gap-2">
          📚 Ressources partagées
          {resources.length > 0 && (
            <span className="text-[10px] font-normal text-gray-400">{resources.length}</span>
          )}
        </h3>
        <button
          onClick={openUpload}
          className="text-[10px] font-semibold text-violet-600 hover:text-violet-700 px-2 py-0.5 rounded hover:bg-violet-50 transition-colors"
        >
          + Ajouter
        </button>
      </div>

      {/* Filtres compacts (search + select 3 catégories) */}
      <div className="px-3 py-2 border-b border-gray-50 flex items-center gap-1.5 flex-shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="flex-1 min-w-0 px-2 py-1 text-[11px] rounded-md border border-gray-200 bg-gray-50 outline-none focus:border-indigo-300 focus:bg-white"
        />
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as any)}
          className="px-1.5 py-1 text-[11px] rounded-md border border-gray-200 bg-white outline-none focus:border-indigo-300 flex-shrink-0"
        >
          <option value="all">Tous ({counts.all})</option>
          <option value="document">📄 Docs ({counts.document})</option>
          <option value="call">📞 Appels ({counts.call})</option>
          <option value="link">🔗 Liens ({counts.link})</option>
        </select>
      </div>

      {/* Liste compacte (scroll, hauteur ~ UpcomingRdv) */}
      {isLoading ? (
        <div className="text-center py-12 text-[12px] text-gray-400 flex-1">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 px-4 flex-1">
          <p className="text-3xl mb-2">📚</p>
          <p className="text-[12px] font-semibold text-gray-700">
            {resources.length === 0 ? 'Aucune ressource' : 'Aucun résultat'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {resources.length === 0 ? 'Glisse-dépose un fichier ou clique sur + Ajouter' : 'Essaie un autre filtre'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto max-h-[360px] divide-y divide-gray-50">
          {filtered.map(r => (
            <ResourceRow
              key={r.id}
              resource={r}
              canDelete={!!(r.created_by === profile?.id || isManager)}
            />
          ))}
        </div>
      )}

      {showUpload && <UploadModal onClose={closeUpload} initialFile={initialFile} />}
    </div>
  )
}

function ResourceRow({ resource, canDelete }: { resource: SharedResource; canDelete: boolean }) {
  const del = useDeleteResource()
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loadingAudio, setLoadingAudio] = useState(false)
  const [expanded, setExpanded] = useState(false)

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
        setExpanded(true)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    }
  }

  async function handlePlay() {
    if (audioUrl) { setExpanded(!expanded); return }
    if (!resource.storage_path) return
    setLoadingAudio(true)
    const url = await getResourceSignedUrl(resource.storage_path, 3600)
    setLoadingAudio(false)
    if (url) { setAudioUrl(url); setExpanded(true) }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Supprimer "${resource.title}" ?`)) return
    try {
      await del.mutateAsync(resource)
    } catch (e) {
      alert(`Erreur : ${(e as Error).message}`)
    }
  }

  return (
    <div className="px-3 py-2 hover:bg-violet-50/40 transition-colors">
      <div className="flex items-center gap-2.5 cursor-pointer" onClick={isAudio ? handlePlay : handleOpen}>
        <span className="text-base flex-shrink-0">{KIND_ICONS[resource.kind]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-gray-800 truncate">{resource.title}</span>
            {resource.tags.slice(0, 2).map(t => (
              <span key={t} className="text-[8px] px-1 py-0.5 rounded bg-violet-50 text-violet-600 font-medium flex-shrink-0">{t}</span>
            ))}
          </div>
          <div className="text-[10px] text-gray-400 truncate">
            {(resource.created_by_name || resource.created_by_email || 'inconnu').split('@')[0]}
            {resource.file_size_bytes ? ` · ${formatBytes(resource.file_size_bytes)}` : ''}
            {resource.duration_seconds ? ` · ${formatDuration(resource.duration_seconds)}` : ''}
            {' · '}{relativeDate(resource.created_at)}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); isAudio ? handlePlay() : handleOpen() }}
          disabled={loadingAudio}
          className="text-violet-600 hover:text-violet-700 text-[11px] font-bold flex-shrink-0 px-1.5"
          title={isAudio ? 'Écouter' : 'Ouvrir'}
        >
          {loadingAudio ? '…' : isAudio ? (audioUrl && expanded ? '⏸' : '▶') : '↗'}
        </button>
        {canDelete && (
          <button
            onClick={handleDelete}
            className="text-gray-300 hover:text-red-500 text-[10px] flex-shrink-0"
            title="Supprimer"
          >
            ✕
          </button>
        )}
      </div>
      {audioUrl && expanded && (
        <audio controls autoPlay preload="metadata" src={audioUrl} className="w-full h-8 mt-1.5" onEnded={() => setExpanded(false)} />
      )}
    </div>
  )
}

function UploadModal({ onClose, initialFile }: { onClose: () => void; initialFile?: File | null }) {
  const upload = useUploadResource()
  const createLink = useCreateLinkResource()
  const { isManager } = useAuth()

  // Pré-rempli depuis le drop : titre = nom du fichier sans extension
  const initialTitle = initialFile
    ? initialFile.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80)
    : ''

  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [file, setFile] = useState<File | null>(initialFile || null)
  const [title, setTitle] = useState(initialTitle)
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

  // Portal au body pour sortir du card SharedResources (qui a overflow-hidden)
  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 animate-fade-in overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl animate-fade-in-scale my-8 max-h-[calc(100vh-4rem)] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-[15px] font-bold text-gray-800">Partager une ressource</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
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
    </div>,
    document.body,
  )
}
