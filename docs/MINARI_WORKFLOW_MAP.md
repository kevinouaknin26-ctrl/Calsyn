# WORKFLOW MINARI — Mapping frame par frame

## ETAT 1 : IDLE (frame 001-002)
- Table pleine largeur avec prospects
- Colonnes : CALL STATUS | CALLS | NAME | TITLE | COMPANY | LAST CALL | STATUS | PHONE NUMBER
- Bouton vert "Resume calling" en haut à gauche
- "Sorted by Last Call ▾" + Filter + "Search contacts..."
- Stats : "2 meetings" + "Connected 1" + "Attempted 2" + "Pending 4"
- "Call settings ▾" à droite

## ETAT 2 : SELECT LIST (frame 005)
- Page "Select a list to dial"
- 4 colonnes : Lists | Tasks | CSV | Smart Lists
- Chaque liste avec nom + nombre de contacts
- Import from CSV avec fichiers uploadés

## ETAT 3 : LOADING (frame 008)
- "Importing from Lemlist... 11/14 (79%)"
- Barre de progression noire

## ETAT 4 : CALL SETTINGS (frame 012)
- Dropdown "Call settings" ouvert
- Parallel calls : slider 1-5 (coché sur 3)
- From phone number : dropdown avec plusieurs numéros
- Voicemail : toggle Off
- Contact phone number field : "Phone number ▾"
- Complete task when contact dialed : toggle off
- Auto-rotate caller phone numbers : toggle ON (bleu)
- Maximum call attempts : "Unlimited per day"

## ETAT 5 : CALLING (frame 018-022)
- "Cancel calls" rouge remplace "Resume calling"
- Badges sur les rows : "Initiated" (rouge), "In-progress" (orange), "Connected" (vert)
- Sous un prospect : texte "Vibre" (la sonnerie)
- Les rows en appel ont un fond coloré (rouge clair / vert clair)

## ETAT 6 : CONNECTED — Modal ouvert (frame 025-042)
- Modal 2 colonnes
- GAUCHE : infos prospect (nom, titre, entreprise, bouton call teal, task, email, status, phone)
- DROITE haut : Bulle VERTE transcription live ("Allô. Oui, oui bonjour...")
- La bulle grandit en temps réel au fur et à mesure de la conversation
- DROITE milieu : "Call - Connected" + badge vert "AI · Interested" + "Write a note"
- DROITE bas : Historique ("Outbound call" + "Connected" badge + date + numéros)
- "Task" : "phone task" avec checkbox
- BAS : Barre noire flottante — Nom + Numéro + Timer + Mute + DTMF + Raccrocher rouge + Transfert vert

## ETAT 7 : POST-CALL — Disposition (frame 050)
- La barre noire DISPARAIT
- Le modal RESTE ouvert
- L'appel actuel en haut de l'activité :
  - "Outbound call" + badge "Connected" + date + bouton X (supprimer l'entrée)
  - **Outcome** : dropdown "Connected ▾"
  - **Meeting booked** : checkbox
  - **Duration** : "23sec"
  - "Recording not ready yet..." (vert clair avec spinner)
  - "Write a note" textarea
- Le bouton Call redevient teal actif (peut rappeler immédiatement)
- "Resume calling" réapparait en haut à gauche

## ETAT 8 : RECORDING READY (frame 054)
- Player audio : ▶ barre de progression + "00:23" + download + speed
- "Show full transcription ▾" + badge "BETA"
- "Transcription in progress..." vert avec spinner

## ETAT 9 : ANALYSE COMPLETE (frame 058-061)
- "Meeting booked" coché → badge passe de "Connected" à "Meeting booked" (teal)
- "Minari AI summary" section :
  - Bullet points du résumé IA
  - "Julien est ouvert à discuter des détails du connecteur"
  - "Il accepte un rendez-vous pour en parler demain à 14 heures"
- "Resume calling" prêt pour le prochain batch
- Toute la page est stable, prête pour le prochain cycle
