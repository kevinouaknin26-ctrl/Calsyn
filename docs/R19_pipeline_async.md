# R19 — Pipeline Async Transcription → Analyse

## Architecture complète

```
Appel termine
     │
     ▼
Twilio/Telnyx webhook "completed"
     │
     ▼
Edge Function "status-callback" (< 1s)
  → INSERT calls (call_sid, duration, status)
  → UPDATE prospects (call_count, last_call_at)
  → Return 200 immediatement
     │
     ▼
Twilio/Telnyx webhook "recording-ready" (~5-30s apres)
     │
     ▼
Edge Function "recording-callback" (< 1s)
  → UPDATE calls SET recording_url
  → INSERT analysis_jobs (call_id, recording_url, status: pending)
  → Return 200 immediatement
     │
     ▼
pg_cron poll toutes les 10s
     │
     ▼
Edge Function "process-analysis" (worker)
  ├── 1. Lire le job pending le plus ancien
  ├── 2. Marquer "processing"
  ├── 3. Appeler TranscriptionProvider.transcribe(recording_url)
  │      (Deepgram/Gladia/Whisper — 5-60s selon durée)
  ├── 4. Appeler AnalysisProvider.analyze(transcript)
  │      (Claude/GPT — 3-10s)
  ├── 5. UPDATE calls SET ai_transcript, ai_scores, ai_analysis_status='completed'
  ├── 6. UPDATE analysis_jobs SET status='completed', raw_output=...
  └── 7. Supabase Realtime notifie le frontend → scores visibles
```

## Gestion des erreurs

```
Si echec step 3 (transcription) :
  → analysis_jobs.status = 'error'
  → analysis_jobs.error_message = 'Transcription failed: ...'
  → analysis_jobs.attempts += 1
  → Si attempts < 3 : le job redevient visible dans la queue (retry auto)
  → Si attempts >= 3 : abandonner, marquer calls.ai_analysis_status = 'error'

Si echec step 4 (analyse LLM) :
  → Stocker le transcript quand meme (on l'a deja)
  → Retry analyse seulement (pas re-transcrire)
  → Meme logique 3 tentatives

Si echec step 5 (save DB) :
  → Log l'erreur
  → Retry automatique (la queue gere)
```

## Interfaces d'abstraction

```typescript
// TranscriptionProvider
interface TranscriptionResult {
  text: string
  utterances: Array<{ speaker: string; text: string; start: number; end: number }>
  duration_seconds: number
  language: string
}

interface TranscriptionProvider {
  transcribe(audioUrl: string, options?: { language?: string }): Promise<TranscriptionResult>
}

// AnalysisProvider
interface CallAnalysis {
  summary: string[]
  score_global: number       // 0-100
  score_accroche: number     // 0-100
  score_objection: number    // 0-100
  score_closing: number      // 0-100
  points_forts: string[]
  points_amelioration: string[]
  intention_prospect: string
  prochaine_etape: string
}

interface AnalysisProvider {
  analyze(transcript: string, context?: { prospect_name?: string; sector?: string }): Promise<CallAnalysis>
}
```

## Webhook AssemblyAI vs Polling

Pour le MVP avec le pattern queue :
- **Polling dans le worker** : le worker poll AssemblyAI/Deepgram en boucle
  - Simple, pas besoin d'URL publique pour recevoir le webhook
  - Mais consomme du CPU (check toutes les 3s)

- **Webhook AssemblyAI** : ils envoient un POST quand c'est pret
  - Plus efficace (pas de polling)
  - Mais nécessite une Edge Function publique supplémentaire
  - Complexifie le flow

**Decision** : Deepgram retourne le resultat en une seule requete (pas de polling).
Si on utilise AssemblyAI : webhook callback vers une Edge Function dediee.

## Decision
- Pipeline 100% async via queue (pgmq ou table analysis_jobs)
- Worker Edge Function declenche par pg_cron toutes les 10s
- 3 tentatives max avec retry automatique
- Transcription et analyse decouplees (retry independant)
- raw_output stocke pour chaque job
- Abstractions TranscriptionProvider + AnalysisProvider
- Deepgram en premier (resultat instantane, pas de polling)
