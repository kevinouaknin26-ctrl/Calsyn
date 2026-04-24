# Audit UI/UX Calsyn — Findings

**Date** : 2026-04-25 00:30
**Environnement** : Preview Vercel `calsyn-2ucj1h5fc-kevins-projects-010aea77.vercel.app` (pointe sur prod Supabase)
**Méthode** : Playwright MCP sur 7 écrans desktop (1440×900) + 3 écrans mobile (375×812)
**Couverture** : Dialer, History, Contacts, Calendar, Dashboard, Team, Settings

---

## P0 — Bloquant (fix obligatoire avant lundi 8h)

### P0-1. Dialer mobile "Choisir une liste" complètement cassé
- **Écran** : `/app/dialer` en mobile (375×812)
- **Screenshot** : `.audit-ui-ux/screenshots/01-dialer-mobile.png`
- **Symptôme** : les 4 colonnes (Listes / Tâches / CSV / Listes intelligentes) s'affichent en grille même en mobile → chevauchement total, textes illisibles, interactions impossibles. Le header "Retour" chevauche "Choisir une liste".
- **Impact** : un SDR qui ouvre Calsyn sur mobile (en déplacement, avant d'arriver au bureau) ne peut **pas choisir de liste d'appels**. Flow principal cassé.
- **Fix** : responsive breakpoint à `md:` sur la grille. En mobile, stacker les 4 sections verticalement avec un tab switcher ou un accordéon.
- **Effort** : ~30 min

---

## P1 — Cassé visuel / fonctionnel (fix recommandé)

### P1-1. Contacts — HTTP 400 sur query `prospect_field_values` avec IN(...) trop long
- **Écran** : `/app/contacts`
- **Console error** : `Failed to load resource: 400 @ .../rest/v1/prospect_field_values?select=...&prospect_id=in.(664 UUIDs...)`
- **Symptôme** : la page Contacts charge 664 contacts d'un coup et tente de fetcher tous les `prospect_field_values` correspondants en UNE requête `IN (uuid1, uuid2, ..., uuid664)`. L'URL complète fait ~30 KB → PostgREST rejette (limite ~8 KB par défaut).
- **Impact** : les custom fields ne chargent pas pour une grande partie des contacts. Affiche des cellules vides / placeholder sur les colonnes custom.
- **Fix** : batcher la query en chunks de ~100 UUIDs via `Promise.all`. Ou migrer vers une RPC Postgres qui fait le JOIN côté serveur.
- **Effort** : ~45 min
- **Fichier probable** : `src/hooks/useProperties.ts` → `useCustomFieldValues`

### P1-2. Contacts mobile — stats header coupé
- **Écran** : `/app/contacts` en mobile
- **Screenshot** : `.audit-ui-ux/screenshots/03-contacts-mobile.png`
- **Symptôme** : la ligne de stats en haut (`Total 664 • Appelés 99 • Connectés 61 • RDV 150`) déborde horizontalement → "Connectés" s'affiche tronqué en "Conn..." et "RDV 150" est hors viewport.
- **Impact** : les SDR ne voient plus les stats en mobile. Pas bloquant mais UX dégradée.
- **Fix** : en mobile, stacker les stats sur 2 lignes ou réduire le label (`Conn. 61`, `RDV 150`).
- **Effort** : ~15 min

---

## P2 — Polish (backlog, fix si temps dispo)

### P2-1. Dashboard vide sous les 4 KPI cards
- **Écran** : `/app/dashboard`
- **Screenshot** : `.audit-ui-ux/screenshots/05-dashboard-desktop.png`
- **Symptôme** : la page affiche uniquement 4 KPI cards (Total appels, Connectés, RDV, Score IA). Sous ces cards, **grande zone blanche vide** sur ~80% de la hauteur de l'écran.
- **Impact** : sensation de "page inachevée". Les SDR et managers s'attendent à voir graphiques trends, funnel, top performers, comparaison périodes.
- **Fix** : ajouter au moins 1-2 graphiques (évolution appels 7j, funnel call→connected→RDV).
- **Effort** : ~2-3 h (hors scope weekend)

### P2-2. Warning Twilio audio device en headless
- **Écran** : tous
- **Console** : `[TwilioVoice][AudioHelper] Warning: Unable to set audio output devices. InvalidArgumentError: Devices not found: default`
- **Impact** : purement cosmétique, warning attendu en environnement sans périphérique audio (headless, serveur de build).
- **Fix** : envelopper `setAudioOutputDevice` dans un try/catch silencieux si `navigator.mediaDevices` indispo.
- **Effort** : ~10 min

---

## Écrans NON audités (hors scope weekend)

- **ProspectModal** (ouvert depuis Dialer en usage réel, nécessite de cliquer sur un prospect)
- **Super Admin** (`/app/super-admin`) — pas testé car Kevin seul dessus
- **Sous-pages Settings** (champs contact, dispositions appel, champs téléphone, mapping, CRM, webhooks, utilisateurs, permissions, facturation, organisation, intégrations)
- **Flow d'appel complet** (Appeler → ringing → connected → disposition → note) — garde-fous ont bloqué toute tentative par sécurité

---

## Résumé chiffré

- **P0** : 1 finding → à fixer dimanche
- **P1** : 2 findings → à fixer dimanche si temps
- **P2** : 2 findings → backlog semaine prochaine
- **Total bugs bloquants/cassés** : 3
