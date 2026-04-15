# R23 — Design System & Approach CSS

## Marché 2026

### CSS : Tailwind CSS (gagnant incontesté)
- Zero runtime overhead (compile-time)
- Bundle minimal (JIT = seulement les classes utilisées)
- Co-localisation styles + markup (pas de fichier CSS séparé)
- Dark mode natif (`dark:` prefix)
- CSS-in-JS est MORT en 2026 (styled-components -20% en 3 ans)

### Composants : shadcn/ui + Radix UI
- **shadcn/ui** : composants copy-paste, Tailwind-native, zero dépendance runtime
- **Radix UI** : primitives headless accessibles (Dialog, Dropdown, Tooltip)
- shadcn/ui EST construit sur Radix → on a les deux
- ATTENTION : Radix UI n'est plus activement maintenu → surveiller les alternatives (React Aria, Base UI)

### Alternative : 100% custom
- On peut tout coder à la main avec Tailwind (sans librairie composant)
- Avantage : zero dépendance composant
- Inconvénient : réinventer la roue (Dialog, Dropdown, Toast...)

## Inspiration UI

### Minari (reference dialer)
- Dark mode dominant
- Panneaux à 3 colonnes : sidebar / liste / détail
- Transitions fluides entre états d'appel
- Stats en temps réel dans la sidebar

### Aircall (reference mono-line)
- Plus simple, centré sur l'appel en cours
- Timer prominent
- Disposition rapide post-call
- Historique inline dans la fiche contact

### Calsyn V2 — Notre approche
- **Dark mode par défaut** (Kevin préfère, cohérent avec l'esthétique pro/tech)
- **3 colonnes** : Sidebar nav / Liste prospects / Panel appel+détail
- **Font Syne** (moderne, géométrique, parfait pour un SaaS tech)
- **Couleurs** : fond #000, accent bleu #0071e3, vert #30d158, rouge #ff453a

## Keyboard Shortcuts
- **react-hotkeys-hook** (moderne, hook-based, context-aware)
- Raccourcis essentiels :
  - `Espace` : appeler / raccrocher
  - `M` : mute / unmute
  - `N` : prospect suivant
  - `Escape` : fermer le modal
  - `1-9` : DTMF

## Decision
- **Tailwind CSS** pour tout le styling (pas de CSS-in-JS, pas de CSS modules)
- **shadcn/ui** pour les composants de base (Dialog, Dropdown, Toast, Input)
- **Radix UI** en sous-couche (vient avec shadcn)
- **TanStack Virtual** pour les listes longues
- **react-hotkeys-hook** pour les raccourcis clavier
- **Dark mode first**, light mode en option
- **Font** : Syne (Google Fonts)
- **Inspiration** : Minari layout + Aircall simplicité

Sources :
- https://www.untitledui.com/blog/react-component-libraries
- https://makersden.io/blog/react-ui-libs-2025-comparing-shadcn-radix-mantine-mui-chakra
- https://medium.com/@imranmsa93/react-css-in-2026-best-styling-approaches-compared
- https://react-hotkeys-hook.vercel.app/
