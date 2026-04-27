/**
 * Announcements — fil d'annonces internes (admin → équipe).
 *
 * Affichage compact dans le Dashboard (1 col, hauteur ~ UpcomingRdv).
 * Admin/manager peuvent poster, tout le monde lit.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  useAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
  useTouchAnnouncementsSeen,
  type Announcement,
} from '@/hooks/useAnnouncements'

function relativeDate(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export default function Announcements() {
  const { profile, isManager } = useAuth()
  const { data: announcements = [], isLoading } = useAnnouncements()
  const touchSeen = useTouchAnnouncementsSeen()
  const create = useCreateAnnouncement()

  const [showCompose, setShowCompose] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Marque comme vu au mount
  useEffect(() => {
    if (announcements.length > 0) touchSeen.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements.length === 0])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)
    setBusy(true)
    try {
      await create.mutateAsync({ title: title.trim() || undefined, body, pinned })
      setTitle('')
      setBody('')
      setPinned(false)
      setShowCompose(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <h3 className="text-[12px] font-bold text-gray-700 flex items-center gap-2">
          📣 Annonces
          {announcements.length > 0 && (
            <span className="text-[10px] font-normal text-gray-400">{announcements.length}</span>
          )}
        </h3>
        {isManager && !showCompose && (
          <button
            onClick={() => setShowCompose(true)}
            className="text-[10px] font-semibold text-violet-600 hover:text-violet-700 px-2 py-0.5 rounded hover:bg-violet-50 transition-colors"
          >
            + Nouvelle
          </button>
        )}
      </div>

      {/* Compose modal (admin/manager) */}
      {showCompose && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 animate-fade-in overflow-y-auto" onClick={() => setShowCompose(false)}>
          <form
            onSubmit={handleSubmit}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-fade-in-scale my-8 max-h-[calc(100vh-4rem)] flex flex-col"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-4 rounded-t-2xl flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📣</span>
                <div>
                  <h2 className="text-[15px] font-bold text-white">Nouvelle annonce</h2>
                  <p className="text-[11px] text-white/80">Visible immédiatement par toute l'équipe</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCompose(false)}
                className="text-white/70 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider block mb-2">Titre (optionnel)</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Mise à jour Calsyn — connectez votre Gmail"
                  maxLength={120}
                  className="w-full px-4 py-2.5 text-[14px] font-bold border border-gray-200 rounded-xl outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
                <p className="text-[10px] text-gray-400 mt-1">Si présent, affiché en gros au-dessus du message dans le fil.</p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider block mb-2">Message</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body.trim() && !busy) {
                      e.preventDefault()
                      handleSubmit(e as any)
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setShowCompose(false)
                    }
                  }}
                  autoFocus
                  placeholder="Écris ton annonce ici…&#10;&#10;Tu peux faire des sauts de ligne, mettre des listes (- item), ajouter des emojis 🚀"
                  rows={10}
                  className="w-full px-4 py-3 text-[13px] leading-relaxed border border-gray-200 rounded-xl outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 resize-y min-h-[200px] font-[inherit]"
                />
                <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-400">
                  <span>{body.length} caractères</span>
                  <span>Markdown léger supporté (sauts de ligne préservés)</span>
                </div>
              </div>

              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors" onClick={() => setPinned(!pinned)}>
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={e => setPinned(e.target.checked)}
                  className="w-4 h-4 rounded accent-amber-600"
                  onClick={e => e.stopPropagation()}
                />
                <div className="flex-1">
                  <div className="text-[12px] font-bold text-amber-900 flex items-center gap-1.5">
                    📌 Épingler en haut du fil
                  </div>
                  <p className="text-[10px] text-amber-700 mt-0.5">L'annonce reste visible en permanence en tête de liste, idéal pour les infos importantes durables.</p>
                </div>
              </div>

              {/* Aperçu */}
              {body.trim() && (
                <div>
                  <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider block mb-2">Aperçu</label>
                  <div className={`px-4 py-3 rounded-xl border ${pinned ? 'bg-amber-50/50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-start gap-2">
                      {pinned && <span className="text-[12px] flex-shrink-0 mt-0.5">📌</span>}
                      <div className="flex-1 min-w-0">
                        {title.trim() && (
                          <h4 className="text-[13px] font-bold text-gray-900 mb-1">{title.trim()}</h4>
                        )}
                        <p className="text-[12px] text-gray-800 whitespace-pre-wrap leading-snug">{body}</p>
                        <div className="text-[10px] text-gray-400 mt-2 flex items-center gap-1.5">
                          <span>{(profile?.full_name || profile?.email || 'toi').split('@')[0]}</span>
                          <span>·</span>
                          <span>à l'instant</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-2 flex-shrink-0 bg-gray-50/50 rounded-b-2xl">
              <p className="text-[10px] text-gray-400">⏎ Enter = saut de ligne · Cmd+Enter = publier</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCompose(false); setTitle(''); setBody(''); setPinned(false); setError(null) }}
                  className="px-4 py-2 text-[12px] font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={busy || !body.trim()}
                  className="px-5 py-2 text-[12px] font-bold rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                >
                  {busy ? 'Publication…' : '📣 Publier'}
                </button>
              </div>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {/* Fil */}
      {isLoading ? (
        <div className="text-center py-12 text-[12px] text-gray-400 flex-1">Chargement...</div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12 px-4 flex-1">
          <p className="text-3xl mb-2">📣</p>
          <p className="text-[12px] font-semibold text-gray-700">Aucune annonce</p>
          <p className="text-[11px] text-gray-400 mt-1">
            {isManager ? 'Clique sur + Nouvelle pour informer l\'équipe' : 'Tes admins n\'ont rien publié pour le moment'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto max-h-[360px] divide-y divide-gray-50">
          {announcements.map(a => (
            <AnnouncementRow
              key={a.id}
              announcement={a}
              canEdit={!!(a.created_by === profile?.id || isManager)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AnnouncementRow({ announcement, canEdit }: { announcement: Announcement; canEdit: boolean }) {
  const del = useDeleteAnnouncement()
  const update = useUpdateAnnouncement()
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(announcement.title || '')
  const [draft, setDraft] = useState(announcement.body)

  async function save() {
    if (!draft.trim()) return
    try {
      await update.mutateAsync({
        id: announcement.id,
        title: draftTitle.trim() || null,
        body: draft,
      })
      setEditing(false)
    }
    catch (e) { alert((e as Error).message) }
  }

  async function togglePin() {
    try { await update.mutateAsync({ id: announcement.id, pinned: !announcement.pinned }) }
    catch (e) { alert((e as Error).message) }
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette annonce ?')) return
    try { await del.mutateAsync(announcement.id) }
    catch (e) { alert((e as Error).message) }
  }

  return (
    <div className={`px-3 py-2 transition-colors ${announcement.pinned ? 'bg-amber-50/50' : 'hover:bg-gray-50/50'}`}>
      <div className="flex items-start gap-2">
        {announcement.pinned && (
          <span className="text-[11px] flex-shrink-0 mt-0.5" title="Épinglé">📌</span>
        )}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-1.5">
              <input
                type="text"
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                placeholder="Titre (optionnel)"
                maxLength={120}
                className="w-full px-2 py-1.5 text-[12px] font-bold border border-violet-300 rounded-md outline-none"
              />
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                autoFocus
                rows={3}
                className="w-full px-2 py-1.5 text-[12px] border border-violet-300 rounded-md outline-none resize-none"
              />
              <div className="flex gap-1.5">
                <button onClick={save} className="px-2 py-0.5 text-[10px] font-bold rounded bg-violet-600 text-white hover:bg-violet-700">Enregistrer</button>
                <button onClick={() => { setEditing(false); setDraft(announcement.body); setDraftTitle(announcement.title || '') }} className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700">Annuler</button>
              </div>
            </div>
          ) : (
            <>
              {announcement.title && (
                <h4 className="text-[13px] font-bold text-gray-900 mb-1 leading-tight">{announcement.title}</h4>
              )}
              <p className="text-[12px] text-gray-800 whitespace-pre-wrap leading-snug">{announcement.body}</p>
              <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1.5">
                <span>{(announcement.created_by_name || announcement.created_by_email || 'inconnu').split('@')[0]}</span>
                <span>·</span>
                <span>{relativeDate(announcement.created_at)}</span>
              </div>
            </>
          )}
        </div>
        {canEdit && !editing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={togglePin} className="text-gray-300 hover:text-amber-500 text-[11px]" title={announcement.pinned ? 'Désépingler' : 'Épingler'}>
              📌
            </button>
            <button onClick={() => setEditing(true)} className="text-gray-300 hover:text-indigo-500 text-[11px]" title="Modifier">
              ✎
            </button>
            <button onClick={handleDelete} className="text-gray-300 hover:text-red-500 text-[11px]" title="Supprimer">
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
