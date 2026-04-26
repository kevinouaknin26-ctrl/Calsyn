import { supabase } from '@/config/supabase'
import type { MessagingChannel } from './types'

export const emailChannel: MessagingChannel = {
  id: 'email',
  label: 'Email',
  icon: '✉️',
  pillClass: 'bg-violet-50 text-violet-700 border-violet-200',
  color: '#8b5cf6',

  isAvailableForProspect: (p) => !!p.email,

  formatPreview: (m) => {
    const subject = m.subject ? `${m.subject} — ` : ''
    const preview = (m.body || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 80)
    return subject + preview
  },

  send: async ({ prospectId, body, subject, replyTo, toAddress, attachments }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Session expirée')
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

    // Encoder les pièces jointes (format attendu par le backend gmail)
    const encodedAttachments: Array<{ filename: string; mimeType: string; base64: string }> = []
    for (const f of attachments || []) {
      const buf = await f.arrayBuffer()
      // btoa avec spread fail sur gros fichiers (stack overflow). Iter par chunks.
      let binary = ''
      const bytes = new Uint8Array(buf)
      const chunkSize = 0x8000
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
      }
      const b64 = btoa(binary)
      encodedAttachments.push({ filename: f.name, mimeType: f.type || 'application/octet-stream', base64: b64 })
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/gmail?action=send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        prospect_id: prospectId,
        to: toAddress,
        subject: subject || (replyTo?.subject ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, '')}` : ''),
        body,
        thread_id: replyTo?.external_thread_id || undefined,
        in_reply_to: replyTo?.external_id || undefined,
        attachments: encodedAttachments,
      }),
    })
    if (!res.ok) throw new Error(`Email send failed: ${res.status} ${await res.text()}`)
    const data = await res.json() as { messageId?: string; threadId?: string }
    return { external_id: data.messageId, thread_id: data.threadId }
  },
}
