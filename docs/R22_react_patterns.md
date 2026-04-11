# R22 — React Patterns pour App Temps Réel (dialer VoIP)

## Question de départ
Comment construire une UI React qui gère du temps réel (appels, timers, events push) sans lag ni freeze, même avec des centaines de prospects ?

## Principes fondamentaux

### 1. Séparer le state temps réel du state données
- **State temps réel** (appel en cours, timer, MOS score) → XState machine, isolé
- **State données** (prospects, calls, listes) → TanStack Query, cache serveur
- Ces deux mondes ne se mélangent JAMAIS dans le même composant

### 2. Composition par petits composants spécialisés
- Chaque composant fait UNE chose
- Un composant qui affiche un timer ne sait rien des prospects
- Un composant qui affiche une liste ne sait rien de l'appel
- Assemblage dans les pages (< 300 lignes)

### 3. Virtualisation pour les listes longues
- **TanStack Virtual** : headless, 10-15kb, 60FPS avec 10 000 items
- Ne rend que les éléments visibles dans le viewport
- Scroll fluide même avec des milliers de prospects

### 4. Memoization ciblée
- `React.memo` sur les composants de liste (rows)
- Un row ne re-render que si SES props changent
- Le timer tourne dans son composant isolé → la liste ne bouge pas

### 5. Push updates via Realtime
- Supabase Realtime pousse les changements dans le cache TanStack Query
- Pas de polling, pas de refetch inutile
- Le composant re-render uniquement si SA data change

### 6. Events depuis XState, pas depuis le DOM
- Pas de `window.dispatchEvent` (anti-pattern)
- XState émet des events typés → les hooks React écoutent via `useMachine()`
- Flux de données unidirectionnel : XState → React → UI

## Architecture composant type

```
Page Dialer (orchestration, < 300 lignes)
├── ProspectList (virtualisée, TanStack Query)
│   └── ProspectRow (memo, cliquable)
├── CallPanel (connecté à XState)
│   ├── CallTimer (isolé, re-render chaque seconde)
│   ├── CallControls (mute, hangup, DTMF)
│   └── AudioQuality (MOS score, isolé)
├── DispositionForm (post-call)
├── ProspectDetail (fiche prospect)
│   ├── ContactInfo
│   ├── CallHistory (TanStack Query)
│   └── AIAnalysis (scores, résumé)
└── KeyboardShortcuts (global, react-hotkeys-hook)
```

## Decision
- Composition de petits composants (max 200 lignes chacun)
- XState pour le temps réel, TanStack Query pour les données
- TanStack Virtual pour les listes
- React.memo sur les rows de liste
- Zero window.dispatchEvent, zero global state partagé
- Supabase Realtime → TanStack Query cache (pas de useState local pour les data serveur)
