import { supabase } from '@/config/supabase'
import type { MessagingChannel } from './types'

export const smsChannel: MessagingChannel = {
  id: 'sms',
  label: 'SMS',
  icon: '📱',
  pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  color: '#10b981',

  isAvailableForProspect: (p) => !!p.phone,

  formatPreview: (m) => (m.body || '').replace(/\s+/g, ' ').slice(0, 80),

  send: async ({ prospectId, body, toAddress }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Session expirée')
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
    const res = await fetch(`${SUPABASE_URL}/functions/v1/sms-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ prospect_id: prospectId, body, to: toAddress }),
    })
    if (!res.ok) throw new Error(`SMS send failed: ${res.status} ${await res.text()}`)
    const data = await res.json() as { sid?: string }
    return { external_id: data.sid }
  },
}
