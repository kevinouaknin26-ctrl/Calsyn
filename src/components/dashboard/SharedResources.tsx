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
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useGmail } from '@/hooks/useGmail'
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
  const upload = useUploadResource()

  const [showUpload, setShowUpload] = useState(false)
  const [initialFile, setInitialFile] = useState<File | null>(null)
  const [filter, setFilter] = useState<'all' | 'document' | 'call' | 'link'>('all')
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; failed: number } | null>(null)

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

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length === 0) return

    // 1 seul fichier → ouvre la modale pour customiser titre/desc/tags
    if (files.length === 1) {
      setInitialFile(files[0])
      setShowUpload(true)
      return
    }

    // Plusieurs fichiers → upload silent en batch, titre = filename
    setBatchProgress({ done: 0, total: files.length, failed: 0 })
    let done = 0
    let failed = 0
    for (const f of files) {
      try {
        if (f.size > 50 * 1024 * 1024) { failed++; continue }
        const title = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80)
        await upload.mutateAsync({ file: f, title, kind: 'document' })
        done++
      } catch {
        failed++
      } finally {
        setBatchProgress({ done: done + failed, total: files.length, failed })
      }
    }
    // Laisse le toast 3s puis efface
    setTimeout(() => setBatchProgress(null), 3000)
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
          <p className="text-[13px] font-bold text-violet-700">Déposez ici</p>
          <p className="text-[11px] text-violet-500 mt-0.5">1 fichier → modale · Plusieurs → upload direct</p>
        </div>
      )}

      {/* Toast progress batch upload */}
      {batchProgress && (
        <div className="absolute top-2 left-2 right-2 z-10 bg-violet-600 text-white rounded-lg px-3 py-2 shadow-lg flex items-center gap-2">
          {batchProgress.done < batchProgress.total ? (
            <>
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="text-[11px] font-semibold flex-1">
                Upload {batchProgress.done}/{batchProgress.total}…
              </span>
            </>
          ) : (
            <>
              <span className="text-[14px]">{batchProgress.failed === 0 ? '✓' : '⚠️'}</span>
              <span className="text-[11px] font-semibold flex-1">
                {batchProgress.failed === 0
                  ? `${batchProgress.total} fichiers ajoutés`
                  : `${batchProgress.done - batchProgress.failed}/${batchProgress.total} OK · ${batchProgress.failed} échec`}
              </span>
            </>
          )}
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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shareModal, setShareModal] = useState(false)
  const [copied, setCopied] = useState(false)

  async function getShareableUrl(): Promise<string> {
    if (resource.external_url) return resource.external_url
    if (resource.storage_path) {
      const url = await getResourceSignedUrl(resource.storage_path, 7 * 24 * 3600)  // 7 jours
      if (url) return url
    }
    return ''
  }

  async function handleCopyLink() {
    const url = await getShareableUrl()
    if (!url) { alert('Impossible de générer le lien'); return }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setMenuOpen(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('Impossible de copier (clipboard refusé)')
    }
  }

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

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmDelete(true)
  }

  async function confirmAndDelete() {
    try {
      await del.mutateAsync(resource)
      setConfirmDelete(false)
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
        <div className="relative flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            className="text-gray-400 hover:text-gray-700 px-1 text-[14px]"
            title="Plus d'actions"
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setMenuOpen(false) }} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg w-44 py-1 text-[11px]">
                <button
                  onClick={e => { e.stopPropagation(); handleCopyLink() }}
                  className="w-full px-3 py-1.5 text-left hover:bg-gray-50 flex items-center gap-2"
                >
                  📋 {copied ? 'Copié !' : 'Copier le lien'}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(false); setShareModal(true) }}
                  className="w-full px-3 py-1.5 text-left hover:bg-gray-50 flex items-center gap-2"
                >
                  📤 Envoyer par mail
                </button>
                {canDelete && (
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); setConfirmDelete(true) }}
                    className="w-full px-3 py-1.5 text-left hover:bg-red-50 text-red-600 flex items-center gap-2 border-t border-gray-100"
                  >
                    ✕ Supprimer
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {audioUrl && expanded && (
        <audio controls autoPlay preload="metadata" src={audioUrl} className="w-full h-8 mt-1.5" onEnded={() => setExpanded(false)} />
      )}
      {shareModal && (
        <ShareResourceModal
          resource={resource}
          getShareableUrl={getShareableUrl}
          onClose={() => setShareModal(false)}
        />
      )}
      {confirmDelete && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl animate-fade-in-scale p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xl flex-shrink-0">⚠️</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-bold text-gray-800">Supprimer cette ressource ?</h3>
                <p className="text-[12px] text-gray-500 mt-1 break-words">
                  <span className="font-semibold">{resource.title}</span> sera retiré pour toute l'équipe. Action irréversible.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 rounded-lg text-[12px] font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Annuler
              </button>
              <button
                onClick={confirmAndDelete}
                disabled={del.isPending}
                className="flex-1 py-2 rounded-lg text-[12px] font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {del.isPending ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function ShareResourceModal({
  resource,
  getShareableUrl,
  onClose,
}: {
  resource: SharedResource
  getShareableUrl: () => Promise<string>
  onClose: () => void
}) {
  const { profile, organisation } = useAuth()
  const { sendEmail } = useGmail()

  const [recipients, setRecipients] = useState<Array<{ email: string; name?: string }>>([])
  const [recipientInput, setRecipientInput] = useState('')
  const [autocompleteOpen, setAutocompleteOpen] = useState(false)
  const [message, setMessage] = useState(`Salut,\n\nJe te partage cette ressource : "${resource.title}".\n\n`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const { data: hits = [] } = useQuery({
    queryKey: ['share-autocomplete', organisation?.id, recipientInput],
    queryFn: async () => {
      if (recipientInput.trim().length < 2) return [] as Array<{ email: string; name: string; source: 'team' | 'prospect' }>
      const q = recipientInput.trim()
      const [{ data: profiles }, { data: prospects }] = await Promise.all([
        supabase.from('profiles')
          .select('id, email, full_name')
          .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
          .neq('id', profile?.id || '')
          .is('deactivated_at', null)
          .limit(5),
        supabase.from('prospects')
          .select('id, email, name')
          .or(`email.ilike.%${q}%,name.ilike.%${q}%`)
          .not('email', 'is', null)
          .is('deleted_at', null)
          .limit(8),
      ])
      const out: Array<{ email: string; name: string; source: 'team' | 'prospect' }> = []
      for (const p of profiles || []) {
        if (p.email) out.push({ email: p.email, name: p.full_name || p.email, source: 'team' })
      }
      for (const p of prospects || []) {
        if (p.email && !out.some(h => h.email === p.email)) {
          out.push({ email: p.email, name: p.name || p.email, source: 'prospect' })
        }
      }
      return out.slice(0, 8)
    },
    enabled: !!organisation?.id && recipientInput.trim().length >= 2,
  })

  function addRecipient(r: { email: string; name?: string }) {
    if (!r.email || !EMAIL_RE.test(r.email)) return
    if (recipients.some(x => x.email.toLowerCase() === r.email.toLowerCase())) return
    setRecipients([...recipients, r])
    setRecipientInput('')
    setAutocompleteOpen(false)
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !recipientInput && recipients.length > 0) {
      e.preventDefault()
      setRecipients(recipients.slice(0, -1))
    }
    if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && recipientInput.trim()) {
      e.preventDefault()
      const v = recipientInput.trim().replace(/,$/, '')
      if (EMAIL_RE.test(v)) addRecipient({ email: v })
    }
  }

  useEffect(() => {
    setAutocompleteOpen(recipientInput.trim().length >= 2 && hits.length > 0)
  }, [hits, recipientInput])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (recipients.length === 0) { setError('Ajoute au moins un destinataire'); return }
    setBusy(true)
    try {
      const url = await getShareableUrl()
      if (!url) throw new Error('Impossible de générer le lien')
      const to = recipients.map(r => r.email).join(', ')
      const subject = `Ressource partagée : ${resource.title}`
      const body = `${message.trim()}\n\n${url}\n\n--\n${profile?.full_name || profile?.email || ''}`
      const result = await sendEmail({ to, subject, body })
      if (result.error) throw new Error(result.error)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 animate-fade-in overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl animate-fade-in-scale my-8 max-h-[calc(100vh-4rem)] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-[15px] font-bold text-gray-800">Envoyer par mail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-3 overflow-y-auto flex-1">
          <div className="text-[11px] text-gray-500 px-2 py-1.5 rounded-md bg-violet-50 border border-violet-100">
            📤 <span className="font-semibold">{resource.title}</span> — un mail avec le lien sera envoyé.
          </div>

          <div className="relative">
            <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">À</label>
            <div className="flex flex-wrap gap-1.5 px-2 py-1.5 border border-gray-200 rounded-lg focus-within:border-violet-400 min-h-[40px] items-center">
              {recipients.map(r => (
                <span key={r.email} className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 bg-violet-100 text-violet-700">
                  <span>{r.name || r.email}</span>
                  <button type="button" onClick={() => setRecipients(recipients.filter(x => x.email !== r.email))} className="hover:text-red-500">✕</button>
                </span>
              ))}
              <input
                type="text"
                value={recipientInput}
                onChange={e => setRecipientInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={recipients.length === 0 ? 'Email, nom contact ou membre…' : ''}
                className="flex-1 min-w-[120px] text-[12px] outline-none bg-transparent py-1"
                autoFocus
              />
            </div>
            {autocompleteOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                {hits.map(h => (
                  <button
                    key={`${h.source}-${h.email}`}
                    type="button"
                    onClick={() => addRecipient({ email: h.email, name: h.name })}
                    className="w-full text-left px-3 py-2 hover:bg-violet-50 flex items-center gap-2 text-[12px]"
                  >
                    <span>{h.source === 'team' ? '👥' : '👤'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 truncate">{h.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{h.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-violet-400 resize-y"
            />
          </div>

          {error && <div className="text-[11px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-[12px] font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">Annuler</button>
            <button
              type="submit"
              disabled={busy || recipients.length === 0}
              className="flex-1 py-2 rounded-lg text-[12px] font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? 'Envoi…' : `Envoyer${recipients.length > 1 ? ` (${recipients.length})` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
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
              {file ? (
                // Widget custom : affiche le fichier choisi (drop ou picker)
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-200 bg-violet-50">
                  <span className="text-xl flex-shrink-0">📎</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-gray-800 truncate">{file.name}</div>
                    <div className="text-[10px] text-gray-500">{formatBytes(file.size)}</div>
                  </div>
                  <label className="text-[11px] font-semibold text-violet-700 hover:text-violet-800 cursor-pointer px-2 py-1 hover:bg-violet-100 rounded">
                    Changer
                    <input
                      type="file"
                      onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }}
                      accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.mp3,.m4a,.wav,.mp4"
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-gray-400 hover:text-red-500 px-1 text-[14px]"
                    title="Retirer"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.mp3,.m4a,.wav,.mp4"
                  className="w-full text-[12px] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-violet-50 file:text-violet-700 file:font-semibold hover:file:bg-violet-100"
                />
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
