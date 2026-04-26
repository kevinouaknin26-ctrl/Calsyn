/**
 * MessagingNotifier — Toast + son sur message inbound (realtime).
 *
 * Subscribe à postgres_changes sur INSERT messages (filter direction='in').
 * Pour chaque nouveau message reçu :
 *  - Affiche un toast 5s en haut à droite (cliquable → ouvre le chat dock)
 *  - Joue un son léger (préf user, off par défaut)
 *  - Refresh le badge sidebar (déjà fait via realtime des hooks useMessaging)
 *
 * Skip si l'user est déjà sur /app/messagerie ou a la bulle ouverte (évite spam).
 */

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useChatDock } from '@/contexts/ChatDockContext'
import { getChannel, type ChannelId } from '@/services/channels'

interface ToastNotif {
  id: string
  prospectId: string
  prospectName: string
  channel: ChannelId
  body: string
}

// Son synthétisé via WebAudio. Singleton AudioContext créé/débloqué au premier
// user gesture pour contourner la autoplay policy des navigateurs.
let audioCtx: AudioContext | null = null
let unlocked = false

function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx
  const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctx) return null
  audioCtx = new Ctx()
  return audioCtx
}

function unlockAudio() {
  if (unlocked) return
  const ctx = getCtx()
  if (!ctx) return
  // Joue un sample muet pour débloquer
  const buf = ctx.createBuffer(1, 1, 22050)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start(0)
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  unlocked = true
}

// Petit "ding" doux à 880Hz puis 1318Hz, 200ms total.
function playNotifSound() {
  try {
    const ctx = getCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const now = ctx.currentTime
    const tones = [
      { freq: 880, start: 0, dur: 0.10 },
      { freq: 1318.5, start: 0.08, dur: 0.16 },
    ]
    for (const t of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = t.freq
      gain.gain.setValueAtTime(0.0001, now + t.start)
      gain.gain.exponentialRampToValueAtTime(0.22, now + t.start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + t.start)
      osc.stop(now + t.start + t.dur + 0.02)
    }
  } catch (e) {
    console.warn('[notif] audio play failed:', e)
  }
}

export default function MessagingNotifier() {
  const { organisation, user } = useAuth()
  const { chats, openChat } = useChatDock()
  const location = useLocation()
  const [toasts, setToasts] = useState<ToastNotif[]>([])
  const soundEnabled = (() => {
    try {
      const v = localStorage.getItem('messaging-sound')
      // Default ON ; on désactive seulement si explicitement '0'
      return v !== '0'
    } catch { return true }
  })()

  // Débloque AudioContext au premier user gesture (contourne autoplay policy)
  useEffect(() => {
    const onGesture = () => unlockAudio()
    window.addEventListener('click', onGesture, { once: false, capture: true })
    window.addEventListener('keydown', onGesture, { once: false, capture: true })
    window.addEventListener('touchstart', onGesture, { once: false, capture: true })
    return () => {
      window.removeEventListener('click', onGesture, { capture: true } as any)
      window.removeEventListener('keydown', onGesture, { capture: true } as any)
      window.removeEventListener('touchstart', onGesture, { capture: true } as any)
    }
  }, [])

  useEffect(() => {
    if (!organisation?.id || !user?.id) return

    const ch = supabase
      .channel(`messages-notifier:${organisation.id}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `organisation_id=eq.${organisation.id}`,
        },
        async (payload) => {
          const msg = payload.new as {
            id: string; prospect_id: string | null; channel: ChannelId;
            direction: string; body: string | null;
            user_id: string | null;
          }
          if (msg.direction !== 'in' || !msg.prospect_id) return

          // STRICT : on ne notifie que pour MES messages (chacun son mail/num).
          // Si user_id est null (legacy SMS sans match), on n'affiche pas non plus.
          if (msg.user_id && msg.user_id !== user.id) return

          // Skip si on est sur la page Messagerie (déjà visible)
          if (location.pathname.startsWith('/app/messagerie')) return

          // Skip si la bulle de ce prospect est déjà ouverte non-minimisée
          const openNonMin = chats.find(c => c.prospectId === msg.prospect_id && !c.minimized)
          if (openNonMin) return

          // Récup nom prospect
          const { data: p } = await supabase
            .from('prospects').select('name').eq('id', msg.prospect_id).single()

          setToasts(prev => [...prev, {
            id: msg.id,
            prospectId: msg.prospect_id!,
            prospectName: p?.name || 'Inconnu',
            channel: msg.channel,
            body: (msg.body || '').slice(0, 100),
          }])

          // Son (default ON)
          if (soundEnabled) playNotifSound()

          // Auto-dismiss 5s
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== msg.id))
          }, 5000)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [organisation?.id, user?.id, location.pathname, chats, soundEnabled])

  function dismissToast(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  function handleToastClick(t: ToastNotif) {
    openChat(t.prospectId)
    dismissToast(t.id)
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const ch = getChannel(t.channel)
          return (
            <button key={t.id} onClick={() => handleToastClick(t)}
              className="pointer-events-auto w-[340px] bg-white dark:bg-[#f0eaf5] border border-gray-200 rounded-xl shadow-2xl p-3 text-left hover:bg-gray-50 transition-colors animate-slide-in">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0">
                  {t.prospectName[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[12px] font-bold text-gray-800 truncate">{t.prospectName}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${ch.pillClass}`}>{ch.icon} {ch.label}</span>
                  </div>
                  <div className="text-[11px] text-gray-600 line-clamp-2 leading-snug">{t.body}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); dismissToast(t.id) }}
                  className="text-gray-400 hover:text-gray-600 p-0.5 flex-shrink-0">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}
