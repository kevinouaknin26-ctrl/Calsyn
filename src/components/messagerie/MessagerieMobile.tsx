/**
 * MessagerieMobile — Vue mobile dédiée de la messagerie.
 *
 * 2 vues full-screen :
 * - Liste conversations (recherche + tabs canal + cards conv)
 * - Thread chat sélectionné (header back + messages + composer)
 *
 * Navigation : tap conv = passe en vue thread, tap back = retour liste.
 * State local (pas de routing supplémentaire) — léger, rapide.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { stripPlainTextQuote } from '@/lib/emailQuote'
import EmailHtmlContent from '@/components/messagerie/EmailHtmlContent'
import { useConversations, useConversation } from '@/hooks/useMessaging'
import { CHANNELS, ENABLED_CHANNELS, getChannel, type ChannelId, type UnifiedMessage } from '@/services/channels'

function formatTimeAgo(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000
  if (sec < 60) return 'à l\'instant'
  if (sec < 3600) return `${Math.round(sec / 60)} min`
  if (sec < 86400) return `${Math.round(sec / 3600)} h`
  if (sec < 86400 * 7) return `${Math.round(sec / 86400)} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export default function MessagerieMobile() {
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null)

  if (selectedProspectId) {
    return <MobileThreadView prospectId={selectedProspectId} onBack={() => setSelectedProspectId(null)} />
  }

  return <MobileConversationList onSelect={setSelectedProspectId} />
}

// ────────────────────────────────────────────────────────────────────
// Vue 1 : Liste des conversations
// ────────────────────────────────────────────────────────────────────

function MobileConversationList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: conversations = [], isLoading } = useConversations()
  const [search, setSearch] = useState('')
  const [filterChannel, setFilterChannel] = useState<ChannelId | 'all'>('all')

  const filtered = useMemo(() => {
    let list = conversations
    if (filterChannel !== 'all') list = list.filter(c => c.last_channel === filterChannel)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.prospect_name || '').toLowerCase().includes(q) ||
        (c.prospect_email || '').toLowerCase().includes(q) ||
        (c.prospect_phone || '').includes(q) ||
        (c.last_message.body || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [conversations, search, filterChannel])

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: conversations.length }
    for (const c of conversations) {
      m[c.last_channel] = (m[c.last_channel] || 0) + 1
    }
    return m
  }, [conversations])

  return (
    <div className="h-full flex flex-col bg-[#f8f9fa] overflow-hidden">
      {/* Search */}
      <div className="bg-white border-b border-gray-100 px-3 py-2 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher conversation..."
            className="w-full pl-9 pr-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-indigo-300 outline-none"
          />
        </div>
      </div>

      {/* Tabs canal */}
      <div className="bg-white border-b border-gray-100 px-2 py-2 overflow-x-auto scrollbar-hide flex-shrink-0">
        <div className="flex gap-1.5 px-1">
          <ChannelPill active={filterChannel === 'all'} count={counts.all} onClick={() => setFilterChannel('all')} label="Tout" icon="🔔" color="#6366f1" />
          {ENABLED_CHANNELS.map(id => {
            const c = CHANNELS[id]
            return (
              <ChannelPill
                key={id}
                active={filterChannel === id}
                count={counts[id] || 0}
                onClick={() => setFilterChannel(id)}
                label={c.label}
                icon={c.icon}
                color={c.color}
              />
            )
          })}
        </div>
      </div>

      {/* Liste conv */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-12 text-[12px] text-gray-400">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">💬</p>
            <p className="text-[13px] font-semibold text-gray-700">Aucune conversation</p>
            <p className="text-[11px] text-gray-400 mt-1">{search ? 'Essaie une autre recherche' : 'Tes conversations apparaîtront ici'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(conv => {
              const meta = getChannel(conv.last_channel)
              const initial = (conv.prospect_name || '?')[0].toUpperCase()
              return (
                <button
                  key={conv.prospect_id}
                  onClick={() => onSelect(conv.prospect_id)}
                  className="w-full px-3 py-3 flex items-start gap-3 active:bg-gray-50 transition-colors text-left"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-white text-[16px] font-bold flex items-center justify-center">
                      {initial}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white border-2 border-white flex items-center justify-center text-[10px]" style={{ background: meta.color, color: 'white' }}>
                      {meta.icon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <span className={`text-[13px] truncate ${conv.unread_count > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                        {conv.prospect_name || 'Inconnu'}
                      </span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{formatTimeAgo(conv.last_message.sent_at)}</span>
                    </div>
                    <div className={`text-[12px] line-clamp-2 leading-snug ${conv.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                      {conv.last_message.direction === 'out' && '↩ '}
                      {conv.last_message.subject && <span className="text-gray-700 font-semibold">{conv.last_message.subject} — </span>}
                      {(conv.last_message.body || '(vide)').slice(0, 80)}
                    </div>
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center mt-1">
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ChannelPill({ active, count, onClick, label, icon, color }: {
  active: boolean; count: number; onClick: () => void; label: string; icon: string; color: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
        active ? 'text-white' : 'bg-gray-100 text-gray-600'
      }`}
      style={active ? { background: color } : undefined}
    >
      <span className="text-[12px]">{icon}</span>
      <span>{label}</span>
      <span className={`text-[9px] tabular-nums px-1 rounded ${active ? 'bg-white/25' : 'bg-white text-gray-500'}`}>{count}</span>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────
// Vue 2 : Thread (chat plein écran)
// ────────────────────────────────────────────────────────────────────

function MobileThreadView({ prospectId, onBack }: { prospectId: string; onBack: () => void }) {
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

  const { data: prospect } = useQuery({
    queryKey: ['prospect-info', prospectId],
    queryFn: async () => {
      const { data } = await supabase.from('prospects').select('id, name, phone, email').eq('id', prospectId).single()
      return data
    },
  })

  useEffect(() => { setActiveChannel(defaultReplyChannel) }, [prospectId, defaultReplyChannel])
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
    for (const msg of messages) if (msg.direction === 'in') m.set(msg.channel, msg)
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
        subject: isEmail ? (draftSubject.trim() || (replyTo?.subject ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, '')}` : '')) : undefined,
        replyTo,
        attachments: isEmail && attachments.length > 0 ? attachments : undefined,
      })
      setDraft(''); setDraftSubject(''); setAttachments([])
    } catch (e) {
      alert('Erreur envoi : ' + (e as Error).message)
    }
  }

  const initial = (prospect?.name || '?')[0].toUpperCase()
  const ch = getChannel(activeChannel)

  return (
    <div className="h-full flex flex-col bg-[#f8f9fa] overflow-hidden">
      {/* Header avec back + nom + actions */}
      <div className="bg-white border-b border-gray-200 flex items-center gap-2 px-2 py-2 flex-shrink-0">
        <button onClick={onBack} className="p-2 active:bg-gray-100 rounded-full">
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={() => navigate(`/app/contacts?prospect=${prospectId}`)} className="flex-1 min-w-0 flex items-center gap-2 active:bg-gray-50 rounded-lg px-1 py-1">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-gray-800 truncate">{prospect?.name || 'Inconnu'}</div>
            <div className="text-[10px] text-gray-500 truncate">{prospect?.phone || prospect?.email}</div>
          </div>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-12 text-[13px] text-gray-400">Pas encore de message</div>
        )}
        {messages.map(m => {
          const c = getChannel(m.channel)
          const isOut = m.direction === 'out'
          return (
            <div key={m.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] min-w-0 ${isOut ? 'bg-violet-100 text-violet-900 border border-violet-200' : 'bg-white text-gray-800 border border-gray-200'} rounded-2xl px-3 py-2 shadow-sm overflow-hidden`}>
                {m.subject && <div className={`text-[11px] font-bold mb-1 ${isOut ? 'text-violet-700' : 'text-gray-700'} truncate`}>{m.subject}</div>}
                {(m as any).body_html && m.channel === 'email' ? (
                  <EmailHtmlContent html={(m as any).body_html} className="text-[13px] leading-relaxed prose-sm max-w-none" />
                ) : (
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                    {(m.channel === 'email' ? stripPlainTextQuote(m.body || '') : (m.body || '')) || '(vide)'}
                  </div>
                )}
                <div className={`text-[9px] mt-1 ${isOut ? 'text-violet-600' : 'text-gray-400'}`}>{c.icon} {new Date(m.sent_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="bg-white border-t border-gray-200 px-2 py-2 flex-shrink-0">
        {/* Pills canaux */}
        <div className="flex items-center gap-1 mb-2 overflow-x-auto scrollbar-hide">
          {availableChannels.map(id => {
            const c = CHANNELS[id]
            const isActive = id === activeChannel
            return (
              <button key={id} onClick={() => setActiveChannel(id)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${isActive ? c.pillClass : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                {c.icon} {c.label}
              </button>
            )
          })}
        </div>

        {/* Subject (email only) */}
        {activeChannel === 'email' && (
          <input
            type="text"
            value={draftSubject}
            onChange={e => setDraftSubject(e.target.value)}
            placeholder={lastIncomingByChannel.get('email')?.subject ? `Re: ${lastIncomingByChannel.get('email')!.subject!.replace(/^Re:\s*/i, '')}` : 'Objet du mail'}
            className="w-full mb-2 px-3 py-2 text-[12px] rounded-lg border border-gray-200 bg-gray-50 outline-none focus:bg-white focus:border-indigo-300"
          />
        )}

        {/* Attachments pills */}
        {activeChannel === 'email' && attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {attachments.map((f, i) => (
              <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-[10px] text-violet-700">
                <span className="truncate max-w-[120px]">📎 {f.name}</span>
                <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-violet-400 hover:text-red-500">×</button>
              </div>
            ))}
          </div>
        )}

        {/* Input + actions */}
        <div className="flex items-end gap-1.5">
          {activeChannel === 'email' && (
            <>
              <input ref={fileInputRef} type="file" multiple className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  setAttachments(prev => [...prev, ...files])
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }} />
              <button onClick={() => fileInputRef.current?.click()} title="Joindre un fichier"
                className="px-2.5 py-2.5 rounded-full border border-gray-200 bg-white text-gray-500 active:bg-gray-100">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              </button>
            </>
          )}
          <textarea value={draft} onChange={e => setDraft(e.target.value)}
            placeholder={`${ch.label}…`}
            rows={1}
            className="flex-1 px-3 py-2 rounded-2xl border border-gray-200 bg-gray-50 text-[13px] outline-none focus:bg-white focus:border-indigo-300 resize-none" />
          <button onClick={handleSend} disabled={!draft.trim() || sending}
            className="w-10 h-10 rounded-full bg-indigo-600 text-white text-[15px] font-semibold disabled:opacity-30 active:bg-indigo-700 flex items-center justify-center flex-shrink-0">
            ➤
          </button>
        </div>
      </div>
    </div>
  )
}
