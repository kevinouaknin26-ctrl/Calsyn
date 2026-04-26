/**
 * MessagingDockBar — Barre flottante en bas à droite, style LinkedIn.
 *
 * Toujours visible (sauf sur /app/messagerie). Permet d'accéder à la messagerie
 * depuis n'importe quelle page :
 *  - Header cliquable avec badge unread global
 *  - Click → déroule un panneau avec les conversations récentes
 *  - Click sur une conv → ouvre la bulle ChatDock correspondante
 */

import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChatDock } from '@/contexts/ChatDockContext'
import { useConversations, useTotalUnread } from '@/hooks/useMessaging'
import { getChannel } from '@/services/channels'

const STORAGE_KEY = 'msg-dockbar-open-v1'

export default function MessagingDockBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { openChat, chats } = useChatDock()
  const { data: conversations } = useConversations()
  const totalUnread = useTotalUnread()
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })
  const [search, setSearch] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, open ? '1' : '0') } catch { /* */ }
  }, [open])

  // Auto-open quand un nouveau message arrive (badge augmente)
  const prevUnread = useRef(totalUnread)
  useEffect(() => {
    if (totalUnread > prevUnread.current && !open) {
      // Ne pas auto-ouvrir, juste mettre en évidence via le badge.
    }
    prevUnread.current = totalUnread
  }, [totalUnread, open])

  // Cache sur la page messagerie complète
  if (location.pathname.startsWith('/app/messagerie')) return null

  const filtered = (conversations || []).filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (c.prospect_name || '').toLowerCase().includes(q) ||
      (c.prospect_email || '').toLowerCase().includes(q) ||
      (c.prospect_phone || '').includes(q)
    )
  })

  // Décale la barre vers la gauche si bulles de chat ouvertes (évite chevauchement)
  const openBubblesCount = chats.length
  const rightOffset = 16

  function handleConvClick(prospectId: string) {
    openChat(prospectId)
    // On garde le panneau ouvert : ChatDock affiche la bulle à gauche
  }

  return (
    <div
      ref={panelRef}
      className="desktop-only-mobile-hidden fixed bottom-0 z-40 select-none"
      style={{ right: rightOffset }}
    >
      <div className={`bg-white dark:bg-[#f0eaf5] border border-gray-200 border-b-0 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${open ? 'w-[calc(100vw-32px)] sm:w-[320px] h-[80vh] sm:h-[600px]' : 'w-[200px] sm:w-[260px] h-[44px]'}`}>
        {/* Header */}
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 px-3 h-[44px] flex-shrink-0 bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="flex-1 text-left text-[13px] font-bold">Messagerie</span>
          {totalUnread > 0 && (
            <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
          <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>

        {/* Body — visible only when open */}
        {open && (
          <>
            {/* Search */}
            <div className="px-2 py-2 border-b border-gray-100 flex-shrink-0">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-[11px] outline-none focus:border-indigo-300"
              />
            </div>

            {/* Conv list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <div className="text-center py-8 text-[11px] text-gray-400">
                  {search ? 'Aucun résultat' : 'Aucune conversation'}
                </div>
              )}
              {filtered.map(c => {
                const ch = getChannel(c.last_channel)
                const isOpen = chats.some(x => x.prospectId === c.prospect_id)
                return (
                  <button
                    key={c.prospect_id}
                    onClick={() => handleConvClick(c.prospect_id)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50 border-b border-gray-100 transition-colors ${isOpen ? 'bg-indigo-50/40' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0">
                      {(c.prospect_name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <div className={`text-[12px] truncate flex-1 ${c.unread_count > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                          {c.prospect_name || 'Inconnu'}
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${ch.pillClass}`}>{ch.icon}</span>
                      </div>
                      <div className={`text-[11px] truncate leading-tight ${c.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                        {c.last_message.direction === 'out' && '↩ '}
                        {(c.last_message.body || '(vide)').slice(0, 50)}
                      </div>
                    </div>
                    {c.unread_count > 0 && (
                      <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                        {c.unread_count > 9 ? '9+' : c.unread_count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <button
              onClick={() => navigate('/app/messagerie')}
              className="px-3 py-2 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 border-t border-gray-100 flex-shrink-0 flex items-center justify-center gap-1"
            >
              Ouvrir la messagerie complète
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  )
}
