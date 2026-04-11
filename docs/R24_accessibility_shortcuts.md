# R24 — Accessibilité & Raccourcis Clavier

## Pourquoi c'est critique pour un dialer
Un SDR passe 6-8h/jour sur le dialer. Chaque clic économisé = des minutes gagnées.
Les meilleurs dialers (Minari, Orum) ont TOUS des raccourcis clavier.

## Raccourcis prévus

### Pendant l'appel
| Raccourci | Action |
|-----------|--------|
| `Espace` | Raccrocher (si connecté) / Appeler (si idle + prospect sélectionné) |
| `M` | Mute / Unmute |
| `1-9, 0, *, #` | DTMF |
| `Escape` | Fermer le modal / Annuler |

### Navigation
| Raccourci | Action |
|-----------|--------|
| `↑ / ↓` | Naviguer dans la liste prospects |
| `Enter` | Ouvrir la fiche du prospect sélectionné |
| `N` | Prospect suivant (après disposition) |
| `Ctrl+K` | Recherche rapide (prospect par nom/tel) |

### Disposition rapide
| Raccourci | Action |
|-----------|--------|
| `1` | Intéressé |
| `2` | Rappel |
| `3` | Pas intéressé |
| `4` | Messagerie |
| `5` | Pas de réponse |
| `R` | RDV confirmé |

## Implementation
```typescript
import { useHotkeys } from 'react-hotkeys-hook'

// Dans le composant Dialer
useHotkeys('space', () => {
  if (callState === 'idle' && selectedProspect) send({ type: 'CALL', prospect: selectedProspect })
  if (callState === 'connected') send({ type: 'HANG_UP' })
}, { enabled: !isTyping }) // Désactivé quand on tape dans un input

useHotkeys('m', () => {
  if (callState === 'connected') send({ type: isMuted ? 'UNMUTE' : 'MUTE' })
}, { enabled: callState === 'connected' })
```

## Accessibilité de base
- Tous les boutons ont un `aria-label`
- Les modals piègent le focus (via Radix Dialog)
- Les listes sont navigables au clavier
- Les états d'appel sont annoncés via `aria-live`
- Contraste suffisant en dark mode (WCAG AA minimum)

## Decision
- react-hotkeys-hook pour tous les raccourcis
- Raccourcis désactivés quand un input est focus
- Guide raccourcis accessible via `?` (comme Gmail, Notion)
- Accessibilité WCAG AA minimum (Radix gère le gros du travail)
