# AUDIT RESEARCH BRIEF — Callio V2

**Date** : 14 avril 2026
**Auteur** : Atlas (CTO)
**Portée** : Ce document consolide la connaissance nécessaire pour auditer Callio V2 page par page contre l'état de l'art des parallel dialers, power dialers et CRM B2B en 2026. Il est la référence opposable pendant l'audit — tout jugement "OK / KO" sur une page doit s'y rattacher.

**Périmètre produit** : parallel dialer B2B SaaS (clone Minari) + CRM HubSpot-like fusionné, multi-tenant Supabase, Twilio Voice SDK 2.18 (Telnyx codé, pas activé), marché FR.

---

## 1. Ce que Callio DOIT faire (critères produit opposables)

### 1.1 Dialer (cœur métier)
Un SDR doit pouvoir :
1. **Sélectionner une liste** (ou Tasks / CSV / Smart List — frame_005) et démarrer une session en < 3 clics.
2. **Lancer N appels en parallèle** (1-5), voir en temps réel l'état de chaque ligne (Initiated / In-progress / Connected / Voicemail / Pending) avec un fond coloré sur le row correspondant (frame_018).
3. **Bridger uniquement l'humain** — quand un prospect décroche, les N-1 autres appels sont canceled automatiquement. Latence cible : < 2 s entre pickup et audio bridge.
4. **Voir la fiche prospect s'ouvrir automatiquement** (2 colonnes : infos gauche / activité droite — frame_025) avec une bulle verte de **transcription live qui grandit** en temps réel et un badge IA "Interested / Objection / Neutral" (frame_030).
5. **Raccrocher et enchaîner** via raccourci clavier (Cmd+P ou Espace) en < 1 s — pas de re-render bloquant.
6. **Remplir la disposition** (Outcome dropdown + Meeting booked checkbox + Duration + note libre) sans quitter le modal (frame_050). Autosave, pas de bouton "Save".
7. **Laisser un voicemail en 1 clic** sans casser le flow — message pré-enregistré (voicemail drop).
8. **Raccrocher < 8 s = re-catégorisation auto "Répondeur"** (ne pas fausser les stats connect rate).
9. **Enchaîner le prospect suivant automatiquement** après disposition (N, Enter, ou "Resume calling").
10. **Recording + transcription + résumé IA post-call** s'affichent dans le modal dès qu'ils sont prêts, via Realtime (pas de refresh manuel — frame_054, frame_061).

### 1.2 CRM Global
Un manager doit pouvoir :
1. **Voir tous les prospects fusionnés cross-listes** (pas de doublons par téléphone normalisé E.164).
2. **Filtrer** avec **opérateurs avancés** (égal, contient, commence par, vide, entre, dans les X derniers jours…) sur tout champ système ou custom.
3. **Sauvegarder des vues** en tabs réutilisables, partageables à l'org.
4. **Basculer Table / Pipeline Kanban** instantané, état préservé (mêmes filtres).
5. **Drag & drop** un prospect entre colonnes Kanban → update DB + workflow auto (ex : passage `en_attente_signature` crée rappel J+7).
6. **Bulk actions** : sélection multiple → changer statut / supprimer / assigner à un SDR / ajouter à une liste.
7. **Stats en tête** : total, appelés, connectés, RDV, taux de conversion par stade.
8. **Clic sur un prospect → même ProspectModal que le Dialer** (interactif, peut appeler — pas une vue read-only).

### 1.3 Calendar
1. Grille 24h avec ligne rouge heure actuelle + auto-scroll vers cette heure au mount.
2. RDV GCal (tag Murmuse) + RDV DB + rappels `snoozed_until` (orange, 9h) sans doublon (dédup par téléphone E.164).
3. Barre "RDV à venir" en bas, auto-scroll sur le prochain, badge PROCHAIN.
4. Clic event → ProspectModal (créé à la volée si pas de fiche).

### 1.4 Settings (16 sections, synchro bidirectionnelle)
Un admin modifie un paramètre → effet **immédiat** dans le Dialer (reactive, pas de refresh).
- **Call** : parallel calls 1-5, voicemail drop ON/OFF, auto-rotate ON/OFF, max attempts unlimited|X/day|X/week, contact phone field.
- **Numéros** : liste Twilio numbers + compteur d'appels par numéro + achat/suppression (Super Admin) + assignation user (Admin).
- **Statuts CRM** : CRUD statuts custom avec color + priority + is_system.
- **Champs custom** : CRUD prospect_fields (text / number / date / enum / url / email / phone / boolean).
- **Permissions** : afficher matrice 3 rôles (Super Admin / Admin / SDR) — read-only pour Admin.
- **Billing** : Super Admin uniquement.

### 1.5 Team
- Super Admin : voir tous, changer rôles, inviter, assigner rôles.
- Admin : voir tous, inviter SDRs (pas super_admin), assigner numéros Twilio.
- SDR : voir uniquement son profil.
- Invite par email → lien magic link Supabase → création profile.

### 1.6 Dashboard / History
- **Dashboard** : stats globales (12 métriques Minari) — talk time, avg, dials/day, connects, conversations, meetings, heatmap, list completion rate.
- **History** : liste de tous les appels de l'org (ou les siens pour SDR), filtrable par date/status/SDR, clic → recording + transcript + analyse IA.

---

## 2. Benchmarks externes (état de l'art 2026)

### 2.1 Parallel vs Power dialer — data marché
| Métrique | Power (mono-line) | Parallel |
|---|---|---|
| Dials/heure | 30-40 | 100-300 (selon lignes) |
| Conversations/heure | 4-6 | 15-20 |
| Talk time moyen | 9-11 min | 4-5 min |
| Taux conversion par call | 6.4% | 3.8% |

**Règle** : parallel = volume, power = qualité. Le SDR doit pouvoir switcher (slider 1-5) selon la persona qu'il appelle. Minari / Orum / Nooks permettent tous cela.

### 2.2 Concurrents
| Solution | Prix/user/mois | Parallel | IA | Cible |
|---|---|---|---|---|
| Nooks | $417 | 5 | Coaching + roleplay | Enterprise SDR |
| Orum | $417 | 7 | Oui | Enterprise SDR |
| Minari | ~300€ | Oui | Basique | SDR FR |
| Aircall | $70+ | Non | Addon $9 | PME |
| Callio (cible) | 49-199€ | 1-5 | Intégrée | PME FR |

**Positionnement défendable** : "Le Minari accessible" (parallel + IA native < 100€). Callio doit matcher Minari feature-parity sur le MVP — sinon aucun différenciant autre que le prix, ce qui ne tient pas à moyen terme.

### 2.3 HubSpot data model — ce que Callio doit maîtriser
- **4 objets standards** : Contacts, Companies, Deals, Tickets.
- **Contact** = personne (email unique ID). **Company** = organisation (domaine unique ID). **Deal** = opportunité business avec amount + closedate + pipeline stage.
- **Associations** : Contact ↔ Company (many-to-one), Deal ↔ Contacts + Company, Deal ↔ Activities (calls, emails, meetings).
- **Pipeline** : stages avec probabilité % → forecasted revenue.
- **Timeline** : chaque record logue toute modif, association, activité.

**Décision Callio** : on FUSIONNE Contact + Company dans `prospects` (une table, champs `company`/`title` inline). Pas de Deal séparé pour le MVP — le `crm_status` du prospect joue le rôle de stage. **Conséquence à documenter** : on ne peut pas tracker plusieurs deals pour le même contact. Trade-off assumé pour la simplicité MVP, mais revient en V2 (table `deals` séparée).

### 2.4 Attio / Close benchmarks
- Filtrage **millions de records en ms** (Attio testé à 50k sans ralentissement).
- **Vues** = couple (filters + sort + columns) sauvegardées, switchables en 1 clic.
- **Kanban / Table / List** partagent le même state — pas de re-fetch au switch.

---

## 3. Contraintes techniques & pièges connus

### 3.1 Compliance FR — CRITIQUE
- **ARCEP** : un 06/07 mobile FR **ne peut pas** être utilisé depuis un environnement fixe/automatisé (VoIP, CRM, centre d'appel) pour prospection commerciale. Seuls les fixes (01-05, 09) ou les numéros mobiles rattachés à un terminal physique sont conformes.
- **Conséquence Callio** : le dropdown "From phone number" doit **filtrer les numéros achetés** — aucun mobile FR ne devrait être proposé pour outbound commercial. OU afficher un warning compliance.
- **Loi 30 juin 2025** → **11 août 2026** : opt-in explicite obligatoire, fin de Bloctel. Architecture à préparer :
  - Table `consent_records(prospect_id, given_at, given_by, channel, expires_at)` 
  - Blocage dial si pas de consent enregistré post-août 2026
  - Flag `organisations.consent_enforcement: boolean` (default false pour MVP, true pour prod post-août 2026)

### 3.2 Twilio Voice SDK 2.18 — patterns production
- **Event `tokenWillExpire`** : émis par défaut **10 s avant expiration** (configurable via `tokenRefreshMs`). Callio a mis refresh à 55 min → le token est refreshé en safety, OK, mais on doit aussi écouter `tokenWillExpire` comme filet de sécurité.
- **Conference-first** : Twilio recommande que **tous** les appels passent par une Conference, pas un Dial direct — sinon impossible d'ajouter coaching/monitor/whisper sans rewrite. Vérifier la TwiML générée par `call-webhook` Edge Function.
- **`maxCallSignalingTimeoutMs`** : opt-in feature pour signaling reconnection (récupérer la connection sans perdre l'appel). À activer sur le Device.
- **AsyncAmd** : pour le parallel, indispensable. `asyncAmdStatusCallback` dédié. AMD résultat ~4 s après answer. Tant que parallel pas activé → inutile mais à prévoir pour V2.1.
- **Device lifecycle** : `destroy()` au unmount de la page, `register()` au mount, **une seule instance** dans l'app (pas de Device per component).

### 3.3 Supabase Realtime
- `postgres_changes` = **single-thread** pour garantir l'ordre → bottleneck à scale (> 1000 users simultanés).
- **Broadcast from Database** (feature 2025) : SQL trigger → broadcast channel ciblé → plus scalable.
- **Règle Callio MVP** : postgres_changes OK (< 100 concurrent users). Migration Broadcast prévue pour V2.
- **Filtre obligatoire par `organisation_id`** sur chaque channel sinon fuite cross-org.

### 3.4 Supabase RLS multi-tenant
- Chaque table : `organisation_id` + 4 policies (select SDR / select manager / insert / update / delete).
- Helpers `private.get_my_org()` + `private.get_my_role()` SECURITY DEFINER STABLE.
- **Edge Functions service_role = bypass RLS** → TOUJOURS re-filtrer par `organisation_id` dans le code.
- **Test obligatoire** : user org A ne peut JAMAIS voir données org B (via Postman avec JWT org A).

### 3.5 Permissions 3 niveaux (matrice résumée)
| | Super Admin | Admin | SDR |
|---|---|---|---|
| Import / Export / Delete contacts | OK | OK | NON |
| Créer / Supprimer listes | OK | OK | NON |
| Supprimer contacts | OK | OK | NON |
| Configurer pipeline / statuts / champs | OK | OK | Utiliser |
| Acheter numéros | OK | NON | NON |
| Assigner numéros users | OK | OK | NON |
| Changer rôles | OK | NON | NON |
| Billing | OK | NON | NON |
| Voir tous les appels | OK | OK | Les siens |
| Analytics org | OK | OK | Les siens |

### 3.6 React patterns critiques
- **XState pour temps réel, TanStack Query pour données** — jamais mélanger dans le même composant.
- **useEffect deps primitives** (`orgId`, pas `org`) — sinon refresh 10s d'objet détruit le Device Twilio (bug déjà rencontré).
- **React.memo sur rows de liste** + **TanStack Virtual** si > 500 items.
- **Zero `window.dispatchEvent`** — events via XState.
- **Pas de `setTimeout` dans des flows métier** — signalé "bricolage" par Kevin.

### 3.7 Deepgram Nova-3 — déploiement
- FR supporté depuis 2025.
- **VAD + diarization natifs** — pas besoin de glue WhisperX.
- **Telephony model** dédié bas bitrate 8 kHz.
- **Streaming** < 300 ms latence pour transcription live.
- **Prix** : $0.0077/min batch, $0.46/heure streaming.
- **Redaction PII** incluse (utile pour RGPD post-août 2026).

### 3.8 Pipeline async transcription / analyse
- Edge Function = **max 60 s** → impossible de faire transcription + analyse synchrone.
- Pattern : `recording-callback` → INSERT `analysis_jobs(status: pending)` → pg_cron 10 s poll → worker Edge Function traite 1 job → UPDATE calls + Realtime push vers frontend.
- Retry 3 fois max, `raw_output` stocké pour re-traitement.
- Abstractions `TranscriptionProvider` + `AnalysisProvider` pour swap Deepgram ↔ Gladia / Claude ↔ GPT-4o.

---

## 4. Critères de passage par page (grille d'audit)

Chaque page doit passer **tous** les critères suivants pour être déclarée "GO" :

### Universels (toute page)
- [ ] Console 0 erreur, 0 warning React (hook order, TDZ, key missing, deps array).
- [ ] Build Vite vert (0 warning bloquant).
- [ ] Query Supabase filtrée `organisation_id` (vérifier chaque `.from().select()`).
- [ ] Permissions gated côté UI + RLS côté DB (test croisé).
- [ ] Pas de `setTimeout`, `window.*`, `dispatchEvent` dans la logique métier.
- [ ] Screenshot Playwright prouve le rendu visuel conforme.

### /app/dialer
- [ ] Bouton Call → Device Twilio connect (pas de mock). Timer démarre. Audio présent.
- [ ] Dropdown Call Settings : params modifiables, synchro Settings (bi-directionnelle).
- [ ] Rotation numéros fonctionne si `auto_rotate` ON et ≥ 2 numéros assignés.
- [ ] Voicemail drop 1 clic → son entendu côté prospect (ou mock si pas de vrai appel).
- [ ] Disposition sauvegardée en DB + auto-advance au prospect suivant.
- [ ] Résumé IA généré post-call (via pipeline async — OK si "en cours" affiché).
- [ ] Device survit > 10 min d'inactivité (tokenWillExpire + refresh).
- [ ] Import CSV anti-doublon (normalizePhone E.164).
- [ ] Permissions : SDR ne voit pas import/export/delete liste.
- [ ] Bandeau RDV du jour avec auto-scroll + badge PROCHAIN.
- [ ] Export coaching ZIP fonctionne.
- [ ] Raccourcis clavier Espace/M/N/Esc/1-9 DTMF répondent.

### /app/contacts (CRM Global)
- [ ] Table affiche tous prospects org, colonnes visibles = state localStorage, migration auto si IDs obsolètes.
- [ ] Kanban : drag & drop met à jour `crm_status` en DB + workflow auto (ex : J+7 rappel).
- [ ] Filtres 11 opérateurs fonctionnent (égal, contient, entre, vide, etc.) sur champs système + custom.
- [ ] Vues sauvegardées persistées (localStorage pour MVP, DB en V2).
- [ ] Bulk actions : sélection multiple + action + confirm modal.
- [ ] Stats header cohérentes avec le filtre courant.
- [ ] Toggle Table/Pipeline instantané sans re-fetch.
- [ ] Clic prospect → ProspectModal **interactif** (peut appeler).

### /app/calendar
- [ ] Grille 24h + ligne rouge + auto-scroll vers heure actuelle.
- [ ] GCal + DB prospects + snoozed_until tous affichés sans doublon E.164.
- [ ] Barre RDV à venir en bas avec auto-scroll sur prochain.
- [ ] Clic event → ProspectModal (créé à la volée si pas de fiche).

### /app/settings
- [ ] 16 sections chargent leurs données sans erreur.
- [ ] Modif d'un param → synchro immédiate Dialer (via TanStack Query invalidate).
- [ ] Numéros : CRUD + assignation → `profiles.assigned_phone`.
- [ ] Statuts CRM : CRUD → reflection Kanban + dropdown prospect.
- [ ] Permissions : SDR ne voit que call-settings + phone-fields. Admin pas de Billing. Super Admin tout.

### /app/team
- [ ] Liste membres org charge.
- [ ] Invite → email avec magic link → fonctionne end-to-end.
- [ ] Rôles + assigned_phone affichés + modifiables selon permissions.

### /app/dashboard + /app/history
- [ ] Si placeholder : documenter dans le journal + créer ticket V2.
- [ ] Sinon : stats réelles agrégées sur calls + prospects filtrés org.

---

## 5. Chaos engineering (critères Phase 2)

- [ ] Double-clic "Call" frénétique → 1 seul appel (debounce ou state machine guard).
- [ ] Double-clic "Save View" → 1 seule vue créée.
- [ ] Import CSV malformé (emojis dans noms, numéros courts, lignes vides, BOM UTF-8) → erreurs remontées, pas de crash.
- [ ] 10 min inactivité → Device Twilio toujours registered, bouton Call actif.
- [ ] SDR force URL `/app/settings/billing` → redirect ou 403 (pas de contenu visible).
- [ ] Drag & drop Kanban réseau lent → optimistic update + rollback si erreur API.
- [ ] Ctrl+W pendant appel → `beforeunload` warning + Device destroy propre.
- [ ] Recharge page pendant appel → state restoré (session active ou message "appel terminé").

---

## 6. Connexions bout-en-bout (Phase 3)

- [ ] Settings > Numéros > changer défaut → vérifié dans dropdown Dialer (via useQuery invalidate).
- [ ] Settings > Statuts CRM > créer "Hot Lead" → apparaît dans dropdown ProspectModal + colonne Kanban.
- [ ] ProspectModal > programmer rappel J+3 → apparaît dans Calendar grille.
- [ ] Team > changer rôle user → usePermissions rerender (via refetch profile).
- [ ] Dialer > import CSV 100 lignes → apparaît dans CRM Global + Calendar (si dates RDV).

---

## 7. Protocole d'audit (flow)

Pour chaque page :
1. `browser_navigate` → URL
2. `browser_console_messages` avant toute action (état initial)
3. `browser_snapshot` + screenshot
4. Tester chaque critère de §4 dans l'ordre
5. Pour chaque KO :
   - **Root cause** (pourquoi l'architecture a failli)
   - **Impact UX** (ce que l'utilisateur subit)
   - **Solution propre** (pas de patch)
   - **Fix** + build + commit
   - **Re-screenshot** pour prouver
6. Passer à la page suivante UNIQUEMENT quand la précédente est 100 % verte.

**Zéro page marquée OK sans screenshot + console propre + tous les critères §4 validés.**

---

## 8. Livrable final

Un rapport `AUDIT_RESULTS.md` listant, page par page :
- Critères validés (cochés)
- Bugs trouvés avec sévérité P0-P3
- Commits de fix correspondants
- Screenshots avant/après
- Tests chaos/E2E validés
- Gaps documentés (features absentes, limitations assumées)

**Validation Kevin** avant déclaration "Audit terminé".

---

## Sources externes (références web)

- [Twilio AsyncAmd General Availability](https://www.twilio.com/en-us/changelog/async-answering-machine-detection-now-generally-available)
- [Twilio Voice SDK Best Practices](https://www.twilio.com/docs/voice/sdks/javascript/best-practices)
- [Twilio Voice SDK Changelog](https://www.twilio.com/docs/voice/sdks/javascript/changelog)
- [Twilio Conference Docs](https://www.twilio.com/docs/voice/twiml/conference)
- [Supabase Realtime Benchmarks](https://supabase.com/docs/guides/realtime/benchmarks)
- [Supabase Broadcast from Database](https://supabase.com/blog/realtime-broadcast-from-database)
- [Deepgram Nova-3 French Support](https://deepgram.com/learn/deepgram-expands-nova-3-with-spanish-french-and-portuguese-support)
- [HubSpot CRM Data Model](https://developers.hubspot.com/docs/guides/crm/understanding-the-crm)
- [Attio Filter & Sort Views](https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views)
- [Orum — Power vs Parallel dialing](https://www.orum.com/blog/power-dialing-vs-parallel-dialing)
- [Nooks — Power vs Parallel](https://www.nooks.ai/blog-posts/power-vs-parallel-dialer)
- [Nomination — Prospection B2B 2026](https://www.nomination.fr/blog/prospection-telephonique-b2b-reglementation/)
- [CNIL — Démarchage téléphonique nouvelles règles](https://www.service-public.gouv.fr/particuliers/actualites/A18384)
- [Huhu — ARCEP VoIP mobiles FR](https://num.huhu.fr/fr/a-savoir/regulations/b2b-telemarketing-different-rules)
