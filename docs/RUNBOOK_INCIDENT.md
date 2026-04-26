# Runbook Incident Response

Procédure à suivre en cas d'incident sécu/disponibilité. Version V1 — minimaliste, à enrichir.

## Classification

| Sévérité | Définition | SLA réponse |
|---|---|---|
| **P0** | Data breach confirmé OU service down complet | < 15 min |
| **P1** | Compromission suspectée OU dégradation > 50% des users | < 1h |
| **P2** | Bug sécu sans exploitation observée OU dégradation < 50% | < 24h |
| **P3** | Trou théorique ou dépendance avec CVE non exploitable | < 7j |

## Première heure (P0/P1)

### 1. Triage (5 min)
- [ ] Confirmer l'incident (vérifier Sentry, Vercel logs, Supabase logs)
- [ ] Classifier P0/P1/P2
- [ ] Notifier Kevin (CTO) — Slack + SMS si P0/P1
- [ ] Démarrer un thread Slack `#incident-YYYYMMDD-shortname`

### 2. Containment (15 min)
**Si compromission compte user :**
```sql
UPDATE profiles SET deactivated_at = now() WHERE id = '<user_id>';
DELETE FROM auth.sessions WHERE user_id = '<user_id>';  -- force logout partout
```

**Si compromission service_role / API key :**
- Rotate Supabase service_role key dans le Dashboard
- Invalider toutes les sessions actives :
  ```sql
  TRUNCATE auth.sessions;  -- déloggue TOUS les users (P0 only)
  ```
- Re-déployer toutes les edge functions avec la nouvelle clé

**Si Twilio Auth Token leak :**
- Rotate dans Twilio Console (génère nouveau token)
- Update `TWILIO_AUTH_TOKEN` dans Supabase Edge Functions secrets
- Re-déployer toutes les fonctions Twilio

### 3. Investigation (30 min)
- [ ] Vérifier `audit_events` pour traces d'actions suspectes
  ```sql
  SELECT * FROM audit_events
  WHERE created_at > now() - interval '24 hours'
    AND event_category IN ('security', 'admin')
  ORDER BY created_at DESC;
  ```
- [ ] Vérifier `rate_limit_events` pour patterns anormaux
- [ ] Vérifier Sentry events pour stack traces inhabituelles
- [ ] Snapshot DB : `supabase db dump > incident-YYYYMMDD.sql`

### 4. Communication
- **P0 data breach** : email aux users concernés sous 72h (RGPD Article 34)
- **P0/P1 service down** : status page + email broadcast
- **CNIL** : si breach RGPD avéré, notif dans les 72h via [notifications.cnil.fr](https://notifications.cnil.fr)

## Post-mortem (sous 7j)

Document dans `docs/incidents/YYYYMMDD-shortname.md` :
1. Timeline (UTC) de tous les events
2. Root cause analysis (5 whys)
3. Impact (combien de users, quelles données, durée)
4. Ce qui a fonctionné / pas fonctionné dans la réponse
5. Action items dated (qui fait quoi avant quand)

## Contacts

| Rôle | Nom | Contact |
|---|---|---|
| CTO / Lead | Kevin Ouaknin | kevin.ouaknin@hotmail.com |
| Provider Supabase | Support | support@supabase.io |
| Provider Twilio | Support | +1 415 390 2337 |
| Provider Vercel | Support | support@vercel.com |
| CNIL France | Notif breach | https://notifications.cnil.fr |

## Liens utiles
- Supabase status : https://status.supabase.com
- Vercel status : https://www.vercel-status.com
- Twilio status : https://status.twilio.com
- Audit log : `SELECT * FROM audit_events ORDER BY created_at DESC;`
- Health endpoint : https://<project>.supabase.co/functions/v1/health
