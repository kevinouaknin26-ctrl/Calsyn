/**
 * useGmail — appels API vers la edge function gmail.
 */

import { useCallback } from 'react'
import { supabase } from '@/config/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export interface GmailThread {
  id: string
  snippet: string
  subject: string
  from: string
  to: string
  date: string
  messageCount: number
  unread: boolean
}

export interface GmailMessage {
  id: string
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  body: string
}

export function useGmail() {
  const listThreads = useCallback(async (q: string, maxResults = 50): Promise<{ threads?: GmailThread[]; error?: string }> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'No session' }
    const params = new URLSearchParams({ action: 'list', q, maxResults: String(maxResults) })
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gmail?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    return res.json()
  }, [])

  const getThread = useCallback(async (id: string): Promise<{ id?: string; messages?: GmailMessage[]; error?: string }> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'No session' }
    const params = new URLSearchParams({ action: 'thread', id })
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gmail?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    return res.json()
  }, [])

  const sendEmail = useCallback(async (input: { to: string; subject: string; body: string; threadId?: string; signatureImageUrl?: string }): Promise<{ ok?: boolean; messageId?: string; threadId?: string; error?: string }> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'No session' }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gmail?action=send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return res.json()
  }, [])

  return { listThreads, getThread, sendEmail }
}
