export type Role = 'super_admin' | 'admin' | 'manager' | 'sdr'

export interface Organisation {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'growth' | 'scale'
  max_sdrs: number
  is_active: boolean
  voice_provider: 'twilio' | 'telnyx'
  from_number: string | null
  credit_balance: number
  credit_reserved: number
  recording_compliance: boolean
}

export interface Profile {
  id: string
  organisation_id: string
  email: string
  full_name: string | null
  role: Role
  is_active: boolean
}
