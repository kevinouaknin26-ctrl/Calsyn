/**
 * AIAnalysis — Scores et resume IA, style Minari, francais.
 */

import type { Call } from '@/types/call'

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-20">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-100">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{ color }}>{score}</span>
    </div>
  )
}

export default function AIAnalysis({ call }: { call: Call | null }) {
  if (!call) return null

  if (call.ai_analysis_status === 'pending') {
    return <div className="bg-white rounded-xl border border-gray-200 p-5"><p className="text-sm text-gray-400">Analyse IA en attente...</p></div>
  }

  if (call.ai_analysis_status === 'processing') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-indigo-600 font-semibold">Transcription et analyse en cours...</p>
        </div>
      </div>
    )
  }

  if (call.ai_analysis_status === 'error') {
    return <div className="bg-white rounded-xl border border-gray-200 p-5"><p className="text-sm text-red-400">L'analyse a echoue.</p></div>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800">Analyse Calsyn IA</h3>
        {call.ai_score_global && (
          <div className="px-3 py-1 rounded-full bg-purple-50 text-purple-600 text-xs font-bold">Score {call.ai_score_global}/100</div>
        )}
      </div>

      <div className="space-y-2.5">
        {call.ai_score_accroche != null && <ScoreBar label="Accroche" score={call.ai_score_accroche} color="#059669" />}
        {call.ai_score_objection != null && <ScoreBar label="Objection" score={call.ai_score_objection} color="#f59e0b" />}
        {call.ai_score_closing != null && <ScoreBar label="Closing" score={call.ai_score_closing} color="#0ea5e9" />}
      </div>

      {call.ai_summary && Array.isArray(call.ai_summary) && call.ai_summary.length > 0 && (
        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
          <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-2">Resume</p>
          {call.ai_summary.map((line, i) => (
            <p key={i} className="text-xs text-gray-600 mb-1 flex gap-2"><span className="text-indigo-500">—</span>{line}</p>
          ))}
        </div>
      )}

      {call.ai_transcript && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Transcription</p>
          <div className="max-h-40 overflow-y-auto text-xs leading-relaxed p-3 rounded-xl bg-gray-50">
            {call.ai_transcript.split('\n').map((line, i) => (
              <p key={i} className={`mb-1 ${line.startsWith('Speaker 0') ? 'text-indigo-600' : 'text-gray-500'}`}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
