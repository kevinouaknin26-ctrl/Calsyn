# AUDIT PIXEL PAR PIXEL — Minari vs Callio V2
# Source : 12 photos WhatsApp + 61 frames video + recherche web
# Date : 2026-04-11

---

## 1. MODAL PROSPECT — Colonne gauche (infos)

### Ce que Minari a :
- **Icone contact** : carré gris avec silhouette, pas rond
- **Nom** : gros bold + icone crayon (edit) + icone copier (clipboard)
- **Sous le nom** : icone LinkedIn (bleu) + icone globe (gris)
- **Titre du poste** : "Avocat associé", "Avocat - Associé", "FREED GESTION PRIVEE" (avec icone building)
- **Entreprise** : "AARPI LCG AVOCATS", "Gide", "MC PATRIMOINE" (avec icone entreprise)
- **Bouton Call** : fond TEAL (#0d9488), texte blanc, "Call +33 6 63 73 26 10" avec dropdown ▾
- **A droite du bouton Call** : icone camera (carré) + icone outils (clé)
- **STATUS** : dropdown avec options PERSONNALISABLES :
  - Compte 1 : New, Open, In Progress, Open Deal, Unqualified, Attempted to Contact, Connected, Bad Timing
  - Compte 2 : New, Pas interessé, A rappeler, RDV, Mail presentation
- **"Calls are disabled"** : badge ROUGE quand les appels sont arrêtés
- **"Enable calls"** : bouton VERT FONCE pour réactiver
- **"Snoozed until 14/11/2025"** : badge VIOLET quand un prospect est snooze
- **"Remove snooze"** : bouton pour désnozer
- **PHONE NUMBER** : jusqu'a 5 numéros (PHONE NUMBER 2, 3, 4, 5)
- **EMAIL** : avec icone copier

### Ce qu'on a :
- Icone contact OK (mais rond au lieu de carré)
- Nom + crayon OK
- LinkedIn + settings OK (mais trop petits)
- Titre = on met le "sector" — devrait etre un vrai champ "title"
- Entreprise OK
- Bouton Call OK (teal)
- STATUS : pas de dropdown, juste un texte statique
- Pas de multi-numéros
- Pas de snooze badge
- Pas de "Calls are disabled"

---

## 2. MODAL PROSPECT — Colonne droite (activité)

### Ce que Minari a :
- **Tabs** : Activity | Notes | Tasks | Call logs | SMS + "Expand all" à droite + X fermer
- **Appel en cours/terminé** :
  - "Outbound call" + badge "Connected" (vert) + date/heure à droite
  - Numéros : "+33644644532 (you) → +33632031913"
  - **Outcome** : dropdown (Connected ▾)
  - **Meeting booked** : checkbox avec label "Meeting booked" + valeur (1mn21sec, 7sec)
  - **Duration** : affichée en texte
  - **Player audio** : barre de progression avec ▶ play + durée "01:26" + icone download + icone vitesse
  - **"Show full transcription"** : lien expandable avec icone oeil
  - **"Minari AI summary"** : résumé en bullet points sous la transcription
    - "Jonathan DIAS est intéressé par un service précise-clé en main"
    - "Il souhaite être rappelé demain matin pour discuter plus en détail"
    - "Il semble ouvert à la collaboration avec MURMUSE ART"
  - **"Transcription in progress..."** : avec spinner vert quand pas encore prête
  - **"Write a note"** : textarea pour les notes
- **Historique appels** : liste des "Outbound call" précédents avec badge Connected

### Ce qu'on a :
- Tabs OK (mais "Taches" au lieu de "Tasks", manque "Expand all")
- Card appel en cours : structure OK mais pas assez détaillée
- Pas de player audio
- Pas de "Show full transcription"
- Pas de "Minari AI summary" dans le modal
- Pas d'historique des appels précédents dans le modal
- "Write a note" OK

---

## 3. CALL SETTINGS (dropdown)

### Ce que Minari a :
- **Microphone** : dropdown "Microphone MacBook Air (Built-in)" + boutons Test / Play
- **Parallel calls** : slider 1-5 (ex: "3 ▾")
- **From phone number** : dropdown avec PLUSIEURS numéros (+33 7 57 59 44 15, +33 7 57 90 56 11, +33 6 44 64 65 22) avec compteur d'appels par numéro (135 calls, 208 calls, 185 calls)
- **Voicemail** : toggle GO/Off
- **Contact phone number field** : dropdown "Phone number ▾"
- **Complete task when contact dialed** : checkbox
- **Auto-rotate caller phone numbers** : toggle ON/OFF
- **Maximum call attempts per contact** : "Unlimited ▾ per week ▾"

### Ce qu'on a :
- RIEN de tout ça. Zero Call Settings.

---

## 4. TABLE PROSPECTS (page principale)

### Ce que Minari a :
- **Header** : "Base Kev expert Mobile" + "204 contacts" + "..."
- **Stats** : "0 meetings" | "Connected 48" vert | "Attempted 117" orange | "Pending 7"
- **"Redial 72 contacts"** : bouton VERT pour re-appeler ceux qui ont pas répondu
- **Bouton** : "Resume calling" vert
- **"Sorted by"** : "Last Call ▾" dropdown
- **Filtres** : icone filtre + "Filter 2" (nombre de filtres actifs)
- **"No contacts to enrich"** : message quand l'enrichissement est terminé
- **Colonnes** : CALL STATUS | CALLS | NAME | TITLE | COMPANY | LAST CALL | STATUS | PHONE NUMBER

### Ce qu'on a :
- Stats partiellement OK (Connectes, Tentes, En attente)
- Pas de "Redial X contacts"
- Pas de Filter avec compteur
- Pas de colonne TITLE
- Pas de colonne STATUS (CRM status séparé du call status)
- Dates en format fixe au lieu de "about X hours ago"

---

## 5. SIDEBAR

### Ce que Minari a :
- Très étroite (~50px)
- Fond gris foncé
- Icones : grid (dashboard), loupe (recherche), téléphone (dialer), calendrier, utilisateurs, settings, cloche (notifications), ? (aide)
- En bas : avatar utilisateur

### Ce qu'on a :
- Structure OK (60px, fond bleu nuit)
- Icones similaires mais pas identiques
- Pas de loupe de recherche globale
- Pas de cloche notifications
- Pas de ? aide

---

## 6. BARRE D'APPEL EN BAS

### Ce que Minari a :
- Bandeau NOIR arrondi, FLOTTANT centré (pas pleine largeur)
- Gauche : nom prospect + numéro + timer (0:00)
- Droite : bouton mute (gris cercle) + bouton DTMF (grille cercle) + bouton RACCROCHER (rouge cercle) + bouton TRANSFERT (vert cercle avec flèche)

### Ce qu'on a :
- Structure OK (noir arrondi flottant)
- Boutons OK
- Timer à vérifier si il tourne

---

## 7. FONCTIONNALITES MINARI QU'ON N'A PAS

- Multi-numéros par prospect (5 champs)
- Snooze prospect (avec date)
- Call settings complet (micro, parallel, from number, voicemail, auto-rotate)
- Enrichissement numéros (waterfall)
- Export CSV
- "Redial X contacts" 
- Filtres avancés avec compteur
- "Expand all" dans l'activité
- "Show full transcription" expandable
- "Minari AI summary" dans le modal post-call
- Player audio avec download + speed control
- "Complete task when contact dialed"
- Multiple from numbers avec rotation
- Statuts CRM personnalisables par compte
