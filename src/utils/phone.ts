/**
 * normalizePhone — Source unique de vérité pour la normalisation téléphone.
 * Convertit tout format FR en E.164 (+33xxx).
 */
export function normalizePhone(p: string | null | undefined): string {
  if (!p) return ''
  let n = p.replace(/[\s.\-()]/g, '')
  if (n.startsWith('0') && n.length === 10) n = '+33' + n.slice(1)
  if (!n.startsWith('+') && n.length === 9) n = '+33' + n
  return n
}
