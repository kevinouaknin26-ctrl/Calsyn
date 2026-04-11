export type ProspectStatus =
  | 'idle'
  | 'calling'
  | 'connected'
  | 'to_callback'
  | 'interested'
  | 'not_reached'
  | 'refused'
  | 'converted'

export interface Prospect {
  id: string
  list_id: string
  organisation_id: string
  name: string
  phone: string
  email: string | null
  company: string | null
  sector: string | null
  status: ProspectStatus
  call_count: number
  last_call_at: string | null
  snoozed_until: string | null
  created_at: string
}

export interface ProspectList {
  id: string
  organisation_id: string
  name: string
  assigned_to: string[]
  created_by: string | null
  created_at: string
}
