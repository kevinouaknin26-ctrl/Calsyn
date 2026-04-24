# Audit UI/UX Calsyn — Plan d'exécution

**Statut** : préparé, en attente de feu vert (SDR en session d'appels au moment de la prep).

---

## Étape 0 — Déjà fait (local uniquement, rien pushé)

- Branche `fix/recording-proxy-security-hardening` locale avec 2 commits :
  - `d553b83` — fix(recording-proxy): reconstruct Twilio URL from validated SID *(ultrareview bug_007 — fuite creds Twilio)*
  - `71b0c36` — perf(prospect-modal): gate recording signed URL fetch on accordion open *(ultrareview bug_002)*
- Branche `audit/ui-ux-sweep` créée (celle-ci) avec la prep d'audit.

---

## Étape 1 — Décision bloquante avant sweep Playwright

**Le `.env.local` pointe sur la prod Supabase.** Pas de staging détecté.

Il faut choisir :

- **Option A — Compte audit isolé (rapide)**
  Créer un SDR `audit@calsyn.local` dans une organisation `audit-org` dédiée. RLS isole par `organisation_id`, donc les SDR en prod ne voient rien du compte audit et vice-versa. Sweep Playwright se connecte avec ce compte. Écrit dans la prod DB mais dans un silo isolé.
  *Risque : si RLS a une faille, leak visible. Temps : 15 min.*

- **Option B — Staging Supabase dédié (propre)**
  Créer un projet Supabase staging, pull le schéma, setter un 2e `.env.staging`. Sweep Playwright pointe dessus. Zéro impact sur prod.
  *Temps : 1-2 h setup. Recommandé pour l'avenir.*

- **Option C — Sweep read-only strict**
  Playwright navigue en mode lecture uniquement (screenshots + scroll + open modals). **Zéro clic** sur Appeler / Ajouter / Supprimer / Save. Ne capture que les bugs visuels et les erreurs console passives. Rate les bugs d'interaction.
  *Temps : immédiat. Couverture réduite.*

**Recommandation** : A pour ce run (vitesse), B en parallèle pour l'avenir.

---

## Étape 2 — Sweep Playwright (après décision env)

Script : `.audit-ui-ux/sweep.ts` (à écrire une fois l'env tranché).

Périmètre — **top 7 écrans SDR** :

1. `/login` — auth flow
2. `/app/dialer` — cœur métier (table prospects, call bar, tabs)
3. ProspectModal — ouvert depuis Dialer, 4 onglets (Activité, Appels, Notes, Infos)
4. `/app/history` — historique d'appels, lecteur audio, transcript
5. `/app/campaigns` — setup campagnes
6. `/app/settings` — config vocale, from numbers, org
7. `/app/team` — management membres

Par écran, capture :
- Screenshot viewport desktop (1440×900)
- Screenshot viewport mobile (375×812)
- `console.error` + `console.warn`
- Failed network requests (4xx, 5xx)
- Accessibility tree (axe-core)

Sortie : `.audit-ui-ux/reports/sweep-<timestamp>.json` + `screenshots/<screen>-{desktop,mobile}.png`

---

## Étape 3 — Triage findings

Génère `.audit-ui-ux/FINDINGS.md` avec 3 sections :

- **P0 — Bloquant** : crash, feature cassée, flow impossible, erreur 500 récurrente
- **P1 — Cassé visuel** : overflow, z-index, hover glitché, responsive cassé, accessibilité critique
- **P2 — Polish** : espacement, animation, label, copy

Chaque finding : `{id, screen, description, screenshot_ref, priority, estimated_effort}`.

---

## Étape 4 — Fix loop P0

Pour chaque P0 :
1. Reproduire en local
2. Fix minimal
3. Vérifier visuel (dev server)
4. `npm run build` + `tsc --noEmit`
5. Commit atomique : `fix(ui/<zone>): <one-liner>` avec référence au finding id

Vérif build **toutes les 5 commits**. Si build break → `git reset --hard HEAD~1` sur le dernier, retry.

---

## Étape 5 — Fix loop P1

Même pattern que 4. Skippable individuellement si P1 mineur.

---

## Étape 6 — P2 backlogué

Consigné dans `FINDINGS.md` section P2, ouvert comme issues GitHub (pas fixé dans ce pass). Cycle suivant.

---

## Étape 7 — Ultrareview logique UI (1 run gratuit restant sur 3)

Branche `review/ui-logic` = `audit/ui-ux-sweep` + rebase/merge propre. Tu lances `/ultrareview` dessus.

Cible : les fichiers UI les plus complexes (top LoC) — Dialer, ProspectModal, CallContext, History, campaigns. Ultrareview repère la logique React cassée (TDZ, re-render inutiles, état incohérent) que Playwright ne voit pas.

Je traite les findings, 1 commit par fix.

---

## Étape 8 — Merge

PR `audit/ui-ux-sweep` → `main`. Review humaine (toi). Merge. Deploy coordonné :

- Front Vercel : auto-deploy au merge
- Edge functions Supabase : manuel via `supabase functions deploy recording-proxy` (pour le fix bug_007)

---

## Rollback strategy

- **Pendant l'audit** (avant merge) : `git reset --hard HEAD~1` sur les commits locaux
- **Après merge** mais avant deploy : `git revert <sha>` + nouveau merge
- **Après deploy front** : Vercel rollback instantané sur la deployment précédente
- **Après deploy edge function** : `git revert` + redeploy depuis le commit précédent

---

## Ce qu'il te reste à faire (checklist post-session SDR)

- [ ] Dire "go PR security" → je push `fix/recording-proxy-security-hardening` + ouvre PR
- [ ] Review + merge PR security
- [ ] `supabase functions deploy recording-proxy` (fix bug_007 actif en prod)
- [ ] Décision env audit (Option A / B / C ci-dessus)
- [ ] Si A : créer compte `audit@calsyn.local` dans org `audit-org`
- [ ] Dire "go sweep" → je lance Playwright
- [ ] Review FINDINGS.md, valider priorisation
- [ ] Dire "go fix P0" → je commence le fix loop
