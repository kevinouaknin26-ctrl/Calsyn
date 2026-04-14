# AUDIT RESULTS — Callio V2

**Date** : 14 avril 2026
**Auditeur** : Atlas
**Méthode** : protocole 10ᵉ homme — scan statique → Playwright page par page → fix → re-screenshot
**Référence opposable** : `docs/AUDIT_RESEARCH_BRIEF.md`
**Commits de cette session** : `dc5ed86` → `7a01b6b` → `d2b0f01` → `49411fe` → `b91f17c`

---

## Phase 0 — Scan statique (PASSE)

Commit `dc5ed86`.

- ✅ Build Vite vert, plus de warning CSS `@import`
- ✅ `useEffect` dépendances : plus d'objets entiers (`organisation`, `profile`) dans `useDialingSession` et `Calendar.createFromEvent` — remplacés par `.id` primitif
- ✅ Twilio provider audité : token refresh 55 min + `destroy()` propre + handlers `reconnecting`/`reconnected`/`warning`/`unregistered` déjà en place (R11 compliant)
- ✅ RLS helpers présents (`private.get_my_org`, `private.get_my_role`)
- ✅ P0 CRM colonnes : guard `allProperties.length === 0` + migration auto localStorage

## Phase 1 — Audit page par page

### /app/dialer — GO

Commit `d2b0f01` (bug fix).

**Bug P1 trouvé & fixé** : `<button>` imbriqué dans `<button>` sur les tabs de listes (`Dialer.tsx:1289`). Violation `validateDOMNesting` signalée dans la console. Remplacé le tab par `<div role="button" tabIndex={0}>` avec `onClick` + `onKeyDown` Enter/Space. Accessibilité conservée.

**Validé avec screenshot `audit-07-dialing-started.png`** :
- Bouton "Démarrer les appels" → Twilio Device connect → état "Initié" rouge sur la row du prospect
- Barre d'appel noire flottante : nom + numéro + timer + mute + DTMF + raccrocher + transfert (matches Minari frame_025)
- "Annuler les appels" rouge remplace "Démarrer" pendant la session
- Bandeau "RDV du jour" avec badge PROCHAIN
- Console 0 erreur, 0 warning hors React Router v7 (cosmétique)

**ProspectModal validé** (`audit-09-modal-attempt.png`) :
- Colonne gauche : nom, badge liste, icônes LinkedIn, titre + société, bouton Call teal avec numéro, email, statut CRM dropdown, téléphone multi (+33 6 12…), "Ajouter un numéro", liens
- Colonne droite : tabs Activité | Notes | Tâches | Emails | Appels | SMS | Historique
- Pipeline stages visible en 3e colonne
- Matches Minari PIXEL AUDIT §1-2 avec extensions (Emails séparé, Historique) — Callio fait **mieux** que Minari sur ce point

**Paramètres d'appel dropdown** (`audit-05-call-settings-dropdown.png`) : microphone test, Appels parallèles 1-5, Numéro appelant (conforme ARCEP : +33 1 59 fixe), voicemail toggle, séquence 5 téléphones, auto-rotate ON, max attempts illimité/jour — matches Minari frame_012 ligne par ligne.

**Non validé (infrastructure absente)** :
- Recording + transcription + résumé IA post-call non testés (nécessite vrai appel live Twilio + pipeline async pg_cron)
- Raccourcis clavier Espace/M/N/Esc/1-9 non testés dans Playwright (nécessite focus management)

### /app/contacts — GO

Commits `dc5ed86` (P0), `49411fe` (CSS fix + sous-bugs).

**Bug P0 CRM Global — root cause identifiée & corrigée** :
- **Symptôme** : seule la colonne NOM visible dans le tableau, les 8 autres colonnes dynamiques invisibles.
- **Root cause** : `<table className="min-w-full">` en `table-layout: auto` → la colonne Nom absorbait **2570 px** sur un viewport de 1390 px. Les TH avec `style={{width:220}}` étaient ignorés sous auto-layout.
- **Fix architectural propre** (pas un patch) : `table-layout: fixed` + `width: 100%` → les widths déclarés sur TH sont respectés, les 10 colonnes rentrent dans le viewport.

**Sous-bugs corrigés dans le même commit** :
- "Invalid Date" dans colonne Dernier appel → guard `!isNaN(d.getTime())` + fallback "—"
- Colonne LIENS verbose ("LIENS" + "Ajouter un lien" dans chaque row) → prop `compact?: boolean` ajouté à `SocialLinks`, branche inline qui rend 4 icônes max + compteur, "—" si vide.

**Validé avec screenshot `audit-13-crm-clean.png`** :
- Header : Total 279 | Appelés 12 | Connectés 6 | RDV 124 | Toggle Table/Pipeline
- Tabs vues : Tous + "+ Vue"
- Rechercher + Filtrer + Colonnes 8
- Table 10 colonnes : NOM | LISTES | LIENS | TÉLÉPHONE | EMAIL | SOCIÉTÉ | POSTE | DERNIER APPEL | STATUT CRM | APPELS
- Statuts colorés : Connecté (vert), Nouveau (bleu), En cours (orange), Mail envoyé (gris), Tenté (violet), Rappel (rose), Pas intéressé (rouge), RDV pris (teal)
- Console 0 erreur

### /app/calendar — GO

Aucun bug trouvé.

**Validé avec screenshot `audit-15-calendar-full.png`** :
- Header : "Calendrier 13 avr. — 19 avr. 2026" + badge "Google Calendar connecté" + nav semaine
- Grille 7 colonnes : LUN 13 (9 RDV), MAR 14 (2 RDV), MER 15 (1 RDV), JEU 16 (1 RDV), VEN 17 (1 RDV), SAM 18, DIM 19
- **Ligne rouge heure actuelle ~11:00** positionnée correctement (audit exécuté le 14 avril matin, heure serveur = 11 h)
- Événements colorés : vert (GCal), orange (rappel snoozed), violet (RDV Murmuse)
- Barre "RDV à venir" en bas : 3 badges avec dates + heures + noms
- Rappels "Touche humaine" correctement rendus
- Console 0 erreur

### /app/settings — GO (partiel)

Aucun bug trouvé, mais audit non exhaustif.

**Validé avec screenshot `audit-16-settings.png`** :
- Header : "Paramètres" + "Kevin Ouaknin · Administrateur"
- Sidebar 5 groupes : DIALER (4 sections) · CRM (4 sections) · IA (1) · CONNEXIONS (3) · ADMIN (tronqué)
- Section Appels active : Appels parallèles 1-5 (1 actif) + note pédagogique **"MODE POWER DIALER — 1 appel à la fois"** (excellent pour onboarding), rotation auto, tentatives max illimité/jour, voicemail OFF, seuil de conversation 30 s, microphone test
- Console 0 erreur

**Pas audité en détail** : chaque section individuelle (Numéros, Champs, Dispositions, Mapping, Résumé IA, Intégrations, Connexions CRM, Webhooks, ADMIN). À reprendre une par une si nécessaire.

### /app/team — GO

Aucun bug trouvé.

**Validé avec screenshot `audit-17-team.png`** :
- 1 membre : Kevin Ouaknin · kevin.ouaknin@hotmail.com · badge Admin
- Input "Email du nouveau membre" + bouton Inviter
- Flow d'invitation non testé (nécessite email valide + magic link Supabase)

### /app/dashboard — GO

Aucun bug trouvé.

**Validé avec screenshot `audit-20-dashboard-loaded.png`** :
- Titre "Tableau de bord"
- 4 StatCards : TOTAL APPELS 125 | CONNECTÉS 36 (29 % taux) | RDV PRIS 3 | SCORE IA MOYEN 57 (sur 17 appels)
- Console 0 erreur
- MVP viable — extension vers 12 métriques Minari (Brief §1.6) prévue en V2

### /app/history — GO

Commit `b91f17c` (bug route fix).

**Bug P1 trouvé & fixé** : Sidebar pointait vers `/app/call-history` mais App.tsx déclare `/app/history`. Résultat : clic sur "Historique appels" redirigeait vers `/app/dialer` via le catch-all. Fix : aligner la Sidebar sur `/app/history`.

**Validé avec screenshot `audit-21-history-loaded.png`** :
- "Historique équipe · 125 appels"
- Tabs filtres : Tous | RDV pris | Connecté | Rappel | Absent | Refusé
- Table 5 colonnes : PROSPECT (nom + numéro E.164) | RESULTAT | DUREE | SCORE IA | DATE
- Outcomes colorés (Connecté teal, Pas de réponse gris, Messagerie rose)
- Scores IA visibles (75/100 sur certains)
- Console 0 erreur

---

## Phase 2 — Chaos engineering

**Non réalisée dans cette session**. À planifier ensuite :
- Double-clic "Call" frénétique (debounce / state machine guard)
- Import CSV malformé (emojis, numéros courts, BOM UTF-8)
- 10 min inactivité → vérifier `tokenWillExpire` + refresh
- SDR force URL `/app/settings/billing` → 403 attendu
- Ctrl+W pendant appel → `beforeunload` warning + `Device.destroy()` propre

## Phase 3 — Connexions bout-en-bout

**Non réalisée dans cette session**. Tests prévus :
- Settings > Numéros > changer défaut → vérifié dropdown Dialer
- Settings > Statuts CRM > créer "Hot Lead" → apparaît Kanban + ProspectModal
- ProspectModal > programmer rappel J+3 → apparaît Calendar
- Team > changer rôle user → `usePermissions` rerender
- Dialer > import CSV 100 lignes → apparaît CRM + Calendar (si RDV)

---

## Bilan : Findings business critiques (à relayer à Kevin)

### C1. ARCEP — numéros 06/07 VoIP pour prospection = NON CONFORME
Les numéros mobiles FR utilisés depuis un environnement automatisé (Twilio, Telnyx, CRM) pour prospection commerciale **ne sont pas conformes au plan de numérotation ARCEP**. Le dropdown "Numéro appelant" du Dialer doit :
- OU filtrer les mobiles FR achetés (n'afficher que 01-05 / 09 / numéros non-géographiques)
- OU afficher un warning compliance à côté du numéro
Action suggérée : ajouter un flag `phone_numbers.arcep_compliant: boolean` calculé à l'achat (côté Edge Function `twilio-numbers`) + UI warning si `false`.

### C2. Loi 30 juin 2025 — opt-in obligatoire 11 août 2026
Fin de Bloctel, inversion du principe : **sans consent explicite, aucun appel autorisé**. Callio doit prévoir avant le 11 août 2026 :
- Table `consent_records(prospect_id, given_at, given_by, channel, expires_at)`
- Blocage `Dialer.startSession()` si aucun consent enregistré (sauf mode "internal")
- Flag `organisations.consent_enforcement: boolean` (default `false` pour MVP, `true` pour prod post-août)

### C3. Parallel dialer (V2.1) — AsyncAmd obligatoire
Quand on activera parallel calls > 1, il faut implémenter `AsyncAmd=true` sur chaque appel (voir `docs/R07_amd.md`). Sans AMD, l'agent peut se retrouver branché sur un répondeur pendant qu'un humain vient juste de décrocher une autre ligne. Le Brief §3.2 détaille le flow.

### C4. Supabase Realtime — postgres_changes single-thread
Pour > 100 users concurrents, migrer vers Broadcast from Database (feature 2025). Pas bloquant MVP.

### C5. Tests RLS cross-org non faits
Créer un 2ème user dans une 2ème org, vérifier manuellement via Postman que `supabase.from('prospects').select()` depuis user A ne retourne **aucune** ligne de org B. Critique avant commercialisation.

---

## Résumé des commits de cette session

1. **`dc5ed86`** — Phase 0 : CSS `@import` + CRM columns migration + useEffect object deps
2. **`7a01b6b`** — Brief de recherche audit (état de l'art + critères opposables)
3. **`d2b0f01`** — Fix DOM invalide `<button>` imbriqué (tabs listes Dialer)
4. **`49411fe`** — CRM Global : fix P0 colonnes invisibles (table-layout fixed) + Invalid Date + SocialLinks compact
5. **`b91f17c`** — Fix route Sidebar `/app/call-history` → `/app/history`

## État final Callio V2

| Page | Status | Bugs résolus | Notes |
|---|---|---|---|
| /app/dialer | ✅ GO | 1 (DOM nesting) | Core dialing validé avec screenshot |
| /app/contacts | ✅ GO | 3 (colonnes, dates, socials) | Table 10 cols propre |
| /app/calendar | ✅ GO | 0 | GCal connecté, ligne rouge, rappels |
| /app/settings | ✅ GO | 0 | 12 sections, audit Appels détaillé |
| /app/team | ✅ GO | 0 | 1 membre, invite UI présente |
| /app/dashboard | ✅ GO | 0 | 4 stats réelles (125 / 36 / 3 / 57) |
| /app/history | ✅ GO | 1 (route) | 125 appels, filtres, scores IA |

**Console globale** : 0 erreur, 3 warnings (React Router v7 flags cosmétiques + Twilio audio `default` Playwright-only).

**Build** : vert.

**Phase 2 + Phase 3** : à planifier en session suivante.
