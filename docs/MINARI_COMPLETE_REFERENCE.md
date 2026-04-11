# REFERENCE COMPLETE MINARI — 40 articles analysés
# Source : intercom.help/minari/fr/ + 12 photos WhatsApp + 61 frames video + site minari.ai
# Date : 2026-04-11

---

## A0. PENDANT L'APPEL — UX LIVE (frames 025-042)

### Transcription Live
- Bulle VERTE de transcription qui apparait et GRANDIT en temps réel
- Le texte de la conversation s'affiche au fur et à mesure ("Allô. Oui, oui bonjour...")
- Positionnée en haut de la colonne droite du modal

### Badge IA Live
- Badge "AI · Interested" apparait PENDANT l'appel (pas après)
- Analyse en temps réel du ton/contenu de la conversation

### Task dans le modal
- Section "Task" dans la colonne gauche du modal pendant l'appel
- "phone task" avec checkbox
- Lié au toggle "Complete task when contact dialed" dans Call Settings

### Post-call : barre noire DISPARAIT
- Quand l'appel se termine, la barre flottante noire disparait
- Le modal RESTE ouvert pour la disposition
- Le bouton Call redevient teal actif (peut rappeler immédiatement)
- "Resume calling" réapparait en haut

### Badge Meeting booked (teal)
- Quand "Meeting booked" est coché → badge passe de "Connected" (vert) à "Meeting booked" (teal)

---

## A1. PAGE "SELECT A LIST TO DIAL" (frame 005)

- Page dédiée avant de lancer une session
- 4 colonnes/onglets : **Lists** | **Tasks** | **CSV** | **Smart Lists**
- Chaque liste affiche nom + nombre de contacts
- Import CSV : fichiers déjà uploadés visibles
- Import depuis Lemlist : barre de progression "Importing... 11/14 (79%)"

---

## A. WORKFLOW COMPLET DU DIALER

### 1. Fonctionnement du Parallel Dialer
- Appelle jusqu'à 5 prospects simultanément
- L'utilisateur ne parle JAMAIS à plusieurs personnes
- Quand un prospect décroche → les autres appels s'arrêtent auto
- La fiche contact s'affiche immédiatement
- Téléphone classique : 20-30 appels/h = 3-4 conversations
- Minari : ~100 appels/h = ~15 conversations (taux décroché 15%)
- Parcours de haut en bas dans la liste
- Fin de liste → propose des relances sélectives (pas de rappel auto des déjà connectés)

### 2. Détection Répondeurs (AMD)
- Faux positifs volontaires (~5%) pour réduire la latence au décroché
- **Bouton bleu de raccrochage** pour passer au suivant
- **Raccourci clavier : Cmd+P** pour raccrocher et enchaîner
- Si raccrochage < 8 secondes → appel AUTOMATIQUEMENT recatégorisé "Répondeur"
- Les stats ne sont PAS faussées grâce à cette recatégorisation auto

### 3. Callback (Appels Entrants)
- Prospect rappelle un numéro Minari → route vers l'utilisateur assigné
- 3 modes configurables dans Settings > Incoming Calls :
  1. **Callback Minari uniquement** (défaut) : sonne si onglet ouvert, sinon → manqué
  2. **Callback + Redirection** : Minari ouvert → Minari, fermé → numéro externe (mobile, Aircall)
  3. **Redirection forcée** : TOUS les callbacks redirigés, jamais dans Minari
- Notification callback : nom, prénom, poste, entreprise, liste du contact

---

## B. CALL SETTINGS (détaillé)

### Paramètres disponibles
1. **Parallel calls** : slider 1-5, choix selon taux de décroché
2. **Auto rotate numbers** : activé par défaut
   - Alterne entre les numéros assignés à l'utilisateur
   - Répartit le volume, limite l'usure d'un numéro
   - Peut être désactivé pour appeler depuis un seul numéro
3. **Max call attempts** : tentatives max par contact
   - Avec temporalité (X tentatives par période — "per day" ou "per week" selon config)
   - Ou sans temporalité (compteur global, jamais reset)
   - Contact bloqué quand seuil atteint
   - Défaut observé : "Unlimited" (pas de limite)
4. **Voicemail drop** : message pré-enregistré auto sur répondeurs
   - 1 clic, sans casser le flow
   - Messages consistants
5. **From phone number** : dropdown avec PLUSIEURS numéros + compteur d'appels par numéro
6. **Contact phone number field** : quel champ téléphone utiliser
7. **Complete task when contact dialed** : toggle
8. **Microphone** : dropdown + boutons Test/Play

---

## C. TRANSCRIPTIONS & AI

### Transcriptions
- Minimum 20 secondes d'appel pour transcrire
- 5 langues auto-détectées : FR, EN, DE, IT, ES
- Aucune config nécessaire
- Affichage : "Show full transcription" expandable avec badge BETA
- "Transcription in progress..." avec spinner vert quand pas prête

### AI Summary
- Résumé IA en bullet points sous la transcription
- **Standard Prompt** : résumé par défaut
- **Custom Prompts** : créés dans Settings > AI Summary > "New Prompt"
- Les custom prompts deviennent sélectionnables dans les Call Settings du dialer
- Exemples de résumés vus :
  - "Jonathan DIAS est intéressé par un service précise-clé en main"
  - "Il souhaite être rappelé demain matin pour discuter plus en détail"
  - "Julien est ouvert à discuter des détails du connecteur"

---

## D. ANALYTICS (3 tableaux)

### 1. Tableau de Performance Globale
**Filtres** : par utilisateur, par période, par liste

**Métriques Activité :**
- Total calls : nombre total d'appels
- Dials/day : moyenne quotidienne
- Canceled by user : annulés manuellement

**Métriques Connexions :**
- Connect : appels décrochés
- Callbacks : rappels de contacts
- Callback connects : rappels décrochés

**Métriques Qualité :**
- Conversations : appels > durée minimum configurable (0, 30, 60s dans Settings)
- Meetings : RDV bookés

**Métriques Temps :**
- Talk time : durée totale conversation
- Avg talk time : durée moyenne
- Session time : temps total en session (appels + sonnerie + enchaînements)

**Interactivité** : TOUS les indicateurs sont cliquables → détails avec filtres auto

### 2. Heatmap
- Axes : jour de la semaine × tranche horaire
- Montre quand appeler pour maximiser les connexions

### 3. List Completion Rate
- **Formule** : (Connectés + Exhausted) / Total contacts
- **Statuts Health** : New → Active → Exhausted
- **Filtres** : utilisateur, liste, health

---

## E. STATUTS D'APPELS

### Call Status (outcome de l'appel)
- Connected (vert)
- No Answer
- Voicemail
- Left Voicemail
- Wrong Number
- Busy
- Missed
- Failed
- Canceled

### CRM Status (statut prospect)
- PERSONNALISABLE par compte
- Exemples compte 1 : New, Open, In Progress, Open Deal, Unqualified, Attempted to Contact, Connected, Bad Timing
- Exemples compte 2 : New, Pas intéressé, A rappeler, RDV, Mail présentation

---

## F. UI ELEMENTS DETAILLES

### Modal Prospect — Colonne Gauche
- Icone contact carré gris (pas rond)
- Nom bold + icone crayon (edit) + icone copier (clipboard)
- Sous le nom : icone LinkedIn (bleu) + icone globe (gris)
- Titre du poste (champ dédié, PAS le secteur)
- Entreprise avec icone building
- **Bouton Call** : fond TEAL (#0d9488), "Call +33..." avec dropdown ▾
- A droite du Call : icone camera + icone outils (clé)
- **STATUS** : dropdown personnalisable
- **Snooze** : badge VIOLET "Snoozed until 14/11/2025" + bouton "Remove snooze"
- **Calls disabled** : badge ROUGE + bouton VERT "Enable calls"
- Jusqu'à 5 numéros de téléphone
- Email avec icone copier

### Modal Prospect — Colonne Droite
- **Tabs** : Activity | Notes | Tasks | Call logs | SMS + "Expand all" + X fermer
- **Appel connecté** :
  - "Outbound call" + badge "Connected" (vert) + date
  - Numéros "from → to"
  - Outcome dropdown
  - Meeting booked checkbox
  - Duration
  - Player audio : ▶ barre + durée + download + speed
  - "Show full transcription" expandable
  - "Minari AI summary" en bullet points
  - "Transcription in progress..." avec spinner vert
  - "Write a note" textarea
- **Historique** : liste des appels précédents

### Table Prospects (page principale)
- Header : nom liste + X contacts + "..."
- Stats : "X meetings" | "Connected X" vert | "Attempted X" orange | "Pending X"
- **"Redial X contacts"** : bouton VERT
- **"Resume calling"** / **"Cancel calls"** (rouge pendant appel)
- **"Sorted by"** : "Last Call ▾" dropdown
- **Filtres** : icone filtre + "Filter X" (compteur actifs)
- **Search** : "Search contacts..."
- **Colonnes** : CALL STATUS | CALLS | NAME | TITLE | COMPANY | LAST CALL | STATUS | PHONE NUMBER

### Sidebar
- ~50px, fond gris foncé
- Icones : grid (dashboard), loupe (recherche), téléphone (dialer), calendrier, utilisateurs, settings, cloche (notifications), ? (aide)
- Bas : avatar utilisateur

### Barre d'appel (pendant appel)
- Bandeau NOIR arrondi, FLOTTANT centré
- Gauche : nom prospect + numéro + timer
- Droite : mute (gris cercle) + DTMF (grille cercle) + RACCROCHER (rouge cercle) + TRANSFERT (vert cercle)

### Badges pendant appel sur les rows
- "Initiated" (rouge)
- "In-progress" (orange)
- "Connected" (vert)
- Fond coloré sur les rows en appel

---

## G. WEBHOOK MINARI

### Event : `call.completed`
### Payload :
```json
{
  "call": {
    "ended_at": "ISO 8601",
    "status": "connected|no-answer|busy|voicemail|left-voicemail|missed|failed|canceled",
    "direction": "incoming|outgoing",
    "duration_seconds": 45,
    "from_number": "+33...",
    "to_number": "+33...",
    "recording_url": "signed MP3 (expire 24h)",
    "transcript_url": "signed JSON (expire 24h)",
    "summary": "Résumé IA"
  },
  "prospect": {
    "first_name": "...",
    "last_name": "...",
    "email": "...",
    "company": "...",
    "job_title": "...",
    "crm_contact_id": "...",
    "crm_company_id": "..."
  },
  "user": { "name": "...", "email": "..." },
  "list": { "list_name": "...", "crm_list_id": "..." }
}
```
### Sécurité : `X-Webhook-Signature` = HMAC-SHA256
### Retries : 4 tentatives (immédiat, +1s, +2s, +4s)

---

## H. INTEGRATIONS CRM

### Champs par défaut Minari
- Nom, Prénom, Poste, Entreprise, Email, Téléphone, LinkedIn, Site web entreprise

### Propriétés créées dans HubSpot
- `minari_meeting_booked` : RDV planifié
- `minari_snooze_until` : rappel différé
- `minari_do_not_call` : ne pas appeler

### Sync HubSpot
- Bidirectionnelle (2-way sync)
- Objets : Contacts, Companies, Lists, Activities (Call, Email)
- Champs dropdown HubSpot éditables directement dans Minari
- Custom fields : Settings > Custom Fields > "Add a Custom Field"
- Field mapping : Settings > Field Mapping

### Import
- Depuis CRM (HubSpot, Salesforce, Lemlist)
- Depuis CSV : Prénom, Nom, Numéro, Email, Société, Poste
- Max 1500 contacts par liste (info article Import CRM)

---

## I. BUSINESS MODEL

- **Prix** : 300€/mois par poste (info Kevin)
- **Licences** : ajout immédiat, prorata temporis / retrait fin de période
- **Facturation** : portail billing, admin only
- **Résiliation** : self-service, accès maintenu jusqu'à fin période, données supprimées J+15
- **0 → 1M€ ARR** en < 18 mois, bootstrappé
- **467K appels** en novembre seul
- **Fondateurs** : Clément Bataille + Julien Schmitt (Montrouge)
- **200+ sales organizations**
- **Support** : Slack, email, live chat (lun-ven 9h-18h)

---

## J. LEGAL / COMPLIANCE

### Cold call B2B France
- Autorisé, encadré par l'ARCEP
- Horaires de bureau, lundi-vendredi
- Pas d'horaires stricts comme en B2C
- "Principe de raisonnabilité"
- **Intérêt légitime** : prospection pertinente liée à l'activité du contact
- Refus explicite = arrêt immédiat, documenter l'opposition

### VoIP
- Minimum : 10 Mbps down, 2 Mbps up
- Ethernet recommandé
- Casque filaire USB recommandé
- VPN désactivé pendant appels
- Chrome recommandé
- Diagnostic réseau : networktest.twilio.com

---

## K. FONCTIONNALITES A IMPLEMENTER (par priorité)

### P0 — MVP critique
1. Table prospects avec colonnes : CALL STATUS | CALLS | NAME | TITLE | COMPANY | LAST CALL | STATUS | PHONE
2. Bouton "Resume calling" / "Cancel calls"
3. Stats : Meetings | Connected | Attempted | Pending
4. Modal 2 colonnes (info + activité)
5. Call bar flottante noire (nom + timer + mute + DTMF + raccrocher)
6. Post-call : Outcome dropdown + Meeting booked checkbox + Duration + Notes + Autosave
7. Statuts CRM personnalisables
8. Search + Sort by dropdown

### P1 — Important
9. Parallel calls (1-5)
10. Call Settings complet (parallel, from number, auto-rotate, max attempts, voicemail)
11. "Redial X contacts"
12. Filtres avec compteur
13. Player audio (recording)
14. "Show full transcription" expandable
15. AI Summary dans le modal
16. Callback (appels entrants) avec 3 modes
17. Snooze prospect (badge violet + date)
18. Multi-numéros par prospect (5 champs)

### P2 — Nice to have
19. Heatmap (jour × heure)
20. List Completion Rate
21. Tableau performance globale (12 métriques)
22. Import CSV avec mapping
23. Voicemail drop
24. Custom AI prompts (Settings > AI Summary)
25. Webhook sortant (call.completed)
26. CRM sync bidirectionnelle
27. Enrichissement contacts (waterfall)
28. Export CSV
