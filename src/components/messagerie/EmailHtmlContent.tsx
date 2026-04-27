/**
 * EmailHtmlContent — rendu HTML email avec :
 *  - Strip des quotes (Gmail/Outlook/Apple/...)
 *  - Contraintes layout (images + tables responsive, no overflow)
 *  - Images cliquables → lightbox plein écran (style Quick Look macOS)
 *  - Clic backdrop ou Esc pour fermer
 */

import { useEffect, useRef, useState } from 'react'
import { stripGmailQuote } from '@/lib/emailQuote'

interface Props {
  html: string
  className?: string
}

export default function EmailHtmlContent({ html, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const cleaned = stripGmailQuote(html)

  // Attache click handlers sur les <img> après render
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const imgs = Array.from(root.querySelectorAll('img'))
    const cleanups: Array<() => void> = []

    for (const img of imgs) {
      // Ignore les petites icônes (genre signature mini-logo)
      const isClickable = img.naturalWidth > 80 || img.width > 80 || (img.complete && img.naturalWidth > 80)
      if (!isClickable) {
        // On vérifiera quand l'image se charge
        const onLoad = () => {
          if (img.naturalWidth > 80) {
            img.style.cursor = 'zoom-in'
            img.title = 'Cliquer pour agrandir'
          }
        }
        img.addEventListener('load', onLoad)
        cleanups.push(() => img.removeEventListener('load', onLoad))
      } else {
        img.style.cursor = 'zoom-in'
        img.title = 'Cliquer pour agrandir'
      }

      const onClick = (e: Event) => {
        e.preventDefault()
        e.stopPropagation()
        const src = img.getAttribute('src') || ''
        if (src) setLightboxSrc(src)
      }
      img.addEventListener('click', onClick)
      cleanups.push(() => img.removeEventListener('click', onClick))
    }

    return () => { for (const fn of cleanups) fn() }
  }, [cleaned])

  // Esc pour fermer la lightbox
  useEffect(() => {
    if (!lightboxSrc) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxSrc(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightboxSrc])

  return (
    <>
      <div
        ref={ref}
        className={`break-words overflow-hidden [&_a]:underline [&_a]:break-all [&_*]:max-w-full [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_img]:transition-opacity [&_img:hover]:opacity-90 [&_table]:!w-full [&_table]:!table-fixed [&_td]:break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_p]:break-words ${className}`}
        dangerouslySetInnerHTML={{ __html: cleaned }}
      />
      {lightboxSrc && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-6 cursor-zoom-out animate-fade-in"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxSrc(null) }}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            title="Fermer (Esc)"
          >
            ✕
          </button>
          <img
            src={lightboxSrc}
            alt="Image agrandie"
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl animate-fade-in-scale"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
