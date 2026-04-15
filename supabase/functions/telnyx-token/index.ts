/**
 * telnyx-token — Génère un JWT Telnyx pour le WebRTC client.
 * Auth : JWT Supabase vérifié manuellement.
 *
 * Telnyx Token flow :
 * 1. Créer une Credential (SIP) via API → on-demand ou réutiliser
 * 2. Générer un JWT avec l'API Telnyx Telephony Credentials
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const _jwtAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )
    const _token = (authHeader || '').replace('Bearer ', '')
    const { data: { user }, error: authError } = await _jwtAdmin.auth.getUser(_token)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('TELNYX_API_KEY') || ''
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'TELNYX_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Étape 1 : Chercher ou créer une Telephony Credential
    let credentialId = Deno.env.get('TELNYX_CREDENTIAL_ID') || ''

    if (!credentialId) {
      // Lister les credentials existantes
      const listRes = await fetch('https://api.telnyx.com/v2/telephony_credentials', {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      })
      const listData = await listRes.json()
      const existing = listData.data?.find((c: any) => c.name === 'calsyn-webrtc')

      if (existing) {
        credentialId = existing.id
      } else {
        // Créer une nouvelle credential
        // On a besoin d'un connection_id (SIP Connection)
        // D'abord lister les connections
        const connRes = await fetch('https://api.telnyx.com/v2/credential_connections', {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        })
        const connData = await connRes.json()
        let connectionId = connData.data?.[0]?.id

        if (!connectionId) {
          // Créer une credential connection
          const createConn = await fetch('https://api.telnyx.com/v2/credential_connections', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              connection_name: 'calsyn-webrtc',
              user_name: 'calsyn',
              password: crypto.randomUUID().replace(/-/g, '').slice(0, 20),
            }),
          })
          const createConnData = await createConn.json()
          connectionId = createConnData.data?.id
        }

        if (!connectionId) {
          return new Response(JSON.stringify({ error: 'Cannot create Telnyx connection' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Créer la telephony credential
        const credRes = await fetch('https://api.telnyx.com/v2/telephony_credentials', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'calsyn-webrtc',
            connection_id: connectionId,
          }),
        })
        const credData = await credRes.json()
        credentialId = credData.data?.id

        if (!credentialId) {
          console.error('[telnyx-token] Failed to create credential:', credData)
          return new Response(JSON.stringify({ error: 'Cannot create Telnyx credential' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // Étape 2 : Générer le JWT token
    const tokenRes = await fetch(`https://api.telnyx.com/v2/telephony_credentials/${credentialId}/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    })

    if (!tokenRes.ok) {
      const errData = await tokenRes.json()
      console.error('[telnyx-token] Token generation failed:', errData)
      return new Response(JSON.stringify({ error: 'Token generation failed', details: errData }), {
        status: tokenRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Le token est renvoyé en plain text
    const token = await tokenRes.text()

    return new Response(JSON.stringify({ token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[telnyx-token] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
