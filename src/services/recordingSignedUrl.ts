/**
 * Client helper qui fetch une URL signée courte pour lire un recording Twilio.
 *
 * Le `<audio>` HTML natif ne peut pas envoyer de header Authorization, et le
 * proxy côté serveur refuse l'accès sans JWT Bearer. Solution : on appelle
 * d'abord la function `recording-sign` avec le Bearer, qui vérifie l'ownership
 * et retourne une URL signée HMAC valide 10 min, utilisable directement dans
 * `<audio src=...>` ou `fetch(url)` sans headers.
 *
 * Un petit cache en mémoire évite de spammer la function à chaque render.
 */

import { supabase } from '@/config/supabase'

interface CacheEntry {
  url: string
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const SAFETY_MARGIN_SECONDS = 60

export async function getSignedRecordingUrl(recordingUrl: string): Promise<string | null> {
  if (!recordingUrl || !recordingUrl.includes('twilio.com')) return null

  const match = recordingUrl.match(/\/Recordings\/(RE[a-f0-9]+)/i)
  if (!match) return null
  const sid = match[1]

  const now = Math.floor(Date.now() / 1000)
  const cached = cache.get(sid)
  if (cached && cached.expiresAt - SAFETY_MARGIN_SECONDS > now) {
    return cached.url
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/recording-sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ recording_url: recordingUrl }),
    })
    if (!res.ok) {
      console.warn('[recording-signed-url] sign failed', res.status)
      return null
    }
    const { url, expires_at } = await res.json() as { url: string; expires_at: number }
    cache.set(sid, { url, expiresAt: expires_at })
    return url
  } catch (err) {
    console.warn('[recording-signed-url] network error', err)
    return null
  }
}
