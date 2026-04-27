/**
 * ChatDock — Bulles de chat flottantes en bas à droite, à la Messenger.
 *
 * Persiste les chats ouverts via ChatDockContext (localStorage).
 * Caché sur la page /app/messagerie (qui a déjà sa propre vue thread plein écran).
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useChatDock } from '@/contexts/ChatDockContext'
import { useConversation } from '@/hooks/useMessaging'
import { useAuth } from '@/hooks/useAuth'
import { CHANNELS, ENABLED_CHANNELS, getChannel, type ChannelId, type UnifiedMessage } from '@/services/channels'
import { stripGmailQuote, stripPlainTextQuote } from '@/lib/emailQuote'

export default function ChatDock() {
  const { chats } = useChatDock()
  const location = useLocation()
  if (location.pathname.startsWith('/app/messagerie')) return null
  if (chats.length === 0) return null

  // Sur mobile (<= sm), ChatDock est masqué (la messagerie pleine page est plus
  // utilisable). Sur desktop : décalé à right-[344px] pour cohabiter avec
  // MessagingDockBar même ouverte (320px + 16 + marge).
  return (
    <div className="desktop-only-mobile-hidden fixed bottom-0 right-[344px] flex items-end gap-3 z-40 pointer-events-none">
      {chats.map(c => (
        <div key={c.prospectId} className="pointer-events-auto">
          <ChatBubble prospectId={c.prospectId} minimized={c.minimized} />
        </div>
      ))}
    </div>
  )
}

function ChatBubble({ prospectId, minimized }: { prospectId: string; minimized: boolean }) {
  const { closeChat, toggleMinimize } = useChatDock()
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

  useEffect(() => { setActiveChannel(defaultReplyChannel) }, [defaultReplyChannel])

  useEffect(() => {
    if (!minimized && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      markAsRead()
    }
  }, [messages.length, minimized, markAsRead])

  const lastIncomingByChannel = useMemo(() => {
    const m = new Map<ChannelId, UnifiedMessage>()
    for (const msg of messages) if (msg.direction === 'in') m.set(msg.channel, msg)
    return m
  }, [messages])

  const availableChannels = useMemo(() => {
    if (!prospect) return ENABLED_CHANNELS
    return ENABLED_CHANNELS.filter(id => CHANNELS[id].isAvailableForProspect(prospect))
  }, [prospect])

  const unreadInChat = useMemo(() => {
    return messages.filter(m => m.direction === 'in' && !(m as any).is_read).length
  }, [messages])

  async function handleSend() {
    if (!draft.trim() || sending) return
    const replyTo = lastIncomingByChannel.get(activeChannel)
    // Pour les emails : append signature au body si pas déjà incluse
    const isEmail = activeChannel === 'email'
    const finalBody = isEmail && signature && !draft.includes(signature.trim().slice(0, 30))
      ? `${draft}\n\n${signature}`
      : draft
    try {
      await send({
        channel: activeChannel,
        prospectId,
        body: finalBody,
        subject: isEmail
          ? (draftSubject.trim() || (replyTo?.subject ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, '')}` : ''))
          : undefined,
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
  const initial = (prospect?.name || '?')[0].toUpperCase()

  // Mode minimisé : onglet rectangulaire style LinkedIn (avatar + nom + close)
  if (minimized) {
    return (
      <div className="relative flex items-stretch h-[44px] bg-gradient-to-r from-indigo-500 to-violet-500 rounded-t-xl shadow-lg overflow-hidden border border-violet-300 border-b-0">
        <button onClick={() => toggleMinimize(prospectId)}
          title={prospect?.name || 'Conversation'}
          className="flex items-center gap-2 pl-2.5 pr-2 hover:bg-white/10 transition-colors min-w-[140px] max-w-[200px]">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0">
            {initial}
          </div>
          <div className="text-[12px] font-bold text-white truncate flex-1 text-left">
            {prospect?.name || 'Inconnu'}
          </div>
          {unreadInChat > 0 && (
            <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
              {unreadInChat > 9 ? '9+' : unreadInChat}
            </span>
          )}
        </button>
        <button onClick={() => closeChat(prospectId)} title="Fermer"
          className="px-1.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors border-l border-white/20">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    )
  }

  return (
    <div className="w-[360px] h-[calc(100vh-200px)] max-h-[600px] min-h-[440px] bg-white dark:bg-[#f0eaf5] rounded-t-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden mb-0">
      {/* Header — toute la zone gauche est cliquable pour réduire (style LinkedIn) */}
      <div className="bg-gradient-to-r from-indigo-500 to-violet-500 flex items-center">
        <button
          onClick={() => toggleMinimize(prospectId)}
          title="Réduire"
          className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 hover:bg-white/10 transition-colors text-left"
        >
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0">{initial}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold text-white truncate">{prospect?.name || 'Inconnu'}</div>
            <div className="text-[10px] text-white/80 truncate">{prospect?.phone || prospect?.email}</div>
          </div>
        </button>
        <button onClick={(e) => { e.stopPropagation(); navigate('/app/messagerie') }} title="Ouvrir en grand"
          className="text-white/80 hover:text-white p-1.5 hover:bg-white/10 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
        </button>
        <button onClick={(e) => { e.stopPropagation(); closeChat(prospectId) }} title="Fermer"
          className="text-white/80 hover:text-white p-1.5 mr-1 hover:bg-white/10 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages (compact) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {messages.length === 0 && (
          <div className="text-center py-6 text-[11px] text-gray-400">Pas encore de message</div>
        )}
        {messages.map(m => {
          const c = getChannel(m.channel)
          const isOut = m.direction === 'out'
          return (
            <div key={m.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] min-w-0 ${isOut ? 'bg-violet-100 text-violet-900 border border-violet-200' : 'bg-gray-100 text-gray-800'} rounded-xl px-2.5 py-1.5 overflow-hidden`}>
                {m.subject && <div className={`text-[10px] font-bold mb-0.5 ${isOut ? 'text-violet-700' : 'text-gray-700'} truncate`}>{m.subject}</div>}
                {(m as any).body_html && m.channel === 'email' ? (
                  <div className="text-[11px] leading-snug prose-sm max-w-none break-words overflow-hidden [&_a]:underline [&_a]:break-all [&_*]:max-w-full [&_img]:max-w-full [&_img]:h-auto [&_table]:!w-full [&_table]:!table-fixed [&_td]:break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_p]:break-words" dangerouslySetInnerHTML={{ __html: stripGmailQuote((m as any).body_html) }} />
                ) : (
                  <div className="text-[11px] leading-snug whitespace-pre-wrap break-words">
                    {(m.channel === 'email' ? stripPlainTextQuote(m.body || '') : (m.body || '')) || '(vide)'}
                  </div>
                )}
                <div className={`text-[8px] mt-0.5 ${isOut ? 'text-violet-600' : 'text-gray-400'}`}>{c.icon} {new Date(m.sent_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 p-2">
        <div className="flex items-center gap-1 mb-1.5 overflow-x-auto">
          {availableChannels.map(id => {
            const c = CHANNELS[id]
            const isActive = id === activeChannel
            return (
              <button key={id} onClick={() => setActiveChannel(id)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${isActive ? c.pillClass : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                {c.icon} {c.label}
              </button>
            )
          })}
        </div>

        {/* Objet (email only) */}
        {activeChannel === 'email' && (() => {
          const lastEmailIn = lastIncomingByChannel.get('email')
          const placeholder = lastEmailIn?.subject
            ? `Re: ${lastEmailIn.subject.replace(/^Re:\s*/i, '')}`
            : 'Objet du mail…'
          return (
            <input
              type="text"
              value={draftSubject}
              onChange={e => setDraftSubject(e.target.value)}
              placeholder={placeholder}
              className="w-full mb-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-[11px] outline-none focus:border-indigo-300"
            />
          )
        })()}

        {/* Pièces jointes (email only) */}
        {activeChannel === 'email' && attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {attachments.map((f, i) => (
              <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-[10px] text-violet-700">
                <span className="truncate max-w-[100px]">📎 {f.name}</span>
                <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                  className="text-violet-400 hover:text-red-500">×</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5">
          {/* Bouton attachment (email only) */}
          {activeChannel === 'email' && (
            <>
              <input ref={fileInputRef} type="file" multiple className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  setAttachments(prev => [...prev, ...files])
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }} />
              <button onClick={() => fileInputRef.current?.click()} title="Joindre un fichier"
                className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-violet-600 hover:border-violet-200 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              </button>
            </>
          )}
          <textarea value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !sending) { e.preventDefault(); handleSend() } }}
            placeholder={`${ch.label}…`}
            rows={1}
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] outline-none focus:border-indigo-300 resize-none" />
          <button onClick={handleSend} disabled={!draft.trim() || sending}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold disabled:opacity-50 hover:bg-indigo-700">
            ➤
          </button>
        </div>
      </div>
    </div>
  )
}
