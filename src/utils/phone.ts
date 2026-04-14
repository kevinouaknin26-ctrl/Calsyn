/**
 * normalizePhone — Source unique de vérité pour la normalisation téléphone.
 * Convertit tout format FR en E.164 (+33xxx).
 */
export function normalizePhone(p: string | null | undefined): string {
  if (!p) return ''
  // Retire espaces, points, tirets, parenthèses, plus tout caractère non-chiffre sauf le + en tête
  let n = p.replace(/[\s.\-()]/g, '')
  // Préserve le + initial, retire tout ce qui n'est pas chiffre ensuite
  const hasPlus = n.startsWith('+')
  n = (hasPlus ? '+' : '') + n.replace(/\D/g, '')
  // 00 international → +
  if (n.startsWith('00')) n = '+' + n.slice(2)
  // 0X XX XX XX XX (10 chiffres FR) → +33 X...
  if (n.startsWith('0') && n.length === 10) n = '+33' + n.slice(1)
  // 9 chiffres sans préfixe → +33 (FR sans 0 initial)
  if (!n.startsWith('+') && n.length === 9) n = '+33' + n
  // 11 chiffres commençant par 33 → +33...
  if (!n.startsWith('+') && n.length === 11 && n.startsWith('33')) n = '+' + n
  // Validation E.164 stricte : + suivi de 10-15 chiffres
  if (!/^\+[1-9]\d{9,14}$/.test(n)) return ''
  return n
}
