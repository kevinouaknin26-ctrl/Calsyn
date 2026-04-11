# R31 — Analyse Concurrence Dialers 2026

## Cartographie complète

### Enterprise ($300-500/user/mois)
| | Parallel | AI Coaching | Mono-line | Points forts | Points faibles |
|---|---|---|---|---|---|
| **Nooks** | 5 lignes | Oui (roleplay IA) | Oui | Coaching + prospecting intégrés | Très cher, US only |
| **Orum** | 7 lignes | Oui | Oui | Plus de lignes, detect. IA | Très cher, 3 seats min |
| **Koncert** | 5+ lignes | Oui | Oui | Enterprise features | Ancien, UI datée |

### Mid-Market ($100-200/user/mois)
| | Parallel | AI Coaching | Mono-line | Points forts | Points faibles |
|---|---|---|---|---|---|
| **Salesfinity** | Oui (SmartFlow) | Basique | Oui | Prix raisonnable, SmartFlow intelligent | Moins de features que Nooks |
| **Minari** | Oui | Basique | Oui | Startup FR, UX moderne | Jeune, moins de features |
| **Aloware** | Power dialer | Basique | Oui | Prix accessible | Pas de vrai parallel |

### PME/Startups ($25-100/user/mois)
| | Parallel | AI Coaching | Mono-line | Points forts | Points faibles |
|---|---|---|---|---|---|
| **Aircall** | Non | Addon $9/user | Oui | Fiable, intégrations | Pas de parallel, cher en options |
| **CloudTalk** | Power dialer | Basique | Oui | Bon rapport qualité/prix | Pas de vrai parallel |
| **JustCall** | Power dialer | Basique | Oui | Simple, pas cher | Limité |
| **PhoneBurner** | Power dialer | Non | Oui | Spécialisé dialing | Vieille école |

### Gratuit / Open source
| | Description |
|---|---|
| **PowerDialer.ai** | Free power dialer pour Twilio/Flex |
| **OpenPhone** | Pas vraiment un dialer mais VoIP simple |

## Données clés du marché

### Performance parallel vs mono-line
- **Parallel** : 15-20 conversations/heure MAIS taux conversion 3.8%
- **Mono-line (power)** : 4-6 conversations/heure MAIS taux conversion 6.4%
- **Parallel talk time** : 4-5 min en moyenne
- **Mono-line talk time** : 9-11 min en moyenne

→ Le parallel génère plus de volume mais moins de qualité par call

### Ce que font les leaders qu'on ne fait pas (encore)
1. **AI Roleplay** (Nooks) : simuler des appels pour entraîner les SDR
2. **SmartFlow** (Salesfinity) : scoring prospects pour prioriser l'ordre d'appel
3. **CRM intégration native** (Orum) : Salesforce, HubSpot en 1 clic
4. **Salesfloor** (Nooks) : virtual office pour équipes remote

## Notre positionnement Callio

### Ce qu'on fait MIEUX
- **Prix** : 49-99€ vs 250-500€ chez les leaders
- **Dual-provider** : Twilio + Telnyx (pas de lock-in)
- **IA coaching intégré** : Deepgram + Claude (pas un addon payant)
- **Recording + transcription + scoring** inclus dans tous les plans
- **Conçu pour le marché FR/EU** : RGPD-ready, numéros FR, accents FR

### Ce qu'on ne fait PAS (MVP)
- Pas de CRM intégration (V2.1)
- Pas d'AI Roleplay (V3)
- Pas de Salesfloor (pas notre cible)
- Pas d'intégration calendrier (V2.1 — mais on sait le faire via Google Calendar MCP)

### Notre avantage compétitif réel
On est les seuls à proposer :
1. **Parallel dialing + IA coaching** à moins de 100€/mois
2. **Multi-provider VoIP** (choix entre Twilio et Telnyx)
3. **Marché FR** avec conformité RGPD intégrée

## Decision
- Positionnement : "Le Minari accessible" — parallel + IA à prix PME
- Cible initiale : SDR solo et petites équipes FR (1-5 personnes)
- Différenciation : prix + IA intégrée + multi-provider
- Pas de feature creep : mono-line + parallel + IA coaching = suffisant pour le MVP
