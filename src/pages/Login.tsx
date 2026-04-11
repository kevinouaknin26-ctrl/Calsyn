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
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
      <div className="w-96 px-10">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white mx-auto mb-4">
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" /></svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Callio</h1>
          <p className="text-sm text-white/40 mt-2">Connectez-vous pour continuer</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <input type="email" placeholder="Email" required
            value={email} onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500 transition-colors placeholder:text-white/30" />
          <input type="password" placeholder="Mot de passe" required
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500 transition-colors placeholder:text-white/30" />

          {error && <div className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</div>}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 text-sm font-bold bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50">
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
