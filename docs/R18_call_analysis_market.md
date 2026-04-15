# R18 — Marché Analyse d'Appels : Tous les acteurs

## Cartographie complète

### Tier 1 — Conversation Intelligence SaaS (tout-en-un)

| Plateforme | Prix | Cible | Force |
|------------|------|-------|-------|
| **Gong** | $1200-1600/user/an | Enterprise | Reference marché, revenue intelligence |
| **Chorus (ZoomInfo)** | ~$1000/user/an | Enterprise | Intégration ZoomInfo |
| **Modjo** | Custom | Europe/FR | RGPD natif, équipes FR |
| **Nooks** | Custom | SDR outbound | AI coaching + parallel dialer |
| **Revenue.io** | Custom | Salesforce | Real-time coaching live |
| **Balto** | Custom | Call centers | Prompts live pendant l'appel |
| **Cresta** | Custom | Inbound/outbound | Coaching conversationnel |
| **Salesify.ai** | ~$30/user/mois | PME | Simple et pas cher |

### Tier 2 — APIs Conversation Intelligence (pour builders)

| API | Ce qu'elle fait | Prix |
|-----|-----------------|------|
| **Symbl.ai Call Score** | Scoring automatique customisable | Pay-per-use |
| **Symbl.ai** (general) | Transcription + topics + actions + sentiment + résumé | Pay-per-use |
| **AssemblyAI LeMUR** | Résumé + Q&A + actions sur transcription via LLM | Inclus dans AssemblyAI |

### Tier 3 — Build-it-yourself (notre approche)

| Composant | Option | Prix |
|-----------|--------|------|
| Transcription | Deepgram / Gladia / WhisperX | $0.007-0.009/min ou gratuit |
| Analyse LLM | Claude / GPT-4 / Mistral / Llama | $0.01-0.05/appel |
| Scoring | Prompt engineering custom | Inclus dans l'appel LLM |
| Pipeline | Edge Function + queue | Gratuit (Supabase) |

**Coût total build-yourself : ~$0.02-0.06 par appel analysé**
vs Gong : ~$5-7 par appel (basé sur $1400/user/an, ~20 calls/jour)

### Tier 4 — Open source / Gratuit

| Projet | Description |
|--------|-------------|
| **OpenClaw** | Orchestrateur open source pour build un Gong-like |
| **Whisper + LLM local** | 100% self-hosted, zero coût API |

## Analyse pour Calsyn

### Ce dont on a besoin
1. **Scoring** : accroche, objection, closing (0-100)
2. **Résumé** : 3-5 bullet points clés
3. **Intention prospect** : intéressé, hésitant, refus, etc.
4. **Prochaine étape** : suggestion d'action
5. **Points forts / à améliorer** : coaching auto

### Options évaluées

**Option A : Claude API**
- $0.003/1K input tokens + $0.015/1K output (Sonnet)
- ~$0.01-0.03 par appel de 5min
- Structured output JSON natif
- Excellent en français
- On contrôle le prompt, le scoring, tout

**Option B : Symbl.ai Call Score**
- API clé-en-main pour le scoring
- Moins customisable
- Pricing opaque
- Dépendance tierce pour le scoring

**Option C : GPT-4o mini**
- $0.00015/1K input tokens (10x moins cher que Claude Sonnet)
- Qualité suffisante pour du scoring
- Structured output JSON
- Alternative économique

**Option D : LLM self-hosted (Llama 3, Mistral)**
- Gratuit (+ serveur GPU ~$50/mois)
- Moins bon en structured output que Claude/GPT
- Plus de maintenance
- Viable quand on aura du volume

## Decision
- **MVP** : Claude API (Sonnet) — on connait, excellent FR, structured output fiable
- **Abstraction** : interface `AnalysisProvider` (comme CallProvider et TranscriptionProvider)
- **Fallback budget** : GPT-4o mini si les crédits Claude sont trop chers
- **Long terme** : Symbl.ai Call Score OU LLM self-hosted pour scale
- **raw_output** : toujours stocker la réponse brute du LLM pour re-traitement

Sources :
- https://marketbetter.ai/blog/ai-sales-meeting-transcription-free-gong-alternative/
- https://symbl.ai/platform/generative-apis/call-score/
- https://www.assemblyai.com/blog/conversation-intelligence-software
- https://www.revenue.io/blog/best-gong-alternatives-and-competitors-in-2025
