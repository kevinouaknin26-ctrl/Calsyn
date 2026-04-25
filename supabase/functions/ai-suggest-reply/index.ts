/**
 * ai-suggest-reply — Génère une suggestion de réponse email via Claude.
 *
 * POST { context: string (thread), prospectName?: string, lang?: 'fr' | 'en' }
 *
 * Retourne { suggestion: string } — texte plain à insérer dans le composer.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://calsyn.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function getAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const admin = getAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { context, prospectName, lang } = await req.json()
    if (!context || typeof context !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing context' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const langInstruction = lang === 'en' ? 'in English' : 'in French'
    const system = `You are an assistant helping a sales rep write professional, concise email replies ${langInstruction}. Match the tone and style of the conversation. Don't add subject line, From/To headers, or signature — just the body. Be friendly but professional. Maximum 8 lines. Use the prospect's first name if known.`

    const userMessage = `Thread context (most recent message at the bottom):
---
${context.slice(0, 8000)}
---
${prospectName ? `Prospect name: ${prospectName}` : ''}

Write a reply (body only, ${langInstruction}).`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[ai-suggest-reply] Claude error:', data)
      return new Response(JSON.stringify({ error: data?.error?.message || 'AI failed' }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const suggestion = data.content?.[0]?.text || ''
    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[ai-suggest-reply] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
