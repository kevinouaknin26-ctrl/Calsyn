# R30 — Modèle Pricing SaaS Dialer

## Marché actuel (2026)

### Pricing des concurrents
| Plateforme | Prix | Modèle | Cible |
|------------|------|--------|-------|
| **Nooks** | $5000/user/an ($417/mois) | Per seat annuel | Enterprise SDR teams 15+ |
| **Orum** | $5000/user/an ($417/mois) | Per seat annuel, 3 min | Enterprise SDR teams 15+ |
| **Salesfinity** | ~$150-200/user/mois | Per seat | Mid-market |
| **Aircall** | $70/user/mois + options | Per seat + per minute IA | PME |
| **CloudTalk** | $25-50/user/mois | Per seat tiered | PME/Startups |
| **Minari** | Custom (startup FR) | Per seat | SDR FR |
| **JustCall** | $30-60/user/mois | Per seat tiered | Startups |

### Modèles observés
1. **Per seat/mois** (dominant) : $25-500/user/mois selon features
2. **Per minute** (rare, surtout pour l'IA) : $0.05-0.50/min pour voice AI
3. **Hybrid** : seat + minutes téléphonie + minutes IA

## Notre positionnement Callio

### Cible
- PME françaises / EU avec 1-15 SDR
- Trop petit pour Nooks/Orum ($5K/user = overkill)
- Trop sérieux pour JustCall (pas de parallel, pas d'IA coaching)
- Le "Aircall qui fait du parallel + IA coaching"

### Pricing proposé

#### Starter — 49€/user/mois
- Mono-line dialer
- Recording + transcription
- Analyse IA basique (scoring, résumé)
- 1 numéro de téléphone
- Historique illimité

#### Growth — 99€/user/mois
- Tout Starter +
- Parallel dialing (jusqu'à 5 lignes)
- AMD intelligent
- Coaching IA avancé (points forts/faibles, tendances)
- Numéros illimités
- Dashboard manager

#### Scale — 199€/user/mois
- Tout Growth +
- Monitoring live (écoute/whisper/barge)
- API custom
- Intégrations CRM (Salesforce, HubSpot)
- Support prioritaire
- Analytics avancés

### Coûts réels par appel
| Composant | Coût |
|-----------|------|
| Twilio/Telnyx minute | ~$0.007-0.013 |
| Deepgram transcription | ~$0.007/min |
| Claude analyse | ~$0.02/appel |
| Supabase hosting | ~$25/mois (pro) |
| **Total par appel 3min** | **~$0.06-0.08** |

### Marge
- Un SDR fait ~50 appels/jour = ~$3-4/jour de coûts
- A 49€/mois (~$55) : marge ~$55 - $80 = **négatif au starter si > 50 calls/jour**
- A 99€/mois (~$110) : marge ~$110 - $80 = **~$30/user/mois**
- Solution : minutes téléphonie en supplément au-delà d'un seuil (1000 min/mois incluses)

## Decision
- 3 tiers : Starter (49€), Growth (99€), Scale (199€)
- Minutes téléphonie : 1000 min incluses, puis $0.02/min
- L'analyse IA est le vrai différenciant (pas la téléphonie)
- MVP : pas de pricing, Kevin est le seul user. On fixera les prix après les 10 premiers clients.

Sources :
- https://www.klenty.com/blog/parallel-dialer-software/
- https://aloware.com/blog/the-8-best-sales-dialers
- https://prospeo.io/s/parallel-dialer
- https://salesfinity.ai/blog/orum-vs-nooks
