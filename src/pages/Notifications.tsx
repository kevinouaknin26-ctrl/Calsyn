/**
 * Notifications — Centre de notifications + préférences.
 *
 * Agrège des sources existantes (pas de nouvelle table) :
 *  - RDV imminents (rdv_date entre maintenant et +24h)
 *  - Rappels dûs (snoozed_until passé)
 *  - Messages non lus (messages.is_read=false, direction=in)
 *  - Appels manqués (call_outcome=no_answer/voicemail dans les 24h, sans rappel)
 *
 * Préférences (localStorage) : email/push/son par catégorie.
 */

import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useChatDock } from '@/contexts/ChatDockContext'

type NotifKind = 'rdv' | 'callback' | 'message' | 'missed_call'

interface NotifItem {
  id: string
  kind: NotifKind
  title: string
  subtitle: string
  /** Date à afficher (peut être future pour un RDV) */
  ts: string
  /** Date à utiliser pour le tri chrono (= date où la notif a "été créée") */
  sortTs: string
  href?: string
  prospectId?: string
  unread?: boolean
}

const KIND_META: Record<NotifKind, { label: string; icon: string; color: string }> = {
  rdv:         { label: 'RDV',           icon: '📅', color: '#10b981' },
  callback:    { label: 'Rappel',        icon: '⏰', color: '#f59e0b' },
  message:     { label: 'Message',       icon: '💬', color: '#6366f1' },
  missed_call: { label: 'Appel manqué',  icon: '📵', color: '#ef4444' },
}

const PREF_KEY = 'notif-prefs-v1'

interface Prefs {
  rdv: boolean
  callback: boolean
  message: boolean
  missed_call: boolean
  sound: boolean
}

const DEFAULT_PREFS: Prefs = { rdv: true, callback: true, message: true, missed_call: true, sound: true }

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch { return DEFAULT_PREFS }
}

function writePrefs(p: Prefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)) } catch { /* */ }
}

function timeAgo(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000
  if (sec < 60) return 'à l\'instant'
  if (sec < 3600) return `il y a ${Math.round(sec / 60)} min`
  if (sec < 86400) return `il y a ${Math.round(sec / 3600)} h`
  return `il y a ${Math.round(sec / 86400)} j`
}

function timeUntil(iso: string): string {
  const sec = (new Date(iso).getTime() - Date.now()) / 1000
  if (sec < 0) return 'en retard'
  if (sec < 60) return 'maintenant'
  if (sec < 3600) return `dans ${Math.round(sec / 60)} min`
  if (sec < 86400) return `dans ${Math.round(sec / 3600)} h`
  return `dans ${Math.round(sec / 86400)} j`
}

export default function Notifications() {
  const { user, organisation } = useAuth()
  const navigate = useNavigate()
  const { openChat } = useChatDock()
  const [prefs, setPrefs] = useState<Prefs>(readPrefs())
  const [filterKind, setFilterKind] = useState<NotifKind | 'all'>('all')

  useEffect(() => { writePrefs(prefs) }, [prefs])

  // ── Source 1 : 3 queries séparées (la .or() imbriquée Supabase ne gère
  // pas correctement le and(...) imbriqué avec .in()) ──
  const { data: prospects = [] } = useQuery({
    queryKey: ['notif-prospects', organisation?.id, user?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const now = new Date()
      const in24h = new Date(now.getTime() + 24 * 3600 * 1000).toISOString()
      const past1h = new Date(now.getTime() - 3600 * 1000).toISOString()
      const past24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
      const cols = 'id, name, phone, email, rdv_date, snoozed_until, last_call_outcome, last_call_at'

      // RDV à venir (de -1h à +24h)
      const rdvP = supabase.from('prospects').select(cols)
        .eq('organisation_id', organisation.id).is('deleted_at', null)
        .gte('rdv_date', past1h).lte('rdv_date', in24h)
        .limit(200)

      // Rappels dûs (snoozed_until passé ou dans <24h)
      const cbP = supabase.from('prospects').select(cols)
        .eq('organisation_id', organisation.id).is('deleted_at', null)
        .not('snoozed_until', 'is', null).lte('snoozed_until', in24h)
        .limit(200)

      const [rdv, cb] = await Promise.all([rdvP, cbP])

      const seen = new Map<string, any>()
      for (const list of [rdv.data || [], cb.data || []]) {
        for (const p of list) seen.set(p.id, p)
      }
      return Array.from(seen.values())
    },
    enabled: !!organisation?.id,
    refetchInterval: 60000,
  })

  // ── Source 1bis : Missed calls (calls table directement, plus fiable que
  // prospect.last_call_outcome qui peut être désync via le webhook) ──
  const { data: missedCalls = [] } = useQuery({
    queryKey: ['notif-missed-calls', organisation?.id, user?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const past24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      let q = supabase
        .from('calls')
        .select('id, prospect_id, prospect_name, prospect_phone, call_outcome, created_at, sdr_id')
        .eq('organisation_id', organisation.id)
        .in('call_outcome', ['no_answer', 'voicemail', 'missed_incoming'])
        .gte('created_at', past24h)
        .order('created_at', { ascending: false })
        .limit(50)
      // SDR ne voit que les siens (manager voit tout grâce à RLS)
      if (user?.id) q = q.eq('sdr_id', user.id)
      const { data } = await q
      return data || []
    },
    enabled: !!organisation?.id,
    refetchInterval: 30000,
  })

  // ── Source 2 : Messages non lus ──
  const { data: unreadMessages = [] } = useQuery({
    queryKey: ['notif-unread', organisation?.id, user?.id],
    queryFn: async () => {
      if (!organisation?.id || !user?.id) return []
      const { data } = await supabase
        .from('messages')
        .select('id, prospect_id, channel, body, sent_at, from_address')
        .eq('organisation_id', organisation.id)
        .eq('user_id', user.id)
        .eq('direction', 'in')
        .eq('is_read', false)
        .order('sent_at', { ascending: false })
        .limit(50)
      return data || []
    },
    enabled: !!organisation?.id && !!user?.id,
    refetchInterval: 30000,
  })

  // ── Compose notif items ──
  const items = useMemo<NotifItem[]>(() => {
    const out: NotifItem[] = []
    const now = Date.now()
    const in24h = now + 24 * 3600 * 1000
    const past24h = now - 24 * 3600 * 1000

    for (const p of prospects) {
      // RDV imminent (de -1h à +24h)
      // sortTs = quand la notif a été "créée" = quand le RDV a été booké.
      // Approximation : last_call_at (RDV souvent pris pendant un appel) sinon now (juste créé).
      if (p.rdv_date && new Date(p.rdv_date).getTime() <= in24h && new Date(p.rdv_date).getTime() >= now - 3600 * 1000) {
        out.push({
          id: `rdv:${p.id}`,
          kind: 'rdv',
          title: `RDV avec ${p.name || 'inconnu'}`,
          subtitle: `${timeUntil(p.rdv_date)} • ${new Date(p.rdv_date).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
          ts: p.rdv_date,
          sortTs: p.last_call_at || new Date(now - 3600 * 1000).toISOString(),
          prospectId: p.id,
        })
      }
      // Rappel dû (snoozed_until passé ou dans <24h)
      // sortTs = last_call_at (le rappel a été créé pendant l'appel précédent)
      if (p.snoozed_until && new Date(p.snoozed_until).getTime() <= in24h) {
        out.push({
          id: `cb:${p.id}`,
          kind: 'callback',
          title: `À rappeler : ${p.name || 'inconnu'}`,
          subtitle: `${timeUntil(p.snoozed_until)} • ${p.phone || p.email || ''}`,
          ts: p.snoozed_until,
          sortTs: p.last_call_at || p.snoozed_until,
          prospectId: p.id,
        })
      }
    }

    // Source dédiée : missed calls (depuis la table calls)
    for (const c of missedCalls) {
      const isIncoming = c.call_outcome === 'missed_incoming'
      const isVm = c.call_outcome === 'voicemail'
      const title = isIncoming
        ? `Appel entrant manqué : ${c.prospect_name || c.prospect_phone || 'inconnu'}`
        : `Pas de réponse : ${c.prospect_name || c.prospect_phone || 'inconnu'}`
      const detail = isIncoming ? '☎️ entrant' : isVm ? 'messagerie' : 'pas répondu'
      out.push({
        id: `mc:${c.id}`,
        kind: 'missed_call',
        title,
        subtitle: `${timeAgo(c.created_at)} • ${detail}`,
        ts: c.created_at,
        sortTs: c.created_at,
        prospectId: c.prospect_id || undefined,
      })
    }

    for (const m of unreadMessages) {
      if (!m.prospect_id) continue
      out.push({
        id: `msg:${m.id}`,
        kind: 'message',
        title: `Nouveau ${m.channel === 'email' ? 'email' : m.channel === 'sms' ? 'SMS' : 'message'}`,
        subtitle: `${m.from_address || ''} • ${(m.body || '').slice(0, 80)}`,
        ts: m.sent_at,
        sortTs: m.sent_at,
        prospectId: m.prospect_id,
        unread: true,
      })
    }

    // Filtrer par préférences + tri chrono pur sur sortTs (récent en haut)
    return out
      .filter(it => prefs[it.kind])
      .sort((a, b) => new Date(b.sortTs).getTime() - new Date(a.sortTs).getTime())
  }, [prospects, missedCalls, unreadMessages, prefs])

  const filtered = filterKind === 'all' ? items : items.filter(i => i.kind === filterKind)
  const counts = useMemo(() => ({
    all: items.length,
    rdv: items.filter(i => i.kind === 'rdv').length,
    callback: items.filter(i => i.kind === 'callback').length,
    message: items.filter(i => i.kind === 'message').length,
    missed_call: items.filter(i => i.kind === 'missed_call').length,
  }), [items])

  function handleClick(it: NotifItem) {
    if (!it.prospectId) return
    if (it.kind === 'message') openChat(it.prospectId)
    else navigate(`/app/contacts?prospect=${it.prospectId}`)
  }

  return (
    <div className="h-full bg-[#f8f9fa] dark:bg-[#e8e0f0] overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 pb-12">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Notifications</h1>
            <p className="text-[12px] text-gray-500 mt-0.5">{counts.all} notification{counts.all > 1 ? 's' : ''} active{counts.all > 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Filtres + préférences (col gauche) */}
          <div className="col-span-12 md:col-span-4 space-y-4">
            {/* Filtres */}
            <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Filtrer</h3>
              <div className="space-y-1">
                <FilterButton label="Tout" count={counts.all} active={filterKind === 'all'} onClick={() => setFilterKind('all')} icon="🔔" />
                {(Object.keys(KIND_META) as NotifKind[]).map(k => (
                  <FilterButton
                    key={k}
                    label={KIND_META[k].label}
                    count={counts[k]}
                    active={filterKind === k}
                    onClick={() => setFilterKind(k)}
                    icon={KIND_META[k].icon}
                  />
                ))}
              </div>
            </div>

            {/* Préférences */}
            <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] p-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Préférences</h3>
              <div className="space-y-1.5">
                {(Object.keys(KIND_META) as NotifKind[]).map(k => (
                  <ToggleRow
                    key={k}
                    label={KIND_META[k].label}
                    icon={KIND_META[k].icon}
                    checked={prefs[k]}
                    onChange={(v) => setPrefs({ ...prefs, [k]: v })}
                  />
                ))}
                <div className="border-t border-gray-100 my-2" />
                <ToggleRow
                  label="Son notif"
                  icon="🔊"
                  checked={prefs.sound}
                  onChange={(v) => {
                    setPrefs({ ...prefs, sound: v })
                    try { localStorage.setItem('messaging-sound', v ? '1' : '0') } catch { /* */ }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Liste (col droite) */}
          <div className="col-span-12 md:col-span-8">
            <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] overflow-hidden">
              {filtered.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <p className="text-3xl mb-2">✨</p>
                  <p className="text-[13px] font-semibold text-gray-700">Tout est à jour</p>
                  <p className="text-[11px] text-gray-400 mt-1">Aucune notification {filterKind !== 'all' ? `de type "${KIND_META[filterKind as NotifKind].label}"` : ''}</p>
                </div>
              ) : (
                filtered.map(it => {
                  const meta = KIND_META[it.kind]
                  return (
                    <button key={it.id} onClick={() => handleClick(it)}
                      className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-start gap-3 last:border-0">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[14px]"
                        style={{ background: `${meta.color}15`, color: meta.color }}>
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: `${meta.color}15`, color: meta.color }}>{meta.label}</span>
                          {it.unread && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                        </div>
                        <div className="text-[13px] font-semibold text-gray-800 truncate">{it.title}</div>
                        <div className="text-[11px] text-gray-500 truncate mt-0.5">{it.subtitle}</div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterButton({ label, count, active, onClick, icon }: {
  label: string; count: number; active: boolean; onClick: () => void; icon: string
}) {
  return (
    <button onClick={onClick}
      className={`w-full px-2.5 py-1.5 rounded-md flex items-center gap-2 text-left transition-colors ${active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}>
      <span className="text-[12px]">{icon}</span>
      <span className={`text-[12px] flex-1 ${active ? 'font-semibold' : ''}`}>{label}</span>
      <span className={`text-[10px] tabular-nums ${active ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>{count}</span>
    </button>
  )
}

function ToggleRow({ label, icon, checked, onChange }: {
  label: string; icon: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 px-1 py-1 cursor-pointer hover:bg-gray-50 rounded">
      <span className="text-[12px]">{icon}</span>
      <span className="text-[12px] flex-1 text-gray-700">{label}</span>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative w-8 h-4 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-gray-300'}`}>
        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </label>
  )
}
