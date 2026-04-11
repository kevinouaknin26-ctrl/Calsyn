import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/config/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError('Email ou mot de passe incorrect'); setLoading(false); return }

    navigate('/app/dialer')
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-96 px-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">Callio</h1>
          <p className="text-sm text-muted mt-2">Connectez-vous pour continuer</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <input
            type="email" placeholder="Email" required
            value={email} onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 text-sm bg-surface-2 border border-border rounded-xl text-white outline-none focus:border-accent transition-colors"
          />
          <input
            type="password" placeholder="Mot de passe" required
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 text-sm bg-surface-2 border border-border rounded-xl text-white outline-none focus:border-accent transition-colors"
          />

          {error && (
            <div className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-lg">{error}</div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full py-3.5 text-sm font-bold bg-accent text-white rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
