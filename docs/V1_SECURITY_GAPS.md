# V1 Security Gaps — ce qui manque encore

Liste honnête des trous de sécu encore ouverts post-V1, avec plan de comblement et priorité. À présenter au dev lead pour montrer qu'on connaît nos limitations.

## Bloquants pour client enterprise / SOC2

### 1. MFA / 2FA (priorité P0)
**Trou** : pas de second facteur. Compromission d'un mdp super_admin = full takeover.
**Plan V1.1** : Supabase Auth supporte TOTP (Google Authenticator) nativement.
- Activer dans Supabase Dashboard > Auth > MFA
- UI dans Settings : enroll TOTP, generate backup codes
- Force MFA pour rôles `super_admin` (refus de login sans factor enrolled)
**Effort** : 2-3 jours dev + UI

### 2. Encryption colonnes sensibles (priorité P1)
**Trou** : `calls.ai_transcript`, `ai_summary`, `prospects.notes` en clair en DB. Supabase chiffre le disque mais pas les colonnes individuelles. Un dump de DB = leak de toutes les conversations.
**Plan V1.1** : pgcrypto avec key par org dans Supabase Vault
- Migration : add `ai_transcript_enc bytea`, dual-write 30j, switch read, drop `ai_transcript`
- RPC `encrypt_call_data(call_id, transcript)` / `decrypt_call_data(call_id)` SECURITY DEFINER
- Rotation de clé annuelle documentée
**Effort** : 1 semaine + migration data + tests

### 3. Webhook signature : Gmail Pub/Sub (priorité P1)
**État actuel** : `gmail-push-webhook` valide un secret query param `?secret=<X>` (faible).
**Plan** : Vérifier le JWT Pub/Sub envoyé par Google (ID token signé par Google) au lieu d'un secret partagé.
**Effort** : 0.5 jour

### 4. Audit log : intégrité (priorité P2)
**Trou** : `audit_events` est INSERT-only mais service_role peut UPDATE/DELETE. Un attaquant qui obtient service_role peut effacer les traces.
**Plan V1.2** : 
- Trigger `audit_events_no_modify` qui RAISE EXCEPTION sur UPDATE/DELETE (même pour service_role en revoke)
- Hash chain : chaque event contient le hash du précédent → détection de tampering
**Effort** : 1 jour

## Nice-to-have V1.1

### 5. Politique de mots de passe Supabase Auth Dashboard
**État** : on enforce côté front (`validatePassword`). Mais Supabase Auth lui-même accepte 6 chars min par défaut.
**Action** : Supabase Dashboard > Auth > Settings :
- Minimum password length = 12
- Password requirements = "Lower, upper, digit, symbol"
- HIBP (Have I Been Pwned) check = enabled
**Effort** : 5 min config

### 6. Session management
**État actuel** : JWT Supabase 1h, refresh token 1 semaine, pas d'idle timeout.
**Plan** : Supabase Dashboard > Auth > Settings :
- JWT expiry = 30 min (au lieu de 1h)
- Refresh token rotation = enabled (déjà actif)
- Refresh token reuse interval = 10s
- Inactivity timeout côté front : auto-logout après 30 min sans activité
**Effort** : 0.5 jour

### 7. Secrets rotation plan
**État** : Twilio Auth Token, Google Client Secret, Sentry DSN, Resend API Key — pas de plan de rotation.
**Plan V1.1** : 
- Document `SECRETS_ROTATION.md` avec calendrier (annuel min, trimestriel si breach)
- Procédure step-by-step pour chaque secret
- Vault Supabase pour stocker les vieux + nouveaux pendant la rotation
**Effort** : 1 jour doc + setup Vault

### 8. Backup drill régulier
**État** : on a `calsyn-restore-20260414` (DR du crash mi-avril). Supabase fait des backups quotidiens. Mais on n'a jamais testé un restore en pratique.
**Plan V1.1** :
- Trimestriel : `supabase db dump` + restore sur projet test + smoke test
- Document RPO (Recovery Point Objective = 24h max) et RTO (Recovery Time = 1h)
- Runbook `BACKUP_DRILL.md`
**Effort** : 0.5 jour + récurrent

### 9. CORS strict sur webhooks
**État** : webhooks Twilio/Gmail/wa-webhook ont `Access-Control-Allow-Origin: '*'`. Pas dangereux (pas de cookies, signature requise) mais pas propre.
**Plan** : Restreindre à `https://api.twilio.com` / `https://gmail.googleapis.com` selon le webhook.
**Effort** : 1h

### 10. OWASP ZAP en CI sur preview Vercel (vs hebdo prod)
**État** : on a hebdo + manuel sur prod via `.github/workflows/zap-baseline.yml`.
**Plan V1.1** : ajouter scan sur chaque preview deploy Vercel (via webhook) → bloquer merge si nouveau finding HIGH.
**Effort** : 1 jour

### 11. Runbook incident response
**État** : pas de runbook formel.
**Plan V1.1** : `docs/RUNBOOK_INCIDENT.md` avec :
- Critères de classification (P0 = data breach, P1 = service down, P2 = degradation)
- Chaîne de commande (qui appelle qui)
- Communication client (template d'email)
- Post-mortem template
**Effort** : 1 jour

### 12. PII masking dans les logs Vercel
**État** : Sentry est scrubbé. Mais `console.log` dans les edge functions Supabase peut leak des PII (ex: emails) dans les Supabase logs.
**Plan V1.1** : audit des `console.log` dans toutes les edge functions, scrubber maison ou désactiver les logs verbeux en prod.
**Effort** : 0.5 jour

### 13. Anomaly detection
**État** : aucune alerte sur connexions inhabituelles, brute force, scraping.
**Plan V1.1** : 
- Sentry alerts sur taux d'erreur 401/403 anormalement élevé
- Audit log query : alertes sur > N login fail / 5 min
- Rate limit déjà en place mais pas d'alerte si quelqu'un atteint la limite
**Effort** : 1-2 jours

## Niveau de "présentabilité"

| Audience | Verdict V1 |
|---|---|
| Dev lead expérimenté | ✅ Défendable. Pointera MFA, encryption, rotation. |
| Client SaaS PME (< 100 users) | ✅ OK |
| Client enterprise (>1M€ ARR, secteur régulé) | ❌ Manque MFA + encryption colonnes + audit hash chain |
| SOC2 Type 1 | ❌ Manque la moitié des contrôles (CC6.1, CC6.6, CC7.1) |
| SOC2 Type 2 | ❌ + manque 6 mois d'historique de contrôles fonctionnels |
| ISO 27001 | ❌ Manque ISMS, risk assessment formel, registre traitements |
| CNIL (RGPD) | ✅ Couverture des articles 5/17/20/30/32. Manque DPIA formel et registre. |

## Roadmap suggérée

- **V1.0 (this week)** : tout ce qui est dans `V1_SECURITY_HARDENING.md`
- **V1.1 (next 4 weeks)** : MFA + Gmail Pub/Sub JWT + Supabase Auth config + session mgmt + Resend signature
- **V1.2 (next 2 months)** : encryption colonnes + audit hash chain + ZAP CI + runbooks
- **V2.0 (next 6 months)** : SOC2 Type 1 prep — externe consultant, pen test, documentation ISMS
