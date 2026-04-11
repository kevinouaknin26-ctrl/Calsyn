/**
 * Reglages — Call Settings style Minari + config organisation.
 */

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

export default function Settings() {
  const { organisation, profile } = useAuth()

  // Call settings (local state — TODO: persist to DB)
  const [parallelCalls, setParallelCalls] = useState(1)
  const [autoRotate, setAutoRotate] = useState(true)
  const [maxAttempts, setMaxAttempts] = useState('unlimited')
  const [attemptPeriod, setAttemptPeriod] = useState('per_day')
  const [voicemailDrop, setVoicemailDrop] = useState(false)
  const [conversationThreshold, setConversationThreshold] = useState(30)

  return (
    <div className="min-h-screen bg-white p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Settings</h1>

      <div className="max-w-2xl space-y-6">

        {/* ── Call Settings (Minari style) ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-5">Call Settings</h2>

          {/* Parallel calls */}
          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-600 block mb-2">Parallel calls</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setParallelCalls(n)}
                  className={`w-10 h-10 rounded-lg text-sm font-semibold transition-colors ${
                    parallelCalls === n
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>{n}</button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">Nombre d'appels lances simultanement</p>
          </div>

          {/* Auto rotate numbers */}
          <div className="mb-5 flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-gray-600 block">Auto-rotate caller phone numbers</label>
              <p className="text-[11px] text-gray-400 mt-0.5">Alterne entre les numeros assignes</p>
            </div>
            <button onClick={() => setAutoRotate(!autoRotate)}
              className={`w-11 h-6 rounded-full transition-colors relative ${autoRotate ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${autoRotate ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Max call attempts */}
          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-600 block mb-2">Maximum call attempts per contact</label>
            <div className="flex items-center gap-2">
              <select value={maxAttempts} onChange={e => setMaxAttempts(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 outline-none">
                <option value="unlimited">Unlimited</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="5">5</option>
                <option value="10">10</option>
              </select>
              <select value={attemptPeriod} onChange={e => setAttemptPeriod(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 outline-none">
                <option value="per_day">per day</option>
                <option value="per_week">per week</option>
                <option value="total">total</option>
              </select>
            </div>
          </div>

          {/* Voicemail drop */}
          <div className="mb-5 flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-gray-600 block">Voicemail drop</label>
              <p className="text-[11px] text-gray-400 mt-0.5">Deposer un message vocal automatiquement sur les repondeurs</p>
            </div>
            <button onClick={() => setVoicemailDrop(!voicemailDrop)}
              className={`w-11 h-6 rounded-full transition-colors relative ${voicemailDrop ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${voicemailDrop ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Conversation threshold */}
          <div className="mb-2">
            <label className="text-xs font-semibold text-gray-600 block mb-2">Conversation threshold</label>
            <div className="flex items-center gap-2">
              <select value={conversationThreshold} onChange={e => setConversationThreshold(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 outline-none">
                <option value={0}>0 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
              </select>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">Duree minimum pour compter comme "Conversation" dans les analytics</p>
          </div>
        </div>

        {/* ── AI Summary Settings ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">AI Summary</h2>
          <p className="text-xs text-gray-400 mb-3">Les transcriptions sont generees pour les appels de 20 secondes minimum. Langues auto-detectees : FR, EN, DE, IT, ES.</p>
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Prompt standard</p>
            <p className="text-xs text-gray-600">Resume, signaux cles, score de qualification</p>
          </div>
          <button className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-medium">+ New custom prompt</button>
        </div>

        {/* ── Incoming Calls (Callback) ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Incoming Calls</h2>
          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
              <input type="radio" name="callback" defaultChecked className="mt-0.5 accent-teal-600" />
              <div>
                <p className="text-xs font-semibold text-gray-700">Callback dans Callio uniquement</p>
                <p className="text-[11px] text-gray-400">Les appels sonnent si l'onglet est ouvert</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
              <input type="radio" name="callback" className="mt-0.5 accent-teal-600" />
              <div>
                <p className="text-xs font-semibold text-gray-700">Callback + Redirection</p>
                <p className="text-[11px] text-gray-400">Si Callio est ferme, redirige vers un numero externe</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
              <input type="radio" name="callback" className="mt-0.5 accent-teal-600" />
              <div>
                <p className="text-xs font-semibold text-gray-700">Redirection forcee</p>
                <p className="text-[11px] text-gray-400">Tous les callbacks redirigees vers un numero externe</p>
              </div>
            </label>
          </div>
        </div>

        {/* ── Organisation ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Organisation</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Nom</label><p className="text-gray-700 mt-1">{organisation?.name || '—'}</p></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Plan</label><p className="text-gray-700 mt-1">{organisation?.plan || '—'}</p></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Fournisseur VoIP</label><p className="text-gray-700 mt-1">{organisation?.voice_provider || 'twilio'}</p></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Credit</label><p className="text-gray-700 mt-1">{organisation?.credit_balance?.toFixed(2) || '0.00'} EUR</p></div>
          </div>
        </div>

        {/* ── Mon profil ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Mon profil</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Nom</label><p className="text-gray-700 mt-1">{profile?.full_name || '—'}</p></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Email</label><p className="text-gray-700 mt-1">{profile?.email || '—'}</p></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Role</label><p className="text-gray-700 mt-1">{profile?.role || '—'}</p></div>
          </div>
        </div>

        {/* ── Twilio Config ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">VoIP Configuration</h2>
          <p className="text-xs text-gray-400 mb-3">Les secrets sont configures cote serveur.</p>
          <div className="space-y-2">
            {['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_TWIML_APP_SID'].map(key => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-gray-400 w-48">{key}</span>
                <span className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Configured
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
