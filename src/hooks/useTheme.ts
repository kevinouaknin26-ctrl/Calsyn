import { useState, useEffect } from 'react'

export function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('callio_theme') === 'dark'
  })

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('callio_theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('callio_theme', 'light')
    }
  }, [dark])

  return { dark, toggle: () => setDark(!dark) }
}
