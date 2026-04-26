import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/config/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotState, setForgotState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const navigate = useNavigate()

  // Si user arrive ici via magic link invite (anciens liens pointaient vers /login),
  // ou s'il est déjà connecté mais n'a jamais complété son onboarding → redirect /accept-invite.
  // Super Admin (hors org) → /app/super-admin (pas /app/dialer qui a besoin d'une org).
  useEffect(() => {
    (async () => {
      await new Promise(r => setTimeout(r, 300))
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const { data: p } = await supabase.from('profiles').select('last_seen_at, role').eq('id', session.user.id).single()
      if (!p?.last_seen_at) navigate('/accept-invite')
      else navigate('/app/dialer')
    })()
  }, [navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError('Email ou mot de passe incorrect'); setLoading(false); return }
    navigate('/app/dialer')
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    if (!forgotEmail.trim()) return
    setForgotState('sending')
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      })
      // Toujours succès affiché (pas de leak emails)
      setForgotState('sent')
    } catch {
      setForgotState('sent') // idem
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
      <div className="w-96 px-10">
        <div className="text-center mb-10">
          <img src="/favicon.svg" alt="Calsyn" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Calsyn</h1>
          <p className="text-sm text-white/40 mt-2">Connectez-vous pour continuer</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <input type="email" placeholder="Email" required
            value={email} onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-violet-500 transition-colors placeholder:text-white/30" />
          <input type="password" placeholder="Mot de passe" required
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-violet-500 transition-colors placeholder:text-white/30" />

          {error && <div className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</div>}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 text-sm font-bold bg-violet-500 text-white rounded-xl hover:bg-violet-600 transition-colors disabled:opacity-50">
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>

          <button type="button" onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotState('idle') }}
            className="text-xs text-white/40 hover:text-white/70 transition-colors mt-1">
            Mot de passe oublié ?
          </button>
        </form>

        {showForgot && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
            onClick={e => { if (e.target === e.currentTarget) setShowForgot(false) }}>
            <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-bold text-white mb-2">Mot de passe oublié</h3>
              <p className="text-xs text-white/50 mb-4">Saisis ton email, on t'envoie un lien pour choisir un nouveau mot de passe.</p>
              {forgotState === 'sent' ? (
                <div className="text-center py-3">
                  <div className="text-4xl mb-2">📬</div>
                  <p className="text-sm text-white/80 mb-4">Si cet email est enregistré, tu vas recevoir un lien dans quelques secondes.</p>
                  <button onClick={() => setShowForgot(false)}
                    className="text-xs text-violet-400 hover:text-violet-300 underline">Fermer</button>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="flex flex-col gap-3">
                  <input type="email" placeholder="ton@email.com" required autoFocus
                    value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-violet-500 placeholder:text-white/30" />
                  <button type="submit" disabled={forgotState === 'sending'}
                    className="w-full py-2.5 text-sm font-semibold bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-50">
                    {forgotState === 'sending' ? 'Envoi…' : 'Envoyer le lien'}
                  </button>
                  <button type="button" onClick={() => setShowForgot(false)}
                    className="text-xs text-white/40 hover:text-white/70">Annuler</button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
