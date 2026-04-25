export type Role = 'super_admin' | 'admin' | 'manager' | 'sdr'
export type CallLicense = 'parallel' | 'power' | 'none'

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  sdr: 'SDR',
}

export const ROLE_COLORS: Record<Role, string> = {
  super_admin: '#ef4444',
  admin: '#0ea5e9',
  manager: '#8b5cf6',
  sdr: '#059669',
}

export const LICENSE_LABELS: Record<CallLicense, string> = {
  parallel: 'Parallel dialer',
  power: 'Power dialer',
  none: 'Aucune',
}

export const LICENSE_COLORS: Record<CallLicense, string> = {
  parallel: '#8b5cf6',
  power: '#0ea5e9',
  none: '#9ca3af',
}

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
  max_parallel_seats: number
  max_power_seats: number
  // Paramètres dialer avancés (colonnes existantes en DB)
  dialer_mode?: 'parallel' | 'power' | null
  ai_coaching_enabled?: boolean
  ai_custom_prompt?: string | null
  conversation_threshold?: number
  max_call_attempts?: number | string | null
  attempt_period?: string | null
  parallel_calls?: number
  auto_rotate_numbers?: boolean
  voicemail_drop?: boolean
  callback_mode?: string | null
  callback_redirect_number?: string | null
  deleted_at?: string | null
}

export interface Profile {
  id: string
  organisation_id: string
  email: string
  full_name: string | null
  role: Role
  is_active: boolean
  /** Deprecated — use assigned_phones[]. Kept for backward-compat reads. */
  assigned_phone: string | null
  /** Pool de numéros Twilio attribués à ce user (rotation anti-spam intra-user). */
  assigned_phones: string[]
  /** Mode dialer autorisé : un seul à la fois par user. */
  call_license: CallLicense
  /** Soft delete / suspend. null = actif. */
  deactivated_at: string | null
  /** HH:MM:SS format Postgres time. */
  work_hours_start: string
  work_hours_end: string
  /** 0 = illimité. */
  max_calls_per_day: number
  last_seen_at: string | null
  /** Expiration du lien d'invitation (null = lien consommé ou jamais envoyé). */
  invite_expires_at: string | null
  /** Path Storage bucket 'voicemails' — message de messagerie vocale perso (mp3/webm). null = pas de message enregistré. */
  voicemail_url: string | null
  /** Fallback texte (joué via Polly.Lea-Neural) si pas d'audio enregistré. null = message générique. */
  voicemail_text: string | null
  /** Signature appendée automatiquement aux emails envoyés depuis Calsyn. Plain text. */
  email_signature: string | null
  /** URL publique d'une image de signature (logo + coordonnées). Ajoutée en HTML au mail. */
  email_signature_image_url: string | null
  /** Durée d'un créneau RDV en minutes (défaut 30). */
  slot_duration_min: number | null
  /** Pause entre 2 RDV en minutes (défaut 0). */
  slot_buffer_min: number | null
  /** Horaires disponibles par jour de semaine (0=dim..6=sam) → liste de périodes. */
  availability_schedule: Record<string, Array<{ start: string; end: string }>> | null
  created_at: string
}

/** Statut dérivé pour l'UI. */
export function getUserStatus(p: Profile, authEmailConfirmed: boolean | null): 'active' | 'pending' | 'suspended' {
  if (p.deactivated_at) return 'suspended'
  if (authEmailConfirmed === false) return 'pending'
  return 'active'
}
