/**
 * Reglages — Config organisation, style Minari, francais.
 */

import { useAuth } from '@/hooks/useAuth'

export default function Settings() {
  const { organisation, profile } = useAuth()

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Reglages</h1>

      <div className="max-w-2xl space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Organisation</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Nom</label><p className="text-gray-700 mt-1">{organisation?.name || '—'}</p></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Plan</label><p className="text-gray-700 mt-1">{organisation?.plan || '—'}</p></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Fournisseur VoIP</label><p className="text-gray-700 mt-1">{organisation?.voice_provider || 'twilio'}</p></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Credit</label><p className="text-gray-700 mt-1">{organisation?.credit_balance?.toFixed(2) || '0.00'} €</p></div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Mon profil</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Nom</label><p className="text-gray-700 mt-1">{profile?.full_name || '—'}</p></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Email</label><p className="text-gray-700 mt-1">{profile?.email || '—'}</p></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Role</label><p className="text-gray-700 mt-1">{profile?.role || '—'}</p></div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Configuration Twilio</h2>
          <p className="text-xs text-gray-400 mb-3">Les secrets sont configures cote serveur. Contactez l'administrateur pour les modifier.</p>
          <div className="space-y-2">
            {['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_TWIML_APP_SID'].map(key => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-gray-400 w-48">{key}</span>
                <span className="text-[11px] text-emerald-500 font-semibold">● Configure</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
