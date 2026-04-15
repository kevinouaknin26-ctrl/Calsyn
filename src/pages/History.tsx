/**
 * Historique — Liste d'appels, chaque row est une card accordéon qui se déplie
 * sur place pour montrer la fiche complète (style ProspectModal inline) :
 * Notes, Audio, Scores, Résumé, Coaching, Transcription. Bouton "Télécharger ZIP".
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useAuth } from '@/hooks/useAuth'
import { useCalls } from '@/hooks/useCalls'
import { useRealtimeCalls } from '@/hooks/useRealtime'
import type { Call } from '@/types/call'

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

function slugify(s: string): string {
  return (s || 'appel').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)
}

function buildFicheMarkdown(call: Call): string {
  const lines: string[] = []
  const nom = call.prospect_name || 'Inconnu'
  lines.push(`# Fiche d'appel — ${nom}`, '')
  lines.push(`- **Téléphone** : ${call.prospect_phone || '—'}`)
  lines.push(`- **Date** : ${new Date(call.created_at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}`)
  lines.push(`- **Durée** : ${call.call_duration ? `${Math.floor(call.call_duration / 60)} min ${call.call_duration % 60} s` : '—'}`)
  lines.push(`- **Issue** : ${call.call_outcome || '—'}`)
  lines.push(`- **RDV pris** : ${call.meeting_booked ? 'Oui ✓' : 'Non'}`)
  lines.push(`- **Numéro appelant** : ${call.from_number || '—'}`, '')
  if (call.note) lines.push('## Notes SDR', '', call.note, '')
  if (call.ai_analysis_status === 'completed') {
    lines.push('## Scores (analyse Claude)', '', `| Critère | Note /10 |`, `|---|---|`)
    lines.push(`| Global | **${call.ai_score_global ?? '—'}** |`)
    lines.push(`| Accroche | ${call.ai_score_accroche ?? '—'} |`)
    lines.push(`| Objection | ${call.ai_score_objection ?? '—'} |`)
    lines.push(`| Closing | ${call.ai_score_closing ?? '—'} |`, '')
    if (call.ai_summary?.length) { lines.push('## Résumé', ''); call.ai_summary.forEach(s => lines.push(`- ${s}`)); lines.push('') }
    if (call.ai_intention_prospect) lines.push('## Intention du prospect', '', call.ai_intention_prospect, '')
    if (call.ai_prochaine_etape) lines.push('## Prochaine étape', '', call.ai_prochaine_etape, '')
    if (call.ai_points_forts?.length) { lines.push('## Points forts', ''); call.ai_points_forts.forEach(s => lines.push(`- ✓ ${s}`)); lines.push('') }
    if (call.ai_points_amelioration?.length) { lines.push('## Coaching — à améliorer', ''); call.ai_points_amelioration.forEach(s => lines.push(`- ⚠ ${s}`)); lines.push('') }
    if (call.ai_transcript) lines.push('## Transcription intégrale', '', call.ai_transcript, '')
  }
  lines.push('---', `*Export Calsyn · ${new Date().toISOString()}*`)
  return lines.join('\n')
}

async function downloadCallZip(call: Call, supabaseUrl: string) {
  const zip = new JSZip()
  const slug = `${slugify(call.prospect_name || 'inconnu')}_${new Date(call.created_at).toISOString().slice(0, 10)}`
  zip.file(`${slug}/fiche.md`, buildFicheMarkdown(call))
  if (call.recording_url) {
    try {
      const audioUrl = `${supabaseUrl}/functions/v1/recording-proxy?url=${encodeURIComponent(call.recording_url)}`
      const res = await fetch(audioUrl)
      if (res.ok) {
        const blob = await res.blob()
        const ext = blob.type.includes('wav') ? 'wav' : 'mp3'
        zip.file(`${slug}/audio.${ext}`, blob)
      } else {
        zip.file(`${slug}/_AUDIO_ERREUR.txt`, `HTTP ${res.status}\n${call.recording_url}`)
      }
    } catch (e) {
      zip.file(`${slug}/_AUDIO_ERREUR.txt`, (e as Error).message)
    }
  }
  zip.file(`${slug}/raw.json`, JSON.stringify(call, null, 2))
  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, `${slug}.zip`)
}

function Section({ title, defaultOpen = true, badge, children }: {
  title: string; defaultOpen?: boolean; badge?: string | number | null; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors">
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex-1">{title}</span>
        {badge != null && <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">{badge}</span>}
      </button>
      {open && <div className="px-4 pb-4 text-[13px] text-gray-700">{children}</div>}
    </div>
  )
}

function ScoreChip({ label, value, big = false }: { label: string; value: number | null; big?: boolean }) {
  if (value == null) return null
  const color = value >= 7 ? '#059669' : value >= 4 ? '#f59e0b' : '#ef4444'
  return (
    <div className={`flex flex-col items-center ${big ? 'px-2' : 'px-1'}`}>
      <div className={`font-bold leading-none ${big ? 'text-3xl' : 'text-xl'}`} style={{ color }}>
        {value}<span className="text-gray-300 text-[10px] font-normal">/10</span>
      </div>
      <div className="text-[9px] text-gray-400 uppercase tracking-wider mt-1 font-semibold">{label}</div>
    </div>
  )
}

function CallRow({ call }: { call: Call }) {
  const [expanded, setExpanded] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const navigate = useNavigate()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const color = OUTCOME_COLORS[call.call_outcome || ''] || '#9ca3af'
  const label = OUTCOME_LABELS[call.call_outcome || ''] || call.call_outcome || '—'
  const hasAI = call.ai_analysis_status === 'completed' && call.ai_score_global != null
  const initial = (call.prospect_name || '?')[0].toUpperCase()

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try { await downloadCallZip(call, supabaseUrl) } catch (e) { alert('Erreur export : ' + (e as Error).message) }
    finally { setDownloading(false) }
  }

  return (
    <div className={`border-b border-gray-100 last:border-b-0 transition-colors ${expanded ? 'bg-white' : 'bg-white hover:bg-gray-50'}`}>
      {/* Header row — cliquable, style fiche prospect compacte */}
      <button onClick={() => setExpanded(v => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {/* Avatar initiale (comme fiche prospect) */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
          {initial}
        </div>
        {/* Nom + tél */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800 text-sm truncate">{call.prospect_name || 'Inconnu'}</span>
            {call.meeting_booked && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">📅 RDV</span>}
          </div>
          <div className="text-[11px] text-gray-400 font-mono">{call.prospect_phone}</div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0" style={{ background: color + '18', color }}>{label}</span>
        <div className="text-xs text-gray-500 font-mono w-14 text-right flex-shrink-0">{formatDuration(call.call_duration)}</div>
        {hasAI ? (
          <div className="text-right w-12 flex-shrink-0">
            <div className="text-sm font-bold" style={{ color: (call.ai_score_global || 0) >= 7 ? '#059669' : (call.ai_score_global || 0) >= 4 ? '#f59e0b' : '#ef4444' }}>
              {call.ai_score_global}
            </div>
            <div className="text-[9px] text-gray-400 uppercase tracking-wider">IA</div>
          </div>
        ) : call.ai_analysis_status === 'processing' ? (
          <div className="text-[10px] text-indigo-400 w-12 flex-shrink-0 text-right animate-pulse">Ana…</div>
        ) : (
          <div className="w-12 flex-shrink-0" />
        )}
        <div className="text-[11px] text-gray-400 w-28 text-right flex-shrink-0">{formatDate(call.created_at)}</div>
      </button>

      {/* Fiche dépliée inline — style pop-up prospect */}
      {expanded && (
        <div className="ml-14 mr-4 mb-4 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-slide-down">
          {/* Barre actions en haut */}
          <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100">
            <button onClick={handleDownload} disabled={downloading}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
              {downloading ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="45 15" /></svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              )}
              {downloading ? 'Export en cours…' : 'Télécharger ZIP'}
            </button>
            {call.prospect_id && (
              <button onClick={() => navigate(`/app/dialer?prospectId=${call.prospect_id}`)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-100">
                Fiche prospect →
              </button>
            )}
            {call.prospect_phone && (
              <a href={`tel:${call.prospect_phone}`}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-100">
                📞 Rappeler
              </a>
            )}
            <div className="flex-1" />
            {call.from_number && <div className="text-[10px] text-gray-400">Appelé depuis {call.from_number}</div>}
          </div>

          {/* Sections accordéon */}
          <Section title="Notes SDR" defaultOpen={!!call.note}>
            {call.note ? (
              <p className="whitespace-pre-wrap leading-relaxed">{call.note}</p>
            ) : (
              <p className="text-gray-400 italic">Aucune note saisie pendant l'appel.</p>
            )}
          </Section>

          {call.recording_url && (
            <Section title="Enregistrement audio" defaultOpen>
              <audio controls preload="none"
                src={`${supabaseUrl}/functions/v1/recording-proxy?url=${encodeURIComponent(call.recording_url)}`}
                className="w-full h-9" />
            </Section>
          )}

          {hasAI ? (
            <>
              <Section title="Scores IA" defaultOpen badge={call.ai_score_global}>
                <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-50 to-violet-50 rounded-lg py-3 px-2 border border-indigo-100">
                  <ScoreChip label="Global" value={call.ai_score_global} big />
                  <div className="h-10 w-px bg-indigo-200" />
                  <ScoreChip label="Accroche" value={call.ai_score_accroche} />
                  <ScoreChip label="Objection" value={call.ai_score_objection} />
                  <ScoreChip label="Closing" value={call.ai_score_closing} />
                </div>
              </Section>

              {call.ai_summary && call.ai_summary.length > 0 && (
                <Section title="Résumé" defaultOpen badge={call.ai_summary.length}>
                  <ul className="space-y-1.5">
                    {call.ai_summary.map((s, i) => (
                      <li key={i} className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">•</span><span className="leading-relaxed">{s}</span></li>
                    ))}
                  </ul>
                </Section>
              )}

              {(call.ai_intention_prospect || call.ai_prochaine_etape) && (
                <Section title="Intention & prochaine étape" defaultOpen={false}>
                  {call.ai_intention_prospect && (
                    <div className="mb-3">
                      <div className="text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-wider">Intention du prospect</div>
                      <p className="leading-relaxed">{call.ai_intention_prospect}</p>
                    </div>
                  )}
                  {call.ai_prochaine_etape && (
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-wider">Prochaine étape</div>
                      <p className="leading-relaxed">{call.ai_prochaine_etape}</p>
                    </div>
                  )}
                </Section>
              )}

              {call.ai_points_forts && call.ai_points_forts.length > 0 && (
                <Section title="Points forts" badge={call.ai_points_forts.length}>
                  <ul className="space-y-1.5">
                    {call.ai_points_forts.map((s, i) => (
                      <li key={i} className="flex gap-2"><span className="text-emerald-500 flex-shrink-0 font-bold">+</span><span className="leading-relaxed">{s}</span></li>
                    ))}
                  </ul>
                </Section>
              )}

              {call.ai_points_amelioration && call.ai_points_amelioration.length > 0 && (
                <Section title="Coaching — à améliorer" badge={call.ai_points_amelioration.length}>
                  <ul className="space-y-1.5">
                    {call.ai_points_amelioration.map((s, i) => (
                      <li key={i} className="flex gap-2"><span className="text-amber-500 flex-shrink-0 font-bold">–</span><span className="leading-relaxed">{s}</span></li>
                    ))}
                  </ul>
                </Section>
              )}

              {call.ai_transcript && (
                <Section title="Transcription intégrale" defaultOpen={false}>
                  <div className="bg-gray-50 rounded-lg p-3 max-h-[400px] overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed">
                    {call.ai_transcript}
                  </div>
                </Section>
              )}
            </>
          ) : call.ai_analysis_status === 'processing' ? (
            <div className="mx-4 my-4 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-[12px] text-indigo-600 flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="45 15" /></svg>
              Analyse Claude en cours…
            </div>
          ) : call.ai_analysis_status === 'error' ? (
            <div className="mx-4 my-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-[12px] text-red-600">
              Erreur d'analyse. L'audio n'a peut-être pas pu être transcrit.
            </div>
          ) : (
            <div className="mx-4 my-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-[12px] text-gray-500">
              Analyse pas encore démarrée pour cet appel.
            </div>
          )}
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
      <div className="max-w-5xl mx-auto p-6">
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
