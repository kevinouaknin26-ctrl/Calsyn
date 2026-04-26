/**
 * useInView — IntersectionObserver wrapper.
 *
 * Retourne true dès que l'élément est dans le viewport (ou un threshold).
 * Par défaut : `once: true` → déclenche une seule fois (pour animations d'entrée).
 * Avec `once: false`, repasse à false quand l'élément sort.
 */

import { useEffect, useRef, useState } from 'react'

interface Options {
  threshold?: number  // 0..1
  rootMargin?: string  // ex "0px 0px -50px 0px"
  once?: boolean       // default true
}

export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: Options = {}
): [React.RefObject<T>, boolean] {
  const { threshold = 0.15, rootMargin = '0px 0px -40px 0px', once = true } = options
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)  // SSR / vieux browser : show direct
      return
    }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true)
        if (once) obs.disconnect()
      } else if (!once) {
        setInView(false)
      }
    }, { threshold, rootMargin })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold, rootMargin, once])

  return [ref, inView]
}
