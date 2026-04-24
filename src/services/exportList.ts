/**
 * Export complet d'une liste : CSV + dossiers par prospect avec audios + fiches coaching.
 *
 * Structure :
 * export_[liste]/
 * ├── prospects.csv
 * ├── Karl_Lefebvre/
 * │   ├── appel_2026-04-13_08h04_connected_10min.mp3
 * │   ├── appel_2026-04-13_08h04_fiche.txt
 * │   └── ...
 * └── Arnaud_Maillard/
 *     └── ...
 */

import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { supabase } from '@/config/supabase'
import { getSignedRecordingUrl } from '@/services/recordingSignedUrl'
import type { Prospect } from '@/types/prospect'

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-ZÀ-ÿ0-9\s_-]/g, '').replace(/\s+/g, '_').slice(0, 50)
}

function formatDuration(s: number): string {
  if (!s) return '0s'
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}min${(s % 60).toString().padStart(2, '0')}s`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function buildFiche(call: any): string {
  const lines: string[] = []
  lines.push('=' .repeat(60))
  lines.push(`FICHE D'APPEL — ${call.prospect_name || 'Inconnu'}`)
  lines.push('=' .repeat(60))
  lines.push('')
  lines.push(`Date : ${formatDate(call.created_at)}`)
  lines.push(`Durée : ${formatDuration(call.call_duration)}`)
  lines.push(`Résultat : ${call.call_outcome || '?'}`)
  lines.push(`Téléphone : ${call.prospect_phone || '?'}`)
  lines.push(`Numéro sortant : ${call.from_number || '?'}`)
  if (call.note) lines.push(`Notes SDR : ${call.note}`)
  lines.push('')

  if (call.ai_summary) {
    lines.push('-'.repeat(40))
    lines.push('RÉSUMÉ IA')
    lines.push('-'.repeat(40))
    const summary = Array.isArray(call.ai_summary) ? call.ai_summary : [call.ai_summary]
    for (const s of summary) lines.push(s)
    lines.push('')
  }

  if (call.ai_intention_prospect) {
    lines.push(`Intention prospect : ${call.ai_intention_prospect}`)
  }
  if (call.ai_prochaine_etape) {
    lines.push(`Prochaine étape : ${call.ai_prochaine_etape}`)
  }

  if (call.ai_score_global || call.ai_score_accroche) {
    lines.push('')
    lines.push('-'.repeat(40))
    lines.push('SCORES')
    lines.push('-'.repeat(40))
    if (call.ai_score_global) lines.push(`Score global : ${call.ai_score_global}/10`)
    if (call.ai_score_accroche) lines.push(`Accroche : ${call.ai_score_accroche}/10`)
    if (call.ai_score_objection) lines.push(`Objection : ${call.ai_score_objection}/10`)
    if (call.ai_score_closing) lines.push(`Closing : ${call.ai_score_closing}/10`)
  }

  if (call.ai_points_forts) {
    lines.push('')
    lines.push('-'.repeat(40))
    lines.push('POINTS FORTS')
    lines.push('-'.repeat(40))
    const points = Array.isArray(call.ai_points_forts) ? call.ai_points_forts : [call.ai_points_forts]
    for (const p of points) lines.push(`• ${p}`)
  }

  if (call.ai_points_amelioration) {
    lines.push('')
    lines.push('-'.repeat(40))
    lines.push('À AMÉLIORER')
    lines.push('-'.repeat(40))
    const points = Array.isArray(call.ai_points_amelioration) ? call.ai_points_amelioration : [call.ai_points_amelioration]
    for (const p of points) lines.push(`• ${p}`)
  }

  if (call.ai_transcript) {
    lines.push('')
    lines.push('-'.repeat(40))
    lines.push('TRANSCRIPTION COMPLÈTE')
    lines.push('-'.repeat(40))
    lines.push(call.ai_transcript)
  }

  return lines.join('\n')
}

export interface ExportProgress {
  step: string
  current: number
  total: number
}

export async function exportListWithAudios(
  listId: string,
  listName: string,
  prospects: Prospect[],
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  const zip = new JSZip()
  const folderName = `export_${sanitizeName(listName)}`
  const root = zip.folder(folderName)!

  // 1. CSV global
  onProgress?.({ step: 'Préparation CSV...', current: 0, total: prospects.length })
  const csvHeaders = ['Nom', 'Téléphone', 'Email', 'Entreprise', 'Poste', 'Statut appel', 'Statut CRM', 'Nb appels', 'Dernier appel', 'RDV', 'Rappel']
  const csvRows = prospects.map(p => [
    p.name, p.phone, p.email || '', p.company || '', p.title || '',
    p.last_call_outcome || '', p.crm_status || 'new',
    String(p.call_count || 0), p.last_call_at || '',
    p.rdv_date || '', p.snoozed_until || '',
  ])
  const csv = [csvHeaders, ...csvRows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  root.file('prospects.csv', '\uFEFF' + csv)

  // 2. Pour chaque prospect, fetch les appels
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Non connecté')

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i]
    onProgress?.({ step: `${p.name}...`, current: i + 1, total: prospects.length })

    // Fetch appels par phone (cross-listes)
    const { data: calls } = await supabase
      .from('calls')
      .select('*')
      .or(`prospect_id.eq.${p.id},prospect_phone.eq.${p.phone}`)
      .order('created_at', { ascending: true })

    if (!calls || calls.length === 0) continue

    const prospectFolder = root.folder(sanitizeName(p.name))!

    for (let j = 0; j < calls.length; j++) {
      const call = calls[j]
      const d = new Date(call.created_at)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const timeStr = `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
      const durStr = formatDuration(call.call_duration || 0)
      const prefix = `appel_${dateStr}_${timeStr}_${call.call_outcome || 'unknown'}_${durStr}`

      // Fiche texte (résumé + transcription + coaching)
      const fiche = buildFiche(call)
      prospectFolder.file(`${prefix}_fiche.txt`, fiche)

      // Audio (si recording disponible)
      if (call.recording_url) {
        try {
          const signed = await getSignedRecordingUrl(call.recording_url)
          if (signed) {
            const audioRes = await fetch(signed)
            if (audioRes.ok) {
              const audioBlob = await audioRes.blob()
              prospectFolder.file(`${prefix}.mp3`, audioBlob)
            }
          }
        } catch {
          // Skip si l'audio ne peut pas être téléchargé
        }
      }
    }
  }

  // 3. Générer et télécharger le ZIP
  onProgress?.({ step: 'Compression...', current: prospects.length, total: prospects.length })
  const blob = await zip.generateAsync({ type: 'blob' }, (meta) => {
    onProgress?.({ step: `Compression ${Math.round(meta.percent)}%...`, current: Math.round(meta.percent), total: 100 })
  })
  saveAs(blob, `${folderName}.zip`)
}
