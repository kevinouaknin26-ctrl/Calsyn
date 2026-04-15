# R12 — Supabase Edge Functions : limites et best practices

## Limites critiques
- **CPU Time** : 2s max par requete (pas le wall time — juste le CPU)
- **Wall clock timeout** : 150s (idle timeout avant 504)
- **Execution limit** : 60s max
- **Bundle size** : 20MB max
- **Cold start** : median 400ms (premier appel/heure), hot 125ms

## Implications pour Calsyn

### call-webhook (TwiML) — ULTRA CRITIQUE
- Twilio attend une reponse TwiML en < 5s sinon silence au decroche
- Cold start 400ms + traitement = dangereux
- **Regle** : ZERO import lourd. Pas de `import twilio`, pas de Supabase client
- Juste du string XML brut. La fonction la plus legere possible.
- Pas de DB, pas de validation complexe — juste retourner le TwiML

### analyze-call — IMPOSSIBLE EN EDGE FUNCTION SYNCHRONE
- Transcription AssemblyAI : 30s-5min de polling
- Analyse Claude : 5-15s
- Total : depasse les 60s d'execution
- **Solution** : Queue pattern (pgmq + pg_cron + Edge Function worker)

### Autres fonctions (token-gen, save-call, status-callback)
- Rapides (< 2s), pas de probleme de timeout
- Utiliser le Supabase client normalement

## Pattern recommande
```
Webhook rapide (< 1s) :
  → Valider signature
  → INSERT dans DB / queue
  → Return 200 immediatement

Worker async (via cron) :
  → pg_cron poll la queue toutes les 10s
  → Edge Function "process-analysis" traite 1 job a la fois
  → Pas de timeout car chaque invocation est courte
```

## Decision
- call-webhook : ultra-leger, zero import
- status-callback / recording-callback : rapide, INSERT + return 200
- analyze-call : devenir un worker async via pgmq + pg_cron
- token-gen / save-call : standard, Supabase client OK
