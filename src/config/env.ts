import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(10),
})

const parsed = envSchema.safeParse(import.meta.env)

if (!parsed.success) {
  const errors = parsed.error.flatten().fieldErrors
  console.error('[env] Variables manquantes ou invalides:', errors)
  throw new Error('Variables d\'environnement invalides. Verifier .env.local')
}

export const env = parsed.data
