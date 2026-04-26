/**
 * Messagerie — Inbox unifié SMS/Email/WhatsApp/… style Messenger.
 *
 * Layout 2 colonnes :
 *  - Gauche : liste des conversations (1 par prospect, dernier message + unread)
 *  - Droite : thread view + composer (canal auto-détecté ou switchable)
 *
 * Le canal de réponse par défaut = celui du dernier message reçu. L'user peut
 * forcer un autre canal via les pills en haut du composer.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConversations, useConversation } from '@/hooks/useMessaging'
import { useAuth } from '@/hooks/useAuth'
import { useChatDock } from '@/contexts/ChatDockContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import MessagerieMobile from '@/components/messagerie/MessagerieMobile'
import { CHANNELS, ENABLED_CHANNELS, getChannel, type ChannelId, type UnifiedMessage } from '@/services/channels'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'

function formatTimeAgo(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function formatTimeFull(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

type ReadFilter = 'all' | 'unread' | 'read'

export default function Messagerie() {
  const isMobile = useIsMobile()
  if (isMobile) return <MessagerieMobile />
  return <MessagerieDesktop />
}

function MessagerieDesktop() {
  const { data: conversations, isLoading } = useConversations()
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')
  const [channelFilter, setChannelFilter] = useState<ChannelId | 'all'>('all')

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (conversations || []).filter(c => {
      // Filtre lu/non-lu
      if (readFilter === 'unread' && c.unread_count === 0) return false
      if (readFilter === 'read' && c.unread_count > 0) return false
      // Filtre canal (sur le dernier message)
      if (channelFilter !== 'all' && c.last_channel !== channelFilter) return false
      // Recherche : nom prospect, phone, email, body, from/to du dernier message
      if (s) {
        const hay = [
          c.prospect_name, c.prospect_phone, c.prospect_email,
          c.last_message.body, c.last_message.subject,
          c.last_message.from_address, c.last_message.to_address,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [conversations, search, readFilter, channelFilter])

  // Auto-select première conv si rien sélectionné
  useEffect(() => {
    if (!selectedProspectId && filtered.length > 0) {
      setSelectedProspectId(filtered[0].prospect_id)
    }
  }, [filtered, selectedProspectId])

  return (
    <div className="h-full flex bg-[#f8f9fa] dark:bg-[#e8e0f0]">
      {/* Liste conversations */}
      <div className="w-[340px] flex-shrink-0 bg-white dark:bg-[#f0eaf5] border-r border-gray-200 dark:border-[#d4cade] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          <h1 className="text-base font-bold text-gray-800">Messagerie</h1>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, email, contenu…"
              className="text-[12px] bg-transparent outline-none text-gray-700 placeholder:text-gray-400 w-full" />
          </div>
          {/* Filtres */}
          <div className="flex items-center gap-1 flex-wrap">
            {(['all', 'unread', 'read'] as ReadFilter[]).map(f => (
              <button key={f} onClick={() => setReadFilter(f)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${readFilter === f ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                {f === 'all' ? 'Tous' : f === 'unread' ? 'Non lus' : 'Lus'}
              </button>
            ))}
            <span className="w-px h-4 bg-gray-200 mx-1" />
            <button onClick={() => setChannelFilter('all')}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${channelFilter === 'all' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
              Tous
            </button>
            {ENABLED_CHANNELS.map(id => {
              const c = CHANNELS[id]
              const active = channelFilter === id
              return (
                <button key={id} onClick={() => setChannelFilter(id)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${active ? c.pillClass : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                  {c.icon}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="text-sm text-gray-400 text-center py-10">Chargement…</p>}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-10 px-4">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-sm font-semibold text-gray-700">Aucune conversation</p>
              <p className="text-[11px] text-gray-400 mt-1">Les SMS, emails et messages WhatsApp avec tes prospects apparaîtront ici.</p>
            </div>
          )}
          {filtered.map(c => {
            const ch = getChannel(c.last_channel)
            const isSelected = c.prospect_id === selectedProspectId
            return (
              <button key={c.prospect_id} onClick={() => setSelectedProspectId(c.prospect_id)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors flex items-center gap-2.5 ${isSelected ? 'bg-indigo-50/60' : ''}`}>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {(c.prospect_name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[13px] truncate ${c.unread_count > 0 ? 'font-bold text-gray-800' : 'font-medium text-gray-700'}`}>
                      {c.prospect_name || 'Inconnu'}
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{formatTimeAgo(c.last_message.sent_at)}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span title={ch.label} className="text-[10px] flex-shrink-0">{ch.icon}</span>
                    <span className={`text-[11px] truncate flex-1 ${c.unread_count > 0 ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>
                      {c.last_message.direction === 'out' && <span className="text-gray-400">Toi : </span>}
                      {ch.formatPreview(c.last_message)}
                    </span>
                    {c.unread_count > 0 && (
                      <span className="text-[9px] font-bold bg-indigo-500 text-white px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedProspectId ? (
          <ConversationView prospectId={selectedProspectId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Sélectionne une conversation
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Conversation view (panneau de droite)
// ────────────────────────────────────────────────────────────────────

function ConversationView({ prospectId }: { prospectId: string }) {
  const { openChat } = useChatDock()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { messages, send, sending, defaultReplyChannel, markAsRead } = useConversation(prospectId)
  const [draft, setDraft] = useState('')
  const [draftSubject, setDraftSubject] = useState('')
  const [activeChannel, setActiveChannel] = useState<ChannelId>(defaultReplyChannel)
  const [attachments, setAttachments] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const signature = profile?.email_signature || ''

  // Prospect info pour header + canaux disponibles
  const { data: prospect } = useQuery({
    queryKey: ['prospect-info', prospectId],
    queryFn: async () => {
      const { data } = await supabase.from('prospects').select('id, name, phone, email').eq('id', prospectId).single()
      return data
    },
  })

  // Auto-scroll bas + mark as read
  useEffect(() => {
    setActiveChannel(defaultReplyChannel)
  }, [prospectId, defaultReplyChannel])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    markAsRead()
  }, [messages.length, prospectId, markAsRead])

  const availableChannels = useMemo(() => {
    if (!prospect) return ENABLED_CHANNELS
    return ENABLED_CHANNELS.filter(id => CHANNELS[id].isAvailableForProspect(prospect))
  }, [prospect])

  const lastIncomingByChannel = useMemo(() => {
    const m = new Map<ChannelId, UnifiedMessage>()
    for (const msg of messages) {
      if (msg.direction === 'in') m.set(msg.channel, msg)
    }
    return m
  }, [messages])

  async function handleSend() {
    if (!draft.trim() || sending) return
    const replyTo = lastIncomingByChannel.get(activeChannel)
    const isEmail = activeChannel === 'email'
    const finalBody = isEmail && signature && !draft.includes(signature.trim().slice(0, 30))
      ? `${draft}\n\n${signature}`
      : draft
    try {
      await send({
        channel: activeChannel,
        prospectId,
        body: finalBody,
        subject: isEmail ? (draftSubject || (replyTo?.subject ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, '')}` : '')) : undefined,
        replyTo,
        attachments: isEmail && attachments.length > 0 ? attachments : undefined,
      })
      setDraft('')
      setDraftSubject('')
      setAttachments([])
    } catch (e) {
      alert('Erreur envoi : ' + (e as Error).message)
    }
  }

  const ch = getChannel(activeChannel)

  return (
    <>
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white dark:bg-[#f0eaf5] flex items-center gap-3">
        <button onClick={() => navigate('/app/contacts', { state: { openProspectId: prospectId } })}
          title="Ouvrir la fiche prospect"
          className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold text-sm hover:scale-105 transition-transform">
          {(prospect?.name || '?')[0].toUpperCase()}
        </button>
        <button onClick={() => navigate('/app/contacts', { state: { openProspectId: prospectId } })}
          title="Ouvrir la fiche prospect"
          className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
          <div className="text-[14px] font-bold text-gray-800 truncate hover:text-indigo-600">{prospect?.name || 'Inconnu'}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-2">
            {prospect?.phone && <span>{prospect.phone}</span>}
            {prospect?.email && <span className="truncate">{prospect.email}</span>}
          </div>
        </button>
        <button onClick={() => openChat(prospectId)} title="Ouvrir en bulle flottante (suit la navigation)"
          className="text-gray-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l7-7m0 0v6m0-6h-6M5 5h6M5 5v6M5 5l7 7" transform="rotate(45 12 12)" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
        {messages.length === 0 && (
          <div className="text-center py-10 text-sm text-gray-400">
            Aucun message — envoie le premier 👋
          </div>
        )}
        {messages.map((m, i) => {
          const c = getChannel(m.channel)
          const isOut = m.direction === 'out'
          const showDate = i === 0 || new Date(m.sent_at).toDateString() !== new Date(messages[i - 1].sent_at).toDateString()
          return (
            <div key={m.id}>
              {showDate && (
                <div className="text-center text-[10px] text-gray-400 my-3 uppercase tracking-wider">
                  {new Date(m.sent_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
              )}
              <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] ${isOut ? 'bg-indigo-500 text-white' : 'bg-white border border-gray-200 text-gray-800'} rounded-2xl px-3.5 py-2 shadow-sm`}>
                  {m.subject && (
                    <div className={`text-[11px] font-bold mb-1 ${isOut ? 'text-white/80' : 'text-gray-700'}`}>{m.subject}</div>
                  )}
                  {m.body_html && m.channel === 'email' ? (
                    <div className="text-[12px] leading-relaxed prose-sm max-w-none [&_a]:underline" dangerouslySetInnerHTML={{ __html: stripGmailQuote(m.body_html) }} />
                  ) : (
                    <div className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">{m.body || '(message vide)'}</div>
                  )}
                  <div className={`flex items-center gap-1.5 mt-1 ${isOut ? 'text-white/70' : 'text-gray-400'}`}>
                    <span className="text-[9px]">{c.icon}</span>
                    <span className="text-[9px]">{formatTimeFull(m.sent_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 bg-white dark:bg-[#f0eaf5] px-4 py-3">
        {/* Channel toggles */}
        <div className="flex items-center gap-1 mb-2">
          {availableChannels.map(id => {
            const c = CHANNELS[id]
            const isActive = id === activeChannel
            return (
              <button key={id} onClick={() => setActiveChannel(id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${isActive ? c.pillClass : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}>
                {c.icon} {c.label}
              </button>
            )
          })}
        </div>
        {activeChannel === 'email' && (
          <input type="text" value={draftSubject} onChange={e => setDraftSubject(e.target.value)}
            placeholder={lastIncomingByChannel.get('email')?.subject ? `Re: ${lastIncomingByChannel.get('email')!.subject!.replace(/^Re:\s*/i, '')}` : 'Objet'}
            className="w-full px-3 py-1.5 mb-2 rounded-lg border border-gray-200 bg-white text-[12px] outline-none focus:border-indigo-300" />
        )}
        {/* Pièces jointes (email only) */}
        {activeChannel === 'email' && attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachments.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-50 border border-violet-200 text-[11px] text-violet-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                <span className="truncate max-w-[160px]">{f.name}</span>
                <span className="text-[9px] text-violet-400 tabular-nums">{(f.size / 1024).toFixed(0)}ko</span>
                <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                  className="text-violet-400 hover:text-red-500 ml-0.5">×</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          {activeChannel === 'email' && (
            <>
              <input ref={fileInputRef} type="file" multiple className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  setAttachments(prev => [...prev, ...files])
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }} />
              <button onClick={() => fileInputRef.current?.click()} title="Joindre un fichier"
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-violet-600 hover:border-violet-200 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              </button>
            </>
          )}
          <textarea value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !sending) { e.preventDefault(); handleSend() } }}
            placeholder={`Écrire en ${ch.label}…`}
            rows={2}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-[12px] outline-none focus:border-indigo-300 resize-none" />
          <button onClick={handleSend} disabled={!draft.trim() || sending}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold disabled:opacity-50 hover:bg-indigo-700">
            {sending ? '…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </>
  )
}

// Strip les quotes Gmail (>>) d'un HTML pour ne garder que le contenu utile
function stripGmailQuote(html: string): string {
  return html
    .replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<div class="gmail_quote"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/On .+? wrote:[\s\S]*$/i, '')
}
