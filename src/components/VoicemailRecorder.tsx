/**
 * VoicemailRecorder — enregistreur navigateur pour le message d'accueil PERSO
 * du SDR (joué à un appelant qui rappelle son numéro et tombe sur le SDR).
 *
 * À ne PAS confondre avec le voicemail drop (Dialer.tsx "Messagerie vocale") :
 * - voicemail drop = message COMMERCIAL laissé automatiquement sur le répondeur du PROSPECT
 * - voicemail perso (ce component) = message d'ACCUEIL joué à celui qui m'appelle
 *
 * Persistence :
 * - Audio : bucket Storage privé `voicemails/{user_id}/greeting.webm`
 * - Texte fallback : `profiles.voicemail_text`
 * - Référence : `profiles.voicemail_url` (path Storage)
 *
 * Flow TwiML inbound géré dans call-webhook :
 *   audio → <Play> signed URL ; sinon texte → <Say Polly.Lea-Neural> ; sinon générique.
 */

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/config/supabase'
import { startWavRecording, type WavRecording } from '@/lib/audio'

export default function VoicemailRecorder({ compact = false }: { compact?: boolean }) {
  const { profile, refreshProfile } = useAuth()
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [existingUrl, setExistingUrl] = useState<string | null>(null)
  const [voicemailText, setVoicemailText] = useState(profile?.voicemail_text || '')
  const [uploading, setUploading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const recRef = useRef<WavRecording | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!profile?.voicemail_url) { setExistingUrl(null); return }
    let cancelled = false
    supabase.storage.from('voicemails').createSignedUrl(profile.voicemail_url, 3600)
      .then(({ data }) => { if (!cancelled && data?.signedUrl) setExistingUrl(data.signedUrl) })
    return () => { cancelled = true }
  }, [profile?.voicemail_url])

  useEffect(() => { setVoicemailText(profile?.voicemail_text || '') }, [profile?.voicemail_text])

  const startRecording = async () => {
    try {
      const rec = await startWavRecording({ audio: true })
      recRef.current = rec
      setRecording(true)
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed(e => e + 1), 1000)
    } catch (err) {
      alert('Impossible d\'accéder au microphone : ' + (err as Error).message)
    }
  }

  const stopRecording = async () => {
    if (!recRef.current) return
    const blob = await recRef.current.stop()
    recRef.current = null
    setRecordedBlob(blob)
    setRecordedUrl(URL.createObjectURL(blob))
    setRecording(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const resetRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    setRecordedBlob(null)
    setRecordedUrl(null)
    setElapsed(0)
  }

  const uploadRecording = async () => {
    if (!recordedBlob || !profile?.id) return
    setUploading(true)
    try {
      const path = `${profile.id}/greeting.wav`

      // Nettoyer une ancienne version orpheline si chemin différent
      if (profile.voicemail_url && profile.voicemail_url !== path) {
        await supabase.storage.from('voicemails').remove([profile.voicemail_url])
      }

      const { error: upErr } = await supabase.storage.from('voicemails')
        .upload(path, recordedBlob, { upsert: true, contentType: 'audio/wav' })
      if (upErr) { alert('Erreur upload : ' + upErr.message); return }

      const { error: dbErr } = await supabase.from('profiles')
        .update({ voicemail_url: path })
        .eq('id', profile.id)
      if (dbErr) { alert('Erreur sauvegarde : ' + dbErr.message); return }

      await refreshProfile()
      resetRecording()
    } catch (err) {
      alert('Erreur upload : ' + (err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const deleteVoicemail = async () => {
    if (!profile?.id || !profile?.voicemail_url) return
    if (!confirm('Supprimer votre message d\'accueil ?')) return
    await supabase.storage.from('voicemails').remove([profile.voicemail_url])
    await supabase.from('profiles').update({ voicemail_url: null }).eq('id', profile.id)
    await refreshProfile()
  }

  const saveText = async () => {
    if (!profile?.id) return
    const newVal = voicemailText.trim() || null
    if (newVal === profile.voicemail_text) return
    await supabase.from('profiles').update({ voicemail_text: newVal }).eq('id', profile.id)
    await refreshProfile()
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {!compact && (
        <div>
          <h3 className="text-[13px] font-bold text-gray-800">Mon message d'accueil</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Joué quand quelqu'un vous rappelle et que vous ne décrochez pas dans Calsyn.
          </p>
        </div>
      )}

      {existingUrl && !recordedBlob && (
        <div className={`rounded-lg bg-emerald-50 border border-emerald-200 space-y-2 ${compact ? 'p-2' : 'p-3'}`}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-emerald-600 uppercase">Message actif</span>
            <button onClick={deleteVoicemail} className="ml-auto text-[11px] text-red-500 hover:text-red-600 font-medium">
              Supprimer
            </button>
          </div>
          <audio controls src={existingUrl} className="w-full h-9" />
        </div>
      )}

      {recordedUrl && (
        <div className={`rounded-lg bg-violet-50 border border-violet-200 space-y-2 ${compact ? 'p-2' : 'p-3'}`}>
          <span className="text-[10px] font-bold text-violet-600 uppercase">Aperçu (non sauvegardé)</span>
          <audio controls src={recordedUrl} className="w-full h-9" />
          <div className="flex gap-2">
            <button onClick={uploadRecording} disabled={uploading}
              className="flex-1 text-[12px] font-semibold px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
              {uploading ? 'Upload…' : 'Sauvegarder'}
            </button>
            <button onClick={resetRecording} disabled={uploading}
              className="text-[12px] px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              Annuler
            </button>
          </div>
        </div>
      )}

      {!recordedBlob && (
        <div>
          {recording ? (
            <button onClick={stopRecording}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white font-semibold text-[12px] hover:bg-red-600 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white" />
              Arrêter ({fmtTime(elapsed)})
            </button>
          ) : (
            <button onClick={startRecording}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-violet-200 text-violet-600 font-semibold text-[12px] hover:bg-violet-50">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {existingUrl ? 'Réenregistrer' : 'Enregistrer un message'}
            </button>
          )}
        </div>
      )}

      {!compact && (
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1.5">
            Message texte (lu par voix Polly Neural si pas d'audio)
          </label>
          <textarea
            value={voicemailText}
            onChange={e => setVoicemailText(e.target.value)}
            onBlur={saveText}
            rows={3}
            placeholder="Bonjour, vous êtes bien sur la ligne de…"
            className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 outline-none resize-none focus:border-violet-300"
          />
        </div>
      )}
    </div>
  )
}
