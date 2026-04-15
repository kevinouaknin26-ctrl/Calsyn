import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/config/supabase'

/**
 * Page d'accueil après clic sur le mail d'invitation.
 * - Supabase a déjà créé la session via le token dans l'URL hash (detectSessionInUrl du client).
 * - L'user n'a PAS encore de password → on lui en demande un ici.
 * - Une fois set, on touch_last_seen + redirect /app/dialer.
 */
export default function AcceptInvite() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionValid, setSessionValid] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [inviteExpired, setInviteExpired] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    (async () => {
      // Supabase auto-parse le token du hash (#access_token=...) au mount → session créée
      // On attend un tick pour laisser le SDK traiter
      await new Promise(r => setTimeout(r, 300))
      const { data: { session }, error: sErr } = await supabase.auth.getSession()
      if (sErr || !session?.user) {
        setError("Lien d'invitation invalide ou expiré. Contactez l'admin qui vous a invité.")
        setLoading(false)
        return
      }
      setSessionValid(true)
      setEmail(session.user.email || '')

      // Vérifier invite_expires_at côté profile
      const { data: profile } = await supabase.from('profiles')
        .select('full_name, invite_expires_at, last_seen_at')
        .eq('id', session.user.id).single()
      if (profile?.invite_expires_at && new Date(profile.invite_expires_at).getTime() < Date.now()) {
        setInviteExpired(true)
      }
      if (profile?.full_name) setFullName(profile.full_name)
      // Si user déjà onboardé (last_seen_at set) → pas besoin de repasser par accept-invite
      if (profile?.last_seen_at) {
        navigate('/app/dialer')
        return
      }
      setLoading(false)
    })()
  }, [navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères'); return }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return }
    if (!fullName.trim()) { setError('Votre nom complet est requis'); return }
    setSaving(true)
    try {
      // 1. Set le password + full_name dans auth.users
      const { error: updErr } = await supabase.auth.updateUser({ password, data: { full_name: fullName.trim() } })
      if (updErr) throw new Error(updErr.message)

      // 2. Update profile.full_name (trigger ne s'est pas déclenché avec le nom, donc on le fait ici)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', user.id)
      }

      // 3. Marquer invitation consommée + first login
      await supabase.rpc('touch_last_seen').then(() => {})
      await supabase.from('profiles').update({ invite_expires_at: null }).eq('id', user?.id)

      navigate('/app/dialer')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <img src="/favicon.svg" alt="Calsyn" className="w-12 h-12 animate-pulse" />
      </div>
    )
  }

  if (!sessionValid) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-96 px-10 text-center">
          <img src="/favicon.svg" alt="Calsyn" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-xl font-extrabold text-white mb-3">Lien invalide ou expiré</h1>
          <p className="text-sm text-white/60 mb-6">{error || "Ce lien d'invitation n'est plus valide."}</p>
          <button onClick={() => navigate('/login')} className="text-sm text-violet-400 hover:text-violet-300">
            Retour à la connexion
          </button>
        </div>
      </div>
    )
  }

  if (inviteExpired) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-96 px-10 text-center">
          <img src="/favicon.svg" alt="Calsyn" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-xl font-extrabold text-white mb-3">Invitation expirée</h1>
          <p className="text-sm text-white/60 mb-6">
            Le délai accordé pour accepter cette invitation est dépassé. Contactez l'admin qui vous a invité pour en demander une nouvelle.
          </p>
          <button onClick={() => navigate('/login')} className="text-sm text-violet-400 hover:text-violet-300">
            Retour à la connexion
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
      <div className="w-[420px] px-10">
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="Calsyn" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Bienvenue</h1>
          <p className="text-sm text-white/50 mt-2">Finalisez votre compte pour rejoindre l'équipe</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Email</label>
          <div className="px-4 py-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white/60">
            {email}
          </div>

          <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mt-2">Nom complet</label>
          <input type="text" required autoFocus
            value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="Marie Dupont"
            className="w-full px-4 py-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-violet-500 transition-colors placeholder:text-white/30" />

          <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mt-2">Mot de passe</label>
          <input type="password" required
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="8 caractères minimum"
            className="w-full px-4 py-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-violet-500 transition-colors placeholder:text-white/30" />

          <input type="password" required
            value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Confirmer le mot de passe"
            className="w-full px-4 py-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-violet-500 transition-colors placeholder:text-white/30" />

          {error && <div className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</div>}

          <button type="submit" disabled={saving}
            className="mt-3 w-full py-3.5 text-sm font-bold bg-gradient-to-br from-[#863bff] to-[#4f1dc4] text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? 'Création du compte...' : 'Accéder à Calsyn →'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-white/30">
          En continuant, vous acceptez les CGU de Calsyn.
        </p>
      </div>
    </div>
  )
}
