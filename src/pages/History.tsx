/**
 * Historique — Liste d'appels avec cards dépliables.
 * Chaque row peut s'expand pour révéler TOUTES les infos sans quitter la page :
 * notes SDR, audio, résumé AI, scores (global/accroche/objection/closing),
 * points forts, points d'amélioration, intention prospect, prochaine étape,
 * transcript complet. + bouton "Ouvrir la fiche prospect" pour action.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useAuth } from '@/hooks/useAuth'
import { useCalls } from '@/hooks/useCalls'
import { useRealtimeCalls } from '@/hooks/useRealtime'
import type { Call } from '@/types/call'

/** Slug un nom de fichier : retire les caractères dangereux pour FAT/exFAT/HFS. */
function slugify(s: string): string {
  return (s || 'appel').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)
}

/** Génère le markdown fiche d'appel — résumé, scores, points, coaching, transcript. */
function buildFicheMarkdown(call: Call): string {
  const lines: string[] = []
  const nom = call.prospect_name || 'Inconnu'
  lines.push(`# Fiche d'appel — ${nom}`)
  lines.push('')
  lines.push(`- **Téléphone** : ${call.prospect_phone || '—'}`)
  lines.push(`- **Date** : ${new Date(call.created_at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}`)
  lines.push(`- **Durée** : ${call.call_duration ? `${Math.floor(call.call_duration / 60)} min ${call.call_duration % 60} s` : '—'}`)
  lines.push(`- **Issue** : ${call.call_outcome || '—'}`)
  lines.push(`- **RDV pris** : ${call.meeting_booked ? 'Oui ✓' : 'Non'}`)
  lines.push(`- **Numéro appelant** : ${call.from_number || '—'}`)
  lines.push('')

  if (call.note) {
    lines.push('## Notes SDR')
    lines.push('')
    lines.push(call.note)
    lines.push('')
  }

  if (call.ai_analysis_status === 'completed') {
    lines.push('## Scores (analyse Claude)')
    lines.push('')
    lines.push(`| Critère | Note /10 |`)
    lines.push(`|---|---|`)
    lines.push(`| Global | **${call.ai_score_global ?? '—'}** |`)
    lines.push(`| Accroche | ${call.ai_score_accroche ?? '—'} |`)
    lines.push(`| Objection | ${call.ai_score_objection ?? '—'} |`)
    lines.push(`| Closing | ${call.ai_score_closing ?? '—'} |`)
    lines.push('')

    if (call.ai_summary && call.ai_summary.length > 0) {
      lines.push('## Résumé')
      lines.push('')
      call.ai_summary.forEach(s => lines.push(`- ${s}`))
      lines.push('')
    }

    if (call.ai_intention_prospect) {
      lines.push('## Intention du prospect')
      lines.push('')
      lines.push(call.ai_intention_prospect)
      lines.push('')
    }

    if (call.ai_prochaine_etape) {
      lines.push('## Prochaine étape')
      lines.push('')
      lines.push(call.ai_prochaine_etape)
      lines.push('')
    }

    if (call.ai_points_forts && call.ai_points_forts.length > 0) {
      lines.push('## Points forts')
      lines.push('')
      call.ai_points_forts.forEach(s => lines.push(`- ✓ ${s}`))
      lines.push('')
    }

    if (call.ai_points_amelioration && call.ai_points_amelioration.length > 0) {
      lines.push('## Coaching — à améliorer')
      lines.push('')
      call.ai_points_amelioration.forEach(s => lines.push(`- ⚠ ${s}`))
      lines.push('')
    }

    if (call.ai_transcript) {
      lines.push('## Transcription intégrale')
      lines.push('')
      lines.push(call.ai_transcript)
      lines.push('')
    }
  } else {
    lines.push('## Analyse Claude')
    lines.push('')
    lines.push(`Statut : ${call.ai_analysis_status || 'non démarrée'}`)
    lines.push('')
  }

  lines.push('---')
  lines.push(`*Export Calsyn · ${new Date().toISOString()}*`)
  return lines.join('\n')
}

/** Pack ZIP avec fiche markdown + audio (si dispo) et télécharge dans le navigateur. */
async function downloadCallZip(call: Call, supabaseUrl: string) {
  const zip = new JSZip()
  const slug = `${slugify(call.prospect_name || 'inconnu')}_${new Date(call.created_at).toISOString().slice(0, 10)}`

  // 1. Fiche markdown
  zip.file(`${slug}/fiche.md`, buildFicheMarkdown(call))

  // 2. Audio si dispo (via edge function recording-proxy pour bypass CORS + auth Twilio)
  if (call.recording_url) {
    try {
      const audioUrl = `${supabaseUrl}/functions/v1/recording-proxy?url=${encodeURIComponent(call.recording_url)}`
      const res = await fetch(audioUrl)
      if (res.ok) {
        const blob = await res.blob()
        const ext = blob.type.includes('wav') ? 'wav' : 'mp3'
        zip.file(`${slug}/audio.${ext}`, blob)
      } else {
        zip.file(`${slug}/_AUDIO_ERREUR.txt`, `Impossible de télécharger l'audio. HTTP ${res.status}\nURL source : ${call.recording_url}`)
      }
    } catch (e) {
      zip.file(`${slug}/_AUDIO_ERREUR.txt`, `Erreur fetch audio : ${(e as Error).message}`)
    }
  }

  // 3. JSON brut pour archivage (au cas où)
  zip.file(`${slug}/raw.json`, JSON.stringify(call, null, 2))

  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, `${slug}.zip`)
}

function formatDuration(s: number) {
  if (!s) return '—'
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString()
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Aujourd'hui ${time}`
  if (isYesterday) return `Hier ${time}`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: d.getFullYear() !== now.getFullYear() ? '2-digit' : undefined }) + ' ' + time
}

const OUTCOME_COLORS: Record<string, string> = {
  rdv: '#059669', connected: '#0ea5e9', callback: '#f59e0b',
  not_interested: '#ef4444', no_answer: '#9ca3af', voicemail: '#9ca3af',
  busy: '#9ca3af', wrong_number: '#ef4444', failed: '#ef4444', cancelled: '#9ca3af',
}

const OUTCOME_LABELS: Record<string, string> = {
  rdv: 'RDV pris', connected: 'Connecté', callback: 'Rappel',
  not_interested: 'Pas intéressé', no_answer: 'Pas de réponse',
  voicemail: 'Messagerie', busy: 'Occupé', wrong_number: 'Mauvais numéro',
  failed: 'Échec', cancelled: 'Annulé',
}

const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'connected', label: 'Connecté' },
  { key: 'callback', label: 'Rappel' },
  { key: 'no_answer', label: 'Absent' },
  { key: 'voicemail', label: 'Messagerie' },
  { key: 'not_interested', label: 'Refusé' },
]

function Score({ label, value, big = false }: { label: string; value: number | null; big?: boolean }) {
  if (value == null) return null
  const color = value >= 7 ? '#059669' : value >= 4 ? '#f59e0b' : '#ef4444'
  return (
    <div className={`flex flex-col items-center ${big ? 'px-3' : ''}`}>
      <div className={`font-bold leading-none ${big ? 'text-2xl' : 'text-base'}`} style={{ color }}>{value}<span className="text-gray-300 text-xs font-normal">/10</span></div>
      <div className="text-[9px] text-gray-400 uppercase tracking-wider mt-1 font-semibold">{label}</div>
    </div>
  )
}

function CallRow({ call }: { call: Call }) {
  const [expanded, setExpanded] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const navigate = useNavigate()
  const color = OUTCOME_COLORS[call.call_outcome || ''] || '#9ca3af'
  const label = OUTCOME_LABELS[call.call_outcome || ''] || call.call_outcome || '—'
  const hasAI = call.ai_analysis_status === 'completed' && call.ai_score_global != null
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

  return (
    <div className={`border-b border-gray-100 transition-colors ${expanded ? 'bg-indigo-50/30' : 'hover:bg-gray-50'}`}>
      {/* Row collapsed — header cliquable */}
      <button onClick={() => setExpanded(v => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-800 text-sm truncate">{call.prospect_name || 'Inconnu'}</span>
            {call.meeting_booked && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">📅 RDV</span>}
          </div>
          <div className="text-[11px] text-gray-400 font-mono">{call.prospect_phone}</div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0" style={{ background: color + '18', color }}>{label}</span>
        <div className="text-xs text-gray-500 font-mono w-14 text-right flex-shrink-0">{formatDuration(call.call_duration)}</div>
        {hasAI ? (
          <div className="text-right w-14 flex-shrink-0">
            <div className="text-sm font-bold" style={{ color: (call.ai_score_global || 0) >= 7 ? '#059669' : (call.ai_score_global || 0) >= 4 ? '#f59e0b' : '#ef4444' }}>
              {call.ai_score_global}<span className="text-gray-300 text-[9px]">/10</span>
            </div>
            <div className="text-[9px] text-gray-400 uppercase tracking-wider">Score IA</div>
          </div>
        ) : call.ai_analysis_status === 'processing' ? (
          <div className="text-[10px] text-indigo-400 w-14 flex-shrink-0 text-right animate-pulse">Analyse…</div>
        ) : (
          <div className="w-14 flex-shrink-0" />
        )}
        <div className="text-[11px] text-gray-400 w-28 text-right flex-shrink-0">{formatDate(call.created_at)}</div>
      </button>

      {/* Row expanded — fiche complète style ProspectModal */}
      {expanded && (
        <div className="px-10 pb-5 pt-1 space-y-4 border-t border-indigo-100 animate-slide-down">

          {/* Actions rapides */}
          <div className="flex items-center gap-2">
            {call.prospect_id && (
              <button onClick={() => navigate(`/app/dialer?prospectId=${call.prospect_id}`)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                Ouvrir la fiche prospect
              </button>
            )}
            {call.prospect_phone && (
              <a href={`tel:${call.prospect_phone}`}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                Rappeler
              </a>
            )}
            <button onClick={async () => {
              if (downloading) return
              setDownloading(true)
              try { await downloadCallZip(call, supabaseUrl) } catch (e) { alert('Erreur export : ' + (e as Error).message) }
              finally { setDownloading(false) }
            }} disabled={downloading}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1">
              {downloading ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="45 15" /></svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              )}
              {downloading ? 'Export…' : 'Télécharger ZIP'}
            </button>
            <div className="flex-1" />
            <div className="text-[10px] text-gray-400">Appelé depuis {call.from_number || '—'}</div>
          </div>

          {/* Notes + Audio */}
          {(call.note || call.recording_url) && (
            <div className="grid grid-cols-2 gap-4">
              {call.note && (
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Notes SDR</div>
                  <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{call.note}</p>
                </div>
              )}
              {call.recording_url && (
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Enregistrement</div>
                  <audio controls preload="none"
                    src={`${supabaseUrl}/functions/v1/recording-proxy?url=${encodeURIComponent(call.recording_url)}`}
                    className="w-full h-8" />
                </div>
              )}
            </div>
          )}

          {/* AI Analysis — fiche complète */}
          {hasAI ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-6 px-5 py-4 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100">
                <Score label="Global" value={call.ai_score_global} big />
                <div className="h-10 w-px bg-indigo-100" />
                <Score label="Accroche" value={call.ai_score_accroche} />
                <Score label="Objection" value={call.ai_score_objection} />
                <Score label="Closing" value={call.ai_score_closing} />
                <div className="flex-1" />
                <div className="text-[10px] text-indigo-400 uppercase tracking-wider font-semibold">Analyse Claude</div>
              </div>

              {/* Résumé */}
              {call.ai_summary && call.ai_summary.length > 0 && (
                <div className="px-5 py-3 border-b border-gray-100">
                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Résumé</div>
                  <ul className="text-[13px] text-gray-700 space-y-1 leading-relaxed">
                    {call.ai_summary.map((s, i) => <li key={i} className="flex gap-1.5"><span className="text-indigo-400 flex-shrink-0">•</span><span>{s}</span></li>)}
                  </ul>
                </div>
              )}

              {/* Intention + prochaine étape */}
              {(call.ai_intention_prospect || call.ai_prochaine_etape) && (
                <div className="grid grid-cols-2 gap-0 border-b border-gray-100">
                  {call.ai_intention_prospect && (
                    <div className="px-5 py-3 border-r border-gray-100">
                      <div className="text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-wider">Intention prospect</div>
                      <p className="text-[13px] text-gray-700">{call.ai_intention_prospect}</p>
                    </div>
                  )}
                  {call.ai_prochaine_etape && (
                    <div className="px-5 py-3">
                      <div className="text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-wider">Prochaine étape</div>
                      <p className="text-[13px] text-gray-700">{call.ai_prochaine_etape}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Points forts / amélioration */}
              {(call.ai_points_forts?.length || call.ai_points_amelioration?.length) && (
                <div className="grid grid-cols-2 gap-0">
                  {call.ai_points_forts && call.ai_points_forts.length > 0 && (
                    <div className="px-5 py-3 border-r border-gray-100">
                      <div className="text-[10px] font-bold text-emerald-500 uppercase mb-1.5 tracking-wider">✓ Points forts</div>
                      <ul className="text-[12px] text-gray-700 space-y-1">
                        {call.ai_points_forts.map((s, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-400 flex-shrink-0">+</span><span>{s}</span></li>)}
                      </ul>
                    </div>
                  )}
                  {call.ai_points_amelioration && call.ai_points_amelioration.length > 0 && (
                    <div className="px-5 py-3">
                      <div className="text-[10px] font-bold text-amber-500 uppercase mb-1.5 tracking-wider">⚠ À améliorer</div>
                      <ul className="text-[12px] text-gray-700 space-y-1">
                        {call.ai_points_amelioration.map((s, i) => <li key={i} className="flex gap-1.5"><span className="text-amber-400 flex-shrink-0">–</span><span>{s}</span></li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Transcript — caché par défaut */}
              {call.ai_transcript && (
                <div className="border-t border-gray-100">
                  <button onClick={() => setShowTranscript(v => !v)}
                    className="w-full flex items-center gap-2 px-5 py-2.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-50">
                    <svg className={`w-3 h-3 transition-transform ${showTranscript ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    Transcription complète
                  </button>
                  {showTranscript && (
                    <div className="px-5 py-3 text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap max-h-[360px] overflow-y-auto bg-gray-50 border-t border-gray-100">
                      {call.ai_transcript}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : call.ai_analysis_status === 'processing' ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-[12px] text-indigo-600 flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="45 15" /></svg>
              Analyse Claude en cours…
            </div>
          ) : call.ai_analysis_status === 'error' ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[12px] text-red-600">
              Erreur d'analyse. L'audio n'a peut-être pas pu être transcrit.
            </div>
          ) : call.recording_url ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[12px] text-gray-500">
              Analyse pas encore démarrée pour cet appel.
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default function History() {
  const { isManager } = useAuth()
  const { data: calls, isLoading } = useCalls()
  useRealtimeCalls()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (calls || []).filter(c => {
      if (filter !== 'all' && c.call_outcome !== filter) return false
      if (s) {
        const hay = [c.prospect_name, c.prospect_phone, c.note].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [calls, filter, search])

  const stats = useMemo(() => {
    const total = filtered.length
    const rdv = filtered.filter(c => c.meeting_booked).length
    const connected = filtered.filter(c => c.call_outcome === 'connected' || c.meeting_booked).length
    const totalMin = Math.round(filtered.reduce((s, c) => s + (c.call_duration || 0), 0) / 60)
    return { total, rdv, connected, totalMin }
  }, [filtered])

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#e8e0f0]">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{isManager ? 'Historique équipe' : 'Mes appels'}</h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {stats.total} appels · {stats.connected} connectés · {stats.rdv} RDV · {stats.totalMin} min au total
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input type="text" placeholder="Nom, numéro, note…" value={search} onChange={e => setSearch(e.target.value)}
                className="text-[12px] bg-transparent outline-none text-gray-700 placeholder:text-gray-400 w-40" />
            </div>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  filter === f.key ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'text-gray-400 hover:text-gray-600 border border-transparent'
                }`}>{f.label}</button>
            ))}
          </div>
        </div>

        {/* List */}
        {isLoading && <p className="text-sm text-gray-400 text-center py-20">Chargement...</p>}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
            <p className="text-4xl mb-4">📭</p>
            <p className="text-sm font-semibold text-gray-700">Aucun appel</p>
            <p className="text-[12px] text-gray-400 mt-1">Lancez une session depuis le Dialer</p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="bg-white dark:bg-[#f0eaf5] rounded-xl border border-gray-200 dark:border-[#d4cade] overflow-hidden">
            {filtered.map(c => <CallRow key={c.id} call={c} />)}
          </div>
        )}
      </div>
    </div>
  )
}
