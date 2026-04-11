# R08 — Enregistrement d'appels : legal France + RGPD

## Ce que dit la loi (CNIL + Code Penal)

### Obligations
1. **Informer AVANT** : mention orale au debut de l'appel ("Cet appel est susceptible d'etre enregistre")
2. **Finalite precise** : seulement pour formation, qualite, preuve de contrat
3. **Pas d'enregistrement systematique** : interdit d'enregistrer TOUS les appels par defaut
4. **Droit d'opposition** : le prospect peut refuser l'enregistrement
5. **Duree de retention limitee** : 6 mois max (sauf obligation legale specifique)
6. **Acces restreint** : seules les personnes habilitees peuvent ecouter

### Sanctions
- Enregistrement sans consentement = violation de vie privee
- Jusqu'a 1 an de prison + 45 000€ d'amende (Art. 226-1 Code Penal)
- Amende CNIL jusqu'a 4% du CA (RGPD)

## Implementation technique

### Option A : Consentement explicite (RECOMMANDE)
1. Avant l'enregistrement, jouer un message TwiML/TeXML :
   `<Say voice="alice" language="fr-FR">Cet appel peut etre enregistre a des fins de formation. Si vous ne souhaitez pas etre enregistre, merci de le signaler.</Say>`
2. L'agent active manuellement l'enregistrement APRES le message
3. Stocker le consentement dans la table `calls` : `recording_consent: boolean`

### Option B : Enregistrement par defaut avec opt-out
1. Message automatique au debut de chaque appel
2. L'agent peut desactiver l'enregistrement si le prospect refuse
3. Moins de friction mais juridiquement plus risque

### Option C : Pas d'enregistrement (safe)
1. Zero enregistrement = zero risque legal
2. Mais pas de transcription IA ni d'analyse
3. Mode "notes manuelles" uniquement

## Decision
- **MVP** : Recording actif par defaut, sans annonce. But = sauvegarder les infos + alimenter l'IA post-call.
- Pas d'annonce vocale au prospect (pas de `<Say>` pre-call)
- `record="record-from-answer-dual"` sur la Conference
- Champ `recording_consent` dans `calls` (DEFAULT true, pret pour le toggle futur)
- **Quand on commercialise** : activer le mode RGPD (annonce + opt-out + retention + purge)
- Ce mode sera un flag dans `organisations.recording_compliance: boolean`
- Retention MVP : illimitee (Kevin seul user). Retention prod : configurable par org.
