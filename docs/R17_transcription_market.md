# R17 — Marché Transcription : Tous les acteurs

## Cartographie complète (STT pour appels commerciaux)

### Tier 1 — APIs Cloud spécialisées voix

| Provider | Modèle | Prix | Latence | FR | Diarization | Force |
|----------|--------|------|---------|-----|-------------|-------|
| **Deepgram** | Nova-3 | $0.0077/min | < 300ms | Oui | Oui | Latence + scale |
| **AssemblyAI** | Universal-3 | $0.0075/min | ~500ms | Oui (batch) | Oui | Précision entités (noms, tel) |
| **Gladia** | Solaria-1 | ~$0.009/min | 103ms | EXCELLENT (fondateur FR) | Inclus | Français natif, code-switching |
| **Speechmatics** | - | Enterprise | ~150ms | Oui | Oui | On-prem, compliance |
| **Rev.ai** | - | $0.002/min | Standard | Oui | Oui | Le moins cher |
| **Soniox** | - | Custom | Très bas | Oui | Oui | 60+ langues streaming |

### Tier 2 — Big Cloud (+ cher, - spécialisé)

| Provider | Prix | Force | Faiblesse |
|----------|------|-------|-----------|
| **Google Cloud STT** | $0.016/min | 125+ langues | Cher, config complexe |
| **AWS Transcribe** | $0.024/min | Intégration AWS | Le plus cher |
| **Azure Speech** | $0.016/min | Intégration Microsoft | Config complexe |

### Tier 3 — Self-hosted (gratuit + compute)

| Solution | Vitesse | Qualité | Diarization | Note |
|----------|---------|---------|-------------|------|
| **Whisper (OpenAI)** | 1x realtime | Excellent | Non | Base de reference |
| **faster-whisper** | 4x plus rapide | Idem | Non | CTranslate2, moins de RAM |
| **insanely-fast-whisper** | 30x realtime | Idem | Non | GPU nécessaire |
| **WhisperX** | Rapide | Idem | OUI | Timestamps + speakers |

### Tier 4 — Plateformes Voice AI (tout-en-un)

| Plateforme | Prix | Ce qu'elle fait |
|------------|------|----------------|
| **Vapi** | $0.05/min + providers | Orchestration voice agent |
| **Retell AI** | $0.07/min all-in | Voice agent avec telephonie incluse |
| **Bland AI** | $0.11-0.14/min | Outbound volume, 1M calls simultanés |

## Analyse pour Calsyn

### Ce dont on a besoin
1. Transcription post-call (pas realtime pour le MVP)
2. Speaker diarization (qui parle = agent vs prospect)
3. Bon français (accents, vocabulaire art/commercial)
4. Prix minimal (Kevin a 0€)

### Short-list

**Option A : Deepgram Nova-3** — $0.0077/min
- Le meilleur rapport qualité/prix
- Excellent en phone call audio
- Diarization incluse
- API simple

**Option B : Gladia Solaria-1** — ~$0.009/min
- Fondé par un Français (optimisé FR)
- Diarization + timestamps inclus
- Code-switching natif (utile si appels mixtes FR/EN)

**Option C : AssemblyAI Universal-3** — $0.0075/min
- Meilleure précision sur les entités (noms, numéros)
- Features bonus : sentiment, topics, PII redaction
- Speaker diarization en option (+$0.002/min)

**Option D : WhisperX self-hosted** — GRATUIT (+ serveur)
- Zero coût API
- Diarization intégrée
- Nécessite un serveur avec GPU ($20-50/mois)
- Plus de contrôle, plus de maintenance

**Option E : Whisper API (OpenAI)** — $0.006/min
- Le moins cher des APIs
- Bonne qualité
- PAS de diarization (dealbreaker ?)

## Decision
- **MVP** : Deepgram Nova-3 (meilleur rapport qualité/prix, diarization incluse)
- **Alternative si budget 0** : WhisperX self-hosted sur un petit serveur GPU
- **Abstraction** : interface `TranscriptionProvider` comme pour CallProvider
- **Long terme** : comparer Deepgram vs Gladia sur des vrais appels FR et garder le meilleur

Sources :
- https://deepgram.com/learn/best-speech-to-text-apis-2026
- https://www.gladia.io/blog/best-speech-to-text-apis
- https://futureagi.com/blog/speech-to-text-apis-in-2026-benchmarks-pricing-developer-s-decision-guide
- https://modal.com/blog/choosing-whisper-variants
