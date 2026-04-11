export type Disposition =
  | 'connected'
  | 'rdv'
  | 'callback'
  | 'not_interested'
  | 'no_answer'
  | 'voicemail'
  | 'busy'
  | 'wrong_number'
  | 'dnc'

export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'error'

export interface Call {
  id: string
  organisation_id: string
  sdr_id: string
  prospect_id: string | null
  prospect_name: string | null
  prospect_phone: string | null
  call_sid: string | null
  conference_sid: string | null
  call_outcome: Disposition | null
  call_duration: number
  note: string | null
  meeting_booked: boolean
  recording_url: string | null
  provider: 'twilio' | 'telnyx' | 'manual'
  audio_quality_mos: number | null
  from_number: string | null
  list_id: string | null
  ai_analysis_status: AnalysisStatus
  ai_transcript: string | null
  ai_summary: string[] | null
  ai_score_global: number | null
  ai_score_accroche: number | null
  ai_score_objection: number | null
  ai_score_closing: number | null
  ai_analyzed_at: string | null
  created_at: string
}
