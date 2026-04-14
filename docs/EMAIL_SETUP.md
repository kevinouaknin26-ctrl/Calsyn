# Email invitation Callio — Configuration

## Architecture

L'Edge Function `invite-member` essaie **deux chemins d'envoi** dans cet ordre :

1. **Resend (prioritaire si `RESEND_API_KEY` configurée)** — recommandé production
   - `supabase.auth.admin.generateLink({type: 'invite'})` crée l'user + magic link sans envoyer d'email
   - Envoie l'email via l'API Resend avec notre template HTML Callio brandé (`email-template.ts`)
   - `reply_to` = email de l'admin qui a invité (répond directement au bon contact)

2. **Supabase natif (fallback)** — OK pour dev/debug
   - `supabase.auth.admin.inviteUserByEmail()` envoie l'email Supabase par défaut
   - Template configurable côté **Dashboard → Authentication → Email Templates → Invite user**
   - Rate limit **2 emails/heure** sur free tier (limitant)

## Setup Resend (5 minutes, recommandé)

### 1. Créer un compte
- Va sur https://resend.com → Sign up (Google / email)
- Plan gratuit : 100 emails/jour, 3000/mois. Suffisant pour un MVP.

### 2. Générer une API key
- Dashboard Resend → **API Keys** → **+ Create API Key**
- Nom : `callio-production`
- Permission : `Sending access` (pas besoin de full access)
- Copier la clé (`re_xxx`)

### 3. (Optionnel mais recommandé) Vérifier un domaine
- Par défaut Resend envoie depuis `onboarding@resend.dev` — fonctionne mais peu pro
- Pour un `@callio.app` ou `@ton-domaine.com` propre :
  - Dashboard Resend → **Domains** → **+ Add Domain**
  - Suit les instructions DNS (SPF + DKIM + MX)
  - Une fois vérifié, utilise `Callio <noreply@ton-domaine.com>` dans `EMAIL_FROM`

### 4. Set secrets Supabase
Dans le Dashboard Supabase :
- **Project Settings → Edge Functions → Secrets** → **New secret**

Ajouter 2 secrets :
```
RESEND_API_KEY = re_xxx (ta clé de l'étape 2)
EMAIL_FROM = Callio <onboarding@resend.dev>       # ou <noreply@ton-domaine.com> si domaine vérifié
APP_URL = https://app.callio.fr                    # ou l'URL de prod (laisse localhost pour dev)
```

### 5. Tester
Une fois les secrets set, toute invitation depuis `/app/team` utilisera automatiquement Resend avec le template Callio. Pas de redéploiement nécessaire — les Edge Functions relisent les env vars à chaque invocation.

Pour valider : invite un email à toi-même depuis l'UI. Le mail arrive avec :
- Header violet Callio avec éclair ⚡
- Card blanche centrée 560px
- Titre "Bienvenue dans votre équipe"
- Récap : email + rôle + licence + horaires + quota
- Bouton CTA "Accepter l'invitation →" en gradient violet
- Link fallback copiable
- Footer discret

## Preview du template

Le template est auto-contenu dans `supabase/functions/invite-member/email-template.ts` :
- HTML + inline CSS (compat Gmail/Outlook/Apple Mail)
- Aucune image externe (⚡ Unicode dans un cercle CSS)
- Texte alternatif pour clients mail sans HTML

**Variables injectées par `invite-member/index.ts` au moment de l'envoi** :
- `inviterName` — full_name de l'admin qui invite (fallback sur email)
- `organisationName` — lu depuis `organisations.name`
- `roleLabel` — Super Admin / Admin / Manager / SDR
- `licenseLabel` — Parallel dialer / Power dialer / Aucune
- `workHoursStart`, `workHoursEnd` — HH:MM
- `maxCallsPerDay` — 0 = ligne masquée
- `phonesCount` — nombre de numéros assignés (ligne masquée si 0)
- `actionUrl` — magic link Supabase valide 24 h
- `email` — destinataire

## Fallback : template Supabase natif

Si `RESEND_API_KEY` n'est pas set, on passe par `inviteUserByEmail`. Pour améliorer le template par défaut :

1. Dashboard Supabase → **Authentication → Email Templates → Invite user**
2. Coller le HTML ci-dessous (simplifié, en Go template syntax Supabase)

```html
<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f6f5f9;font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
<table cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;box-shadow:0 2px 20px rgba(99,65,180,0.08);">
  <tr><td style="padding:32px 40px 8px;">
    <div style="display:inline-block;width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#863bff,#4f1dc4);color:#fff;font-size:22px;font-weight:900;text-align:center;line-height:40px;">⚡</div>
    <span style="font-size:20px;font-weight:800;color:#0f172a;margin-left:12px;">Callio</span>
  </td></tr>
  <tr><td style="padding:24px 40px 0;">
    <h1 style="margin:0 0 12px;font-size:26px;font-weight:800;color:#0f172a;">Bienvenue dans votre équipe</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">Vous avez été invité à rejoindre Callio, le dialer intelligent pour les équipes commerciales.</p>
  </td></tr>
  <tr><td align="center" style="padding:32px 40px;">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;background:linear-gradient(135deg,#863bff,#4f1dc4);border-radius:10px;">Accepter l'invitation →</a>
  </td></tr>
  <tr><td style="padding:0 40px 32px;">
    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">Ce lien est valide 24 h. Si vous n'avez pas demandé cette invitation, ignorez cet email.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>
```

**Subject** : `Invitation à rejoindre Callio`

Moins riche que le template Resend (pas de variables rôle/licence/horaires car Supabase ne passe pas les metadata dans le template), mais propre et brandé.

## Sécurité & RGPD

- Le magic link contient un token signé par Supabase, impossible à deviner
- Validité 24 h par défaut (configurable côté Supabase Auth settings)
- `reply_to` pointe vers l'admin qui invite → pas de support fantôme
- Aucune donnée sensible dans l'email (pas de password, pas de token JWT)
- Le template texte alternatif garantit la délivrabilité chez les clients mail stricts
