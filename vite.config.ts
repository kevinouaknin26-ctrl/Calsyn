import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

const commitSha = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' }
})()
const buildTime = new Date().toISOString()

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
  },
  define: {
    __BUILD_SHA__: JSON.stringify(commitSha),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
})
