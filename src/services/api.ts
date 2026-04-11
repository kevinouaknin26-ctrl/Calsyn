/**
 * Wrapper pour appeler les Edge Functions Supabase.
 * Toute communication frontend → backend passe par ici.
 */

import { supabase } from '@/config/supabase'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

function getBaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL + '/functions/v1'
}

/** Appeler une Edge Function avec auth JWT */
export async function callEdgeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${getBaseUrl()}/${name}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Edge Function "${name}" failed (${res.status}): ${text}`)
  }

  return res.json()
}

/** Demander un token VoIP (Twilio ou Telnyx) */
export async function fetchVoiceToken(): Promise<string> {
  const data = await callEdgeFunction<{ token: string }>('token-gen')
  return data.token
}

/** Sauvegarder la disposition d'un appel */
export async function saveCallDisposition(params: {
  callSid: string | null
  conferenceSid: string | null
  prospectId: string | null
  duration: number | null
  disposition: string | null
  notes: string
  meetingBooked: boolean
}): Promise<{ id: string }> {
  return callEdgeFunction('save-call', params)
}
