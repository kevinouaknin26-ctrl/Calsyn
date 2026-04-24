# Checklist finale — Dimanche 25 avril 23h

Tout ce qu'il reste à faire pour que Calsyn soit 100% opérationnel lundi 8h.

---

## ✅ Fait (samedi 24 avril)

### Audit + fixes UI
- [x] Bande rouge STAGING ajoutée (commit `d8fcde0`)
- [x] Sweep Playwright 7 écrans desktop + 3 mobiles via Playwright MCP
- [x] Rapport findings : `.audit-ui-ux/FINDINGS.md`
- [x] Fix P0 — Dialer mobile (grid stacké) : commit `c1ef0f9`
- [x] Fix P1 — Contacts 400 HTTP (batch IN query) : commit `c1ef0f9`
- [x] Fix P1 — Contacts mobile stats header (flex-wrap) : commit `c1ef0f9`
- [x] Typecheck clean
- [x] 3 fixes verifies sur preview deploy c1ef0f9 (screenshots avant/apres dans `.audit-ui-ux/screenshots/`)

### Security
- [x] Fix bug_007 (fuite creds Twilio) : commit `d553b83`
- [x] Fix bug_002 (perf ProspectModal) : commit `71b0c36`

### Push + PRs créées
- [x] Branche `fix/recording-proxy-security-hardening` pushée → PR #4
- [x] Branche `audit/ui-ux-sweep` pushée → PR #5
- [x] Env var Vercel `VITE_APP_ENV=staging` scopée Preview (prod protégée)

### Clarifications organisation projets
- [x] Vercel : 4 projets (calsyn, pixelshift=Le Majordome, prefab, agent-ia) — inventaire documenté
- [x] Supabase : 5 projets (callio-v2=prod, calsyn-restore=backup DR, murmuse-closing, Callio Project, Prefab)
- [x] `calsyn-restore-20260414` = backup DR du crash cascade DELETE du 15 avril (SEUL backup avant la fenêtre 7j auto) — **ne jamais toucher**
- [x] Mémoire horodatée dans `~/.claude/projects/.../memory/` avec pointeurs vers les projets et leur raison d'être

---

## 🔲 À faire par Kevin (dimanche, ~45 min total)

### 1. Review + merge PR #4 security (critique, ~10 min)
- Ouvrir https://github.com/kevinouaknin26-ctrl/Calsyn/pull/4
- Relire les 2 commits (fix Twilio creds leak + perf ProspectModal)
- Clic **"Merge pull request"** → **"Confirm merge"**
- Vercel redeploy auto sur `main` (~2 min)

### 2. Deploy edge function recording-proxy (critique, ~2 min)
**⚠️ Vercel ne deploy PAS les edge functions Supabase. Il faut le faire manuellement pour que le fix security soit actif en prod.**

Dans ton terminal :
```bash
cd ~/Desktop/callio-v2
git checkout main && git pull
npx supabase functions deploy recording-proxy --project-ref enrpuayypjnpfmdgpfhs
```

Si `supabase` CLI pas installé :
```bash
npx supabase@latest functions deploy recording-proxy --project-ref enrpuayypjnpfmdgpfhs
```
Ça va demander de te login la première fois (browser Supabase).

**Verifier** : après deploy, dashboard Supabase → Edge Functions → `recording-proxy` → vérif que le "updated_at" est récent.

### 3. Review + merge PR #5 audit UI (important, ~15 min)
- Ouvrir https://github.com/kevinouaknin26-ctrl/Calsyn/pull/5
- Relire les commits (bande staging, fixes P0/P1)
- Relire `.audit-ui-ux/FINDINGS.md` pour voir ce qu'on a detecte
- Clic **"Merge pull request"** → **"Confirm merge"**
- Vercel redeploy auto sur `main`

### 4. Validation finale en prod (important, ~10 min)
- Ouvrir https://app.calsyn.app (ou ton domaine custom prod)
- Login avec ton compte super_admin (kevin.ouaknin@hotmail.com)
- Check :
  - [ ] **Pas** de bande rouge STAGING (prod donc VITE_APP_ENV non défini)
  - [ ] Dialer → "Choisir une liste" s'affiche correctement (desktop)
  - [ ] Ouvre Calsyn sur ton téléphone → Dialer → liste stackée verticalement
  - [ ] Contacts → la liste complète charge (664 contacts), custom fields visibles, **0 erreur console** (DevTools > Console)
  - [ ] History → lecture audio d'un call fonctionne (vérifie que le fix recording-proxy n'a rien cassé)
- Si un SDR test un appel réel : note le numéro appelé et le résultat pour debug si besoin

### 5. Re-activer Vercel Authentication sur les previews (optionnel, ~1 min)
Tu avais désactivé "Vercel Authentication" pour que je puisse auditer. Tu peux le réactiver pour que les futures preview URLs soient protégées :
- https://vercel.com/kevins-projects-010aea77/calsyn/settings/deployment-protection
- Toggle **Vercel Authentication** → ON

---

## 📋 Backlog semaine prochaine (non-bloquant lundi)

- [ ] P2 Dashboard vide → ajouter graphiques trends / funnel
- [ ] P2 Warning Twilio audio headless → silence le warning via try/catch
- [ ] Audit des ecrans non-couverts : ProspectModal, Super Admin, sous-pages Settings (champs contact, dispositions, webhooks, etc.)
- [ ] Decision : garder `calsyn-restore-20260414` en Pro ou downgrade pour économiser 10 $/mois
- [ ] Decision : activer PITR (Point-in-Time Recovery) sur `callio-v2` pour ~10 $/mois supplementaire — permet restore à la minute près sans dépendre de `calsyn-restore`
- [ ] Clarifier role des projets `Prefab` Supabase (INACTIVE) et `Callio Project` (INACTIVE) — si plus utilisés, delete
- [ ] Clarifier role des projets Vercel `prefab` et `agent-ia` (sous-elements de Le Majordome) — renommer pour clarifier

---

## 📊 État infrastructure (samedi 24 avril 23h)

### Supabase Pro — ~55 $/mois

| Projet | Rôle | Status | Ne pas toucher |
|---|---|---|---|
| `callio-v2` (`enrpuayypjnpfmdgpfhs`) | Prod Calsyn, SDR dedans | ACTIVE | 🔴 oui |
| `murmuse-closing` (`pgabhkvgeqijohrsmqcz`) | Murmuse job active | ACTIVE | 🔴 oui |
| `calsyn-restore-20260414` (`wjqnrlhfwjeobnoxkpdi`) | Backup DR du crash 15 avril | ACTIVE | 🔴 oui (seul backup avant fenêtre 7j) |
| `Callio Project` (`kgbfpcsqqcbdtqwcofbx`) | Ancien Callio v1 | INACTIVE | 🟡 inutile, a clarifier plus tard |
| `Prefab` (`zoxdrwqlfbteczohwduj`) | Projet mystère | INACTIVE | 🟡 a clarifier plus tard |

### Vercel — 0 € (Hobby)

| Projet | Domain custom | Role |
|---|---|---|
| `calsyn` | calsyn.app, app.calsyn.app | Prod Calsyn |
| `pixelshift` | **lemajordomeai.fr** | Prod Le Majordome |
| `prefab` | aucun (auth) | Previews Le Majordome |
| `agent-ia` | aucun (auth) | Previews Le Majordome |

### Sauvegardes auto

- ✅ `callio-v2` : daily backups 7 jours (inclus plan Pro)
- ✅ `calsyn-restore-20260414` : backup froid du 13 avril 23:35 (snapshot figé)
- ⚠️ PITR non activé (add-on payant à $10/mois)

---

## 🚨 En cas de problème dimanche

1. **PR #4 security casse quelque chose en prod** → `git revert <sha>` sur main + redeploy
2. **Edge function recording-proxy buggée** → redeploy la version précédente : `git checkout <old-sha> -- supabase/functions/recording-proxy && npx supabase functions deploy recording-proxy`
3. **PR #5 audit casse UI en prod** → `git revert <sha>` sur main + redeploy
4. **Calsyn down** → Vercel dashboard → Deployments → rollback sur le deploy précédent (1 clic)
5. **Panique** → `calsyn-restore-20260414` contient l'état du 13 avril, restorable en 1 clic dashboard Supabase

---

**Tu seras prêt. Bonne nuit 🌙.**
