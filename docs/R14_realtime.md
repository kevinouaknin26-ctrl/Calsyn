# R14 — Supabase Realtime

## Quand on l'utilise dans Callio
1. **Pendant l'appel** : quand le webhook status-callback INSERT/UPDATE un call, le frontend recoit la notification en temps reel (callSid, status, recording_url)
2. **Analyse IA** : quand le worker complete l'analyse, le frontend recoit les scores sans polling
3. **Liste prospects** : quand un autre agent modifie un prospect, la liste se met a jour

## Pattern React
```typescript
useEffect(() => {
  const channel = supabase
    .channel('calls-realtime')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'calls',
      filter: `sdr_id=eq.${userId}`,
    }, (payload) => {
      // Mettre a jour le cache TanStack Query
      queryClient.setQueryData(['call', payload.new.id], payload.new)
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [userId])
```

## Integration avec TanStack Query
- Realtime met a jour le cache TanStack Query directement
- Pas besoin de refetch — le cache est mis a jour en push
- Le composant re-render automatiquement

## Limitations
- Chaque changement est verifie contre RLS (pas de fuite)
- A grande echelle, Broadcast est plus performant que postgres_changes
- Pour le MVP : postgres_changes suffit

## Decision
- Realtime pour : calls updates (status, recording, AI scores), prospects updates
- Integration via TanStack Query cache invalidation (pas de useState local)
- Cleanup systematique dans useEffect return
- Filtre par sdr_id ou organisation_id pour limiter le traffic
