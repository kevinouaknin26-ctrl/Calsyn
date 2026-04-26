/**
 * useCountUp — Anime un nombre de 0 à la valeur cible (ease-out).
 * Utilise rAF pour fluidité 60fps.
 */

import { useEffect, useRef, useState } from 'react'

/**
 * useCountUp — Anime un nombre de 0 → target via rAF (ease-out cubic).
 * @param target valeur cible (nombre ou string non animée)
 * @param duration ms
 * @param active false = ne pas démarrer (utile avec useInView)
 */
export function useCountUp(target: number | string, duration = 800, active = true): number | string {
  const [value, setValue] = useState<number | string>(typeof target === 'number' ? 0 : target)
  const fromRef = useRef(0)
  const startRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) {
      setValue(target)
      return
    }
    if (!active) return
    // Si target change après init, redémarre depuis la valeur courante
    const from = startedRef.current && typeof value === 'number' ? value : 0
    startedRef.current = true
    fromRef.current = from
    startRef.current = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const t = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const current = fromRef.current + (target - fromRef.current) * eased
      setValue(Math.round(current))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, active])

  return value
}
