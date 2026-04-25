/**
 * Export d'une fiche d'appel en ZIP : markdown + audio (signed URL) + raw JSON.
 * Partagé entre la page Historique et le player audio dans ProspectModal.
 */

import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { getSignedRecordingUrl } from './recordingSignedUrl'
import type { Call } from '@/types/call'

function slugify(s: string): string {
  return (s || 'appel').normalize('NFD').replace(/[̀-ͯ]/g, '')
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

export async function downloadCallZip(call: Call) {
  const zip = new JSZip()
  const slug = `${slugify(call.prospect_name || 'inconnu')}_${new Date(call.created_at).toISOString().slice(0, 10)}`
  zip.file(`${slug}/fiche.md`, buildFicheMarkdown(call))
  if (call.recording_url) {
    try {
      const signed = await getSignedRecordingUrl(call.recording_url)
      if (!signed) {
        zip.file(`${slug}/_AUDIO_ERREUR.txt`, 'Impossible de signer l\'URL (session expirée ?)')
      } else {
        const res = await fetch(signed)
        if (res.ok) {
          const blob = await res.blob()
          const ext = blob.type.includes('wav') ? 'wav' : 'mp3'
          zip.file(`${slug}/audio.${ext}`, blob)
        } else {
          zip.file(`${slug}/_AUDIO_ERREUR.txt`, `HTTP ${res.status}\n${call.recording_url}`)
        }
      }
    } catch (e) {
      zip.file(`${slug}/_AUDIO_ERREUR.txt`, (e as Error).message)
    }
  }
  zip.file(`${slug}/raw.json`, JSON.stringify(call, null, 2))
  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, `${slug}.zip`)
}
