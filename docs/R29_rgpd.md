# R29 — RGPD & Conformité Enregistrement d'Appels

## Ce que dit la loi (résumé 2026)

### Enregistrement d'appels commerciaux
- Information OBLIGATOIRE de toutes les parties avant enregistrement
- Consentement ou intérêt légitime comme base légale
- Durée de conservation : 6 mois max (sauf obligation légale)
- Droit d'opposition : le prospect peut refuser
- Accès restreint aux personnes habilitées
- Sanctions : jusqu'à 45 000€ + 1 an prison (Art. 226-1) + 4% CA (RGPD)

### Transcription
- Durée conservation transcription : 12 mois max
- Si données personnelles dans la transcription : même règles RGPD
- PII redaction recommandée (AssemblyAI et Deepgram proposent cette feature)

## Notre stratégie

### MVP (Kevin seul user, pas commercial)
- Recording actif par défaut, sans annonce
- Pas de vente du produit, usage interne uniquement
- Pas d'obligation RGPD stricte (pas de traitement de données tiers à grande échelle)

### Quand on commercialise (mode RGPD activable)
Architecture prête dans le code, mais désactivée par défaut :

```
organisations.recording_compliance: boolean (default false)

Si true :
  1. Message TwiML <Say> avant chaque enregistrement
  2. Toggle agent pour activer/désactiver le recording
  3. Champ calls.recording_consent
  4. Purge automatique des recordings après retention_days
  5. PII redaction sur les transcriptions
  6. Export/suppression des données sur demande (droit d'accès/effacement)
```

## Decision
- MVP : recording sans annonce (usage interne Kevin)
- Architecture RGPD prête mais désactivée (flag par organisation)
- Quand on vend : activer le flag, le code est déjà là
- Pas de RGPD = pas de blocage pour le MVP
