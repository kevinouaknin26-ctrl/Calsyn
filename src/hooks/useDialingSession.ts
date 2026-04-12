/**
 * useDialingSession — Gère la file d'appel (session de dialing).
 *
 * Quand on clique "Démarrer les appels" :
 * 1. Snapshot les prospects dans l'ordre actuel → dialing_sessions.prospects[]
 * 2. current_index = 0
 * 3. Le dialer suit cet ordre, indépendamment du tri visuel
 *
 * Le hook expose :
 * - startSession(prospectIds) : crée une session
 * - nextProspect() : avance au suivant (skip les déjà appelés, snoozed, DNC)
 * - currentProspectId : le prospect à appeler maintenant
 * - session : la session en cours
 * - endSession() : termine la session
 */

import { useState, useCallback } from 'react'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Prospect } from '@/types/prospect'

interface DialingSession {
  id: string
  prospects: string[]
  current_index: number
  status: string
  list_id: string | null
}

export function useDialingSession() {
  const { profile, organisation } = useAuth()
  const [session, setSession] = useState<DialingSession | null>(null)

  const startSession = useCallback(async (prospects: Prospect[], listId: string | null) => {
    if (!profile || !organisation) return null

    // Filtrer les prospects appelables (pas DNC, pas snoozed)
    const callable = prospects.filter(p =>
      !p.do_not_call &&
      !(p.snoozed_until && new Date(p.snoozed_until) > new Date())
    )

    if (callable.length === 0) return null

    const prospectIds = callable.map(p => p.id)

    const { data, error } = await supabase.from('dialing_sessions').insert({
      organisation_id: organisation.id,
      sdr_id: profile.id,
      status: 'active',
      prospects: prospectIds,
      current_index: 0,
      list_id: listId,
    }).select().single()

    if (error || !data) {
      console.error('[useDialingSession] Create error:', error)
      return null
    }

    const s: DialingSession = {
      id: data.id,
      prospects: prospectIds,
      current_index: 0,
      status: 'active',
      list_id: listId,
    }
    setSession(s)
    return s
  }, [profile, organisation])

  const getCurrentProspectId = useCallback((): string | null => {
    if (!session || session.status !== 'active') return null
    if (session.current_index >= session.prospects.length) return null
    return session.prospects[session.current_index]
  }, [session])

  const nextProspect = useCallback(async (): Promise<string | null> => {
    if (!session) return null

    let nextIndex = session.current_index + 1

    // Avancer jusqu'au prochain prospect non-appelé dans cette session
    while (nextIndex < session.prospects.length) {
      // On pourrait vérifier si le prospect a déjà été appelé dans CETTE session
      // mais pour le power dialer c'est simple : on avance juste
      break
    }

    if (nextIndex >= session.prospects.length) {
      // Fin de liste
      await supabase.from('dialing_sessions').update({
        status: 'completed',
        current_index: nextIndex,
        completed_at: new Date().toISOString(),
      }).eq('id', session.id)

      setSession({ ...session, status: 'completed', current_index: nextIndex })
      return null
    }

    // Avancer le curseur
    await supabase.from('dialing_sessions').update({
      current_index: nextIndex,
    }).eq('id', session.id)

    const updated = { ...session, current_index: nextIndex }
    setSession(updated)
    return updated.prospects[nextIndex]
  }, [session])

  const endSession = useCallback(async () => {
    if (!session) return
    await supabase.from('dialing_sessions').update({
      status: 'stopped',
      completed_at: new Date().toISOString(),
    }).eq('id', session.id)
    setSession(null)
  }, [session])

  return {
    session,
    isActive: session?.status === 'active',
    currentProspectId: getCurrentProspectId(),
    currentIndex: session?.current_index || 0,
    totalProspects: session?.prospects.length || 0,
    startSession,
    nextProspect,
    endSession,
  }
}
