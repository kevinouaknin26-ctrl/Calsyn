/**
 * useCountUp — Anime un nombre de 0 à la valeur cible (ease-out).
 * Utilise rAF pour fluidité 60fps.
 */

import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number | string, duration = 800): number | string {
  const [value, setValue] = useState<number | string>(typeof target === 'number' ? 0 : target)
  const fromRef = useRef(0)
  const startRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) {
      setValue(target)
      return
    }
    const from = typeof value === 'number' ? value : 0
    fromRef.current = from
    startRef.current = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const t = Math.min(1, elapsed / duration)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      const current = fromRef.current + (target - fromRef.current) * eased
      setValue(Math.round(current))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return value
}
