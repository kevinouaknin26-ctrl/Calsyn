/**
 * Reveal — Wrapper qui déclenche une animation d'entrée à l'intersection.
 *
 * Usage :
 *   <Reveal delay={100}><MaSection /></Reveal>
 *   <Reveal direction="left"><Card /></Reveal>
 */

import type { ReactNode, CSSProperties } from 'react'
import { useInView } from '@/hooks/useInView'

type Direction = 'up' | 'down' | 'left' | 'right' | 'scale'

interface Props {
  children: ReactNode
  delay?: number       // ms
  direction?: Direction
  className?: string
  duration?: number    // ms
  threshold?: number
}

const HIDDEN: Record<Direction, CSSProperties> = {
  up:    { opacity: 0, transform: 'translateY(24px)' },
  down:  { opacity: 0, transform: 'translateY(-16px)' },
  left:  { opacity: 0, transform: 'translateX(-24px)' },
  right: { opacity: 0, transform: 'translateX(24px)' },
  scale: { opacity: 0, transform: 'scale(0.94)' },
}

export default function Reveal({
  children,
  delay = 0,
  direction = 'up',
  className = '',
  duration = 600,
  threshold = 0.12,
}: Props) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold, once: true })

  const style: CSSProperties = inView
    ? {
        opacity: 1,
        transform: 'translateY(0) translateX(0) scale(1)',
        transition: `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }
    : { ...HIDDEN[direction], transition: 'none' }

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  )
}
