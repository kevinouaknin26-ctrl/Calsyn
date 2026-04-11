/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
      },
      colors: {
        accent: { DEFAULT: '#0071e3', hover: '#0077ed' },
        surface: { DEFAULT: '#1c1c1e', 2: '#2c2c2e' },
        border: { DEFAULT: 'rgba(255,255,255,0.08)', 2: 'rgba(255,255,255,0.15)' },
        muted: '#86868b',
        success: '#30d158',
        danger: '#ff453a',
        warning: '#ff9f0a',
        info: '#2997ff',
        purple: '#bf5af2',
      },
    },
  },
  plugins: [],
}
