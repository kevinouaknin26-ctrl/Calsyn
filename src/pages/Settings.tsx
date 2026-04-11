/**
 * Settings — Configuration de l'organisation.
 */

import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'

export default function Settings() {
  const { isDark } = useTheme()
  const { organisation, profile } = useAuth()

  const bg = isDark ? 'bg-black' : 'bg-[#f5f5f7]'
  const card = isDark ? 'bg-[#1c1c1e] border-white/[0.08]' : 'bg-white border-black/[0.06]'
  const text = isDark ? 'text-white' : 'text-gray-900'
  const input = isDark ? 'bg-[#2c2c2e] text-white' : 'bg-gray-50 text-gray-900'

  return (
    <div className={`min-h-screen ${bg} p-6 transition-colors`}>
      <h1 className={`text-2xl font-extrabold tracking-tight mb-6 ${text}`}>Reglages</h1>

      <div className="max-w-2xl space-y-6">
        {/* Organisation */}
        <div className={`rounded-2xl border p-5 ${card}`}>
          <h2 className={`text-sm font-bold mb-4 ${text}`}>Organisation</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Nom</label>
              <p className={`text-sm mt-1 ${text}`}>{organisation?.name || '—'}</p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Plan</label>
              <p className={`text-sm mt-1 ${text}`}>{organisation?.plan || '—'}</p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Provider VoIP</label>
              <p className={`text-sm mt-1 ${text}`}>{organisation?.voice_provider || 'twilio'}</p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Credit</label>
              <p className={`text-sm mt-1 ${text}`}>{organisation?.credit_balance?.toFixed(2) || '0.00'} €</p>
            </div>
          </div>
        </div>

        {/* Profil */}
        <div className={`rounded-2xl border p-5 ${card}`}>
          <h2 className={`text-sm font-bold mb-4 ${text}`}>Mon profil</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Nom</label>
              <p className={`text-sm mt-1 ${text}`}>{profile?.full_name || '—'}</p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Email</label>
              <p className={`text-sm mt-1 ${text}`}>{profile?.email || '—'}</p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Role</label>
              <p className={`text-sm mt-1 ${text}`}>{profile?.role || '—'}</p>
            </div>
          </div>
        </div>

        {/* Twilio Config */}
        <div className={`rounded-2xl border p-5 ${card}`}>
          <h2 className={`text-sm font-bold mb-4 ${text}`}>Configuration Twilio</h2>
          <p className="text-xs text-[#86868b] mb-3">Les secrets Twilio sont configures cote serveur (Supabase secrets). Contactez l'admin pour les modifier.</p>
          <div className="space-y-2">
            {['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_TWIML_APP_SID'].map(key => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-[#86868b] w-48">{key}</span>
                <span className="text-[11px] text-[#30d158]">Configure</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
