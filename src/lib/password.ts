/**
 * password — Politique de mot de passe Calsyn.
 *
 * Règles V1 :
 *  - 12 caractères min
 *  - 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
 *  - Pas dans la liste des 100 mots de passe les plus courants
 *  - Pas similaire à l'email/nom (containsRefs)
 *
 * Côté Supabase, on configure aussi :
 *  - Auth > Settings > Minimum password length = 12
 *  - Auth > Settings > Password requirements = "Lower, upper, digit, symbol"
 *  - Auth > Settings > Refresh token rotation = enabled
 *  - Auth > Settings > Refresh token reuse interval = 10s
 */

const COMMON_PASSWORDS = new Set([
  'password', '123456', '123456789', 'qwerty', 'azerty', 'motdepasse',
  'admin', 'administrator', 'welcome', 'letmein', 'monkey', 'dragon',
  'master', 'login', 'pass1234', 'abc123', '111111', 'iloveyou',
  'sunshine', 'qwerty123', 'password1', 'password123', '12345678',
  '1234567890', 'football', 'baseball', 'starwars', 'whatever',
  'trustno1', 'changeme', 'calsyn', 'calsyn123', 'murmuse',
])

export interface PasswordCheckResult {
  ok: boolean
  errors: string[]
  /** Score 0..4 (0 = très faible, 4 = très fort) — pour UI strength bar */
  strength: 0 | 1 | 2 | 3 | 4
}

export function validatePassword(pwd: string, refs: string[] = []): PasswordCheckResult {
  const errors: string[] = []

  if (pwd.length < 12) errors.push('12 caractères minimum')
  if (!/[a-z]/.test(pwd)) errors.push('au moins 1 minuscule')
  if (!/[A-Z]/.test(pwd)) errors.push('au moins 1 majuscule')
  if (!/[0-9]/.test(pwd)) errors.push('au moins 1 chiffre')
  if (!/[^A-Za-z0-9]/.test(pwd)) errors.push('au moins 1 caractère spécial')

  const lower = pwd.toLowerCase()
  if (COMMON_PASSWORDS.has(lower)) errors.push('mot de passe trop commun')
  for (const ref of refs) {
    if (ref && ref.length >= 4) {
      const refLower = ref.toLowerCase().split('@')[0]
      if (refLower.length >= 4 && lower.includes(refLower)) {
        errors.push(`ne doit pas contenir "${ref.split('@')[0]}"`)
      }
    }
  }

  // Score : 1 critère validé = +1, max 4
  let score = 0
  if (pwd.length >= 12) score++
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++

  return {
    ok: errors.length === 0,
    errors,
    strength: Math.min(4, score) as 0 | 1 | 2 | 3 | 4,
  }
}

export function strengthLabel(s: number): string {
  return ['Très faible', 'Faible', 'Moyen', 'Fort', 'Très fort'][s] || 'Très faible'
}

export function strengthColor(s: number): string {
  return ['#ef4444', '#f59e0b', '#eab308', '#84cc16', '#10b981'][s] || '#ef4444'
}
