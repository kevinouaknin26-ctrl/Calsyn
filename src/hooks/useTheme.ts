import { useState, useEffect } from 'react'

export function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('calsyn_theme') === 'dark'
  })

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('calsyn_theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('calsyn_theme', 'light')
    }
  }, [dark])

  return { dark, toggle: () => setDark(!dark) }
}
