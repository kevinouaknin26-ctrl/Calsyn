/**
 * AIAnalysis — Affiche les scores et le resume IA d'un appel.
 * Gere les 4 etats : pending, processing, completed, error.
 */

import { useTheme } from '@/hooks/useTheme'
import type { Call } from '@/types/call'

interface Props {
  call: Call | null
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  const { isDark } = useTheme()
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider w-20">{label}</span>
      <div className={`flex-1 h-2 rounded-full ${isDark ? 'bg-white/[0.06]' : 'bg-black/[0.06]'}`}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{ color }}>{score}</span>
    </div>
  )
}

export default function AIAnalysis({ call }: Props) {
  const { isDark } = useTheme()
  const card = isDark ? 'bg-[#1c1c1e] border-white/[0.08]' : 'bg-white border-black/[0.06]'
  const text = isDark ? 'text-white' : 'text-gray-900'

  if (!call) return null

  // Pending
  if (call.ai_analysis_status === 'pending') {
    return (
      <div className={`rounded-2xl border p-5 ${card}`}>
        <p className="text-sm text-[#86868b]">Analyse IA en attente...</p>
      </div>
    )
  }

  // Processing
  if (call.ai_analysis_status === 'processing') {
    return (
      <div className={`rounded-2xl border p-5 ${card}`}>
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#0071e3] font-semibold">Transcription et analyse en cours...</p>
        </div>
      </div>
    )
  }

  // Error
  if (call.ai_analysis_status === 'error') {
    return (
      <div className={`rounded-2xl border p-5 ${card}`}>
        <p className="text-sm text-[#ff453a]">L'analyse a echoue. Reessayez plus tard.</p>
      </div>
    )
  }

  // Completed
  return (
    <div className={`rounded-2xl border p-5 space-y-5 ${card}`}>
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-bold ${text}`}>Analyse Callio IA</h3>
        {call.ai_score_global && (
          <div className="px-3 py-1 rounded-full bg-[#bf5af2]/10 text-[#bf5af2] text-xs font-bold">
            Score {call.ai_score_global}/100
          </div>
        )}
      </div>

      {/* Scores */}
      <div className="space-y-2.5">
        {call.ai_score_accroche != null && <ScoreBar label="Accroche" score={call.ai_score_accroche} color="#30d158" />}
        {call.ai_score_objection != null && <ScoreBar label="Objection" score={call.ai_score_objection} color="#ff9f0a" />}
        {call.ai_score_closing != null && <ScoreBar label="Closing" score={call.ai_score_closing} color="#0071e3" />}
      </div>

      {/* Resume */}
      {call.ai_summary && Array.isArray(call.ai_summary) && call.ai_summary.length > 0 && (
        <div className={`p-3 rounded-xl ${isDark ? 'bg-[#0071e3]/[0.06]' : 'bg-blue-50'} border border-[#0071e3]/10`}>
          <p className="text-[10px] font-bold text-[#0071e3] uppercase tracking-wider mb-2">Resume</p>
          {call.ai_summary.map((line, i) => (
            <p key={i} className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1 flex gap-2`}>
              <span className="text-[#0071e3]">—</span>{line}
            </p>
          ))}
        </div>
      )}

      {/* Transcript */}
      {call.ai_transcript && (
        <div>
          <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider mb-2">Transcription</p>
          <div className={`max-h-40 overflow-y-auto text-xs leading-relaxed p-3 rounded-xl ${isDark ? 'bg-[#2c2c2e]' : 'bg-gray-50'}`}>
            {call.ai_transcript.split('\n').map((line, i) => (
              <p key={i} className={`mb-1 ${line.startsWith('Speaker 0') ? 'text-[#0071e3]' : isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
