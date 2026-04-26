/**
 * ResetPassword — Page atterrissage du magic link "recovery" Supabase.
 * L'user est auto-loggué via le token dans l'URL hash. Il choisit un nouveau
 * mot de passe → updateUser → redirect vers /app/dialer.
 */

import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/config/supabase'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Le magic link Supabase pose la session dans l'URL hash automatiquement
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setSessionReady(true)
      else {
        // Attendre un peu (Supabase parse le hash de manière async)
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (s?.user) setSessionReady(true)
            else setError('Lien invalide ou expiré. Demande un nouveau lien depuis la page de connexion.')
          })
        }, 500)
      }
    })
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return }
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) { setError(err.message); setLoading(false); return }
    navigate('/app/dialer')
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
      <div className="w-96 px-10">
        <div className="text-center mb-10">
          <img src="/favicon.svg" alt="Calsyn" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Calsyn</h1>
          <p className="text-sm text-white/40 mt-2">Choisis un nouveau mot de passe</p>
        </div>

        {!sessionReady && !error && (
          <p className="text-sm text-white/60 text-center">Vérification du lien…</p>
        )}

        {error && !sessionReady && (
          <div className="text-sm text-red-400 bg-red-400/10 px-4 py-3 rounded-xl text-center">
            {error}
            <button onClick={() => navigate('/login')} className="block mx-auto mt-3 text-violet-400 hover:text-violet-300 underline">
              Retour à la connexion
            </button>
          </div>
        )}

        {sessionReady && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <input type="password" placeholder="Nouveau mot de passe (8+ caractères)" required
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-violet-500 transition-colors placeholder:text-white/30" />
            <input type="password" placeholder="Confirmer le mot de passe" required
              value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full px-4 py-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-violet-500 transition-colors placeholder:text-white/30" />
            {error && <div className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-3.5 text-sm font-bold bg-violet-500 text-white rounded-xl hover:bg-violet-600 transition-colors disabled:opacity-50">
              {loading ? 'Mise à jour...' : 'Enregistrer le mot de passe'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
