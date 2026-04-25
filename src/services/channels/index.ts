/**
 * Registry des canaux de messagerie.
 * Pour activer un nouveau canal : créer le fichier {channel}.ts qui exporte
 * un MessagingChannel, l'importer ici et l'ajouter au registry.
 */

import { smsChannel } from './sms'
import { emailChannel } from './email'
import { whatsappChannel } from './whatsapp'
import type { ChannelId, MessagingChannel } from './types'

export const CHANNELS: Record<ChannelId, MessagingChannel> = {
  sms: smsChannel,
  email: emailChannel,
  whatsapp: whatsappChannel,
  linkedin: {
    id: 'linkedin', label: 'LinkedIn', icon: '💼',
    pillClass: 'bg-sky-50 text-sky-700 border-sky-200', color: '#0a66c2',
    isAvailableForProspect: (p) => !!p,
    formatPreview: (m) => (m.body || '').slice(0, 80),
    send: async () => { throw new Error('LinkedIn intégration à venir') },
  },
  instagram: {
    id: 'instagram', label: 'Instagram', icon: '📷',
    pillClass: 'bg-pink-50 text-pink-700 border-pink-200', color: '#e4405f',
    isAvailableForProspect: () => false,
    formatPreview: (m) => (m.body || '').slice(0, 80),
    send: async () => { throw new Error('Instagram intégration à venir') },
  },
  telegram: {
    id: 'telegram', label: 'Telegram', icon: '✈️',
    pillClass: 'bg-blue-50 text-blue-700 border-blue-200', color: '#26a5e4',
    isAvailableForProspect: () => false,
    formatPreview: (m) => (m.body || '').slice(0, 80),
    send: async () => { throw new Error('Telegram intégration à venir') },
  },
  messenger: {
    id: 'messenger', label: 'Messenger', icon: '💬',
    pillClass: 'bg-indigo-50 text-indigo-700 border-indigo-200', color: '#0084ff',
    isAvailableForProspect: () => false,
    formatPreview: (m) => (m.body || '').slice(0, 80),
    send: async () => { throw new Error('Messenger intégration à venir') },
  },
}

export const ENABLED_CHANNELS: ChannelId[] = ['sms', 'email', 'whatsapp']

export function getChannel(id: ChannelId | string): MessagingChannel {
  return CHANNELS[id as ChannelId] || CHANNELS.sms
}

export type { ChannelId, UnifiedMessage, SendInput, MessagingChannel, Direction } from './types'
