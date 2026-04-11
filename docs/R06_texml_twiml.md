# R06 — TeXML vs TwiML

## Compatibilite
- TeXML = 100% compatible TwiML. Code TwiML fonctionne tel quel dans TeXML.
- Migration en 5 minutes selon Telnyx (juste changer l'URL de webhook)
- Memes verbes : <Dial>, <Number>, <Conference>, <Record>, <Gather>, <Say>, <Play>

## Differences notables
- Telnyx supporte G.722 wideband (16kHz) nativement → meilleure qualite pour IA/transcription
- Telnyx : pas de middleware necessaire pour HD Voice
- Twilio : codecs standards, besoin de config specifique pour wideband

## Impact sur notre abstraction
Le TwiML/TeXML est genere cote serveur (Edge Functions). L'abstraction est naturelle :
- Meme format XML
- Seule difference : l'URL du webhook pointe vers Twilio ou Telnyx
- Le provider est un parametre, pas un changement d'architecture

## Decision
On ecrit du TwiML standard. Ca marche pour les deux providers sans modification.
