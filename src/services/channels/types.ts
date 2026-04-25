/**
 * Channel registry — abstraction unifiée pour SMS / Email / WhatsApp / LinkedIn / …
 *
 * Chaque canal expose la même interface (`MessagingChannel`) ce qui permet à
 * la page Messagerie + au dock flottant de traiter tous les canaux de la même
 * façon. Ajouter un canal = créer un fichier dans ce dossier + l'enregistrer
 * dans `index.ts`. Aucun changement nécessaire dans l'UI.
 */

export type ChannelId = 'sms' | 'email' | 'whatsapp' | 'linkedin' | 'instagram' | 'telegram' | 'messenger'
export type Direction = 'in' | 'out'

export interface UnifiedMessage {
  id: string
  organisation_id: string
  prospect_id: string | null
  user_id: string | null
  channel: ChannelId
  direction: Direction
  external_id: string | null
  external_thread_id: string | null
  from_address: string | null
  to_address: string | null
  subject: string | null
  body: string | null
  body_html: string | null
  attachments: Array<{ name: string; url: string; size?: number; mime?: string }>
  sent_at: string
  status: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface SendInput {
  prospectId: string
  body: string
  subject?: string  // email uniquement
  attachments?: File[]
  replyTo?: UnifiedMessage  // pour conserver le thread (Gmail in_reply_to, etc.)
  toAddress?: string  // override (ex: choisir email2 du prospect)
}

export interface MessagingChannel {
  id: ChannelId
  label: string
  /** Emoji ou character icon pour les pills */
  icon: string
  /** Tailwind classes pour le pill (bg + text) */
  pillClass: string
  /** Couleur principale du canal (#hex) pour bulles, badges */
  color: string
  /** Le canal est-il dispo pour ce prospect ? (ex: SMS si phone, email si email) */
  isAvailableForProspect: (prospect: { phone?: string | null; email?: string | null }) => boolean
  /** Envoyer un message — délègue à l'edge function appropriée */
  send: (input: SendInput) => Promise<{ external_id?: string; thread_id?: string }>
  /** Preview courte (1 ligne) pour la liste des conversations */
  formatPreview: (msg: UnifiedMessage) => string
}
