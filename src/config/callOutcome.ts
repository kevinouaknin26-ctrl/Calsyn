/**
 * Priorité des statuts d'appel (Minari-exact).
 * Le statut du prospect = le MEILLEUR outcome parmi TOUS ses appels.
 * Ne descend JAMAIS automatiquement — seul le commercial peut changer.
 */

export const OUTCOME_PRIORITY: Record<string, number> = {
  connected: 100,
  callback: 60,
  not_interested: 50,
  voicemail: 40,
  busy: 35,
  no_answer: 30,
  cancelled: 20,
  failed: 10,
  wrong_number: 5,
  dnc: 5,
}

/** Calcule le meilleur outcome parmi une liste d'appels */
export function computeBestOutcome(calls: Array<{ call_outcome: string | null }>): string {
  let best = ''
  let bestPriority = -1
  for (const call of calls) {
    const p = OUTCOME_PRIORITY[call.call_outcome || ''] || 0
    if (p > bestPriority) {
      bestPriority = p
      best = call.call_outcome || ''
    }
  }
  return best || 'no_answer'
}
