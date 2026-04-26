/**
 * Announcements — fil d'annonces internes (admin → équipe).
 *
 * Affichage compact dans le Dashboard (1 col, hauteur ~ UpcomingRdv).
 * Admin/manager peuvent poster, tout le monde lit.
 */

import { useEffect, useState } from 'react'
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
      await create.mutateAsync({ body, pinned })
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

      {/* Compose (admin/manager) */}
      {showCompose && (
        <form onSubmit={handleSubmit} className="px-3 py-2 border-b border-gray-50 bg-violet-50/30 space-y-2 flex-shrink-0">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            autoFocus
            placeholder="Annonce à toute l'équipe..."
            rows={3}
            className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none focus:border-violet-400 resize-none"
          />
          {error && <div className="text-[10px] text-red-600">{error}</div>}
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer">
              <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="w-3 h-3" />
              Épingler en haut
            </label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => { setShowCompose(false); setBody(''); setPinned(false); setError(null) }}
                className="px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy || !body.trim()}
                className="px-3 py-1 text-[11px] font-bold rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {busy ? '...' : 'Publier'}
              </button>
            </div>
          </div>
        </form>
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
  const [draft, setDraft] = useState(announcement.body)

  async function save() {
    if (!draft.trim()) return
    try { await update.mutateAsync({ id: announcement.id, body: draft }); setEditing(false) }
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
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                autoFocus
                rows={3}
                className="w-full px-2 py-1.5 text-[12px] border border-violet-300 rounded-md outline-none resize-none"
              />
              <div className="flex gap-1.5">
                <button onClick={save} className="px-2 py-0.5 text-[10px] font-bold rounded bg-violet-600 text-white hover:bg-violet-700">Enregistrer</button>
                <button onClick={() => { setEditing(false); setDraft(announcement.body) }} className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700">Annuler</button>
              </div>
            </div>
          ) : (
            <>
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
