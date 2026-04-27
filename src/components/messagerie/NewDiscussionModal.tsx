/**
 * NewDiscussionModal — démarrer une discussion par email avec 1 ou N destinataires.
 *
 * Multi-destinataires = chat de groupe via thread Gmail. Quand on tape "Envoyer",
 * Gmail crée un thread normal entre tous les recipients. Chaque mail répondu par
 * un membre arrive dans la messagerie de tout le groupe (Gmail propage en Reply All).
 *
 * Autocomplete : tape 2+ caractères → matche sur :
 *   - membres de l'org (profiles)
 *   - prospects ('internal' inclus pour les coéquipiers déjà créés comme contact)
 */

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useGmail } from '@/hooks/useGmail'

interface RecipientChip {
  email: string
  name?: string
  source: 'team' | 'prospect' | 'manual'
}

interface AutocompleteHit {
  email: string
  name: string
  source: 'team' | 'prospect'
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function NewDiscussionModal({ onClose }: { onClose: () => void }) {
  const { profile, organisation } = useAuth()
  const { sendEmail } = useGmail()

  const [recipients, setRecipients] = useState<RecipientChip[]>([])
  const [recipientInput, setRecipientInput] = useState('')
  const [autocompleteOpen, setAutocompleteOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Autocomplete : profiles (équipe) + prospects (incl. internal)
  const { data: hits = [] } = useQuery({
    queryKey: ['discussion-autocomplete', organisation?.id, recipientInput],
    queryFn: async () => {
      if (recipientInput.trim().length < 2) return [] as AutocompleteHit[]
      const q = recipientInput.trim()

      const [{ data: profiles }, { data: prospects }] = await Promise.all([
        supabase.from('profiles')
          .select('id, email, full_name')
          .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
          .neq('id', profile?.id || '')
          .is('deactivated_at', null)
          .limit(10),
        supabase.from('prospects')
          .select('id, email, name')
          .or(`email.ilike.%${q}%,name.ilike.%${q}%`)
          .not('email', 'is', null)
          .is('deleted_at', null)
          .limit(10),
      ])

      const out: AutocompleteHit[] = []
      for (const p of profiles || []) {
        if (p.email) out.push({ email: p.email, name: p.full_name || p.email, source: 'team' })
      }
      for (const p of prospects || []) {
        if (p.email && !out.some(h => h.email === p.email)) {
          out.push({ email: p.email, name: p.name || p.email, source: 'prospect' })
        }
      }
      return out.slice(0, 8)
    },
    enabled: !!organisation?.id && recipientInput.trim().length >= 2,
  })

  function addRecipient(chip: RecipientChip) {
    if (!chip.email || !EMAIL_RE.test(chip.email)) return
    if (recipients.some(r => r.email.toLowerCase() === chip.email.toLowerCase())) return
    setRecipients([...recipients, chip])
    setRecipientInput('')
    setAutocompleteOpen(false)
  }

  function removeRecipient(email: string) {
    setRecipients(recipients.filter(r => r.email !== email))
  }

  function handleInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // Backspace sur input vide → retire le dernier chip
    if (e.key === 'Backspace' && !recipientInput && recipients.length > 0) {
      e.preventDefault()
      setRecipients(recipients.slice(0, -1))
    }
    // Enter, virgule, espace → ajoute manuel si email valide
    if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && recipientInput.trim()) {
      e.preventDefault()
      const v = recipientInput.trim().replace(/,$/, '')
      if (EMAIL_RE.test(v)) addRecipient({ email: v, source: 'manual' })
    }
    if (e.key === 'Escape') {
      setAutocompleteOpen(false)
    }
  }

  useEffect(() => {
    setAutocompleteOpen(recipientInput.trim().length >= 2 && hits.length > 0)
  }, [hits, recipientInput])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (recipients.length === 0) { setError('Ajoute au moins un destinataire'); return }
    if (!subject.trim()) { setError('Objet requis'); return }
    if (!body.trim()) { setError('Message vide'); return }
    setBusy(true)
    try {
      const to = recipients.map(r => r.email).join(', ')
      const result = await sendEmail({ to, subject: subject.trim(), body })
      if (result.error) throw new Error(result.error)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-xl shadow-xl animate-fade-in-scale my-8 max-h-[calc(100vh-4rem)] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-[15px] font-bold text-gray-800">Nouvelle discussion</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-3 overflow-y-auto flex-1">
          {/* Recipients chips + input */}
          <div className="relative">
            <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">
              À <span className="text-gray-400 font-normal">(plusieurs = chat de groupe)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 px-2 py-1.5 border border-gray-200 rounded-lg focus-within:border-violet-400 min-h-[40px] items-center">
              {recipients.map(r => (
                <span key={r.email} className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 ${
                  r.source === 'team' ? 'bg-violet-100 text-violet-700' : r.source === 'prospect' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {r.source === 'team' && <span title="Membre équipe">👥</span>}
                  {r.source === 'prospect' && <span title="Contact">👤</span>}
                  <span>{r.name || r.email}</span>
                  <button type="button" onClick={() => removeRecipient(r.email)} className="hover:text-red-500 ml-0.5">✕</button>
                </span>
              ))}
              <input
                type="text"
                value={recipientInput}
                onChange={e => setRecipientInput(e.target.value)}
                onKeyDown={handleInputKey}
                onFocus={() => setAutocompleteOpen(recipientInput.length >= 2 && hits.length > 0)}
                placeholder={recipients.length === 0 ? 'Email, nom… (Enter pour ajouter)' : ''}
                className="flex-1 min-w-[140px] text-[12px] outline-none bg-transparent py-1"
                autoFocus
              />
            </div>
            {/* Autocomplete dropdown */}
            {autocompleteOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                {hits.map(h => (
                  <button
                    key={`${h.source}-${h.email}`}
                    type="button"
                    onClick={() => addRecipient({ email: h.email, name: h.name, source: h.source })}
                    className="w-full text-left px-3 py-2 hover:bg-violet-50 flex items-center gap-2 text-[12px]"
                  >
                    <span>{h.source === 'team' ? '👥' : '👤'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 truncate">{h.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{h.email}</div>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      h.source === 'team' ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700'
                    }`}>
                      {h.source === 'team' ? 'Équipe' : 'Contact'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">Objet *</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Point équipe lundi, RDV, etc."
              className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-violet-400"
              required
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">Message *</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Ton message..."
              rows={8}
              className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-violet-400 resize-y"
              required
            />
          </div>

          {recipients.length > 1 && (
            <div className="text-[10px] text-violet-600 bg-violet-50 px-3 py-2 rounded-lg flex items-start gap-2">
              <span>💡</span>
              <div>
                <strong>Mode groupe</strong> : ce mail crée un thread Gmail entre {recipients.length} personnes.
                Toutes les réponses (Reply All) iront à tout le groupe.
              </div>
            </div>
          )}

          {error && <div className="text-[11px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-[12px] font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy || recipients.length === 0}
              className="flex-1 py-2 rounded-lg text-[12px] font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? 'Envoi...' : `Envoyer${recipients.length > 1 ? ` (${recipients.length})` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
