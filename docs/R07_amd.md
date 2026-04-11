# R07 — Answering Machine Detection (AMD)

## Twilio Async AMD
- `AsyncAmd=true` dans l'appel API
- L'appel se connecte IMMEDIATEMENT (pas de silence)
- AMD tourne en background pendant la conversation
- Resultat envoye via `asyncAmdStatusCallback` webhook
- Valeurs : human, machine_start, machine_end_beep, machine_end_silence, machine_end_other, fax, unknown
- Prix : $0.0075 par appel EN PLUS du cout de l'appel
- Seulement pour appels sortants via Calls API

## Telnyx AMD
- Detection en temps reel via webhooks automatiques
- Envoie `call.machine.detection.ended` avec `result: human | machine`
- Detecte aussi la fin du message vocal (pour laisser un message complet)
- Moins cher que Twilio (inclus ou prix inferieur)

## Pattern pour notre dialer

### Mode mono-line
Pas besoin d'AMD — l'agent entend directement si c'est une messagerie.
L'agent clique "Messagerie" dans la disposition.

### Mode parallel (V2.1)
AMD CRITIQUE — on doit savoir AVANT de bridger l'agent :
1. Lancer N appels avec AMD actif
2. Si human detecte → bridge vers l'agent
3. Si machine detecte → soit raccrocher, soit laisser un message pre-enregistre
4. Les appels "machine" ne consomment pas le temps de l'agent

## Decision
- MVP mono-line : pas d'AMD, disposition manuelle par l'agent
- Parallel V2.1 : Async AMD obligatoire, implementation via abstraction provider
- Stocker le resultat AMD dans `dialing_session_calls.answered_by`
