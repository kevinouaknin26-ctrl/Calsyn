export type ProspectStatus =
  | 'idle'
  | 'calling'
  | 'connected'
  | 'to_callback'
  | 'interested'
  | 'not_reached'
  | 'refused'
  | 'converted'

/** Statut CRM personnalisable (indépendant du call status) */
export type CrmStatus =
  | 'new'
  | 'open'
  | 'in_progress'
  | 'open_deal'
  | 'unqualified'
  | 'attempted_to_contact'
  | 'connected'
  | 'bad_timing'
  | 'not_interested'
  | 'callback'
  | 'rdv_pris'
  | 'rdv_fait'
  | 'en_attente_signature'
  | 'signe'
  | 'en_attente_paiement'
  | 'paye'
  | 'mail_sent'

export interface Prospect {
  id: string
  list_id: string
  organisation_id: string
  name: string
  phone: string
  phone2: string | null
  phone3: string | null
  phone4: string | null
  phone5: string | null
  email: string | null
  company: string | null
  title: string | null
  sector: string | null
  linkedin_url: string | null
  website_url: string | null
  status: ProspectStatus
  crm_status: CrmStatus
  call_count: number
  last_call_at: string | null
  last_call_outcome: string | null
  snoozed_until: string | null
  rdv_date: string | null
  do_not_call: boolean
  meeting_booked: boolean
  address: string | null
  city: string | null
  postal_code: string | null
  country: string | null
  notes: string | null
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
