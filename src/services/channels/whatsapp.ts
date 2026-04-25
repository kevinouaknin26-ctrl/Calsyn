import { supabase } from '@/config/supabase'
import type { MessagingChannel } from './types'

export const whatsappChannel: MessagingChannel = {
  id: 'whatsapp',
  label: 'WhatsApp',
  icon: '🟢',
  pillClass: 'bg-green-50 text-green-700 border-green-200',
  color: '#25d366',

  isAvailableForProspect: (p) => !!p.phone,

  formatPreview: (m) => (m.body || '').replace(/\s+/g, ' ').slice(0, 80),

  send: async ({ prospectId, body, toAddress }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Session expirée')
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
    const res = await fetch(`${SUPABASE_URL}/functions/v1/wa-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ prospect_id: prospectId, body, to: toAddress }),
    })
    if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`)
    const data = await res.json() as { sid?: string }
    return { external_id: data.sid }
  },
}
