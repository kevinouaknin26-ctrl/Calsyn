/**
 * useGoogleCalendar — hook partagé pour la connexion + création d'évents.
 * Utilisé par Calendar.tsx (UI complète) et ProspectModal (sync au save de tâche).
 */

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export function useGoogleCalendar() {
  const { data: status, refetch } = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return { connected: false }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/google-auth?action=status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      return res.json()
    },
  })

  const connect = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`${SUPABASE_URL}/functions/v1/google-auth?action=authorize`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    if (data.url) {
      window.open(data.url, 'google-auth', 'width=500,height=600,left=200,top=100')
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'google-calendar-connected') {
          refetch()
          window.removeEventListener('message', handler)
        }
      }
      window.addEventListener('message', handler)
    }
  }, [refetch])

  const disconnect = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`${SUPABASE_URL}/functions/v1/google-auth?action=disconnect`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    refetch()
  }, [refetch])

  const listEvents = useCallback(async (timeMin: string, timeMax: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const params = new URLSearchParams({ action: 'list', timeMin, timeMax })
    const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) return null
    return res.json()
  }, [])

  const createEvent = useCallback(async (event: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar?action=create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    })
    if (!res.ok) return null
    return res.json()
  }, [])

  return { connected: status?.connected || false, connect, disconnect, listEvents, createEvent }
}
